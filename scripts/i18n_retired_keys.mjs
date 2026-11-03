// Deliberately retired i18n catalog keys - the ONE shared source (Phase 14).
//
// Consumed by THREE places that must always agree:
//   - tests/guide_key_coverage.test.ts: the guide coverage sweep's allowlist
//     (a retired key may render nowhere; a live key may never hide here),
//   - scripts/i18n_scan.mjs: a retired key's unprovided locale rows become
//     `blocked` registry rows (with RETIRED_REASON), never `pending`, so the
//     release fill pass is not asked to translate prose that never renders,
//   - scripts/i18n_build.mjs: the runtime `pending` set excludes them the
//     same way (the build and the registry stay in lockstep).
//
/**
 * Keys kept in the catalog on purpose with NO live consumer left in the code.
 *
 * The catalog cannot simply drop them: every locale overlay under src/ui/i18n.locales/
 * still carries a reviewed translation for each one, and the maintainer's release fill
 * works from the catalog. Deleting the English source would orphan 21 locale rows and
 * (for the placeholder migrations below) throw away prose a human already reviewed.
 *
 * Nothing distinguished a deliberately retired key from a key a page stopped rendering by
 * accident until this list existed. Retiring a key is now an explicit, reviewed act: add
 * it here WITH ITS REASON, or the guide coverage sweep fails.
 *
 * The rule that keeps this list honest: a retired key must have NO reference left in
 * src/. The `has no live reference` test in tests/guide_key_coverage.test.ts proves it,
 * so this list can never be used to silence a key that a page really does try to render.
 */
