# Builds "Skyclause Figures": Roundo's digits at one width, so numbers in tables, times and figures line up.
#
# Roundo has no tabular figures (no `tnum` feature; its digits are 311-696 units wide). This takes Roundo's static
# Regular, Medium and SemiBold, keeps only the characters numbers are printed with, and gives every digit one advance:
#
# - The cell is the median digit width, not the widest, so a figure in a column or a clock is not set wide. It grows
#   only as far as the widest digits need.
# - A digit too wide for the cell (4 and 0) is condensed horizontally, by at most MAX_CONDENSE, to leave
#   PREFERRED_SIDEBEARING either side; if that still leaves less than MIN_SIDEBEARING, the cell is widened instead
#   of condensing further.
# - Every digit, the 1 included, is centred on its ink with equal sidebearings. The 1 gets a foot so it fills its cell
#   like the other digits: without one, "11:11" falls apart into separate stems.
# - The colon, full stop, comma, space and the signs keep Roundo's own, narrow advances, and the colon is lifted to the
#   middle of the digits' height, so a time reads as a time.
#
# The family is renamed, as the SIL Open Font License asks of a modified version. globals.css loads the result ahead
# of Roundo, limited by unicode-range, wherever figures are tabular.
#
# Run from the repository root:
#   uv run --with 'fonttools[woff]==4.62.1' python -I apps/web/fonts/skyclause-figures/build.py
import statistics
import sys
from pathlib import Path

from fontTools import subset
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = Path(sys.argv[0]).resolve().parent
SOURCE = HERE.parent / 'roundo'
FAMILY = 'Skyclause Figures'
DIGITS = '0123456789'
# Digits and what numbers are printed with: . , : minus en dash + % / and the spaces between values and units.
TEXT = DIGITS + '.,:−–+%/ -'
# Spaces Intl formats print that Roundo lacks, as advances in units of Roundo's space: no-break, narrow and thin.
SPACES = {0x00A0: ('uni00A0', 1.0), 0x202F: ('uni202F', 0.5), 0x2009: ('uni2009', 0.5)}
# Squeeze the widest digits by no more than this share of their width.
MAX_CONDENSE = 0.08
# The space, in units, between a digit's ink and the edge of its cell: the least allowed, and what condensing aims for.
MIN_SIDEBEARING = 30
PREFERRED_SIDEBEARING = 40
# The 1 gets a foot, a bar along its base this wide (half either side of the stem) and this share of the stem's
# thickness, so a 1 fills its cell like the other digits and "11:11" holds together.
FOOT_HALF_WIDTH = 150
FOOT_THICKNESS = 0.85


def with_foot(recording: RecordingPen) -> RecordingPen:
    points = [segment[1][0] for segment in recording.value if segment[0] in ('moveTo', 'lineTo')]
    bottom = sorted(x for x, y in points if y == 0)
    left, right = bottom[0], bottom[-1]
    height = round((right - left) * FOOT_THICKNESS)
    centre = (left + right) / 2
    foot_left, foot_right = round(centre - FOOT_HALF_WIDTH), round(centre + FOOT_HALF_WIDTH)
    outline = []
    for x, y in points:
        if y == 0 and x == left:
            outline += [(left, height), (foot_left, height), (foot_left, 0)]
        elif y == 0 and x == right:
            outline += [(foot_right, 0), (foot_right, height), (right, height)]
        else:
            outline.append((x, y))
    result = RecordingPen()
    result.moveTo(outline[0])
    for point in outline[1:]:
        result.lineTo(point)
    result.closePath()
    return result


STYLES = {'Regular': 'Roundo-Regular.woff', 'Medium': 'Roundo-Medium.woff', 'SemiBold': 'Roundo-SemiBold.woff'}


