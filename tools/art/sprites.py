"""Hand-authored field sprites, drawn in the SNES JRPG idiom.

Original art. Nothing here is traced or extracted from a commercial release —
these are 16x24 pixels written out by hand to sit in the same visual register as
the era's overworld sprites: a head roughly a third of the body, a dark warm
outline rather than black, one light source from the upper left, small dark
eyes, and a four frame walk with a one pixel bob.

Authoring notes
---------------
Grids hold *fills only*; `render()` walks the silhouette and lays the outline in
afterwards, so a shape can be reshaped without hand-patching its border. A frame
is composed bottom-up: body (which carries the bare head), then hair, then
accessories, each layer painting over the one below wherever it is not '.'.

Sides are authored facing left and mirrored for right, which is why hair parts
and single-eye placement all read leftwards here.

Palette keys
    s S H  skin: mid, shaded, lit          h D L  hair: mid, dark, lit
    t T l  garment: mid, shaded, lit       a A    garment trim
    g      sash / belt                     b B    legs
    f F    footwear                        e      eye
    m M    metal                           c      glass / gem
    o      explicit outline                x      ground shadow (translucent)
"""

from __future__ import annotations

W, H = 16, 24
OUTLINE = "#2a1c28"
SHADOW = (0, 0, 0, 56)
# Keys every character shares, so the per-character palettes only carry what
# actually differs between them.
COMMON = {"e": "#3a2430", "o": OUTLINE}

# Per-character colours. Keys map onto the palette letters used in the grids.
PALETTES = {
    "crono": dict(s="#f6cb9c", S="#d09a68", H="#ffe4c2", h="#f0571c", D="#b8420e",
                  L="#ff8f4d", t="#efe9d8", T="#c2bca8", l="#ffffff", a="#2f6f96",
                  A="#1e4c69", g="#d8b23a", b="#2f4478", B="#1d2b50", f="#8a5a2c",
                  F="#5c3a1a", m="#c9d2dc", M="#8b96a4", c="#7fe3f5"),
    "marle": dict(s="#fad7a8", S="#d5a978", H="#ffeccd", h="#f5d95e", D="#c2a232",
                  L="#fff0a0", t="#f5f2e8", T="#c9c5b4", l="#ffffff", a="#2fa46a",
                  A="#1d7049", g="#cdb782", b="#e6e0cf", B="#b6b0a0", f="#7a4a28",
                  F="#523018", m="#c9d2dc", M="#8b96a4", c="#7fe3f5"),
    "lucca":  dict(s="#fad7a8", S="#d5a978", H="#ffeccd", h="#8b46bd", D="#5f2d85",
                  L="#b072dd", t="#e9b652", T="#b98a34", l="#ffd68a", a="#8a5330",
                  A="#5f3720", g="#8a5330", b="#8a5330", B="#5f3720", f="#5a3520",
                  F="#3c2214", m="#e3702e", M="#a94a17", c="#cfe8f2"),
    "mom": dict(s="#fad7a8", S="#d5a978", H="#ffeccd", h="#b3592b", D="#7f3a18",
                L="#d97c46", t="#c9527a", T="#9c3757", l="#e78aa8", a="#e78aa8",
                A="#9c3757", g="#9c3757", b="#a33f60", B="#742a44", f="#7a4426",
                F="#522c16", m="#c9d2dc", M="#8b96a4", c="#7fe3f5"),
    "taban": dict(s="#e9b981", S="#c2905c", H="#ffd9ab", h="#3d3130", D="#241c1c",
                  L="#5d4c4a", t="#3b7ab8", T="#265787", l="#5f9ed6", a="#f0efe8",
                  A="#c2c0b6", g="#5b5b6a", b="#5b5b6a", B="#3c3c48", f="#332a28",
                  F="#1e1817", m="#c9d2dc", M="#8b96a4", c="#7fe3f5"),
    "villager1": dict(s="#f1c496", S="#c99a69", H="#ffdfb6", h="#54331f",
                      D="#361f11", L="#7a5133", t="#4fa356", T="#357a3b",
                      l="#77c67c", a="#63523f", A="#42352a", g="#63523f", b="#63523f",
                      B="#42352a", f="#40291a", F="#28180f", m="#c9d2dc", M="#8b96a4",
                      c="#7fe3f5"),
    "villager2": dict(s="#e9cbaa", S="#c2a181", H="#ffe6c9", h="#efd268", D="#bda03d",
                      L="#ffe89a", t="#a95fc0", T="#7c3f8e", l="#c98ad9", a="#7c3f8e",
                      A="#57265f", g="#7c3f8e", b="#7c3f8e", B="#57265f", f="#523322",
                      F="#341f14", m="#c9d2dc", M="#8b96a4", c="#7fe3f5"),
    "villager3": dict(s="#d9a97a", S="#b0824f", H="#f2c99a", h="#232228", D="#121116",
                      L="#43414c", t="#d8a63f", T="#a87a1f", l="#f0c56a", a="#3f5aa0",
                      A="#2a3d73", g="#3f5aa0", b="#3f5aa0", B="#2a3d73", f="#31221f",
                      F="#1d1312", m="#c9d2dc", M="#8b96a4", c="#7fe3f5"),
    "kid": dict(s="#fad7a8", S="#d5a978", H="#ffeccd", h="#a54a29", D="#742f16",
                L="#cd6f45", t="#e0503f", T="#a93529", l="#f0806f", a="#a93529",
                A="#75231a", g="#a93529", b="#4a79c8", B="#31549a", f="#3f3028",
                F="#261c17", m="#c9d2dc", M="#8b96a4", c="#7fe3f5"),
    "guard": dict(s="#e9c191", S="#c29a66", H="#ffdfb0", h="#6a7280",
                  D="#464d59", L="#98a1b0", t="#8a93a3", T="#626b7a", l="#b3bbc9",
                  a="#4a4a58", A="#32323d", g="#4a4a58", b="#4a4a58", B="#32323d",
                  f="#2b2b32", F="#191920", m="#c9d2dc", M="#8b96a4", c="#7fe3f5"),
    "cat": dict(s="#d8ab6e", S="#a87f47", H="#f2d2a2", h="#d8ab6e", D="#9c7040",
                L="#f2d2a2", t="#d8ab6e", T="#a87f47", l="#f2d2a2", a="#a87f47",
                A="#6f4c28", g="#a87f47", b="#d8ab6e", B="#a87f47", f="#a87f47",
                F="#6f4c28", m="#c9d2dc", M="#8b96a4", c="#7fe3f5"),
}

