#!/usr/bin/env bash
# MAAL Postgres backup — daily snapshot to nikear via Tailscale.
#
# Cron entry on VPS (deploy@89.208.106.208):
#   0 3 * * * /home/deploy/maal-backup/maal-backup.sh >> /home/deploy/maal-backup/cron.log 2>&1
#
# Env required (set in script or /home/deploy/maal-backup/.env):
#   DATABASE_URL          — Postgres direct connection (NOT pgbouncer)
#   GPG_RECIPIENT         — GPG public key id / email for encryption
#   NIKEAR_SSH_HOST       — nikear hostname (Tailscale name or IP)
#   NIKEAR_SSH_USER       — ssh user on nikear
#   NIKEAR_BACKUP_DIR     — destination directory on nikear, e.g. /home/zebrosha/backups/maal
#   RETENTION_DAYS        — how many days to keep on nikear (default 30)
#   TELEGRAM_BOT_TOKEN    — optional, for failure alerts via Vai
#   TELEGRAM_CHAT_ID      — optional, owner's chat id
#
# Exit codes:
#   0 = success (backup uploaded + verified)
#   1 = dump failed
#   2 = encryption failed
#   3 = upload failed
#   4 = verify failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env if present (overrides shell env)
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090,SC1091
  source "${SCRIPT_DIR}/.env"
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL required}"
: "${GPG_RECIPIENT:?GPG_RECIPIENT required}"
: "${NIKEAR_SSH_HOST:?NIKEAR_SSH_HOST required}"
: "${NIKEAR_SSH_USER:?NIKEAR_SSH_USER required}"
: "${NIKEAR_BACKUP_DIR:?NIKEAR_BACKUP_DIR required}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
HOSTNAME_SAFE="$(hostname -s)"
DUMP_FILE="${SCRIPT_DIR}/work/maal-${TIMESTAMP}.pgcustom"
ENC_FILE="${DUMP_FILE}.gpg"
LOG_FILE="${SCRIPT_DIR}/backup.log"

mkdir -p "${SCRIPT_DIR}/work"

log() {
  local msg="$1"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "${ts} ${msg}" | tee -a "${LOG_FILE}"
}

notify_failure() {
  local context="$1"
  local detail="${2:-no detail}"
  log "FAIL [${context}] ${detail}"
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
    curl -sS --max-time 10 \
      -d "chat_id=${TELEGRAM_CHAT_ID}" \
      -d "text=🚨 MAAL backup FAILED [${context}] on ${HOSTNAME_SAFE} at $(date -u +%Y-%m-%dT%H:%M:%SZ). Detail: ${detail}. Check ${LOG_FILE}." \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      > /dev/null || true
  fi
}

cleanup_local() {
  rm -f "${DUMP_FILE}" "${ENC_FILE}" 2>/dev/null || true
}
trap cleanup_local EXIT

log "=== Backup start: ${TIMESTAMP} ==="

# 1. pg_dump (custom format, max compression). Excludes vector embedding column?
#    NO — we want full fidelity. content_chunk vector adds ~70MB but compresses well.
log "Step 1/4: pg_dump"
if ! pg_dump "${DATABASE_URL}" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-acl \
    --no-comments \
    --file="${DUMP_FILE}" 2>>"${LOG_FILE}"; then
  notify_failure "pg_dump" "$(tail -5 "${LOG_FILE}" | tr '\n' ' ')"
  exit 1
fi
DUMP_SIZE=$(stat -c '%s' "${DUMP_FILE}")
log "pg_dump complete: ${DUMP_FILE} ($(numfmt --to=iec "${DUMP_SIZE}"))"

# 2. Encrypt with GPG (asymmetric — only private key holder can decrypt)
log "Step 2/4: GPG encrypt"
if ! gpg --batch --yes --trust-model always \
    --recipient "${GPG_RECIPIENT}" \
    --encrypt \
    --output "${ENC_FILE}" \
    "${DUMP_FILE}" 2>>"${LOG_FILE}"; then
  notify_failure "gpg_encrypt" "$(tail -5 "${LOG_FILE}" | tr '\n' ' ')"
  exit 2
fi
ENC_SIZE=$(stat -c '%s' "${ENC_FILE}")
log "GPG encrypt complete: $(numfmt --to=iec "${ENC_SIZE}")"

# 3. Upload to nikear via SSH (uses VPS ~/.ssh/config for ProxyJump / Tailscale)
log "Step 3/4: scp -> ${NIKEAR_SSH_USER}@${NIKEAR_SSH_HOST}:${NIKEAR_BACKUP_DIR}/"
REMOTE_NAME="maal-${TIMESTAMP}.pgcustom.gpg"
if ! scp -o BatchMode=yes -o ConnectTimeout=30 \
    "${ENC_FILE}" \
    "${NIKEAR_SSH_USER}@${NIKEAR_SSH_HOST}:${NIKEAR_BACKUP_DIR}/${REMOTE_NAME}" \
    >>"${LOG_FILE}" 2>&1; then
  notify_failure "scp_upload" "scp returned non-zero"
  exit 3
fi
log "Upload complete: ${REMOTE_NAME}"

# 4. Verify on nikear (file exists, size matches)
log "Step 4/4: verify on nikear"
REMOTE_SIZE=$(ssh -o BatchMode=yes -o ConnectTimeout=15 \
  "${NIKEAR_SSH_USER}@${NIKEAR_SSH_HOST}" \
  "stat -c '%s' '${NIKEAR_BACKUP_DIR}/${REMOTE_NAME}' 2>/dev/null || echo 0")
if [[ "${REMOTE_SIZE}" != "${ENC_SIZE}" ]]; then
  notify_failure "verify" "size mismatch local=${ENC_SIZE} remote=${REMOTE_SIZE}"
  exit 4
fi
log "Verified: remote size ${REMOTE_SIZE} matches local"

# 5. Rotate — delete files older than RETENTION_DAYS on nikear
log "Step 5/5 (housekeeping): rotate older than ${RETENTION_DAYS} days"
ssh -o BatchMode=yes \
  "${NIKEAR_SSH_USER}@${NIKEAR_SSH_HOST}" \
  "find '${NIKEAR_BACKUP_DIR}' -maxdepth 1 -name 'maal-*.pgcustom.gpg' -mtime +${RETENTION_DAYS} -print -delete" \
  >>"${LOG_FILE}" 2>&1 || log "WARN: rotate command failed (non-fatal)"

log "=== Backup complete: ${REMOTE_NAME} ($(numfmt --to=iec "${ENC_SIZE}")) ==="
exit 0
