// The declarative add-on UI layer: op validation, prop sanitizing, the per
// add-on widget tree, the caps, and combat lockdown for secure buttons. Pure:
// the DOM half is addon_frames_controller.ts, which only ever receives props
// this module produced. Contract: docs/design/addon-api.md sections 5.6 and 6.
//
// Security notes: there is no free-form CSS, no HTML, no URL and no image prop,
// so an add-on cannot exfiltrate through a style fetch or spoof game chrome
// with game classes; colors are a strict hex grammar or a named game token.

import { CLASSES } from '../../../sim/data';

export const ADDON_WIDGET_TYPES = ['frame', 'text', 'bar', 'button'] as const;
export type AddonWidgetType = (typeof ADDON_WIDGET_TYPES)[number];

export const ADDON_POINTS = [
  'TOPLEFT',
  'TOP',
  'TOPRIGHT',
  'LEFT',
  'CENTER',
  'RIGHT',
  'BOTTOMLEFT',
  'BOTTOM',
  'BOTTOMRIGHT',
] as const;
export type AddonPoint = (typeof ADDON_POINTS)[number];

/** The secure-action allowlist: one trusted click runs exactly one of these. */
export const ADDON_SECURE_ACTIONS = ['actionSlot', 'targetUnit', 'toggleWindow'] as const;
export const ADDON_SECURE_WINDOWS = [
  'bags',
  'map',
  'character',
  'spellbook',
  'talents',
  'questlog',
] as const;
export const ADDON_SECURE_UNITS = [
  'player',
  'pet',
  'party1',
  'party2',
  'party3',
  'party4',
] as const;
export const ADDON_ACTION_SLOT_MAX = 47;

export type AddonSecureAction =
  | { type: 'actionSlot'; slot: number }
  | { type: 'targetUnit'; unit: (typeof ADDON_SECURE_UNITS)[number] }
  | { type: 'toggleWindow'; window: (typeof ADDON_SECURE_WINDOWS)[number] };

export const ADDON_UI_LIMITS = {
  maxWidgets: 400,
  maxTextChars: 2000,
  maxButtonChars: 64,
  maxOpsPerMessage: 500,
  maxQueuedOps: 4000,
  maxCoord: 4000,
  maxNameChars: 48,
} as const;

/** Normalized, render-ready props. Every value here is safe to hand the DOM. */
export interface AddonWidgetProps {
  name?: string;
  point?: AddonPoint;
  relativePoint?: AddonPoint;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  shown?: boolean;
  alpha?: number;
  layer?: 'low' | 'medium' | 'high';
  clickable?: boolean;
  movable?: boolean;
  backdropColor?: string | null;
  borderColor?: string | null;
  text?: string;
  size?: number;
  color?: string | null;
  align?: 'left' | 'center' | 'right';
  wrap?: boolean;
  bold?: boolean;
  value?: number;
  min?: number;
  max?: number;
  bgColor?: string | null;
  vertical?: boolean;
  secure?: AddonSecureAction | null;
}

export interface AddonWidgetRec {
  id: number;
  type: AddonWidgetType;
  parent: number | null;
  children: Set<number>;
  props: AddonWidgetProps;
  /** Count of secure buttons in this widget's subtree, itself included. */
  secureCount: number;
}

export type AddonUiOp =
  | { op: 'c'; id: number; type: AddonWidgetType; parent: number | null; props: AddonWidgetProps }
  | { op: 's'; id: number; props: AddonWidgetProps }
  | { op: 'd'; id: number };

export type OpRejection =
  | 'shape'
  | 'type'
  | 'duplicate'
  | 'missing'
  | 'parent'
  | 'cap'
  | 'prop'
  | 'permission';

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const NAME_RE = /^[A-Za-z0-9_-]{1,48}$/;
const NAMED_TOKENS: Record<string, string> = {
  accent: 'var(--color-accent)',
  text: 'var(--color-text-light)',
  muted: 'var(--color-text-muted)',
  good: 'var(--color-text-success)',
  bad: 'var(--color-danger)',
  warn: 'var(--color-warning)',
  info: 'var(--color-info)',
  buff: 'var(--color-buff)',
  debuff: 'var(--color-debuff)',
  dark: 'var(--color-bg-dark)',
  'school:fire': 'var(--color-debuff-fire)',
  'school:frost': 'var(--color-debuff-frost)',
  'school:arcane': 'var(--color-debuff-arcane)',
  'school:shadow': 'var(--color-debuff-shadow)',
  'school:holy': 'var(--color-debuff-holy)',
  'school:nature': 'var(--color-debuff-nature)',
};

