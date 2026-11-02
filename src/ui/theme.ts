// In-game UI theming — pure, host-agnostic core (no DOM imports).
//
// A theme is a small set of semantic colour "knobs" (accent, border, panel
// base, two text shades, four resource-bar colours). Curated presets are full
// knob maps; the player may additionally override any knob (the "custom"
// layer). `resolveTheme` merges preset + custom into the effective knobs, and
// `themeCssVars` expands those knobs into the concrete `--var: value` pairs the
// stylesheet consumes — deriving secondary accent/scrollbar colours so a single
// accent tweak stays visually coherent.
//
// The DOM bridge (main.ts) just loops the returned map through
// `documentElement.style.setProperty`, exactly like the existing comfort
// settings. Nothing here touches the sim, the wire, or balance.

export type ThemeKnob =
  | 'accent'
  | 'border'
  | 'panel'
  | 'text'
  | 'textMuted'
  | 'hp'
  | 'mana'
  | 'rage'
  | 'energy';

export type ThemeKnobs = Record<ThemeKnob, string>;

export type PresetId = 'classic' | 'midnight' | 'parchment' | 'highContrast' | 'fancyGold';

export interface ThemeState {
  preset: PresetId;
  /** Per-knob overrides layered over the preset; absent knobs fall through. */
  custom: Partial<ThemeKnobs>;
}

// Order is the display order of the custom-colour pickers in Options.
export const THEME_KNOB_ORDER: ThemeKnob[] = [
  'accent',
  'border',
  'panel',
  'text',
  'textMuted',
  'hp',
  'mana',
  'rage',
  'energy',
];

// i18n sub-keys (under hudChrome.theme.knob.*) for each knob's label.
export const THEME_KNOB_LABEL_KEY: Record<ThemeKnob, string> = {
  accent: 'accent',
  border: 'border',
  panel: 'panel',
  text: 'text',
  textMuted: 'textMuted',
  hp: 'hp',
  mana: 'mana',
  rage: 'rage',
  energy: 'energy',
};

export const PRESET_ORDER: PresetId[] = [
  'classic',
  'fancyGold',
  'midnight',
  'parchment',
  'highContrast',
];

// `classic` is the Project H palette (docs/design/project-h-interface.md): a
// quiet charcoal panel that is never pure black, warm off-white text, mid-grey
// secondary text, one antique-brass accent, and desaturated vitals. The other
// presets are alternates; every knob still flows through the same derivations.
export const THEME_PRESETS: Record<PresetId, ThemeKnobs> = {
  classic: {
    accent: '#c9a96a',
    border: '#4a4640',
    panel: '#0e0e10',
    text: '#ece7dc',
    textMuted: '#aba59b',
    hp: '#4f9d55',
    mana: '#3f7fc4',
    rage: '#b8413a',
    energy: '#cdb24a',
  },
  midnight: {
    accent: '#8fb8e8',
    border: '#3a4a66',
    panel: '#0e1420',
    text: '#dce6f2',
    textMuted: '#7f8ca3',
    hp: '#2ec27e',
    mana: '#4a90d9',
    rage: '#d96459',
    energy: '#e0c84f',
  },
  parchment: {
    accent: '#8a5a1a',
    border: '#b89a5e',
    panel: '#ece0c4',
    text: '#2e2410',
    textMuted: '#6b5d3e',
    hp: '#2f8f3a',
    mana: '#2f6fb0',
    rage: '#b03a2e',
    energy: '#a8801f',
  },
  highContrast: {
    accent: '#ffe000',
    border: '#ffffff',
    panel: '#000000',
    text: '#ffffff',
    textMuted: '#d0d0d0',
    hp: '#00e000',
    mana: '#00b0ff',
    rage: '#ff3030',
    energy: '#ffe000',
  },
  // "Fancy Gold": the hand-gilded look. WORK IN PROGRESS (owner decision):
  // the preset is selectable and labelled "(WIP)" in the options menu while
  // the gilded treatment is still being iterated on; expect its palette and
  // ornament coverage to change, and do not pin new work to its current
  // values. Selecting it does two things: these knobs retune the whole UI's
  // palette, and applyTheme (main.ts) stamps the .fancy-gold-ui root class
  // that turns on the gilded filigree window frame (perf_ornament_svg.ts +
  // components.css); every other preset keeps the classic flat panels.
  // Accent/border are drawn from the same --color-gold-* ramp the filigree
  // paints with (accent = gold-400's warm gilt, border = gold-700's deep
  // leaf), over a warm near-black panel, so the general chrome reads as one
  // hand-gilded set with the ornament.
  fancyGold: {
    accent: '#f0c86d',
    border: '#926321',
    panel: '#1d1508',
    text: '#f6ecd2',
    textMuted: '#c6aa6e',
    hp: '#1eb838',
    mana: '#2b7bd4',
    rage: '#c0392b',
    energy: '#e4c531',
  },
};

