#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${WORKSHOP_CLI_BIN_DIR:-"$HOME/.local/bin"}"
TARGET="$ROOT_DIR/scripts/workshop-desktop-cli.mjs"

mkdir -p "$BIN_DIR"
chmod +x "$TARGET"
ln -sf "$TARGET" "$BIN_DIR/workshop"
ln -sf "$TARGET" "$BIN_DIR/workshop-desktop"

echo "Installed Workshop CLI:"
echo "- $BIN_DIR/workshop"
echo "- $BIN_DIR/workshop-desktop"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo "Add this directory to PATH if the command is not found:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac
