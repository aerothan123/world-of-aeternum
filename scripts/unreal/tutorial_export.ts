// W4 M19 export for the native Unreal client: the Proving Shore tutorial view (the movement
// bootcamp ladder at the Gauntlet, the rail coach for every island quest after it, the ring equip
// coda and the closing bell card), as two parity suites the Unreal tests
// `Wyndlewood.Progression.Parity.Tutorial*` replay:
//   - tutorial_view: the composed card for a grid of inputs (rail quest states, flag count,
//     camera lesson, caster class, death phase, ring lesson, bags);
//   - tutorial_chain: the ordered card sequence a fresh character walks through the whole rail,
//     the order a headless -WyndAutoQuest run checks its observed steps against.
// The composition mirrors BootcampOverlay.update (src/ui/bootcamp.ts) over the pure cores in
// src/ui/bootcamp_view.ts and src/ui/coach_prompt_view.ts; the native client is keyboard and
// mouse, so every plan is taken on the keyboard arm. Bind labels are exported as keybind ids
// (src/game/keybinds.ts), which the client resolves through the player's live bindings.
// Regenerate with `UNREAL_PARITY_UPDATE=1 npx vitest run tests/unreal_tutorial_export.test.ts`.

import {
  BOOTCAMP_COURSE_CHECKPOINTS,
  PROVING_SHORE_QUEST_ORDER,
} from '../../src/sim/content/proving_shore';
import {
  BOOTCAMP_STEP_ORDER,
  type BootcampParam,
  type BootcampStep,
  bellCardPlan,
  bootcampArrowTarget,
  bootcampBodyPlan,
  bootcampTitleKey,
  COACH_GAUNTLET_QUEST_ID,
  type CoachParam,
  type CoachState,
  coachCardPlan,
  coachFocus,
  computeBootcampStep,
  type DeathLessonPhase,
  RING_LESSON_QUEST_ID,
  ringCardPlan,
  ringLessonPhase,
} from '../../src/ui/bootcamp_view';
import {
  attackBindFor,
  coachGlowBagItemId,
  coachGlowQuestId,
  coachGlowVendorItemId,
} from '../../src/ui/coach_prompt_view';
import type { ParityCase, ParitySuite } from './parity_export';

export interface TutorialInput {
  onIsland: boolean;
  /** Rail quest id to its coach state (railQuestState); a missing id is not moving. */
  quests: Record<string, CoachState>;
  /** The Gauntlet's flag tally (its first objective count). */
  counts: number;
  cameraTurned: boolean;
  playerClass: string;
  deathPhase: DeathLessonPhase;
  /** Session latches the overlay keeps: the sail quest was seen, the pearl quest was seen, the
   *  ring lesson ended (sheet opened or the admire nudge timed out). */
  sawSail: boolean;
  sawPearl: boolean;
  ringDone: boolean;
  ring: { questDone: boolean; inBags: boolean; equipped: boolean; charSeen: boolean };
  /** The four equippable bag sockets (IWorld.bags). */
  bags: (string | null)[];
}

export interface TutorialCard {
  /** 'hidden', 'bootcamp', 'coach', 'ring' or 'bell'. */
  kind: string;
  /** The stable card id the chain suite orders: bootcamp:<step>, coach:<quest>:<state>, ring:<phase>, bell. */
  id: string;
  step: string;
  stepIndex: number;
  stepTotal: number;
  questId: string;
  state: string;
  titleKey: string;
  titleHasNpc: boolean;
  /** The active coach card titles with the quest's own name instead of a chrome key. */
  titleIsQuest: boolean;
  bodyKey: string;
  /** Placeholder name to keybind id, in the order the plan lists them. */
  params: { name: string; bind: string }[];
  /** Keycap chips under the body, as keybind ids. */
  keycaps: string[];
  bodyHasNpc: boolean;
  bodyHasAbility: boolean;
  npcId: string;
  arrow: { x: number; z: number } | null;
  glowQuest: string;
  glowVendorItem: string;
  glowBagItem: string;
  glowBagsButton: boolean;
  glowCharButton: boolean;
}

const CASTERS = new Set(['mage', 'warlock', 'priest', 'druid']);

