// The add-on runtime: lists packages, validates manifests, spawns one sandboxed
// worker per enabled add-on, feeds them snapshots and filtered events, applies
// their validated UI ops, persists saved variables, and enforces the budgets
// (heartbeat watchdog, error budget, host op budget, boot sentinel).
//
// Composed by Hud like any domain controller (src/ui/hud/CLAUDE.md): it never
// imports Hud, and everything host-reaching arrives in AddonRuntimeDeps. The
// pure decisions live in the *_core modules beside it. Contract:
// docs/design/addon-api.md.

import type { SimEvent } from '../../../sim/types';
import type { IWorld } from '../../../world_api';
import type { FocusManager } from '../../focus_manager';
import type { PainterHostWriters } from '../../painter_host';
import { filterAddonEvents } from './addon_event_filter_core';
import { AddonFramesController } from './addon_frames_controller';
import {
  ADDON_API_VERSION,
  type AddonManifest,
  type AddonPermission,
  apiCompatibility,
  type ManifestError,
  parseAddonManifest,
  resolveLoadOrder,
} from './addon_manifest_core';
import {
  ADDON_BUDGET,
  ADDON_LAYOUT_KEY,
  ADDON_SAFE_ONCE_KEY,
  ADDON_SENTINEL_KEY,
  ADDON_STATE_KEY,
  AddonErrorBudget,
  AddonHeartbeat,
  type AddonPersistedState,
  type AddonStats,
  type AddonStatus,
  type AddonStopReason,
  addonEnabled,
  commAllowed,
  decideSafeMode,
  emptyStats,
  parseAddonState,
  parseSlashLine,
  parseWorkerMessage,
  type SafeModeReason,
  type SavedScope,
  savedVariableKey,
  smooth,
  validateSavedWrite,
} from './addon_runtime_core';
import {
  type AddonSandboxEvent,
  type AddonSandboxHost,
  createIframeSandbox,
} from './addon_sandbox_frame';
import { createAddonSnapshotBuilder, stripSnapshotForPermissions } from './addon_snapshot_core';
import type { AddonPackage, AddonSourceList } from './addon_sources';
import {
  type AddonSecureAction,
  type AddonUiOp,
  type AddonWidgetTree,
  createAddonWidgetTree,
  parseAddonUiOp,
  sanitizeAddonColor,
} from './addon_widget_core';
import { addonWorkerMain } from './addon_worker_prelude';

/** The prelude source, serialized once (self-contained by contract). */
const PRELUDE_SRC = addonWorkerMain.toString();

export interface AddonSecurePort {
  pressActionSlot(slot: number): void;
  targetUnit(unit: string): void;
  toggleWindow(window: string): void;
}

export interface AddonRuntimeDeps {
  world: IWorld;
  writers: PainterHostWriters;
  document: Document;
  window: Window;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** #ui: the add-on layer and the Addons window mount here. */
  uiRoot: HTMLElement;
  uiScale(): number;
  focus: FocusManager;
  /** Print a local chat line (already prefixed). */
  print(text: string, color: string | null): void;
  secure: AddonSecurePort;
  locale(): string;
  /** Whether a chat sender is on the player's ignore list. */
  isIgnored(name: string): boolean;
  /** Package listing (dev glob + desktop IPC); injectable for tests. */
  listPackages(): Promise<AddonSourceList>;
  /** Build default for the master toggle (on in dev, off otherwise). */
  defaultEnabled: boolean;
  /** Dev URL flag `?addons=safe`. */
  urlSafeMode: boolean;
  /** Clock in ms (performance.now in the client). */
  now(): number;
  /** Notifies the Addons window that the list or a status changed. */
  onChange?(): void;
  /** Test seam: an in-process sandbox instead of the iframe. */
  createSandbox?(onEvent: (e: AddonSandboxEvent) => void): AddonSandboxHost;
}

export interface AddonEntry {
  key: string;
  pkg: AddonPackage;
  manifest: AddonManifest | null;
  manifestError: ManifestError | null;
  status: AddonStatus;
  /** Detail for status error/blocked/stopped: a message or a dependency id. */
  detail: string;
  stopReason: AddonStopReason | null;
  perms: Set<AddonPermission>;
  stats: AddonStats;
  errors: AddonErrorBudget;
}

