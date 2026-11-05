# Live ops runbook (Early Access)

Operator procedures for the Wyndlewood realm. Companion to `DEPLOY.md`
(host setup, updates) and `docs/launch/backup-restore-runbook.md`. All the
commands below run ON the game host against `127.0.0.1:8787`, never through
the public edge (which answers 404 for `/internal/*`).

## Production guard for dev commands

The boot fails closed (`server/dev_commands_boot_guard.ts`, run first in
`startServer`): `ALLOW_DEV_COMMANDS=1` is honored only with an explicit
`WOC_ENV=development` or `WOC_ENV=test`. An unset or unknown `WOC_ENV`
refuses, and `WOC_ENV=production` refuses even with the override. The log line
starts `refusing to boot:`. Fix on a real host: remove `ALLOW_DEV_COMMANDS`
from `.env` and restart. Developers add `WOC_ENV=development` to their local
`.env`. `ALLOW_DEV_COMMANDS_LOCAL_OVERRIDE=1` only matters for the production
image on a laptop (`NODE_ENV=production`, dev `WOC_ENV`, loopback
`DATABASE_URL`).

Belt and braces: the `DevCommandsOnPublicRealm` alert
(`deploy/alerts/wyndlewood.rules.yml`) pages when `woc_dev_commands_enabled`
reads 1, the same flag `/api/status` advertises as `dev_commands`.

## Maintenance mode

A countdown broadcast in game chat, then a login gate: non-staff entries are
refused with "The realm is closed for maintenance" while staff can still log
in to check the realm (`server/maintenance.ts`).

```sh
SECRET=$(grep ^RESTART_COUNTDOWN_SECRET /opt/eastbrook/.env | cut -d= -f2-)
# start a 15 minute countdown (1 to 120, default 10)
curl -s -X POST -H "x-woc-deploy-secret: $SECRET" -H 'content-type: application/json' \
  -d '{"action":"start","minutes":15}' http://127.0.0.1:8787/internal/maintenance
# status
curl -s -H "x-woc-deploy-secret: $SECRET" http://127.0.0.1:8787/internal/maintenance
# cancel a countdown, or end an active maintenance (reopens logins)
curl -s -X POST -H "x-woc-deploy-secret: $SECRET" -H 'content-type: application/json' \
  -d '{"action":"cancel"}' http://127.0.0.1:8787/internal/maintenance
curl -s -X POST -H "x-woc-deploy-secret: $SECRET" -H 'content-type: application/json' \
  -d '{"action":"end"}' http://127.0.0.1:8787/internal/maintenance
```

Players already in the world stay connected when the gate closes; if the work
needs them out, stop the game after the countdown (`DEPLOY.md`, "Updating the
game", step 5). To bring a realm up already closed (after a restore, before a
wipe), set `MAINTENANCE_MODE=1` for that boot and remove it afterwards (or
`{"action":"end"}`). Maintenance state is in memory: a restart without
`MAINTENANCE_MODE=1` reopens the realm.

## Update required (minimum client version)

`MIN_CLIENT_VERSION=x.y.z` in the server env refuses any client whose bundle
version (`package.json` `version` at build time) is older, with "Update
required: this version of the game is out of date. Restart Steam to update"
(`server/client_version_gate.ts`). Use it after a release that changes the
wire in a way old clients cannot handle:

1. bump `package.json` `version` on the release branch and build the Steam depot;
2. upload it and set it live (`docs/launch/steam-depot-builds.md`);
3. deploy the server with `MIN_CLIENT_VERSION` set to the new version;
4. players who have not restarted Steam see the update line and restart.

Unset or unparsable means no gate (fail open).

## Alerts

`deploy/alerts/wyndlewood.rules.yml` holds Prometheus rule templates over the
server's existing `/metrics` (scrape with `Authorization: Bearer
<METRICS_TOKEN>`, job name `wyndlewood`). Route `severity=page` to a phone
(Alertmanager to Discord, Pushover or email) and `severity=ticket` to a
channel. A hosted option with no server to run: Grafana Cloud free tier
scraping the metrics endpoint, using the same rules.

### Realm down
`/livez` failing makes Docker mark the container unhealthy and
`deploy/game_watchdog.sh` restarts it. If it keeps failing: `sudo docker compose
logs --tail 200 game`, look for a boot refusal (dev commands, config) or a
database error.

### Slow loop
Open the admin dashboard Tick Profiler, capture 10 s, and read the `max` of
each phase (`server/CLAUDE.md`, "Hot paths"). `lateness` or event-loop lag
with no phase means work outside the tick (saves, sweeps).

### Database
Waiting pool clients or rising cancels: check Postgres CPU and disk, long
queries (`pg_stat_activity`), and whether a backup or a wipe is running.

### Abuse
Rate kicks spiking: the admin Suspicious Players and IP pages; block an IP
range if it is one network.

### Metrics
A stale collector snapshot means the business metrics job failed; the game
itself is fine. Check the server log for `metrics collector`.
