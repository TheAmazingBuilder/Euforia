"""Focused repro: (1) palette stale entries - search INSIDE the dialog only;
(2) Trades rail click repro x2 with generous settle.
"""

from __future__ import annotations

import json

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"


def dismiss(page) -> None:
    page.evaluate("() => { const p = document.querySelector('nextjs-portal'); if (p) p.remove() }")


def nav(page, path: str, settle: int = 1000) -> None:
    page.goto(BASE + path, wait_until="domcontentloaded")
    page.wait_for_timeout(settle)
    dismiss(page)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()

    # ── (1) Palette entries - dialog-scoped ──
    nav(page, "/", settle=1500)
    page.keyboard.press("Control+k")
    page.wait_for_timeout(800)
    dialog = page.locator('[role="dialog"]')
    dialog_text = dialog.inner_text()
    entries = [line.strip() for line in dialog_text.splitlines() if line.strip()]
    report = {
        "palette_entries": entries,
        "stale_coach_in_dialog": "Coach" in dialog_text,
        "stale_goals_in_dialog": "Goals" in dialog_text,
        "has_trade_review": "Trade Review" in dialog_text,
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)

    # ── (2) Trades click repro x2 ──
    for attempt in (1, 2):
        nav(page, "/", settle=1800)
        dismiss(page)
        page.locator('nav[aria-label="Main navigation"] a[title="Trades"]').first.click(timeout=5000)
        page.wait_for_timeout(900)
        print(f"trades-click attempt {attempt}: landed on {page.url.replace(BASE, '') or '/'}")
        if "/trades" not in page.url:
            page.screenshot(path="/home/z/my-project/apps/web/scripts/shots/sidebar-v2/trades-click-fail.png")

    browser.close()
