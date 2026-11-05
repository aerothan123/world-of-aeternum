# Wyndlewood: The Last Keep and Dawnhold Castle as real instances

Status: encounter design for the dungeon crew. It turns two story walks into
five-player dungeons that fill the gap between 13 and 18, where no group
content exists today:
- **The Last Keep:** levels 14 to 16 (bible Chapter Four).
- **Dawnhold Castle:** levels 16 to 18 (bible Chapter Five).

## What exists today
- `the_last_keep` and `dawnhold_castle` are `DungeonDef` rows in
  `src/sim/content/dungeons.ts`. Both have `suggestedPlayers: 1`, empty
  `spawns`, one keepsake object each (`last_keep_signet`, `dawnhold_posy`),
  and authored interiors (`lastkeep`, `dawnhold`;
  `src/sim/dawnhold_layout.ts`, `src/sim/forgefather_fortress.ts`).
- Both are deliberately left out of `FINDER_ACTIVITIES`
  (`src/sim/content/dungeon_finder.ts`), because they are walks, with no
  fights and no loot.
- **Placement mismatch.** The Last Keep's door is on the temple court, and
  its leave text says "the Drakelands wind". Dawnhold is the Evergarden's
  garden keep. The bible puts the Keep in Thornpeak Heights and Dawnhold in
  the Veiled Hollow. Ask the world crew to move both doors (the
  `doorPos` and `staticDoor` facades) to their bible regions during the map
  build-out. The interiors can stay as authored.

## Rules every encounter here follows
- **Mechanics come from the shipped primitive catalog**
  (`docs/prd/dungeon-mechanic-primitives.md`), numbered as there:
  - P1: stacking debuff;
  - P2: ground pool;
  - P3: frontal cone;
  - P4: stack or split;
  - P5: fixate;
  - P6: berserk timer;
  - P7: knockback;
  - P8: interruptible cast;
  - P9: kill-order adds.
  Plus the existing mob affix fields: `cleave`, `mortalStrike`, `aoePulse`,
  `summonAdds`, `enrage`, `stomp`, `deathThroes`.
