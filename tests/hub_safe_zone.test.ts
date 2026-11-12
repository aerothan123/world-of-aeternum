import { describe, expect, it } from 'vitest';
import { campSpawnOffset } from '../src/sim/camp_scatter';
import { isBlocked } from '../src/sim/colliders';
import { HOUSE_LOTS } from '../src/sim/content/house_lots';
import {
  HUB_PRACTICE_DUMMY_CAMPS,
  PRACTICE_DUMMY_CAMPS,
} from '../src/sim/content/practice_dummies';
import { CAMPS, NPCS, ZONES, zoneAt } from '../src/sim/data';
import { ebv2Site } from '../src/sim/eastbrook_v2/sites';
import type { CampDef } from '../src/sim/types';
import { groundHeight, waterLevel, waterLevelAt } from '../src/sim/world';

// Hub safe zones (owner, 2026-11). A town is somewhere a player stands still:
// reading quests, trading, decorating a house. No hostile camp may reach into it.
//
// The rule, measured from each camp's WHOLE scatter disc (centre plus radius):
// - every hub: the disc stays SAFE_MARGIN yd beyond the town edge, where the town
//   edge is the zone's declared hub circle (hub.radius);
// - Eastbrook (the starter town, fixed in this pass): additionally OUTSKIRT_CLEARANCE
//   yd clear of every house-lot door and every placed NPC in the vale (quest
//   givers, trainers, vendors, the scout's post), because the town and its housing
//   quarter spread well past the 26 yd hub circle.
//
// 60 yd is the low end of the owner's 60 to 80 yd brief: a mob's aggro radius is
// 9 to 13 yd and a leash run is far longer, so 60 keeps a pull from ever dragging
// into town while still leaving the small starter island room for its camps. The
// outskirt bubble is 25 yd (twice a starter aggro radius), the largest value the
// vale's existing camps could be packed around without deleting a population.
const SAFE_MARGIN = 60;
const OUTSKIRT_CLEARANCE = 25;
const SEED = 20061;

// Practice targets live in town on purpose and never aggro.
const PRACTICE_IDS = new Set(
  [...PRACTICE_DUMMY_CAMPS, ...HUB_PRACTICE_DUMMY_CAMPS].map((c) => c.mobId),
);
const isPractice = (mobId: string) => PRACTICE_IDS.has(mobId) || mobId.startsWith('training_');

const hubs = ZONES.filter((z) => z.hub).map((z) => ({ zoneId: z.id, ...z.hub! }));
const hubGap = (c: CampDef, h: (typeof hubs)[number]) =>
  Math.hypot(c.center.x - h.x, c.center.z - h.z) - c.radius - h.radius;
const key = (h: (typeof hubs)[number], c: CampDef) =>
  `${h.name}|${c.mobId}@${c.center.x},${c.center.z}`;

// Other zones' camps that already breach their hub's safe zone. Out of scope for
// the Eastbrook phase and pinned here so the list can only SHRINK: a camp fixed
// later must be removed from this list, and a new breach fails outright.
const KNOWN_OTHER_HUB_BREACHES = [
  'Fenbridge|mire_prowler@-40,230',
  'Fenbridge|mire_prowler@35,225',
  'Fenbridge|deepfen_murloc@-82,273',
  'Fenbridge|mire_widow@70,300',
  'Fenbridge|mire_widow@95,340',
  'Fenbridge|spider_egg@70,300',
  'Fenbridge|spider_egg@95,340',
  'Highwatch|ridge_stalker@-50,590',
  'Highwatch|ridge_stalker@45,600',
  'Highwatch|deeprock_kobold@75,625',
  'Highwatch|thornpeak_ogre@-90,700',
  'Highwatch|thornpeak_ogre@-60,730',
  'Eldershine|veiled_stag@12,1118',
  'Icemantle|snowdrift_wolf@20,1610',
  'Lanternmere|gilded_stag@-420,2020',
  'Lanternmere|gloam_fox@-330,2030',
  'Bridgemere|bogtoad@-284,316',
  'Bridgemere|willow_sprite@-396,376',
  'Bridgemere|willow_sprite@-316,380',
  'Moonrest|moonfleece_grazer@-436,1466',
  'Moonrest|moonfleece_grazer@-320,1446',
  'Drifthaven|tide_scuttler@-252,840',
  'Wickharbor|wreck_thief@444,438',
  'Bridgemere|bogtoad@-334,436',
  'Bridgemere|bogtoad@-406,288',
  'Wickharbor|shoal_scuttler@410,400',
  'Hedgewick|hedge_knight@306,872',
  'Dawnrest Camp|bristlejaw_shore_rat@-312.4,64.6',
  'Fellgate|thornpeak_ogre@-1279,26.5',
  'Wheal Patience|tinmoor_stalker@-695.5,-986',
];

