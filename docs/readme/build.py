# Draws the root README's banner and architecture diagram, each in Dusk (dark) and Day (light).
#
# - Type is Roundo, outlined with fontTools, so GitHub renders the face without the font: an SVG shown as an image
#   loads no webfont. Each glyph is defined once and placed with <use>. Clock labels use Skyclause Figures, as the
#   app does.
# - Colours are the Dusk and Day tokens of docs/DESIGN.md; the mark and the glyphs are those of packages/elements.
# - The banner's curve is the 60-minute rain total at JPS gauge 0232901RF on 2 November 2026, summed from the stored
#   capture; the build fails unless the totals match the figures the landing page prints. A reading stamped T covers
#   (T-5 min, T]. It is a replay and is labelled as one: no call was made that day.
# - The banner's photographs are the landing page's, credited in the README. The capsule crops them, they are
#   otherwise unaltered, and nothing is drawn over them.
# - In the diagram a solid node is built in this repository and a dashed one is not built yet. Change a node here
#   when the code changes, then run the build.
#
# Run from the repository root:
#   uv run --with 'fonttools[woff]==4.62.1' --with resvg-py==0.5.0 python -I docs/readme/build.py
import base64
import json
from datetime import datetime, timedelta
from pathlib import Path

import resvg_py
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent.parent
FONTS = ROOT / 'apps/web/fonts'
PHOTOS = ROOT / 'apps/web/public/landing'
CAPTURE = ROOT / 'pilot/fixtures/rainfall-graph-75-20261105T1312Z.json'

THEMES = {
    'dark': {
        'ground': '#1a2039', 'surface': '#212846', 'raised': '#2a3257',
        'ink': '#f9a3c0', 'muted': '#c68da3', 'commute': '#f08c3f', 'commute-ink': '#1a2039',
        # Bukit Jalil National Stadium at night, Pak Misai, CC BY-SA 4.0; the crop starts 27% down the picture.
        'photo': ('stadium-night.jpg', 0.27),
    },
    'light': {
        'ground': '#fdeef3', 'surface': '#f9dfe8', 'raised': '#f3cfdc',
        'ink': '#1a2039', 'muted': '#555a75', 'commute': '#a8541c', 'commute-ink': '#fdeef3',
        # Bukit Jalil LRT Station outview (230527) 01, *angys*, CC BY-SA 4.0; the crop starts 6% down the picture.
        'photo': ('bukit-jalil-lrt-day.jpg', 0.06),
    },
}  # fmt: skip

# packages/elements: the mark on its 16px grid, and two glyphs on their 12px grid with a 1.5px stroke.
MARK = '<rect x="0.5" y="10.25" width="15" height="2.5" rx="1.25"/><rect x="6" y="3.25" width="9.5" height="5.5" rx="2.75"/>'
FILLED_TRIANGLE = '<path d="M6 1.5 10.5 10.5h-9Z" fill="currentColor"/>'
REPLAY = '<path d="M2.3 3.4A4.5 4.5 0 1 1 1.5 6"/><path d="M1.2 1.6v2.2h2.2"/>'


class Face:
    def __init__(self, key: str, path: Path):
        font = TTFont(path)
        self.key, self.glyphs, self.cmap, self.upm = key, font.getGlyphSet(), font.getBestCmap(), font['head'].unitsPerEm

    def width(self, text: str, size: float, tracking: float = 0) -> float:
        return sum(self.glyphs[self.cmap[ord(c)]].width * size / self.upm + tracking * size for c in text)


FACES = {
    400: Face('r', FONTS / 'roundo/Roundo-Regular.woff'),
    500: Face('m', FONTS / 'roundo/Roundo-Medium.woff'),
    600: Face('s', FONTS / 'roundo/Roundo-SemiBold.woff'),
    'figures': Face('f', FONTS / 'skyclause-figures/SkyclauseFigures-Regular.woff2'),
}
# The outlines the document in progress uses, by id; `svg` writes them as <defs> and starts the next document.
outlines: dict[str, str] = {}


