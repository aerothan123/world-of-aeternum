// The reference SimEvent-to-SFX router for the native client's parity suite: the composition
// of src/ui/hud.ts playEventSfx (and the personal arms of handleEvents) over the real pure
// cores in src/ui/combat_sfx.ts, with the HUD's per-session state passed in as inputs so
// every case is stateless. The Unreal port (WyndlewoodAudio WyndSfxRouter) must reproduce
// every play this emits. Gains and cooldowns are the HUD's literals (COMBAT_GAIN 1.0).

import { SFX_CLIPS } from '../../src/game/sfx_manifest.generated';
import {
  type Aura,
  CORPSE_HARVEST_CAST_ID,
  CRAFT_CAST_ID,
  DISENCHANT_CAST_ID,
  ENCHANT_CAST_ID,
  type Entity,
  FISHING_CAST_ID,
  GATHER_CAST_ID,
  SALVAGE_CAST_ID,
  type SimEvent,
  SUNDER_CAST_ID,
  TOOL_RECHARGE_CAST_ID,
} from '../../src/sim/types';
import {
  auraApplyCue,
  castCueForAbility,
  groundTickAbilityCue,
  healAudioPlan,
  impactCueForDamage,
  mobVoiceActionForDamage,
  mobVoiceCue,
  novaAbilityCue,
  nythraxisCalloutCue,
  playerSwingCueForDamage,
  playerVoiceCue,
  shouldPlayCombatImpactForTarget,
  shouldPlayCritSfxForTarget,
  shouldPlayMobVoiceSfxForEntity,
  spellFxCue,
  varkhulCalloutCue,
} from '../../src/ui/combat_sfx';
import { gatherRareTierFor } from '../../src/ui/hud/professions/gathering_view';

const hasCue = (k: string) => Object.hasOwn(SFX_CLIPS, k);
const CRAFT_FAMILY_CASTS = new Set<string>([
  CRAFT_CAST_ID,
  DISENCHANT_CAST_ID,
  ENCHANT_CAST_ID,
  SALVAGE_CAST_ID,
  SUNDER_CAST_ID,
  TOOL_RECHARGE_CAST_ID,
]);

export interface RefEntity {
  id: number;
  kind: 'player' | 'mob' | 'npc';
  templateId: string;
  dead?: boolean;
  hp?: number;
  female?: boolean;
  /** A druid form aura kind (form_bear / form_cat), or empty. */
  form?: string;
  auras?: Array<{ id: string; kind: string; name: string; value?: number }>;
}

/** One play: the key, where (an entity id, the player, a ground point or the UI), gain,
 *  cooldown, rate, and loop start/stop for cast loops. */
export interface RefPlay {
  key: string;
  at: 'entity' | 'player' | 'ground' | 'ui';
  entityId?: number;
  gain: number;
  cooldown?: number;
  rate?: number;
  loop?: 'start' | 'stop';
}

export interface RefState {
  playerId: number;
  /** Mobs already engaged (the HUD's mobAggroed set). */
  engaged: number[];
}

function asEntity(e: RefEntity | undefined): Entity | null {
  if (!e) return null;
  const auras = [...(e.auras ?? []).map((a) => ({ ...a, value: a.value ?? 0 }))];
  if (e.form) auras.push({ id: e.form, kind: e.form, name: e.form, value: 0 });
  return {
    id: e.id,
    kind: e.kind,
    templateId: e.templateId,
    dead: e.dead ?? false,
    hp: e.hp ?? 100,
    auras,
    pos: { x: 0, y: 0, z: 0 },
    modularAppearance: e.female ? { gender: 'female' } : null,
  } as unknown as Entity;
}

