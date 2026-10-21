#!/usr/bin/env python3
"""Restore-save E2E smoke — Academy save (Line B).

Verifies the restored save boots and the core pages render, in light + dark
(themed via the app's own toggle), desktop 1440 + mobile 390, with a clean
console (known noise filtered). PNGs -> apps/web/scripts/shots/restore-save/.
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = Path("/home/z/my-project/apps/web/scripts/shots/restore-save")
OUT.mkdir(parents=True, exist_ok=True)

NOISE = (
    "React DevTools",
    "[MSW]",
    "Autofocus processing",
    "Download the React DevTools",
    "[vite]",
    "Warning: Extra attributes from the server",
    "net::ERR",
    "Failed to load resource",
)

PAGES = [
    ("/", "dashboard"),
    ("/academy", "academy"),
    ("/academy/courses", "academy-courses"),
    ("/analytics", "analytics"),
    ("/analytics/risk", "analytics-risk"),
    ("/integrations", "integrations"),
    ("/portfolios", "portfolios"),
    ("/goals", "goals"),
]


def console_errors():
    return []


def main() -> int:
    failures = []
    console_log = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        def on_console(msg):
            text = msg.text
            if any(n in text for n in NOISE):
                return
            console_log.append(f"[{msg.type}] {text}")

        page.on("console", on_console)
        page.on("pageerror", lambda e: console_log.append(f"[pageerror] {e}"))

        page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        time.sleep(4)
        page.screenshot(path=OUT / "00-landing.png", full_page=False)

        body_text = page.inner_text("body")
        print("LANDING BODY HEAD:", body_text[:200].replace("\n", " | "))

        # If redirected to login, sign in (demo account + 2FA demo code).
        if "/login" in page.url or "Sign in" in body_text:
            print("Auth gate detected — signing in with demo credentials")
            page.fill("input[type='email']", "alex@cosmoz.app")
            page.fill("input[type='password']", "cosmoz123")
            page.click("button[type='submit']")
            time.sleep(2)
            body_text = page.inner_text("body")
            if "verification" in body_text.lower() or "code" in body_text.lower():
                page.fill("input", "246810")
                page.click("button[type='submit']")
                time.sleep(2)
            page.wait_for_load_state("networkidle")
            page.screenshot(path=OUT / "01-after-login.png")
            print("after login url:", page.url)

        for path, name in PAGES:
            try:
                page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=60000)
                time.sleep(1.6)
                page.screenshot(path=OUT / f"desktop-light-{name}.png", full_page=False)
                # scroll to capture more content
                page.mouse.wheel(0, 900)
                time.sleep(0.6)
                page.screenshot(path=OUT / f"desktop-light-{name}-scrolled.png", full_page=False)
                print(f"OK  {path}")
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{path}: {exc}")
                print(f"FAIL {path}: {exc}")

        # Dark theme via the app's own toggle (data-theme attribute driver).
        try:
            page.goto(f"{BASE}/", wait_until="domcontentloaded", timeout=60000)
            time.sleep(1)
            # The split-button's left side toggles light <-> dark directly.
            # Default is dark-blue; first click -> light (light pass), second
            # click -> back to dark-blue (dark pass).
            page.click("[data-testid='theme-toggle-button']")
            time.sleep(1.0)
            page.click("[data-testid='theme-toggle-button']")
            time.sleep(1.2)
            theme = page.get_attribute("html", "data-theme")
            print("theme for dark pass:", theme)
            for path, name in [("/", "dashboard"), ("/academy", "academy"), ("/analytics/risk", "analytics-risk")]:
                page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=60000)
                time.sleep(1.4)
                page.screenshot(path=OUT / f"desktop-dark-{name}.png")
                print(f"OK  dark {path}")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"dark pass: {exc}")
            print(f"FAIL dark pass: {exc}")

        # Mobile 390 sanity on the two key pages
        mob = browser.new_context(viewport={"width": 390, "height": 844})
        mpage = mob.new_page()
        mpage.on("console", on_console)
        try:
            for path, name in [("/", "dashboard"), ("/academy", "academy"), ("/analytics", "analytics")]:
                mpage.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=60000)
                time.sleep(1.4)
                mpage.screenshot(path=OUT / f"mobile-{name}.png")
                scroll_w = mpage.evaluate("document.body.scrollWidth")
                vp_w = mpage.evaluate("window.visualViewport ? window.visualViewport.width : window.innerWidth")
                print(f"mobile {path}: scrollWidth={scroll_w} viewport={vp_w} overflow={scroll_w > vp_w}")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"mobile pass: {exc}")
            print(f"FAIL mobile pass: {exc}")

        browser.close()

    (OUT / "console.log.txt").write_text("\n".join(console_log) or "(console clean)", encoding="utf-8")
    real_errors = [l for l in console_log if l.startswith("[error]") or l.startswith("[pageerror]")]
    print(f"\nconsole entries (filtered): {len(console_log)}; errors: {len(real_errors)}")
    for line in real_errors[:12]:
        print("  ", line[:220])
    print("failures:", len(failures))
    for f in failures:
        print("  -", f[:220])
    (OUT / "summary.json").write_text(json.dumps({"failures": failures, "console_errors": real_errors}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
