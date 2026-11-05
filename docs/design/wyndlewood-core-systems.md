# Wyndlewood: core systems (feature/core-systems)

What the systems crew implemented from the owner decisions of 2026-11, where
each lives, and the decisions recorded without code. Companion to
`docs/design/wyndlewood-game-plan.md` (on `docs/wyndlewood-game-design`).

## Implemented

| Decision | Where | Pinned by |
|---|---|---|
| About 30 hours to the cap: quest XP is a share of the quest level's bar (one-time 10%, repeatable 4%), with the classic out-level reduction | `src/sim/quests/quest_xp.ts` | `tests/quest_xp.test.ts`, `tests/progression.test.ts` |
| One house per account: a lossless boot merge into the most-furnished house, an audit row per released house, and a join-time holder so a second purchase is refused | `server/account_house_merge.ts`, `server/account_house_migration.ts`, `src/sim/housing/ownership.ts` | `tests/account_house_merge.test.ts`, `tests/server/account_house_migration.test.ts` |
| Classic durability and repair: 10% on a death to the world, small deterministic combat wear, broken gear gives no stats, Repair All at armorers, weaponsmiths and the forge masters, a HUD armor figure and a tooltip line | `src/sim/durability/`, `src/ui/hud/durability/` | `tests/durability.test.ts`, `tests/durability_indicator.test.ts` |
| Membership off for Early Access behind a switch (default off); code and stored data kept | `src/early_access_flags.ts`, `server/early_access_flags.ts` | `tests/early_access_flags.test.ts` |
| Crypto out of the Steam build: no shipped code imports a wallet or token (retired upstream); the Claudium store and its routes are off behind the same switch. Removing the dormant wallet packages and the store outright is the next step (below) | `src/early_access_flags.ts`, `server/claudium.ts` | `tests/early_access_flags.test.ts` |
| Life skills as a path to the cap at about 1.5x questing: bar-share gather and craft XP with anti-bot fatigue on trivial content, work-order standing, Eastbrook town restoration projects | `src/sim/life_skills/`, `src/sim/professions/profession_xp.ts`, `src/sim/content/town_projects.ts` | `tests/life_skills.test.ts`, `tests/profession_xp.test.ts` |
| First mount at level 10: Apprentice Riding (+40%, 2 gold, plus the stable horse), the level 20 ranks unchanged | `src/sim/riding_training.ts`, `src/sim/mounts_training.ts` | `tests/riding_apprentice.test.ts` |
| Mage Chronomancy is a healer specialization, so the Dungeon Finder lists mages as healers | `src/sim/content/dungeon_finder.ts` | `tests/dungeon_finder.test.ts` |

## Recorded, no code

- **PvP stays opt-in at launch.** Open-world PvP remains behind the shipped
  opt-in flag; no zone forces it. An arena and a dedicated PvP zone are
  planned for a later chapter, not the Early Access launch.

## Next: remove the store and the wallet packages outright

Steam bans blockchain games, so the switch is not the end state. The removal
is staged because two costs ride it:
- Dropping `@reown/*`, `@solana/*`, `@wallet-standard/*`, `bs58` and
  `@noble/curves` from `package.json` also retires the `zod@3.22.4` patch
  (only Reown pulled that copy) and changes `pnpm-lock.yaml`, which is a
  fingerprinted input of the asset pipelines: run the re-mint chore in
  `docs/security/dependency-audit-catalog.md` in the same change, and retire
  the audit exceptions whose only path was the wallet stack.
- The Claudium store is woven through the daily rewards, bank, armory,
  cosmetics and guild hall windows and `src/ui/hud.ts`, and on the server
  through the storage and membership spend paths (`server/claudium_proxy.ts`).
  Saved purchases (storage charters, mount and weapon skins, membership rows)
  must stay readable, so owned cosmetics keep working once the shop is gone.
