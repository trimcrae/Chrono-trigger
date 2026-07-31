# Custom art

The game draws every sprite and tile procedurally in `js/pix.js`. That art is a
fallback: if this folder contains sprite sheets and `manifest.json` points at
them, the engine slices them at boot and renders those pixels verbatim instead.

Nothing is shipped here but templates generated from the built-in art — they
exist to document the expected layout and sizes.

## Enabling a sheet

Edit `manifest.json`:

```json
{
  "characters": "characters.png",
  "tiles": "tiles.png",
  "props": { "bell": "props/bell.png", "gato": "props/gato.png" }
}
```

Anything left `null` (or omitted) falls back to the drawn art, so you can
replace one thing at a time. Append `?noassets=1` to the page URL to force the
built-in art and compare.

## characters.png

A grid of **16x24** frames. One **row per character**, sixteen columns:

| cols 0-3 | cols 4-7 | cols 8-11 | cols 12-15 |
| --- | --- | --- | --- |
| facing down | facing up | facing left | facing right |

Within each group the four frames are `stand, step-left, stand, step-right`.
Feet should sit on the bottom edge of the cell; the engine anchors sprites there.

Row order (see `templates/layout.json`):

`crono, marle, lucca, mom, taban, villager1, villager2, villager3, kid, guard, cat`

Override the order with `"characterOrder": [...]` in the manifest, or the frame
size with `"frameWidth"` / `"frameHeight"` if your sheet uses different cells.

## tiles.png

A single row of **16x16** cells, one per tile symbol, in the order listed in
`templates/layout.json` (`.` grass, `=` path, `P` pavement, `T` tree, `f` wood
floor, and so on — the symbols are the same ones used by the map grids in
`js/maps.js`).

## props/

One file per prop, any size — `bell`, `gato`, `gate`, `balloon`. Props are drawn
bottom-anchored on their tile, so a taller image simply stands taller in the
scene.

## templates/

`characters.png` (256x264), `tiles.png` (496x16) and `prop-*.png` are dumps of
the current built-in art at exactly the sizes above. Use them as a guide for
slot positions, or edit them directly.

## packs/ — sheets built by the pipeline

Instead of drawing a sheet by hand you can have one assembled from an upstream
asset pack. `sources.json` lists the packs; `tools/sprite_pipeline.py` downloads
the sheets, cuts the cells named in the slice map, and writes
`packs/characters.png`, `packs/tiles.png` and `packs/prop-*.png` in exactly the
layout described above.

Building a pack and *using* it are separate steps. `"activate"` in `sources.json`
is what points `manifest.json` at the generated sheets, and it ships **off**: a
general-purpose pack is a downgrade next to art drawn for this game, so the
sheets sit under `packs/` until someone asks for them. Flip it to `true`, rebuild,
and the slots are filled in — only the ones the pipeline generates, so
hand-written entries survive a rebuild, and `?noassets=1` still forces the drawn
art either way.

```sh
python3 tools/sprite_pipeline.py discover --pack <id> --measure   # what's in an upstream pack
python3 tools/sprite_pipeline.py build --pin                      # fetch, slice, update manifest.json
python3 tools/sprite_pipeline.py verify                           # check the sheets, offline
```

Because the dev container has no general outbound network access, the fetching
normally runs in CI: `.github/workflows/sprites.yml` rebuilds on every change to
`sources.json` or the tool, verifies each download against its pinned SHA-256,
and commits the regenerated sheets. It can also be dispatched by hand to re-run
discovery or rebuild a single pack.

A pack entry names where the sheets live and which `[col, row]` cells map to
which character direction, tile symbol or prop:

```json
{
  "id": "my-pack",
  "license": "CC0-1.0", "author": "...", "license_url": "...", "homepage": "...",
  "sources": { "sheet": { "url": "https://...", "sha256": "..." } },
  "chars": { "crono": { "from": "sheet", "cell": [16, 16], "frames": 4, "step": "row",
                        "dirs": { "down": [0, 0], "up": [1, 0], "left": [2, 0], "right": [3, 0] } } },
  "tiles": { ".": { "from": "sheet", "at": [14, 16] } },
  "props": { "bell": { "from": "sheet", "rect": [0, 0, 48, 64] } }
}
```

Cells shorter than 24px are bottom-aligned in the frame so the feet still land
on the floor; `offsetX`/`offsetY`, `order`, `flipX` and `scale` cover the rest.
Set `"enabled": false` to drop a pack from the next build.

## A note on source

These slots are for art you have the right to use, and the pipeline enforces
that as far as it can: a pack has to declare an SPDX license from
`allowed_licenses` in `sources.json` along with its author and license URL, or
the build fails. Sprites extracted from a commercial release — *Chrono Trigger*'s
own among them — are not redistributable and must not be added here. To play
locally with art you hold the rights to, build it into a folder you keep out of
the repository and load it from there.

The repository itself still ships no art of its own beyond what its code draws;
anything under `packs/` is generated from the openly licensed sources recorded
in `CREDITS.md`.
