#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$APP_DIR"

command -v node >/dev/null 2>&1 || { echo 'Нужен Node.js 18+.' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo 'Нужен npm.' >&2; exit 1; }

# Register a real desktop launcher so Linux associates the window with the R&D icon.
APP_DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_LAUNCHERS_DIR="$APP_DATA_DIR/applications"
mkdir -p "$APP_LAUNCHERS_DIR"
cp "$APP_DIR/po-agent-suite.desktop" "$APP_LAUNCHERS_DIR/po-agent-suite.desktop"
chmod 644 "$APP_LAUNCHERS_DIR/po-agent-suite.desktop"

# Never leave an older copy of this exact project serving stale UI/code.
pkill -f "$APP_DIR/node_modules/electron" 2>/dev/null || true
pkill -f "$APP_DIR/node_modules/.bin/electron" 2>/dev/null || true
pkill -f "$APP_DIR/server.mjs" 2>/dev/null || true
sleep 1

if [ ! -x "$APP_DIR/node_modules/.bin/electron" ]; then
  echo 'Устанавливаю зависимости Electron…'
  npm install
fi

exec npm run app