- **Numbers are set by the shipped method, not invented.**
  - Mob stats copy the shipped template for the same level and role. For
    the Keep, start from Sunken Bastion trash raised to its band. For
    Dawnhold, start from Drowned Temple trash.
  - Ability damage is written as a share of a band cloth-wearer's health,
    the way `dungeons.ts` comments do (for example "2 to 3 percent of a level
    13 cloth wearer's 430").
  - The share bands below are targets. The encounter crew measures them with
    the probes.
- **Normal mode teaches, heroic adds one primitive per boss.** This is the
  doc's difficulty ladder.
- **No skipping.** Packs are gated, and an early boss pull wakes everything
  left alive (`instances/boss_chain_pull.ts`). Arrival is clear of the first
  pack (`dungeon_entry_clearance` test).
- Packs have 2 to 4 mobs, spaced beyond social-aggro range. This follows the
  shipped crypt pacing.
- **Loot** follows `docs/design/instance-loot-budgets.md`: one item per five
  intended players per boss kill.
  - Item level = source level + quality bump (`QUALITY_ILVL_BONUS`).
  - Heroic uses the shipped heroic variant path
    (`HEROIC_VARIANT_SOURCE_LEVEL`, `content/heroic_variants.ts`).
- Every new proper noun gets the naming check. Boss names below are
  descriptive working names. The bible's Garrick Vellthorn clashes with the
  shipped Garrick Holt (decisions file, item 4), so he appears here as **the
  Royal Forgemaster** until renamed.

---

## 1. The Last Keep (levels 14 to 16, five players)

Story: a ruined mountain fortress that holds the kingdom's surviving
records. The Royal Forgemaster tries to burn the forge plans before the
player can recover them. Strange metal with a will of its own animates the
tools.

### Trash
| Pack | Role | Mechanic | Notes |
|---|---|---|---|
| Keep Revenant Guards (2 to 3) | Melee | `cleave` | The keep's dead garrison |
| Archive Wisps (2) | Caster | P8 Erasure: a 2 s interruptible bolt; an unkicked cast leaves a small P2 ember patch | Teaches the interrupt before boss 2 |
| Animated Tools (swarm of 4, low health) | Melee | `deathThroes` small sparks on death | Chapter Four's "tools move without being touched" |
| Pale Accord Saboteurs (2) | Rogue | Opener plus `mortalStrike` | The Accord is here for the plans too |

### Bosses
1. **The Gate Warden** (iron construct, miniboss).
   - P3 Hammerfall: a telegraphed 90 degree, 10 yd frontal every 10 s.
   - P7 Bulwark Shove: a knockback away from the gate.
   - Heroic adds P1 Rivet: every third melee stacks damage taken on the
     tank.
2. **The Archivist's Echo** (miniboss).
   - The boss channels P8 Burn the Record. Each finished channel ignites a
     P2 fire under a random player.
   - Three record lecterns are counter-play objects. A player carries a
     scroll from a burning shelf to a lectern to stop one fire wave.
   - Heroic adds P9: two Archive Wisps join at 50%.
3. **The Willful Forge** (living anvil).
   - P1 Tempering: stacks on the tank, so swap tanks or use cooldowns.
   - P2 Molten Spill pools.
   - `summonAdds`: Animated Tools every 20 s, which must die first (P9) or
     they empower the forge.
   - Heroic adds P5 Seeking Ingot: fixates a random player for 6 s.
4. **The Royal Forgemaster** (final boss).
   - Phase 1: P1 Sunder on the tank, and P3 Forge Breath.
   - At 60%: he sets the archive alight. This starts P6, a 4 min burn timer,
     the gear and execution check.
   - P4 Plans Torn in Two: two marks that must split by at least 8 yd.
   - At 30%: `summonAdds` of two Gate Warden fragments.
   - On defeat, the forge plans drop as a quest item for the Chapter Four
     chain.
   - Heroic adds P7 Shockwave toward the burning shelves.

### Loot (normal)
- Source level is the boss level: 15 for minibosses and 16 for the final
  boss.
- Rares are item level 18 to 19. Uncommons from trash are around 16 to 17.
- Slot spread across the four bosses: one weapon per boss, and the armor
  types rotate so every class has a piece. Finale: a two-hander, a caster
  staff, and a plate chest.
- **Finale gold:** a 5,500 copper base, between the Sunken Bastion (5,000)
  and the Drowned Temple (6,000) in `docs/design/dungeon-gold.md`.
- **Heroic (level 20, daily lockout):** the shipped heroic variant ladder,
  with a 100,000 copper finale like every heroic five-player dungeon.
- Recipes: one rare pattern per run, in the boss 3 table (a Hearthwright
  forge furniture piece or a smithing pattern).

---

## 2. Dawnhold Castle (levels 16 to 18, five players)

Story: a castle caught inside the Veiled Hollow's distorted time. Festivals
repeat and memories overlap. Lady Eshmara Veilthorn keeps her people in a
loop to protect them. The player breaks the magic so they can choose their
own future (bible Chapter Five).

### Trash
| Pack | Role | Mechanic | Notes |
|---|---|---|---|
| Courtiers Who Remember (3) | Caster | A short incapacitate (uses shipped incapacitate DR) | Charmed by the loop |
| Garden Wardens (2) | Melee, slow | `stomp` | Gardens bloom out of season |
| Echo Knights (2) | Melee | `deathThroes` splits into two half-health echoes | Teaches cleave and AoE timing |
| Hour Wisps (4, low health) | Caster | P8 Rewind: heals an ally to its health of 5 s ago; interrupt it | Time behaves strangely |

### Bosses
1. **The Festival That Repeats** (wave miniboss).
   - Three waves of revelers loop.
   - Each loop adds a raid-wide stack of P1 Recurrence, which lowers damage
     dealt.
   - Between waves, three garden bells (counter-play objects) must be rung
     to break the loop.
   - Heroic adds a fourth wave, and the bells move.
2. **The Gardener Out of Season**.
   - P2 Bloom pools heal enemies standing in them. Tanks drag the boss out
     (the Ichor Pool affix shape).
   - P3 Thorn Sweep frontal.
   - Heroic adds P9: seedlings that become Garden Wardens if they live
     20 s.
3. **The Mirror Court**.
   - The boss splits into three reflections. Only the one with a real cast
     bar is the boss (P8 Court Decree).
   - A hit on a false reflection adds a stacking shield to the real one.
   - Heroic adds P4 Shared Memory: two marks that must stack.
4. **Lady Eshmara Veilthorn** (final boss).
   - Phase 1: P4 Shared Memory, and P5 A Familiar Face (fixate and kite).
   - At 50%: the barrier crumbles. The arena ring shrinks (the shipped
     ring-gap geometry, `src/sim/boss_ring_gap.ts`), which is the P6 timer.
   - At 10%: she yields. A scripted end on the shipped walk primitive
     (`encounters/scripted_walk.ts`), so the bible's choice that she
     survives stands.
   - Loot comes from the barrier chest (`docs/design/reward-chest`).
   - Heroic adds P7 Time Slip, a knockback toward the shrinking edge.

### Loot (normal)
- Source level is 17 for the minibosses and 18 for Eshmara. Rares are item
  level 20 to 21.
- Slots: jewelry and caster pieces lean here, so the Keep's melee-leaning
  table balances out.
- **Finale gold:** a 6,500 copper base, between the Drowned Temple (6,000)
  and the Gravewyrm Sanctum (15,000).
- **Heroic:** as for the Keep.
- Cosmetic only: a rare Dawnhold Garden Posy furniture piece. The keepsake
  item id already exists; give it a placeable furniture twin.

---

## 3. Wiring checklist (both dungeons)
| Item | Where |
|---|---|
| Real spawns and `suggestedPlayers: 5` | `src/sim/content/dungeons.ts` |
| Encounter drivers | `src/sim/encounters/the_last_keep/`, `src/sim/encounters/dawnhold_castle/`, the same shape as `encounters/sunken_bastion/` |
| Finder rows: `the_last_keep_normal` (14 to 16), `dawnhold_castle_normal` (16 to 18), and both heroics (20, daily lockout) | `src/sim/content/dungeon_finder.ts` |
| Encounter guide entries | `src/sim/content/dungeon_guides.ts` |
| Finale gold rows | `src/sim/content/dungeon_difficulty.ts`, pinned by `tests/heroic_finale_gold.test.ts` |
| Book of Deeds: clear, heroic clear, one mechanic deed each (for example "every record saved", "no bell rung twice") | `src/sim/content/deeds.ts`, following the `dgn_sunken_bastion` pattern |
| Reliquary: conquerors pages for normal and heroic | `src/sim/content/reliquary.ts`, following `conquerors_sunken_bastion` |
| Item art for every new item id, and non-Latin fills for wordy names | Per root `CLAUDE.md` content obligations |
| Wiki regeneration | `npm run wiki:content` |
| Quest hooks: a Chapter Four chain into the Keep (the forge plans), a Chapter Five chain into Dawnhold | The story crew |
| Door relocation to Thornpeak and the Veiled Hollow | The world crew |
| Content review | Dispatch `content-obligations-reviewer` on the diff |