def text(s, x, y, size, fill, weight=400, anchor='start', tracking=0.0) -> str:
    """One line of type; `y` is the baseline."""
    face = FACES[weight]
    x -= {'start': 0, 'middle': 0.5, 'end': 1}[anchor] * (face.width(s, size, tracking) - tracking * size)
    uses, advance = [], 0.0
    for c in s:
        name = face.cmap[ord(c)]
        pen = SVGPathPen(face.glyphs, ntos=lambda v: f'{v:g}')
        face.glyphs[name].draw(pen)
        if pen.getCommands():
            key = f'{face.key}{ord(c):x}'
            outlines[key] = pen.getCommands()
            uses.append(f'<use href="#{key}" x="{advance:g}"/>')
        advance += face.glyphs[name].width + tracking * face.upm
    scale = size / face.upm
    return f'<g transform="translate({x:.2f} {y:.2f}) scale({scale:g} {-scale:g})" fill="{fill}">{"".join(uses)}</g>'


def wrap(s: str, weight, size: float, width: float) -> list[str]:
    lines: list[str] = []
    for word in s.split():
        if lines and FACES[weight].width(f'{lines[-1]} {word}', size) <= width:
            lines[-1] += f' {word}'
        else:
            lines.append(word)
    return lines


def glyph(paths, x, y, size, colour) -> str:
    return (
        f'<g transform="translate({x:.2f} {y:.2f}) scale({size / 12:g})" fill="none" stroke="{colour}" '
        f'color="{colour}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{paths}</g>'
    )


def mark(x, y, size, colour) -> str:
    return f'<g transform="translate({x} {y}) scale({size / 16:g})" fill="{colour}">{MARK}</g>'


def svg(width, height, title, desc, defs, body) -> str:
    defs += ''.join(f'<path id="{key}" d="{d}"/>' for key, d in sorted(outlines.items()))
    outlines.clear()
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" '
        f'role="img" aria-labelledby="t d"><title id="t">{title}</title><desc id="d">{desc}</desc>'
        f'<defs>{defs}</defs>{body}</svg>\n'
    )


# The banner: the landing hero's words, one photograph in a capsule, and the 15:30 window on its afternoon.


def rain_totals(first: int, last: int) -> list[tuple[float, float]]:
    """(hour of 2 November 2026 in MYT, 60-minute total in mm) for every 5-minute reading from `first` to `last`."""
    rf = {r['timestamp']: r['rf'] for r in json.loads(CAPTURE.read_text())['data']}
    start = datetime(2026, 11, 2)

    def total(t: datetime) -> float:
        return round(sum(rf[(t - timedelta(minutes=5 * k)).isoformat()] for k in range(12)), 1)

    for hhmm, expected in {'14:55': 29.5, '15:00': 39.0, '15:35': 59.5}.items():
        got = total(datetime.fromisoformat(f'2026-11-02T{hhmm}:00'))
        if got != expected:
            raise SystemExit(f'60-minute total at {hhmm}: expected {expected}, got {got}')
    return [(m / 60, total(start + timedelta(minutes=m))) for m in range(first * 60, last * 60 + 5, 5)]