def build(style: str, source: str) -> Path:
    font = TTFont(SOURCE / source)
    options = subset.Options()
    options.desubroutinize = True
    options.name_IDs = ['*']
    options.layout_features = []
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=TEXT)
    subsetter.subset(font)

    cmap = font.getBestCmap()
    hmtx = font['hmtx']
    cff = font['CFF '].cff
    top = cff.topDictIndex[0]
    private = top.Private
    glyphs = font.getGlyphSet()
    names = [cmap[ord(digit)] for digit in DIGITS]

    # Outlines as drawn, so the 1 can be changed before it is measured.
    outlines = {}
    for name in names + [cmap[0x3A]]:
        recording = RecordingPen()
        glyphs[name].draw(recording)
        outlines[name] = recording
    outlines[cmap[ord('1')]] = with_foot(outlines[cmap[ord('1')]])

    def extent(recording: RecordingPen) -> tuple:
        bounds = BoundsPen(glyphs)
        recording.replay(bounds)
        return bounds.bounds

    def redraw(name: str, advance: int, matrix: tuple) -> None:
        pen = T2CharStringPen(advance - private.nominalWidthX, glyphs)
        outlines[name].replay(TransformPen(pen, matrix))
        top.CharStrings[name] = pen.getCharString(private=private, globalSubrs=cff.GlobalSubrs)

    # The cell is the median advance, widened if the widest digits, condensed by MAX_CONDENSE, would still touch
    # their neighbours.
    ink = {name: (extent(outlines[name])[0], extent(outlines[name])[2]) for name in names}
    median = statistics.median(hmtx[name][0] for name in names)
    fit = max((right - left) * (1 - MAX_CONDENSE) + 2 * MIN_SIDEBEARING for left, right in ink.values())
    width = round(max(median, fit))

    report = {}
    for name in names:
        left, right = ink[name]
        scale = max(1 - MAX_CONDENSE, min(1.0, (width - 2 * PREFERRED_SIDEBEARING) / (right - left)))
        # Equal sidebearings: the ink, not the original advance, is centred in the cell.
        shift = (width - scale * (right - left)) / 2 - scale * left
        redraw(name, width, (scale, 0, 0, 1, shift, 0))
        sidebearing = round(shift + scale * left)
        hmtx[name] = (width, sidebearing)
        report[name] = (scale, sidebearing)
    # The colon's two dots are centred on the height of the digits (Roundo sets them low, at x-height), so a time reads
    # as one. Its advance stays Roundo's own.
    colon = cmap[0x3A]
    colon_bounds, zero_bounds = extent(outlines[colon]), extent(outlines[cmap[ord('0')]])
    lift = round((zero_bounds[1] + zero_bounds[3]) / 2 - (colon_bounds[1] + colon_bounds[3]) / 2)
    redraw(colon, hmtx[colon][0], (1, 0, 0, 1, 0, lift))
    widths = {char: hmtx[cmap[ord(char)]][0] for char in ':.,- '}
    print(f'{style}: cell {width} (median {median}, fit {fit:.0f}); colon up {lift}; marks {widths}')
    print('  ' + ' '.join(f'{d}:{report[cmap[ord(d)]][0]:.3f}/{report[cmap[ord(d)]][1]}' for d in DIGITS))

    space = hmtx[cmap[0x20]][0]
    order = font.getGlyphOrder()
    for codepoint, (name, share) in SPACES.items():
        advance = round(space * share)
        pen = T2CharStringPen(advance - private.nominalWidthX, glyphs)
        order.append(name)
        top.charset.append(name)
        top.CharStrings.charStrings[name] = len(top.CharStrings.charStringsIndex)
        top.CharStrings.charStringsIndex.append(pen.getCharString(private=private, globalSubrs=cff.GlobalSubrs))
        hmtx[name] = (advance, 0)
        for table in font['cmap'].tables:
            if table.isUnicode():
                table.cmap[codepoint] = name
    font.setGlyphOrder(order)
    font['maxp'].numGlyphs = len(order)
    font['hhea'].numberOfHMetrics = len(order)

    postscript = f'SkyclauseFigures-{style}'
    full = f'{FAMILY} {style}'
    cff.fontNames = [postscript]
    top.FullName = full
    top.FamilyName = FAMILY
    name_table = font['name']
    for record in list(name_table.names):
        if record.nameID in (1, 3, 4, 6, 16, 17):
            name_table.removeNames(nameID=record.nameID)
    name_table.setName(FAMILY if style in ('Regular',) else f'{FAMILY} {style}', 1, 3, 1, 0x409)
    name_table.setName(f'{postscript};2.000', 3, 3, 1, 0x409)
    name_table.setName(full, 4, 3, 1, 0x409)
    name_table.setName(postscript, 6, 3, 1, 0x409)
    name_table.setName(FAMILY, 16, 3, 1, 0x409)
    name_table.setName(style, 17, 3, 1, 0x409)
    name_table.setName(
        'Modified from Roundo by Indian Type Foundry: digits set to one width, a foot on the 1, the colon centred, '
        'other glyphs removed.',
        10,
        3,
        1,
        0x409,
    )

    font.flavor = 'woff2'
    out = HERE / f'{postscript}.woff2'
    font.save(out)
    return out


if __name__ == '__main__':
    for style, source in STYLES.items():
        print(build(style, source).name)
