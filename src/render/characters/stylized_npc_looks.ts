// The stylized review's FIXED-outfit townsfolk (dev-only, `?stylizedchars=1`): one finished,
// single-mesh body per named character, refit onto the WOC rig by
// scripts/assets/stylized_char_test/fit_woc_rig.mjs, keyed by the NPC templates that wear it.
// The story pass renamed existing NPCs display-only, so their ids are the frozen ones here
// (the Brother Aldric copies in other zones wear the same body). A `proposed` id names an NPC
// not on a pushed branch yet: the merge reconciles it with the real template id.
// Pure data, three-free.

export interface StylizedNpcLook {
  /** The body's file id (`models/chars/test_stylized/<look>_stylized.glb`). */
  readonly look: string;
  /** The NPC templates that wear it. */
  readonly templates: readonly string[];
  /** A stout build: its upper arms are dialled out so the hands clear the belly. */
  readonly stout?: boolean;
  /** The template id is proposed, not yet on a pushed branch. */
  readonly proposed?: boolean;
}

export const STYLIZED_NPC_LOOKS: readonly StylizedNpcLook[] = [
  { look: 'fenlow', templates: ['ferryman_odo'] },
  { look: 'corren', templates: ['drillmaster_rook'] },
  { look: 'ivara', templates: ['apothecary_lin'] },
  { look: 'silven', templates: ['trader_wilkes'] },
  { look: 'brunna', templates: ['armorer_hode'] },
  { look: 'neris', templates: ['scout_einna'] },
  { look: 'jorren', templates: ['innkeeper_maudie'], stout: true },
  { look: 'olvessa', templates: ['herbalist_yara'] },
  {
    look: 'aldric',
    templates: [
      'brother_aldric',
      'brother_aldric_fen',
      'brother_aldric_highwatch',
      'brother_aldric_wastes',
      'brother_aldric_raid',
    ],
  },
  { look: 'tamsin', templates: ['tanner_tamsin'] },
  { look: 'tobbin', templates: ['fisherman_tobbin'], proposed: true },
  { look: 'pella', templates: ['carpenter_pella'], proposed: true },
  { look: 'della', templates: ['gardener_della'], stout: true, proposed: true },
  { look: 'holven', templates: ['gravekeeper_holven'], proposed: true },
];

const BY_TEMPLATE = new Map<string, StylizedNpcLook>(
  STYLIZED_NPC_LOOKS.flatMap((l) => l.templates.map((t) => [t, l] as const)),
);

/** The fixed-outfit body an NPC template wears in the review, or null. */
export function stylizedNpcLookFor(templateId: string): StylizedNpcLook | null {
  return BY_TEMPLATE.get(templateId) ?? null;
}

/** The review key of one fixed-outfit body. */
export function stylizedNpcKey(look: string): string {
  return `stylized_npc_${look}`;
}

/** The shipped file of one fixed-outfit body. */
export function stylizedNpcUrl(look: string): string {
  return `models/chars/test_stylized/${look}_stylized.glb`;
}
