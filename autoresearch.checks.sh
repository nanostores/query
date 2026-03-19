#!/bin/bash
set -euo pipefail
# Run tests — suppress verbose output, only show failures
pnpm test:unit --reporter=dot 2>&1 | tail -30
