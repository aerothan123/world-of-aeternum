// Wyndlewood add-on API v1: type definitions for add-on authors.
//
// Add-ons are plain JavaScript files listed in addon.json. They run in an
// isolated worker with ONE global, `wynd`, described below. There is no DOM,
// no network, no storage other than `wynd.saved`, and no eval. Reference this
// file from your editor (a `/// <reference path="wynd-addon-api.d.ts" />` line
// at the top of your script, or a jsconfig.json "include") to get completion.
// Full contract: docs/design/addon-api.md in the game repository.

export {};

declare global {
  const wynd: Wynd.Api;
}

declare namespace Wynd {
  type Permission =
    | 'party'
    | 'combatLog'
    | 'chat'
    | 'minimap'
    | 'inventory'
    | 'quests'
    | 'secureActions';

  type UnitToken =
    | 'player'
    | 'target'
    | 'targettarget'
    | 'pet'
    | `party${1 | 2 | 3 | 4}`
    | `raid${number}`;

  interface Aura {
    id: string;
    name: string;
    kind: string;
    /** Seconds left; -1 for a permanent aura. */
    remaining: number;
    duration: number;
    stacks: number;
    /** Applied by the player. */
    mine: boolean;
  }

  interface Unit {
    id: number;
    name: string;
    level: number;
    cls: string | null;
    kind: 'player' | 'mob' | 'npc' | 'object' | 'pet' | string;
    hp: number;
    hpMax: number;
    power: number;
    powerMax: number;
    powerType: string | null;
    dead: boolean;
    inCombat: boolean;
    hostile: boolean;
    isPlayer: boolean;
    auras: Aura[];
    /** The cast bar the HUD shows; null when not casting. */
    cast: { ability: string; progress: number; channel: boolean; remaining: number | null } | null;
  }

  interface PartyMember {
    unit: UnitToken;
    name: string;
    cls: string;
    level: number;
    role: 'tank' | 'healer' | 'dps' | null;
    dead: boolean;
    connected: boolean;
  }

  interface Party {
    raid: boolean;
    leader: string | null;
    members: PartyMember[];
  }

  interface MinimapMarker {
    /** The built-in minimap's marker kind: 'mob', 'npc', 'party-disc', 'gather-node', ... */
    kind: string;
    /** Yards east (+) / west (-) of the player. */
    dx: number;
    /** Yards south (+) / north (-) of the player (minimap screen space). */
    dz: number;
    detail?: string;
  }

  interface Minimap {
    x: number;
    z: number;
    /** Radians, 0 = +Z. */
    facing: number;
    zoneId: string;
    radiusYards: number;
    markers: MinimapMarker[];
  }

  interface Inventory {
    bags: { itemId: string; count: number }[];
    equipped: string[];
    copper: number;
  }

  interface Quest {
    id: string;
    title: string;
    done: boolean;
    objectives: { have: number; need: number }[];
  }

  interface Actor {
    id: number;
    name: string;
    kind: string;
    isPlayer: boolean;
    isPet: boolean;
    /** The player, a party member, or one of their pets. */
    isParty: boolean;
    ownerName?: string;
  }

  interface CombatLogEntry {
    time: number;
    kind: 'damage' | 'heal' | 'absorb' | 'aura' | 'death' | 'castStart' | 'castStop';
    source: Actor | null;
    target: Actor | null;
    amount?: number;
    overheal?: number;
    absorbed?: number;
    crit?: boolean;
    school?: string;
    ability?: string | null;
    abilityId?: string | null;
    /** Damage outcome: 'hit', 'miss', 'dodge', 'parry', 'block', 'resist', 'evade'. */
    result?: string;
    gained?: boolean;
    stacks?: number;
    success?: boolean;
    periodic?: boolean;
  }

  interface ChatLine {
    time: number;
    channel: string;
    from: string;
    text: string;
    to?: string;
  }

  interface EventMap {
    LOADED: { firstRun: boolean };
    UPDATE: { time: number; dt: number };
    COMBAT_START: { time: number };
    COMBAT_END: { time: number };
    TARGET_CHANGED: { unit: Unit | null };
    PARTY_CHANGED: { size: number; raid: boolean };
    ZONE_CHANGED: { zoneId: string };
    COMBAT_LOG: CombatLogEntry;
    CHAT: ChatLine;
    CLICK: { widget: number; button: number };
    FRAME_MOVED: { widget: number; x: number; y: number };
    SETTING_CHANGED: { key: string; value: unknown };
    COMM: { from: string; data: unknown };
    LOGOUT: Record<string, never>;
  }