function bindFor(param: BootcampParam | CoachParam, playerClass: string): string {
  switch (param) {
    case 'forwardKey':
      return 'forward';
    case 'turnKey':
      return 'turnRight';
    case 'turnLeftKey':
      return 'turnLeft';
    case 'strafeKey':
      return 'strafeLeft';
    case 'interactKey':
      return 'interact';
    case 'mapKey':
      return 'map';
    case 'targetKey':
      return 'target';
    case 'attackKey':
      return attackBindFor(playerClass);
    case 'bagsKey':
      return 'bags';
    case 'charKey':
      return 'char';
    case 'abilityKey':
      // The taught ability sits on the second button (bootcamp.ts slotLabel for the ability ask).
      return 'slot1';
  }
}

function emptyCard(): TutorialCard {
  return {
    kind: 'hidden',
    id: 'hidden',
    step: '',
    stepIndex: -1,
    stepTotal: 0,
    questId: '',
    state: '',
    titleKey: '',
    titleHasNpc: false,
    titleIsQuest: false,
    bodyKey: '',
    params: [],
    keycaps: [],
    bodyHasNpc: false,
    bodyHasAbility: false,
    npcId: '',
    arrow: null,
    glowQuest: '',
    glowVendorItem: '',
    glowBagItem: '',
    glowBagsButton: false,
    glowCharButton: false,
  };
}

/** The card BootcampOverlay.update would show for this input (keyboard arm). */
export function tutorialCard(input: TutorialInput): TutorialCard {
  const card = emptyCard();
  const focus = input.onIsland ? coachFocus((id) => input.quests[id] ?? null) : null;
  const sawSail = input.sawSail || focus?.questId === 'q_ps_set_sail';
  const bellPhase = !focus && input.onIsland && sawSail;
  if (!focus && !bellPhase) return card;
  const sawPearl = input.sawPearl || focus?.questId === RING_LESSON_QUEST_ID;
  const ringPhase =
    !input.onIsland || !sawPearl || input.ringDone ? null : ringLessonPhase(input.ring);
  const caster = CASTERS.has(input.playerClass);
  const bind = (names: readonly (BootcampParam | CoachParam)[]) =>
    names.map((name) => ({ name, bind: bindFor(name, input.playerClass) }));

  card.glowQuest = coachGlowQuestId(focus) ?? '';
  card.glowVendorItem = coachGlowVendorItemId(focus) ?? '';
  card.glowBagItem = coachGlowBagItemId(focus, input.bags) ?? '';
  card.glowBagsButton = ringPhase === 'equip';
  card.glowCharButton = ringPhase === 'admire';
  card.stepTotal = PROVING_SHORE_QUEST_ORDER.length;

  if (bellPhase) {
    const plan = bellCardPlan('keyboard');
    card.kind = 'bell';
    card.id = 'bell';
    card.stepIndex = PROVING_SHORE_QUEST_ORDER.length;
    card.titleKey = plan.titleKey;
    card.bodyKey = plan.bodyKey;
    card.params = bind(plan.params);
    card.keycaps = card.params.map((p) => p.bind);
    card.arrow = plan.arrow;
    return card;
  }
  if (!focus) return card;
  card.questId = focus.questId;
  card.state = focus.state;
  card.stepIndex = PROVING_SHORE_QUEST_ORDER.indexOf(focus.questId);
  if (ringPhase !== null) {
    const plan = ringCardPlan(ringPhase, 'keyboard');
    card.kind = 'ring';
    card.id = `ring:${ringPhase}`;
    card.step = ringPhase;
    card.titleKey = plan.titleKey;
    card.bodyKey = plan.bodyKey;
    card.params = bind(plan.params);
    card.keycaps = card.params.map((p) => p.bind);
    return card;
  }
  if (focus.questId === COACH_GAUNTLET_QUEST_ID) {
    const step: BootcampStep = computeBootcampStep({
      questActive: focus.state !== 'available',
      checkpointsReached: input.counts,
      cameraTurned: input.cameraTurned,
    });
    const plan = bootcampBodyPlan(step, 'keyboard');
    card.kind = 'bootcamp';
    card.id = `bootcamp:${step}`;
    card.step = step;
    card.titleKey = bootcampTitleKey(step);
    card.bodyKey = plan.bodyKey;
    card.params = bind(plan.params);
    // bootcampKeycaps on the keyboard arm: the plan's binds in press order.
    const caps: Record<BootcampStep, BootcampParam[]> = {
      talk: ['interactKey'],
      forward: ['forwardKey'],
      turnwalk: ['turnKey', 'forwardKey'],
      strafe: ['turnLeftKey', 'forwardKey'],
      camera: [],
      done: ['interactKey'],
    };
    card.keycaps = caps[step].map((p) => bindFor(p, input.playerClass));
    card.arrow = bootcampArrowTarget(step, input.counts);
    card.npcId = step === 'talk' ? 'warden_tam' : step === 'done' ? 'overseer_pell' : '';
    return card;
  }
  const plan = coachCardPlan(focus, 'keyboard', caster, input.deathPhase);
  card.kind = 'coach';
  card.id = `coach:${focus.questId}:${focus.state}`;
  card.step = focus.state;
  card.titleKey = plan.titleKey ?? '';
  card.titleIsQuest = plan.titleKey === null;
  card.titleHasNpc = plan.titleHasNpc;
  card.bodyKey = plan.bodyKey;
  card.params = bind(plan.params);
  // coachKeycaps: the plan's binds minus the map key (a wayfinding aside).
  card.keycaps = card.params.filter((p) => p.name !== 'mapKey').map((p) => p.bind);
  card.bodyHasNpc = plan.bodyHasNpc;
  card.bodyHasAbility = plan.bodyHasAbility;
  card.npcId = plan.npcId;
  card.arrow = plan.arrow;
  return card;
}

