// WYNDLEWOOD wildlife bodies (src/render/characters/wildlife_looks.ts): every
// model ships its file and its whole clip set on the skeleton it claims, the
// mapped templates draw it, and the fallbacks the wildlife does not own (the beast
// family, the Shadewolf form) keep their old bodies.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mobVisualKey, VISUALS } from '../src/render/characters/manifest';
import {
  WILDLIFE_CLIPS,
  WILDLIFE_LOOKS,
  WILDLIFE_MOB_KEYS,
  WILDLIFE_MODELS,
  wildlifeVisualKey,
} from '../src/render/characters/wildlife_looks';
import { MOBS } from '../src/sim/data';

const PUBLIC = resolve(__dirname, '../public');

/** The animation names and joint names in a GLB's JSON chunk. */
function glbFacts(path: string): { clips: string[]; joints: string[] } {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const nodes: { name?: string }[] = json.nodes ?? [];
  const joints = (json.skins?.[0]?.joints ?? []).map((i: number) => nodes[i]?.name ?? '');
  return { clips: (json.animations ?? []).map((a: { name: string }) => a.name), joints };
}

describe('wildlife looks', () => {
  it('every shipped model has its file and every clip the wildlife clip map names', () => {
    const wanted = new Set(
      [
        WILDLIFE_CLIPS.idle,
        WILDLIFE_CLIPS.walk,
        WILDLIFE_CLIPS.run,
        WILDLIFE_CLIPS.death,
        WILDLIFE_CLIPS.cast,
        ...WILDLIFE_CLIPS.attack,
        ...(WILDLIFE_CLIPS.hit ?? []),
      ].filter((c): c is string => !!c),
    );
    for (const [id, model] of Object.entries(WILDLIFE_MODELS)) {
      const path = resolve(PUBLIC, 'models/creatures', model.file);
      expect(existsSync(path), `${id}: ${model.file}`).toBe(true);
      const { clips, joints } = glbFacts(path);
      for (const clip of wanted) expect(clips, `${id} clip ${clip}`).toContain(clip);
      // Never a biped skeleton (the first painted wolf stood up).
      expect(joints.some((j) => /arm|hand|shoulder/i.test(j))).toBe(false);
      if (model.legs === 'four') {
        for (const bone of ['ForeUpper.L', 'ForeUpper.R', 'HindThigh.L', 'HindThigh.R']) {
          expect(joints, `${id} joint ${bone}`).toContain(bone);
        }
      } else {
        // Every found leg is rigged, on both sides (a missed cut once left a
        // spider with one leg pair and six legs welded to its body).
        for (const side of ['L', 'R']) {
          const legs = joints.filter((j) => new RegExp(`^Leg\\d+Upper\\.${side}$`).test(j));
          expect(legs.length, `${id} legs on ${side}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('merges every look into VISUALS under its model key', () => {
    for (const id of Object.keys(WILDLIFE_MODELS)) {
      const key = wildlifeVisualKey(id);
      expect(VISUALS[key]).toBe(WILDLIFE_LOOKS[key]);
    }
  });

  it('maps only real templates, each onto a shipped wildlife body', () => {
    for (const [templateId, key] of Object.entries(WILDLIFE_MOB_KEYS)) {
      expect(MOBS[templateId], templateId).toBeDefined();
      expect(WILDLIFE_LOOKS[key], `${templateId} -> ${key}`).toBeDefined();
      expect(mobVisualKey(templateId)).toBe(key);
    }
  });

  it('draws the open-world wildlife on the painted bodies', () => {
    expect(mobVisualKey('gloam_fox')).toBe(wildlifeVisualKey('fox'));
    expect(mobVisualKey('old_cragmaw')).toBe(wildlifeVisualKey('bear'));
    expect(mobVisualKey('webwood_spider')).toBe(wildlifeVisualKey('spider'));
    expect(mobVisualKey('shore_scuttler')).toBe(wildlifeVisualKey('crab'));
  });

  it('leaves the beast family fallback, the dungeon spiders and the Shadewolf form alone', () => {
    // A beast with no row of its own (a story branch's new mob, say) still draws.
    const unmappedBeast = Object.values(MOBS).find(
      (m) =>
        m.family === 'beast' && !(m.id in WILDLIFE_MOB_KEYS) && mobVisualKey(m.id) === 'mob_wolf',
    );
    expect(unmappedBeast).toBeDefined();
    expect(mobVisualKey('rimeweb_spinner')).toBe('mob_spider');
    expect(VISUALS.form_ghost_wolf.url).toBe('models/creatures/wolf_basic.glb');
  });
});