def banner(theme: str) -> str:
    c = THEMES[theme]
    W, H, P = 1280, 640, 48
    ink, muted = c['ink'], c['muted']
    defs = (
        f'<clipPath id="card"><rect width="{W}" height="{H}" rx="24"/></clipPath>'
        f'<clipPath id="room"><rect x="736" y="{P}" width="900" height="300" rx="150"/></clipPath>'
    )
    parts = [f'<g clip-path="url(#card)"><rect width="{W}" height="{H}" fill="{c["ground"]}"/>']

    # The room: one photograph in a capsule that the right edge crops.
    file, top = c['photo']
    photo = base64.b64encode((PHOTOS / file).read_bytes()).decode()
    parts.append(
        f'<image href="data:image/jpeg;base64,{photo}" x="736" y="{P - 408 * top:.1f}" width="544" height="408" '
        f'preserveAspectRatio="xMidYMid slice" clip-path="url(#room)"/>'
    )

    # The wordmark, the headline and the verdict, as the landing hero says them.
    parts.append(mark(P, 44, 28, ink) + text('Skyclause', P + 38, 66, 24, ink, 500, tracking=-0.025))
    for line, y in (('The call for', 182), ('every window', 274)):
        if FACES[500].width(line, 88, -0.025) > 736 - P - 32:
            raise SystemExit(f'Headline line too wide: {line}')
        parts.append(text(line, P - 4, y, 88, ink, 500, tracking=-0.025))
    word = 'Commute disruption'
    chip = 18 + 18 + 10 + FACES[500].width(word, 22) + 20
    parts.append(
        f'<rect x="{P}" y="306" width="{chip:.1f}" height="44" rx="22" fill="{c["commute"]}"/>'
        + glyph(FILLED_TRIANGLE, P + 18, 319, 18, c['commute-ink'])
        + text(word, P + 46, 335.5, 22, c['commute-ink'], 500)
        + text('for the 15:30 MYT release wave', P + chip + 14, 335.5, 22, ink)
    )

    # The strip: the afternoon from 12:00 to 18:00, with the 60-minute total above it and the window on it.
    x0, x1, base, first, last = P, W - P, 496, 12, 18
    at = lambda hour: x0 + (x1 - x0) * (hour - first) / (last - first)  # noqa: E731
    up = lambda mm: base - mm * 108 / 60  # noqa: E731
    curve = ' '.join(
        f'{"L" if i else "M"}{at(hour):.1f} {up(mm):.1f}' for i, (hour, mm) in enumerate(rain_totals(first, last))
    )
    parts.append(
        f'<rect x="{x0}" y="516" width="{x1 - x0}" height="40" rx="20" fill="{c["raised"]}"/>'
        f'<line x1="{x0}" y1="{up(31):.1f}" x2="{x1}" y2="{up(31):.1f}" stroke="{ink}" stroke-dasharray="4 3" opacity="0.7"/>'
        f'<path d="{curve}" fill="none" stroke="{ink}" stroke-width="2.5" stroke-dasharray="4 2" stroke-linejoin="round"/>'
        f'<circle cx="{at(15):.1f}" cy="{up(39):.1f}" r="4.5" fill="{c["ground"]}" stroke="{ink}" stroke-width="2"/>'
        # The 15:30 to 15:45 window, as a draft: the clause engine's verdict was not reviewed and not sent.
        f'<rect x="{at(15.5) + 1:.1f}" y="521" width="{at(15.75) - at(15.5) - 2:.1f}" height="30" rx="15" '
        f'fill="{c["ground"]}" stroke="{c["commute"]}" stroke-width="2" stroke-dasharray="4 2"/>'
        + glyph(FILLED_TRIANGLE, (at(15.5) + at(15.75)) / 2 - 6, 530, 12, c['commute'])
        + text('Lebat 31 mm', x0, up(31) - 9, 15, muted)
        + text('Lebat crossed at 15:00 MYT · 39.0 mm in 60 min', at(15) - 14, up(39) - 8, 17, ink, 500, 'end')
    )
    for hour in range(first, last + 1):
        anchor = 'start' if hour == first else 'end' if hour == last else 'middle'
        inset = 18 if hour == first else -18 if hour == last else 0
        parts.append(text(f'{hour:02d}:00', at(hour) + inset, 584, 15, muted, 'figures', anchor))

    # The replay tag and what the figure is, top right of the lane and clear of the curve.
    caption = '2 November 2026 · JPS gauge 0232901RF'
    tag = 12 + 14 + 6 + FACES[500].width('Replay', 15) + 14
    left = x1 - FACES[400].width(caption, 15) - 10 - tag
    parts.append(
        f'<rect x="{left:.1f}" y="383" width="{tag:.1f}" height="28" rx="14" fill="{c["raised"]}"/>'
        + glyph(REPLAY, left + 12, 390, 14, ink)
        + text('Replay', left + 32, 402.5, 15, ink, 500)
        + text(caption, x1, 402.5, 15, muted, anchor='end')
        + text('Clause engine verdict: not reviewed, not sent', x1, 428, 15, muted, anchor='end')
    )
    parts.append('</g>')
    return svg(
        W,
        H,
        'Skyclause: the call for every window',
        'The Skyclause wordmark and the headline “The call for every window” beside a photograph of Bukit Jalil in a '
        'capsule. Below, a replay of Monday 2 November 2026: the 60-minute rain total at JPS gauge 0232901RF crosses '
        'the Lebat line of 31 mm at 15:00 MYT, and the clause engine’s verdict for the 15:30 MYT release wave is '
        'Commute disruption, not reviewed and not sent.',
        defs,
        ''.join(parts),
    )


