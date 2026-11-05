// The dedicated boss-fight loop's asset handling, lifted out of MusicDirector
// (music.ts sits at its monolith ceiling): which track a boss fight plays, the
// streamed <audio> element, the decoded fallback buffer and its source node.
// MusicDirector keeps the mix (the boss gain, the duck, the enable and menu
// gates) and asks this for the sound itself.
//
// A boss with a dedicated production of its own is a row in
// BOSS_TRACK_URLS; every other boss fight keeps the shared default loop.

import { scoreCueUrl } from './music_tracks';

/** The shared boss-fight loop every boss without its own track plays. The file is the
 *  Wyndlewood score's dungeon boss cue (wyn_boss_dungeon), built in place at this stable
 *  path so the decode fallback and its tests keep one URL. */
export const DEFAULT_BOSS_TRACK_URL = '/audio/dungeon-boss-fight.mp3';

/** Boss template id to the score cue its fight plays (music_score.ts cues): the risen
 *  dead, the old wild's great beasts, the raid's dragon, and the shared dungeon boss
 *  cue for knights and the drowned. Hydra heads share one encounter cue. */
export const BOSS_TRACK_CUES: Readonly<Record<string, string>> = Object.freeze({
  morthen: 'wyn_boss_undead',
  sexton_marrow: 'wyn_boss_undead',
  rimeweb: 'wyn_boss_wild',
  cantor_ilvane: 'wyn_boss_undead',
  crypt_knellwyrm: 'wyn_boss_undead',
  knight_commander_olen: 'wyn_boss_dungeon',
  gaoler_ossick: 'wyn_boss_undead',
  vael_the_mistcaller: 'wyn_boss_dungeon',
  korgath_the_bound: 'wyn_boss_wild',
  grand_necromancer_velkhar: 'wyn_boss_undead',
  korzul_the_gravewyrm: 'wyn_boss_raid_dragon',
  wildheart_beastmaster: 'wyn_boss_wild',
  the_gorgebloom: 'wyn_boss_wild',
  wildheart_high_priest: 'wyn_boss_wild',
  choirmother_selthe: 'wyn_boss_undead',
  mere_hydra_head_left: 'wyn_boss_dungeon',
  mere_hydra_head_center: 'wyn_boss_dungeon',
  mere_hydra_head_right: 'wyn_boss_dungeon',
  tideglass_colossus: 'wyn_boss_dungeon',
  ysolei: 'wyn_boss_dungeon',
});

/** Boss template id to its fight track URL (a cue not generated yet is left out, so
 *  that boss plays the shared default loop). */
export const BOSS_TRACK_URLS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(BOSS_TRACK_CUES)
      .map(([id, cue]) => [id, scoreCueUrl(cue)] as const)
      .filter((e): e is readonly [string, string] => e[1] !== null),
  ),
);

/** The fight track for a boss template, or null when it has none of its own. */
export function bossTrackFor(templateId: string): string | null {
  return Object.hasOwn(BOSS_TRACK_URLS, templateId) ? BOSS_TRACK_URLS[templateId] : null;
}

export class BossLoopTrack {
  private url = DEFAULT_BOSS_TRACK_URL;
  private el: HTMLAudioElement | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private loading = false;

  get currentUrl(): string {
    return this.url;
  }

  get hasBuffer(): boolean {
    return this.buffer !== null;
  }

  /** Take over the mix, then point the loop at the requested track. */
  retarget(
    url: string,
    streamsToPause: Iterable<{ el: HTMLAudioElement | null }> | null = null,
  ): void {
    if (streamsToPause) for (const stream of streamsToPause) stream.el?.pause();
    if (url === this.url) return;
    this.el?.pause();
    this.stopSource();
    this.el = null;
    this.buffer = null;
    this.url = url;
  }

  /** The streamed element for the current track (null where Audio is missing). */
  element(): HTMLAudioElement | null {
    if (this.el) return this.el;
    if (typeof Audio !== 'function') return null;
    const el = new Audio(this.url);
    el.loop = true;
    el.preload = 'auto';
    this.el = el;
    return el;
  }

  pause(): void {
    this.el?.pause();
  }

  /** Back to the top, for a fresh dungeon run. */
  rewind(): void {
    if (this.el) {
      try {
        this.el.currentTime = 0;
      } catch {
        /* browser may reject seeking before metadata */
      }
    }
    this.stopSource();
  }

  /** Fetch and decode the fallback buffer once; `ready` runs when it lands. */
  loadBuffer(ctx: AudioContext, ready: () => void): void {
    if (this.buffer || this.loading || typeof fetch !== 'function') return;
    this.loading = true;
    const url = this.url;
    void fetch(url)
      .then((res) => res.arrayBuffer())
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        this.loading = false;
        // A retarget while this was in flight keeps the newer track.
        if (url !== this.url) return;
        this.buffer = buffer;
        ready();
      })
      .catch(() => {
        this.loading = false;
      });
  }

  startSource(ctx: AudioContext, gain: GainNode): void {
    if (!this.buffer || this.source) return;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.connect(gain);
    src.start();
    this.source = src;
  }

  stopSource(): void {
    if (!this.source) return;
    try {
      this.source.stop();
    } catch {
      /* already stopped */
    }
    this.source.disconnect();
    this.source = null;
  }
}
