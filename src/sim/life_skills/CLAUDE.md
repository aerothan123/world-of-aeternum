# src/sim/life_skills - life skills as a path to the cap

Owner decision (Wyndlewood, 2026-11): gathering, crafting, work orders and
town restoration reach the cap at about 1.5x the questing time (about 45
hours against 30).

- `../professions/profession_xp.ts`: the formula-driven XP curves (a share of
  the content level's XP bar, the classic green/gray falloff, a tier bonus).
- `life_skill_xp.ts`: the anti-bot fatigue on TRIVIAL content (3 or more
  levels below the player) wrapped round those curves; runtime-only state.
- `standing_seam.ts`: the ONE path life skills grant faction standing through
  (the faction ladder formula, faction resolved by ROLE so the story crew's
  renamed ids need no edit here); daily caps on the persisted ledger in
  `life_skill_state.ts` (`CharacterState.lifeSkillStanding`).
- `town_projects.ts`: realm-wide staged restoration projects (content in
  `../content/town_projects.ts`), contributed at a site with the interact key
  (`interaction.ts`), persisted by the server (`server/town_projects_store.ts`).
  Its state is a WeakMap on the SimContext, a documented exception to the
  state-on-Sim rule while `sim.ts` sits at its monolith ceiling.
- Work orders are repeatable quests: their XP is `quests/quest_xp.ts`; the
  Hearthwright standing is granted at turn-in (`quests/quest_commands.ts`).

Pinned by `tests/life_skills.test.ts`. Draws no rng anywhere.