# The architecture: one row per stage, read from the top. Each node is (name, what it does, built).

STAGES = [
    ('Watch', 'Public readings, each kept with its age.', [
        ('JPS Infobanjir', 'Rain gauge 0232901RF, every 5 min', True),
        ('MET Malaysia', 'Warnings every 10 min, forecast every 6 h', True),
        ('DOE APIMS', 'Haze index, every 15 min', True),
        ('Rapid Rail and listings', 'Sources for the Crowd pack', False),
    ]),
    ('Ingest', 'One poll per source serves everyone.', [
        ('Cloud Scheduler', 'Starts each adapter on its cadence', True),
        ('Adapter jobs', 'Cloud Run jobs fetch and parse', True),
        ('Pub/Sub', 'Buffers polls and carries events', True),
        ('Worker batch', 'Cloud Run service writes the readings', True),
    ]),
    ('Decide', 'Code gives the verdict; the model drafts.', [
        ('Declared windows', 'A class, an event or a commute wave', True),
        ('Clause engine', 'CEL verdict; a change is a crossing', True),
        ('Decision agent', 'Gemini on Vertex AI drafts the call', True),
        ('Bundle', 'The draft beside the engine’s verdict', True),
    ]),
    ('Approve', 'Nothing is sent until a person says yes.', [
        ('Approver on the rota', 'Approves, edits or rejects', 'person'),
        ('Web app', 'Next.js on Cloud Run', True),
        ('Approver alerts', 'In-app, web push and email', True),
        ('Cloud Tasks', 'Deadlines for review and expiry', True),
    ]),
    ('Notify', 'Everyone hears the same thing, once.', [
        ('Email notice', 'Resend, to opted-in subscribers', True),
        ('Conditions calendar', 'An ICS feed for each project', True),
        ('Subscriber pages', 'Opt in, unsubscribe, data rights', True),
        ('Webhooks and cards', 'Signed webhooks; share cards for each call', False),
    ]),
    ('Record', 'Written down, then graded.', [
        ('Ledger', 'Append-only and hash-chained', True),
        ('Ledger checks', 'Export it and verify the chain', True),
        ('Grade', 'Next morning, against the gauge', True),
        ('Postgres 18 on Neon', 'Row-level security per organisation', True),
    ]),
]  # fmt: skip
PILOT = ('Pilot', 'On Gemini Enterprise, in /pilot.', [
    ('Camera and Pi 5', 'Edge agents post what they read', True),
    ('Apps Script', 'Feeders, clause check and web app', True),
    ('Sheets and Drive', 'Readings, clauses and crossings', True),
    ('Gemini Enterprise', 'Agent nodes, Approval, Gmail and Jira', False),
])  # fmt: skip
CLOUD = (
    'On Google Cloud in Singapore: Cloud Run, Cloud Scheduler, Pub/Sub, Cloud Tasks, Cloud Storage, Secret Manager '
    'and Cloud KMS, set up by Terraform. Vertex AI is called at its global endpoint.'
)


