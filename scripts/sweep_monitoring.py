"""Post-cleanup route sweep - every rail + hidden route renders, console clean, no 390 overflow."""

from __future__ import annotations

import json
import pathlib
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = pathlib.Path("/home/z/my-project/apps/web/scripts/shots/monitoring")
OUT.mkdir(parents=True, exist_ok=True)

ROUTES = [
    "/", "/session", "/trades", "/journal", "/analytics", "/playbook",
    "/calendar", "/reports", "/risk", "/academy", "/discipline",
    "/integrations", "/security", "/monitoring", "/settings",
    "/coach", "/goals", "/portfolios", "/community", "/help", "/backups", "/security/log",
]

NOISE = ("React DevTools", "[MSW]", "Autofocus", "Download the React DevTools", "nextjs-portal")
errors: list[str] = []


def track_console(msg) -> None:
    text = msg.text or ""
    if any(noise in text for noise in NOISE):
        return
    if msg.type == "error":
        errors.append(text[:200])


def dismiss(page) -> None:
    page.evaluate("() => { const p = document.querySelector('nextjs-portal'); if (p) p.remove() }")


def run() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", track_console)

        page.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
        time.sleep(2.2)
        if "/login" in page.url or "Sign in" in page.inner_text("body"):
            page.fill("input[type='email']", "alex@cosmoz.app")
            page.fill("input[type='password']", "cosmoz123")
            page.click("button[type='submit']")
            time.sleep(2)
            if "verification" in page.inner_text("body").lower() or "code" in page.inner_text("body").lower():
                page.fill("input", "246810")
                page.click("button[type='submit']")
                time.sleep(2.2)

        results = {}
        for route in ROUTES:
            page.goto(BASE + route, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(1700)
            dismiss(page)
            blank = page.evaluate("() => document.body.innerText.trim().length < 40")
            results[route] = {"blank": blank, "url": page.url}
            status = "OK " if not blank else "BLANK"
            print(f"  {status} {route}")

        # mobile overflow on the two SYSTEM modules
        mobile = browser.new_page(viewport={"width": 390, "height": 844})
        mobile.on("console", track_console)
        mobile.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
        time.sleep(2.2)
        if "/login" in mobile.url:
            mobile.fill("input[type='email']", "alex@cosmoz.app")
            mobile.fill("input[type='password']", "cosmoz123")
            mobile.click("button[type='submit']")
            time.sleep(2.2)
        for route in ["/monitoring", "/security", "/integrations"]:
            mobile.goto(BASE + route, wait_until="domcontentloaded", timeout=60000)
            mobile.wait_for_timeout(1900)
            dismiss(mobile)
            overflow = mobile.evaluate(
                "() => document.body.scrollWidth > (window.visualViewport ? window.visualViewport.width : window.innerWidth)"
            )
            results[route]["overflow390"] = overflow
            print(f"  overflow390 {route}: {overflow}")
        mobile.close()
        browser.close()

    (OUT / "sweep.json").write_text(json.dumps({"routes": results, "console": errors}, indent=2))
    print("\nconsole errors:", len(errors))
    for error in errors[:10]:
        print("  ", error)


if __name__ == "__main__":
    run()
