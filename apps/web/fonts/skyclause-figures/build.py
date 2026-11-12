# Builds "Skyclause Figures": Roundo's digits at one width, so numbers in tables, times and figures line up.
#
# Roundo has no tabular figures (no `tnum` feature; its digits are 330-701 units wide). This takes Roundo's static
# Regular, Medium and SemiBold, keeps only the characters numbers are printed with, gives every digit the advance of
# the widest digit with its outline centred, and renames the family, as the SIL Open Font License asks of a modified
# version. The other characters keep Roundo's own widths. globals.css loads the result ahead of Roundo, limited by
# unicode-range, wherever figures are tabular.
#
# Run from the repository root:
#   uv run --with 'fonttools[woff]==4.62.1' python -I apps/web/fonts/skyclause-figures/build.py
import sys
from pathlib import Path

from fontTools import subset
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
    width = max(hmtx[name][0] for name in names)

    def redraw(name: str, advance: int, shift: float) -> None:
        pen = T2CharStringPen(advance - private.nominalWidthX, glyphs)
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, 1, shift, 0)))
        charstring = pen.getCharString(private=private, globalSubrs=cff.GlobalSubrs)
        top.CharStrings[name] = charstring

    for name in names:
        advance, lsb = hmtx[name]
        shift = round((width - advance) / 2)
        redraw(name, width, shift)
        hmtx[name] = (width, lsb + shift)

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
        'Modified from Roundo by Indian Type Foundry: digits set to one width, other glyphs removed.', 10, 3, 1, 0x409
    )

    font.flavor = 'woff2'
    out = HERE / f'{postscript}.woff2'
    font.save(out)
    return out


if __name__ == '__main__':
    for style, source in STYLES.items():
        print(build(style, source).name)
