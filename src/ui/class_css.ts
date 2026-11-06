// Classic class colors (CLASSES[cls].color is a 0xRRGGBB number) as a CSS
// string, used to color-code party members on the minimap and in the frames.
import { CLASSES } from '../sim/data';

export const classCss = (cls: string): string =>
  `#${((CLASSES as Record<string, { color: number }>)[cls]?.color ?? 0x5fa8ff).toString(16).padStart(6, '0')}`;
