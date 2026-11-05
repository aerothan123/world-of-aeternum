# Wyndlewood Discord server

The community server is kept in line by `scripts/discord/server_admin.mjs`, a
zero-dependency REST tool, from the declarative spec in
`scripts/discord/wyndlewood_server.json` (roles, categories, channels, topics,
slow mode, read-only channels). The prepared posts live beside this file.

## One-time setup (owner)
1. In the Discord Developer Portal create an application named Wyndlewood
   Keeper, add a Bot, and copy its token.
2. Put `DISCORD_BOT_TOKEN=<token>` in the local `.env` (never commit it).
3. Invite the bot with the OAuth2 URL generator: scope `bot`, permission
   Administrator (or Manage Server, Manage Roles, Manage Channels, Send
   Messages, Attach Files, Embed Links, Read Message History). The bot's role
   must sit above the roles it edits.

## Commands (from the repo root, with the token in the environment)
- `node scripts/discord/server_admin.mjs whoami`
- `node scripts/discord/server_admin.mjs apply [--prune-defaults]`
- `node scripts/discord/server_admin.mjs icon <image.png>`
- `node scripts/discord/server_admin.mjs post <channel> <message.md> [images...]`

`apply` is idempotent: it creates what is missing and updates what differs.
It deletes nothing unless `--prune-defaults` is passed, which removes only the
empty defaults listed under `pruneDefaults` and empty unlisted categories.