# Which hair grid and extras each character uses.
CHARS = {
    "crono":     dict(hair="spiky",    acc=["headband", "sword"]),
    "marle":     dict(hair="ponytail", acc=["pendant"]),
    "lucca":     dict(hair="helmet",   acc=["glasses"]),
    "mom":       dict(hair="bob",      acc=[]),
    "taban":     dict(hair="bald",     acc=["beard"]),
    "villager1": dict(hair="bob",      acc=[]),
    "villager2": dict(hair="ponytail", acc=[]),
    "villager3": dict(hair="spiky",    acc=[]),
    "kid":       dict(hair="bob",      acc=[], small=True),
    "guard":     dict(hair="helm",     acc=[]),
    "cat":       dict(hair=None,       acc=[], body="cat"),
}

DIRS = ("down", "up", "left", "right")
POSES = ("stand", "walkA", "walkB")

# Where each layer starts in the 24 row frame. The engine plants sprites on the
# bottom edge, so the legs block has to bottom out on row 23.
HEAD_Y, TORSO_Y, LEGS_Y = 1, 13, 18

# --------------------------------------------------------------------------- #
# bodies — these carry the bare head; hair and accessories go on top           #
# --------------------------------------------------------------------------- #
# The head skin block is identical across poses; only the torso, arms and legs
# move, and the whole upper body lifts a pixel mid-stride so the feet stay put.

_HEAD_DOWN = [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....ssssssss....",
    "....ssessess....",
    "....ssessess....",
    "....ssssssss....",
    ".....SSSSSS.....",
    ".......ss.......",
]
_HEAD_UP = [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....ssssssss....",
    "....ssssssss....",
    "....ssssssss....",
    "....ssssssss....",
    ".....SSSSSS.....",
    ".......ss.......",
]
_HEAD_SIDE = [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....sssssss.....",
    "...ssessss......",
    "...sssssss......",
    "....ssssss......",
    ".....SSSSS......",
    "......ss........",
]

_TORSO_DOWN = [
    "....tttaattt....",
    "...ttttaatttt...",
    "...ttttaatttt...",
    "...stttaattts...",
    "....gggggggg....",
]
_TORSO_UP = [
    "....tttttttt....",
    "...tttttttttt...",
    "...tttttttttt...",
    "...stttttttts...",
    "....gggggggg....",
]
_TORSO_SIDE = [
    "....attttt......",
    "...atttttt......",
    "...atttttt......",
    "...satttttt.....",
    "....gggggg......",
]

