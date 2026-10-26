#!/usr/bin/env python3
"""Euforia brand icon pipeline (Pillow).

Fixes and derives the app-facing raster icons from the supplied brand kit:
  - regenerates the truncated euforia-mark-light-512.png (downscale from 1024)
  - generates the missing icon-192.png referenced by site.webmanifest
  - rebuilds apps/web/src/app/favicon.ico (16/32/48) from the kit PNGs
  - generates apps/web/src/app/apple-icon.png (180x180)

Source of truth: apps/web/public/brand/** (copied verbatim from Eurofia.zip).
No color or geometry is altered - pure resampling of official assets.
"""

from PIL import Image
from pathlib import Path

WEB = Path("/home/z/my-project/apps/web")
BRAND = WEB / "public" / "brand"
PNG = BRAND / "png"


def resize_to(src: Path, size: int, dest: Path) -> None:
    img = Image.open(src).convert("RGBA")
    out = img.resize((size, size), Image.LANCZOS)
    out.save(dest, "PNG", optimize=True)
    print(f"  {dest.relative_to(WEB)} ({out.size[0]}x{out.size[1]})")


def main() -> None:
    # 1) Repair the truncated mark-light-512 (0 bytes in the zip) from the 1024
    resize_to(PNG / "euforia-mark-light-1024.png", 512, PNG / "euforia-mark-light-512.png")

    # 2) icon-192.png referenced by the webmanifest but absent from the kit
    resize_to(PNG / "icon-512.png", 192, PNG / "icon-192.png")

    # 3) favicon.ico - multi-size, built from the official squircle renders
    favicon_src = Image.open(PNG / "icon-32.png").convert("RGBA")
    big = Image.open(PNG / "icon-128.png").convert("RGBA")
    sizes = [(16, 16), (32, 32), (48, 48)]
    dest = WEB / "src" / "app" / "favicon.ico"
    big.save(dest, format="ICO", sizes=sizes)
    print(f"  {dest.relative_to(WEB)} (16/32/48)")

    # 4) apple-icon.png - 180x180 (Next auto-discovers src/app/apple-icon.png)
    resize_to(PNG / "icon-512.png", 180, WEB / "src" / "app" / "apple-icon.png")

    print("done")


if __name__ == "__main__":
    main()
