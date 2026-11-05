export const CHARACTER_NOTES: Record<string, [string, string]>;
export const BOSS_BRIEFS: Record<string, string>;
export function characterNotesFor(name: string | null | undefined): [string, string] | null;
export function voiceBrief(npc: {
  id: string;
  name?: string;
  title?: string;
  gender?: 'male' | 'female' | null;
}): string;