  type Point =
    | 'TOPLEFT'
    | 'TOP'
    | 'TOPRIGHT'
    | 'LEFT'
    | 'CENTER'
    | 'RIGHT'
    | 'BOTTOMLEFT'
    | 'BOTTOM'
    | 'BOTTOMRIGHT';

  /** `#rgb`, `#rrggbb`, `#rrggbbaa`, a game token ('accent', 'text', 'muted',
   *  'good', 'bad', 'warn', 'info', 'buff', 'debuff', 'dark', 'school:fire', ...)
   *  or 'class:<classId>'. */
  type Color = string;

  type SecureAction =
    | { type: 'actionSlot'; slot: number }
    | { type: 'targetUnit'; unit: 'player' | 'pet' | 'party1' | 'party2' | 'party3' | 'party4' }
    | {
        type: 'toggleWindow';
        window: 'bags' | 'map' | 'character' | 'spellbook' | 'talents' | 'questlog';
      };

  interface WidgetProps {
    parent?: Widget | number | null;
    /** Stable name; required for a movable frame so its position persists. */
    name?: string;
    point?: Point;
    relativePoint?: Point;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    shown?: boolean;
    alpha?: number;
    layer?: 'low' | 'medium' | 'high';
    clickable?: boolean;
    /** Top-level frames only: the player can drag it. */
    movable?: boolean;
    backdrop?: { color?: Color; borderColor?: Color } | null;
    text?: string | number;
    size?: number;
    color?: Color | null;
    align?: 'left' | 'center' | 'right';
    wrap?: boolean;
    bold?: boolean;
    value?: number;
    min?: number;
    max?: number;
    bgColor?: Color | null;
    vertical?: boolean;
    /** Buttons only, needs the 'secureActions' permission: the ONE action a
     *  player click runs. Frozen while the player is in combat. */
    secure?: SecureAction | null;
    onClick?: (e: { widget: number; button: number }) => void;
  }

  interface Widget {
    readonly id: number;
    readonly type: 'frame' | 'text' | 'bar' | 'button';
    set(props: WidgetProps): Widget;
    destroy(): void;
    onClick(fn: (e: { widget: number; button: number }) => void): Widget;
  }

  interface Timer {
    cancel(): void;
  }

  interface Api {
    /** The runtime's API version (1). */
    readonly apiVersion: number;
    readonly addon: { id: string; name: string; version: string };
    on<K extends keyof EventMap>(event: K, fn: (payload: EventMap[K]) => void): () => void;
    /** Session clock in seconds (the timestamps on events use it). */
    time(): number;
    inCombat(): boolean;
    zone(): string;
    unit(token: UnitToken): Unit | null;
    party(): Party | null;
    minimap(): Minimap | null;
    inventory(): Inventory | null;
    quests(): Quest[] | null;
    after(seconds: number, fn: () => void): Timer;
    every(seconds: number, fn: () => void): Timer;
    cancel(timer: Timer | null): void;
    ui: { create(type: 'frame' | 'text' | 'bar' | 'button', props?: WidgetProps): Widget };
    saved: {
      /** Per account (declared in addon.json savedVariables.account). */
      readonly account: Record<string, unknown> | null;
      /** Per character (savedVariables.character). */
      readonly character: Record<string, unknown> | null;
      /** Write now (also automatic every 10 s when changed, and on LOGOUT). */
      save(): void;
    };
    /** Register a command declared in addon.json slashCommands. */
    slash(name: string, fn: (args: string) => void): void;
    /** A local chat line, prefixed with your add-on's name. */
    print(text: unknown, color?: Color): void;
    /** The game language, e.g. 'en' or 'de_DE'. */
    locale(): string;
    /** Pick table[locale] ?? table[language] ?? table.en. */
    L<T>(table: Record<string, T>): T;
    format: {
      number(n: number, opts?: Intl.NumberFormatOptions): string;
      duration(seconds: number): string;
      percent(fraction: number): string;
    };
    settings: { get(key: string): unknown };
    comm: { send(addonId: string, data: unknown): void };
  }
}