// The camps this pass moved (2026-11), each re-checked for spawnable ground.
const RELOCATED = [
  'forest_wolf@-22,16',
  'wild_boar@116,-74',
  'wild_boar@107,142',
  'mogger@140,-48',
  'webwood_spider@-82,10',
  'vale_bandit@79,25',
  'vale_bandit@117,44',
  'gorrak@120,47',
  'restless_bones@84,89',
  'gravestirred_fieldhand@77,-125',
  'briarbitten_fox@-30,82',
  'orchard_boar@71,-143',
  'veiled_rite_tender@107,-41',
  'culvert_rat@-109,-98',
];
// Eastbrook Vale v2: a pinned camp whose slots left usable ground on the design
// stands on its site now (eastbrook_v2/sites.ts `camp:<mobId>@<x>,<z>`, keyed by
// the authored spot above), and is checked there.
const RELOCATED_LIVE = RELOCATED.map((k) => {
  const s = ebv2Site(`camp:${k}`);
  return s ? `${k.slice(0, k.indexOf('@'))}@${s.x},${s.z}` : k;
});

const inVale = (x: number, z: number) => zoneAt(x, z)?.id === 'eastbrook_vale';
const valeCamps = CAMPS.filter((c) => !isPractice(c.mobId) && inVale(c.center.x, c.center.z));

// Town anchors for the outskirt bubble. Dynamic NPCs (a world quest's moving
// sentries) and the origin placeholders the sim repositions at runtime (spirit
// healers, raid and instance staff) are not standing in the vale.
const valeAnchors = [
  ...HOUSE_LOTS.filter((l) => l.zoneId === 'eastbrook_vale').map((l) => ({
    id: `lot:${l.id}`,
    ...l.doorPos,
  })),
  ...Object.values(NPCS)
    .filter((n) => !n.dynamic && (n.pos.x !== 0 || n.pos.z !== 0) && inVale(n.pos.x, n.pos.z))
    .map((n) => ({ id: `npc:${n.id}`, x: n.pos.x, z: n.pos.z })),
];

describe('hub safe zones', () => {
  it('measures a real roster: hubs, vale camps and vale anchors are all present', () => {
    expect(hubs.length).toBeGreaterThan(10);
    expect(hubs.some((h) => h.name === 'Eastbrook')).toBe(true);
    expect(valeCamps.length).toBeGreaterThan(15);
    expect(valeAnchors.some((a) => a.id === 'lot:eastbrook_corner_house')).toBe(true);
    expect(valeAnchors.some((a) => a.id === 'npc:scout_neris')).toBe(true);
  });

  it('keeps every hostile camp disc 60 yd beyond the Eastbrook town edge', () => {
    const eastbrook = hubs.find((h) => h.name === 'Eastbrook')!;
    for (const camp of CAMPS) {
      if (isPractice(camp.mobId)) continue;
      expect(hubGap(camp, eastbrook), key(eastbrook, camp)).toBeGreaterThanOrEqual(SAFE_MARGIN);
    }
  });

  it('keeps every vale camp clear of house lots and placed NPCs', () => {
    for (const camp of valeCamps) {
      for (const a of valeAnchors) {
        const gap = Math.hypot(camp.center.x - a.x, camp.center.z - a.z) - camp.radius;
        expect(
          gap,
          `${camp.mobId}@(${camp.center.x},${camp.center.z}) vs ${a.id}`,
        ).toBeGreaterThanOrEqual(OUTSKIRT_CLEARANCE);
      }
    }
  });

  it('holds every other hub to the same margin, apart from the pinned known breaches', () => {
    const breaches: string[] = [];
    for (const camp of CAMPS) {
      if (isPractice(camp.mobId)) continue;
      for (const h of hubs) if (hubGap(camp, h) < SAFE_MARGIN) breaches.push(key(h, camp));
    }
    expect(breaches.filter((b) => b.startsWith('Eastbrook|'))).toEqual([]);
    expect(breaches.sort()).toEqual([...KNOWN_OTHER_HUB_BREACHES].sort());
  });

  it('puts every relocated vale camp slot on ground a mob can spawn on', () => {
    const relocated = valeCamps.filter((c) =>
      RELOCATED_LIVE.includes(`${c.mobId}@${c.center.x},${c.center.z}`),
    );
    expect(relocated.length, 'every relocated camp is still placed where pinned').toBe(
      RELOCATED.length,
    );
    for (const camp of relocated) {
      for (let i = 0; i < camp.count; i++) {
        const o = campSpawnOffset(i, camp.count, camp.radius, 0, 0);
        const x = camp.center.x + o.x;
        const z = camp.center.z + o.z;
        const h = groundHeight(x, z, SEED);
        const where = `${camp.mobId} slot ${i} at (${x.toFixed(1)}, ${z.toFixed(1)})`;
        expect(h, `${where} is under the sea`).toBeGreaterThanOrEqual(waterLevel() + 0.4);
        const lake = waterLevelAt(x, z, SEED);
        if (lake !== -Infinity)
          expect(h, `${where} is in a lake`).toBeGreaterThanOrEqual(lake + 0.4);
        expect(isBlocked(SEED, x, z, 0.5), `${where} is inside a collider`).toBe(false);
      }
    }
  });
});
