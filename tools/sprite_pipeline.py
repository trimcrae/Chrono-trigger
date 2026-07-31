#!/usr/bin/env python3
"""Sprite asset pipeline.

Fetches sprite sheets from the internet and slices them into the sheet layout
that `js/assets.js` already knows how to load — `assets/characters.png` style
grids, referenced from `assets/manifest.json`.

The game itself ships no art: `js/pix.js` draws every character, tile and prop
procedurally, and that art is the fallback. This pipeline only fills in the
override slots, so any key it does not supply keeps its drawn art, and clearing
the manifest returns the game to its own pixels.

Subcommands
-----------
discover  List the files in an upstream pack (needs the GitHub API, so it runs
          on an Actions runner) and report image sizes, so the slice map in
          `assets/sources.json` can be written against real geometry.
build     Download every pinned source, verify its checksum, slice it, and write
          the sheets under `assets/packs/`. Whether the game actually uses them
          is a separate switch: only `"activate": true` in sources.json points
          `assets/manifest.json` at the result.
verify    Re-check the built sheets, and that the manifest agrees with the
          activation switch, without hitting the network.

Licensing
---------
Every pack must declare an SPDX license id from `allowed_licenses` in
sources.json, plus an author and a license URL. Assets extracted from a
commercial game are not redistributable and will not pass this gate — point the
pipeline at assets you own or that carry an open license.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCES = REPO_ROOT / "assets" / "sources.json"
OUT_DIR = REPO_ROOT / "assets"
# Generated sheets live in their own folder so they never collide with the
# hand-made templates in assets/templates/.
PACK_DIR = "packs"

# Must match js/pix.js: FRAME_W, FRAME_H, FRAMES, DIRS, TILE.
CHAR_W, CHAR_H = 16, 24
TILE_W = TILE_H = 16
DIRS = ("down", "up", "left", "right")
FRAMES = 4

USER_AGENT = "chrono-trigger-sprite-pipeline/1 (+https://github.com/trimcrae/Chrono-trigger)"


# --------------------------------------------------------------------------- #
# helpers                                                                      #
# --------------------------------------------------------------------------- #

def log(msg: str) -> None:
    print(msg, flush=True)


def die(msg: str) -> "NoReturn":  # noqa: F821
    print(f"error: {msg}", file=sys.stderr, flush=True)
    raise SystemExit(1)


def fetch(url: str, token: str | None = None) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    if token and url.startswith("https://api.github.com/"):
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:  # pragma: no cover - network dependent
        die(f"{url} -> HTTP {exc.code} {exc.reason}")
    except urllib.error.URLError as exc:  # pragma: no cover - network dependent
        die(f"{url} -> {exc.reason}")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_sources(path: Path) -> dict:
    if not path.exists():
        die(f"missing {path}")
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def check_license(pack: dict, allowed: list[str]) -> None:
    pid = pack.get("id", "<unnamed>")
    for field in ("license", "license_url", "author", "homepage"):
        if not pack.get(field):
            die(f"pack '{pid}' is missing required field '{field}'")
    if pack["license"] not in allowed:
        die(
            f"pack '{pid}' declares license '{pack['license']}', which is not in "
            f"allowed_licenses ({', '.join(allowed)}).\n"
            "       Only openly licensed assets can be fetched and republished by "
            "this pipeline.\n"
            "       Assets ripped from a commercial release are not redistributable "
            "and must not be added here."
        )


# --------------------------------------------------------------------------- #
# discover                                                                     #
# --------------------------------------------------------------------------- #

def cmd_discover(args: argparse.Namespace) -> int:
    from PIL import Image  # noqa: PLC0415 - optional until needed
    import io

    cfg = load_sources(Path(args.sources))
    token = os.environ.get("GITHUB_TOKEN")
    report: dict[str, list[dict]] = {}

    for pack in cfg["packs"]:
        if args.pack and pack["id"] != args.pack:
            continue
        disc = pack.get("discover")
        if not disc:
            log(f"pack '{pack['id']}': no discover block, skipping")
            continue

        repo, ref, root = disc["repo"], disc.get("ref", "master"), disc.get("root", "")
        api = f"https://api.github.com/repos/{repo}/git/trees/{ref}?recursive=1"
        log(f"\n=== {pack['id']}: listing {repo}@{ref}/{root} ===")
        tree = json.loads(fetch(api, token))
        if tree.get("truncated"):
            log("warning: tree listing was truncated by the API")

        paths = [
            node["path"]
            for node in tree.get("tree", [])
            if node["type"] == "blob"
            and node["path"].startswith(root)
            and node["path"].lower().endswith((".png", ".gif"))
        ]
        paths.sort()
        log(f"{len(paths)} image(s) under {root}/")

        if args.filter:
            needle = args.filter.lower()
            paths = [p for p in paths if needle in p.lower()]
            log(f"{len(paths)} image(s) matching {args.filter!r}")

        entries: list[dict] = []
        for path in paths:
            url = f"https://raw.githubusercontent.com/{repo}/{ref}/{path}"
            entry = {"path": path, "url": url}
            if args.measure:
                data = fetch(url)
                with Image.open(io.BytesIO(data)) as img:
                    entry["size"] = list(img.size)
                    entry["mode"] = img.mode
                entry["sha256"] = sha256(data)
                log(f"  {path}  {entry['size'][0]}x{entry['size'][1]} {entry['mode']}")
            else:
                log(f"  {path}")
            entries.append(entry)
        report[pack["id"]] = entries

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    log(f"\nwrote {out}")
    return 0


# --------------------------------------------------------------------------- #
# build                                                                        #
# --------------------------------------------------------------------------- #

def _open_sources(pack: dict, cache: Path) -> dict:
    """Download (or reuse) every source image declared by a pack."""
    from PIL import Image  # noqa: PLC0415
    import io

    cache.mkdir(parents=True, exist_ok=True)
    images: dict[str, "Image.Image"] = {}

    for name, spec in pack.get("sources", {}).items():
        url = spec["url"]
        blob = cache / f"{pack['id']}--{name}.bin"
        if blob.exists():
            data = blob.read_bytes()
        else:
            log(f"  fetch {name}: {url}")
            data = fetch(url)
            blob.write_bytes(data)

        digest = sha256(data)
        want = spec.get("sha256")
        if want and want != digest:
            die(
                f"checksum mismatch for '{pack['id']}/{name}'\n"
                f"       expected {want}\n"
                f"       actual   {digest}"
            )
        if not want:
            log(f"  note: '{pack['id']}/{name}' is unpinned; sha256 = {digest}")
        spec["_sha256"] = digest

        img = Image.open(io.BytesIO(data)).convert("RGBA")
        images[name] = img
        log(f"  {name}: {img.width}x{img.height}")
    return images


def _cell_box(spec: dict, col: int, row: int) -> tuple[int, int, int, int]:
    cw, ch = spec.get("cell", [TILE_W, TILE_H])
    ox, oy = spec.get("origin", [0, 0])
    gx, gy = spec.get("gap", [0, 0])
    x = ox + col * (cw + gx)
    y = oy + row * (ch + gy)
    return (x, y, x + cw, y + ch)


def _crop(img, box, label: str):
    if box[2] > img.width or box[3] > img.height or box[0] < 0 or box[1] < 0:
        die(
            f"{label}: crop {box} falls outside the {img.width}x{img.height} source sheet"
        )
    return img.crop(box)


def _slice_chars(pack: dict, images: dict) -> dict:
    """Cut each character's walk cycle into 16 frames: 4 dirs x 4 frames."""
    from PIL import Image  # noqa: PLC0415

    out: dict[str, list] = {}
    for name, spec in pack.get("chars", {}).items():
        src = images.get(spec["from"])
        if src is None:
            die(f"char '{name}' references unknown source '{spec['from']}'")

        cw, ch = spec.get("cell", [CHAR_W, CHAR_H])
        # Where the source cell sits inside the 16x24 frame: bottom-aligned by
        # default, because the engine plants sprites on the bottom edge.
        off_x = int(spec.get("offsetX", (CHAR_W - cw) // 2))
        off_y = int(spec.get("offsetY", CHAR_H - ch))
        step = spec.get("step", "col")  # frames advance along columns or rows
        order = spec.get("order")

        frames = []
        for direction in DIRS:
            start = spec["dirs"].get(direction)
            if start is None:
                die(f"char '{name}' is missing direction '{direction}'")
            col0, row0 = start
            for f in range(FRAMES):
                idx = order[f] if order else f
                c = col0 + (idx if step == "col" else 0)
                r = row0 + (idx if step == "row" else 0)
                cell = _crop(src, _cell_box(spec, c, r), f"char {name} {direction}#{f}")
                if spec.get("flipX"):
                    cell = cell.transpose(Image.FLIP_LEFT_RIGHT)
                frame = Image.new("RGBA", (CHAR_W, CHAR_H), (0, 0, 0, 0))
                frame.paste(cell, (off_x, off_y), cell)
                frames.append(frame)
        out[name] = frames
        log(f"  char {name}: {len(frames)} frames")
    return out


def _slice_tiles(pack: dict, images: dict) -> dict:
    from PIL import Image  # noqa: PLC0415

    out: dict[str, "Image.Image"] = {}
    for key, raw in pack.get("tiles", {}).items():
        spec = dict(raw)
        spec.setdefault("cell", [TILE_W, TILE_H])
        src = images.get(spec["from"])
        if src is None:
            die(f"tile '{key}' references unknown source '{spec['from']}'")
        col, row = spec["at"]
        cell = _crop(src, _cell_box(spec, col, row), f"tile {key!r}")
        if cell.size != (TILE_W, TILE_H):
            cell = cell.resize((TILE_W, TILE_H), Image.NEAREST)
        out[key] = cell
    if out:
        log(f"  tiles: {' '.join(repr(k) for k in out)}")
    return out


def _slice_props(pack: dict, images: dict) -> dict:
    from PIL import Image  # noqa: PLC0415

    out: dict[str, "Image.Image"] = {}
    for name, spec in pack.get("props", {}).items():
        src = images.get(spec["from"])
        if src is None:
            die(f"prop '{name}' references unknown source '{spec['from']}'")
        x, y, w, h = spec["rect"]
        cell = _crop(src, (x, y, x + w, y + h), f"prop {name}")
        scale = int(spec.get("scale", 1))
        if scale != 1:
            cell = cell.resize((w * scale, h * scale), Image.NEAREST)
        out[name] = cell
        log(f"  prop {name}: {cell.width}x{cell.height}")
    return out


def _credit(pack: dict) -> dict:
    return {
        "id": pack["id"],
        "title": pack.get("title", pack["id"]),
        "author": pack["author"],
        "license": pack["license"],
        "license_url": pack["license_url"],
        "homepage": pack["homepage"],
        "sources": {
            name: {"url": spec["url"], "sha256": spec.get("_sha256", "")}
            for name, spec in pack.get("sources", {}).items()
        },
    }


def _draw_authored(pack: dict) -> dict:
    """Render a pack whose art lives in this repository rather than on a server.

    The module is expected to expose CHARS and character_frames(name); the frames
    come back in the engine's own order, so nothing needs slicing.
    """
    import importlib

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    module = importlib.import_module(pack["module"])
    names = pack.get("characters") or list(module.CHARS)
    out = {}
    for name in names:
        frames = module.character_frames(name)
        expect = len(module.DIRS) * len(module.FRAME_POSES)
        if len(frames) != expect:
            die(f"{pack['module']}.{name} produced {len(frames)} frames, expected {expect}")
        out[name] = frames
        log(f"  drew {name}: {len(frames)} frames")
    return out


def cmd_build(args: argparse.Namespace) -> int:
    from PIL import Image  # noqa: PLC0415

    cfg = load_sources(Path(args.sources))
    allowed = cfg.get("allowed_licenses", [])
    out_dir = Path(args.out)
    pack_dir = out_dir / PACK_DIR
    cache = Path(args.cache)

    active = [p for p in cfg["packs"] if p.get("enabled", True)]
    if args.pack:
        active = [p for p in active if p["id"] == args.pack]
    if not active:
        die("no enabled packs to build")

    # Later packs win on a shared key, so a small pack can patch a large one.
    chars: dict[str, list] = {}
    tiles: dict[str, "Image.Image"] = {}
    props: dict[str, "Image.Image"] = {}
    credits: list[dict] = []

    for pack in active:
        check_license(pack, allowed)
        log(f"\n=== {pack['id']} ({pack['license']}) ===")
        if pack.get("kind") == "authored":
            chars.update(_draw_authored(pack))
            credits.append(_credit(pack))
            continue
        images = _open_sources(pack, cache)
        chars.update(_slice_chars(pack, images))
        tiles.update(_slice_tiles(pack, images))
        props.update(_slice_props(pack, images))
        credits.append(_credit(pack))

    if pack_dir.exists():
        for stale in pack_dir.glob("*.png"):
            stale.unlink()
    pack_dir.mkdir(parents=True, exist_ok=True)

    slots: dict = {"characters": None, "tiles": None, "props": {}}

    # --- characters.png: one row per character, 16 columns (4 dirs x 4 frames) ---
    if chars:
        order = list(chars)
        sheet = Image.new(
            "RGBA", (CHAR_W * len(DIRS) * FRAMES, CHAR_H * len(order)), (0, 0, 0, 0)
        )
        for row, name in enumerate(order):
            for col, frame in enumerate(chars[name]):
                sheet.paste(frame, (col * CHAR_W, row * CHAR_H), frame)
        sheet.save(pack_dir / "characters.png", optimize=True)
        slots["characters"] = f"{PACK_DIR}/characters.png"
        slots["characterOrder"] = order
        log(f"\nwrote {pack_dir/'characters.png'} ({sheet.width}x{sheet.height}): {', '.join(order)}")

    # --- tiles.png: a single row of 16x16 cells ---
    if tiles:
        order = list(tiles)
        strip = Image.new("RGBA", (TILE_W * len(order), TILE_H), (0, 0, 0, 0))
        for i, key in enumerate(order):
            strip.paste(tiles[key], (i * TILE_W, 0), tiles[key])
        strip.save(pack_dir / "tiles.png", optimize=True)
        slots["tiles"] = f"{PACK_DIR}/tiles.png"
        slots["tileOrder"] = order
        log(f"wrote {pack_dir/'tiles.png'} ({strip.width}x{strip.height}): {' '.join(order)}")

    # --- props: one file each ---
    for name, img in props.items():
        rel = f"{PACK_DIR}/prop-{name}.png"
        img.save(out_dir / rel, optimize=True)
        slots["props"][name] = rel
        log(f"wrote {out_dir/rel} ({img.width}x{img.height})")

    # Always record what was built, so `verify` can check the sheets even when
    # they are not the art the game is currently using.
    (pack_dir / "index.json").write_text(
        json.dumps(slots, indent=2) + "\n", encoding="utf-8"
    )

    # Building a pack and *using* it are separate decisions: the drawn art in
    # js/pix.js is tuned for this game, and a generic pack is a downgrade unless
    # someone actually wants it. Only `"activate": true` points the manifest here.
    if cfg.get("activate", False):
        _merge_manifest(out_dir / "manifest.json", slots)
    else:
        _clear_manifest(out_dir / "manifest.json")
        log(
            "\nsources.json has \"activate\": false — sheets built under "
            f"{pack_dir}/ but manifest.json still uses the drawn art.\n"
            "Set it to true (and rebuild) to switch the game over."
        )
    _write_credits(credits, out_dir / "CREDITS.md")

    if args.pin:
        _pin_checksums(cfg, Path(args.sources))
    return 0


def _merge_manifest(path: Path, slots: dict) -> None:
    """Update only the slots this pipeline owns, leaving hand-written ones alone."""
    manifest = {}
    if path.exists():
        manifest = json.loads(path.read_text(encoding="utf-8"))

    for sheet, order_key in (("characters", "characterOrder"), ("tiles", "tileOrder")):
        cur = manifest.get(sheet)
        if slots[sheet]:
            manifest[sheet] = slots[sheet]
            manifest[order_key] = slots[order_key]
        elif isinstance(cur, str) and cur.startswith(PACK_DIR + "/"):
            # We generated it last time and no longer do — don't leave a 404 behind.
            manifest[sheet] = None
            manifest.pop(order_key, None)

    merged_props = {
        name: file
        for name, file in (manifest.get("props") or {}).items()
        if not (isinstance(file, str) and file.startswith(PACK_DIR + "/"))
    }
    merged_props.update(slots["props"])
    manifest["props"] = merged_props

    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    log(f"wrote {path}")


def _clear_manifest(path: Path) -> None:
    """Release the slots we own, so a deactivated pack stops overriding anything."""
    if not path.exists():
        return
    manifest = json.loads(path.read_text(encoding="utf-8"))
    before = json.dumps(manifest, sort_keys=True)

    for sheet, order_key in (("characters", "characterOrder"), ("tiles", "tileOrder")):
        cur = manifest.get(sheet)
        if isinstance(cur, str) and cur.startswith(PACK_DIR + "/"):
            manifest[sheet] = None
            manifest.pop(order_key, None)
    manifest["props"] = {
        name: file
        for name, file in (manifest.get("props") or {}).items()
        if not (isinstance(file, str) and file.startswith(PACK_DIR + "/"))
    }

    if json.dumps(manifest, sort_keys=True) != before:
        path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        log(f"cleared generated slots in {path}")


def _write_credits(credits: list[dict], path: Path) -> None:
    lines = [
        "# Asset credits",
        "",
        "Generated by `tools/sprite_pipeline.py` — do not edit by hand.",
        "",
        "The sheets under `packs/` come from the packs below. Everything they do",
        "not cover is still drawn by `js/pix.js`.",
        "",
    ]
    for c in credits:
        lines += [
            f"## {c['title']}",
            "",
            f"- Author: {c['author']}",
            f"- License: [{c['license']}]({c['license_url']})",
            f"- Source: {c['homepage']}",
            "",
        ]
        if c["sources"]:
            lines += ["| file | sha256 |", "| --- | --- |"]
            for name, src in sorted(c["sources"].items()):
                lines.append(f"| [{name}]({src['url']}) | `{src['sha256'][:16]}…` |")
            lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
    log(f"wrote {path}")


def _pin_checksums(cfg: dict, path: Path) -> None:
    """Write back the checksums observed during this build."""
    changed = False
    for pack in cfg["packs"]:
        for name, spec in pack.get("sources", {}).items():
            digest = spec.pop("_sha256", None)
            if digest and spec.get("sha256") != digest:
                spec["sha256"] = digest
                changed = True
                log(f"pinned {pack['id']}/{name} = {digest}")
    for pack in cfg["packs"]:
        for spec in pack.get("sources", {}).values():
            spec.pop("_sha256", None)
    if changed:
        text = json.dumps(cfg, indent=2)
        # Keep the [col, row] slice maps on one line each.
        text = re.sub(r"\[\s*(-?\d+),\s*(-?\d+)\s*\]", r"[\1, \2]", text)
        path.write_text(text + "\n", encoding="utf-8")
        log(f"updated {path}")


# --------------------------------------------------------------------------- #
# verify                                                                       #
# --------------------------------------------------------------------------- #

def cmd_verify(args: argparse.Namespace) -> int:
    from PIL import Image  # noqa: PLC0415

    out_dir = Path(args.out)
    index_path = out_dir / PACK_DIR / "index.json"
    if not index_path.exists():
        die(f"missing {index_path} — run `build` first")

    cfg = load_sources(Path(args.sources))
    allowed = cfg.get("allowed_licenses", [])
    problems: list[str] = []
    counts = {"characters": 0, "tiles": 0, "props": 0}

    # The sheets are checked from the build index, so they stay verified even
    # when "activate" is false and the game is still on its drawn art.
    manifest = json.loads(index_path.read_text(encoding="utf-8"))

    mf_path = out_dir / "manifest.json"
    live = json.loads(mf_path.read_text(encoding="utf-8")) if mf_path.exists() else {}
    active = cfg.get("activate", False)
    for sheet in ("characters", "tiles"):
        points_here = isinstance(live.get(sheet), str) and live[sheet].startswith(PACK_DIR + "/")
        if active and manifest.get(sheet) and not points_here:
            problems.append(f"manifest.json does not use the generated {sheet} sheet")
        if not active and points_here:
            problems.append(
                f"manifest.json still points {sheet} at {live[sheet]} "
                'while sources.json has "activate": false'
            )

    credits = (out_dir / "CREDITS.md").read_text(encoding="utf-8") if (out_dir / "CREDITS.md").exists() else ""
    for line in credits.splitlines():
        if line.startswith("- License: ["):
            spdx = line.split("[", 1)[1].split("]", 1)[0]
            if spdx not in allowed:
                problems.append(f"CREDITS.md lists non-allowed license {spdx!r}")

    if manifest.get("characters"):
        path = out_dir / manifest["characters"]
        order = manifest.get("characterOrder") or []
        if not path.exists():
            problems.append(f"characters: missing {manifest['characters']}")
        elif not order:
            problems.append("characters: sheet has no characterOrder")
        else:
            with Image.open(path) as img:
                want = (CHAR_W * len(DIRS) * FRAMES, CHAR_H * len(order))
                if img.size != want:
                    problems.append(
                        f"characters: {manifest['characters']} is {img.size[0]}x{img.size[1]}, "
                        f"expected {want[0]}x{want[1]} for {len(order)} character(s)"
                    )
                else:
                    counts["characters"] = len(order)

    if manifest.get("tiles"):
        path = out_dir / manifest["tiles"]
        order = manifest.get("tileOrder") or []
        if not path.exists():
            problems.append(f"tiles: missing {manifest['tiles']}")
        elif not order:
            problems.append("tiles: sheet has no tileOrder")
        else:
            with Image.open(path) as img:
                want = (TILE_W * len(order), TILE_H)
                if img.size != want:
                    problems.append(
                        f"tiles: {manifest['tiles']} is {img.size[0]}x{img.size[1]}, "
                        f"expected {want[0]}x{want[1]} for {len(order)} tile(s)"
                    )
                else:
                    counts["tiles"] = len(order)

    for name, file in (manifest.get("props") or {}).items():
        if not file:
            continue
        if not (out_dir / file).exists():
            problems.append(f"prop '{name}': missing {file}")
        else:
            counts["props"] += 1

    if problems:
        for p in problems:
            print(f"error: {p}", file=sys.stderr)
        return 1

    log(
        f"ok: {counts['characters']} character(s), {counts['tiles']} tile(s), "
        f"{counts['props']} prop(s) verified in {out_dir / PACK_DIR}"
        + ("" if active else " (built, not active — manifest.json keeps the drawn art)")
    )
    return 0


# --------------------------------------------------------------------------- #

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--sources", default=str(SOURCES), help="path to sources.json")
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("discover", help="list upstream pack contents")
    d.add_argument("--pack", help="only this pack id")
    d.add_argument("--measure", action="store_true", help="download images to report sizes")
    d.add_argument("--filter", help="only paths containing this substring")
    d.add_argument("--out", default="discovery.json")
    d.set_defaults(func=cmd_discover)

    b = sub.add_parser("build", help="fetch, slice and write the sheets under assets/")
    b.add_argument("--pack", help="only this pack id")
    b.add_argument("--out", default=str(OUT_DIR))
    b.add_argument("--cache", default=".sprite-cache")
    b.add_argument("--pin", action="store_true", help="write observed checksums back to sources.json")
    b.set_defaults(func=cmd_build)

    v = sub.add_parser("verify", help="check the built sheets against assets/manifest.json")
    v.add_argument("--out", default=str(OUT_DIR))
    v.set_defaults(func=cmd_verify)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
