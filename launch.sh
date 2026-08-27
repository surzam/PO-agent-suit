#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$APP_DIR"

command -v node >/dev/null 2>&1 || { echo 'Нужен Node.js 18+.' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo 'Нужен npm.' >&2; exit 1; }

if [ ! -x "$APP_DIR/node_modules/.bin/electron" ]; then
  echo 'Устанавливаю зависимости Electron…'
  npm install
fi

exec npm run app