/** A strict color: `#rgb`, `#rrggbb`, `#rrggbbaa`, a named game token, or a
 *  `class:<id>` class color. Anything else is null (the prop is rejected). */
export function sanitizeAddonColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (HEX_RE.test(v)) return v.toLowerCase();
  const named = NAMED_TOKENS[v];
  if (named) return named;
  if (v.startsWith('class:')) {
    const cls = (CLASSES as Record<string, { color: number } | undefined>)[v.slice(6)];
    if (cls) return `#${cls.color.toString(16).padStart(6, '0')}`;
  }
  return null;
}

function num(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(hi, Math.max(lo, v));
}

function sanitizeSecure(v: unknown): AddonSecureAction | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const s = v as Record<string, unknown>;
  if (s.type === 'actionSlot') {
    const slot = s.slot;
    if (typeof slot === 'number' && Number.isInteger(slot) && slot >= 0) {
      if (slot <= ADDON_ACTION_SLOT_MAX) return { type: 'actionSlot', slot };
    }
    return undefined;
  }
  if (s.type === 'targetUnit') {
    const unit = ADDON_SECURE_UNITS.find((u) => u === s.unit);
    return unit ? { type: 'targetUnit', unit } : undefined;
  }
  if (s.type === 'toggleWindow') {
    const win = ADDON_SECURE_WINDOWS.find((w) => w === s.window);
    return win ? { type: 'toggleWindow', window: win } : undefined;
  }
  return undefined;
}

/** Sanitize raw props for a widget type. Unknown keys are dropped; a known key
 *  with a bad value rejects the whole op (the add-on gets an error, not a
 *  silently half-applied frame). */
export function sanitizeAddonProps(
  type: AddonWidgetType,
  raw: unknown,
  opts: { secureAllowed: boolean },
): { ok: true; props: AddonWidgetProps } | { ok: false; reason: OpRejection; key?: string } {
  if (raw === undefined || raw === null) return { ok: true, props: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'shape' };
  const r = raw as Record<string, unknown>;
  const p: AddonWidgetProps = {};
  const fail = (key: string) => ({ ok: false as const, reason: 'prop' as const, key });
  const L = ADDON_UI_LIMITS;
  for (const key of Object.keys(r)) {
    const v = r[key];
    switch (key) {
      case 'name':
        if (typeof v !== 'string' || !NAME_RE.test(v)) return fail(key);
        p.name = v;
        break;
      case 'point':
      case 'relativePoint': {
        const pt = ADDON_POINTS.find((x) => x === v);
        if (!pt) return fail(key);
        p[key] = pt;
        break;
      }
      case 'x':
      case 'y': {
        const n = num(v, -L.maxCoord, L.maxCoord);
        if (n === null) return fail(key);
        p[key] = Math.round(n);
        break;
      }
      case 'width':
      case 'height': {
        const n = num(v, 0, L.maxCoord);
        if (n === null) return fail(key);
        p[key] = Math.round(n);
        break;
      }
      case 'shown':
      case 'clickable':
      case 'movable':
      case 'wrap':
      case 'bold':
      case 'vertical':
        if (typeof v !== 'boolean') return fail(key);
        p[key] = v;
        break;
      case 'alpha': {
        const n = num(v, 0, 1);
        if (n === null) return fail(key);
        p.alpha = Math.round(n * 100) / 100;
        break;
      }
      case 'layer':
        if (v !== 'low' && v !== 'medium' && v !== 'high') return fail(key);
        p.layer = v;
        break;
      case 'backdrop': {
        if (v === null) {
          p.backdropColor = null;
          p.borderColor = null;
          break;
        }
        if (typeof v !== 'object') return fail(key);
        const b = v as { color?: unknown; borderColor?: unknown };
        p.backdropColor = b.color === undefined ? null : sanitizeAddonColor(b.color);
        p.borderColor = b.borderColor === undefined ? null : sanitizeAddonColor(b.borderColor);
        if (b.color !== undefined && p.backdropColor === null) return fail(key);
        if (b.borderColor !== undefined && p.borderColor === null) return fail(key);
        break;
      }
      case 'color':
      case 'bgColor': {
        if (v === null) {
          p[key] = null;
          break;
        }
        const c = sanitizeAddonColor(v);
        if (c === null) return fail(key);
        p[key] = c;
        break;
      }
      case 'text': {
        if (typeof v !== 'string' && typeof v !== 'number') return fail(key);
        const cap = type === 'button' ? L.maxButtonChars : L.maxTextChars;
        p.text = String(v).slice(0, cap);
        break;
      }
      case 'size': {
        const n = num(v, 8, 32);
        if (n === null) return fail(key);
        p.size = Math.round(n);
        break;
      }
      case 'align':
        if (v !== 'left' && v !== 'center' && v !== 'right') return fail(key);
        p.align = v;
        break;
      case 'value':
      case 'min':
      case 'max': {
        const n = num(v, -1e12, 1e12);
        if (n === null) return fail(key);
        p[key] = n;
        break;
      }
      case 'secure': {
        if (type !== 'button') return fail(key);
        if (!opts.secureAllowed) return { ok: false, reason: 'permission', key };
        const s = sanitizeSecure(v);
        if (s === undefined) return fail(key);
        p.secure = s;
        break;
      }
      default:
        // Forward compatible: an unknown prop from a newer SDK is ignored.
        break;
    }
  }
  return { ok: true, props: p };
}

