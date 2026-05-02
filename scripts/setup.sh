#!/usr/bin/env bash
# eCommsZone — Local Development Setup Script
# Run once after cloning the repo to bootstrap the dev environment.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> eCommsZone Setup"
echo "    Repo root: ${REPO_ROOT}"
echo ""

# ── 1. Check prerequisites ────────────────────────────────────────────────────
check_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 is required but not installed."; exit 1; }
}
check_cmd docker
check_cmd node
check_cmd npm

echo "[1/5] Prerequisites OK"

# ── 2. Copy .env if not present ───────────────────────────────────────────────
if [ ! -f "${REPO_ROOT}/.env" ]; then
  cp "${REPO_ROOT}/.env.example" "${REPO_ROOT}/.env"
  echo "[2/5] .env created from .env.example — EDIT IT before continuing."
else
  echo "[2/5] .env already exists — skipping."
fi

# ── 3. Install API dependencies ───────────────────────────────────────────────
echo "[3/5] Installing API dependencies..."
cd "${REPO_ROOT}/api"
npm install
cd "${REPO_ROOT}"

# ── 4. Start Docker services ──────────────────────────────────────────────────
echo "[4/5] Starting Docker services..."
docker compose -f "${REPO_ROOT}/infra/docker/docker-compose.yml" up -d postgres redis
echo "      Waiting for Postgres to be ready..."
sleep 5

# ── 5. Run listmonk install ───────────────────────────────────────────────────
echo "[5/5] Running listmonk DB migration..."
docker compose -f "${REPO_ROOT}/infra/docker/docker-compose.yml" up -d listmonk
sleep 3
docker compose -f "${REPO_ROOT}/infra/docker/docker-compose.yml" exec listmonk \
  ./listmonk --config /listmonk/config.toml --install --yes 2>/dev/null || true

echo ""
echo "✅ Setup complete!"
echo ""
echo "   Start the full stack:  docker compose -f infra/docker/docker-compose.yml up"
echo "   API dev mode:          cd api && npm run dev"
echo "   listmonk admin:        http://localhost:9000"
echo "   API gateway:           http://localhost:4000/health"
