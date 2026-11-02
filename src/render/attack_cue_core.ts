import type { SimEvent } from '../sim/types';

// The renderer's reading of a bystander attack cue (src/sim/types.ts
// `attackCue`): online, the server keeps a numbered `damage` event to its
// participants and hands everyone else in range this numberless cue
// (server/attack_cue.ts). Every presentation consumer keys off the damage
// event's shape (the swing animation, the blade-contact hold, the per-ability
// impact VFX, the spatial swing and impact sounds), so the cue is re-read as a
// damage event whose amount is a placeholder: 1 when the hit landed, else 0
// (the shape every `amount > 0` presentation gate reads), and `absorbed` 1 when
// a shield soaked some. Nothing player-visible prints that number: the HUD's
// floating text, combat log and meters only ever see the cue itself, which
// they ignore, and the offline host never produces a cue at all.
//
// Memoized by identity so the two readers of one cue (the renderer's
// handleEvent, which notes the blade-contact hold on the view, and the HUD's
// atContact, which plays the sounds at that contact) agree on ONE view object.

type DamageEvent = Extract<SimEvent, { type: 'damage' }>;
type AttackCueEvent = Extract<SimEvent, { type: 'attackCue' }>;

const views = new WeakMap<AttackCueEvent, DamageEvent>();

/** The numberless damage event a bystander attack cue presents as. */
export function damageViewOfAttackCue(cue: AttackCueEvent): DamageEvent {
  const memo = views.get(cue);
  if (memo) return memo;
  const view: DamageEvent = {
    type: 'damage',
    sourceId: cue.sourceId,
    targetId: cue.targetId,
    amount: cue.landed ? 1 : 0,
    crit: cue.crit,
    school: cue.school,
    ability: cue.ability,
    kind: cue.kind,
  };
  if (cue.abilityId !== undefined) view.abilityId = cue.abilityId;
  if (cue.absorbed) view.absorbed = 1;
  if (cue.attackAnimationStarted) view.attackAnimationStarted = true;
  views.set(cue, view);
  return view;
}

/** The event presentation reads: a cue's damage view, anything else itself. */
export function presentedCombatEvent<E extends object>(ev: E): E {
  const typed = ev as { type?: unknown };
  return typed.type === 'attackCue' ? (damageViewOfAttackCue(ev as AttackCueEvent) as E) : ev;
}
