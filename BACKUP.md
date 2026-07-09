# Backup & Restore

Two things on the Vultr server cannot be recreated if the disk goes:

1. **The Postgres database** — orders, accounting records, incidents, users.
2. **The `backend_uploads` volume** — incident documents, company logos, and (since v2.77.0) **expense invoice attachments**.

The attachments are the sharpest case. An order can be re-entered and an incident re-written, but a supplier's invoice photo exists in exactly one place and is a statutory record (BIR, ~10 years). It is exempt from every retention job, so it never leaves the volume on its own.

Before v2.78.0 neither had any automated backup.

---

## What runs

`scripts/backup.sh`, once a night from cron. Each run produces a timestamped pair:

```
/opt/dom/backups/db-20260709-021501.dump       # pg_dump -Fc
/opt/dom/backups/uploads-20260709-021501.tgz   # tar of the whole uploads volume
```

The script:

- writes to `*.part` and renames only on success — a truncated file never takes the place of a good one;
- **verifies** each artifact before trusting it (`pg_restore --list` parses the dump's TOC; `tar tzf` reads the archive), so corruption surfaces now rather than during the emergency;
- mounts the volume via `--volumes-from dom_backend` instead of guessing the volume's name (that name is prefixed by the compose project, which follows the directory);
- prunes local copies older than `BACKUP_KEEP_DAYS` (default 14) and never touches the remote;
- reads `DB_USER`/`DB_NAME` out of `.env` **without sourcing it** — `. .env` executes the file as shell, and an unquoted value like `SLA_SWEEP_CRON=*/15 * * * *` glob-expands into a command. (This bit during development; see the `env_val` helper.)

Any failure exits non-zero and logs a reason. Nothing is silent.

## Install (on the server, once)

```bash
chmod +x /opt/dom/scripts/backup.sh /opt/dom/scripts/restore.sh
mkdir -p /opt/dom/backups

crontab -e
# 02:15 server time, nightly:
15 2 * * * /opt/dom/scripts/backup.sh >> /var/log/dom-backup.log 2>&1
```

Check it the next morning: `tail -20 /var/log/dom-backup.log`.

## Offsite — do not skip this

> **Status (2026-07-09): NOT DONE.** The nightly cron is live and `rclone` is installed on the
> server, but no `BACKUP_REMOTE` has been chosen, so every backup still lives only on the
> production disk. Deferred by decision, not forgotten.
>
> Candidates priced at the time: **Cloudflare R2** (10 GB + egress free, S3-compatible — best
> value, needs a new account), **Backblaze B2** (first 10 GB free, small egress on restore),
> **Vultr Object Storage** (same panel, no new account, but the cheapest tier is $6/mo Archival
> for 250 GB we do not need). Production sizes: 55 MB dump + 17 MB uploads ≈ 72 MB/night.
>
> **When you turn this on, add remote retention too.** The script deliberately never deletes
> anything on the remote, so at ~72 MB/night a 10 GB free tier fills in about 4½ months and
> uploads then start failing. Wire up a `BACKUP_REMOTE_KEEP_DAYS` (`rclone delete --min-age`)
> at the same time.

Left as installed above, the backups sit on **the same disk they are meant to protect you from losing**. The script says so loudly on every run and keeps going; it is your decision, not an oversight.

To fix it, point `BACKUP_REMOTE` at an [rclone](https://rclone.org) target and the script copies both artifacts up after verifying them:

```bash
apt install rclone
rclone config              # e.g. an S3-compatible remote → Vultr Object Storage
export BACKUP_REMOTE="vultr:dom-backups"   # put this in the crontab line's environment
```

Cron does not read your shell profile. Set it on the crontab line itself:

```
15 2 * * * BACKUP_REMOTE=vultr:dom-backups /opt/dom/scripts/backup.sh >> /var/log/dom-backup.log 2>&1
```

## Restore

```bash
CONFIRM=yes /opt/dom/scripts/restore.sh \
  /opt/dom/backups/db-20260709-021501.dump \
  /opt/dom/backups/uploads-20260709-021501.tgz
```

Restore the pair from the **same timestamp**. Mixing a database with a different night's files leaves attachment rows pointing at files that aren't there — downloads 404 and nothing tells you why.

The script stops `dom_backend` first (so nothing writes underneath the restore), replaces the database (`--clean --if-exists`), wipes and re-extracts the uploads volume, then starts the backend. It refuses to run without `CONFIRM=yes`.

Verify afterwards by opening an expense that has an attachment and downloading it — that exercises the database row *and* the file on disk together.

## Verified

`scripts/backup.sh` was run end to end against a live Postgres and a stand-in backend container: dump written and accepted by `pg_restore --list`, uploads archive written and its contents read back byte-for-byte. The dump was then **restored into a scratch database** and row counts compared against the source (`orders` 2147, `users` 52, `acc_expenses` 2) — identical.

That last step is the point. A dump that has never been restored is a file, not a backup.