# Legs bottom out on the frame's last row, because the engine plants sprites
# on the bottom edge of the cell.
_LEGS = {
    ("down", "stand"): ["....bbbbbbbb....", "....bbb..bbb....", "....bbb..bbb....",
                        "....fff..fff....", "....fff..fff....", "................"],
    ("down", "walkA"): ["....bbbbbbbb....", "...bbbb..bbb....", "...bbbb..bbb....",
                        "..ffff...fff....", "..ffff...fff....", "................"],
    ("down", "walkB"): ["....bbbbbbbb....", "....bbb..bbbb...", "....bbb..bbbb...",
                        "....fff...ffff..", "....fff...ffff..", "................"],
    ("side", "stand"): ["....bbbbbb......", "....bbb.bb......", "....bbb.bb......",
                        "...ffff.fff.....", "...ffff.fff.....", "................"],
    ("side", "walkA"): ["....bbbbbb......", "...bbbb..bb.....", "..bbbb...bb.....",
                        "..ffff...fff....", "..ffff...fff....", "................"],
    ("side", "walkB"): ["....bbbbbb......", "....bb..bbb.....", "....bb...bbb....",
                        "...fff....ffff..", "...fff....ffff..", "................"],
}
_LEGS[("up", "stand")] = _LEGS[("down", "stand")]
_LEGS[("up", "walkA")] = _LEGS[("down", "walkA")]
_LEGS[("up", "walkB")] = _LEGS[("down", "walkB")]

# --------------------------------------------------------------------------- #
# hair — overlays over the bare head                                           #
# --------------------------------------------------------------------------- #
# Rows 0-5 are the mass above the skull, rows 6-9 frame the face down each side
# so the visible face is six pixels wide rather than the full head block.

HAIR = {
    "spiky": {
        "down": [
            ".....h..h.h.....",
            "....hh.hh.hh....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "....hhhhhhh.....",
            "....h......h....",
            "....h......h....",
            "....h......h....",
            "....h......h....",
        ],
        "up": [
            ".....h..h.h.....",
            "....hh.hh.hh....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "....hhhhhhhh....",
            "....hhhhhhhh....",
            "....hhhhhhhh....",
            "....hhhhhhhh....",
            ".....hhhhhh.....",
        ],
        "left": [
            "....h..h.h......",
            "...hh.hh.hh.....",
            "..Lhhhhhhh......",
            "..Lhhhhhhh......",
            "..Lhhhhhhh......",
            "...hhhhhhh......",
            "...h...hhh......",
            "...h....hh......",
            "...h....hh......",
            "........hh......",
        ],
    },
    "ponytail": {
        "down": [
            "................",
            "....hhhhhhhh....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "....hhhhhhh.....",
            "....h......h....",
            "....h......h....",
            "....h......h....",
            "....h......h....",
        ],
        "up": [
            "................",
            "....hhhhhhhh....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "....hhhhhhhh....",
            "....hhhhhhhh....",
            "....hhhhhhhh....",
            "....hhhhhhhh....",
            ".....hhhhhh.....",
            "......hhhh......",
            "......hDDh......",
            "......hDDh......",
        ],
        "left": [
            "................",
            "...hhhhhhh......",
            "..Lhhhhhhh......",
            "..Lhhhhhhh......",
            "..Lhhhhhhh......",
            "...hhhhhhh......",
            "...h...hhhh.....",
            "...h....hhhh....",
            "...h.....hhhh...",
            ".........hDDh...",
            "..........hDh...",
            "..........hDh...",
        ],
    },
    "bob": {
        "down": [
            "................",
            "....hhhhhhhh....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "....hhhhhhh.....",
            "...hh......hh...",
            "...hh......hh...",
            "...hh......hh...",
            "....h......h....",
        ],
        "up": [
            "................",
            "....hhhhhhhh....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "....hhhhhhhh....",
            "...hhhhhhhhhh...",
            "...hhhhhhhhhh...",
            "...hhhhhhhhhh...",
            "....hhhhhhhh....",
        ],
        "left": [
            "................",
            "...hhhhhhh......",
            "..Lhhhhhhh......",
            "..Lhhhhhhh......",
            "..Lhhhhhhh......",
            "...hhhhhhh......",
            "..hh...hhh......",
            "..hh....hh......",
            "..hh....hh......",
            "...h....hh......",
        ],
    },
    "helmet": {
        "down": [
            "................",
            "................",
            "....mmmmmmmm....",
            "...mmmmmmmmmM...",
            "...MMMMMMMMMM...",
            "....hhhhhhh.....",
            "....h......h....",
            "....h......h....",
            "....h......h....",
            "....h......h....",
        ],
        "up": [
            "................",
            "................",
            "....mmmmmmmm....",
            "...mmmmmmmmmM...",
            "...MMMMMMMMMM...",
            "....hhhhhhhh....",
            "....hhhhhhhh....",
            "....hhhhhhhh....",
            "....hhhhhhhh....",
            ".....hhhhhh.....",
        ],
        "left": [
            "................",
            "................",
            "...mmmmmmm......",
            "..mmmmmmmmm.....",
            "..MMMMMMMMM.....",
            "...hhhhhhh......",
            "...h...hhh......",
            "...h....hh......",
            "...h....hh......",
            "........hh......",
        ],
    },
    "bald": {
        "down": [
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "....h......h....",
            "....h......h....",
            "................",
            "................",
        ],
        "up": [
            "................",
            "................",
            "................",
            "................",
            "................",
            "....hhhhhhhh....",
            "....hhhhhhhh....",
            "....hhhhhhhh....",
            "....h......h....",
            "................",
        ],
        "left": [
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
            "...h....hh......",
            "...h....hh......",
            "................",
            "................",
        ],
    },
    "helm": {
        "down": [
            "................",
            "....hhhhhhhh....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "...hhhhhhhhh....",
            "...hh......hh...",
            "...hh......hh...",
            "...hh......hh...",
            "...hh......hh...",
        ],
        "up": [
            "................",
            "....hhhhhhhh....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "...LhhhhhhhD....",
            "...hhhhhhhhh....",
            "...hhhhhhhhhh...",
            "...hhhhhhhhhh...",
            "...hhhhhhhhhh...",
            "....hhhhhhhh....",
        ],
        "left": [
            "................",
            "...hhhhhhh......",
            "..Lhhhhhhh......",
            "..Lhhhhhhh......",
            "..Lhhhhhhh......",
            "..hhhhhhhh......",
            "..hh...hhh......",
            "..hh....hh......",
            "..hh....hh......",
            "..hh....hh......",
        ],
    },
}

