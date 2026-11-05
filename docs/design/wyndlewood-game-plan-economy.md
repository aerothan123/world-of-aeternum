# Wyndlewood: economy and monetization

Companion to `docs/design/wyndlewood-game-plan.md`, sections 5 and 9.
Money is copper: 100 copper make 1 silver, and 100 silver make 1 gold
(`formatMoney`, `src/sim/format_money.ts`).

## 1. Sources and sinks

| Flow | Kind | Status | Anchor | Notes and risk |
|---|---|---|---|---|
| Mob coin drops | Source | EXISTS | loot tables, `src/sim/loot/` | Steady. Scales with kills |
| Quest copper | Source | EXISTS | `copperReward` on quest records | Too high today, because quests are oversupplied (progression file). Retune it together with quest XP |
| Dungeon finale gold | Source | EXISTS | `docs/design/dungeon-gold.md`, `HEROIC_FINALE_COPPER` | Heroic dailies are the largest repeatable source at 20. Watch per-player daily income |
| Raid finale gold | Source | EXISTS | same | Weekly or daily lockout |
| World quests, weekly emissary | Source | EXISTS | `world_quests.ts`, `weekly_quests.ts` | |
| Work orders | Source | EXISTS | `src/sim/professions/cadence.ts` | Pays a fraction of the recipe's value |
| Selling to vendors | Source | EXISTS | item `sellValue` | Classic. Keep vendor prices low for crafted goods |
| World Market cut | Sink | EXISTS | `MARKET_CUT` in `src/sim/market.ts` | Grows with trade volume |
| Market listing deposit | Sink | NEEDS WORK (set to 0) | `MARKET_LISTING_DEPOSIT_COPPER` | Add a small classic-style deposit to stop listing spam |
| Training fees | Sink | EXISTS | `TRAINING_FEE_BY_TIER`, class trainers | One-time |
| Riding fees | Sink | EXISTS | `src/sim/riding_training.ts` | Large one-time sink |
| Bank, socket and vault expansions | Sink | EXISTS | `src/sim/storage_prices.ts` | One-time |
| Unbinding crafted gear, the crafting gold sink | Sink | EXISTS | `UNBIND_FEE_BY_QUALITY_TIER`, `CRAFT_GOLD_SINK_COPPER_PER_BUDGET` | Grows with crafting volume |
| House purchase | Sink | EXISTS | `HOUSE_LOTS[].priceCopper` | Prices are placeholders, flagged in `player-housing.md` |
| House weekly tax | Sink | MISSING (phase 6) | `docs/design/player-housing.md` | Scale it by house size. Never deletes anything |
| Repair | Sink | MISSING | none | The classic main recurring sink. Recommended |
| Town restoration projects | Sink (materials and coin) | MISSING | section 4 of the plan | Absorbs surplus materials and coin, and benefits everyone |
| Consumables (food, flasks, potions) | Material sink | EXISTS | crafting, `wellfed.ts` | Raids and heroics drive demand |
| Gathering tools | Sink | EXISTS | `vendor_row_gates.ts`, `tools.ts` | |
| Perfecting attempts | Material sink | EXISTS | `PERFECTING_ATTEMPT_COST` | Endgame crafting sink |

**Inflation watch.**
- Track, per realm and per day:
  - coin created by source and destroyed by sink;
  - the median character's wealth by level;
  - market prices for a basket of goods (planks, ingots, a flask, a piece of
    furniture).
- The server ledger (`src/sim/account_ledger.ts`) and market sale log
  (`src/sim/market_sale_log.ts`) are the inputs. Show them on the admin
  dashboard (`src/admin/`).

## 2. Monetization options

The rule for every option: no pay-for-power. Nothing sold may raise combat
stats, XP, gather or craft yield, or market income. That includes
cut-price fees. Selling time saved is borderline, so keep it rare and small.

| Option | Pros | Cons |
|---|---|---|
| Buy-to-play (one-time price on Steam) | Simple. Players expect it from indie MMOs. Fewer bots and gold sellers than free-to-play. No pressure to sell power | One-time revenue, while servers cost money every month |
| Subscription | Steady revenue that matches server cost | A hard sell for a new indie MMO. Shrinks the player base |
| Free-to-play plus a shop | The largest possible audience | Bots, gold sellers and spam. Pressure to sell power or convenience. Needs strong moderation (moderation EXISTS: `src/sim/moderation/`, `server/`) |
| Cosmetic shop (appearances, mount and weapon skins, house wallpapers and dyes, emotes) | Fair. Fits a housing game. Store mount and weapon skin plumbing EXISTS | Must never undercut crafted furniture, or makers lose their market. Sell looks, never function |
| Paid expansions (cap raise, new regions, new raid) | The classic, proven shape. Fair | Expensive to build. They split the player base unless the old content stays relevant |
| Cosmetic subscription or seasonal pass (a monthly cosmetic, house theme items) | Recurring revenue without power | Must avoid fear-of-missing-out pressure. Make past items buyable again later |
| Storage purchases (the inherited storage SKU) | Popular | Convenience power. If kept, cap it low and keep in-game gold paths |
| The inherited membership (gear at character level + 5, +20% XP, half market fee) | Already built | Pay-for-power. Remove it or convert it to cosmetics |
| The inherited crypto currency and stakes layer | Already built | Likely blocked under Steam's rules for blockchain games. Legal and trust risk. Remove it from the Steam build |

**Recommended shape:**
- Buy-to-play at the base price.
- A cosmetic shop.
- Paid expansions, starting with the first cap raise.
- Optionally, a cosmetic subscription that never gates content.

Free-to-play is not recommended at launch, because of bot and moderation
load on a small team.
