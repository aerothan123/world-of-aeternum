# Wyndlewood Chapter Two: quest outline (levels 5 to 13)

Status: outline for the story crew. It lists titles, givers, objective types,
one-line hooks and factions. Full quest text is written later in the bible's
quest format (bible section 14).

Working title: **The Bells Beneath the Tide**. This chapter merges the
bible's Chapter Two (the drowned bells) with the Mirefen half of Chapter
Three. That follows the decisions file
(`docs/narrative/wyndlewood_decisions.md`, item 2): the Sunken Bastion is the
Mirefen dungeon at levels 11 to 13. The memory-harvest thread around Mistress
Veska Noll is only seeded here; it pays off at the Drowned Temple in
Thornpeak at levels 16 to 18.

---

## 1. Scope and regions

| Region | Levels | Hubs (proposed; the world crew to confirm placement) | Lead faction |
|---|---|---|---|
| Eastbrook Vale (breadcrumbs, Hollow Crypt) | 5 to 9 | Eastbrook | Lanternwardens |
| The Applewold | 6 to 9 | Pressford (cider town), Ferncross (crossroads post) | Hearthwright Compact |
| The Kindlemoor | 8 to 11 | Coinwell Camp (prospectors), the Unlit Dig (mine), the First Hearth Ring (stone circle) | Gilt Measure and Bracken Circle |
| Mirefen Marsh | 7 to 13 | Fenbridge (shipped) | Lanternwardens |
| The Chalkbarrow Coast | 10 to 13 | Causeway Watch (coastal fort) | Lanternwardens |

Routing: players reach the Applewold and Mirefen from Eastbrook, which gives
two parallel roads at levels 6 to 9. Both lead into the Kindlemoor and
Mirefen at 9 to 11. Everything converges on the Chalkbarrow Coast and the
Sunken Bastion at 11 to 13.

**Request to the world crew.** Put the Sunken Bastion door where the
Mirefen and Chalkbarrow Coast meet, so both roads end there. Its current
`doorPos` (`src/sim/content/dungeons.ts`) is in south Mirefen.

## 2. XP budget

Levels 5 to 13 cost 49,300 XP (`XP_TABLE`). At the owner's target of about
30 hours to 20 by questing, quests pay about 10% of the current level's bar.
XP sizes use the bible's small, medium and large:

| Size | Share of the bar at quest level | Level 6 | Level 9 | Level 12 |
|---|---|---|---|---|
| Small (side, daily) | about 7% | 250 | 450 | 700 |
| Medium (most quests) | about 10% | 360 | 650 | 1,010 |
| Large (main, chapter beat) | 15 to 25% | 540 to 900 | 975 to 1,625 | 1,515 to 2,525 |

This outline has 42 quests. Twelve are already shipped: eleven in Mirefen
and `q_hollow` in Eastbrook. Those are reframed, not replaced. Add the quest boards' dailies and the two dungeons,
and a player who finishes about 70% of this list reaches 13.

**Shipped Mirefen quests are retuned to these sizes in the same change that
reframes their text.** Today they pay about 18 to 25% of the bar. Their ids
stay frozen.

## 3. Mechanics used
Only mechanics that exist or that the story crew has built: fetch (collect),
kill, gather in a marked area, fishing, craft at a station, escort, use an
item on an object, delivery, and speak or inspect.

There is no boat repair and no moral-choice branch. Those need sim modules
first (decisions file, item 5).

## 4. Names
- Givers are existing named NPCs from the shipped game, the Chapter One file
  or the bible.
- Where a new hub needs a local giver, the outline names a **role**
  ("the Pressford cider-master"). The story crew names the role, and each
  name gets the naming check (`docs/design/naming-audit.md`) before it ships.
- The outline invents no new proper names. Quest titles are plain English
  working titles.
- Avoid the known clashes in the decisions file, item 4: no Hester, no
  Ossivar, and no new Garrick.
- **The bells commander.** The bible's drowned commander role
  (Bellwarden Ossivar Drench) is given to the shipped Knight-Commander Olen
  (`knight_commander_olen`). His fight already carries tide mechanics
  (`tide_sentence`, `hallowed_brine`). Vael the Fogbinder
  (`vael_the_mistcaller`) stays the final boss, reframed as the Pale Accord
  cell leader who woke Olen's bells.

