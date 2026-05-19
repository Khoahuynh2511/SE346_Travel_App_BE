#!/usr/bin/env bash
# WARNING: prisma db push with --accept-data-loss can DROP columns incompatible with schema changes.
# Use only on dev databases when you knowingly accept destructive sync.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f ".env" ]]; then
  echo "Missing .env."
  exit 1
fi

read -r -p "DATABASE_URL targets a database you ACCEPT may lose incompatible columns/data. Continue? [y/N] " reply
[[ "${reply}" =~ ^[yY]$ ]] || { echo "Aborted."; exit 1; }

npx prisma generate
npx prisma db push --accept-data-loss
npm run db:seed

echo "Done: force-push and seed completed."
