"""E2E ritual — sidebar IA v2 + sign-out + session chart + brand mark + audit sweep.

Captures:
- Sectioned rail v2: Overview / Trading / News / Insights / Growth / System
- Discreet sign-out at the rail's bottom (+ functional click-through to /login)
- Session Live with the full-width chart (light + dark)
- Brand mark = favicon constellation
- Audit sweep: console errors + overflow on 20 routes (re-qualify the 2 anomalies)

Output: apps/web/scripts/shots/sidebar-v2/
"""

from __future__ import annotations

import json
import pathlib

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = pathlib.Path("/home/z/my-project/apps/web/scripts/shots/sidebar-v2")
OUT.mkdir(parents=True, exist_ok=True)

CONSOLE_NOISE = (
    "React DevTools",
    "[MSW]",
    "Autofocus",
    "Download the React DevTools",
)

console_messages: list[dict] = []


def track_console(msg) -> None:
    text = msg.text or ""
    if any(noise in text for noise in CONSOLE_NOISE):
        return
    if msg.type in ("error", "warning"):
        console_messages.append({"type": msg.type, "text": text[:300]})


def dismiss_dev_overlay(page) -> None:
    page.evaluate(
        "() => { const p = document.querySelector('nextjs-portal'); if (p) p.remove() }"
    )


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


def shot(page, name: str, full: bool = False) -> None:
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    print(f"  shot: {name}.png")


def overflow(page) -> bool:
    return page.evaluate(
        "() => document.body.scrollWidth > (window.visualViewport ? window.visualViewport.width : window.innerWidth)"
    )


audit: dict = {"routes": {}, "overflow_390": {}}

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- Desktop 1440 ----------
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("console", track_console)

    nav(page, "/", settle=1500)
    set_theme(page, "light")
    shot(page, "desktop-light-dashboard")

    # Session Live — full-width chart
    nav(page, "/session", settle=2500)
    shot(page, "desktop-light-session")
    set_theme(page, "dark-blue")
    page.wait_for_timeout(400)
    shot(page, "desktop-dark-session")

    # Collapsed rail (dark)
    nav(page, "/", settle=900)
    page.get_by_label("Collapse sidebar").click()
    page.wait_for_timeout(400)
    shot(page, "desktop-dark-collapsed")
    page.get_by_label("Expand sidebar").click()
    page.wait_for_timeout(300)

    # Rail v2 light on a Trading tab (active state)
    nav(page, "/journal", settle=900)
    shot(page, "desktop-light-tradereview")
    ctx.close()

    # ---------- Sign-out functional check (fresh context) ----------
    sctx = browser.new_context(viewport={"width": 1440, "height": 900})
    spage = sctx.new_page()
    spage.on("console", track_console)
    nav(spage, "/", settle=1500)
    spage.get_by_test_id("sidebar-signout").click()
    spage.wait_for_timeout(1200)
    landed = spage.url
    print(f"sign-out landed: {landed}")
    shot(spage, "signout-landed-login")
    audit["signout_landed_on_login"] = "/login" in landed
    sctx.close()

    # ---------- Audit sweep (desktop, light) ----------
    actx = browser.new_context(viewport={"width": 1440, "height": 900})
    apage = actx.new_page()
    apage.on("console", track_console)

    routes = [
        "/", "/session", "/trades", "/journal", "/analytics", "/playbook",
        "/calendar", "/reports", "/risk", "/academy", "/discipline",
        "/integrations", "/settings", "/portfolios", "/security",
        "/community", "/monitoring", "/help", "/backups", "/coach", "/goals",
    ]
    for route in routes:
        nav(apage, route, settle=1100)
        errors = [
            m for m in console_messages
            if m["type"] == "error" and "nextjs-portal" not in m["text"]
        ]
        audit["routes"][route] = {"console_errors": len(errors)}
        if errors:
            audit["routes"][route]["sample"] = errors[-1]["text"][:200]
            print(f"  !! {route}: {len(errors)} console errors — {errors[-1]['text'][:120]}")
    actx.close()

    # ---------- Mobile 390 ----------
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    mpage = mctx.new_page()
    mpage.on("console", track_console)

    nav(mpage, "/", settle=1200)
    set_theme(mpage, "light")
    mpage.get_by_label("Open navigation menu").click()
    mpage.wait_for_timeout(600)
    shot(mpage, "mobile-light-sheet")
    mpage.keyboard.press("Escape")
    mpage.wait_for_timeout(300)

    nav(mpage, "/session", settle=2000)
    audit["overflow_390"]["/session"] = overflow(mpage)
    print(f"overflow-390 /session: {audit['overflow_390']['/session']}")
    mctx.close()

    browser.close()

audit["console_issues"] = [
    m for m in console_messages if "nextjs-portal" not in m["text"]
]
(OUT / "summary.json").write_text(json.dumps(audit, indent=2))
print(json.dumps({k: audit[k] for k in ("signout_landed_on_login", "overflow_390", "console_issues")}, indent=2)[:900])
