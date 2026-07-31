"""Hand-authored 16x16 map tiles, drawn to sit with the field sprites.

Original art, same idiom as tools/art/sprites.py: a limited palette, one light
source from the upper left, and shading in three steps rather than gradients.

Two kinds of tile live here.

* **Ground** — grass, dirt, pavement, water. These repeat across whole screens,
  so their texture is scattered by a fixed seeded pattern instead of by hand;
  hand-placed noise reads as a stamped motif the moment it tiles.
* **Structure** — trees, roofs, furniture, machinery. These are written out as
  grids, because their shape is the point.

`js/game.js` draws a ground layer under the tiles listed in OVER_GROUND before
drawing the tile itself, so those are authored with transparency and sit on
whatever the map's floor happens to be.
"""

from __future__ import annotations

W = H = 16

# Tiles the engine backs with grass (outdoors) or floorboards (indoors).
OVER_GROUND = set("TWSbqBtgkprsDGwe")

PAL = {
    ".": None,            # transparent
    "0": "#0a0a0e",       # true black
    # grass
    "a": "#4a9e3f", "A": "#357a30", "b": "#63b84e",
    # bare earth / path
    "d": "#c19a63", "D": "#9c7846", "e": "#d9b98a",
    # cut stone
    "p": "#b6ae9e", "P": "#8e887a", "q": "#d2cbbc",
    # water
    "w": "#2f6fb8", "W": "#1f4c88", "v": "#5fa2dc",
    # foliage
    "n": "#2f7a34", "N": "#1d5324", "o": "#4fa844",
    # trunks / bark
    "t": "#6b4526", "T": "#472c17",
    # worked wood
    "u": "#a9743f", "U": "#7d5129", "y": "#c99a63",
    # plaster
    "s": "#ddd2b6", "S": "#b0a68c", "z": "#f2ead4",
    # roof tile
    "r": "#b8483c", "R": "#8b3128", "x": "#d4675a",
    # metal
    "k": "#8fa0b0", "K": "#5c6b7a", "l": "#c0cdd8",
    # brass / gold
    "g": "#d8b23a", "G": "#a17f1e", "h": "#f0d878",
    # cloth
    "c": "#c14a5e", "C": "#8e2f40", "m": "#e0778a",
    # carpet, deeper than the striped awning cloth
    "5": "#8e3040", "6": "#6d2231", "7": "#a33e4e",
    # glass and lamps
    "i": "#7fe3f5", "j": "#2f7f95",
    "1": "#ffffff",
    "2": "#f2e06a",       # yellow bloom
    "3": "#f0a0c0",       # pink bloom
    "4": "#4fbf5a",       # leaf
}


def _rng(seed: int):
    """Same xorshift the game uses, so textures land in the same visual family."""
    s = seed & 0xFFFFFFFF or 1

    def nxt():
        nonlocal s
        s ^= (s << 13) & 0xFFFFFFFF
        s ^= s >> 17
        s ^= (s << 5) & 0xFFFFFFFF
        s &= 0xFFFFFFFF
        return s / 4294967296

    return nxt


def _speckle(base, dark, light, seed, n_dark, n_light):
    """A flat field with scattered two-tone speckle."""
    grid = [[base] * W for _ in range(H)]
    r = _rng(seed)
    for _ in range(n_dark):
        grid[int(r() * H)][int(r() * W)] = dark
    for _ in range(n_light):
        grid[int(r() * H)][int(r() * W)] = light
    return grid


def _rows(grid):
    return ["".join(row) for row in grid]


# --------------------------------------------------------------------------- #
# ground                                                                       #
# --------------------------------------------------------------------------- #

def _grass(flowers=False):
    grid = _speckle("a", "A", "b", 0x9E3F, 26, 18)
    # a few upright tufts so the field has some direction to it
    for (tx, ty) in ((2, 5), (9, 3), (13, 10), (5, 12)):
        grid[ty][tx] = "A"
        grid[ty - 1][tx] = "b"
    if flowers:
        for (fx, fy, col) in ((3, 3, "2"), (11, 6, "1"), (7, 11, "3"), (14, 2, "2")):
            grid[fy][fx] = col
            grid[fy][fx - 1] = "b"
    return _rows(grid)