# --------------------------------------------------------------------------- #
# accessories — sparse (x, y, key) pixels in frame coordinates                  #
# --------------------------------------------------------------------------- #
# Face rows are 7-10 (eyes on 8 and 9), jaw 11, neck 12, torso 13-17.

ACC = {
    "headband": {
        "down": [(x, 7, "l") for x in range(4, 12)],
        "up":   [(x, 7, "l") for x in range(4, 12)],
        "left": [(x, 7, "l") for x in range(3, 11)],
    },
    "pendant": {
        "down": [(7, 14, "c"), (8, 14, "c")],
        "up":   [],
        "left": [(6, 14, "c")],
    },
    "glasses": {
        "down": [(x, 8, "M") for x in range(5, 11)] +
                [(5, 9, "c"), (6, 9, "c"), (9, 9, "c"), (10, 9, "c"),
                 (7, 9, "M"), (8, 9, "M")],
        "up":   [],
        "left": [(x, 8, "M") for x in range(3, 8)] +
                [(4, 9, "c"), (5, 9, "c"), (6, 9, "M")],
    },
    "beard": {
        "down": [(4, 10, "a"), (11, 10, "a"), (5, 11, "a"), (6, 11, "a"),
                 (7, 11, "a"), (8, 11, "a"), (9, 11, "a"), (10, 11, "a"),
                 (6, 12, "a"), (7, 12, "a"), (8, 12, "a"), (9, 12, "a")],
        "up":   [],
        "left": [(3, 10, "a"), (4, 11, "a"), (5, 11, "a"), (6, 11, "a"),
                 (5, 12, "a"), (6, 12, "a")],
    },
    "sword": {
        # slung across the back: reads from behind and as a hilt in profile
        "down": [],
        "up":   [(4, 17, "M"), (4, 16, "m"), (5, 15, "m"), (6, 14, "m"),
                 (7, 13, "m"), (8, 12, "M")],
        "left": [(11, 14, "M"), (11, 15, "m"), (11, 16, "m")],
    },
}

# --------------------------------------------------------------------------- #
# the cat — four legs, no walk cycle worth the pixels                          #
# --------------------------------------------------------------------------- #

