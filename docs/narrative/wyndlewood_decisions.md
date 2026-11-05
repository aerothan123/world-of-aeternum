# Wyndlewood: narrative integration decisions

Owner decisions on how `docs/narrative/wyndlewood_bible.md` maps onto the
shipped game, taken after the bible-vs-game gap review. Read this alongside the
bible; where the two disagree, this file wins.

## 1. Main story: reframe, do not replace
The shipped Gravecaller / Wyrmcult campaign (Brother Aldric's chain in Eastbrook,
through Fenbridge and Highwatch to Korzul the Gravewyrm) stays. Its quests, mobs
and bosses are reframed in quest text as cells and agents of the Pale Accord
working toward Vauldren Sere's return. Ids stay frozen; only display text and
quest prose change.

## 2. Dungeons: shift the story to the shipped level bands
Dungeons keep their current zones and levels. The chapter outline bends to them:
- Chapter One (Proving Shore, Eastbrook, levels 1 to 4) ends by pointing the
  player toward the Hollow Crypt (levels 7 to 10) rather than clearing it.
- The Sunken Bastion (Mirefen, levels 11 to 13) carries the drowned-bells beats
  and becomes part of the Mirefen chapter.
- The Drowned Temple (Thornpeak, 16 to 18) and Gravewyrm Sanctum (Thornpeak,
  18 to 20) follow their shipped zones.
- The Last Keep and Dawnhold Castle need encounter builds; the Wildheart Basin
  needs a reframe or a new instance for the final ritual.
The chapter-by-chapter level table is redrawn in the campaign outline that
follows this file.

## 3. Factions: adopt the bible's five
Replace the three provisional code factions with the bible's five:
Lanternwardens, Hearthwright Compact, Bracken Circle, Gilt Measure, and the
hostile Pale Accord. This is a sim change (faction ids, zone mapping, vendors,
persistence, tests), not a rename.

## 4. Names
- Gravebound is renamed **Gravestirred** (Gravebound collides with a Pathfinder
  undead creature of the same role).
- The Age of First Fires is renamed **the Age of First Hearths** (avoids the
  Dark Souls "Age of Fire" / "First Flame" echo).
- Vauldren Sere's folklore title "the Unhoused King" (a modern real-world term
  for homelessness) is replaced; proposed: **the Oathless King** (no game hits
  on an exact-phrase search), pending owner sign-off.
- Internal clashes to resolve when the NPCs ship: Pale Accord vs the shipped
  Pale Choir (make them related on purpose), Holven Rusk vs Brother Halven,
  Ossivar vs Gaoler Ossick in the same dungeon, Garrick Vellthorn vs Garrick
  Holt, Hester Crumblepot vs Hester Gourdwick, Pella vs the existing Pell NPCs.

## 5. Open items
- The 28 Chapter One quests the bible refers to are not in the repo; the owner
  supplies them if they exist.
- Systems the bible assumes that do not exist yet: moral-choice branches, boat
  repair, quest credit for fishing and for real-tree chopping. Each lands as its
  own sim module before the quests that need it.

## 6. Integration record (feature/wyndlewood-story)
- **Factions.** The three provisional ids migrate on load: `church_order` to
  `lanternwardens`, `automatons` to `hearthwright_compact`, `rift_watch` to
  `gilt_measure` (`src/sim/factions.ts` LEGACY_FACTION_IDS; the successor key
  wins when a save holds both). `bracken_circle` is new. The Pale Accord is a
  hostile mob grouping, not a standing ladder. Currency and deed ids stay
  frozen; the three shipped faction deed ladders keep their triggers (design
  rule 9) and now name the successors, and the Bracken Circle's pair is
  appended. The all-banners meta still asks for the shipped three.
- **The Oathless King.** Lives in one constant,
  `src/sim/content/wyndlewood_lore.ts` OATHLESS_KING_TITLE. Still awaiting
  owner sign-off.
- **NPC renames shipped (display only, ids frozen).** Ferryman Odo is Captain
  Fenlow Tippet, Marshal Redbrook is Warden Corren Stoutvale, Trader Wilkes is
  Silven Brackett, Apothecary Lin is Ivara Fenmoss, Forgemistress Darva is
  Brunna Flintmorrow.
- **Renames not applied, by design.** The owner's Chapter One places Corren,
  Brunna, Neris, Jorren and Olvessa in Eastbrook, so Brunna maps onto the
  Eastbrook forge NPC (Darva) rather than Armorer Hode, Corren onto the
  Eastbrook marshal rather than Drillmaster Rook, and Neris, Jorren and
  Olvessa ship as new Eastbrook townsfolk. Drillmaster Rook, Armorer Hode,
  Scout Einna, Innkeeper Maudie (Mirefen) and Herbalist Yara (Fenbridge, now
  the Bracken Circle quartermaster) keep their names. Owner call whether those
  five still need the bible's names elsewhere.
- **Clashes.** Holven Rusk (the bible's crypt caretaker) folds into the shipped
  Sexton Marrow; the owner's Holven Marr ships as Eastbrook's gravekeeper. Holven
  Marr vs Brother Halven and Pella Nookwright vs the existing Pell NPCs ship
  as-is (full names differ, different towns); the smallest display-only fix,
  if the owner wants one, is a first-name swap on the new NPC only (ids are
  new, so nothing persisted changes). The Pale Choir is written as the Pale
  Accord's liturgy. Ossivar, the two Garricks and the two Hesters are not
  shipped by this pass.
- **Chapter One.** The owner's quest set is committed verbatim as
  `docs/narrative/chapter_one_quests.txt`; positions are in
  `docs/narrative/chapter_one_placements.md`.
