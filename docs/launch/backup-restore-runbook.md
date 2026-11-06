# Backup and restore runbook (off-machine)

The game keeps all player state in one Postgres database (accounts,
characters, `characters.state` JSONB, world state rows). The existing nightly
`pg_dump` in `DEPLOY.md` ("Backups") writes to the SAME machine, which does not
survive losing the machine. This runbook adds the off-machine copy and the
restore drill. Templates only: no credential is in the repo.

## One-time setup (owner)

1. **Pick a storage remote** with versioning or object lock on (Backblaze B2,
   Cloudflare R2, AWS S3). Create a bucket such as `wyndlewood-backups` and an
   access key limited to that bucket (write and list; no delete if the provider
   supports it, so a compromised host cannot erase history).
2. **Install the tools** on the game host: `age` and `rclone`
   (`apt install age rclone`). Run `rclone config` and create a remote, for
   example `wyndlewood-b2`. rclone stores the access key in its own config
   (`/root/.config/rclone/rclone.conf`, mode 600).
3. **Make an encryption key OFF the host**: on your own PC run
   `age-keygen -o wyndlewood-backup.key`. Keep that file in your password
   manager and on one offline USB stick. Copy only the printed PUBLIC key
   (`age1...`) to the host.
4. **Write `/etc/wyndlewood/backup.env`** (mode 600):

   ```sh
   AGE_RECIPIENT=age1...your-public-key
   RCLONE_REMOTE=wyndlewood-b2:wyndlewood-backups/db
   BACKUP_METRIC_FILE=/var/lib/node_exporter/textfile/wyndlewood_backup.prom
   ```

5. **Schedule it** (`/etc/cron.d/wyndlewood-backup`):

   ```
   15 3 * * * root /opt/eastbrook/deploy/backup_offsite.sh >> /var/log/wyndlewood-backup.log 2>&1
   ```

6. Run it once by hand and check the log ends in `backup: ok`.
7. Set a bucket lifecycle rule: keep dailies 30 days, plus a monthly copy for
   12 months. Before any wipe (`docs/launch/early-access-wipe.md`) take an extra
   manual backup and keep it for good.

The `BackupMissing` rule in `deploy/alerts/wyndlewood.rules.yml` pages when no
success has been stamped for 26 hours.

## Restore (practice this before launch, then every quarter)

Always restore into a SCRATCH database first, check it, and only then swap.

1. On your PC, download the dump: `rclone copy wyndlewood-b2:wyndlewood-backups/db/wyndlewood-<stamp>.dump.age .`
2. Decrypt: `age -d -i wyndlewood-backup.key -o restore.dump wyndlewood-<stamp>.dump.age`
3. Copy `restore.dump` to the host (scp), then on the host:

   ```sh
   sudo docker exec -i eastbrook-db createdb -U eastbrook eastbrook_restore
   sudo docker exec -i eastbrook-db pg_restore -U eastbrook -d eastbrook_restore --no-owner < restore.dump
   sudo docker exec -i eastbrook-db psql -U eastbrook eastbrook_restore -c "SELECT count(*) FROM accounts; SELECT count(*) FROM characters;"
   ```

4. If the counts look right and you are restoring for real:
   - start maintenance (`docs/launch/live-ops-runbook.md`, "Maintenance mode"),
     let the countdown finish, then stop the game: `sudo docker compose stop game`;
   - swap the databases:

     ```sh
     sudo docker exec -i eastbrook-db psql -U eastbrook postgres -c "ALTER DATABASE eastbrook RENAME TO eastbrook_broken_<date>;"
     sudo docker exec -i eastbrook-db psql -U eastbrook postgres -c "ALTER DATABASE eastbrook_restore RENAME TO eastbrook;"
     ```

   - start the game (`sudo docker compose up -d game`), check `/readyz`, log in
     with a staff account (maintenance admits staff), then end maintenance.
5. Keep `eastbrook_broken_<date>` until you are sure, then drop it.

Restoring loses every change after the dump time. Say so in the announcement
(Discord, Steam news) with the exact time players are rolled back to.

## What is NOT in the database

Server env (`/opt/eastbrook/.env`), the Caddy config and TLS state, and the
uploaded player assets directory if enabled. Back those up with the same
script pattern (tar, then age, then rclone) or keep them reproducible from
`DEPLOY.md`.