---

## 5. The quests

Columns:
- **Kind**: M is main, S is side, L is life skill.
- **Objectives**: K kill, F fetch or collect, G gather in a marked area,
  Fi fishing, C craft at a station, E escort, U use an item on an object,
  D deliver, T talk or inspect.
- **Size**: S small, M medium, L large.

### Act A: Eastbrook, the wreck goods (levels 5 to 6)
| # | Title | Lvl | Kind | Giver to turn-in | Objectives | Hook | Faction | Size |
|---|---|---|---|---|---|---|---|---|
| 1 | Cargo From a Ship That Sank Twice | 5 | M | Fenlow (Eastbrook quay) to Silven (market stall) | F crates on the shore; T inspect cargo marks | Cargo from a ship lost years ago washes up dry, with a Gilt Measure seal | Lanternwardens | L |
| 2 | Whose Seal Is This | 5 | M | Silven to Silven | D ledger copy to the Pressford cider-master; T read the shipping roll | The seal belongs to a Pressford cider consignment that never sailed | Gilt Measure | M |
| 3 | Bells You Can Hear From the Steps | 5 | S | Tobbin Wickerby (Eastbrook fishing steps) | Fi 5 harbor fish; U listening horn on the jetty post | The fish are fleeing something that rings under the water | Bracken Circle | S |
| 4 | A Lantern for the South Road | 6 | S | Neris (northern lookout) to the Ferncross post sergeant | D lantern oil; U refill 3 road lanterns on the way | The south road lanterns keep going out | Lanternwardens | M |

### Act B: the Applewold (levels 6 to 9)
| # | Title | Lvl | Kind | Giver to turn-in | Objectives | Hook | Faction | Size |
|---|---|---|---|---|---|---|---|---|
| 5 | Pressford Remembers a Harvest | 6 | M | Pressford cider-master | T 3 villagers; F 4 misremembered tally sticks | The town swears it shipped cider that no one ever pressed | Hearthwright | L |
| 6 | Wasps in the Windfalls | 6 | S | Della Brindlepot (moved to the Pressford orchards) | K 8 orchard wasps; G 6 windfall apples | The orchard pests have gone bold and strange | Bracken Circle | M |
| 7 | The Press Will Not Turn | 7 | L | Pella Nookwright (visiting Pressford) | G 4 orchard oak logs; C 1 press gear at the town workbench; U fit it to the press | The great press seized overnight, and the town needs it running | Hearthwright | M |
| 8 | Cord in the Cider Vat | 7 | M | Pressford cider-master to Brother Aldric (Eastbrook chapel) | U drain the vat; F 2 cold black cords | The same cold cord from the Proving Shore beacon turns up in the press | Lanternwardens | L |
| 9 | Ferncross Holds the Road | 7 | S | Ferncross post sergeant | K 10 road bandits; F 3 stolen waybills | Bandits have been paid to stop carts heading south | Lanternwardens | M |
| 10 | Seed for a Second Planting | 7 | L | Della Brindlepot | G 5 orchard herbs; C 1 seed pouch at the field bench; U plant 3 patches | Replant the blighted rows before the frost | Bracken Circle | M |
| 11 | The Door We Left Shut | 7 | M | Holven Marr (Eastbrook graveyard) to Brother Aldric | T the Outer Wicket; F crypt key from the sexton's lodge | Chapter One's warning was right: now the crypt must be opened (leads into the Hollow Crypt) | Lanternwardens | L |
| 12 | Into the Hollow (`q_hollow`, shipped) | 8 to 9 | M | Brother Aldric | K Morthen in the Hollow Crypt (shipped instance) | A dungeon run that recovers a Hearthpin fragment; the vision of bells under the sea | Lanternwardens | L |
| 13 | A Kitchen for the Pickers | 8 | L | Jorren (inn) to the Pressford cider-master | Fi 3 brook trout; G 3 apples; C 4 orchard pies at the kitchen station; D to the pickers | The pickers have worked through supper all week | Hearthwright | S |

