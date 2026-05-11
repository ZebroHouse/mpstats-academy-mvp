# MAAL Backup — daily pg_dump to nikear

Defense-in-depth backup of MAAL Supabase Postgres beyond Supabase's built-in PITR.

**Why we need this** (incident 2026-05-12): sibling project ran `prisma db push --accept-data-loss` against shared MAAL DB. Supabase PITR saved us but rolled back 12 hours of work. An off-platform daily dump means even worse scenarios (Supabase outage, billing issue, full project deletion) are recoverable.

> See `MAAL/CLAUDE.md` "🚨 PROD DATABASE SAFETY" for the full safety protocol.

## Architecture

```
┌────────────┐    pg_dump      ┌──────────┐    scp via       ┌────────┐
│  Supabase  │ ─────────────▶  │   VPS    │  ProxyJump/TS  ─▶ │ nikear │
│  Postgres  │   --format=     │ (cron)   │                  │ /backups│
│  (99 MB)   │   custom        │ encrypt  │                  │  /maal/ │
└────────────┘                 │ + GPG    │                  └────────┘
                               └──────────┘
                                  ~3:00 UTC daily
                                  retention 30d
```

- **Source:** Supabase project `saecuecevicwjkpmaoot` (DATABASE_URL direct, not pgbouncer)
- **Compute:** VPS deploy user, cron job @ 03:00 UTC
- **Transport:** scp over existing SSH config (ProxyJump → Tailscale → nikear, see `~/.ssh/config` on VPS)
- **Storage:** nikear filesystem, 30-day rolling retention
- **Encryption:** GPG asymmetric — public key on VPS encrypts; private key held by owner (laptop + nikear safe location)

Approx daily size: ~30-40 MB encrypted (compressed pg_dump custom format + gpg of 99 MB raw DB).
30-day footprint on nikear: ~1.2 GB.

## Files

| File | Purpose |
|------|---------|
| `maal-backup.sh` | Cron-driven backup — pg_dump + gpg + scp + verify + rotate |
| `maal-restore.sh` | Manual restore — list / fetch / validate / apply |
| `.env.example` | Template for VPS-side env config |
| `README.md` | This file |

## Setup (one-time, owner runs on VPS)

### 1. Generate GPG keypair (on owner's laptop, NOT VPS)

```bash
gpg --batch --gen-key <<EOF
%no-protection
Key-Type: RSA
Key-Length: 4096
Subkey-Type: RSA
Subkey-Length: 4096
Name-Real: MAAL Backup
Name-Email: backup@mpstats.academy
Expire-Date: 0
EOF

# Export public key (will go to VPS)
gpg --armor --export backup@mpstats.academy > maal-backup.pub.asc

# Export private key (will be safed locally + on nikear)
gpg --armor --export-secret-keys backup@mpstats.academy > maal-backup.priv.asc

# Store private key in two places:
#   - laptop ~/.gnupg (default)
#   - nikear ~/keysafe/maal-backup.priv.asc (chmod 600)
# Encrypt it at rest (e.g. with passphrase OR another GPG key)
# NEVER store private key on VPS.
```

### 2. On VPS (deploy@89.208.106.208)

```bash
# Clone or pull repo
cd /home/deploy/maal
git pull origin master

# Set up backup workspace
mkdir -p /home/deploy/maal-backup/{work,scripts}
cp /home/deploy/maal/scripts/backup/maal-backup.sh /home/deploy/maal-backup/
cp /home/deploy/maal/scripts/backup/maal-restore.sh /home/deploy/maal-backup/
chmod +x /home/deploy/maal-backup/*.sh

# Import GPG public key (transferred separately from laptop, e.g. via scp)
gpg --import /tmp/maal-backup.pub.asc
# Trust it (for non-interactive use)
gpg --import-ownertrust <<< "$(gpg --fingerprint backup@mpstats.academy | grep -E '^\s+[A-F0-9]{40}$' | tr -d ' '):6:"

# Configure env (NEVER commit .env)
cat > /home/deploy/maal-backup/.env <<'ENVEOF'
DATABASE_URL=postgresql://...DIRECT-NOT-PGBOUNCER...
GPG_RECIPIENT=backup@mpstats.academy
NIKEAR_SSH_HOST=nikear-tailscale-name
NIKEAR_SSH_USER=zebrosha
NIKEAR_BACKUP_DIR=/home/zebrosha/backups/maal
RETENTION_DAYS=30
# Optional:
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=378833288
ENVEOF
chmod 600 /home/deploy/maal-backup/.env

# Verify SSH to nikear works from this VPS (one-time prompt to accept fingerprint)
ssh zebrosha@nikear-tailscale-name "echo nikear ok"

# Make sure NIKEAR_BACKUP_DIR exists on nikear
ssh zebrosha@nikear-tailscale-name "mkdir -p /home/zebrosha/backups/maal"

# Test backup once manually
cd /home/deploy/maal-backup && ./maal-backup.sh

# If success, add to cron
crontab -e
# Add line:
# 0 3 * * * /home/deploy/maal-backup/maal-backup.sh >> /home/deploy/maal-backup/cron.log 2>&1
```

