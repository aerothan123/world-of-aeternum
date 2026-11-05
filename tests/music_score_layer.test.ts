import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceMusicController, type InstanceMusicInput } from '../src/game/instance_music';
import { MusicDirector } from '../src/game/music';
import {
  claimScoreStinger,
  playStinger,
  SCORE_RELEASE_AFTER_S,
  SCORE_RESIDENT_STREAMS,
  type ScoreTickInput,
  STINGER_DUCK,
  tickScore,
} from '../src/game/music_score_layer';
import { SCORE_TRACK_FILES } from '../src/game/music_score_tracks.generated';
import { ZONE_STREAM_URLS } from '../src/game/music_tracks';

// The Wyndlewood score layer (src/game/music_score_layer.ts) driving a real
// MusicDirector through its private stream plumbing. This also welds the layer's
// untyped host to music.ts's private names: ctx, master, zoneStreams, combatStreams,
// mixState(), makeStream() and setStreamTarget() (a rename there fails here).

class FakeParam {
  value = 0;
  setTargetAtTime = vi.fn((value: number) => {
    this.value = value;
  });
}
class FakeNode {
  connect = vi.fn(() => this);
  disconnect = vi.fn();
}
class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakeAudio {
  static instances: FakeAudio[] = [];
  loop = false;
  preload = '';
  paused = true;
  muted = false;
  currentTime = 0;
  private listeners: Record<string, (() => void)[]> = {};
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
  removeAttribute = vi.fn();
  addEventListener(type: string, fn: () => void): void {
    const list = this.listeners[type] ?? [];
    list.push(fn);
    this.listeners[type] = list;
  }
  end(): void {
    this.paused = true;
    for (const fn of this.listeners.ended ?? []) fn();
  }
  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
}
class FakeAudioContext {
  currentTime = 0;
  destination = new FakeNode();
  createGain = vi.fn(() => new FakeGain());
  createDynamicsCompressor = vi.fn(() => ({
    ...new FakeNode(),
    threshold: new FakeParam(),
    knee: new FakeParam(),
    ratio: new FakeParam(),
    attack: new FakeParam(),
    release: new FakeParam(),
  }));
  createMediaElementSource = vi.fn(() => new FakeNode());
  resume = vi.fn(async () => undefined);
}

interface Stream {
  url: string;
  el: FakeAudio | null;
  gain: FakeGain;
  target: number;
  silentAt: number;
}
interface Internals {
  ctx: FakeAudioContext;
  timer: number;
  zoneStreams: Record<string, Stream | undefined>;
  combatStreams: Stream[];
  streamKeeper(): void;
}
const I = (d: MusicDirector) => d as unknown as Internals;

const NOON = 0.5;
const MIDNIGHT = 0;

function tick(d: MusicDirector, over: Partial<ScoreTickInput> = {}): void {
  tickScore(d, {
    zone: 'vale',
    zoneId: 'eastbrook_vale',
    combat: false,
    paleAccord: false,
    instanceId: null,
    home: false,
    venue: null,
    dayPhase: NOON,
    signals: null,
    suspended: false,
    rand: () => 0,
    ...over,
  });
}

const need = (...keys: string[]) => {
  for (const k of keys) expect(SCORE_TRACK_FILES, `generated cue ${k}`).toHaveProperty(k);
};

