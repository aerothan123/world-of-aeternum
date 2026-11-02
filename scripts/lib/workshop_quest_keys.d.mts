export const WORKSHOP_REASON: string;
export function workshopQuestKeyPrefixes(workshopQuestIds: readonly string[]): string[];
export function makeIsWorkshopQuestKey(
  workshopQuestIds: readonly string[],
): (key: string) => boolean;
