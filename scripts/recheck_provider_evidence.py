"""Focused re-check: market providers evidence line after the [object Object] fix."""

from __future__ import annotations

import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
    time.sleep(2.2)
    if "/login" in page.url or "Sign in" in page.inner_text("body"):
        page.fill("input[type='email']", "alex@cosmoz.app")
        page.fill("input[type='password']", "cosmoz123")
        page.click("button[type='submit']")
        time.sleep(2.2)
    page.goto(BASE + "/monitoring", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2400)
    page.evaluate("() => { const p = document.querySelector('nextjs-portal'); if (p) p.remove() }")
    page.click("[data-testid='monitoring-tab-market']")
    page.wait_for_timeout(2000)
    text = page.inner_text("[data-testid='monitoring-market-providers']")
    ok = "[object Object]" not in text and "websocket" in text and "REST failures" in text
    print("PROVIDER EVIDENCE OK" if ok else "PROVIDER EVIDENCE STILL BROKEN")
    print(text[:400])
    page.screenshot(path="/home/z/my-project/apps/web/scripts/shots/monitoring/19-market-providers-fixed.png", full_page=False)
    browser.close()