export const RETIRED_KEYS = [
  // Removed expedition recruitment panels and paused reward shop have no live UI.
  'hudChrome.expeditions.sections',
  'hudChrome.expeditions.noAlerts',
  'hudChrome.expeditions.recruitPlayers',
  'hudChrome.expeditions.recruitIntro',
  'hudChrome.expeditions.recruitDungeon',
  'hudChrome.expeditions.recruitDifficulty',
  'hudChrome.expeditions.recruitPreview',
  'hudChrome.expeditions.recruitPublish',
  'hudChrome.expeditions.recruitPublishing',
  'hudChrome.expeditions.recruitBeforeEntry',
  'hudChrome.expeditions.recruitUnconfirmed',
  'hudChrome.expeditions.recruitLoading',
  'hudChrome.expeditions.recruitAlreadyOpen',
  'hudChrome.expeditions.recruitExistingRun',
  'hudChrome.expeditions.recruitLeaveQueue',
  'hudChrome.expeditions.recruitFinishProposal',
  'hudChrome.expeditions.recruitCancelRequests',
  'hudChrome.expeditions.recruitNoActivities',
  'hudChrome.expeditions.recruitNoRoles',
  'hudChrome.expeditions.recruitInvalidNote',
  'hudChrome.expeditions.manageRecruitment',
  'hudChrome.expeditions.formingGroup',
  'hudChrome.expeditions.groupGathering',
  'hudChrome.expeditions.groupChooseDungeon',
  'hudChrome.expeditions.waitForLeader',
  'hudChrome.expeditions.recruitmentNext',
  'hudChrome.expeditions.findGroupNext',
  'hudChrome.expeditions.awaitingReply',
  'hudChrome.expeditions.requestSent',
  'hudChrome.expeditions.readyToTravel',
  'hudChrome.expeditions.groupRecruiting',
  'hudChrome.expeditions.groupInProgress',
  'hudChrome.expeditions.entryTitle',
  'hudChrome.expeditions.entryBody',
  'hudChrome.expeditions.acceptPlayer',
  'hudChrome.expeditions.declinePlayer',
  'hudChrome.expeditions.chooseRole',
  'hudChrome.expeditions.confirmRequest',
  'hudChrome.expeditions.chooseRoleAction',
  'hudChrome.expeditions.groupsCount',
  'hudChrome.expeditions.requestsCount',
  'hudChrome.expeditions.manageGroup',
  'hudChrome.expeditions.browseGroups',
  'hudChrome.expeditions.noCurrentGroup',
  'hudChrome.expeditions.noCurrentGroupHint',
  'hudChrome.expeditions.noRequests',
  'hudChrome.expeditions.requestsCombat',
  'hudChrome.expeditions.expires',
  'hudChrome.expeditions.stopHelping',
  'hudChrome.expeditions.helperRoles',
  'hudChrome.expeditions.helperOn',
  'hudChrome.expeditions.helperFound',
  'hudChrome.expeditions.viewGroups',
  'hudChrome.expeditions.backToGroups',
  'hudChrome.expeditions.shopIntro',
  'hudChrome.expeditions.shopDescription',
  'hudChrome.expeditions.shopCollection',
  'hudChrome.expeditions.shopOwned',
  'hudChrome.expeditions.shopLocked',
  'hudChrome.expeditions.shopRules',
  'hudChrome.expeditions.pendingRequests',
  'hudChrome.expeditions.multiApplyHint',
  'hudChrome.expeditions.multiApplyLimit',
  'hudChrome.expeditions.dailyPoints',
  'hudChrome.expeditions.rewardRules',
  'hudChrome.expeditions.rewardScope',
  'hudChrome.expeditions.bronze',
  'hudChrome.expeditions.silver',
  'hudChrome.expeditions.defaultBell',
  // Replaced by plural-aware labels; retain reviewed legacy translations.
  'hudChrome.expeditions.bell',
  'hudChrome.adventureGuide.catalogueCount',

  // Crucible collections add a raid-funded route beside the original ladder.
  'guide.professions.endgameBody',
  'guide.professions.endgamePatternsBody',
  'guide.profPages.masterworkBody',
  'guide.profPages.econ.doctrineBody',
  'guide.profPages.econ.intro',
  'guide.profPages.ench.enchantsNoteInfusionLive',
  'guide.profPages.specializationBody',
  'guide.profPages.econ.provenanceBody',
  // -- Placeholder migrations. A {placeholder} may never be added to an already-translated
  // key: it breaks interpolation parity in all 21 locales. Each of these was replaced by a
  // NEW *Count key carrying the token, and the original stays behind, untouched.
  'guide.faqPage.a6', // -> guide.faqPage.a6Count ({zones})
  'guide.home.faq.a4', // -> guide.home.faq.a4Count ({zones})
  'guide.home.world.sub', // -> guide.home.world.subCount ({zones})
  'guide.progression.journeyBody', // -> guide.progression.journeyBodyCount ({zones})

  // -- Reworded successors. The replacement says something materially different, so the
  // old value is not a stale translation to fix but a claim the game no longer makes.
  'guide.gear.soulboundBody', // -> guide.gear.soulboundBodyBound (bind-on-trade rules)
  'guide.profPages.ench.enchantsNote', // -> guide.profPages.ench.enchantsNoteOffhand
  'guide.profPages.specimenBody', // -> guide.profPages.specimenBodyFamilies
  'guide.professions.focusBody', // -> guide.professions.focusBodyTiers
  'guide.professions.harvestBodyChoice', // folded into the harvest section's body copy
  // -> guide.profPages.gatherDeeds.farmingSown (farming gained its own deeds at D13)
  'guide.profPages.gatherDeeds.farming',
  // The World PvP zone layer (src/sim/pvp/world_pvp_zones.ts): the flag is no
  // longer the whole story, so each of these states a rule the game has stopped
  // following. Sanctuaries allow no world fighting at all, the free-for-all
  // zones need no flag and mark whoever opens on an unflagged player, an
  // unflagged victim stakes no gold, and the repeat-kill counter runs on its own
  // hour rather than the daily reset.
  'guide.worldPvpPage.intro', // -> guide.worldPvpPage.introZones
  'guide.worldPvpPage.flagBody', // -> guide.worldPvpPage.flagBodyAid (shields and buffs are aid)
  'guide.worldPvpPage.stakesBody', // -> guide.worldPvpPage.stakesBodyFlagged
  'guide.worldPvpPage.limitsBody', // -> guide.worldPvpPage.limitsBodyHour
  'guide.worldPvpPage.limitsBodyHour', // -> guide.worldPvpPage.limitsBodyRaids (the raid rule)
  'guide.worldPvpPage.hillBody', // -> guide.worldPvpPage.hillBodyRamp (the hold ramp)
  'guide.worldPvpPage.hillBodyRamp', // -> guide.worldPvpPage.hillBodyPause (30 s capture, a rival pauses it)
  'guide.worldPvpPage.hillBodyPause', // -> guide.worldPvpPage.hillBodyFlat (flat Honor, capture rules retained)
  'guide.worldPvpPage.hillBodyFlat', // -> guide.worldPvpPage.hillBodyTwoHour (2 h, 30 min schedule restored)
  'guide.commandsPage.pvp', // -> guide.commandsPage.pvpZones

  // -- Content the game no longer has, so the wiki must not define it.
  // The glossary defined Augment as a draft pick in a two-on-two Fiesta match.
  // Fiesta is retired and is not among the tabs the PvP window offers, so the term
  // described content no player can reach.
  'guide.glossary.augmentTerm',
  'guide.glossary.augmentDef',
  'guide.bestiary.flavor.mirejaw_frenzy', // summon-only encounter add, filtered from the bestiary
  'guide.footer.communityWiki', // the standalone MediaWiki redirect this SPA replaced
  // Warfare now covers pets (they fight with their owner's Warfare), so the old stats
  // body's "does nothing against creatures" became false. Successor: warfareBodyPets.
  'guide.stats.warfareBody',

  // -- Superseded by generated content. These were hand-written dungeon facts before
  // GUIDE_DUNGEONS carried the roster; the page now renders names and level bands from
  // the sim, so a hardcoded name here could only ever drift.
  'guide.dungeonsPage.bastionName',
  'guide.dungeonsPage.hollowName',
  'guide.dungeonsPage.sanctumName',
  'guide.dungeonsPage.templeName',
  'guide.dungeonsPage.levelAround',
  'guide.dungeonsPage.raidSize',

  // -- Label variants a redesign dropped. The information still reaches the reader; only
  // this presentation of it is gone.
  'guide.classPage.roleLabel', // role and resource are hero badges now, using the
  'guide.classPage.resourceLabel', // shared classDetails.labels.* keys
  'guide.delvesPage.affixesLabel', // the affix pills sit under affixesHeading instead
  'guide.professions.craftHowTitle', // the crafting-window section was folded into craftBody
  'guide.nav.onThisPage', // the in-page TOC is labelled by guide.toc.heading
  'guide.nav.reference', // the sidebar heading comes from guide.groups.reference
  'guide.nav.backToGame', // the guide links out with guide.nav.playNow
  'guide.brandShort', // every surface renders the full guide.brand
  'guide.loading', // the SPA shell paints its own skeleton, never a loading string
  'guide.models.count', // the models page heads its grid without a running count

  // -- Orphaned by a computed key whose input set moved.
  // guide.groups.<GuideGroup>: 'compendium' was the single pre-split bucket, and is no
  // longer a GuideGroup (see the split comment in src/guide/routes.ts).
  'guide.groups.compendium',
  // guide.classHook.<classId>: the one-line class teaser. The class chooser renders the
  // curated feel tags from src/guide/class_meta.ts instead, so nothing calls it any more.
  'guide.classHook.druid',
  'guide.classHook.hunter',
  'guide.classHook.mage',
  'guide.classHook.paladin',
  'guide.classHook.priest',
  'guide.classHook.rogue',
  'guide.classHook.shaman',
  'guide.classHook.warlock',
  'guide.classHook.warrior',
  // guide.abilityHook.<abilityId>: rendered by class_view.ts for the first six hook-carrying
  // abilities in a class's GENERATED signature kit (scripts/wiki/build_content.mjs takes
  // kit-with-hook then slice(0, 6)). A key lands here when no class page asks for it any
  // more. ('thorns' also resolves through src/ui/talent_i18n.ts, so it sits in
  // LIVE_OFF_SWEEP_KEYS below instead.)
  // These nine are mage abilities an earlier kit refresh already dropped from that slice.
  'guide.abilityHook.blizzard',
  'guide.abilityHook.brain_freeze',
  'guide.abilityHook.conjure_food',
  'guide.abilityHook.fingers_of_frost',
  'guide.abilityHook.fireball_form',
  'guide.abilityHook.flurry',
  'guide.abilityHook.frozen_orb',
  'guide.abilityHook.ice_lance',
  'guide.abilityHook.shatter',
  // The v0.31 class overhauls rebuilt every kit. 'judgement' no longer exists as an ability
  // at all, and the next three are hiddenFromPlayer PALADIN_LEGACY ids kept only for the
  // persisted action-bar contract, so the class page can never list any of them.
  'guide.abilityHook.judgement',
  'guide.abilityHook.blessing_of_might',
  'guide.abilityHook.devotion_aura',
  'guide.abilityHook.seal_of_righteousness',
  // The rest are live abilities whose hooks fell out of the six signature slots when the
  // overhauls reordered kits and spec-gated abilities ('primal_exaltation' and 'stoneward'
  // left the kits entirely). The hook prose stays reviewed in every locale; a kit reorder
  // that surfaces one again simply removes it from this list.
  'guide.abilityHook.ancestor_return',
  'guide.abilityHook.arcane_shot',
  'guide.abilityHook.avenging_wrath',
  'guide.abilityHook.bastion_sweep',
  'guide.abilityHook.concussive_shot',
  'guide.abilityHook.earth_shock',
  'guide.abilityHook.flame_shock',
  'guide.abilityHook.hammer_of_wrath',
  'guide.abilityHook.healing_wave',
  'guide.abilityHook.life_tap',
  'guide.abilityHook.lifespring_weapon',
  'guide.abilityHook.lightning_shield',
  'guide.abilityHook.mongoose_bite',
  'guide.abilityHook.oath_chain',
  'guide.abilityHook.primal_exaltation',
  'guide.abilityHook.stoneward',
  'guide.abilityHook.stormsurge',
  'guide.abilityHook.tidecall',
  'guide.abilityHook.veilbound_march',
  // Phase 16 (2026-08-30) rewords, the reword-is-a-new-key convention: each
  // retired body's replacement renders in its place (masterwroughtBodyLegendary,
  // identityBodyOneMeal, enchantsNoteInfusionLive, tableBodyOneMeal); the old
  // keys keep their reviewed overlay fills until the release fill retires them.
  'guide.gear.masterwroughtBody',
  'guide.profPages.craftProse.cooking.identityBody',
  'guide.profPages.ench.enchantsNoteOffhand',
  'guide.profPages.farm.tableBody',
  // Phase 19F (2026-09-02, ruling qr-19-crucible-gear-sundering-admission),
  // the same convention: the endgame materials prose said sundering breaks a
  // raid-won epic 'of the tier', a restriction the predicate never made (any
  // raid tier, normal or heroic, feeds the essence); the successor
  // endgameMaterialsBodyAnyRaid says what the predicate does, and its five
  // non-Latin fills rode the same change.
  'guide.professions.endgameMaterialsBody',
  // Phase 19F review round (2026-09-02, under
  // qr-19-materialsbody-onramp-bill-omission): the engineering materials prose
  // counted TWO rod recipes where
  // ROD_RECIPES holds three; the successor materialsBodyThreeRods names the
  // Clockreel bill and rides the bodyKey override in professions_craft.ts, and
  // its five non-Latin fills (fresh, the old ones predated the live English)
  // rode the same change.
  'guide.profPages.craftProse.engineering.materialsBody',
  // Phase 19F (2026-09-02, ruling qr-19-rarebody-reword-landmine): the shared
  // 'Rare finds' prose of the four gathering pages named the three node
  // windfalls and not farming's golden harvest, which rolls the same event;
  // the successor rareBodyFourFlavors names all four with the maintainer's
  // wording, and its five non-Latin fills rode the same change (the old key's
  // five non-Latin fills had omitted the flavor names and the deed sentence
  // since they were written).
  'guide.profPages.rareBody',
  // Phase 19G (2026-09-02, ruling qr-19-scroll-elixir-15c-parity): the
  // inscription materials prose told players the double scroll batch is
  // 'priced even with the Elixir of the Serpent', false by 15 copper since
  // Phase 11g put a gourd on the elixir alone; the repair puts the same gourd
  // on the scroll, the successor materialsBodyFrostGourd names it, and its
  // five non-Latin fills rode the same change (the old key's five reviewed
  // rows are kept here, stale on the one clause the repair made true).
  'guide.profPages.craftProse.inscription.materialsBody',
  // Phase 20 (2026-09-03, the wiki completeness audit): the arena page's honor
  // callout said a coin purchase 'can be undone from a vendor's buyback list';
  // the list holds only what you SOLD (src/sim/items.ts recordVendorBuyback is
  // reached from sellItem and sellAllJunk alone, buyItem records nothing). The
  // successor honorFinalNoteSoldBack says so, and its five non-Latin fills rode
  // the same change; this key keeps its reviewed overlay rows.
  'guide.arenaPage.honorFinalNote',
  // Plain gray junk stopped recording vendor buyback rows (items.ts
  // skipsVendorBuyback), and this page did not say the Sell Junk sweep was
  // final. The successor junkBodyFinal says so, and its five non-Latin fills
  // rode the same change; this key keeps its reviewed overlay rows.
  'guide.economy.junkBody',
  // Phase 20 (2026-09-03, the wiki completeness audit): the arena rewards prose
  // said a loss 'costs you nothing but rating' and that Honor's day 'rolls over
  // on its own clock'; a played-out loss and a draw pay RANKED_ARENA_LOSS_HONOR
  // and the day is ctx.resetDay, the realm's nightly reset (src/sim/pvp/honor.ts).
  // The successor rewardsBodyLossShare says so, and its five non-Latin fills
  // rode the same change; this key keeps its reviewed overlay rows.
  'guide.arenaPage.rewardsBody',
  // Phase 20 (2026-09-03, the wiki completeness audit): the Warfare prose said
  // 'a full honor kit is worth nothing on a dungeon boss', but every WARFARE row
  // carries ordinary stats and its slot's armor or weapon baseline
  // (src/sim/content/pvp_honor.ts); only the two ratings and the set bonuses
  // are PvP-only. The successor warfareBodyStatsStay says so, and its five
  // non-Latin fills rode the same change; this key keeps its reviewed rows.
  'guide.arenaPage.warfareBody',
  // Phase 20 (2026-09-03, the wiki completeness audit): the Warfare trade prose
  // said 'everything it does bring is spent on other players', false for the
  // same reason as warfareBody above (every WARFARE row has a positive
  // primary-stat sum). The successor warfareTradeBodyRatingSpent scopes the
  // clause to the Warfare rating and set bonuses, and its five non-Latin fills
  // rode the same change; this key keeps its reviewed overlay rows.
  'guide.arenaPage.warfareTradeBody',
  // Phase 20 (2026-09-03, the wiki completeness audit): the social page's
  // calendar prose listed six realm days where SYSTEM_EVENTS ships seven and
  // closed on 'not a bonus; nothing about your character changes', false on the
  // Double Honor Weekend (src/sim/pvp/honor_event.ts doubles Thornhollow Fields
  // honor all weekend); the successor calendarBodyDoubleHonor names the seventh
  // day and the one exception, and its five non-Latin fills rode the change.
  'guide.social.calendarBody',
  // Phase 20 (2026-09-03, the wiki completeness audit): the social page's emote
  // prose said 'target a friend first to aim it at them', while the emote arm of
  // src/sim/social/chat.ts aims by the typed name alone and never reads the
  // actor's target, and called X the wheel key where KeyX is only the default;
  // the successor emotesBodyNamedTarget says both, and its five non-Latin fills
  // rode the change (the old key keeps its five reviewed overlay rows here).
  'guide.social.emotesBody',
  // Phase 20 (2026-09-03, the wiki completeness audit): the social page's
  // finder prose let any member queue 'with the party you already have'
  // (dungeonFinderQueueJoin refuses everyone but the leader) and had a decline
  // wait 'before the queue offers you another' (failProposal drops the
  // decliner's unit from the queue and never re-queues it); the successor
  // finderBodyLeaderQueues says both, and its five non-Latin fills rode the change.
  'guide.social.finderBody',
  // Phase 20 (2026-09-03, the wiki completeness audit): the social page's loot
  // roll prose closed on 'The highest roll wins.', while resolveLootRoll in
  // src/sim/loot/loot_roll.ts contends the Need rolls alone whenever anyone
  // rolled Need, so a Greed roll of any size loses to a Need roll of 1; the
  // successor lootRollBodyNeedBeatsGreed states the rule, and its five
  // non-Latin fills rode the change (the old key keeps its reviewed rows here).
  'guide.social.lootRollBody',
  // Phase 20 (2026-09-03, the wiki completeness audit): the frames prose said
  // only the three unit frames move and sent players to a 'Reset Frame
  // Positions' options row that was retired (options_window.ts keeps the note
  // where it stood); the successor framesMoveBodyEditFrames names Edit Frames,
  // every HUD_FRAME_SPECS frame it loosens, and the Frames tab's Reset to
  // Defaults footer, and its five non-Latin fills rode the same change (the
  // old key keeps its reviewed overlay rows).
  'guide.interfacePage.framesMoveBody',
  // Phase 20 (2026-09-03, the wiki completeness audit): the map prose said M
  // opens on the continent (Hud.toggleMap always opens the per-zone level),
  // that it shows the gathering nodes 'you have found' (every authored node of
  // the zone draws, ready/locked are its only per-player facets), that only a
  // delve switches the map (five MapWindowMode surfaces plus the castle plan),
  // and it skipped the Reliquary tracker; the successor mapBodyZoneFirst says
  // all of it, and its five non-Latin fills rode the same change.
  'guide.interfacePage.mapBody',
  // Phase 20 (2026-09-03, the wiki completeness audit): the touch prose
  // promised 'up to seven pages once you have all three action bars switched
  // on' where the ring has MOBILE_ACTION_PAGE_COUNT pages over every ability
  // slot regardless of the desktop rows, and listed the Vale Cup in a More
  // tray that has no such button; the successor mobileBodyTwoPages
  // interpolates {pages} and {slots} from the live pure core and drops the
  // Vale Cup, and its five non-Latin fills rode the same change.
  'guide.interfacePage.mobileBody',
  // Phase 20 (2026-09-03, the wiki completeness audit): the extra-windows
  // prose listed 'the Vale Cup (Y)' (no bind defaults to KeyY, no such
  // window), counted the held emote wheel among the toggled windows, opened
  // Player Info from a nameplate right-click (a world right-click only
  // targets; the menu lives on the target frame) and made the card need
  // proximity (only the gear does); the successor winMoreBodyNoValeCup says
  // what the game does, adds the Developers tab, and its five non-Latin
  // fills rode the same change.
  'guide.interfacePage.winMoreBody',
  // Phase 20 (2026-09-03, the wiki completeness audit): the world-windows
  // prose promised a class trainer (none exists: abilities arrive by level and
  // Training is the station masters' recipe ladder), a buyback TAB (one panel
  // with a buyback section at its foot), a guild bank as 'a second tab' (the
  // strip is Personal, Vault, Guild) and one market keeper where two NPCs
  // carry the market flag; the successor worldWindowsBodyStationMaster says
  // what the game does, and its five non-Latin fills rode the same change.
  'guide.interfacePage.worldWindowsBody',
  // -- v0.44.0 Unstuck Sickness window. The first /unstuck in an hour is free and only a
  // repeat inside the window charges the sickness, so these three rows (which promise a
  // price on every use) were superseded by the *Window keys rather than reworded: every
  // overlay's reviewed translation of the old rule would otherwise keep rendering the
  // wrong fact (docs/i18n-scaling/translation-workflow.md, reword staleness).
  'guide.combat.unstuckBody',
  'guide.commandsPage.unstuck',
  'guide.glossary.unstuckDef',
  // -- Project H has no cryptocurrency: the $WOC Exchange, wallet linking, holder
  // tiers, Daily Rewards, the token trade arm, and the crypto Claudium rails were
  // removed, so every key below lost its last consumer. Kept only because the locale
  // overlays still carry reviewed rows for them.
  'footer.whitepaper',
  'guide.settingsPage.ifWallet',
  'hudChrome.account.manageWallet',
  'hudChrome.account.sectionWallet',
  'hudChrome.account.walletSummary',
  'hudChrome.bank.bonusAdvertWallet',
  'hudChrome.bank.bonusSourceWallet',
  'hudChrome.claudium.checkoutNotSettled',
  'hudChrome.claudium.checkoutWalletRequired',
  'hudChrome.claudium.checkoutWalletUnsupported',
  'hudChrome.claudium.priceSol',
  'hudChrome.claudium.priceUsdc',
  'hudChrome.claudium.priceWoc',
  'hudChrome.claudium.railNativeUnavailable',
  'hudChrome.claudium.railSol',
  'hudChrome.claudium.railUsdc',
  'hudChrome.claudium.railWoc',
  'hudChrome.claudium.railWocDiscount',
  'hudChrome.claudium.solBalance',
  'hudChrome.claudium.usdcBalance',
  'hudChrome.claudium.wocBalance',
  'hudChrome.currencies.walletNotLinked',
  'hudChrome.currencies.wocPreview',
  'hudChrome.currencies.wocToken',
  'hudChrome.currencies.wocTokenNote',
  'hudChrome.dailyRewards.close',
  'hudChrome.dailyRewards.disabled',
  'hudChrome.dailyRewards.disclaimer',
  'hudChrome.dailyRewards.endsIn',
  'hudChrome.dailyRewards.error',
  'hudChrome.dailyRewards.history',
  'hudChrome.dailyRewards.intro',
  'hudChrome.dailyRewards.leaderboard',
  'hudChrome.dailyRewards.loading',
  'hudChrome.dailyRewards.noHistory',
  'hudChrome.dailyRewards.noLeaders',
  'hudChrome.dailyRewards.oneVsOneExcluded',
  'hudChrome.dailyRewards.pointsGained',
  'hudChrome.dailyRewards.prize',
  'hudChrome.dailyRewards.reason.banned',
  'hudChrome.dailyRewards.reason.bannedUntil',
  'hudChrome.dailyRewards.reason.eligible',
  'hudChrome.dailyRewards.reason.no_wallet',
  'hudChrome.dailyRewards.reason.price_unavailable',
  'hudChrome.dailyRewards.reason.under_minimum',
  'hudChrome.dailyRewards.remainingDaysHours',
  'hudChrome.dailyRewards.remainingHoursMinutes',
  'hudChrome.dailyRewards.remainingLessThanMinute',
  'hudChrome.dailyRewards.remainingMinutes',
  'hudChrome.dailyRewards.reset',
  'hudChrome.dailyRewards.score',
  'hudChrome.dailyRewards.sol',
  'hudChrome.dailyRewards.spinButton',
  'hudChrome.dailyRewards.spinClaimed',
  'hudChrome.dailyRewards.spinClose',
  'hudChrome.dailyRewards.spinDialogTitle',
  'hudChrome.dailyRewards.spinReady',
  'hudChrome.dailyRewards.spinResult',
  'hudChrome.dailyRewards.spinTitle',
  'hudChrome.dailyRewards.taskMultiplier',
  'hudChrome.dailyRewards.tasks',
  'hudChrome.dailyRewards.title',
  'hudChrome.dailyRewards.totalPlayer',
  'hudChrome.dailyRewards.totalPlayers',
  'hudChrome.dailyRewards.usd',
  'hudChrome.dailyRewards.walletConnectBody',
  'hudChrome.dailyRewards.walletConnectButton',
  'hudChrome.dailyRewards.walletConnectTitle',
  'hudChrome.dailyRewards.walletHoldBody',
  'hudChrome.dailyRewards.walletHoldTitle',
  'hudChrome.dailyRewards.walletPriceBody',
  'hudChrome.dailyRewards.walletValue',
  'hudChrome.mobile.wocMarket',
  'hudChrome.options.showWalletOnCharacterScreen',
  'hudChrome.options.showWalletOnPlayerCard',
  'hudChrome.playerCard.showWalletBadge',
  'hudChrome.trade.woc.accepted',
  'hudChrome.trade.woc.awaitingPayment',
  'hudChrome.trade.woc.blockDisabled',
  'hudChrome.trade.woc.blockNoWallet',
  'hudChrome.trade.woc.blockPartnerUnknown',
  'hudChrome.trade.woc.blockRecipientNoWallet',
  'hudChrome.trade.woc.cancelPendingSeller',
  'hudChrome.trade.woc.cancelSale',
  'hudChrome.trade.woc.closePaymentContinuesBuyer',
  'hudChrome.trade.woc.closePaymentContinuesSeller',
  'hudChrome.trade.woc.closeSellerHold',
  'hudChrome.trade.woc.closedCancelled',
  'hudChrome.trade.woc.closedSuspended',
  'hudChrome.trade.woc.closedUnpaid',
  'hudChrome.trade.woc.closedUnpaidBuyer',
  'hudChrome.trade.woc.dealAwaitsPayment',
  'hudChrome.trade.woc.decline',
  'hudChrome.trade.woc.equivalent',
  'hudChrome.trade.woc.feeLine',
  'hudChrome.trade.woc.hintAcceptLocked',
  'hudChrome.trade.woc.hintAcceptNeedsItem',
  'hudChrome.trade.woc.hintAwaitTheirItems',
  'hudChrome.trade.woc.hintBelowMin',
  'hudChrome.trade.woc.hintClearYourItems',
  'hudChrome.trade.woc.hintEnterPrice',
  'hudChrome.trade.woc.hintGoldOffered',
  'hudChrome.trade.woc.hintInsufficientBalance',
  'hudChrome.trade.woc.hintOneItem',
  'hudChrome.trade.woc.ineligibleReason',
  'hudChrome.trade.woc.modesLabel',
  'hudChrome.trade.woc.moneyLine',
  'hudChrome.trade.woc.moneyUsd',
  'hudChrome.trade.woc.netLine',
  'hudChrome.trade.woc.netLineBuyer',
  'hudChrome.trade.woc.notInstant',
  'hudChrome.trade.woc.offerDeclined',
  'hudChrome.trade.woc.offerExpired',
  'hudChrome.trade.woc.offerExpiresAt',
  'hudChrome.trade.woc.offerNotPending',
  'hudChrome.trade.woc.offerSent',
  'hudChrome.trade.woc.offerSentUntil',
  'hudChrome.trade.woc.offerStandsUntil',
  'hudChrome.trade.woc.offerWithdrawn',
  'hudChrome.trade.woc.p2pBindingNote',
  'hudChrome.trade.woc.p2pBindingNoteUntimed',
  'hudChrome.trade.woc.p2pPaymentDueAt',
  'hudChrome.trade.woc.paidBuyer',
  'hudChrome.trade.woc.paidSeller',
  'hudChrome.trade.woc.payNow',
  'hudChrome.trade.woc.paying',
  'hudChrome.trade.woc.paymentConfirmed',
  'hudChrome.trade.woc.priceLabel',
  'hudChrome.trade.woc.pricePlaceholder',
  'hudChrome.trade.woc.quoteExpiredTrade',
  'hudChrome.trade.woc.quoteStaged',
  'hudChrome.trade.woc.sendOffer',
  'hudChrome.trade.woc.settled',
  'hudChrome.trade.woc.settledSeller',
  'hudChrome.trade.woc.statusAwaitingBuyer',
  'hudChrome.trade.woc.statusConfirmedBuyer',
  'hudChrome.trade.woc.statusConfirmedSeller',
  'hudChrome.trade.woc.statusPayingBuyer',
  'hudChrome.trade.woc.statusPayingSeller',
  'hudChrome.trade.woc.statusReviewBuyer',
  'hudChrome.trade.woc.statusReviewSeller',
  'hudChrome.trade.woc.tabGold',
  'hudChrome.trade.woc.tabWoc',
  'hudChrome.trade.woc.tabWocHint',
  'hudChrome.trade.woc.variableWarning',
  'hudChrome.trade.woc.waitingOther',
  'hudChrome.trade.woc.withdraw',
  'hudChrome.trade.woc.youDeclined',
  'hudChrome.trade.woc.youWithdrew',
  'hudChrome.walletBridge.badResponse',
  'hudChrome.walletBridge.cancelled',
  'hudChrome.walletBridge.notConnected',
  'hudChrome.walletBridge.timeout',
  'hudChrome.walletBridge.unavailable',
  'hudChrome.walletBridge.unsupported',
  'hudChrome.wocMarket.activityBids',
  'hudChrome.wocMarket.activityCancelPending',
  'hudChrome.wocMarket.activityDeadline',
  'hudChrome.wocMarket.activityDirected',
  'hudChrome.wocMarket.activityEmpty',
  'hudChrome.wocMarket.activityListings',
  'hudChrome.wocMarket.activityNoBids',
  'hudChrome.wocMarket.activityNoListings',
  'hudChrome.wocMarket.activityNoSettlements',
  'hudChrome.wocMarket.activityPayNow',
  'hudChrome.wocMarket.activityPayNowAria',
  'hudChrome.wocMarket.activityPayNowItemAria',
  'hudChrome.wocMarket.activitySettlements',
  'hudChrome.wocMarket.activityStrikes',
  'hudChrome.wocMarket.activitySuspended',
  'hudChrome.wocMarket.bidAria',
  'hudChrome.wocMarket.bidBindingNote',
  'hudChrome.wocMarket.bidBondNote',
  'hudChrome.wocMarket.bidBondPay',
  'hudChrome.wocMarket.bidBondPayAria',
  'hudChrome.wocMarket.bidBondPayItemAria',
  'hudChrome.wocMarket.bidBondPayWindow',
  'hudChrome.wocMarket.bidBondSchedule',
  'hudChrome.wocMarket.bidButton',
  'hudChrome.wocMarket.bidCloseNote',
  'hudChrome.wocMarket.bidLabel',
  'hudChrome.wocMarket.bidPlacedOutbid',
  'hudChrome.wocMarket.bidPlacedStanding',
  'hudChrome.wocMarket.bidPlaceholder',
  'hudChrome.wocMarket.bidStatusActive',
  'hudChrome.wocMarket.bidStatusCancelled',
  'hudChrome.wocMarket.bidStatusDefaulted',
  'hudChrome.wocMarket.bidStatusLapsed',
  'hudChrome.wocMarket.bidStatusOutbid',
  'hudChrome.wocMarket.bidStatusPending',
  'hudChrome.wocMarket.bidStatusWon',
  'hudChrome.wocMarket.bidTermsToggle',
  'hudChrome.wocMarket.bondNotYetVisible',
  'hudChrome.wocMarket.bondPendingGeneric',
  'hudChrome.wocMarket.bondSeenAwaitingFinality',
  'hudChrome.wocMarket.bondServiceUnreachable',
  'hudChrome.wocMarket.browseEmpty',
  'hudChrome.wocMarket.browseError',
  'hudChrome.wocMarket.browserOnlyConfirmBody',
  'hudChrome.wocMarket.browserOnlyConfirmCancel',
  'hudChrome.wocMarket.browserOnlyConfirmOpen',
  'hudChrome.wocMarket.browserOnlyConfirmTitle',
  'hudChrome.wocMarket.buyNowAria',
  'hudChrome.wocMarket.buyNowButton',
  'hudChrome.wocMarket.buyNowLockedBadge',
  'hudChrome.wocMarket.buyNowLockedTip',
  'hudChrome.wocMarket.buyNowNote',
  'hudChrome.wocMarket.cancelAria',
  'hudChrome.wocMarket.cancelButton',
  'hudChrome.wocMarket.charselectWebLink',
  'hudChrome.wocMarket.charselectWebNote',
  'hudChrome.wocMarket.close',
  'hudChrome.wocMarket.colBuyNow',
  'hudChrome.wocMarket.colBuyer',
  'hudChrome.wocMarket.colCurrentBid',
  'hudChrome.wocMarket.colItem',
  'hudChrome.wocMarket.colSalePrice',
  'hudChrome.wocMarket.colSaleType',
  'hudChrome.wocMarket.colSeller',
  'hudChrome.wocMarket.colSoldAt',
  'hudChrome.wocMarket.colTimeLeft',
  'hudChrome.wocMarket.confirming',
  'hudChrome.wocMarket.detailBuyNow',
  'hudChrome.wocMarket.detailCurrentBid',
  'hudChrome.wocMarket.detailEndsAt',
  'hudChrome.wocMarket.detailMinNext',
  'hudChrome.wocMarket.detailNoBids',
  'hudChrome.wocMarket.detailNoSales',
  'hudChrome.wocMarket.detailSaleRow',
  'hudChrome.wocMarket.detailSales',
  'hudChrome.wocMarket.detailSalesLoading',
  'hudChrome.wocMarket.detailSeller',
  'hudChrome.wocMarket.detailStartingBid',
  'hudChrome.wocMarket.detailTitle',
  'hudChrome.wocMarket.disabledRealm',
  'hudChrome.wocMarket.dueAt',
  'hudChrome.wocMarket.estimateNote',
  'hudChrome.wocMarket.filterAny',
  'hudChrome.wocMarket.filterCategory',
  'hudChrome.wocMarket.filterCategoryArmor',
  'hudChrome.wocMarket.filterCategoryMount',
  'hudChrome.wocMarket.filterCategoryWeapon',
  'hudChrome.wocMarket.filterFormat',
  'hudChrome.wocMarket.filterFormatAuction',
  'hudChrome.wocMarket.filterFormatBuyNow',
  'hudChrome.wocMarket.filterItemLabel',
  'hudChrome.wocMarket.filterItemPlaceholder',
  'hudChrome.wocMarket.filterQuality',
  'hudChrome.wocMarket.filterSubcategory',
  'hudChrome.wocMarket.historyEmpty',
  'hudChrome.wocMarket.historyError',
  'hudChrome.wocMarket.launcherLabel',
  'hudChrome.wocMarket.listing',
  'hudChrome.wocMarket.listingCancelPending',
  'hudChrome.wocMarket.listingCancelled',
  'hudChrome.wocMarket.listingCreated',
  'hudChrome.wocMarket.listingStatusActive',
  'hudChrome.wocMarket.listingStatusCancelled',
  'hudChrome.wocMarket.listingStatusReturned',
  'hudChrome.wocMarket.listingStatusSettling',
  'hudChrome.wocMarket.listingStatusSold',
  'hudChrome.wocMarket.listingStatusSuspended',
  'hudChrome.wocMarket.listingStatusUnsold',
  'hudChrome.wocMarket.loadFailed',
  'hudChrome.wocMarket.loading',
  'hudChrome.wocMarket.offerNextNote',
  'hudChrome.wocMarket.pageNext',
  'hudChrome.wocMarket.pageNumber',
  'hudChrome.wocMarket.pagePrev',
  'hudChrome.wocMarket.pausedBanner',
  'hudChrome.wocMarket.paymentConfirmedDelivering',
  'hudChrome.wocMarket.paymentDueAt',
  'hudChrome.wocMarket.paymentNotYetVisible',
  'hudChrome.wocMarket.paymentPendingGeneric',
  'hudChrome.wocMarket.paymentSeenAwaitingFinality',
  'hudChrome.wocMarket.paymentServiceUnreachable',
  'hudChrome.wocMarket.purchaseComplete',
  'hudChrome.wocMarket.quoteBondFor',
  'hudChrome.wocMarket.quoteBondForItem',
  'hudChrome.wocMarket.quoteBurn',
  'hudChrome.wocMarket.quoteCancel',
  'hudChrome.wocMarket.quoteExpired',
  'hudChrome.wocMarket.quoteExpires',
  'hudChrome.wocMarket.quoteExpiresAt',
  'hudChrome.wocMarket.quoteFixedNote',
  'hudChrome.wocMarket.quoteRefresh',
  'hudChrome.wocMarket.quoteSeller',
  'hudChrome.wocMarket.quoteSettlementFor',
  'hudChrome.wocMarket.quoteSign',
  'hudChrome.wocMarket.quoteTitle',
  'hudChrome.wocMarket.quoteTotal',
  'hudChrome.wocMarket.quoteTreasury',
  'hudChrome.wocMarket.rateNote',
  'hudChrome.wocMarket.rateNotePaused',
  'hudChrome.wocMarket.reserveMet',
  'hudChrome.wocMarket.reserveMetTip',
  'hudChrome.wocMarket.reserveNotMet',
  'hudChrome.wocMarket.reserveNotMetTip',
  'hudChrome.wocMarket.rowOpenAria',
  'hudChrome.wocMarket.saleTypeAuction',
  'hudChrome.wocMarket.saleTypeBuyNow',
  'hudChrome.wocMarket.saleTypeDirected',
  'hudChrome.wocMarket.saleTypeUnknown',
  'hudChrome.wocMarket.sellBuyNowAboveStart',
  'hudChrome.wocMarket.sellBuyNowAuctionNote',
  'hudChrome.wocMarket.sellBuyNowNote',
  'hudChrome.wocMarket.sellBuyNowPrice',
  'hudChrome.wocMarket.sellChoose',
  'hudChrome.wocMarket.sellClear',
  'hudChrome.wocMarket.sellCollectiblesBoth',
  'hudChrome.wocMarket.sellCollectiblesChromas',
  'hudChrome.wocMarket.sellCollectiblesMounts',
  'hudChrome.wocMarket.sellDuration',
  'hudChrome.wocMarket.sellEmptyFloor',
  'hudChrome.wocMarket.sellFeeNote',
  'hudChrome.wocMarket.sellFormat',
  'hudChrome.wocMarket.sellFormatAuction',
  'hudChrome.wocMarket.sellFormatBuyNow',
  'hudChrome.wocMarket.sellLockedHidden',
  'hudChrome.wocMarket.sellNoMatches',
  'hudChrome.wocMarket.sellOfferNext',
  'hudChrome.wocMarket.sellReserve',
  'hudChrome.wocMarket.sellReserveNote',
  'hudChrome.wocMarket.sellSearchPlaceholder',
  'hudChrome.wocMarket.sellStart',
  'hudChrome.wocMarket.sellSubmit',
  'hudChrome.wocMarket.sellSubmitAria',
  'hudChrome.wocMarket.sellTitle',
  'hudChrome.wocMarket.sellerBack',
  'hudChrome.wocMarket.sellerEmpty',
  'hudChrome.wocMarket.sellerError',
  'hudChrome.wocMarket.sellerLinkAria',
  'hudChrome.wocMarket.sellerSaleRow',
  'hudChrome.wocMarket.sellerTitle',
  'hudChrome.wocMarket.settlementConfirmedDelivering',
  'hudChrome.wocMarket.settlementConfirming',
  'hudChrome.wocMarket.settlementDeadlineNote',
  'hudChrome.wocMarket.settlementDelivered',
  'hudChrome.wocMarket.settlementExpired',
  'hudChrome.wocMarket.settlementFailBurnAuthority',
  'hudChrome.wocMarket.settlementFailBurnMismatch',
  'hudChrome.wocMarket.settlementFailBurnMissing',
  'hudChrome.wocMarket.settlementFailConfirmingOverdue',
  'hudChrome.wocMarket.settlementFailGeneric',
  'hudChrome.wocMarket.settlementFailQuoteExpired',
  'hudChrome.wocMarket.settlementFailRefunded',
  'hudChrome.wocMarket.settlementFailSuperseded',
  'hudChrome.wocMarket.settlementFailTransaction',
  'hudChrome.wocMarket.settlementFailUnexpectedCredit',
  'hudChrome.wocMarket.settlementFailed',
  'hudChrome.wocMarket.settlementOffered',
  'hudChrome.wocMarket.settlementReview',
  'hudChrome.wocMarket.signFailed',
  'hudChrome.wocMarket.signFailedConfirm',
  'hudChrome.wocMarket.signing',
  'hudChrome.wocMarket.sortEnding',
  'hudChrome.wocMarket.sortLabel',
  'hudChrome.wocMarket.sortNewest',
  'hudChrome.wocMarket.sortPriceAsc',
  'hudChrome.wocMarket.sortPriceDesc',
  'hudChrome.wocMarket.strikesTip',
  'hudChrome.wocMarket.tabActivity',
  'hudChrome.wocMarket.tabBrowse',
  'hudChrome.wocMarket.tabHistory',
  'hudChrome.wocMarket.tabSell',
  'hudChrome.wocMarket.tabsLabel',
  'hudChrome.wocMarket.termsLabel',
  'hudChrome.wocMarket.termsLink',
  'hudChrome.wocMarket.title',
  'hudChrome.wocMarket.variableTokenWarning',
  'hudChrome.wocMarket.walletCardDismiss',
  'hudChrome.wocMarket.walletLinkedConnected',
  'hudChrome.wocMarket.walletLinkedDisconnected',
  'hudChrome.wocMarket.walletUsdBalance',
  'hudChrome.wocMarket.walletUsdUnknown',
  'hudChrome.wocMarket.yourListing',
  'hudChrome.wocMarket.yourListingTip',
  'hudChrome.wocStore.wallet.connect',
  'hudChrome.wocStore.wallet.connectedUnlinked',
  'hudChrome.wocStore.wallet.linkedConnected',
  'hudChrome.wocStore.wallet.linkedDisconnected',
  'hudChrome.wocStore.wallet.manage',
  'hudChrome.wocStore.wallet.mismatched',
  'hudChrome.wocStore.wallet.reconnect',
  'hudChrome.wocStore.wallet.title',
  'hudChrome.wocStore.wallet.unlinked',
  'hudChrome.wocStore.wallet.verify',
  'playerCard.shareTierBit',
  'skinEvent.close',
  'wallet.appConnected',
  'wallet.bagConnect',
  'wallet.bagLink',
  'wallet.bagReconnect',
  'wallet.balanceAmount',
  'wallet.balanceAria',
  'wallet.balancePreviewAria',
  'wallet.balancePreviewTitle',
  'wallet.balanceTitle',
  'wallet.browser.completeBody',
  'wallet.browser.completeTitle',
  'wallet.browser.continueWith',
  'wallet.browser.extensionHelp',
  'wallet.browser.eyebrow',
  'wallet.browser.failed',
  'wallet.browser.linkBody',
  'wallet.browser.paymentBody',
  'wallet.browser.retry',
  'wallet.browser.returnButton',
  'wallet.browser.reviewBody',
  'wallet.browser.reviewTitle',
  'wallet.browser.safety',
  'wallet.browser.stepUpBody',
  'wallet.browser.title',
  'wallet.connect',
  'wallet.connectApp',
  'wallet.connectAppAria',
  'wallet.connectAppTitle',
  'wallet.connectAria',
  'wallet.connectTitle',
  'wallet.connected',
  'wallet.connectedLinked',
  'wallet.connectedLinkedWithBalance',
  'wallet.connectedTitle',
  'wallet.connectedWithBalance',
  'wallet.extensionHelp',
  'wallet.flowConnect',
  'wallet.flowSign',
  'wallet.flowVerify',
  'wallet.helpDisconnected',
  'wallet.helpLinked',
  'wallet.helpLinkedDisconnected',
  'wallet.helpLinkedDisconnectedWithBalance',
  'wallet.helpLinkedWithBalance',
  'wallet.helpLoginToLink',
  'wallet.helpLoginToLinkWithBalance',
  'wallet.helpReadyToLink',
  'wallet.helpReadyToLinkWithBalance',
  'wallet.hiddenNotice',
  'wallet.hide',
  'wallet.hideAria',
  'wallet.hideTitle',
  'wallet.holder',
  'wallet.holderTiers.coinbearer.flavor',
  'wallet.holderTiers.coinbearer.name',
  'wallet.holderTiers.coppercrest.flavor',
  'wallet.holderTiers.coppercrest.name',
  'wallet.holderTiers.ember.flavor',
  'wallet.holderTiers.ember.name',
  'wallet.holderTiers.gilded.flavor',
  'wallet.holderTiers.gilded.name',
  'wallet.holderTiers.krakencrown.flavor',
  'wallet.holderTiers.krakencrown.name',
  'wallet.holderTiers.leviathan.flavor',
  'wallet.holderTiers.leviathan.name',
  'wallet.holderTiers.realmshaper.flavor',
  'wallet.holderTiers.realmshaper.name',
  'wallet.holderTiers.silverbound.flavor',
  'wallet.holderTiers.silverbound.name',
  'wallet.holderTiers.sovereign.flavor',
  'wallet.holderTiers.sovereign.name',
  'wallet.holderTiers.starhoard.flavor',
  'wallet.holderTiers.starhoard.name',
  'wallet.holderTiers.stormcaller.flavor',
  'wallet.holderTiers.stormcaller.name',
  'wallet.holderTiers.tidelord.flavor',
  'wallet.holderTiers.tidelord.name',
  'wallet.holderTiers.titanforged.flavor',
  'wallet.holderTiers.titanforged.name',
  'wallet.holderTiers.vaultwarden.flavor',
  'wallet.holderTiers.vaultwarden.name',
  'wallet.holderTiers.voidwarden.flavor',
  'wallet.holderTiers.voidwarden.name',
  'wallet.holderTiers.whale.flavor',
  'wallet.holderTiers.whale.name',
  'wallet.holderTiers.worldbearer.flavor',
  'wallet.holderTiers.worldbearer.name',
  'wallet.holderTiers.worldforger.flavor',
  'wallet.holderTiers.worldforger.name',
  'wallet.label',
  'wallet.linkedTitle',
  'wallet.manualReturnBrowserHelp',
  'wallet.manualReturnStandaloneHelp',
  'wallet.mobileAppHelp',
  'wallet.openAppButton',
  'wallet.openAppHelp',
  'wallet.openAppTitle',
  'wallet.preparingAppButton',
  'wallet.reauthCancel',
  'wallet.reauthClose',
  'wallet.reauthConfirm',
  'wallet.reauthHelp',
  'wallet.reauthNoPassword',
  'wallet.reauthTitle',
  'wallet.reauthUnlinkTitle',
  'wallet.seekerAppHelp',
  'wallet.signOut',
  'wallet.signOutAria',
  'wallet.signOutTitle',
  'wallet.standaloneAppHelp',
  'wallet.switch',
  'wallet.switchAria',
  'wallet.switchTitle',
  'wallet.unlink',
  'wallet.unlinkAria',
  'wallet.unlinkFailed',
  'wallet.unlinkTitle',
  'wallet.verify',
  'wallet.verifyAddressAria',
  'wallet.verifyAria',
  'wallet.verifyFailed',
  'wallet.verifyNew',
  'wallet.verifyTitle',
  'wallet.verifying',
  'wallet.verifyingTitle',
  'wallet.walletAppUnavailable',
  // -- The same removal, second pass: the token FAQ answer and the Daily Rewards section
  // on the public wiki, plus keys whose last consumer was a module deleted with the
  // crypto features (the trade token arm, the Exchange sell form, the wallet card).
  'guide.economy.dailyBody',
  'guide.economy.dailyTitle',
  'guide.faqPage.a2',
  'guide.faqPage.q2',
  'guide.home.faq.a2',
  'guide.home.faq.q2',
  'hudChrome.claudium.railWocUnavailable',
  'hudChrome.dailyRewards.hideChestButton',
  'hudChrome.dailyRewards.hideChestConfirmBody',
  'hudChrome.dailyRewards.hideChestConfirmCancel',
  'hudChrome.dailyRewards.hideChestConfirmOk',
  'hudChrome.dailyRewards.hideChestConfirmTitle',
  'hudChrome.dailyRewards.showChestButton',
  'hudChrome.plurals.wocMarketSellChoose.few',
  'hudChrome.plurals.wocMarketSellChoose.many',
  'hudChrome.plurals.wocMarketSellChoose.one',
  'hudChrome.plurals.wocMarketSellChoose.other',
  'hudChrome.plurals.wocTradeIneligible.few',
  'hudChrome.plurals.wocTradeIneligible.many',
  'hudChrome.plurals.wocTradeIneligible.one',
  'hudChrome.plurals.wocTradeIneligible.other',
  'hudChrome.trade.woc.accept',
  'hudChrome.trade.woc.incomingAccept',
  'hudChrome.trade.woc.incomingBody',
  'hudChrome.trade.woc.incomingTitle',
  'hudChrome.wocMarket.sellFormatAuctionBuyNow',
  'wallet.holderTierTitle',
  'wallet.linkFailed',
  'wallet.linkTitle',
  'wallet.linkedDisconnectedAria',
  'wallet.linkedDisconnectedTitle',
];

export const RETIRED_KEY_SET = new Set(RETIRED_KEYS);

// The reason stamped on every retired blocked row in the registry.
export const RETIRED_REASON =
  'Retired key: kept only for its reviewed overlay rows and the release-fill ledger; no page renders it (tests/guide_key_coverage.test.ts RETIRED_KEYS), so it is never a fill work item.';