export const DEFAULT_PRESET: PresetId = 'classic';
export const DEFAULT_THEME: ThemeState = { preset: DEFAULT_PRESET, custom: {} };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Mix `hex` toward `target` by `t` (0 = hex, 1 = target). Pure. */
export function mixHex(hex: string, target: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(target);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

// --- WCAG contrast (sRGB relative luminance + ratio) -----------------------
// Pure helpers so the contrast guards below (and the unit tests) never need a
// DOM. Follows WCAG 2.1: linearize each channel, weight, then ratio with the
// +0.05 flare term.

function srgbChannel(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance in [0,1] for a #rrggbb colour. Pure. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

/** WCAG contrast ratio (>=1) between two #rrggbb colours. Pure. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** True when `panel` reads as a light surface (so text should go dark). */
export function isLightPanel(hex: string): boolean {
  return relativeLuminance(hex) > 0.4;
}

/** The opaque colour a translucent `hex` at `alpha` reads as over `backdrop`.
 *  Pure; the contrast guards use it to judge text over the translucent HUD
 *  surfaces, which have no single colour of their own. */
export function compositeOver(hex: string, alpha: number, backdrop: string): string {
  const [r, g, b] = hexToRgb(hex);
  const [br, bg, bb] = hexToRgb(backdrop);
  return rgbToHex(
    r * alpha + br * (1 - alpha),
    g * alpha + bg * (1 - alpha),
    b * alpha + bb * (1 - alpha),
  );
}

/** `rgba(...)` string from a hex colour and an alpha in [0,1]. Pure. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The flat HUD-chrome fill alpha (`--surface-hud`): the direction doc's
 *  "rgba(14,14,16,0.72) class translucency on the HUD". */
export const SURFACE_HUD_ALPHA = 0.72;
/** The ordinary panel / window fill alpha (`--panel-bg`). */
export const PANEL_ALPHA = 0.84;
/** The full-screen menu fill alpha (`--surface-menu`): near-opaque. */
export const SURFACE_MENU_ALPHA = 0.94;

/** Minimum body-text contrast we will let a resolved theme ship with. */
export const MIN_TEXT_CONTRAST = 4.5;
/** Minimum contrast for muted/secondary and accent (large-text tier). */
export const MIN_LARGE_CONTRAST = 3;

/**
 * Repair a text colour so it clears `min` contrast against `panel`. We keep the
 * caller's hue when it already passes; otherwise we step it toward whichever of
 * black/white the panel contrasts with best until it clears (or fall back to
 * that pole). Pure, so the custom-override guard is unit-testable.
 */
export function ensureReadable(
  textHex: string,
  panelHex: string,
  min: number,
  poleHex?: string,
): string {
  if (contrastRatio(textHex, panelHex) >= min) return textHex;
  // The caller may pin the pole (a translucent surface judged over the world
  // keeps the pole of the PANEL it belongs to, so two repairs never fight).
  const pole = poleHex ?? (isLightPanel(panelHex) ? '#000000' : '#ffffff');
  if (contrastRatio(pole, panelHex) < min) return pole; // panel itself is mid-grey; best effort
  for (let t = 0.15; t < 1; t += 0.15) {
    const candidate = mixHex(textHex, pole, t);
    if (contrastRatio(candidate, panelHex) >= min) return candidate;
  }
  return pole;
}

/**
 * Effective knobs: the preset overlaid with any valid custom overrides, then a
 * contrast guard so a custom text/panel pair (e.g. white-on-white) can never
 * ship below AA. Both text shades are repaired against the resolved panel.
 */
export function resolveTheme(state: ThemeState): ThemeKnobs {
  const base = THEME_PRESETS[state.preset] ?? THEME_PRESETS[DEFAULT_PRESET];
  const out: ThemeKnobs = { ...base };
  for (const knob of THEME_KNOB_ORDER) {
    const v = state.custom[knob];
    if (isValidHex(v)) out[knob] = v;
  }
  out.text = ensureReadable(out.text, out.panel, MIN_TEXT_CONTRAST);
  out.textMuted = ensureReadable(out.textMuted, out.panel, MIN_LARGE_CONTRAST);
  return out;
}

/**
 * Expand the 9 knobs into the concrete CSS custom properties the stylesheet
 * reads. Secondary accent/scrollbar colours are derived so a lone accent change
 * still produces a coherent frame. Returns a plain map; the caller applies it.
 */
export function themeCssVars(knobs: ThemeKnobs): Record<string, string> {
  const { accent, border, panel, text, textMuted, hp, mana, rage, energy } = knobs;
  const accentDim = mixHex(accent, '#000000', 0.22);
  const lightPanel = isLightPanel(panel);
  // panelEdge: dark panels darken hard (the classic vignette); light panels only
  // tint slightly so body/muted/accent text stays above AA over the gradient's
  // bottom band instead of dropping onto a near-#827b6c mid-grey.
  const panelEdge = lightPanel ? mixHex(panel, '#000000', 0.14) : mixHex(panel, '#000000', 0.45);
  // A panel-aware gold: on a dark panel the raw accent reads fine, but a bright
  // accent on the light Parchment panel is gold-on-cream (sub-AA). Darken the
  // accent toward black until it clears the large-text tier against BOTH the
  // panel and its edge so accent values recolor and stay readable per preset.
  const colorGold = ensureReadable(
    ensureReadable(accent, panel, MIN_LARGE_CONTRAST),
    panelEdge,
    MIN_LARGE_CONTRAST,
  );
  // The quest-marker tooltip TAG text (the map tooltip's "Repeatable" and
  // "Available again soon" tags): a lifted rare-adjacent blue that reads AA
  // on the dark presets but is blue-on-cream on the light Parchment panel,
  // so it is repaired per preset exactly like --color-gold above, against
  // BOTH the panel and its gradient edge. The static tokens.css default is
  // the classic-preset value; this emit keeps every preset at the text tier.
  const questTagText = ensureReadable(
    ensureReadable('#3d9bff', panel, MIN_TEXT_CONTRAST),
    panelEdge,
    MIN_TEXT_CONTRAST,
  );
  // The profession-affinity tooltip line ("Used by Leatherworking, ...", the
  // tt-material-use class): a soft craft-teal wash over the repaired accent
  // so multi-use reagents scan apart from the plain tt-desc use lines without
  // inventing a new rarity color. The wash re-lightens the accent (28% of a
  // fixed light teal), so it is repaired per preset exactly like --color-gold
  // above, against BOTH the panel and its gradient edge: unrepaired, the
  // Parchment mix lands below that floor on the gradient's bottom band. The
  // 3:1 floor keeps PARITY with the --color-accent family this line derives
  // from (the shared .tt-desc text ships at that repair today); if that
  // family is ever raised to the 4.5:1 text tier, raise both together. The
  // static tokens.css default is the classic-preset value.
  const materialUseText = ensureReadable(
    ensureReadable(mixHex(colorGold, '#6ec8d4', 0.28), panel, MIN_LARGE_CONTRAST),
    panelEdge,
    MIN_LARGE_CONTRAST,
  );
  // Overlay text sits over the 3D world (quest tracker), NOT a panel, so it must
  // stay light regardless of preset and lean on its text-shadow for contrast.
  const overlayText = '#f4eede';
  // High-Contrast Text draws a halo behind HUD labels via text-shadow. A dark
  // halo sharpens light text against a dark panel, but on a light panel
  // (Parchment) the body text is already dark, so a dark halo just blurs into
  // the glyph instead of separating it. The halo needs to sit on the opposite
  // side of the panel's lightness from the text, so flip it light there.
  const textOutline = lightPanel ? '#ffffff' : '#000000';
  // Library text roles (src/styles/library.css): the secondary shade leans the
  // body text toward the muted knob, the faint shade leans the muted knob toward
  // the panel; both are contrast-repaired against the panel and its edge so the
  // light Parchment preset keeps them readable.
  const textSecondary = ensureReadable(
    ensureReadable(mixHex(text, textMuted, 0.18), panel, MIN_TEXT_CONTRAST),
    panelEdge,
    MIN_TEXT_CONTRAST,
  );
  const textFaint = ensureReadable(
    ensureReadable(mixHex(textMuted, panel, 0.12), panel, MIN_TEXT_CONTRAST),
    panelEdge,
    MIN_TEXT_CONTRAST,
  );
  // The soft and strong panel fills are the standard panel gradient at the two
  // other alphas the boards use (trackers and chat at rest; tooltips, inputs and
  // confirm dialogs), the strong one pulled a step toward black.
  // The lifted stops the library composes over the panel: the socket highlight
  // and the window head's upper stop. Project H: dark panels lift toward a WARM
  // neutral (charcoal, not blue-black metal), light panels sink a step.
  const socketHi = lightPanel ? mixHex(panel, '#000000', 0.08) : mixHex(panel, '#3a3836', 0.5);
  const panelHi = lightPanel ? mixHex(panel, '#000000', 0.06) : mixHex(panel, '#262523', 0.5);
  // The glint (inner edge highlight, badge edge, thumb) follows the accent so a
  // blue preset does not carry a gold hairline; light panels darken it instead.
  const glint = lightPanel ? mixHex(accent, '#000000', 0.15) : mixHex(accent, '#ffffff', 0.55);
  // Window-resident control borders follow the border knob (DESIGN.md 4.1: a
  // border on a themed surface is preset-aware); HUD sockets keep the static rim.
  const controlBorder = mixHex(border, '#000000', 0.3);
  // Info and warning are chat text on the boards: repaired to the text tier like
  // --color-material-use, against the panel and its edge.
  const info = ensureReadable(
    ensureReadable('#45c9ff', panel, MIN_TEXT_CONTRAST),
    panelEdge,
    MIN_TEXT_CONTRAST,
  );
  const warning = ensureReadable(
    ensureReadable('#ff9d32', panel, MIN_TEXT_CONTRAST),
    panelEdge,
    MIN_TEXT_CONTRAST,
  );
  const panelStrong = lightPanel ? mixHex(panel, '#ffffff', 0.3) : mixHex(panel, '#000000', 0.24);
  // Project H surfaces (docs/design/project-h-interface.md "Tokens"): one FLAT
  // translucent fill per surface class. The three --panel-bg* gradients keep
  // their gradient FORM (every consumer and the pinned tests read a
  // linear-gradient) but both stops are the same colour, so no panel carries a
  // vignette any more. --surface-hud is the HUD-chrome fill, --surface-menu the
  // near-opaque full-screen menu fill; the row fills, the three hairlines and
  // the accent-soft wash are the TEXT and ACCENT knobs at low alpha, so a light
  // preset gets dark hairlines and a dark preset light ones for free.
  const surfaceHud = rgba(panel, SURFACE_HUD_ALPHA);
  const surfaceMenu = rgba(panel, SURFACE_MENU_ALPHA);
  // The HUD surface is translucent, so its worst case is the world showing
  // through: a dark panel over bright terrain lifts the surface toward grey,
  // and a light panel over a cave sinks it. Repair the secondary text against
  // the surface composited over the pole the panel contrasts with LEAST, so
  // --text-dim clears the large-text tier on every preset over any terrain
  // (tests/theme.test.ts composites and checks it).
  // worstWorld is also the repair POLE (a dark panel repairs toward white, a
  // light one toward black), so the two nested repairs never fight.
  const worstWorld = lightPanel ? '#000000' : '#ffffff';
  const hudWorst = compositeOver(panel, SURFACE_HUD_ALPHA, worstWorld);
  const textDim = ensureReadable(
    ensureReadable(textMuted, hudWorst, MIN_LARGE_CONTRAST, worstWorld),
    panel,
    MIN_LARGE_CONTRAST,
  );
  const accentHud = ensureReadable(
    ensureReadable(colorGold, hudWorst, MIN_LARGE_CONTRAST, worstWorld),
    panel,
    MIN_LARGE_CONTRAST,
  );
  return {
    '--surface-hud': surfaceHud,
    '--surface-menu': surfaceMenu,
    '--surface-row': rgba(text, 0.04),
    '--surface-row-hover': rgba(text, 0.08),
    '--line-faint': rgba(text, 0.14),
    '--line': rgba(text, 0.26),
    '--line-strong': rgba(text, 0.42),
    '--accent': accentHud,
    '--accent-soft': rgba(accentHud, 0.28),
    '--text': text,
    '--text-dim': textDim,
    '--text-faint': textFaint,
    '--text-invert': panel,
    '--vital-health': hp,
    '--vital-mana': mana,
    '--vital-stamina': energy,
    '--gold': accent,
    '--gold-dim': accentDim,
    '--color-gold': colorGold,
    '--color-accent': colorGold,
    '--color-primary-glow': rgba(accent, 0.2),
    '--color-primary-glow-heavy': rgba(accent, 0.4),
    '--color-border-focus': accentDim,
    '--border': border,
    '--color-border-default': mixHex(border, '#000000', 0.25),
    '--panel-base': panel,
    '--panel-bg': `linear-gradient(170deg, ${rgba(panel, PANEL_ALPHA)} 0%, ${rgba(panel, PANEL_ALPHA)} 100%)`,
    '--panel-edge': panelEdge,
    '--panel-bg-soft': `linear-gradient(170deg, ${rgba(panel, 0.74)} 0%, ${rgba(panel, 0.74)} 100%)`,
    '--panel-bg-strong': `linear-gradient(170deg, ${rgba(panelStrong, 0.97)} 0%, ${rgba(panelStrong, 0.97)} 100%)`,
    '--color-bg-dark': panelEdge,
    '--color-text-light': text,
    '--color-text-muted': textMuted,
    '--color-text-secondary': textSecondary,
    '--color-text-faint': textFaint,
    '--color-info': info,
    '--color-warning': warning,
    '--color-socket-hi': socketHi,
    '--color-panel-hi': panelHi,
    '--color-glint': glint,
    '--color-control-border': controlBorder,
    '--color-text-overlay': overlayText,
    '--color-quest-tag-text': questTagText,
    '--color-material-use': materialUseText,
    '--text-outline-color': textOutline,
    '--scrollbar-thumb': mixHex(border, '#000000', 0.15),
    '--scrollbar-thumb-hover': border,
    '--scrollbar-border': border,
    '--color-hp': hp,
    '--color-mana': mana,
    '--color-rage': rage,
    '--color-energy': energy,
  };
}

/** Parse an untrusted persisted blob into a valid ThemeState. Never throws. */
export function parseTheme(raw: unknown): ThemeState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_THEME, custom: {} };
  const obj = raw as Record<string, unknown>;
  const preset = PRESET_ORDER.includes(obj.preset as PresetId)
    ? (obj.preset as PresetId)
    : DEFAULT_PRESET;
  const custom: Partial<ThemeKnobs> = {};
  const rawCustom = obj.custom;
  if (rawCustom && typeof rawCustom === 'object') {
    const c = rawCustom as Record<string, unknown>;
    for (const knob of THEME_KNOB_ORDER) {
      if (isValidHex(c[knob])) custom[knob] = c[knob] as string;
    }
  }
  return { preset, custom };
}

