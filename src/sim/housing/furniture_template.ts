// Player housing (Project H): the placed-furniture entity's templateId shape,
// a pure leaf shared by the sim (housing/furniture_objects.ts spawns them),
// the renderer (src/render/house_furniture.ts mirrors them, nameplate_view.ts
// labels them) and the HUD, so the three never spell the prefix twice.

import { furnitureDefFor } from '../content/furniture';

export const FURNITURE_TEMPLATE_PREFIX = 'furniture_';

/** The templateId a placed copy of furniture item `itemId` carries. */
export function furnitureTemplateId(itemId: string): string {
  return `${FURNITURE_TEMPLATE_PREFIX}${itemId}`;
}

/** True for a placed-furniture entity's templateId. */
export function isFurnitureTemplateId(templateId: string | null | undefined): boolean {
  return typeof templateId === 'string' && templateId.startsWith(FURNITURE_TEMPLATE_PREFIX);
}

/** The furniture item id a placed-furniture templateId names, or null. */
export function furnitureItemOf(templateId: string | null | undefined): string | null {
  if (!isFurnitureTemplateId(templateId)) return null;
  const itemId = (templateId as string).slice(FURNITURE_TEMPLATE_PREFIX.length);
  return furnitureDefFor(itemId) ? itemId : null;
}
