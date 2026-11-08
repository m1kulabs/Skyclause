#!/usr/bin/env bash
# Inlines the charts from the stored capture, then prints the deck to skyclause-pitch-deck.pdf beside it and,
# with --stills, one PNG per slide to out/ for review. Needs bun and Playwright's Chromium.
set -euo pipefail
cd "$(dirname "$0")/.."
bun scripts/charts.ts
bunx prettier --write skyclause-pitch-deck.html >/dev/null
chrome=${CHROME:-$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome 2>/dev/null | tail -1)}
[ -x "$chrome" ] || { echo "Chromium not found; set CHROME or run: bunx playwright install chromium" >&2; exit 1; }
url="file://$PWD/skyclause-pitch-deck.html"
"$chrome" --headless --no-sandbox --disable-gpu --no-pdf-header-footer --run-all-compositor-stages-before-draw \
  --virtual-time-budget=10000 --print-to-pdf=skyclause-pitch-deck.pdf "$url" 2>/dev/null
size=$(stat -c %s skyclause-pitch-deck.pdf)
echo "skyclause-pitch-deck.pdf: $size bytes"
[ "$size" -le 10485760 ] || { echo "Over the portal's 10 MB limit" >&2; exit 1; }
if [ "${1:-}" = --stills ]; then
  mkdir -p out
  n=$(grep -c '<section class="slide' skyclause-pitch-deck.html)
  for i in $(seq 1 "$n"); do
    "$chrome" --headless --no-sandbox --disable-gpu --hide-scrollbars --window-size=1920,1080 \
      --virtual-time-budget=10000 --screenshot="out/slide-$(printf %02d "$i").png" "$url#$i" 2>/dev/null
  done
  echo "$n stills in out/"
fi