def _dirt():
    grid = _speckle("d", "D", "e", 0x7A46, 22, 16)
    for x in range(W):                    # faint wheel ruts
        if (x + 1) % 5:
            grid[6][x] = "D" if x % 2 else "d"
            grid[11][x] = "D" if x % 3 else "d"
    return _rows(grid)


def _pavement():
    grid = _speckle("p", "P", "q", 0x5A9E, 14, 12)
    for x in range(W):                    # slab joints, offset course to course
        grid[7][x] = "P" if x % 2 else "p"
        grid[15][x] = "P" if x % 2 else "p"
    for y in range(0, 8):
        grid[y][3] = "P" if y % 2 else "p"
    for y in range(8, 16):
        grid[y][11] = "P" if y % 2 else "p"
    for x in range(W):                    # lit top edge of each course
        if grid[0][x] == "p":
            grid[0][x] = "q"
        if grid[8][x] == "p":
            grid[8][x] = "q"
    return _rows(grid)


def _rug():
    """A carpet spans many tiles, so it can carry no border and no centred motif:
    either one turns the floor into a chequerboard. A diagonal weave on a four
    pixel period tiles cleanly in both directions."""
    grid = [["5"] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if (x + y) % 4 == 0:
                grid[y][x] = "7"
            elif (x - y) % 4 == 0:
                grid[y][x] = "6"
    r = _rng(0x8E30)
    for _ in range(18):
        grid[int(r() * H)][int(r() * W)] = "6"
    return _rows(grid)


def _floor():
    """Planks with knots scattered by seed; fixed knots repeat as a dot lattice."""
    grid = [["u"] * W for _ in range(H)]
    for x in range(W):
        for y in (0, 5, 10, 15):
            grid[y][x] = "y" if y != 15 else "U"
        for y in (4, 9, 14):
            grid[y][x] = "U"
    r = _rng(0xA974)
    for _ in range(5):
        y = int(r() * H)
        if grid[y][0] == "u":
            grid[y][int(r() * W)] = "U"
    return _rows(grid)


def _water():
    grid = [["w"] * W for _ in range(H)]
    r = _rng(0x6FB8)
    for y in range(H):
        for x in range(W):
            if r() > 0.86:
                grid[y][x] = "W"
    for (wy, wx0, wl) in ((2, 1, 5), (6, 8, 6), (10, 3, 4), (13, 9, 5)):
        for i in range(wl):
            grid[wy][(wx0 + i) % W] = "v"
    return _rows(grid)


# --------------------------------------------------------------------------- #
# structures                                                                   #
# --------------------------------------------------------------------------- #

STRUCT: dict[str, list[str]] = {
    # a single-tile tree: canopy with a trunk showing beneath
    "T": [
        "....NNNNNNN.....",
        "..NNnnnnnnnNN...",
        ".NnnooonnnnnnN..",
        ".NnooonnnnnnnN..",
        "NnnooonnnnnnnnN.",
        "NnnnnnnnnnnnnnN.",
        "NnnnnnnnnnnnnnN.",
        ".NnnnnnnnnnnnN..",
        ".NNnnnnnnnnnNN..",
        "..NNnnnnnnnNN...",
        "....NttttTN.....",
        ".....tttT.......",
        ".....tttT.......",
        ".....tttT.......",
        "....ttttTT......",
        "...NNNNNNNN.....",
    ],
    "C": [
        "PPPPPPPPPPPPPPPP",
        "PqqqqqPPqqqqqqPP",
        "PqppppqPqppppqPP",
        "PqppppqPqppppqPP",
        "PqppppqPqppppqPP",
        "PPqqqqPPPqqqqPPP",
        "PPPPPPPPPPPPPPPP",
        "PqqqqqqPPqqqqqPP",
        "PqppppppqPqpppqP",
        "PqppppppqPqpppqP",
        "PqppppppqPqpppqP",
        "PPqqqqqqPPPqqqPP",
        "PPPPPPPPPPPPPPPP",
        "PqqqqPPqqqqqqqPP",
        "PqpppqPqpppppqPP",
        "PPPPPPPPPPPPPPPP",
    ],
    "W": [
        "................",
        "................",
        "................",
        "..U..........U..",
        "..u..........u..",
        "UUuUUUUUUUUUUuUU",
        "yyuyyyyyyyyyyuyy",
        "..u..........u..",
        "..u..........u..",
        "UUuUUUUUUUUUUuUU",
        "yyuyyyyyyyyyyuyy",
        "..u..........u..",
        "..u..........u..",
        "..U..........U..",
        "..T..........T..",
        "................",
    ],
    "S": [
        "................",
        "...UUUUUUUUUU...",
        "...UyyyyyyyyU...",
        "...UyUUUUUUyU...",
        "...UyUyyyyUyU...",
        "...UyUyUUyUyU...",
        "...UyUyyyyUyU...",
        "...UyUUUUUUyU...",
        "...UyyyyyyyyU...",
        "...UUUUUUUUUU...",
        "......UuU.......",
        "......UuU.......",
        "......UuU.......",
        "......UuU.......",
        ".....UUuUU......",
        "................",
    ],
    "H": [
        "zzzzzzzzzzzzzzzz",
        "ssssssssssssssss",
        "ssssssssssssssss",
        "sssSsssssssssSss",
        "ssssssssssssssss",
        "ssssssssssssssss",
        "ssssssssssssssss",
        "SSSSSSSSSSSSSSSS",
        "zzzzzzzzzzzzzzzz",
        "ssssssssssssssss",
        "ssssssssssssssss",
        "sssssSsssssssSss",
        "ssssssssssssssss",
        "ssssssssssssssss",
        "ssssssssssssssss",
        "SSSSSSSSSSSSSSSS",
    ],
    "R": [
        "xxxxxxxxxxxxxxxx",
        "rrrrrrrrrrrrrrrr",
        "rrrrrrrrrrrrrrrr",
        "RRRRRRRRRRRRRRRR",
        "..xxxx....xxxx..",
        "..rrrr....rrrr..",
        "RRrrrrRRRRrrrrRR",
        "RRRRRRRRRRRRRRRR",
        "xxxxxxxxxxxxxxxx",
        "rrrrrrrrrrrrrrrr",
        "rrrrrrrrrrrrrrrr",
        "RRRRRRRRRRRRRRRR",
        "..xxxx....xxxx..",
        "..rrrr....rrrr..",
        "RRrrrrRRRRrrrrRR",
        "RRRRRRRRRRRRRRRR",
    ],
    "w": [
        "ssssssssssssssss",
        "sSSSSSSSSSSSSSSs",
        "sSUUUUUUUUUUUUSs",
        "sSUiiiiUiiiiUUSs",
        "sSUiiiiUiiiiUUSs",
        "sSUiiiiUiiiiUUSs",
        "sSUiiiiUiiiiUUSs",
        "sSUUUUUUUUUUUUSs",
        "sSUiiiiUiiiiUUSs",
        "sSUiiiiUiiiiUUSs",
        "sSUiiiiUiiiiUUSs",
        "sSUiiiiUiiiiUUSs",
        "sSUUUUUUUUUUUUSs",
        "sSSSSSSSSSSSSSSs",
        "ssssssssssssssss",
        "SSSSSSSSSSSSSSSS",
    ],
    "D": [
        "UUUUUUUUUUUUUUUU",
        "UyyyyyyyyyyyyyyU",
        "UyUUUUUUUUUUUUyU",
        "UyUuuuuuuuuuuUyU",
        "UyUuUUUUUUUUuUyU",
        "UyUuUyyyyyyUuUyU",
        "UyUuUyuuuuyUuUyU",
        "UyUuUyuuuuyUuUyU",
        "UyUuUyuuuuyUuUyU",
        "UyUuUyyyyyyUuUyU",
        "UyUuUUUUUUUUuUyU",
        "UyUuuuuuuuguuUyU",
        "UyUUUUUUUUgUUUyU",
        "UyyyyyyyyyyyyyyU",
        "UUUUUUUUUUUUUUUU",
        "TTTTTTTTTTTTTTTT",
    ],
    "f": [
        "yyyyyyyyyyyyyyyy",
        "uuuuuuuuuuuuuuuu",
        "uuuuuuuuuuuuuuuu",
        "uuuUuuuuuuuuuuuu",
        "UUUUUUUUUUUUUUUU",
        "yyyyyyyyyyyyyyyy",
        "uuuuuuuuuuuuuuuu",
        "uuuuuuuuuUuuuuuu",
        "uuuuuuuuuuuuuuuu",
        "UUUUUUUUUUUUUUUU",
        "yyyyyyyyyyyyyyyy",
        "uuuuuuuuuuuuuuuu",
        "uuuuuUuuuuuuuuuu",
        "uuuuuuuuuuuuuuuu",
        "UUUUUUUUUUUUUUUU",
        "yyyyyyyyyyyyyyyy",
    ],
    "#": [
        "zzzzzzzzzzzzzzzz",
        "ssssssssssssssss",
        "ssssssssssssssss",
        "ssssssssssssssss",
        "sssssssssSssssss",
        "ssssssssssssssss",
        "ssssssssssssssss",
        "ssSsssssssssssss",
        "ssssssssssssssss",
        "ssssssssssssssss",
        "ssssssssssssssss",
        "SSSSSSSSSSSSSSSS",
        "UUUUUUUUUUUUUUUU",
        "uuuuuuuuuuuuuuuu",
        "UUUUUUUUUUUUUUUU",
        "TTTTTTTTTTTTTTTT",
    ],
    "r": [
        "CCCCCCCCCCCCCCCC",
        "CccccccccccccccC",
        "CccccccCCccccccC",
        "CcccccCmmCcccccC",
        "CccccCmmmmCccccC",
        "CcccCmmCCmmCcccC",
        "CccCmmCccCmmCccC",
        "CcCmmCccccCmmCcC",
        "CcCmmCccccCmmCcC",
        "CccCmmCccCmmCccC",
        "CcccCmmCCmmCcccC",
        "CccccCmmmmCccccC",
        "CccccccCCccccccC",
        "CccccccccccccccC",
        "CCCCCCCCCCCCCCCC",
        "CCCCCCCCCCCCCCCC",
    ],
    "b": [
        "................",
        "..UUUUUUUUUUUU..",
        "..UyyyyyyyyyyU..",
        "..U11111111uyU..",
        "..U11111111uyU..",
        "..U11111111uyU..",
        "..U11111111uyU..",
        "..Uzzzzzzzz1yU..",
        "..UccccccccyyU..",
        "..UcmmmmmmcyyU..",
        "..UcmccccmcyyU..",
        "..UcmccccmcyyU..",
        "..UcmccccmcyyU..",
        "..UcmmmmmmcyyU..",
        "..UccccccccyyU..",
        "..UUUUUUUUUUUU..",
    ],
    "q": [
        "................",
        "..UccccccccyyU..",
        "..UcmmmmmmcyyU..",
        "..UcmccccmcyyU..",
        "..UcmccccmcyyU..",
        "..UcmmmmmmcyyU..",
        "..UccccccccyyU..",
        "..UcmmmmmmcyyU..",
        "..UcmccccmcyyU..",
        "..UcmmmmmmcyyU..",
        "..UccccccccyyU..",
        "..UUUUUUUUUUUU..",
        "..U..........U..",
        "..U..........U..",
        "..UU........UU..",
        "................",
    ],
    "s": [
        "................",
        "UUUUUUUUUUUUUUUU",
        "yyyyyyyyyyyyyyyy",
        "uuuuuuuuuuuuuuuu",
        "UUUUUUUUUUUUUUUU",
        "................",
        "UUUUUUUUUUUUUUUU",
        "yyyyyyyyyyyyyyyy",
        "uuuuuuuuuuuuuuuu",
        "UUUUUUUUUUUUUUUU",
        "................",
        "UUUUUUUUUUUUUUUU",
        "yyyyyyyyyyyyyyyy",
        "uuuuuuuuuuuuuuuu",
        "UUUUUUUUUUUUUUUU",
        "................",
    ],
    "B": [
        "................",
        ".UUUUUUUUUUUUUU.",
        ".UyyyyyyyyyyyyU.",
        ".Uc1g1c1i1c1g1U.",
        ".Uc1g1c1i1c1g1U.",
        ".Uc1g1c1i1c1g1U.",
        ".UUUUUUUUUUUUUU.",
        ".UyyyyyyyyyyyyU.",
        ".Ui1c1g1c1i1c1U.",
        ".Ui1c1g1c1i1c1U.",
        ".Ui1c1g1c1i1c1U.",
        ".UUUUUUUUUUUUUU.",
        ".UyyyyyyyyyyyyU.",
        ".UuuuuuuuuuuuuU.",
        ".UUUUUUUUUUUUUU.",
        "................",
    ],
    "t": [
        "................",
        "................",
        "..UUUUUUUUUUUU..",
        "..UyyyyyyyyyyU..",
        "..UuuuuuuuuuuU..",
        "..UuuuuuuuuuuU..",
        "..UuuuuuuuuuuU..",
        "..UUUUUUUUUUUU..",
        "...U........U...",
        "...U........U...",
        "...U........U...",
        "...U........U...",
        "...U........U...",
        "..UU........UU..",
        "................",
        "................",
    ],
    "g": [
        "................",
        "................",
        "..UUUUUUUUUUUU..",
        "..UyyyyyyyyyyU..",
        "..Uuu1111uuuuU..",
        "..Uu1zz11g1uuU..",
        "..Uu111111uuuU..",
        "..UUUUUUUUUUUU..",
        "...U........U...",
        "...U........U...",
        "...U........U...",
        "...U........U...",
        "...U........U...",
        "..UU........UU..",
        "................",
        "................",
    ],
    "k": [
        "................",
        ".UUUUUUUUUUUUUU.",
        ".UyyyyyyyyyyyyU.",
        ".UkkkkkUUkkkkkU.",
        ".UkKKKkUUkKKKkU.",
        ".UkKlKkUUkKlKkU.",
        ".UkKKKkUUkKKKkU.",
        ".UkkkkkUUkkkkkU.",
        ".UUUUUUUUUUUUUU.",
        ".UyyyyyyyyyyyyU.",
        ".UuuuUUUUUUuuuU.",
        ".UuuuUyyyyUuuuU.",
        ".UuuuUyyyyUuuuU.",
        ".UuuuUUUUUUuuuU.",
        ".UUUUUUUUUUUUUU.",
        "................",
    ],
    "p": [
        "................",
        "................",
        "......44........",
        ".....4o44.......",
        "....44oo44......",
        "...44oooo44.....",
        "...4oo44oo4.....",
        "....44o444......",
        "......44........",
        ".....UUUU.......",
        ".....uyyu.......",
        "....UuyyuU......",
        "....UuuuuU......",
        "....UUuuUU......",
        ".....UUUU.......",
        "................",
    ],
    "e": [
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "cccccccccccccccc",
        "1111111111111111",
        "cccccccccccccccc",
        "1111111111111111",
        "cccccccccccccccc",
        "1111111111111111",
        "cccccccccccccccc",
        "CCCCCCCCCCCCCCCC",
        "................",
        "................",
    ],
    "E": [
        "................",
        "......cc........",
        ".....cccc.......",
        "....cc11cc......",
        "...cc1111cc.....",
        "..cc111111cc....",
        ".cc11cccc11cc...",
        "cc1111cc1111cc..",
        "c111111cc11111c.",
        "CCCCCCCCCCCCCCCC",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    "c": [
        "................",
        "................",
        "................",
        "................",
        "UUUUUUUUUUUUUUUU",
        "yyyyyyyyyyyyyyyy",
        "uuuuuuuuuuuuuuuu",
        "UUUUUUUUUUUUUUUU",
        "uuUuuuuUuuuuUuuu",
        "uuUuuuuUuuuuUuuu",
        "uuUuuuuUuuuuUuuu",
        "uuUuuuuUuuuuUuuu",
        "uuUuuuuUuuuuUuuu",
        "uuUuuuuUuuuuUuuu",
        "UUUUUUUUUUUUUUUU",
        "................",
    ],
    "L": [
        "qqqqqqqqqqqqqqqq",
        "qppppppqqppppppq",
        "qppppppqqppppppq",
        "qppppppqqppppppq",
        "qppppppqqppppppq",
        "PPPPPPPPPPPPPPPP",
        "qqqqqqqqqqqqqqqq",
        "ppqqppppppppqqpp",
        "ppqqppppppppqqpp",
        "ppqqppppppppqqpp",
        "ppqqppppppppqqpp",
        "PPPPPPPPPPPPPPPP",
        "qqqqqqqqqqqqqqqq",
        "qppppppqqppppppq",
        "qppppppqqppppppq",
        "PPPPPPPPPPPPPPPP",
    ],
    "G": [
        "kkkkkkkkkkkkkkkk",
        "klllllllllllllll",
        "klkkkkkkkkkkkkkk",
        "klkkkkkkkkkkkkkk",
        "klkkkiiiiiikkkkk",
        "klkkiiiiiiiikkkk",
        "klkkiijjjjiikkkk",
        "klkkiijjjjiikkkk",
        "klkkiijjjjiikkkk",
        "klkkiiiiiiiikkkk",
        "klkkkiiiiiikkkkk",
        "klkkkkkkkkkkkkkk",
        "klkkkkkkkkkkkkkk",
        "klkkkkkkkkkkkkkk",
        "kKKKKKKKKKKKKKKK",
        "KKKKKKKKKKKKKKKK",
    ],
    "M": [
        "KKKKKKKKKKKKKKKK",
        "KllllllllllllllK",
        "KlkkkkkkkkkkkklK",
        "Klk11kkkkkk11klK",
        "Klk1ikkkkkki1klK",
        "Klkkkkkkkkkkkklk",
        "KlkiiiikkiiiiklK",
        "KlkiiiikkiiiiklK",
        "KlkkkkkkkkkkkklK",
        "Klkg2kkkkkkg2klK",
        "Klk22kkkkkk22klK",
        "KlkkkkkkkkkkkklK",
        "KllllllllllllllK",
        "KKKKKKKKKKKKKKKK",
        "KKKKKKKKKKKKKKKK",
        "KKKKKKKKKKKKKKKK",
    ],
    "x": ["0" * 16 for _ in range(16)],
}


def all_tiles() -> dict[str, list[str]]:
    tiles = {
        ".": _grass(),
        ",": _grass(flowers=True),
        "=": _dirt(),
        "P": _pavement(),
        "~": _water(),
        "r": _rug(),
        "f": _floor(),
    }
    for ch, rows in STRUCT.items():
        tiles.setdefault(ch, rows)
    return tiles


ORDER = list(".,=PT~CWSHRwDf#rbqsBtgkpeEcLGMx")


def render(ch: str):
    from PIL import Image

    rows = all_tiles()[ch]
    assert len(rows) == H, f"tile {ch!r} has {len(rows)} rows"
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = im.load()
    for y, row in enumerate(rows):
        assert len(row) == W, f"tile {ch!r} row {y} is {len(row)} wide: {row!r}"
        for x, key in enumerate(row):
            col = PAL[key]
            if col:
                px[x, y] = tuple(int(col[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
    return im


def tile_images() -> dict:
    return {ch: render(ch) for ch in ORDER}