function baseInput(): TutorialInput {
  return {
    onIsland: true,
    quests: {},
    counts: 0,
    cameraTurned: false,
    playerClass: 'warrior',
    deathPhase: 'alive',
    sawSail: false,
    sawPearl: false,
    ringDone: false,
    ring: { questDone: false, inBags: false, equipped: false, charSeen: false },
    bags: [null, null, null, null],
  };
}

/** The rail with every quest before `index` handed in and quest `index` in `state`. */
function railAt(index: number, state: CoachState): Record<string, CoachState> {
  const quests: Record<string, CoachState> = {};
  quests[PROVING_SHORE_QUEST_ORDER[index]] = state;
  return quests;
}

function caseOf(input: TutorialInput): ParityCase {
  // The input nests (quests, ring, bags); the suite file is JSON either way and the Unreal reader
  // takes the case's `in` as an object.
  return { in: input as unknown as ParityCase['in'], out: tutorialCard(input) };
}

function tutorialView(): ParitySuite {
  const cases: ParityCase[] = [];
  // Off the island, and an island with nothing moving: no card.
  cases.push(caseOf({ ...baseInput(), onIsland: false, quests: railAt(0, 'available') }));
  cases.push(caseOf(baseInput()));
  // The Gauntlet ladder: talk, each flag, the camera swing, the hand-in.
  cases.push(caseOf({ ...baseInput(), quests: railAt(0, 'available') }));
  for (let counts = 0; counts <= BOOTCAMP_COURSE_CHECKPOINTS.length; counts++) {
    cases.push(caseOf({ ...baseInput(), quests: railAt(0, 'active'), counts }));
  }
  cases.push(
    caseOf({
      ...baseInput(),
      quests: railAt(0, 'ready'),
      counts: BOOTCAMP_COURSE_CHECKPOINTS.length,
      cameraTurned: true,
    }),
  );
  // Every rail station in every state, for a melee class and a caster.
  for (const playerClass of ['warrior', 'mage']) {
    for (let i = 1; i < PROVING_SHORE_QUEST_ORDER.length; i++) {
      for (const state of ['available', 'active', 'ready'] as CoachState[]) {
        cases.push(caseOf({ ...baseInput(), playerClass, quests: railAt(i, state) }));
      }
    }
  }
  // The death lesson's three beats.
  const walk = PROVING_SHORE_QUEST_ORDER.indexOf('q_ps_the_long_walk');
  for (const deathPhase of ['alive', 'dead', 'ghost'] as DeathLessonPhase[]) {
    cases.push(caseOf({ ...baseInput(), quests: railAt(walk, 'active'), deathPhase }));
  }
  // The pouch lesson: still owed with the pouch in the bags, folded once it is worn.
  const pouch = PROVING_SHORE_QUEST_ORDER.indexOf('q_ps_pouch_and_purse');
  cases.push(caseOf({ ...baseInput(), quests: railAt(pouch, 'ready') }));
  cases.push(
    caseOf({
      ...baseInput(),
      quests: railAt(pouch, 'ready'),
      bags: ['linen_pouch', null, null, null],
    }),
  );
  // The ring coda after the pearl hand-in: equip, admire, ended.
  const wreck = PROVING_SHORE_QUEST_ORDER.indexOf('q_ps_the_wreck_line');
  const ringBase = { ...baseInput(), quests: railAt(wreck, 'available'), sawPearl: true };
  cases.push(
    caseOf({
      ...ringBase,
      ring: { questDone: true, inBags: true, equipped: false, charSeen: false },
    }),
  );
  cases.push(
    caseOf({
      ...ringBase,
      ring: { questDone: true, inBags: false, equipped: true, charSeen: false },
    }),
  );
  cases.push(
    caseOf({
      ...ringBase,
      ring: { questDone: true, inBags: false, equipped: true, charSeen: true },
    }),
  );
  cases.push(
    caseOf({
      ...ringBase,
      ringDone: true,
      ring: { questDone: true, inBags: true, equipped: false, charSeen: false },
    }),
  );
  // The bell: the whole rail handed in on the island after the sail quest was seen; off it, nothing.
  cases.push(caseOf({ ...baseInput(), sawSail: true }));
  cases.push(caseOf({ ...baseInput(), sawSail: true, onIsland: false }));
  return {
    suite: 'tutorial_view',
    source:
      'src/ui/bootcamp.ts BootcampOverlay.update over src/ui/bootcamp_view.ts and src/ui/coach_prompt_view.ts (keyboard arm)',
    note: 'binds are keybind ids the client resolves through the live bindings',
    cases,
  };
}

