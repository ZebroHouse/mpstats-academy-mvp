#!/usr/bin/env bash
# MAAL Postgres restore — companion to maal-backup.sh.
#
# Two-step procedure:
#   1. Fetch encrypted backup from nikear, decrypt to local custom-format dump
#   2. pg_restore (intentionally separate step so you can review/manipulate)
#
# Usage:
#   ./maal-restore.sh fetch <TIMESTAMP>     — download + decrypt to ./work/maal-TIMESTAMP.pgcustom
#   ./maal-restore.sh list                  — list available backups on nikear
#   ./maal-restore.sh latest                — fetch most recent backup
#   ./maal-restore.sh apply <FILE>          — restore .pgcustom file to DATABASE_URL_TARGET
#   ./maal-restore.sh validate <FILE>       — pg_restore --list (read TOC, doesn't apply)
#
# SAFETY:
#   - "apply" requires DATABASE_URL_TARGET env (must NOT be prod by default)
#   - "apply" will refuse to run against the prod ref (saecuecevicwjkpmaoot)
#     unless RESTORE_TO_PROD=yes_i_know is set
#   - "apply" uses pg_restore --clean --if-exists which DROPS existing objects
#     before recreating. Read the pg_restore docs before running.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${SCRIPT_DIR}/work"
mkdir -p "${WORK_DIR}"

if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090,SC1091
  source "${SCRIPT_DIR}/.env"
  set +a
fi

PROD_REF="saecuecevicwjkpmaoot"
CMD="${1:-help}"

cmd_list() {
  : "${NIKEAR_SSH_HOST:?required}"
  : "${NIKEAR_SSH_USER:?required}"
  : "${NIKEAR_BACKUP_DIR:?required}"
  ssh -o BatchMode=yes "${NIKEAR_SSH_USER}@${NIKEAR_SSH_HOST}" \
    "ls -1 '${NIKEAR_BACKUP_DIR}'/maal-*.pgcustom.gpg | sort"
}

cmd_fetch() {
  local ts="$1"
  : "${NIKEAR_SSH_HOST:?required}"
  : "${NIKEAR_SSH_USER:?required}"
  : "${NIKEAR_BACKUP_DIR:?required}"
  local remote="${NIKEAR_BACKUP_DIR}/maal-${ts}.pgcustom.gpg"
  local enc="${WORK_DIR}/maal-${ts}.pgcustom.gpg"
  local dump="${WORK_DIR}/maal-${ts}.pgcustom"

  echo "Fetching ${remote}..."
  scp -o BatchMode=yes "${NIKEAR_SSH_USER}@${NIKEAR_SSH_HOST}:${remote}" "${enc}"
  echo "Decrypting..."
  gpg --batch --yes --decrypt --output "${dump}" "${enc}"
  rm -f "${enc}"
  echo "Done: ${dump}"
  echo
  echo "Next steps:"
  echo "  ./maal-restore.sh validate ${dump}"
  echo "  ./maal-restore.sh apply ${dump}  # ONLY against staging/dev by default"
}

cmd_latest() {
  : "${NIKEAR_SSH_HOST:?required}"
  : "${NIKEAR_SSH_USER:?required}"
  : "${NIKEAR_BACKUP_DIR:?required}"
  local latest
  latest=$(ssh -o BatchMode=yes "${NIKEAR_SSH_USER}@${NIKEAR_SSH_HOST}" \
    "ls -1t '${NIKEAR_BACKUP_DIR}'/maal-*.pgcustom.gpg | head -1")
  if [[ -z "${latest}" ]]; then
    echo "No backups found on nikear" >&2
    exit 1
  fi
  local ts
  ts=$(basename "${latest}" .pgcustom.gpg | sed 's/^maal-//')
  cmd_fetch "${ts}"
}

cmd_validate() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    echo "File not found: ${file}" >&2
    exit 1
  fi
  echo "TOC for ${file}:"
  echo
  pg_restore --list "${file}" | head -40
  echo "..."
  echo
  local entries
  entries=$(pg_restore --list "${file}" | grep -cE '^[0-9]+;' || true)
  echo "Total TOC entries: ${entries}"
}

cmd_apply() {
  local file="$1"
  : "${DATABASE_URL_TARGET:?DATABASE_URL_TARGET required (target DB, NOT prod by default)}"

  # Refuse prod by default
  if [[ "${DATABASE_URL_TARGET}" == *"${PROD_REF}"* ]]; then
    if [[ "${RESTORE_TO_PROD:-}" != "yes_i_know" ]]; then
      echo "REFUSE: DATABASE_URL_TARGET points to prod (${PROD_REF})." >&2
      echo "If you genuinely need to restore to prod, set RESTORE_TO_PROD=yes_i_know" >&2
      exit 1
    fi
    echo "WARN: restoring to PROD. Sleeping 10s — Ctrl-C to abort..."
    sleep 10
  fi

  if [[ ! -f "${file}" ]]; then
    echo "File not found: ${file}" >&2
    exit 1
  fi

  echo "Restoring ${file} -> ${DATABASE_URL_TARGET}"
  echo "Using --clean --if-exists (DROPs existing objects first)"
  echo "Sleeping 5s — Ctrl-C to abort..."
  sleep 5

  pg_restore \
    --dbname="${DATABASE_URL_TARGET}" \
    --clean --if-exists \
    --no-owner --no-acl \
    --verbose \
    "${file}"
}

case "${CMD}" in
  list)     cmd_list ;;
  fetch)    cmd_fetch "${2:?TIMESTAMP required}" ;;
  latest)   cmd_latest ;;
  validate) cmd_validate "${2:?FILE required}" ;;
  apply)    cmd_apply "${2:?FILE required}" ;;
  help|*)
    grep -E '^# |^#$' "$0" | sed 's/^# \?//'
    ;;
esac
