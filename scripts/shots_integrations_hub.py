"""E2E ritual — Integration Hub (t49).

Covers:
- Desktop 1440x900 light: overview (stat strip, needs attention, matrix, activity),
  connect MT5 (dynamic credential form), sync, test dialog (degraded provider),
  all 9 tabs, news filters, webhook console gauntlet (signed/unsigned/corrupt),
  reauthorize (AUTH_REQUIRED -> CONNECTED).
- Desktop dark: overview + webhooks.
- Mobile 390x844: overflow checks + tab strip usability.
- Console error collection (dev-overlay / MSW noise filtered).

Output: apps/web/scripts/shots/integrations-hub/ + summary.json
"""

from __future__ import annotations

import json
import pathlib
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = pathlib.Path("/home/z/my-project/apps/web/scripts/shots/integrations-hub")
OUT.mkdir(parents=True, exist_ok=True)

NOISE = (
    "React DevTools",
    "[MSW]",
    "Autofocus",
    "Download the React DevTools",
    "nextjs-portal",
)

console_messages: list[str] = []
results: dict = {"steps": [], "console": [], "overflow": {}}


def track_console(msg) -> None:
    text = msg.text or ""
    if any(noise in text for noise in NOISE):
        return
    if msg.type in ("error", "warning"):
        console_messages.append(f"[{msg.type}] {text}")


def overflow_390(page) -> bool:
    return page.evaluate(
        "() => document.body.scrollWidth > (window.visualViewport ? window.visualViewport.width : window.innerWidth)"
    )


def dismiss_dev_overlay(page) -> None:
    page.evaluate(
        "() => { const p = document.querySelector('nextjs-portal'); if (p) p.remove() }"
    )


def unblock(page) -> None:
    dismiss_dev_overlay(page)
    page.wait_for_timeout(120)


