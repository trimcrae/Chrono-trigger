"""Hand-authored props: the set pieces that are bigger than a tile.

Same palette discipline as sprites.py and tiles.py. Sizes are fixed by the
engine, which anchors props by their own dimensions:

    gato     40x48   the singing robot in Leene Square, and the battle sprite
    bell     48x64   Leene's Bell in its tower
    gate     48x48   the rift the Telepod tears open
    balloon  16x24   fairground dressing

The bell and the balloon are written out as grids, where the exact pixels are
the point. Gato and the gate are generated: he is built from circles and rounded
boxes, and the gate is a spiral, and both are better said as shapes than as
hundreds of hand-placed characters.
"""

from __future__ import annotations

import math

PAL = {
    ".": None,
    "o": "#2a1c28",       # outline, warm dark
    # brass body
    "g": "#e0b53c", "G": "#a9821f", "h": "#f7dc84",
    # steel
    "k": "#8fa0b0", "K": "#5c6b7a", "l": "#c8d5e0",
    # dark panel
    "d": "#3b4450", "D": "#232a33",
    # lit glass
    "i": "#69e0f2", "I": "#b8f4ff", "j": "#2b7f95",
    # red accents
    "r": "#d8483c", "R": "#9c2b22",
    # stone
    "s": "#cfc7b4", "S": "#a49b87", "z": "#eae3d2",
    # roof slate
    "b": "#3d6fb0", "B": "#27497a", "c": "#6699d8",
    # rope / wood
    "w": "#8a5a2c", "W": "#5c3a1a",
    "1": "#ffffff",
}

def _gato(w=40, h=48):
    """The singing robot: a round brass body, cat ears, and a chest panel.

    Drawn with shapes rather than typed out as a grid — he is built from circles
    and rounded boxes, and forty rows of forty characters is a worse way to say
    that. The silhouette is outlined afterwards, the same as the field sprites.
    """
    from PIL import Image, ImageDraw

    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    C = {k: (tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) + (255,)) for k, v in PAL.items() if v}

    # ears first, so the head laps over their base
    d.polygon([(10, 1), (16, 9), (6, 9)], fill=C["g"])
    d.polygon([(29, 1), (33, 9), (23, 9)], fill=C["g"])
    d.polygon([(10, 4), (14, 9), (7, 9)], fill=C["r"])
    d.polygon([(29, 4), (32, 9), (25, 9)], fill=C["r"])

    # head
    d.ellipse([7, 3, 32, 21], fill=C["g"])
    d.ellipse([9, 5, 24, 15], fill=C["h"])          # light from the upper left
    d.ellipse([7, 12, 32, 21], fill=C["g"])

    # eyes, with a glint
    for ex in (13, 23):
        d.ellipse([ex, 9, ex + 4, 14], fill=C["D"])
        d.ellipse([ex, 9, ex + 2, 11], fill=C["I"])
    # muzzle plate and grille
    d.rounded_rectangle([14, 15, 25, 19], radius=2, fill=C["k"])
    for gx in range(16, 25, 2):
        d.line([(gx, 16), (gx, 18)], fill=C["K"])

    # body
    d.rounded_rectangle([4, 20, 35, 40], radius=7, fill=C["g"])
    d.rounded_rectangle([6, 22, 22, 32], radius=5, fill=C["h"])
    d.rounded_rectangle([4, 30, 35, 40], radius=7, fill=C["g"])
    d.rounded_rectangle([3, 38, 36, 41], radius=2, fill=C["G"])

    # chest panel
    d.rounded_rectangle([12, 25, 27, 36], radius=2, fill=C["D"])
    d.rounded_rectangle([14, 27, 25, 34], radius=1, fill=C["i"])
    d.rounded_rectangle([15, 28, 21, 31], radius=1, fill=C["I"])

    # arms
    for ax in (0, 32):
        d.rounded_rectangle([ax, 23, ax + 7, 31], radius=3, fill=C["g"])
        d.rounded_rectangle([ax + 1, 24, ax + 4, 27], radius=2, fill=C["h"])

    # legs
    for lx in (9, 23):
        d.rounded_rectangle([lx, 41, lx + 7, 46], radius=2, fill=C["k"])
        d.rounded_rectangle([lx, 44, lx + 7, 46], radius=2, fill=C["K"])
        d.line([(lx + 1, 42), (lx + 1, 44)], fill=C["l"])

    return _outline(im)


def _outline(im):
    """Lay the warm dark outline around whatever silhouette is already drawn."""
    from PIL import Image

    w, h = im.size
    src = im.load()
    out = im.copy()
    dst = out.load()
    ink = tuple(int(PAL["o"][i:i + 2], 16) for i in (1, 3, 5)) + (255,)
    for y in range(h):
        for x in range(w):
            if src[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3]:
                    dst[x, y] = ink
                    break
    return out


