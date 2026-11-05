// Wyndlewood's voice cast (scripts/voices/wyndlewood_voice_cast.mjs and the generated cast
// table): every brief is an original description in plain words, the named cast read their
// own notes, and every speaking NPC holds one distinct designed voice.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BOSS_BRIEFS,
  CHARACTER_NOTES,
  characterNotesFor,
  voiceBrief,
} from '../scripts/voices/wyndlewood_voice_cast.mjs';
import { VOICE_LINES } from '../src/game/voice_manifest.generated';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const castPath = path.join(root, 'scripts/voices/wyndlewood_voice_cast.json');

describe('voice briefs', () => {
  it('reads the named cast from their own notes and everyone else from their role', () => {
    expect(characterNotesFor('Captain Fenlow Tippet')).toBe(CHARACTER_NOTES.Fenlow);
    expect(characterNotesFor('Nobody Inparticular')).toBeNull();
    const fenlow = voiceBrief({
      id: 'c1_fenlow',
      name: 'Captain Fenlow Tippet',
      title: 'Ferry Captain',
      gender: 'male',
    });
    expect(fenlow.startsWith('A man in his late fifties: a gruff, wry ferry captain')).toBe(true);
    const smith = voiceBrief({
      id: 'some_smith',
      name: 'Hadda Vane',
      title: 'Blacksmith',
      gender: 'female',
    });
    expect(smith).toMatch(
      /^A woman in their (thirties|forties|fifties): a blacksmith, practical, blunt and hardworking/,
    );
    expect(voiceBrief({ id: 'ignivar' })).toBe(BOSS_BRIEFS.ignivar);
  });

  it('is stable for the same NPC and plain text throughout', () => {
    const npc = {
      id: 'quay_hand',
      name: 'Lessa Quay',
      title: 'Harbour Hand',
      gender: 'female' as const,
    };
    expect(voiceBrief(npc)).toBe(voiceBrief(npc));
    for (const brief of [voiceBrief(npc), ...Object.values(BOSS_BRIEFS)]) {
      expect(brief).not.toMatch(/[–—]/);
      expect(brief.length).toBeGreaterThan(20);
      expect(brief.length).toBeLessThanOrEqual(1000);
    }
  });
});

describe('the committed voice cast', () => {
  it('gives every voiced NPC one distinct designed voice', () => {
    if (!existsSync(castPath)) return;
    const cast: Record<string, { voice_id: string; brief: string }> = JSON.parse(
      readFileSync(castPath, 'utf8'),
    );
    const ids = Object.values(cast).map((c) => c.voice_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [npc, entry] of Object.entries(cast)) {
      expect(entry.voice_id, npc).toMatch(/^[A-Za-z0-9]{10,}$/);
      expect(entry.brief, npc).not.toMatch(/[–—]/);
    }
    for (const url of Object.values(VOICE_LINES)) {
      const speaker = url.split('/')[3];
      expect(cast[speaker], `${speaker} speaks without a cast voice`).toBeDefined();
    }
  });
});
