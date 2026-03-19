#!/bin/bash
set -euo pipefail

# Quick syntax check
npx tsc --noEmit --pretty false lib/factory.ts lib/main.ts lib/platforms/browser.ts 2>&1 | head -5 || true

# Build
pnpm vite build 2>&1 | tail -3

# Measure gzipped size via size-limit
SIZE_JSON=$(npx size-limit --json 2>/dev/null)
SIZE_BYTES=$(echo "$SIZE_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['size'])")

# Raw file size
RAW_BYTES=$(wc -c < dist/nanoquery.js | tr -d ' ')

echo "METRIC size_bytes=$SIZE_BYTES"
echo "METRIC raw_bytes=$RAW_BYTES"
