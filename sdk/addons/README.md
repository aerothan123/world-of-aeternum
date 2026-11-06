# Wyndlewood add-on SDK (API v1)

Build interface add-ons for Wyndlewood and share them on the Steam Workshop:
combat logs, encounter timers, minimap tweaks, damage and healing meters, and
anything else that reads what your HUD already shows and draws it your way.

- `wynd-addon-api.d.ts`: typed definitions of the `wynd` global (point your
  editor at it for completion).
- `examples/simple-damage-meter`: party DPS or HPS bars from the combat log.
- `examples/encounter-timer`: fight stopwatch, best times, target cast mirror,
  countdown bars from slash commands.
- `examples/minimap-coords`: coordinates, heading, and a square radar of the
  minimap's own markers.
- The full contract (sandbox, permissions, limits, Workshop flow) is
  `docs/design/addon-api.md` in the game repository.

## What an add-on can and cannot do

An add-on runs in an isolated worker. It can read the data your own HUD shows
(your unit, target, target of target, pet, party and raid frames, the minimap
markers, your combat log events, the chat you receive, your bags and quests),
keep saved data, register slash commands, and draw frames, text, bars and
buttons. It cannot move your character, cast, target, use items, send chat,
trade, read anything your HUD does not show, use the network, or touch files.

The one way an add-on button can do something in the game is a **secure
button** (permission `secureActions`): the action (press action bar slot N,
target a party member, toggle a window) is declared on the button ahead of
time and runs only when you click it, exactly like a keybind. It cannot be
changed while you are in combat.

## Folder layout

```
my-addon/
  addon.json      the manifest (required)
  main.js         your code (any number of .js files, loaded in order)
  preview.png     optional Workshop preview image
```

Put the folder in your add-ons folder (AddOns window > "Open add-ons folder";
on Windows it is `%APPDATA%\<game>\AddOns`), then press "Reload UI".

## addon.json

| Field | Required | Notes |
|---|---|---|
| `id` | yes | 3 to 48 chars, `a-z 0-9 -`, unique |
| `name` | yes | shown in the AddOns window and the Workshop |
| `version` | yes | `major.minor.patch` |
| `apiVersion` | yes | `1` for this SDK |
| `files` (or `entry`) | yes | `.js` paths inside the folder, load order, max 16 files / 512 KB |
| `author`, `description` | no | shown to players |
| `permissions` | no | any of `party`, `combatLog`, `chat`, `minimap`, `inventory`, `quests`, `secureActions` |
| `savedVariables` | no | `{ "account": true, "character": true }` |
| `slashCommands` | no | names you register with `wynd.slash` (no game command names) |
| `dependencies`, `optionalDependencies` | no | other add-on ids; ordering plus `wynd.comm` |
| `loadOrder` | no | 0 to 1000, default 100 (lower loads first) |
| `settings` | no | `toggle`, `slider`, `choice` rows rendered in the AddOns window |
| `tags` | no | Workshop tags: `Combat`, `Meters`, `Timers`, `Map`, `Interface`, `Chat`, `Social`, `Library` |

## A minimal add-on

```js
const frame = wynd.ui.create('frame', {
  name: 'main', point: 'CENTER', width: 160, height: 30, movable: true,
  backdrop: { color: '#000000aa', borderColor: 'accent' },
});
const label = wynd.ui.create('text', { parent: frame, point: 'CENTER', relativePoint: 'CENTER' });

wynd.on('UPDATE', () => {
  const me = wynd.unit('player');
  label.set({ text: `${me.hp} / ${me.hpMax}` });
});
```

## Events

`LOADED`, `UPDATE` (about 10 per second), `COMBAT_START`, `COMBAT_END`,
`TARGET_CHANGED`, `PARTY_CHANGED`, `ZONE_CHANGED`, `COMBAT_LOG`, `CHAT`,
`CLICK`, `FRAME_MOVED`, `SETTING_CHANGED`, `COMM`, `LOGOUT`. Payloads are typed
in `wynd-addon-api.d.ts`.

## Limits that keep the game safe

400 widgets, 2,000 characters per text, 500 interface changes per message, 64
timers (0.05 s minimum), 256 KB saved data per scope, 10 prints per second. An
add-on that throws 25 errors in a minute, stops answering for 3 seconds, or
floods the interface is stopped and must be re-enabled by the player. `eval`
and `new Function` are not available.

## Publishing to the Steam Workshop

In game: AddOns window > your local add-on > "Publish to Workshop" (Steam must
be running). From a terminal, with Steam running and logged in:

```
node scripts/addon_publish.mjs path/to/my-addon --visibility private --note "First upload"
node scripts/addon_publish.mjs path/to/my-addon --dry-run
```

The first publish creates the Workshop item and writes `workshop.json` beside
your manifest; keep that file so later publishes update the same item. If Steam
says you must accept the Workshop legal agreement, open the item page in Steam
and accept it to make the item visible.