### Act C: the Kindlemoor (levels 8 to 11)
| # | Title | Lvl | Kind | Giver to turn-in | Objectives | Hook | Faction | Size |
|---|---|---|---|---|---|---|---|---|
| 14 | Coin for a Quiet Road | 8 | M | Silven to the Coinwell Camp claim-master | D a sealed payment; T 2 claim posts | The Gilt Measure's camp is paying the same bandits Ferncross is fighting | Gilt Measure | M |
| 15 | Lanterns That Will Not Light | 9 | M | Unlit Dig foreman (role) | U light 4 tunnel lamps; K 8 dig crawlers | No flame stays lit in the new shaft | Hearthwright | L |
| 16 | Ore With a Will | 9 | L | Brunna (traveling smith, at Coinwell) | G 6 kindle ore; C 1 test ingot at the camp forge | The ore warms in the hand, and Brunna wants to know why | Hearthwright | M |
| 17 | The Claim Nobody Filed | 9 | S | Coinwell Camp claim-master | F 3 forged claim papers from the moor wagons | Someone is filing claims on land that does not exist yet | Gilt Measure | M |
| 18 | Moor Hounds at the Peat Cuts | 9 | S | Coinwell Camp cook (role) | K 10 moor hounds; F 4 hound pelts for Tanner Hesk | The hounds are herding the cutters off the moor | Lanternwardens | S |
| 19 | The First Hearth Ring | 10 | M | Ivara (apothecary, visiting the Ring) | T 5 standing stones; U the Hearthpin fragment on the hearth stone | The fragment warms at the old stone circle, and Ivara wants to see it | Bracken Circle | L |
| 20 | Ash From Before the Kingdom | 10 | M | Ivara to Orwin (Eastbrook) | G 4 hearth ash samples; D to Orwin | The hearth stone's ash is older than the first kingdom | Bracken Circle | M |
| 21 | Fires That Should Not Burn | 10 | S | Unlit Dig foreman | K 6 ember sprites; U douse 3 fuel-less fires | Tunnel fires burn with nothing to feed them | Hearthwright | M |
| 22 | A Measured Escort | 10 | M | Coinwell Camp claim-master | E an assay cart to Causeway Watch | The camp sends its richest samples south, and wants witnesses | Gilt Measure | M |
| 23 | Heath Herbs for the Fen Healers | 10 | L | Herbalist Yara (Fenbridge) | G 6 heath herbs on the Kindlemoor; C 2 marsh poultices at the apothecary | Fenbridge runs short as the fog sickness spreads | Bracken Circle | S |

### Act D: Mirefen Marsh (levels 7 to 13; shipped chain, reframed)
Shipped quest ids are frozen. Only text and XP size change.
| # | Title (shipped) | Lvl | Kind | Giver | Objectives | Reframed hook | Faction | Size |
|---|---|---|---|---|---|---|---|---|
| 24 | Muster at Fenbridge (`q_fenbridge_muster`) | 7 | M | Brother Aldric | F | Villages are vanishing into the fog; Fenbridge calls for help | Lanternwardens | M |
| 25 | Teeth of the Fen (`q_prowlers`) | 7 | S | Warden Fenwick | K | Prowlers driven out of fog-lost land | Lanternwardens | M |
| 26 | The Deepfen Stirs (`q_deepfen`) | 8 | S | Warden Fenwick | K | Shore dwellers dredging for something the Accord pays for | Lanternwardens | M |
| 27 | Idols of the Deep (`q_idols`) | 8 | M | Brother Aldric | F | The idols carry the same cold cord | Lanternwardens | M |
| 28 | Silk and Venom (`q_widows`) | 8 | S | Herbalist Yara | K, F | Widow venom for the fog-sick | Bracken Circle | M |
| 29 | The Drowned Dead (`q_drowned`) | 9 | M | Brother Aldric | K | Drowned sailors from the ships that vanished, walking the marsh | Lanternwardens | L |
| 30 | Remembered Roofs | 9 | M (new) | Chronicler Osric Fenn | T 3 houses that appeared overnight; F 3 memory-wet keepsakes | Homes stand where none stood yesterday (seeds Veska Noll) | Bracken Circle | M |
| 31 | Robes in the Reeds (`q_cult_camp`) | 11 | M | Scout Maren | K | The fog camp is a Pale Accord cell; no name yet | Lanternwardens | M |
| 32 | Stopping the Summoning (`q_summoners`) | 11 | M | Brother Aldric | K, F | Ciphers name a buyer for memories | Lanternwardens | L |
| 33 | The Deacon of the Mire (`q_deacon`) | 12 | M | Warden Fenwick | K | The cell's deacon holds a chart of the drowned fortress | Lanternwardens | L |
| 34 | A Bridge Fenbridge Can Trust | 10 | L (new) | Provisioner Hale | G 6 bog alder logs; C 2 boardwalk planks; U replace 2 rotten spans | The walkways sink as the fog takes the marsh | Hearthwright | M |
| 35 | Paddy Work in the Fog | 10 | L (new) | Farmer Teasel | G 5 crop bundles; Fi 3 paddy eels | A harvest no one remembers sowing must still come in | Hearthwright | S |