/** The ordered card ids a fresh warrior walks: the ladder, then each station in each state, then
 *  the ring coda after the pearl hand-in, then the bell. */
export function tutorialChainIds(): string[] {
  const ids: string[] = [];
  const push = (input: TutorialInput) => {
    const id = tutorialCard(input).id;
    if (ids[ids.length - 1] !== id) ids.push(id);
  };
  const flags = BOOTCAMP_COURSE_CHECKPOINTS.length;
  push({ ...baseInput(), quests: railAt(0, 'available') });
  for (let counts = 0; counts <= flags; counts++)
    push({ ...baseInput(), quests: railAt(0, 'active'), counts });
  push({ ...baseInput(), quests: railAt(0, 'ready'), counts: flags, cameraTurned: true });
  let sawPearl = false;
  for (let i = 1; i < PROVING_SHORE_QUEST_ORDER.length; i++) {
    for (const state of ['available', 'active', 'ready'] as CoachState[]) {
      push({ ...baseInput(), quests: railAt(i, state), sawPearl });
    }
    if (PROVING_SHORE_QUEST_ORDER[i] === RING_LESSON_QUEST_ID) {
      sawPearl = true;
      const next = railAt(i + 1, 'available');
      push({
        ...baseInput(),
        quests: next,
        sawPearl,
        ring: { questDone: true, inBags: true, equipped: false, charSeen: false },
      });
      push({
        ...baseInput(),
        quests: next,
        sawPearl,
        ring: { questDone: true, inBags: false, equipped: true, charSeen: false },
      });
      push({ ...baseInput(), quests: next, sawPearl, ringDone: true });
    }
  }
  push({ ...baseInput(), sawSail: true });
  return ids;
}

function tutorialChain(): ParitySuite {
  const ids = tutorialChainIds();
  return {
    suite: 'tutorial_chain',
    source: 'scripts/unreal/tutorial_export.ts tutorialChainIds over the Proving Shore rail order',
    note: `the step ladder ${BOOTCAMP_STEP_ORDER.join(', ')}, then ${PROVING_SHORE_QUEST_ORDER.length - 1} rail stations, the ring coda and the bell`,
    cases: ids.map((id, index) => ({ in: { index }, out: { id } })),
  };
}

export const TUTORIAL_PARITY_SUITES: Record<string, () => ParitySuite> = {
  tutorial_view: tutorialView,
  tutorial_chain: tutorialChain,
};

export function buildTutorialSuite(name: string): ParitySuite {
  const build = TUTORIAL_PARITY_SUITES[name];
  if (!build) throw new Error(`unknown tutorial suite ${name}`);
  return build();
}