CAT = {
    "down": [
        "................", "................", "................", "................",
        "................", "................", "................", "................",
        "................", "................", "................", "................",
        ".....h....h.....",
        ".....hh..hh.....",
        "....hhhhhhhh....",
        "....hehhhheh....",
        "....hhhhhhhh....",
        ".....hhhhhh.....",
        "...hhhhhhhhhh...",
        "...hhhhhhhhhhD..",
        "...LhhhhhhhhD...",
        "...h.hh..hh.h...",
        "................",
        "................",
    ],
    "up": [
        "................", "................", "................", "................",
        "................", "................", "................", "................",
        "................", "................", "................", "................",
        ".....h....h.....",
        ".....hh..hh.....",
        "....hhhhhhhh....",
        "....hhhhhhhh....",
        "....hhhhhhhh....",
        ".....hhhhhh.....",
        "...hhhhhhhhhh...",
        "...hhhhhhhhhhD..",
        "...LhhhhhhhhD...",
        "...h.hh..hh.h...",
        "................",
        "................",
    ],
    "left": [
        "................", "................", "................", "................",
        "................", "................", "................", "................",
        "................", "................", "................", "................",
        "..h...h.........",
        "..hh.hh......D..",
        "..hhhhhh.....D..",
        "..hehhhh....DD..",
        "..hhhhhh....D...",
        "...hhhhhhhhhD...",
        "..hhhhhhhhhhh...",
        "..hhhhhhhhhhh...",
        "..LhhhhhhhhhD...",
        "..h.hh...hh.h...",
        "................",
        "................",
    ],
}


# --------------------------------------------------------------------------- #
# composition                                                                  #
# --------------------------------------------------------------------------- #

def _blank():
    return [["."] * W for _ in range(H)]


def _paint(grid, rows, dy=0):
    for y, row in enumerate(rows):
        ty = y + dy
        assert len(row) == W, f"row {y} is {len(row)} wide: {row!r}"
        if not (0 <= ty < H):
            continue
        for x, ch in enumerate(row):
            if ch != ".":
                grid[ty][x] = ch


def _mirror(rows):
    return ["".join(reversed(r)) for r in rows]


def compose(name: str, direction: str, pose: str) -> list[str]:
    """Build one 16x24 frame as a grid of palette keys."""
    spec = CHARS[name]
    src = "left" if direction in ("left", "right") else direction
    grid = _blank()

    if spec.get("body") == "cat":
        _paint(grid, CAT[src])
        rows = ["".join(r) for r in grid]
        return _mirror(rows) if direction == "right" else rows

    # A stride lifts the upper body by a pixel; the feet stay planted.
    bob = 0 if pose == "stand" else 1
    drop = 2 if spec.get("small") else 0

    head = {"down": _HEAD_DOWN, "up": _HEAD_UP, "left": _HEAD_SIDE}[src]
    torso = {"down": _TORSO_DOWN, "up": _TORSO_UP, "left": _TORSO_SIDE}[src]
    legs = _LEGS[("side" if src == "left" else src, pose)]
    if drop:
        legs = legs[drop:]  # shorter child legs, still reaching the bottom row

    _paint(grid, head, dy=HEAD_Y + drop - bob)
    _paint(grid, torso, dy=TORSO_Y + drop - bob)
    _paint(grid, legs, dy=LEGS_Y + drop)

    if spec["hair"]:
        _paint(grid, HAIR[spec["hair"]][src], dy=HEAD_Y + drop - bob)

    for acc in spec["acc"]:
        for x, y, ch in ACC[acc][src]:
            ty = y + drop - bob
            if 0 <= ty < H:
                grid[ty][x] = ch

    rows = ["".join(r) for r in grid]
    return _mirror(rows) if direction == "right" else rows


def render(name: str, direction: str, pose: str, outline: bool = True):
    """Render one frame to RGBA, laying the outline around the silhouette."""
    from PIL import Image

    rows = compose(name, direction, pose)
    pal = PALETTES[name]
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = im.load()

    def rgb(c):
        return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,)

    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            px[x, y] = rgb(COMMON.get(ch) or pal[ch])

    if outline:
        for y in range(H):
            for x in range(W):
                if rows[y][x] != ".":
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and rows[ny][nx] not in ".o":
                        px[x, y] = rgb(OUTLINE)
                        break
    return im


# The engine cycles frames 0-3 while walking and rests on 0.
FRAME_POSES = ("stand", "walkA", "stand", "walkB")


def character_frames(name: str):
    """16 frames: four directions (down, up, left, right) x four walk frames."""
    return [render(name, d, p) for d in DIRS for p in FRAME_POSES]