### Act E: the Chalkbarrow Coast and the Sunken Bastion (levels 10 to 13)
| # | Title | Lvl | Kind | Giver to turn-in | Objectives | Hook | Faction | Size |
|---|---|---|---|---|---|---|---|---|
| 36 | Causeway Watch | 10 | M | Corren (posted south) | T the watch captain (role); D the Pressford cords | The cord, the cargo and the bells all point to this coast | Lanternwardens | M |
| 37 | Chalk Cliff Nests | 11 | S | Causeway Watch quartermaster (role) | K 10 cliff gulls; F 5 nest-stolen buttons | The gulls are stealing from the drowned, which is a bad sign | Lanternwardens | S |
| 38 | Bells at Low Tide | 11 | M | Fenlow (arrives by boat) | U ring 3 tide gauges at low water; Fi 3 bell-struck fish | The bells change the tide; prove it before the next flood | Lanternwardens | L |
| 39 | A Causeway Worth Crossing | 12 | L | Pella Nookwright | G 4 chalk blocks; C 2 causeway braces at the camp workbench; U set them | The tide road to the fortress is the only way in | Hearthwright | M |
| 40 | Salvage Rights | 12 | S | Silven | F 4 wreck strongboxes on the shoals | The Gilt Measure wants the lost cargo back, and the wreck is sealed with its own coin | Gilt Measure | M |
| 41 | The Sunken Bastion (`q_bastion_door`, shipped) | 12 | M | Brother Aldric | F the ward stone at the door | The fortress door opens to the Hearthpin fragment | Lanternwardens | M |
| 42 | The Fogbinder (`q_mistcaller`, shipped) | 12 to 13 | M | Brother Aldric | K Olen and Vael in the instance | Silence the bells; recover the chart to the hidden marsh temple (Chapter Three hook) | Lanternwardens | L |

Faction tally: Lanternwardens 20, Hearthwright 9, Bracken Circle 8, Gilt
Measure 5. The faction boards (being built by the quest-board crew) should
tilt toward Gilt Measure and Bracken Circle dailies here to even it out.

## 6. Dailies for the new hubs (quest-board templates)
The pattern follows the Chapter One daily file.
- **Pressford:**
  - orchard pests (K);
  - windfall and timber gathering (G);
  - pie deliveries (D).
- **Ferncross:** road patrol inspections (T), bandit bounty (K).
- **Coinwell Camp:**
  - assay deliveries (D);
  - claim post inspections (T);
  - kindle ore (G).
- **The First Hearth Ring:** heath herb gathering (G), stone cleansing (U).
- **Causeway Watch:**
  - gull culls (K);
  - tide gauge service (U);
  - shore fishing (Fi).

## 7. Chapter beats (for the story crew)
1. **Opening.** Chapter One's bells, and its cargo mystery, go south.
2. **Midpoint.** The Hollow Crypt fragment, and the First Hearth Ring
   reaction, show that the Hearthpins answer old hearths. Everyday work
   matters, which is the game's pillar.
3. **Turn.** The Pale Accord cell in the fog is buying memories and waking
   the drowned bells to drown the harbor. Players still never hear the name.
4. **Climax.** The Sunken Bastion. Olen's bells fall silent, and Vael falls.
5. **Hook.** A chart to a temple beneath the marsh, which paths into
   Chapter Three and Thornpeak. Fenlow sails home.