/** The plays one event makes (playEventSfx plus the HUD's personal audio arms). */
export function refRoute(ev: SimEvent, ents: RefEntity[], st: RefState): RefPlay[] {
  const out: RefPlay[] = [];
  const byId = (id: number | undefined) => asEntity(ents.find((e) => e.id === id));
  const engaged = new Set(st.engaged);
  const combat = (
    key: string | null | undefined,
    entityId: number,
    gain: number,
    cooldown?: number,
    rate?: number,
  ) => {
    if (key)
      out.push({
        key,
        at: 'entity',
        entityId,
        gain,
        ...(cooldown !== undefined ? { cooldown } : {}),
        ...(rate !== undefined ? { rate } : {}),
      });
  };
  const ui = (key: string) => out.push({ key, at: 'ui', gain: 1 });
  const engage = (mob: Entity): boolean => {
    if (engaged.has(mob.id)) return false;
    engaged.add(mob.id);
    const v = mobVoiceCue(mob.templateId, 'aggro', hasCue);
    if (v && shouldPlayMobVoiceSfxForEntity(mob)) combat(v, mob.id, 1);
    return true;
  };
  switch (ev.type) {
    case 'damage': {
      const tgt = byId(ev.targetId);
      if (!tgt) return out;
      const src = byId(ev.sourceId);
      const swing = playerSwingCueForDamage(ev, src);
      if (swing && src) combat(swing, src.id, 1, 0.08);
      if ((ev.absorbed ?? 0) > 0 || ev.kind === 'block') combat('combat_block', tgt.id, 0.55);
      if (
        ev.kind === 'miss' ||
        ev.kind === 'dodge' ||
        ev.kind === 'resist' ||
        ev.kind === 'evade'
      ) {
        combat('combat_dodge', tgt.id, 0.5);
        return out;
      }
      if (ev.kind === 'parry') {
        combat('combat_parry', tgt.id, 0.6);
        return out;
      }
      if (src?.kind === 'mob') {
        if (!engage(src)) {
          const v = mobVoiceCue(src.templateId, 'attack', hasCue);
          if (v && shouldPlayMobVoiceSfxForEntity(src)) combat(v, src.id, 1, 0.25);
        }
      }
      if (tgt.kind === 'mob' && !tgt.dead && tgt.hp > 0) engage(tgt);
      const impact = impactCueForDamage(ev, tgt);
      if (shouldPlayCombatImpactForTarget(tgt) && impact) combat(impact, tgt.id, 1, 0.05);
      if (ev.crit && shouldPlayCritSfxForTarget(tgt)) combat('combat_crit', tgt.id, 1);
      if (ev.crit && ev.targetId === st.playerId) {
        combat(playerVoiceCue(tgt.modularAppearance, 'hurt', hasCue), tgt.id, 1, 0.3);
      } else {
        const action = mobVoiceActionForDamage(ev, tgt);
        if (action && shouldPlayMobVoiceSfxForEntity(tgt)) {
          combat(mobVoiceCue(tgt.templateId, action, hasCue), tgt.id, 1, 0.1);
        }
      }
      return out;
    }
    case 'castStart': {
      if (ev.ability === 'chain_heal') {
        if (byId(ev.entityId)) combat('cast_chain_heal', ev.entityId, 1);
      } else {
        const key = castCueForAbility(ev.ability);
        if (key && byId(ev.entityId))
          out.push({ key, at: 'entity', entityId: ev.entityId, gain: 1, loop: 'start' });
      }
      // hud.ts handleEvents castStart: the profession casts' personal wind-up.
      if (ev.entityId === st.playerId) {
        const node = (ev as { gatherNodeType?: string }).gatherNodeType;
        if (ev.ability === GATHER_CAST_ID) ui(node ? `ui_gather_cast_${node}` : 'ui_gather_cast');
        else if (ev.ability === CORPSE_HARVEST_CAST_ID) ui('ui_gather_cast');
        else if (ev.ability === FISHING_CAST_ID) ui('ui_fish_cast');
        else if (CRAFT_FAMILY_CASTS.has(ev.ability)) ui('ui_craft_cast');
      }
      return out;
    }
    case 'castStop':
      out.push({ key: '', at: 'entity', entityId: ev.entityId, gain: 0, loop: 'stop' });
      return out;
    case 'varkhulCallout':
      if (byId(ev.sourceId)) combat(varkhulCalloutCue(ev.call), ev.sourceId, 0.9, 0.08);
      return out;
    case 'nythraxisCallout':
      if (byId(ev.sourceId)) combat(nythraxisCalloutCue(ev.call), ev.sourceId, 0.9, 0.08);
      return out;
    case 'spellfx': {
      if (ev.fx === 'temporalClock') {
        const s = byId(ev.sourceId) ?? byId(ev.targetId);
        if (s) combat('temporal_clock', s.id, 0.72);
        return out;
      }
      const cue = spellFxCue(ev);
      if (cue && byId(cue.anchorId)) combat(cue.key, cue.anchorId, 1);
      return out;
    }
    case 'spellfxAt': {
      if (ev.fx === 'meteorFall') return out;
      const ground = (key: string, gain: number, rate?: number) =>
        out.push({
          key,
          at: 'ground',
          gain,
          cooldown: 0.08,
          ...(rate !== undefined ? { rate } : {}),
        });
      if (ev.fx === 'tick') {
        const k = groundTickAbilityCue(ev.ability);
        if (k) ground(k, 1);
        return out;
      }
      if (ev.sfxKey) {
        ground(ev.sfxKey, 1);
        return out;
      }
      if (ev.fx !== 'nova') return out;
      const nova = novaAbilityCue(ev.ability);
      if (nova !== 'spell_nova') {
        ground(nova, 1);
        return out;
      }
      ground('spell_nova', 0.6);
      ground(`impact_${ev.school}`, 0.5, 0.8);
      return out;
    }
    case 'heal':
    case 'heal2': {
      if (!byId(ev.targetId)) return out;
      const plan = healAudioPlan(ev);
      if (plan) combat(plan.cue, ev.targetId, plan.gain, 0.1);
      return out;
    }
    case 'aura': {
      // playEventSfx: only your own buffs and debuffs; handleEvents: the Polymorph bleat on any.
      if (ev.targetId === st.playerId) {
        const target = byId(ev.targetId);
        const aura = ev.gained
          ? ((target?.auras.find((a) => a.name === ev.name) as Aura | undefined) ?? null)
          : null;
        const cue = auraApplyCue(ev, aura);
        if (cue) out.push({ key: cue, at: 'player', gain: 1, cooldown: 0.1 });
      }
      if (ev.name === 'Polymorph' && ev.gained) ui('ui_sheep');
      return out;
    }
    case 'death': {
      out.push({ key: '', at: 'entity', entityId: ev.entityId, gain: 0, loop: 'stop' });
      const ent = byId(ev.entityId);
      if (!ent) return out;
      if (ent.kind === 'mob') {
        const v = mobVoiceCue(ent.templateId, 'death', hasCue);
        if (v && shouldPlayMobVoiceSfxForEntity(ent)) combat(v, ent.id, 1);
      } else if (ent.kind === 'player' && ev.entityId !== st.playerId) {
        combat(playerVoiceCue(ent.modularAppearance, 'death', hasCue), ent.id, 1);
      }
      return out;
    }
    case 'gatherResult': {
      ui(`ui_gather_${ev.nodeType}`);
      const tier = gatherRareTierFor(ev.rarity, ev.rareEvent);
      if (tier) ui(`ui_gather_${tier}`);
      return out;
    }
  }
  return out;
}
