"""Render candidate logos (ICO frames + SVGs) to PNGs for visual comparison."""
from PIL import Image
import os

BASE = "/home/z/my-project/scripts/logo-hunt"

# 1) ICO frames -> PNG
for name in ["favicon-ce46d30.ico", "favicon-d4ba9ef.ico"]:
    ico = Image.open(os.path.join(BASE, name))
    print(name, "-> sizes:", ico.info.get("sizes", "n/a"), "base:", ico.size)
    largest = ico
    try:
        ico.size  # PIL lazily loads largest by default
    except Exception:
        pass
    largest.save(os.path.join(BASE, name.replace(".ico", "-frame.png")))

# 2) SVG -> PNG via Playwright (html wrapper), 512px
import asyncio
from playwright.async_api import async_playwright

svgs = ["icon-d4ba9ef.svg", "icon-backup.svg", "icon-before-constellation.svg"]
current = "/home/z/my-project/apps/web/public/icon.svg"

async def shoot():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 540, "height": 540})
        targets = [(s, os.path.join(BASE, s)) for s in svgs] + [("icon-CURRENT.svg", current)]
        for label, path in targets:
            svg = open(path).read()
            html = f"<!doctype html><html><body style='margin:0;background:#1a1f2e;display:grid;place-items:center;height:100vh'>{svg.replace('<svg ', '<svg width=512 height=512 ')}</body></html>"
            await page.set_content(html)
            out = os.path.join(BASE, label.replace(".svg", ".png"))
            await page.screenshot(path=out)
            print("shot:", out)
        await browser.close()

asyncio.run(shoot())
