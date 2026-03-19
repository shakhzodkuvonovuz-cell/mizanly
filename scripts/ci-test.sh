#!/usr/bin/env bash
set -euo pipefail

echo "=== TypeScript Type Check ==="
cd apps/api
npx tsc --noEmit
echo "✓ Type check passed"

echo ""
echo "=== Unit Tests ==="
npx jest --no-coverage
echo "✓ All tests passed"

echo ""
echo "=== Quality Gate ==="
# Check for banned patterns in non-test source files
if grep -rn "as any\|@ts-ignore\|@ts-expect-error" src/ --include="*.ts" | grep -v "\.spec\.ts" | grep -v "node_modules" | head -5; then
  echo "✗ FAIL: Found 'as any' or '@ts-ignore' in non-test code"
  exit 1
fi
echo "✓ No banned patterns found"

echo ""
echo "=== All checks passed ==="
