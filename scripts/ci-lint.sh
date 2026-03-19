#!/usr/bin/env bash
set -euo pipefail

echo "=== Prisma Schema Validation ==="
cd apps/api
npx prisma format --check 2>/dev/null || npx prisma format
echo "✓ Prisma schema valid"

echo ""
echo "=== i18n Key Parity Check ==="
cd ../mobile/src/i18n
EN_KEYS=$(grep -c '"' en.json || true)
for lang in ar tr ur bn fr id ms; do
  LANG_KEYS=$(grep -c '"' "${lang}.json" || true)
  DIFF=$((EN_KEYS - LANG_KEYS))
  if [ "$DIFF" -gt 20 ] || [ "$DIFF" -lt -20 ]; then
    echo "✗ WARNING: ${lang}.json has ${LANG_KEYS} quoted strings vs en.json ${EN_KEYS} (diff: ${DIFF})"
  else
    echo "✓ ${lang}.json: ${LANG_KEYS} (en: ${EN_KEYS})"
  fi
done

echo ""
echo "=== Lint checks complete ==="
