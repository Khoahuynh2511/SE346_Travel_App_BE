#!/usr/bin/env bash
# Applies Prisma schema to the remote Postgres (DATABASE_URL/DIRECT_URL in .env) then seeds.
# Run from repo root: bash scripts/database/sync-schema-seed.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f ".env" ]]; then
  echo "Missing .env. Copy .env.example to .env and fill DATABASE_URL, DIRECT_URL, JWT_SECRET."
  exit 1
fi

npx prisma generate
npx prisma db push
npm run db:seed

echo "Done: schema synced and seed completed."
