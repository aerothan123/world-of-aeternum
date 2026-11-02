# Project H interface direction (the sandbox-MMO HUD)

Status: adopted for the Project H fork. Supersedes the VISUAL direction of the repo-root
`DESIGN.md` (its sections 1 to 11 and 14 to 17); the engineering contracts in `DESIGN.md`
sections 12 and 13 (fairness, i18n, performance, accessibility, CSS discipline) stand
unchanged and every packet below is gated by them. Rolls out in packets, each its own
playable change with before/after screenshots under `docs/screenshots/project-h-hud/`.

## The direction in one paragraph
The reference feel is the modern sandbox MMO of the New World generation: the world is the
whole screen and the interface is a thin, quiet layer of information laid over it. No
ornate frames, no painted plates, no portraits in medallions. Hairline rules, generous
whitespace, restrained translucency, a near-monochrome palette with one warm accent, and
an elegant serif for headings over a clean sans for data. Everything a player reads sits
where their eye already is: heading and objectives along the top, vitals and hands at the
bottom center, the interaction prompt right at the crosshair. Menus are full-screen
screens, not floating windows.

This is an ORIGINAL interface in that spirit. It never reproduces another game's art,
icons, fonts, layout measurements or copy; the published game is the reference for a
philosophy, nothing in it is copied.

## Visual signature (every surface carries all four)
1. **Quiet dark fill.** Panels are charcoal, not blue-black metal: `rgba(14,14,16,0.72)`
   class translucency on the HUD, near-opaque on full-screen menus. Never pure black.
2. **Hairline edges.** One-pixel rules in a warm off-white at low alpha
   (`--line-faint`), and a single warm accent (`--accent`, an antique brass) for the
   selected or active state only. No bevels, no double borders, no corner ornaments.
3. **Type carries the hierarchy.** Headings in a classical serif with wide tracking and
   small caps; body and numerics in the sans. Primary text is warm white, secondary is
   mid grey; colour is reserved for rarity, faction and status.
4. **Flat depth.** No drop shadows on HUD elements; a soft 1px text shadow for legibility
   over bright terrain. Full-screen menus darken the world behind them with a vignette.

## Tokens (names only here; values live in `src/styles/tokens.css`)
- Surfaces: `--surface-hud`, `--surface-menu`, `--surface-row`, `--surface-row-hover`.
- Lines: `--line-faint`, `--line`, `--line-strong`, `--accent`, `--accent-soft`.
- Text: `--text`, `--text-dim`, `--text-faint`, `--text-invert`.
- Vitals: `--vital-health`, `--vital-mana`, `--vital-stamina`, `--vital-xp`.
- Type: `--font-display` (serif, headings), `--font-body` (sans), `--track-caps`.
- Radii: `--radius-none` is the default; `--radius-soft` (2px) only on quick-slot icons.
Every existing `--color-*` token keeps resolving (the theme engine `src/ui/theme.ts`
maps the old names onto the new palette) so no painter has to change to pick up the look.

## Desktop HUD composition
```text
+--------------------------------------------------------------------+
|  Status effects         COMPASS STRIP (N . NE . E) with markers    |
|  Party vitals (thin)                              Objectives        |
|                                                   (text, rules)     |
|                          GAME WORLD                                 |
|                        [E] Interaction                              |
|                                                                     |
| Chat (collapsed to a      Quick slots . weapon slots . consumables  |
|  single faded line)       HEALTH ========================  level    |
|                           mana ---------- stamina ----------        |
+--------------------------------------------------------------------+
```
- **Compass strip** (`src/ui/hud/compass/`): a 520px wide, 22px tall band at top center
  showing the heading scale with cardinal letters, quest and objective markers, tracked
  gather nodes, party members and the active town marker, each a glyph from `ui_icons.ts`.
  It REPLACES the minimap as the default; the minimap stays available as an option
  (`settings.minimapMode: 'compass' | 'minimap' | 'both'`), and the world map (M) is
  unchanged. Fairness: markers on the compass are the same set the minimap shows today
  (pinned by a parity test), so no tier or mode hides an actionable marker.
- **Vitals bar** (`src/ui/hud/vitals/`): a single wide health bar (420px) at bottom
  center with the level numeral at its right end, mana and stamina as thin 4px bars under
  it. No portrait, no ribbon. The target's vitals appear as a thin bar under the compass
  only while something is targeted (same `unit_frame` family, new descriptor).
- **Hands row**: the action bar becomes a row of 36px square slots above the vitals, no
  rail, no XP bar plate; XP is a 2px line along the very bottom edge of the screen.
- **Interaction prompt**: centered just below the crosshair point, `[E] Verb Object`
  in the display serif, with the hold-to-interact ring drawn around the key chip.
- **Objectives**: top right, text only, a hairline rule under the zone name, quest
  titles in small caps, objectives in the sans with a thin progress tick.
- **Status effects**: top left under the compass, 26px icons with a thin duration line.
- **Chat**: bottom left, collapsed to the last three lines at 60 percent alpha, full
  panel on focus.

## Full-screen menus (inventory, character, crafting, housing, map)
One `ScreenShell` component (`src/ui/screen/`): the world dims under a vignette, a
top tab strip in small caps (Inventory . Character . Crafting . Housing . Map . Journal),
a left content column and a right detail column separated by a hairline, Esc closes. The
inventory is a grid of 48px slots with a weight meter and sort controls in the header;
the detail column shows the selected item with its full tooltip inline. Crafting shows the
recipe list on the left, the output preview and the material pickers on the right, with
the quantity stepper and the big Craft button at the bottom right. Housing uses the same
shell for the furniture placer and the storage chest. Existing floating `.window`
painters migrate one at a time behind the shell; a window not yet migrated keeps working
in its current form (same selectors, same `t()` keys) so the rollout never breaks play.

## Rollout packets
1. **Theme and type**: tokens, theme-engine mapping, fonts, the `.panel` chrome flattened
   to the hairline signature, the vitals bar and hands row, the XP line. Screenshots.
2. **Compass strip** with the minimap mode setting and the marker parity test.
3. **Interaction prompt + objectives + status effects + chat collapse.**
4. **ScreenShell** with the inventory and character screens migrated.
5. **Crafting and housing screens** (the Furnishing placer and storage chest ride here).
6. **Map screen** and the remaining windows.

## Guardrails (unchanged from the repo contracts)
Graphics tiers may shed decoration, never information (`DESIGN.md` 13.1). Every per-frame
write goes through the PainterHost writers (13.2). Every string is a `t()` key (13.3).
Colors, fonts and durations are tokens, never literals in TS (13.4). WCAG 2.2 AA holds on
every screen (section 12). Mobile stays functional on day one and gets its own layout
packet after desktop packet 3.