BELL = [
    "................................................",
    "................................................",
    "....................oooo........................",
    "...................ohhhho.......................",
    "...................ohggho.......................",
    "....................oggo........................",
    "................ooooogoooooo....................",
    "..............oobbbbbbbbbbboo...................",
    "............oobbbbbbbbbbbbbbboo.................",
    "..........oobbbccccccccccccbbbboo...............",
    "........oobbbcccccccccccccccbbbbboo.............",
    "......oobbbccccccccccccccccccbbbbbboo...........",
    "....oobbbbccccccccccccccccccccbbbbbbboo.........",
    "..ooBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBoo.......",
    ".oBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBo.......",
    ".oooooooooooooooooooooooooooooooooooooooo.......",
    "...ozzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzo.........",
    "...oszzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzSo.........",
    "...ossssssssssssssssssssssssssssssssSSo.........",
    "...oSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSo.........",
    "...ooooooooooooooooooooooooooooooooooooo........",
    "....ozzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzo..........",
    "....osssssssssssssssssssssssssssssssSo..........",
    "....osssoooooooooooooooooooooooosssSSo..........",
    "....osssoDDDDDDDDDDDDDDDDDDDDDDosssSSo..........",
    "....osssoDDDDDDDDDDDDDDDDDDDDDDosssSSo..........",
    "....osssoDDDDoooooooooooDDDDDDDosssSSo..........",
    "....osssoDDDoGGGGGGGGGGGoDDDDDDosssSSo..........",
    "....osssoDDoGhhhhhhhhhhGGoDDDDDosssSSo..........",
    "....osssoDDoGhhhhhhhhhhhGoDDDDDosssSSo..........",
    "....osssoDDoGhggggggggghGoDDDDDosssSSo..........",
    "....osssoDDoGhggggggggghGoDDDDDosssSSo..........",
    "....osssoDDoGhggggggggghGoDDDDDosssSSo..........",
    "....osssoDDoGGhgggggggghGoDDDDDosssSSo..........",
    "....osssoDDoGGGhhgggggghGoDDDDDosssSSo..........",
    "....osssoDDooGGGGGGGGGGGooDDDDDosssSSo..........",
    "....osssoDDoGGGGGGGGGGGGGoDDDDDosssSSo..........",
    "....osssoDDoGgggggggggggGoDDDDDosssSSo..........",
    "....osssoDDooooooooooooooo.DDDDosssSSo..........",
    "....osssoDDDDDoGGGGGGGoDDDDDDDDosssSSo..........",
    "....osssoDDDDDDoGGGGGoDDDDDDDDDosssSSo..........",
    "....osssoDDDDDDDoGGGoDDDDDDDDDDosssSSo..........",
    "....osssoDDDDDDDDoooDDDDDDDDDDDosssSSo..........",
    "....osssoDDDDDDDDDDDDDDDDDDDDDDosssSSo..........",
    "....osssooooooooooooooooooooooooosssSSo.........",
    "....osssssssssssssssssssssssssssssssSSo.........",
    "....ozsssssssssssssssssssssssssssssSSSo.........",
    "....ossssssssssssssssssssssssssssssSSSo.........",
    "....oSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSo.........",
    "....ooooooooooooooooooooooooooooooooooo.........",
    "...ozzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzo........",
    "...osssssssssssssssssssssssssssssssssSSo........",
    "...osssssssssssssssssssssssssssssssssSSo........",
    "...osssssssssssssssssssssssssssssssssSSo........",
    "...oSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSo........",
    "...ooooooooooooooooooooooooooooooooooooo........",
    "..ozzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzo.......",
    "..ossssssssssssssssssssssssssssssssssssSo.......",
    "..ossssssssssssssssssssssssssssssssssssSo.......",
    "..oSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSo.......",
    "..ooooooooooooooooooooooooooooooooooooooo.......",
    "................................................",
    "................................................",
    "................................................",
]

BALLOON = [
    "....oooooo......",
    "..oorrrrrroo....",
    ".orrrrrrrrrro...",
    ".or1rrrrrrrro...",
    "or11rrrrrrrrro..",
    "or1rrrrrrrrrro..",
    "orrrrrrrrrrRRo..",
    "orrrrrrrrrrRRo..",
    ".orrrrrrrrRRo...",
    ".oRRrrrrrRRRo...",
    "..ooRRRRRRoo....",
    "....oRRRRo......",
    ".....orro.......",
    "......o1o.......",
    "......o1o.......",
    ".......1........",
    ".......1........",
    "......1.........",
    "......1.........",
    ".......1........",
    ".......1........",
    "......1.........",
    "......1.........",
    "................",
]


def _from_grid(rows, w, h):
    from PIL import Image

    assert len(rows) == h, f"expected {h} rows, got {len(rows)}"
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = im.load()
    for y, row in enumerate(rows):
        assert len(row) == w, f"row {y} is {len(row)} wide, expected {w}: {row!r}"
        for x, key in enumerate(row):
            col = PAL[key]
            if col:
                px[x, y] = tuple(int(col[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
    return im


def _gate(w=48, h=48):
    """A rift: three spiral arms over a soft core, drawn rather than typed."""
    from PIL import Image

    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = im.load()
    cx, cy = w / 2, h / 2

    # core glow, densest at the middle
    for y in range(h):
        for x in range(w):
            dx, dy = (x + 0.5 - cx) / (w * 0.5), (y + 0.5 - cy) / (h * 0.46)
            d = math.hypot(dx, dy)
            if d < 1.0:
                a = int(200 * (1.0 - d) ** 2)
                if a > 6:
                    px[x, y] = (46, 96, 200, a)

    # arms, brightest at the centre and cooling outwards
    for arm in range(3):
        for step in range(150):
            ang = arm * (math.pi * 2 / 3) + step * 0.055
            rad = 1.4 + step * 0.135
            gx = round(cx + math.cos(ang) * rad)
            gy = round(cy + math.sin(ang) * rad * 1.12)
            if not (0 <= gx < w and 0 <= gy < h):
                continue
            t = step / 150
            if t < 0.25:
                col = (255, 255, 255, 255)
            elif t < 0.55:
                col = (184, 244, 255, 240)
            elif t < 0.8:
                col = (105, 224, 242, 215)
            else:
                col = (64, 144, 240, 180)
            px[gx, gy] = col
            if gx + 1 < w:
                px[gx + 1, gy] = col
    return im


def prop_images() -> dict:
    return {
        "gato": _gato(),
        "bell": _from_grid(BELL, 48, 64),
        "balloon": _from_grid(BALLOON, 16, 24),
        "gate": _gate(),
    }
