import type { SimEvent, Vec3 } from '../src/sim/types';
import { type EventAnchorEntities, eventInRange } from './event_delivery';

// The bystander attack cue: the events fan-out keeps every `damage` event to its
// participants (shouldDeliverCombatEventToViewer: the two sides and their
// parties), which is right for the combat log, the floating numbers and the
// meters, but it also starved the RENDERER, which keys the attacker's swing
// animation, the blade-contact hold and the per-ability impact VFX off that same
// event. Online, a player watching a stranger fight a training effigy next to
// them saw the model stand still. Offline the HUD hands the renderer every
// nearby damage event, so the two hosts disagreed.
//
// This module derives, from each damage event in a batch, the numberless
// `attackCue` SimEvent (src/sim/types.ts) a non-participant inside EVENT_RADIUS
// receives instead. It carries what the presentation reads (source, target,
// school, ability label and id, outcome kind, crit) and never the amount:
// `landed` says whether anything got through, `absorbed` whether a shield soaked
// some. A participant still gets the real event and never the cue, so nothing
// is delivered twice.
//
// Cost shape: the cue JSON is built and stringified at most ONCE per damage event
// per batch, lazily on the first bystander that needs it (a batch with no
// bystander in range stringifies nothing). Per-viewer work is the same anchor
// radius check the world events already pay. Bandwidth per cue is the fragment
// below (100 to 160 bytes, the widest shape carrying both a label and an
// ability id); recipients are the sessions whose anchor is
// within EVENT_RADIUS of the target and who did not get the damage event, so a
// fight nobody else is near costs zero extra bytes.

type DamageEvent = Extract<SimEvent, { type: 'damage' }>;
export type AttackCueEvent = Extract<SimEvent, { type: 'attackCue' }>;

/** The numberless cue a bystander receives for a damage event. */
export function attackCueForDamage(ev: DamageEvent): AttackCueEvent {
  const cue: AttackCueEvent = {
    type: 'attackCue',
    sourceId: ev.sourceId,
    targetId: ev.targetId,
    school: ev.school,
    ability: ev.ability,
    kind: ev.kind,
    crit: ev.crit,
    landed: ev.amount > 0,
  };
  if (ev.abilityId !== undefined) cue.abilityId = ev.abilityId;
  if ((ev.absorbed ?? 0) > 0) cue.absorbed = true;
  if (ev.attackAnimationStarted) cue.attackAnimationStarted = true;
  return cue;
}

/**
 * Per-batch, serialize-once cue fragments, index-aligned with the routable
 * events exactly like event_frame.ts's damage fragments.
 */
export class AttackCueFragments {
  private fragments: (string | undefined)[] | null = null;

  constructor(
    private readonly events: readonly SimEvent[],
    private readonly entities: EventAnchorEntities,
    private readonly radius: number,
  ) {}

  /**
   * Append the cue for routable event `i` to a bystander's frame when the event
   * is a damage event anchored within `radius` of `viewerPos`; otherwise nothing.
   * Call it only for an event shouldDeliverEventToViewer refused for this viewer.
   */
  pushForBystander(i: number, viewerPos: Vec3, into: string[]): void {
    const ev = this.events[i];
    if (ev.type !== 'damage') return;
    if (!eventInRange(ev, this.entities, viewerPos, this.radius)) return;
    if (this.fragments === null) this.fragments = new Array<string | undefined>(this.events.length);
    let fragment = this.fragments[i];
    if (fragment === undefined) {
      fragment = JSON.stringify(attackCueForDamage(ev));
      this.fragments[i] = fragment;
    }
    into.push(fragment);
  }
}