### 3. On nikear (one-time)

```bash
# Create backup dir
mkdir -p /home/zebrosha/backups/maal
chmod 700 /home/zebrosha/backups/maal

# Optionally: separate disk / encrypted dataset / restic snapshots
```

## Daily verification

After 24 hours, check that backup ran:

```bash
# On VPS
tail -20 /home/deploy/maal-backup/backup.log

# On nikear
ls -la /home/zebrosha/backups/maal/
# Should see maal-YYYYMMDD_HHMMSS.pgcustom.gpg, ~30-40 MB
```

If Telegram alerts configured, you'll get a 🚨 message on any failure.

## Restoring

### List available backups

```bash
# On laptop or any machine with .env + ssh to nikear
cd scripts/backup && ./maal-restore.sh list
```

### Fetch a backup

```bash
./maal-restore.sh latest                 # most recent
./maal-restore.sh fetch 20260513_030000  # specific timestamp
# → ./work/maal-<ts>.pgcustom (decrypted, ready for pg_restore)
```

### Validate (read TOC, don't apply)

```bash
./maal-restore.sh validate ./work/maal-20260513_030000.pgcustom
```

### Apply to staging or dev (SAFE)

```bash
DATABASE_URL_TARGET="postgresql://...staging..." \
  ./maal-restore.sh apply ./work/maal-20260513_030000.pgcustom
```

### Apply to prod (DANGER — manual override required)

```bash
DATABASE_URL_TARGET="postgresql://...PROD..." \
RESTORE_TO_PROD=yes_i_know \
  ./maal-restore.sh apply ./work/maal-20260513_030000.pgcustom
```

The script will refuse without `RESTORE_TO_PROD=yes_i_know` env override. Use this only for full disaster recovery after exhausting PITR options.

## Rotation policy

- VPS: backup files deleted from `work/` immediately after successful upload (the `trap cleanup_local EXIT` in maal-backup.sh).
- nikear: backups older than `RETENTION_DAYS` (default 30) auto-deleted at end of each daily run.
- To keep a specific backup forever, copy it to a different directory on nikear before the 30-day mark.

## Monitoring

- `/home/deploy/maal-backup/backup.log` on VPS — append-only log
- `/home/deploy/maal-backup/cron.log` on VPS — captures cron output (stdout+stderr)
- Telegram alerts on failure (optional, if `TELEGRAM_*` env set)

Consider adding to a weekly review:
- Count backups on nikear matches expected (~30)
- Latest backup is ≤24 hours old
- File sizes are stable (sudden drop = empty schema, sudden growth = leak)

## What this does NOT cover

- **Supabase Storage objects** (`lesson-frames`, `lesson-materials`) — backup separately if needed. Local mirrors usually exist for `lesson-frames` (in `MAAL/scripts/vision-ingest/results/frames/`) but `lesson-materials` is user-uploaded content with no local copy.
- **Real-time backup** — daily granularity. For sub-day recovery, rely on Supabase PITR (still on, 7-day window).
- **App config** (env vars, secrets) — these live in `.env.production` on VPS, backed up via the VPS's own backup if any.

## Restoration drills

Quarterly (every 3 months): run `./maal-restore.sh latest` and `./maal-restore.sh apply` against staging DB to verify the chain works end-to-end. Document any issues. If a backup can't be applied, you don't have a backup.