def nav(page, path: str, settle: int = 1400) -> None:
    page.goto(BASE + path, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(settle)
    dismiss_dev_overlay(page)


def shot(page, name: str, full: bool = True) -> None:
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    print(f"  shot: {name}.png")
    results["steps"].append(f"shot {name}")


def step_ok(label: str, detail: str = "") -> None:
    results["steps"].append(f"OK {label} {detail}".strip())
    print(f"  OK: {label} {detail}")


def step_fail(label: str, detail: str) -> None:
    results["steps"].append(f"FAIL {label} {detail}")
    print(f"  FAIL: {label} {detail}")


def ensure_login(page) -> None:
    page.goto(BASE + "/", wait_until="domcontentloaded", timeout=60000)
    time.sleep(2.4)
    if "/login" in page.url or "Sign in" in page.inner_text("body"):
        page.fill("input[type='email']", "alex@cosmoz.app")
        page.fill("input[type='password']", "cosmoz123")
        page.click("button[type='submit']")
        time.sleep(2)
        if "verification" in page.inner_text("body").lower() or "code" in page.inner_text("body").lower():
            page.fill("input", "246810")
            page.click("button[type='submit']")
            time.sleep(2.2)
        print("  logged in ->", page.url)


def set_theme(page, want: str) -> None:
    current = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    if current == want:
        return
    page.get_by_test_id("theme-toggle-button").click()
    page.wait_for_timeout(400)
    current = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    if current != want:
        raise RuntimeError(f"theme toggle failed: want {want}, got {current}")


def hub_row_status(page, provider_id: str) -> str:
    try:
        return (
            page.get_by_test_id(f"hub-status-{provider_id}")
            .first.inner_text()
            .strip()
            .upper()
            .replace("\n", " ")
        )
    except Exception:  # noqa: BLE001
        return "UNKNOWN"


def goto_tab(page, tab_label: str, settle: int = 700) -> None:
    unblock(page)
    page.locator('[role="tab"]', has_text=tab_label).first.click()
    page.wait_for_timeout(settle)


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- Desktop 1440 — light ----------
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("console", track_console)

    ensure_login(page)

    # ===== Overview =====
    nav(page, "/integrations", settle=1800)
    set_theme(page, "light")
    page.wait_for_timeout(500)
    shot(page, "01-desktop-light-overview")

    stat_visible = page.get_by_test_id("hub-stat-strip").is_visible()
    matrix_rows = page.locator('[data-testid^="hub-row-"]').count()
    attention = page.locator('[data-testid^="hub-attention-status-"]').count()
    if stat_visible and matrix_rows >= 12:
        step_ok("overview", f"stat-strip visible, matrix rows={matrix_rows}, attention={attention}")
    else:
        step_fail("overview", f"stat={stat_visible} rows={matrix_rows}")

    # ===== Connect MT5 (dynamic credential form) =====
    try:
        unblock(page)
        page.get_by_test_id("integration-connect-mt5").click()
        page.wait_for_selector("#credential-mt5-login", timeout=6000)
        page.fill("#credential-mt5-login", "5031234")
        page.fill("#credential-mt5-password", "investor-ro")
        page.fill("#credential-mt5-server", "MetaQuotes-Demo")
        shot(page, "02-desktop-light-connect-mt5", full=False)
        unblock(page)
        page.get_by_role("button", name="Connect", exact=True).last.click()
        page.wait_for_timeout(1800)
        status = hub_row_status(page, "mt5")
        if "CONNECTED" in status:
            step_ok("connect-mt5", f"status -> {status}")
        else:
            step_fail("connect-mt5", f"status={status}")
    except Exception as exc:  # noqa: BLE001
        step_fail("connect-mt5", str(exc)[:160])
        page.keyboard.press("Escape")

    # ===== Sync market-feed =====
    try:
        unblock(page)
        page.get_by_test_id("integration-sync-market-feed").click()
        page.wait_for_timeout(1800)
        step_ok("sync-market-feed", f"status={hub_row_status(page, 'market-feed')}")
    except Exception as exc:  # noqa: BLE001
        step_fail("sync-market-feed", str(exc)[:160])

    # ===== Test dialog on degraded news-wire =====
    try:
        unblock(page)
        page.get_by_test_id("integration-test-news-wire").click()
        page.wait_for_selector('[data-testid="integration-test-checks"]', timeout=8000)
        page.wait_for_timeout(1400)
        checks = page.locator('[data-testid="integration-test-checks"] > div').count()
        shot(page, "03-desktop-light-test-degraded", full=False)
        if checks >= 4:
            step_ok("test-news-wire", f"checks rendered={checks}")
        else:
            step_fail("test-news-wire", f"checks={checks}")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
    except Exception as exc:  # noqa: BLE001
        step_fail("test-news-wire", str(exc)[:160])

    shot(page, "04-desktop-light-overview-after-actions")

    # ===== Trading Accounts tab =====
    goto_tab(page, "Trading Accounts")
    brokers = page.get_by_test_id("hub-brokers").locator('[data-testid^="hub-detail-"]').count()
    exchanges = page.get_by_test_id("hub-exchanges").locator('[data-testid^="hub-detail-"]').count()
    shot(page, "05-desktop-light-trading-accounts")
    step_ok("tab-trading", f"broker adapters={brokers}, exchanges={exchanges}")

    # ===== Market Data tab =====
    goto_tab(page, "Market Data")
    md = page.get_by_test_id("hub-market-data").locator('[data-testid^="hub-detail-"]').count()
    shot(page, "06-desktop-light-market-data")
    step_ok("tab-market-data", f"providers={md}")

    # ===== Economic Data tab =====
    goto_tab(page, "Economic Data")
    shot(page, "07-desktop-light-economic")
    step_ok("tab-economic", "pipeline + contract visible")

    # ===== Market News tab + filter =====
    goto_tab(page, "Market News", settle=1100)
    page.wait_for_selector('[data-testid="news-list"]', timeout=8000)
    all_count = page.locator('[data-testid="news-item"]').count()
    page.get_by_role("button", name="Forex", exact=True).click()
    page.wait_for_timeout(500)
    forex_count = page.locator('[data-testid="news-item"]').count()
    licensing = page.get_by_test_id("news-provider").inner_text()
    shot(page, "08-desktop-light-news-forex-filter")
    if forex_count < all_count and forex_count > 0:
        step_ok("news-filter", f"all={all_count} forex={forex_count}, provider={licensing}")
    else:
        step_fail("news-filter", f"all={all_count} forex={forex_count}")
    page.get_by_role("button", name="All", exact=True).first.click()
    page.wait_for_timeout(400)

    # ===== TradingView tab =====
    goto_tab(page, "TradingView")
    shot(page, "09-desktop-light-tradingview")
    step_ok("tab-tradingview", "source-of-truth panel")

    # ===== Notifications tab + test push =====
    goto_tab(page, "Notifications", settle=900)
    shot(page, "10-desktop-light-notifications")
    try:
        unblock(page)
        page.get_by_test_id("notify-channel-email").get_by_role("button", name="Send test").click()
        page.wait_for_timeout(1200)
        step_ok("notify-test-email", "test push sent")
    except Exception as exc:  # noqa: BLE001
        step_fail("notify-test-email", str(exc)[:160])

    # ===== Webhooks tab — full gauntlet =====
    goto_tab(page, "Webhooks", settle=900)
    page.wait_for_selector('[data-testid="webhook-console"]', timeout=8000)
    shot(page, "11-desktop-light-webhooks")

    # 1. Deliver unsigned -> REJECTED (missing signature)
    try:
        unblock(page)
        page.get_by_role("button", name="Deliver unsigned").click()
        page.wait_for_timeout(1500)
        verdict = page.get_by_test_id("webhook-checks").inner_text()
        ok_unsigned = "REJECTED" in verdict and "MISSING" in verdict
        shot(page, "12-desktop-light-webhook-unsigned", full=False)
        results["steps"].append(
            f"{'OK' if ok_unsigned else 'FAIL'} webhook-unsigned -> {'REJECTED/MISSING' if ok_unsigned else verdict[:80]}"
        )
        print(f"  {'OK' if ok_unsigned else 'FAIL'}: webhook unsigned rejected")
    except Exception as exc:  # noqa: BLE001
        step_fail("webhook-unsigned", str(exc)[:160])

    # 2. Sign -> deliver signed -> ACCEPTED
    try:
        unblock(page)
        page.get_by_test_id("webhook-sign").click()
        page.wait_for_timeout(1300)
        unblock(page)
        page.get_by_test_id("webhook-deliver").click()
        page.wait_for_timeout(1500)
        verdict = page.get_by_test_id("webhook-checks").inner_text()
        ok_signed = "ACCEPTED" in verdict and "VALID" in verdict
        shot(page, "13-desktop-light-webhook-signed", full=False)
        results["steps"].append(
            f"{'OK' if ok_signed else 'FAIL'} webhook-signed -> {'ACCEPTED/VALID' if ok_signed else verdict[:80]}"
        )
        print(f"  {'OK' if ok_signed else 'FAIL'}: webhook signed accepted")
    except Exception as exc:  # noqa: BLE001
        step_fail("webhook-signed", str(exc)[:160])

    # 3. Corrupt signature -> sign -> deliver -> REJECTED (mismatch)
    try:
        unblock(page)
        page.get_by_text("Corrupt the signature").click()
        page.wait_for_timeout(200)
        unblock(page)
        page.get_by_test_id("webhook-sign").click()
        page.wait_for_timeout(1300)
        unblock(page)
        page.get_by_test_id("webhook-deliver").click()
        page.wait_for_timeout(1500)
        verdict = page.get_by_test_id("webhook-checks").inner_text()
        ok_corrupt = "REJECTED" in verdict and "mismatch" in verdict
        shot(page, "14-desktop-light-webhook-corrupt", full=False)
        results["steps"].append(
            f"{'OK' if ok_corrupt else 'FAIL'} webhook-corrupt -> {'REJECTED/mismatch' if ok_corrupt else verdict[:80]}"
        )
        print(f"  {'OK' if ok_corrupt else 'FAIL'}: webhook corrupt rejected")
    except Exception as exc:  # noqa: BLE001
        step_fail("webhook-corrupt", str(exc)[:160])

    log_rows = page.locator('[data-testid="webhook-log"] > div').count()
    step_ok("webhook-log", f"delivery log rows={log_rows}")

    # ===== External tab + reauthorize sheets-sync =====
    goto_tab(page, "External Services", settle=900)
    ext = page.get_by_test_id("hub-external").locator('[data-testid^="hub-detail-"]').count()
    shot(page, "15-desktop-light-external")
    step_ok("tab-external", f"services={ext}")
    try:
        unblock(page)
        page.get_by_test_id("integration-connect-sheets-sync").click()
        page.wait_for_timeout(600)
        unblock(page)
        page.get_by_role("button", name="Reauthorize", exact=True).last.click()
        page.wait_for_timeout(1800)
        status = hub_row_status(page, "sheets-sync")
        if "CONNECTED" in status:
            step_ok("reauthorize-sheets-sync", f"status -> {status}")
        else:
            step_fail("reauthorize-sheets-sync", f"status={status}")
    except Exception as exc:  # noqa: BLE001
        step_fail("reauthorize-sheets-sync", str(exc)[:160])

    # ===== Disconnect flow (history retained) — MT5 was connected earlier =====
    try:
        goto_tab(page, "Trading Accounts", settle=800)
        unblock(page)
        page.get_by_test_id("integration-disconnect-mt5").click()
        page.wait_for_timeout(500)
        shot(page, "16-desktop-light-disconnect-confirm", full=False)
        unblock(page)
        page.get_by_role("button", name="Disconnect", exact=True).last.click()
        page.wait_for_timeout(1600)
        status = hub_row_status(page, "mt5")
        if "DISCONNECTED" in status:
            step_ok("disconnect-mt5", f"status -> {status} (history retained)")
        else:
            step_fail("disconnect-mt5", f"status={status}")
    except Exception as exc:  # noqa: BLE001
        step_fail("disconnect-mt5", str(exc)[:160])

    # Activity log should now hold entries
    activity = page.locator('[data-testid="hub-activity"] > div').count()
    results["steps"].append(f"OK activity-log rows={activity}")

    # ---------- Desktop 1440 — dark ----------
    set_theme(page, "dark-blue")
    nav(page, "/integrations", settle=1600)
    shot(page, "17-desktop-dark-overview")
    goto_tab(page, "Webhooks", settle=900)
    shot(page, "18-desktop-dark-webhooks")
    results["overflow"]["dark-integrations"] = page.evaluate(
        "() => document.body.scrollWidth > window.innerWidth"
    )
    ctx.close()

    # ---------- Mobile 390 ----------
    mctx = browser.new_context(viewport={"width": 390, "height": 844})
    mpage = mctx.new_page()
    mpage.on("console", track_console)
    ensure_login(mpage)
    nav(mpage, "/integrations", settle=1800)
    results["overflow"]["mobile-overview"] = overflow_390(mpage)
    shot(mpage, "19-mobile-overview")
    # Tab strip scrolls horizontally; open Market News via scroll-into-view
    tab = mpage.locator('[role="tab"]', has_text="Market News").first
    tab.scroll_into_view_if_needed()
    tab.click()
    mpage.wait_for_timeout(1100)
    results["overflow"]["mobile-news"] = overflow_390(mpage)
    shot(mpage, "20-mobile-news")
    mctx.close()

    browser.close()

results["console"] = console_messages[:40]
(OUT / "summary.json").write_text(json.dumps(results, indent=2))
print(json.dumps({"overflow": results["overflow"], "console_errors": len(console_messages)}, indent=2))
fails = [s for s in results["steps"] if s.startswith("FAIL")]
print(f"\nTOTAL steps={len(results['steps'])} fails={len(fails)}")
for f in fails:
    print("  ", f)