/** Parse one raw op from the worker. */
export function parseAddonUiOp(
  raw: unknown,
  opts: { secureAllowed: boolean },
): { ok: true; op: AddonUiOp } | { ok: false; reason: OpRejection; key?: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'shape' };
  const r = raw as Record<string, unknown>;
  const id = r.id;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || id > 1e9) {
    return { ok: false, reason: 'shape' };
  }
  if (r.op === 'd') return { ok: true, op: { op: 'd', id } };
  if (r.op === 'c') {
    const type = ADDON_WIDGET_TYPES.find((t) => t === r.type);
    if (!type) return { ok: false, reason: 'type' };
    const parent = r.parent;
    if (parent !== null && parent !== undefined) {
      if (typeof parent !== 'number' || !Number.isInteger(parent) || parent <= 0) {
        return { ok: false, reason: 'parent' };
      }
    }
    const props = sanitizeAddonProps(type, r.props, opts);
    if (!props.ok) return props;
    return {
      ok: true,
      op: { op: 'c', id, type, parent: (parent as number | undefined) ?? null, props: props.props },
    };
  }
  if (r.op === 's') {
    // The type is checked against the tree on apply; sanitize as the widest type
    // here and let applyOp re-check the type-specific keys.
    return { ok: true, op: { op: 's', id, props: r.props as AddonWidgetProps } };
  }
  return { ok: false, reason: 'shape' };
}

/** Props that, on a widget holding a secure button in its subtree, change what
 *  sits under the cursor; frozen while the player is in combat. */
const LOCKDOWN_KEYS: readonly (keyof AddonWidgetProps)[] = [
  'shown',
  'alpha',
  'point',
  'relativePoint',
  'x',
  'y',
  'width',
  'height',
  'secure',
  'layer',
  'clickable',
];

export interface AddonWidgetTree {
  readonly widgets: Map<number, AddonWidgetRec>;
  /** Validate + apply one op to the model; the caller mirrors it to the DOM. */
  apply(op: AddonUiOp):
    | { ok: true; rec: AddonWidgetRec | null; removed: number[] }
    | {
        ok: false;
        reason: OpRejection;
        key?: string;
      };
  /** True when this op must wait for combat to end (secure lockdown). */
  lockedInCombat(op: AddonUiOp): boolean;
}

