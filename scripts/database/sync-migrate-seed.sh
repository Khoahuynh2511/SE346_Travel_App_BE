#!/usr/bin/env bash
# Applies Prisma migrations (versioned SQL) then seeds. Prefer this over db push in production-like setups.
# Run from repo root: bash scripts/database/sync-migrate-seed.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f ".env" ]]; then
  echo "Missing .env. Copy .env.example to .env and fill DATABASE_URL, DIRECT_URL, JWT_SECRET."
  exit 1
fi

npx prisma generate
npx prisma migrate deploy
npm run db:seed

echo "Done: migrations applied and seed completed."
