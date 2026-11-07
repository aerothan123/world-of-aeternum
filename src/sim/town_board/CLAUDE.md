# src/sim/town_board/

The town quest board: a noticeboard that posts a rotating handful of daily
quests (the owner's Eastbrook board, docs/narrative/chapter_one_quests.txt).

- `town_board_rotation.ts` is pure: a board's day postings come from the seeded
  `Rng` keyed by the board id and the realm-day cycle
  (`world_quest_rotation.ts` worldQuestCycleNumber). Never a clock.
- `town_board_access.ts` holds the shared rules: the board registry
  (`content/town_board_dailies.ts` TOWN_BOARD_DEFS), the off-day set folded
  into `quests/quest_commands.ts` repeatBlockedQuestIds, and the
  stand-at-the-board accept check.
- A posting is an ordinary `QuestDef` with `townBoard` set, `repeatable` and
  `dailyReset`: the once-per-day lock, persistence and server-authoritative
  credit are the quest system's own. Its `giverNpcId` is the NPC who posted
  it; that NPC takes the turn-in and never offers it (quest_marker_kind.ts).
- The day is the character's realm-day cycle (`PlayerMeta.worldQuestCycle`,
  rolled at every level by `world_quests.ts` updateWorldQuests), which the
  online client already mirrors as the `wqday` self key and both worlds expose
  as `IWorld.worldQuestCycle`: the HUD calls `townBoardPostings(boardId,
  world.worldQuestCycle)` and the server's repeat-blocked set reads the same
  cycle, so no new wire key or IWorld member was needed.
