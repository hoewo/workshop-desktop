#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -x /opt/homebrew/bin/node ]; then
  NODE_BIN="/opt/homebrew/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  echo "Node.js is required for pre-commit checks." >&2
  exit 1
fi

if [ ! -f "./node_modules/typescript/bin/tsc" ] || [ ! -f "./node_modules/vite/bin/vite.js" ]; then
  echo "Project dependencies are missing. Installing with pnpm before checks..."

  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile
  elif command -v npx >/dev/null 2>&1; then
    npx --yes pnpm install --frozen-lockfile
  else
    echo "pnpm or npx is required to install dependencies." >&2
    exit 1
  fi
fi

echo "Running pre-commit checks..."
echo "- Main process type check"
"$NODE_BIN" ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.main.json

echo "- Main process architecture smoke tests"
"$NODE_BIN" ./node_modules/typescript/bin/tsc -p tsconfig.main.json
"$NODE_BIN" --test scripts/main-architecture-smoke.test.mjs

echo "- Renderer type check"
"$NODE_BIN" ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json

echo "- Renderer production build"
"$NODE_BIN" ./node_modules/vite/bin/vite.js build

echo "Pre-commit checks passed."
