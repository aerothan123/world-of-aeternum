# Quest Workshop

A dev-only web page for adding quests to the quest givers already in the world
without editing TypeScript. It is a form, not a JSON editor: pick a giver, fill in
the name, the text, the objectives and the rewards, and press Save.

## Opening it

1. `npm run dev` (the Vite dev server on port 5173).
2. Open `http://localhost:5173/quest_editor.html`.

The page is served only by the dev server. It has no entry in the production build
(`vite.config.ts` `rollupOptions.input` does not list it, exactly like
`music_editor.html`), so it never reaches a deployed site.

## What it writes

Save posts the whole workshop set to the dev server's `/__quest_editor/save`
endpoint (`vite.config.ts` `questEditorSavePlugin`). The endpoint accepts only
loopback, same-origin requests, caps the body, re-validates every quest in a fresh
child process (`scripts/quest_workshop_save.mjs` running
`src/quest_editor/workshop_save.ts`, the same pure rules the page runs:
`src/quest_editor/quest_editor_core.ts`), and only then writes

- `src/sim/content/workshop_quests.generated.ts`: `WORKSHOP_QUESTS`,
  `WORKSHOP_QUEST_ORDER`, `WORKSHOP_NPC_QUEST_IDS` (the ids each giver and turn-in
  NPC additionally offers) and `WORKSHOP_QUEST_IDS`, emitted deterministically
  (sorted by id, biome-clean) so two saves of the same set are byte-identical;
- `src/guide/content.generated.ts`, regenerated so `tests/guide.test.ts` stays fresh.

`src/sim/data.ts` merges the set at table assembly through
`src/sim/content/workshop_merge.ts`: each quest joins `QUESTS` and `QUEST_ORDER`, and
every named NPC's `questIds` grows by the quest id (append, dedupe). Because the
merge lives in `src/sim/`, the offline client, the authoritative server and the
headless env all offer the quests identically. A quest with validation errors cannot
be saved; the page lists each error in plain English next to the form.

Commit the generated module (and the regenerated guide content) like any other
content change. Before committing, run `npm run i18n:gen` (any `npm test` or
`npm run build` runs it too): the quest text joins the i18n catalog through
`src/ui/world_entity_i18n.ts`, and the committed resolved tables must match.

## Picking the quests up

- Offline client: reload the page; the dev server hot-reloads the generated module.
- Online realm: restart `npm run server` (it bundles `src/sim/` at start), and
  redeploy the droplet for production. A running server never re-reads content.

## What the form covers

- Giver (any NPC that already offers quests) and turn-in NPC (any NPC; defaults to
  the giver).
- Name, intro text and completion text (`$N` is the player's name, `$C` their class).
- Objectives of the five form-authorable kinds: slay creatures, collect items, talk to
  an NPC or use a world object, gather from nodes (optionally a specific material),
  craft a recipe. Each has a count and the log line it shows as.
- Rewards: experience, money (gold, silver, copper), choose-one items, per-class items,
  a recipe taught.
- Requirements: minimum and maximum level, a prerequisite quest, a class restriction.
- The id is made from the name (`q_ws_<slug>`), editable, and must be unique against
  every shipped quest and every other workshop quest.

Scripted objective kinds (escort, farm, event) and the scripted QuestDef fields
(repeatable cadences, completion effects, seasonal gates) are not in the form: they
belong to a system module and are authored in code.

## i18n

Workshop quest text is player-visible English that resolves through `tEntity` like
every shipped quest. It is the owner's own content and ships as written: the i18n
registry marks its locale rows `blocked` instead of `pending`
(`scripts/lib/workshop_quest_keys.mjs`, consumed by `scripts/i18n_scan.mjs`,
`scripts/i18n_build.mjs`, `tests/i18n_completeness.test.ts` and
`tests/i18n_status_registry.test.ts`), so it is never a release-fill work item and the
M16 non-Latin leak guard does not fire on it. The exemption is keyed on exactly the
ids in the generated module, which only the tool writes, so no shipped quest can ride
it. The page's own labels live in `src/ui/i18n.catalog/quest_editor.ts` (namespace
`questEditor`, a dev-only surface treated like `devCommand`).

## Naming

Quest names are player-visible proper nouns, and the naming-originality rule in
`src/sim/content/CLAUDE.md` applies to them: the owner is responsible for checking a
coined or distinctive name against other games before it ships.

## Tests

- `tests/quest_editor_core.test.ts`: the slug and id rule, every validation issue
  class, the prerequisite cycle check, the JSON round trip, byte-stable and
  biome-clean emission.
- `tests/workshop_quests.test.ts`: the merge, the committed module's shape, and a
  merged quest accepted, credited by a kill and turned in inside a real `Sim`; it also
  pins that a workshop quest never moves the live-world touch-up baseline
  (`src/sim/world_touchup.ts` strips workshop ids from the NPC rows it hashes).
- The usual content guards sweep workshop quests like any other quest once saved
  (`tests/progression.test.ts` referential integrity, `tests/localization_coverage.test.ts`,
  `tests/guide.test.ts`).
