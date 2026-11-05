// The zone slice of the English entity table (src/ui/world_entity_i18n.ts
// ZoneTranslations) must admit every zone appended to ZONES, not only the
// literal ZONE_IDS list. The frontier rows on feature/world-expansion were the
// regression: makeEnglishWorldEntities() emitted their rows, so the generated
// locale tables carried them, and each `<locale>: EnTranslations` literal then
// failed tsc with '"applewold" does not exist in type ZoneTranslations'.
//
// The type half of this pin is the `extraZone` literal below: if the index
// signature is ever dropped, the excess-property check fails `tsc --noEmit`
// (the pre-push floor and CI), exactly as the generated tables did.
import { describe, expect, it } from 'vitest';
import { ZONES } from '../src/sim/data';
import type { EnTranslations } from '../src/ui/i18n.catalog';
import { worldEntityText } from '../src/ui/world_entity_i18n';

type ZoneSlice = EnTranslations['entities']['zones'];

describe('zone translations shape', () => {
  it('admits a zone id that is not in the literal ZONE_IDS list', () => {
    const shipped = worldEntityText.en.entities.zones;
    const extraZone: ZoneSlice = {
      ...shipped,
      frontier_zone_from_a_future_row: {
        name: 'A Future Row',
        welcome: 'Welcome.',
        pois: { 0: { label: 'Camp' } },
      },
    };
    expect(extraZone.frontier_zone_from_a_future_row?.name).toBe('A Future Row');
  });

  it('emits an English row for every zone in ZONES', () => {
    const zones = worldEntityText.en.entities.zones;
    const missing = ZONES.map((zone) => zone.id).filter(
      (id) => !Object.hasOwn(zones, id) || typeof zones[id]?.name !== 'string',
    );
    expect(missing).toEqual([]);
  });
});
