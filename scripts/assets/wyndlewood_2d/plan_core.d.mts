export const MAX_PROMPT: number;
export const STYLE: string;
export const FAMILY_STYLE: Record<string, string>;
export const NEGATIVE: string;
export function sheetPrompt(family: string, subjects: string[], grid: number): string;
export function planSheets(
  records: { family: string; group: string; file: string; id: string; subject: string }[],
  opts?: { grid?: number },
): { id: string; family: string; grid: number; cells: { index: number; file: string; id: string }[]; prompt: string }[];
export function wideSize(w: number, h: number): string;
export function widePrompt(subject: string): string;
