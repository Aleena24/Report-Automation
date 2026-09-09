#!/usr/bin/env bash
# Pushes src/ to the Apps Script project bound to the tracking spreadsheet.
# First time: `npm install && npx clasp login` (one browser sign-in as automation@sahrdaya.ac.in),
# and enable the Apps Script API once at https://script.google.com/home/usersettings
set -euo pipefail
cd "$(dirname "$0")"

SHEET_ID="${SHEET_ID:-12u73XSWp1M2uYDYAtKmzJQLeD4gdIVIl9pgrSToKwQc}"

if [ ! -d node_modules/@google/clasp ]; then
  echo "» installing clasp"; npm install --silent
fi
if [ ! -f "$HOME/.clasprc.json" ]; then
  echo "» not logged in – a browser window will open. Sign in as automation@sahrdaya.ac.in"
  npx clasp login
fi
if [ ! -f .clasp.json ]; then
  echo "» creating a script bound to spreadsheet $SHEET_ID"
  npx clasp create --type sheets --title "Daily Reports Automation" --parentId "$SHEET_ID" --rootDir src
  # clasp writes .clasp.json next to rootDir handling; normalise it here
  if [ -f src/.clasp.json ]; then mv src/.clasp.json .clasp.json; fi
  node -e 'const f=".clasp.json";const j=require("./"+f);j.rootDir="src";require("fs").writeFileSync(f,JSON.stringify(j,null,2))'
fi
echo "» pushing src/ → Apps Script"
npx clasp push --force
echo
echo "Done. Next, in the spreadsheet: reload → menu 'Daily Reports' →"
echo "  1. Create missing tabs (bootstrap)   2. fill Config   3. Preview all mails to me"
echo "  4. Install daily triggers            5. set DRY_RUN = NO"
npx clasp open || true
