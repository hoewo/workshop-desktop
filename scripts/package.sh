#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-dir}"

export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
export CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-false}"

if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
else
  PNPM=(npx --yes pnpm)
fi

"${PNPM[@]}" install

case "$MODE" in
  build)
    "${PNPM[@]}" run build
    ;;
  dir)
    "${PNPM[@]}" run pack
    ;;
  dist)
    "${PNPM[@]}" run dist
    ;;
  *)
    echo "Usage: scripts/package.sh [build|dir|dist]" >&2
    exit 2
    ;;
esac
