#!/bin/bash
# Mark the baseline migration as already applied on an existing database.
# Run this ONCE on any database that was set up with `prisma db push`.
#
# Usage: bash scripts/mark-baseline-migration.sh
#
# This tells Prisma "the 0001_init migration is already applied, don't run it again".
# After this, `npx prisma migrate deploy` will only run NEW migrations.

set -e

echo "Marking baseline migration 0001_init as applied..."
cd "$(dirname "$0")/.."
npx prisma migrate resolve --applied 0001_init
echo "Done. Future migrations will be applied normally with: npx prisma migrate deploy"