describe('music_score_layer', () => {
  let d: MusicDirector;
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('window', { setInterval: vi.fn(() => 1) });
    d = new MusicDirector();
    d.init();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    FakeAudio.instances = [];
  });

  it('leaves an unticked director on its remastered streams', () => {
    d.update('vale', false);
    expect(I(d).zoneStreams.vale?.url).toBe(ZONE_STREAM_URLS.vale);
    expect(Object.keys(I(d).zoneStreams).some((k) => k.startsWith('score:'))).toBe(false);
  });

  it('replaces the zone stream with the region cue and crossfades to night', () => {
    need('wyn_region_eastbrook_vale_day', 'wyn_region_eastbrook_vale_night');
    d.update('vale', false);
    tick(d);
    const day = I(d).zoneStreams['score:wyn_region_eastbrook_vale_day'];
    expect(day?.url).toBe(SCORE_TRACK_FILES.wyn_region_eastbrook_vale_day.url);
    expect(day?.target).toBe(1);
    expect(I(d).zoneStreams.vale?.target ?? 0).toBe(0);
    tick(d, { dayPhase: MIDNIGHT });
    expect(day?.target).toBe(0);
    expect(I(d).zoneStreams['score:wyn_region_eastbrook_vale_night']?.target).toBe(1);
  });

  it('cuts to the battle layer in a fight and keeps the remastered battle themes silent', () => {
    need('wyn_combat_pastoral');
    d.update('vale', false);
    tick(d);
    d.update('vale', true);
    tick(d, { combat: true });
    expect(I(d).zoneStreams['score:combat:pastoral']?.target).toBe(1);
    expect(I(d).zoneStreams['score:wyn_region_eastbrook_vale_day']?.target).toBe(0);
    for (const s of I(d).combatStreams) expect(s.target).toBe(0);
  });

  it('rests in silence after a play-through, then plays again from the top', () => {
    need('wyn_region_eastbrook_vale_day');
    d.update('vale', false);
    tick(d);
    const key = 'score:wyn_region_eastbrook_vale_day';
    I(d).streamKeeper(); // creates the element for the audible stream
    tick(d);
    const stream = I(d).zoneStreams[key];
    expect(stream?.el).not.toBeNull();
    expect(stream?.el?.loop).toBe(false);
    if (!stream?.el) return;
    stream.el.currentTime = 99;
    stream.el.end();
    expect(stream.target).toBe(0);
    I(d).ctx.currentTime = 20; // inside the shortest region gap (rand 0: 45 s)
    tick(d);
    expect(stream.target).toBe(0);
    I(d).ctx.currentTime = 46;
    tick(d);
    expect(stream.target).toBe(1);
    expect(stream.el.currentTime).toBe(0);
  });

  it('keeps the battle layer looping (no gap)', () => {
    need('wyn_combat_pastoral');
    d.update('vale', true);
    tick(d, { combat: true });
    I(d).streamKeeper();
    tick(d, { combat: true });
    expect(I(d).zoneStreams['score:combat:pastoral']?.el?.loop).toBe(true);
  });

  it('bounds the resident score streams', () => {
    const regions: [Parameters<MusicDirector['update']>[0], string][] = [
      ['vale', 'eastbrook_vale'],
      ['marsh', 'mirefen_marsh'],
      ['peaks', 'thornpeak_heights'],
      ['frost', 'frostveil'],
      ['amber', 'amberfall'],
      ['fen', 'willowfen'],
      ['garden', 'evergarden'],
    ];
    let t = 0;
    for (const [zone, zoneId] of regions) {
      d.update(zone, false);
      tick(d, { zone, zoneId });
      t += SCORE_RELEASE_AFTER_S + 1;
      I(d).ctx.currentTime = t;
      tick(d, { zone, zoneId });
    }
    const score = Object.keys(I(d).zoneStreams).filter((k) => k.startsWith('score:'));
    expect(score.length).toBeLessThanOrEqual(SCORE_RESIDENT_STREAMS);
  });

  it('rings a sting for a level gained and ducks the score under it', () => {
    need('wyn_sting_level_up', 'wyn_region_eastbrook_vale_day');
    d.update('vale', false);
    const base = { level: 4, dead: false, questsDone: 2, deeds: 1, hasHouse: false };
    tick(d, { signals: base });
    const before = FakeAudio.instances.length;
    tick(d, { signals: { ...base, level: 5 } });
    const sting = FakeAudio.instances
      .slice(before)
      .find((a) => a.src.includes('wyn_sting_level_up'));
    expect(sting?.play).toHaveBeenCalled();
    const region = I(d).zoneStreams['score:wyn_region_eastbrook_vale_day'];
    expect(region?.gain.gain.value).toBeCloseTo(STINGER_DUCK);
    I(d).ctx.currentTime = SCORE_TRACK_FILES.wyn_sting_level_up.seconds + 1;
    tick(d, { signals: { ...base, level: 5 } });
    expect(region?.gain.gain.value).toBe(1);
  });

  it('never stings while the music is muted', () => {
    need('wyn_sting_death');
    d.setVolume(0);
    expect(playStinger(d, 'death')).toBe(false);
    d.setVolume(1);
    expect(playStinger(d, 'death')).toBe(true);
    // and never twice in a row
    expect(playStinger(d, 'death')).toBe(false);
  });

  it('lets the interface level-up chime stand down while the score sting rings', () => {
    need('wyn_sting_level_up');
    d.update('vale', false);
    const base = { level: 4, dead: false, questsDone: 2, deeds: 1, hasHouse: false };
    tick(d, { signals: base });
    tick(d, { signals: { ...base, level: 5 } });
    // the world diff rang it first: the facade's claim reports it sounding, no second copy
    const before = FakeAudio.instances.length;
    expect(claimScoreStinger('level_up')).toBe(true);
    expect(FakeAudio.instances.length).toBe(before);
    // muted, the score cannot ring it, so the facade keeps its own chime
    I(d).ctx.currentTime = 30;
    d.setVolume(0);
    expect(claimScoreStinger('level_up')).toBe(false);
  });

  it('switches on only on the HUD path (a day phase in the input)', () => {
    const controller = new InstanceMusicController(d);
    const input: InstanceMusicInput = {
      now: 0,
      lastCombatEventAt: -1e9,
      lastBossCombatEventAt: -1e9,
      inCombat: false,
      playerId: 1,
      playerPos: { x: 0, z: 0 },
      zone: {
        id: 'eastbrook_vale',
        biome: 'vale',
        hub: { x: 9999, z: 9999, radius: 1, name: 'Nowhere' },
      },
      inDungeon: false,
      entities: [],
      riftFloor: null,
    };
    controller.update(input);
    expect(Object.keys(I(d).zoneStreams).some((k) => k.startsWith('score:'))).toBe(false);
    controller.update({ ...input, dayPhase: NOON, scoreSignals: null });
    expect(Object.keys(I(d).zoneStreams).some((k) => k.startsWith('score:'))).toBe(true);
  });
});
