#!/usr/bin/env bash
# eCommsZone — PostgreSQL Backup Script
# Usage: ./scripts/backup.sh [output-directory]
# Backs up the ecommszone Postgres database to a compressed dump file.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load env
if [ -f "${REPO_ROOT}/.env" ]; then
  # shellcheck disable=SC1091
  set -a; source "${REPO_ROOT}/.env"; set +a
fi

BACKUP_DIR="${1:-${REPO_ROOT}/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="ecommszone_${TIMESTAMP}.sql.gz"
FULL_PATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "==> Backing up ecommszone database..."
echo "    Output: ${FULL_PATH}"

docker compose -f "${REPO_ROOT}/infra/docker/docker-compose.yml" exec -T postgres \
  pg_dump \
    --username="${POSTGRES_USER:-ecommszone}" \
    --dbname="${POSTGRES_DB:-ecommszone}" \
    --no-password \
    --format=plain \
  | gzip > "${FULL_PATH}"

SIZE=$(du -sh "${FULL_PATH}" | cut -f1)
echo "✅ Backup complete: ${FILENAME} (${SIZE})"

# ── Retention: keep last 30 backups ──────────────────────────────────────────
ls -t "${BACKUP_DIR}"/ecommszone_*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm -f
echo "   Retention: older backups pruned (kept last 30)."