interface Live {
  entry: AddonEntry;
  port: MessagePort;
  tree: AddonWidgetTree;
  heartbeat: AddonHeartbeat;
  queue: AddonUiOp[];
  deferred: AddonUiOp[];
  deferredIds: Set<number>;
  slash: Set<string>;
  msgCount: number;
  hostMs: number;
  printStamps: number[];
  startedAt: number;
}

export class AddonRuntime {
  entries: AddonEntry[] = [];
  safeMode: SafeModeReason = null;
  sources: AddonSourceList | null = null;
  private state: AddonPersistedState;
  private readonly live = new Map<string, Live>();
  /** Stored saved-variable sizes seen this session, for the shared budget. */
  private readonly savedSizes = new Map<string, number>();
  private readonly frames: AddonFramesController;
  private readonly layer: HTMLElement;
  private sandbox: AddonSandboxHost | null = null;
  private pendingSpawns: AddonEntry[] = [];
  private readonly snapshots = createAddonSnapshotBuilder();
  private readonly t0: number;
  private sentinelArmedAt: number | null = null;
  private lastStatsAt = 0;
  private wasInCombat = false;
  private started = false;
  private generation = 0;

  constructor(private readonly deps: AddonRuntimeDeps) {
    this.t0 = deps.now();
    this.state = parseAddonState(this.safeGet(ADDON_STATE_KEY));
    this.layer = deps.document.createElement('div');
    this.layer.id = 'addon-layer';
    deps.uiRoot.appendChild(this.layer);
    this.frames = new AddonFramesController(this.layer, {
      writers: deps.writers,
      document: deps.document,
      uiScale: deps.uiScale,
      onClick: (key, id, button, secure) => this.onWidgetClick(key, id, button, secure),
      onMoved: (key, rec) =>
        this.onWidgetMoved(key, rec.id, rec.props.name, rec.props.x, rec.props.y),
    });
    deps.window.addEventListener('pagehide', () => this.onPageHide());
  }

  // ---- public surface ------------------------------------------------------

  get masterEnabled(): boolean {
    return this.state.enabled ?? this.deps.defaultEnabled;
  }

  get loadOutdated(): boolean {
    return this.state.loadOutdated === true;
  }

  /** First start: decide safe mode, list packages, spawn what is enabled. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const safeOnce = this.safeGet(ADDON_SAFE_ONCE_KEY);
    if (safeOnce) this.safeRemove(ADDON_SAFE_ONCE_KEY);
    this.sources = await this.deps.listPackages();
    this.safeMode = decideSafeMode({
      sentinel: this.safeGet(ADDON_SENTINEL_KEY),
      safeOnce,
      urlFlag: this.deps.urlSafeMode,
      shellFlag: this.sources.shellSafeMode,
    });
    // A crash sentinel is consumed by the decision; the next clean start re-arms it.
    this.safeRemove(ADDON_SENTINEL_KEY);
    this.rebuildEntries();
    if (!this.safeMode && this.masterEnabled) this.spawnEnabled();
    this.changed();
  }

  /** Stop everything and start again from a fresh listing (Reload UI). */
  async reload(): Promise<void> {
    this.shutdown(false);
    this.sources = await this.deps.listPackages();
    this.rebuildEntries();
    if (!this.safeMode && this.masterEnabled) this.spawnEnabled();
    this.changed();
  }

  setMasterEnabled(on: boolean): void {
    this.state.enabled = on;
    this.persistState();
    this.changed();
  }

  setLoadOutdated(on: boolean): void {
    this.state.loadOutdated = on;
    this.persistState();
    this.changed();
  }

  setAddonEnabled(id: string, on: boolean): void {
    const rec = this.state.addons[id] ?? {};
    rec.enabled = on;
    if (on) delete rec.autoDisabled;
    this.state.addons[id] = rec;
    this.persistState();
    this.changed();
  }

  isAddonEnabled(id: string): boolean {
    return addonEnabled(this.state, id);
  }

  leaveSafeMode(): void {
    this.safeMode = null;
    void this.reload();
  }