def architecture(theme: str) -> str:
    c = THEMES[theme]
    W, P, ROW, GAP, RAIL = 960, 24, 92, 22, 158
    ink, muted = c['ink'], c['muted']
    node_x, node_gap = P + 14 + RAIL + 12, 10
    node_w = (W - P - 14 - node_x - 3 * node_gap) / 4
    parts: list[str] = []

    def row(y: float, stage) -> None:
        name, about, nodes = stage
        parts.append(f'<rect x="{P}" y="{y}" width="{W - 2 * P}" height="{ROW}" rx="16" fill="{c["surface"]}"/>')
        pill = FACES[500].width(name, 14) + 28
        parts.append(
            f'<rect x="{P + 14}" y="{y + 14}" width="{pill:.1f}" height="28" rx="14" fill="{ink}"/>'
            + text(name, P + 28, y + 33, 14, c['ground'], 500)
        )
        lines = wrap(about, 400, 13, RAIL - 6)
        if len(lines) > 2:
            raise SystemExit(f'Stage note too long: {about}')
        parts.extend(text(line, P + 14, y + 60 + 17 * i, 13, muted) for i, line in enumerate(lines))
        for i, (title, sub, state) in enumerate(nodes):
            x, top, height = node_x + i * (node_w + node_gap), y + 12, ROW - 24
            lines = wrap(sub, 400, 13, node_w - 24)
            if len(lines) > 2 or FACES[600].width(title, 14) > node_w - 24:
                raise SystemExit(f'Node too long: {title}: {sub}')
            on_ink = state == 'person'
            first = top + (height - 17 * len(lines) - 19) / 2 + 15
            parts.append(box(x, top, node_w, height, 10, state))
            parts.append(text(title, x + 12, first, 14, c['ground'] if on_ink else ink, 600))
            parts.extend(
                text(line, x + 12, first + 19 + 17 * j, 13, c['ground'] if on_ink else muted)
                for j, line in enumerate(lines)
            )

    def box(x: float, y: float, width: float, height: float, radius: float, state) -> str:
        """A node's shape: the one person is ink, what is built is the raised tone, what is not is a dashed edge."""
        if state:
            fill = ink if state == 'person' else c['raised']
            return f'<rect x="{x:.1f}" y="{y}" width="{width:.1f}" height="{height}" rx="{radius}" fill="{fill}"/>'
        return (
            f'<rect x="{x + 1:.1f}" y="{y + 1}" width="{width - 2:.1f}" height="{height - 2}" rx="{radius - 1}" '
            f'fill="none" stroke="{muted}" stroke-width="2" stroke-dasharray="4 3"/>'
        )

    # The wordmark, and what each node's shape means.
    parts.append(mark(P, 22, 22, ink) + text('Skyclause', P + 30, 39.5, 19, ink, 500, tracking=-0.025))
    right = W - P
    for label, state in (('Not built yet', False), ('Built', True), ('A person', 'person')):
        right -= FACES[400].width(label, 13)
        parts.append(text(label, right, 38, 13, muted))
        right -= 36
        parts.append(box(right, 26, 28, 16, 5, state))
        right -= 20

    y = 64
    for i, stage in enumerate(STAGES):
        if i:
            # The arrow down the rail from one stage to the next.
            cx, top = P + 34, y - GAP + 4
            parts.append(
                f'<path d="M{cx} {top}v{GAP - 9}m-4.5 -4.5 4.5 4.5 4.5 -4.5" fill="none" stroke="{ink}" '
                f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
            )
        row(y, stage)
        y += ROW + GAP
    note = y - GAP + 22
    parts.extend(text(line, P + 14, note + 18 * i, 13, muted) for i, line in enumerate(wrap(CLOUD, 400, 13, W - 2 * P - 28)))
    y = note + 18 + 26
    row(y, PILOT)
    H = y + ROW + P
    return svg(
        W,
        H,
        'Skyclause architecture',
        'Six stages, read from the top. Watch: the JPS rain gauge, MET Malaysia warnings and forecasts and the DOE '
        'APIMS haze index; Rapid Rail and venue listings are not built yet. Ingest: Cloud Scheduler starts adapter '
        'jobs on Cloud Run, which publish to Pub/Sub, and the worker writes the readings. Decide: for each declared '
        'window the clause engine gives a verdict in CEL, and Gemini on Vertex AI drafts the call into a bundle. '
        'Approve: a person on the rota approves, edits or rejects in the web app, with alerts and Cloud Tasks '
        'deadlines. Notify: an email notice through Resend, an ICS conditions calendar and subscriber pages; signed '
        'webhooks and share cards are not built yet. Record: an append-only, hash-chained ledger, ledger checks and '
        'a grade the next morning, all in Postgres 18 on Neon. Beside them, the Gemini Enterprise pilot: a phone '
        'camera page and a Raspberry Pi 5 post to Apps Script, which fills Sheets and Drive; the Gemini Enterprise '
        'workflows are not built yet.',
        '',
        f'<rect width="{W}" height="{H}" rx="20" fill="{c["ground"]}"/>' + ''.join(parts),
    )


for theme in THEMES:
    (OUT / f'banner-{theme}.png').write_bytes(bytes(resvg_py.svg_to_bytes(svg_string=banner(theme), zoom=2)))
    (OUT / f'architecture-{theme}.svg').write_text(architecture(theme))
