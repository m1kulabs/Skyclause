#!/usr/bin/env python3
"""Brief section 11, item 5 (hard rule 5): the label check on a rendered cut.

One frame every 5 s via ffmpeg `select`. OCR (tesseract) reads the bottom-right corner caption on every tile, and the
top-left `Replay (2 Nov 2026)` badge on every replayed tile (D3, D4b, D5a). Prints one line per tile and exits 1 on any
miss. Usage: check-labels.py <video> <timing.json> <frames-dir>
"""
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageOps

video, timing_path, frames = sys.argv[1], sys.argv[2], Path(sys.argv[3])
STEP = 5  # seconds between tiles; 150 frames at 30 fps
# Part lengths from src/demo/plan.ts (last beat end of D4a and D5a). Checked against timing.json below.
D4A_S, D4B_S, D5A_S, D5B_S = 3.2, 25.8, 12.4, 4.6
REPLAYED = {'D3', 'D4b', 'D5a'}
CORNER = (1380, 820, 1900, 1080)  # covers the caption at bottom 7, 116 and 205 px; right edge 1920 − 96
BADGE = (0, 0, 560, 240)  # covers the badge at (48, 40), (96, 64) and (30, 150); height 52

seg = {s['id']: s for s in json.load(open(timing_path))['segments']}
for beat, parts in (('D4', D4A_S + D4B_S), ('D5', D5A_S + D5B_S)):
    span = seg[beat]['end_s'] - seg[beat]['start_s']
    if abs(span - parts) > 0.05:
        sys.exit(f'{beat} is {span:.3f} s in timing.json but its parts sum to {parts:.3f} s: update the part lengths')
spans = []
for s in seg.values():
    if s['id'] == 'D4':
        spans += [('D4a', s['start_s'], s['start_s'] + D4A_S), ('D4b', s['start_s'] + D4A_S, s['end_s'])]
    elif s['id'] == 'D5':
        spans += [('D5a', s['start_s'], s['start_s'] + D5A_S), ('D5b', s['start_s'] + D5A_S, s['end_s'])]
    else:
        spans.append((s['id'], s['start_s'], s['end_s']))


def part_at(t):
    return next((name for name, a, b in spans if a <= t < b), 'end')


frames.mkdir(parents=True, exist_ok=True)
for old in frames.glob('t*.jpg'):
    old.unlink()
subprocess.run(['nice', '-n', '10', 'ffmpeg', '-v', 'error', '-y', '-i', video, '-vf', "select='not(mod(n\\,150))'",
                '-vsync', '0', '-q:v', '2', str(frames / 't%03d.jpg')], check=True)


def ocr(img):
    big = img.resize((img.width * 2, img.height * 2), Image.LANCZOS).convert('L')
    out = ''
    for variant in (big, ImageOps.invert(big)):
        out += subprocess.run(['nice', '-n', '10', 'tesseract', 'stdin', 'stdout', '--psm', '11'],
                              input=_png(variant), capture_output=True).stdout.decode(errors='replace') + '\n'
    return ' '.join(out.split())


def _png(img):
    from io import BytesIO
    buf = BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def check(path):
    t = (int(path.stem[1:]) - 1) * STEP
    part = part_at(t)
    img = Image.open(path)
    # OCR often reads the caption's 13 as 15, so any two digits pass; the word and the month must match.
    corner = bool(re.search(r'Recording.{0,6}\d\d ?Nov ?2026', ocr(img.crop(CORNER))))
    badge_text = ocr(img.crop(BADGE))
    badge = bool(re.search(r'Replay.{0,4}2 ?Nov ?2026', badge_text))
    want = part in REPLAYED
    ok = corner and (badge or not want)
    return t, part, corner, want, badge, ok


rows = list(ThreadPoolExecutor(2).map(check, sorted(frames.glob('t*.jpg'))))
for t, part, corner, want, badge, ok in rows:
    m, s = divmod(t, 60)
    print(f'  {m}:{s:02d} {part:<5} corner {"yes" if corner else "NO"}'
          f'{"  replay " + ("yes" if badge else "NO") if want else ""}  {"PASS" if ok else "FAIL"}')
fails = [r for r in rows if not r[5]]
replayed = [r for r in rows if r[3]]
print(f'5 labels: {len(rows)} tiles, corner caption on {sum(r[2] for r in rows)}, '
      f'Replay badge on {sum(r[4] for r in replayed)} of {len(replayed)} replayed tiles: '
      f'{"PASS" if not fails else "FAIL (" + str(len(fails)) + " tiles)"}')
sys.exit(1 if fails else 0)