export function serializeTheme(state: ThemeState): string {
  return JSON.stringify({ preset: state.preset, custom: state.custom });
}

// --- Persistence ----------------------------------------------------------
// Dedicated localStorage store, mirroring the Keybinds pattern, so the
// numeric/bool `woc_settings` schema stays clean. Browser-only; the pure
// functions above carry all the logic and are what the unit tests cover.

const THEME_STORE_KEY = 'woc_theme';

export class ThemeStore {
  private state: ThemeState;

  constructor() {
    let raw: unknown = null;
    try {
      raw = JSON.parse(localStorage.getItem(THEME_STORE_KEY) ?? 'null');
    } catch {
      /* corrupt */
    }
    this.state = parseTheme(raw);
  }

  get(): ThemeState {
    return { preset: this.state.preset, custom: { ...this.state.custom } };
  }

  /** Effective CSS variable map for the current state. */
  cssVars(): Record<string, string> {
    return themeCssVars(resolveTheme(this.state));
  }

  private save(): void {
    try {
      localStorage.setItem(THEME_STORE_KEY, serializeTheme(this.state));
    } catch {
      /* unavailable */
    }
  }

  setPreset(preset: PresetId): void {
    if (PRESET_ORDER.includes(preset)) {
      this.state.preset = preset;
      this.save();
    }
  }

  /** Set or (with null) clear one custom knob override. */
  setCustom(knob: ThemeKnob, value: string | null): void {
    if (value === null) delete this.state.custom[knob];
    else if (isValidHex(value)) this.state.custom[knob] = value;
    this.save();
  }

  /** Drop all custom overrides, falling back to the bare preset. */
  resetCustom(): void {
    this.state.custom = {};
    this.save();
  }
}
