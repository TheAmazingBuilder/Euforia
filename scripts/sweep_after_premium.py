"""Quick console sweep after reports+security changes — 8 key routes."""

from __future__ import annotations

import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
ROUTES = ["/", "/reports", "/security", "/security/log", "/trades", "/analytics", "/dashboard", "/settings", "/integrations", "/risk"]
NOISE = ("React DevTools", "[MSW]", "Autofocus", "nextjs-portal", "Download the React DevTools")

errors: list[str] = []

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"{page.url} :: {m.text[:120]}") if m.type == "error" and not any(n in (m.text or "") for n in NOISE) else None)
    page.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
    time.sleep(2.5)
    if "/login" in page.url:
        page.fill("input[type='email']", "alex@cosmoz.app")
        page.fill("input[type='password']", "cosmoz123")
        page.click("button[type='submit']")
        time.sleep(2)
        if "verification" in page.inner_text("body").lower():
            page.fill("input", "246810")
            page.click("button[type='submit']")
            time.sleep(2.2)
    page.evaluate("() => { const p = document.querySelector('nextjs-portal'); if (p) p.remove() }")
    for route in ROUTES:
        page.goto(BASE + route, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(1700)
        page.evaluate("() => { const p = document.querySelector('nextjs-portal'); if (p) p.remove() }")
        status = "ok" if page.locator("main").count() > 0 else "NO-MAIN"
        print(f"{route:20s} {status}")
    browser.close()

print(f"\nconsole errors: {len(errors)}")
for error in errors[:10]:
    print(f"  {error}")