  restartInSafeMode(): void {
    this.safeSet(ADDON_SAFE_ONCE_KEY, '1');
    this.shutdown(true);
    this.deps.window.location.reload();
  }

  resetSaved(id: string): void {
    const ch = this.character();
    this.safeRemove(savedVariableKey(id, 'account', ch));
    this.safeRemove(savedVariableKey(id, 'character', ch));
  }

  settingsFor(entry: AddonEntry): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (!entry.manifest) return out;
    let stored: Record<string, unknown> = {};
    try {
      const raw = this.safeGet(`woc_addon_settings_v1:${entry.manifest.id}`);
      stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      stored = {};
    }
    for (const s of entry.manifest.settings) {
      const v = stored[s.key];
      if (s.type === 'toggle') out[s.key] = typeof v === 'boolean' ? v : s.default;
      else if (s.type === 'slider')
        out[s.key] = typeof v === 'number' && v >= s.min && v <= s.max ? v : s.default;
      else
        out[s.key] = typeof v === 'string' && s.options.some((o) => o.value === v) ? v : s.default;
    }
    return out;
  }

  setSetting(entry: AddonEntry, key: string, value: unknown): void {
    if (!entry.manifest?.settings.some((s) => s.key === key)) return;
    const next = { ...this.settingsFor(entry), [key]: value };
    this.safeSet(`woc_addon_settings_v1:${entry.manifest.id}`, JSON.stringify(next));
    const live = this.live.get(entry.key);
    live?.port.postMessage({ t: 'setting', key, value: this.settingsFor(entry)[key] });
  }

  /** Feed one frame's event batch (Hud.handleEvents). Cheap when idle. */
  onEvents(events: readonly SimEvent[]): void {
    if (this.live.size === 0 || events.length === 0) return;
    let wantChat = false;
    for (const l of this.live.values()) if (l.entry.perms.has('chat')) wantChat = true;
    const batch = filterAddonEvents(events, this.deps.world, this.time(), wantChat);
    if (batch.chat.length > 0) {
      batch.chat = batch.chat.filter((c) => !this.deps.isIgnored(c.from));
    }
    if (batch.combat.length === 0 && batch.chat.length === 0) return;
    for (const l of this.live.values()) {
      if (l.entry.status !== 'running') continue;
      const combat = l.entry.perms.has('combatLog') ? batch.combat : [];
      const chat = l.entry.perms.has('chat') ? batch.chat : [];
      if (combat.length === 0 && chat.length === 0) continue;
      l.port.postMessage({ t: 'ev', combat, chat });
    }
  }

  /** The HUD fast band (about 10 Hz): snapshot, watchdog, drains, stats. */
  tick(): void {
    if (this.live.size === 0) return;
    const now = this.deps.now();
    const world = this.deps.world;
    const inCombat = !!world.player.inCombat;
    if (this.wasInCombat && !inCombat) this.releaseDeferred();
    this.wasInCombat = inCombat;
    const union = new Set<AddonPermission>();
    for (const l of this.live.values()) for (const p of l.entry.perms) union.add(p);
    const snap = this.snapshots.build(world, this.time(), union);
    for (const [key, l] of this.live) {
      if (l.heartbeat.hung(now)) {
        this.stop(key, 'hang', '');
        continue;
      }
      if (l.heartbeat.shouldPing(now)) l.port.postMessage({ t: 'ping' });
      if (l.entry.status === 'running') {
        l.port.postMessage({ t: 'snap', snap: stripSnapshotForPermissions(snap, l.entry.perms) });
      }
      this.drain(key, l);
    }
    if (this.sentinelArmedAt !== null && now - this.sentinelArmedAt > ADDON_BUDGET.stableAfterMs) {
      this.sentinelArmedAt = null;
      this.safeRemove(ADDON_SENTINEL_KEY);
    }
    if (now - this.lastStatsAt >= 1000) {
      const secs = this.lastStatsAt === 0 ? 1 : (now - this.lastStatsAt) / 1000;
      this.lastStatsAt = now;
      for (const [key, l] of this.live) {
        const st = l.entry.stats;
        st.msgsPerSec = smooth(st.msgsPerSec, l.msgCount / secs);
        st.hostMsPerSec = smooth(st.hostMsPerSec, l.hostMs / secs);
        st.widgets = this.frames.widgetCount(key);
        st.errors = l.entry.errors.total;
        l.msgCount = 0;
        l.hostMs = 0;
      }
      this.changed();
    }
  }

  /** A typed chat line; true when an add-on (or the runtime) consumed it. */
  handleSlash(raw: string): boolean {
    const parsed = parseSlashLine(raw);
    if (!parsed) return false;
    if (parsed.name === 'reloadui' || parsed.name === 'rl') {
      void this.reload();
      return true;
    }
    for (const l of this.live.values()) {
      if (l.slash.has(parsed.name)) {
        l.port.postMessage({ t: 'slash', name: parsed.name, args: parsed.args });
        return true;
      }
    }
    return false;
  }

  /** Test + diagnostics hook: live keys. */
  liveKeys(): string[] {
    return [...this.live.keys()];
  }

  // ---- entries and spawning -----------------------------------------------

  private rebuildEntries(): void {
    const pkgs = this.sources?.packages ?? [];
    const entries: AddonEntry[] = [];
    const seen = new Set<string>();
    for (const pkg of pkgs) {
      const parsed = parseAddonManifest(pkg.manifestText);
      const manifest = parsed.ok ? parsed.manifest : null;
      const key = manifest ? manifest.id : `${pkg.origin}:${pkg.folder}`;
      const entry: AddonEntry = {
        key,
        pkg,
        manifest,
        manifestError: parsed.ok ? null : parsed.error,
        status: parsed.ok ? 'disabled' : 'invalid',
        detail: '',
        stopReason: null,
        perms: new Set(manifest?.permissions ?? []),
        stats: emptyStats(),
        errors: new AddonErrorBudget(),
      };
      // The first copy of an id wins (dev, then local, then Workshop); later
      // copies are listed as duplicates so the player can see the conflict.
      if (manifest && seen.has(manifest.id)) {
        entry.key = `${pkg.origin}:${pkg.folder}`;
        entry.status = 'blocked';
        entry.detail = `dup:${manifest.id}`;
      } else if (manifest) {
        seen.add(manifest.id);
        if (pkg.pending) {
          entry.status = 'blocked';
          entry.detail = 'pending';
        } else {
          const compat = apiCompatibility(manifest.apiVersion);
          if (compat === 'tooNew') entry.status = 'tooNew';
          else if (compat === 'outdated' && !this.loadOutdated) entry.status = 'outdated';
          const missing = manifest.files.find((f) => typeof pkg.files[f] !== 'string');
          if (missing && entry.status === 'disabled') {
            entry.status = 'invalid';
            entry.manifestError = { code: 'field', field: 'files' };
          }
          const auto = this.state.addons[manifest.id]?.autoDisabled;
          if (auto) entry.stopReason = auto;
        }
      }
      entries.push(entry);
    }
    this.entries = entries;
  }

  private spawnEnabled(): void {
    const candidates = this.entries.filter(
      (e) => e.manifest && e.status === 'disabled' && this.isAddonEnabled(e.manifest.id),
    );
    const { order, issues } = resolveLoadOrder(candidates.map((e) => e.manifest as AddonManifest));
    for (const issue of issues) {
      const e = this.entries.find((x) => x.key === issue.id);
      if (e) {
        e.status = 'blocked';
        e.detail = `dep:${issue.detail}`;
      }
    }
    if (order.length === 0) return;
    this.safeSet(ADDON_SENTINEL_KEY, '1');
    this.sentinelArmedAt = this.deps.now();
    for (const id of order) {
      const e = this.entries.find((x) => x.key === id);
      if (!e) continue;
      e.status = 'loading';
      this.pendingSpawns.push(e);
    }
    this.flushSpawns();
  }

  private flushSpawns(): void {
    this.sandbox ??= this.deps.createSandbox
      ? this.deps.createSandbox((ev) => this.onSandboxEvent(ev))
      : createIframeSandbox(this.deps.document, this.deps.window, (ev) => this.onSandboxEvent(ev));
    const sandbox = this.sandbox;
    for (const e of this.pendingSpawns.splice(0)) {
      const m = e.manifest;
      if (!m) continue;
      const ch = this.character();
      const accountKey = savedVariableKey(m.id, 'account', ch);
      const charKey = savedVariableKey(m.id, 'character', ch);
      const savedAccount = m.savedVariables.account ? this.safeGet(accountKey) : null;
      const savedChar = m.savedVariables.character ? this.safeGet(charKey) : null;
      const channel = new MessageChannel();
      const now = this.deps.now();
      const live: Live = {
        entry: e,
        port: channel.port1,
        tree: createAddonWidgetTree({ secureAllowed: e.perms.has('secureActions') }),
        heartbeat: new AddonHeartbeat(now),
        queue: [],
        deferred: [],
        deferredIds: new Set(),
        slash: new Set(),
        msgCount: 0,
        hostMs: 0,
        printStamps: [],
        startedAt: now,
      };
      e.stats.savedBytes = (savedAccount?.length ?? 0) + (savedChar?.length ?? 0);
      if (savedAccount !== null) this.savedSizes.set(accountKey, savedAccount.length);
      if (savedChar !== null) this.savedSizes.set(charKey, savedChar.length);
      this.live.set(e.key, live);
      const gen = this.generation;
      channel.port1.onmessage = (ev) => {
        if (gen !== this.generation) return;
        this.onWorkerMessage(e.key, ev.data);
      };
      this.frames.root(e.key);
      sandbox.spawn(
        e.key,
        {
          prelude: PRELUDE_SRC,
          init: {
            runtimeApiVersion: ADDON_API_VERSION,
            addon: {
              id: m.id,
              name: m.name,
              version: m.version,
              apiVersion: m.apiVersion,
              permissions: m.permissions,
              savedVariables: m.savedVariables,
              slashCommands: m.slashCommands,
            },
            saved: { account: savedAccount, character: savedChar },
            settings: this.settingsFor(e),
            locale: this.deps.locale(),
            firstRun: savedAccount === null && savedChar === null,
          },
          files: m.files.map((f) => e.pkg.files[f]),
        },
        channel.port2,
      );
    }
  }

  private onSandboxEvent(e: AddonSandboxEvent): void {
    const l = this.live.get(e.key);
    if (!l) return;
    // Before `ready`, any worker error means the add-on script never finished
    // loading (a syntax error fails the whole worker script): a load error.
    if (e.kind === 'spawnError' || l.entry.status !== 'running')
      this.stop(e.key, 'load', e.message);
    else this.countError(e.key, e.message);
  }

  // ---- worker messages ------------------------------------------------------

  private onWorkerMessage(key: string, raw: unknown): void {
    const l = this.live.get(key);
    if (!l) return;
    l.msgCount++;
    const msg = parseWorkerMessage(raw);
    if (!msg) {
      this.countError(key, 'malformed message');
      return;
    }
    const now = this.deps.now();
    switch (msg.t) {
      case 'pong':
        l.heartbeat.pong(now);
        break;
      case 'stats':
        l.entry.stats.cpuMsPerSec = smooth(l.entry.stats.cpuMsPerSec, msg.cpuMs);
        break;
      case 'ready':
        l.entry.status = 'running';
        this.changed();
        break;
      case 'loadError':
        this.stop(key, 'load', msg.message);
        break;
      case 'err':
        this.countError(key, `${msg.where}: ${msg.message}`);
        break;
      case 'ui': {
        if (msg.ops.length > 500 || l.queue.length + msg.ops.length > 4000) {
          this.stop(key, 'flood', '');
          return;
        }
        for (const rawOp of msg.ops) {
          const parsed = parseAddonUiOp(rawOp, {
            secureAllowed: l.entry.perms.has('secureActions'),
          });
          if (!parsed.ok) {
            this.countError(key, `ui: ${parsed.reason}${parsed.key ? ` (${parsed.key})` : ''}`);
            continue;
          }
          l.queue.push(parsed.op);
        }
        this.drain(key, l);
        break;
      }
      case 'sv': {
        const m = l.entry.manifest;
        if (!m || !m.savedVariables[msg.scope]) {
          this.countError(key, 'saved: undeclared scope');
          break;
        }
        const json = validateSavedWrite(msg.json);
        if (json === null) {
          this.countError(key, 'saved: too large or not an object');
          break;
        }
        const storeKey = savedVariableKey(m.id, msg.scope as SavedScope, this.character());
        const prev = this.savedSizes.get(storeKey) ?? 0;
        let total = 0;
        for (const n of this.savedSizes.values()) total += n;
        if (total - prev + json.length > ADDON_BUDGET.savedBytesTotal) {
          this.countError(key, 'saved: the shared add-on storage budget is full');
          break;
        }
        this.savedSizes.set(storeKey, json.length);
        this.safeSet(storeKey, json);
        break;
      }
      case 'slash': {
        const m = l.entry.manifest;
        if (m?.slashCommands.includes(msg.name)) l.slash.add(msg.name);
        else this.countError(key, `slash: /${msg.name} not declared`);
        break;
      }
      case 'print': {
        const cutoff = now - 1000;
        l.printStamps = l.printStamps.filter((s) => s > cutoff);
        if (l.printStamps.length >= ADDON_BUDGET.printsPerSecond) break;
        l.printStamps.push(now);
        const name = l.entry.manifest?.name ?? key;
        this.deps.print(`[${name}] ${msg.text}`, sanitizeAddonColor(msg.color));
        break;
      }
      case 'comm': {
        const target = this.live.get(msg.to);
        const fromM = l.entry.manifest;
        const toM = target?.entry.manifest;
        if (!target || !fromM || !toM || !commAllowed(fromM, toM)) {
          this.countError(key, `comm: ${msg.to} not reachable`);
          break;
        }
        target.port.postMessage({ t: 'comm', from: fromM.id, json: msg.json });
        break;
      }
    }
  }

  private drain(key: string, l: Live): void {
    if (l.queue.length === 0) return;
    const start = this.deps.now();
    const inCombat = !!this.deps.world.player.inCombat;
    while (l.queue.length > 0) {
      if (this.deps.now() - start > ADDON_BUDGET.hostMsPerFrame) break;
      const op = l.queue.shift() as AddonUiOp;
      // A child created under a deferred widget waits with it, so the
      // subtree lands whole (in order) when combat ends.
      const parentDeferred = op.op === 'c' && op.parent !== null && l.deferredIds.has(op.parent);
      if (inCombat && (parentDeferred || l.deferredIds.has(op.id) || l.tree.lockedInCombat(op))) {
        l.deferred.push(op);
        l.deferredIds.add(op.id);
        continue;
      }
      this.applyOp(key, l, op);
    }
    l.hostMs += this.deps.now() - start;
  }

  private applyOp(key: string, l: Live, op: AddonUiOp): void {
    if (op.op === 'c') {
      const saved = op.props.movable && op.props.name ? this.layoutFor(key, op.props.name) : null;
      if (saved) {
        op.props.x = saved.x;
        op.props.y = saved.y;
      }
    }
    const res = l.tree.apply(op);
    if (!res.ok) {
      this.countError(key, `ui: ${res.reason}${res.key ? ` (${res.key})` : ''}`);
      return;
    }
    if (op.op === 'c' && res.rec) this.frames.create(key, res.rec);
    else if (op.op === 's' && res.rec) this.frames.update(key, res.rec);
    else if (op.op === 'd') this.frames.remove(key, res.removed);
  }

  private releaseDeferred(): void {
    for (const [key, l] of this.live) {
      if (l.deferred.length === 0) continue;
      l.queue.unshift(...l.deferred.splice(0));
      l.deferredIds.clear();
      this.drain(key, l);
    }
  }

  // ---- clicks, drag ----------------------------------------------------------

  private onWidgetClick(
    key: string,
    id: number,
    button: number,
    secure: AddonSecureAction | null,
  ): void {
    const l = this.live.get(key);
    if (!l || l.entry.status !== 'running') return;
    // The secure action is the DECLARED prop, run here inside the trusted click
    // handler: one input, one allowlisted action, the add-on not consulted.
    if (secure && l.entry.perms.has('secureActions')) {
      if (secure.type === 'actionSlot') this.deps.secure.pressActionSlot(secure.slot);
      else if (secure.type === 'targetUnit') this.deps.secure.targetUnit(secure.unit);
      else this.deps.secure.toggleWindow(secure.window);
    }
    l.port.postMessage({ t: 'click', id, button });
  }

  private onWidgetMoved(
    key: string,
    id: number,
    name: string | undefined,
    x: number | undefined,
    y: number | undefined,
  ): void {
    const l = this.live.get(key);
    if (!l) return;
    if (name) {
      const all = this.readLayout();
      all[key] = { ...(all[key] ?? {}), [name]: { x: x ?? 0, y: y ?? 0 } };
      this.safeSet(ADDON_LAYOUT_KEY, JSON.stringify(all));
    }
    l.port.postMessage({ t: 'moved', id, x: x ?? 0, y: y ?? 0 });
  }

  private readLayout(): Record<string, Record<string, { x: number; y: number }>> {
    try {
      const raw = this.safeGet(ADDON_LAYOUT_KEY);
      const v = raw ? JSON.parse(raw) : {};
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  }

  private layoutFor(key: string, name: string): { x: number; y: number } | null {
    const pos = this.readLayout()[key]?.[name];
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
    return { x: Math.round(pos.x), y: Math.round(pos.y) };
  }

  // ---- errors and stopping ------------------------------------------------------

  private countError(key: string, message: string): void {
    const l = this.live.get(key);
    if (!l) return;
    if (l.entry.errors.record(message, this.deps.now())) this.stop(key, 'errors', message);
    else this.changed();
  }

  /** Terminate one add-on, tear down its frames, persist an auto-disable. */
  stop(key: string, reason: AddonStopReason | null, detail: string): void {
    const l = this.live.get(key);
    if (!l) return;
    this.live.delete(key);
    try {
      l.port.close();
    } catch {
      /* already closed */
    }
    this.sandbox?.kill(key);
    this.frames.removeAddon(key);
    const e = l.entry;
    if (reason) {
      e.status = reason === 'load' ? 'error' : 'stopped';
      e.stopReason = reason;
      e.detail = detail.slice(0, 300);
      if (reason === 'load') e.errors.record(detail, this.deps.now());
      const id = e.manifest?.id;
      if (id && reason !== 'load') {
        this.state.addons[id] = { ...(this.state.addons[id] ?? {}), autoDisabled: reason };
        this.persistState();
      }
    } else {
      e.status = 'disabled';
    }
    if (this.live.size === 0) this.sentinelArmedAt = null;
    this.changed();
  }

  /** A normal page exit: tell add-ons (their LOGOUT flush is best effort, the
   *  periodic 10 s flush is the durable path) and clear the crash sentinel. */
  private onPageHide(): void {
    for (const l of this.live.values()) l.port.postMessage({ t: 'logout' });
    this.safeRemove(ADDON_SENTINEL_KEY);
  }

  /** Stop every add-on. `clean` = a normal exit: the sentinel is cleared and
   *  add-ons get LOGOUT first so their last saved-variable flush can land. */
  private shutdown(clean: boolean): void {
    if (clean) {
      for (const l of this.live.values()) l.port.postMessage({ t: 'logout' });
      this.safeRemove(ADDON_SENTINEL_KEY);
    }
    this.generation++;
    for (const key of [...this.live.keys()]) this.stop(key, null, '');
    this.pendingSpawns = [];
    this.sandbox?.dispose();
    this.sandbox = null;
    this.sentinelArmedAt = null;
  }

  // ---- helpers ------------------------------------------------------------

  private time(): number {
    return Math.round(this.deps.now() - this.t0) / 1000;
  }

  private character(): { realm: string; name: string } {
    const w = this.deps.world;
    return { realm: w.realm || 'offline', name: w.player.name };
  }

  private changed(): void {
    this.deps.onChange?.();
  }

  private persistState(): void {
    this.safeSet(ADDON_STATE_KEY, JSON.stringify(this.state));
  }

  private safeGet(k: string): string | null {
    try {
      return this.deps.storage.getItem(k);
    } catch {
      return null;
    }
  }

  private safeSet(k: string, v: string): void {
    try {
      this.deps.storage.setItem(k, v);
    } catch {
      /* storage full or unavailable: saved data is best effort */
    }
  }

  private safeRemove(k: string): void {
    try {
      this.deps.storage.removeItem(k);
    } catch {
      /* unavailable */
    }
  }
}
