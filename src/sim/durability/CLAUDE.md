# src/sim/durability - gear durability and repair

Classic-era durability (Wyndlewood owner decision, 2026-11): a death to the world
costs every worn piece 10% of its maximum, combat wears gear a little, a broken
piece grants nothing, and armorers, weapon vendors and the forge masters at the
anvils repair for copper scaled by item level and quality.

- `durability_rules.ts`: pure leaf (no SimContext). Maxima by slot and quality,
  death and combat wear amounts, repair prices, the HUD state (`ok`/`low`/`broken`).
  Every tuning number lives here; the header states which are classic values and
  which are design targets.
- `durability.ts`: the system behind SimContext. Wear is PER COPY on the item's
  instance payload (`ItemInstancePayload.wear`, points lost), so it rides every
  existing transfer and save path and the owner's `einst`/`inv` mirrors; an
  undamaged copy carries no `wear` key. Combat counters are runtime-only on
  `Entity.durabilityWear`. Draws NO rng.
- Hooks: `combat/damage.ts` (hit taken, hit dealt, death), `entity.ts`
  `recalcPlayerStats` (a broken piece is skipped), `items.ts` `buyItem` (the
  `REPAIR_ALL_SERVICE_ID` vendor service). Pinned by `tests/durability.test.ts`.
