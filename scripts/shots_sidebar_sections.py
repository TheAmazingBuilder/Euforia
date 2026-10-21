"""E2E ritual — sectioned sidebar (task: restore save + sectioned rail).

Captures:
- Desktop 1440x900, light + dark (via the app's own theme toggle)
- Sidebar expanded + collapsed
- Academy / Analytics with active state in the sectioned rail
- Mobile 390x844 navigation sheet + overflow check
- Console error collection (noise filtered: React DevTools, MSW, Autofocus)

Output: apps/web/scripts/shots/sidebar-sections/
"""

from __future__ import annotations

import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = pathlib.Path("/home/z/my-project/apps/web/scripts/shots/sidebar-sections")
OUT.mkdir(parents=True, exist_ok=True)

CONSOLE_NOISE = (
    "React DevTools",
    "[MSW]",
    "Autofocus",
    "Download the React DevTools",
)

console_messages: list[str] = []


def track_console(msg) -> None:
    text = msg.text or ""
    if any(noise in text for noise in CONSOLE_NOISE):
        return
    if msg.type in ("error", "warning"):
        console_messages.append(f"[{msg.type}] {text}")


def overflow_390(page) -> bool:
    return page.evaluate(
        "() => document.body.scrollWidth > (window.visualViewport ? window.visualViewport.width : window.innerWidth)"
    )


def dismiss_dev_overlay(page) -> None:
    """Log then remove the nextjs dev-overlay portal if it blocks the page."""
    text = page.evaluate(
        "() => { const p = document.querySelector('nextjs-portal'); return p ? (p.shadowRoot ? p.shadowRoot.textContent : p.textContent) : null }"
    )
    if text and text.strip():
        console_messages.append(f"[nextjs-portal] {text.strip()[:600]}")
        print(f"  !! dev-overlay: {text.strip()[:200]}")
    page.evaluate("() => { const p = document.querySelector('nextjs-portal'); if (p) p.remove() }")


def nav(page, path: str, settle: int = 900) -> None:
    page.goto(BASE + path, wait_until="domcontentloaded")
    page.wait_for_timeout(settle)
    dismiss_dev_overlay(page)


def set_theme(page, want: str) -> None:
    current = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    if current == want:
        return
    page.get_by_test_id("theme-toggle-button").click()
    page.wait_for_timeout(400)
    current = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    if current != want:
        raise RuntimeError(f"theme toggle failed: want {want}, got {current}")


def shot(page, name: str, full: bool = True) -> None:
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    print(f"  shot: {name}.png")


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- Desktop 1440 ----------
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("console", track_console)

    nav(page, "/", settle=1500)
    set_theme(page, "light")
    shot(page, "desktop-light-dashboard", full=False)

    # Analytics with active state in the Insights section
    nav(page, "/analytics")
    page.wait_for_timeout(400)
    shot(page, "desktop-light-analytics", full=False)

    # Academy now lives in the rail (Growth section)
    nav(page, "/academy")
    page.wait_for_timeout(400)
    shot(page, "desktop-light-academy", full=False)

    # Collapsed rail (hairline separators instead of labels)
    page.get_by_label("Collapse sidebar").click()
    page.wait_for_timeout(400)
    shot(page, "desktop-light-collapsed", full=False)
    page.get_by_label("Expand sidebar").click()
    page.wait_for_timeout(300)

    # Dark pass
    set_theme(page, "dark-blue")
    nav(page, "/")
    page.wait_for_timeout(400)
    shot(page, "desktop-dark-dashboard", full=False)
    nav(page, "/analytics")
    page.wait_for_timeout(400)
    shot(page, "desktop-dark-analytics", full=False)
    nav(page, "/academy")
    page.wait_for_timeout(400)
    shot(page, "desktop-dark-academy", full=False)

    ctx.close()

    # ---------- Mobile 390 ----------
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    mpage = mctx.new_page()
    mpage.on("console", track_console)

    nav(mpage, "/", settle=1200)
    set_theme(mpage, "light")
    mpage.get_by_label("Open navigation menu").click()
    mpage.wait_for_timeout(600)
    shot(mpage, "mobile-light-sheet", full=False)
    mpage.keyboard.press("Escape")
    mpage.wait_for_timeout(300)

    nav(mpage, "/")
    mpage.wait_for_timeout(400)
    ovf = overflow_390(mpage)
    print(f"overflow-390: {ovf}")

    mctx.close()
    browser.close()

report = {
    "console_issues": console_messages,
    "overflow_390": ovf if "ovf" in dir() else None,
    "shots": sorted(f.name for f in OUT.glob("*.png")),
}
(OUT / "summary.json").write_text(json.dumps(report, indent=2))
print(json.dumps({k: report[k] for k in ("console_issues", "overflow_390")}, indent=2))
sys.exit(0)
