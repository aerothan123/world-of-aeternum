// Persistence for the realm-wide town restoration projects
// (src/sim/life_skills/town_projects.ts): one world_state row per realm under
// townProjectsStateKey(realm). Loaded at boot before the realm listens, saved
// on a cadence ONLY when the sim's project revision moved (the revision gate
// in server/CLAUDE.md "Hot paths": the job's cost scales with what changed,
// not with time), and once more at shutdown. The row is a handful of small
// counters per project, so it never grows beyond the project catalog; a row
// for a project this build does not know is carried through unchanged.

import {
  loadTownProjects,
  serializeTownProjects,
  townProjectsRev,
} from '../src/sim/life_skills/town_projects';

export const TOWN_PROJECTS_SAVE_MS = 30_000;

export function townProjectsStateKey(realm: string): string {
  return `town_projects:${realm}`;
}

export interface TownProjectsStoreIo {
  load(key: string): Promise<unknown | null>;
  save(key: string, data: unknown): Promise<void>;
}

export class TownProjectsStore {
  private savedRev = -1;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ctx: object,
    private readonly realm: string,
    private readonly io: TownProjectsStoreIo,
  ) {}

  async load(): Promise<void> {
    try {
      loadTownProjects(this.ctx, await this.io.load(townProjectsStateKey(this.realm)));
    } catch (err) {
      console.error('failed to load town projects:', err);
    }
    this.savedRev = townProjectsRev(this.ctx);
  }

  /** Write the row when the projects changed since the last write. */
  async saveIfChanged(): Promise<boolean> {
    const rev = townProjectsRev(this.ctx);
    if (rev === this.savedRev) return false;
    try {
      await this.io.save(townProjectsStateKey(this.realm), serializeTownProjects(this.ctx));
      this.savedRev = rev;
      return true;
    } catch (err) {
      console.error('failed to save town projects:', err);
      return false;
    }
  }

  start(intervalMs = TOWN_PROJECTS_SAVE_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.saveIfChanged(), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