export function createAddonWidgetTree(opts: { secureAllowed: boolean }): AddonWidgetTree {
  const widgets = new Map<number, AddonWidgetRec>();
  const bumpSecure = (start: number | null, delta: number) => {
    let cur = start;
    while (cur !== null) {
      const w = widgets.get(cur);
      if (!w) break;
      w.secureCount += delta;
      cur = w.parent;
    }
  };
  const subtree = (id: number, acc: number[]) => {
    const w = widgets.get(id);
    if (!w) return;
    for (const c of w.children) subtree(c, acc);
    acc.push(id);
  };
  return {
    widgets,
    apply(op) {
      if (op.op === 'c') {
        if (widgets.has(op.id)) return { ok: false, reason: 'duplicate' };
        if (widgets.size >= ADDON_UI_LIMITS.maxWidgets) return { ok: false, reason: 'cap' };
        if (op.parent !== null && !widgets.has(op.parent)) return { ok: false, reason: 'parent' };
        if (op.props.movable && op.parent !== null)
          return { ok: false, reason: 'prop', key: 'movable' };
        const rec: AddonWidgetRec = {
          id: op.id,
          type: op.type,
          parent: op.parent,
          children: new Set(),
          props: { ...op.props },
          secureCount: op.props.secure ? 1 : 0,
        };
        widgets.set(op.id, rec);
        if (op.parent !== null) widgets.get(op.parent)?.children.add(op.id);
        if (rec.secureCount > 0) bumpSecure(op.parent, 1);
        return { ok: true, rec, removed: [] };
      }
      const w = widgets.get(op.id);
      if (!w) return { ok: false, reason: 'missing' };
      if (op.op === 'd') {
        const removed: number[] = [];
        subtree(op.id, removed);
        if (w.secureCount > 0) bumpSecure(w.parent, -w.secureCount);
        if (w.parent !== null) widgets.get(w.parent)?.children.delete(op.id);
        for (const id of removed) widgets.delete(id);
        return { ok: true, rec: null, removed };
      }
      const clean = sanitizeAddonProps(w.type, op.props, opts);
      if (!clean.ok) return clean;
      if (clean.props.movable && w.parent !== null)
        return { ok: false, reason: 'prop', key: 'movable' };
      const wasSecure = w.props.secure ? 1 : 0;
      Object.assign(w.props, clean.props);
      const nowSecure = w.props.secure ? 1 : 0;
      if (nowSecure !== wasSecure) {
        w.secureCount += nowSecure - wasSecure;
        bumpSecure(w.parent, nowSecure - wasSecure);
      }
      return { ok: true, rec: w, removed: [] };
    },
    lockedInCombat(op) {
      if (op.op === 'c') {
        return !!op.props.secure;
      }
      const w = widgets.get(op.id);
      if (!w || w.secureCount === 0) return false;
      if (op.op === 'd') return true;
      const props = (op.props ?? {}) as Record<string, unknown>;
      return LOCKDOWN_KEYS.some((k) => k in props);
    },
  };
}

/** CSS percent fractions for an anchor point. */
export function pointFractions(p: AddonPoint): { fx: number; fy: number } {
  const fx = p.endsWith('LEFT') ? 0 : p.endsWith('RIGHT') ? 1 : 0.5;
  const fy = p.startsWith('TOP') ? 0 : p.startsWith('BOTTOM') ? 1 : 0.5;
  return { fx, fy };
}

/** The anchor as CSS: `left/top` percent of the parent box, then translate by
 *  the widget's own point and the pixel offset (y grows downward, like CSS).
 *  No layout read is ever needed, so auto-sized text anchors correctly. */
export function anchorCss(props: AddonWidgetProps): {
  left: string;
  top: string;
  transform: string;
} {
  const rel = pointFractions(props.relativePoint ?? props.point ?? 'TOPLEFT');
  const own = pointFractions(props.point ?? 'TOPLEFT');
  const x = props.x ?? 0;
  const y = props.y ?? 0;
  return {
    left: `${rel.fx * 100}%`,
    top: `${rel.fy * 100}%`,
    transform: `translate(${-own.fx * 100}%, ${-own.fy * 100}%) translate(${x}px, ${y}px)`,
  };
}

/** Bar fill fraction 0..1 from value/min/max (degenerate ranges read empty). */
export function barFraction(props: AddonWidgetProps): number {
  const min = props.min ?? 0;
  const max = props.max ?? 1;
  const value = props.value ?? 0;
  if (!(max > min)) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}
