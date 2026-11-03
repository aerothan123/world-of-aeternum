// The loot-log matcher: re-localizes the English loot, vendor, market and roll
// lines the sim and the server emit (src/sim/CLAUDE.md, "Player-facing text is
// English here") into the active locale, money fragments included. Moved
// verbatim out of src/ui/hud.ts under the monolith ratchet; the S3 guard
// (tests/localization_fixes.test.ts, MATCHER_ARMS) reads this file. A pure core:
// no DOM, no IWorld, no Hud state.
import {
  itemDisplayNameFromSource,
  itemStackDisplayName,
  parseSimMoney,
} from './entity_display_core';
import { formatMoney as formatLocalizedMoney, formatNumber, t } from './i18n';
import { localizeServerText } from './server_i18n';
import { localizeSimText } from './sim_i18n';

export function localizeLootText(text: string): string {
  // The optional xN suffix (multi-unit grants, both grant hubs emit it)
  // routes through itemStackDisplayName so the item NAME still localizes;
  // a greedy single capture would feed "Copper Ore x3" to the exact-name
  // lookup and silently degrade to raw English.
  let match = /^You receive: (.+?)( x\d+)?\.$/.exec(text);
  if (match)
    return t('hud.logs.lootReceiveItem', {
      item: itemStackDisplayName(match[1], match[2]),
    });
  match = /^You receive (.+)\.$/.exec(text);
  if (match)
    return t('hud.logs.lootReceiveMoney', {
      money: localizeSimMoney(match[1]),
    });
  match = /^You loot (.+)\.$/.exec(text);
  if (match)
    return t('hud.logs.lootMoney', {
      money: localizeSimMoney(match[1]),
    });
  match = /^Rolling for (\[\[i:[A-Za-z0-9_]+\]\])\.$/.exec(text);
  if (match) return t('hudChrome.masterLoot.rollingFor', { item: match[1] });
  match = /^Everyone passed on (.+)\.$/.exec(text);
  if (match) return t('itemUi.lootRoll.everyonePassed', { item: match[1] });
  match = /^Sold (\d+) junk items? for (.+)\.$/.exec(text);
  if (match) {
    const n = Number(match[1]);
    return t(n === 1 ? 'hud.logs.soldJunkOne' : 'hud.logs.soldJunkMany', {
      count: formatNumber(n, { maximumFractionDigits: 0 }),
      money: localizeSimMoney(match[2]),
    });
  }
  match = /^Kept (\d+) bound cop(?:y|ies)\.$/.exec(text);
  if (match) {
    const n = Number(match[1]);
    return t(n === 1 ? 'hud.logs.keptBoundOne' : 'hud.logs.keptBoundMany', {
      count: formatNumber(n, { maximumFractionDigits: 0 }),
    });
  }
  // The LOCKED twin (Masterwrought phase 18 QA, item
  // vendor-partial-sell-locked-toast): a partial vendor sale used to report every
  // spared copy as bound, including the ones spared because the player had LOCKED
  // them, so the summary named the wrong reason and the player had nothing to act
  // on. src/sim/items.ts now splits the two counts and emits this line beside the
  // bound one, so the matcher needs both arms or the locked half ships raw English.
  match = /^Kept (\d+) locked cop(?:y|ies)\.$/.exec(text);
  if (match) {
    const n = Number(match[1]);
    return t(n === 1 ? 'hud.logs.keptLockedOne' : 'hud.logs.keptLockedMany', {
      count: formatNumber(n, { maximumFractionDigits: 0 }),
    });
  }
  match = /^(.+) assigned (.+) to (.+)\.$/.exec(text);
  if (match)
    return t('hudChrome.masterLoot.assigned', {
      looter: match[1],
      item: match[2],
      target: match[3],
    });
  match = /^(.+) was not assigned and is free for all\.$/.exec(text);
  if (match)
    return t('hudChrome.masterLoot.unassigned', {
      item: itemDisplayNameFromSource(match[1]),
    });
  // The optional xN suffix (vendor-selling a stack) routes through
  // itemStackDisplayName so the item NAME still localizes, the same
  // treatment as the receive/listed/bought/reclaimed arms above and below:
  // a greedy single capture would feed "Copper Ore x2" to the exact-name
  // lookup and silently degrade to raw English.
  match = /^Sold (.+?)( x\d+)? for (.+)\.$/.exec(text);
  if (match)
    return t('hud.logs.soldItem', {
      item: itemStackDisplayName(match[1], match[2]),
      money: localizeSimMoney(match[3]),
    });
  match = /^Listed (.+?)( x\d+)? on the World Market for (.+)\.$/.exec(text);
  if (match)
    return t('itemUi.logs.listedItem', {
      item: itemStackDisplayName(match[1], match[2]),
      money: localizeSimMoney(match[3]),
    });
  match = /^(.+) bought your (.+) for (.+?) (?:\u2014|-) collect (.+) from the Merchant\.$/.exec(
    text,
  );
  if (match)
    return t('itemUi.logs.sellerSold', {
      buyer: match[1],
      item: itemDisplayNameFromSource(match[2]),
      money: localizeSimMoney(match[3]),
      proceeds: localizeSimMoney(match[4]),
    });
  match = /^Bought back (.+) for (.+)\.$/.exec(text);
  if (match)
    return t('itemUi.logs.boughtBackItem', {
      item: itemDisplayNameFromSource(match[1]),
      money: localizeSimMoney(match[2]),
    });
  match = /^Bought (.+?)( x\d+)? for (.+)\.$/.exec(text);
  if (match)
    return t('itemUi.logs.boughtItem', {
      item: itemStackDisplayName(match[1], match[2]),
      money: localizeSimMoney(match[3]),
    });
  match = /^Reclaimed (.+?)( x\d+)? from the market\.$/.exec(text);
  if (match)
    return t('itemUi.logs.reclaimedItem', {
      item: itemStackDisplayName(match[1], match[2]),
    });
  match = /^You collect (.+) from the Merchant\.$/.exec(text);
  if (match)
    return t('itemUi.logs.collectedMoney', {
      money: localizeSimMoney(match[1]),
    });
  const server = localizeServerText(text);
  if (server !== null) return server;
  // Sim-emitted log/error/loot text (src/sim) is English at the source; localize it
  // here, the same way server-sent text is handled above.
  const simLocalized = localizeSimText(text);
  if (simLocalized !== null) return simLocalized;
  return text;
}

export function localizeSimMoney(text: string): string {
  const copper = parseSimMoney(text);
  return copper === null ? text : formatLocalizedMoney(copper);
}
