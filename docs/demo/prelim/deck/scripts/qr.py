# Draws the deck's QR codes: rounded-square modules, rounded finder squares and the Skyclause mark in the middle.
# Error correction H keeps them scannable with the centre knocked out. Round dots failed jsQR; rounded squares pass.
# Run from the repo root: python3 -I docs/demo/prelim/deck/scripts/qr.py  (needs `pip install segno`)
from pathlib import Path

import segno

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'qr'
CODES = {
    'repo': 'https://github.com/m1kulabs/Skyclause',
    'app': 'https://skyclause.m1ku.tech',
}
INK = '#0a0a0a'
PAPER = '#efefef'
LINE = '#f0566c'  # the mark's crimson line, lifted for contrast on ink
QUIET = 4  # modules of margin inside the card: the full quiet zone


def svg(url: str) -> str:
    qr = segno.make(url, error='h', micro=False)
    rows = [list(r) for r in qr.matrix]
    n = len(rows)
    size = n + QUIET * 2
    finders = [(0, 0), (0, n - 7), (n - 7, 0)]

    def in_finder(r: int, c: int) -> bool:
        return any(fr <= r < fr + 7 and fc <= c < fc + 7 for fr, fc in finders)

    # Clear a square in the middle for the mark, about a fifth of the code.
    hole = round(n * 0.22) | 1
    lo = (n - hole) // 2
    hi = lo + hole

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" role="img" aria-label="QR code for {url}">',
        f'<rect width="{size}" height="{size}" rx="2.4" fill="{PAPER}"/>',
    ]
    for r in range(n):
        for c in range(n):
            if not rows[r][c] or in_finder(r, c):
                continue
            if lo - 1 <= r <= hi and lo - 1 <= c <= hi:
                continue
            parts.append(
                f'<rect x="{c + QUIET + 0.04}" y="{r + QUIET + 0.04}" width="0.92" height="0.92" rx="0.3" fill="{INK}"/>'
            )
    for fr, fc in finders:
        x, y = fc + QUIET, fr + QUIET
        parts.append(
            f'<rect x="{x + 0.5}" y="{y + 0.5}" width="6" height="6" rx="1.7" fill="none" stroke="{INK}" stroke-width="1"/>'
        )
        parts.append(f'<rect x="{x + 2}" y="{y + 2}" width="3" height="3" rx="0.9" fill="{INK}"/>')
    # The mark: the window square with its crimson line, as in the deck header.
    m = hole - 1
    mx = lo + QUIET + 0.5
    parts.append(f'<rect x="{mx - 0.5}" y="{mx - 0.5}" width="{m + 1}" height="{m + 1}" rx="1.4" fill="{INK}"/>')
    pad = m * 0.22
    parts.append(
        f'<rect x="{mx + pad}" y="{mx + pad}" width="{m - pad * 2}" height="{m - pad * 2}" fill="none" stroke="{PAPER}" stroke-width="{m * 0.11:.2f}"/>'
    )
    line_y = mx + m * 0.62
    parts.append(
        f'<path d="M{mx + pad * 0.45} {line_y:.2f}H{mx + m - pad * 0.45}" stroke="{LINE}" stroke-width="{m * 0.07:.2f}"/>'
    )
    parts.append('</svg>')
    return ''.join(parts) + '\n'


OUT.mkdir(parents=True, exist_ok=True)
for name, url in CODES.items():
    (OUT / f'{name}.svg').write_text(svg(url))
    print(f'{name}.svg  {url}')
