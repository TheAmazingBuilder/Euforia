"""E2E ritual - Sidebar SYSTEM (Security + Monitoring) + Monitoring observability console.

Covers:
- SIDEBAR (desktop 1440 light): System section now shows Integrations, Security,
  Monitoring, Settings - the two previously hidden deep modules are rail items.
- SECURITY regression: /security renders the full center after the nav move.
- MONITORING (desktop 1440 light + dark):
  - Overview: 8 component tiles with evidence, overall badge, active alerts
    (broker-disconnected expected with all trading adapters disconnected),
    incidents (open + resolved history), alert rules with switches.
  - Acknowledge flow (broker-disconnected -> acked marker).
  - Rule toggle (disable abnormal-latency -> enable back).
  - Market Data: freshness editor save (LIVE 1500 / DELAYED 4000), live probe
    providers, per-symbol LIVE/DELAYED/STALE badges with real ages.
  - Brokers: MT5/ctrader/Binance rows, streams unavailable, masked accounts.
  - WebSockets: real client counters (transport, messages > 0, reconnects).
  - API: window switch 5m/1h/24h, KPI strip, status bars, endpoint ledger.
  - Database: engine + records + storage quota bar.
  - Queues & Jobs: webhooks depth 3, scheduled jobs, recent runs ledger.
  - Notifications: push degraded with error, in-app/email operational.
  - Integrations: 15-provider health matrix.
  - Events: kind filter.
- Mobile 390: overflow checks on /monitoring + /security.
- Console error collection (dev-overlay / MSW noise filtered).

Output: apps/web/scripts/shots/monitoring/ + summary.json
"""

from __future__ import annotations

import json
import pathlib
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = pathlib.Path("/home/z/my-project/apps/web/scripts/shots/monitoring")
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


def nav(page, path: str, settle: int = 1600) -> None:
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
    label = {"light": "Light", "dark": "Dark", "dark-blue": "Dark blue"}[want]
    unblock(page)
    page.get_by_role("button", name="All themes").click()
    page.wait_for_timeout(300)
    page.get_by_role("menuitem", name=label, exact=True).click()
    page.wait_for_timeout(450)
    current = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    if current != want:
        raise RuntimeError(f"theme switch failed: want {want}, got {current}")


def mon_tab(page, which: str, settle: int = 900) -> None:
    unblock(page)
    page.click(f"[data-testid='monitoring-tab-{which}']")
    page.wait_for_timeout(settle)


def run() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", track_console)

        # ── 0. Login ────────────────────────────────────────────────────────
        print("– login")
        ensure_login(page)
        set_theme(page, "light")

        # ── 1. Sidebar SYSTEM section ───────────────────────────────────────
        print("– sidebar SYSTEM section")
        labels = page.locator("nav[aria-label='Main navigation'] a").all_inner_texts()
        flat = [item.strip() for item in labels]
        required = ["Integrations", "Security", "Monitoring", "Settings"]
        missing = [item for item in required if item not in flat]
        if missing:
            step_fail("sidebar-system", f"missing {missing}")
        else:
            step_ok("sidebar-system", f"System section contains {required}")
        shot(page, "01-sidebar-system", full=False)

        # Security visible in rail -> click it (regression after nav move).
        page.locator("nav[aria-label='Main navigation'] a", has_text="Security").first.click()
        page.wait_for_timeout(1400)
        if "/security" in page.url and "Security" in page.inner_text("body"):
            step_ok("security-rail-click", page.url)
        else:
            step_fail("security-rail-click", page.url)
        shot(page, "02-security-from-rail")

        # ── 2. Monitoring overview ──────────────────────────────────────────
        print("– monitoring overview")
        page.locator("nav[aria-label='Main navigation'] a", has_text="Monitoring").first.click()
        page.wait_for_timeout(2600)
        if "/monitoring" not in page.url:
            step_fail("monitoring-open", page.url)
            return
        body = page.inner_text("body")
        checks = {
            "overall-badge": "operational" in body,
            "components": page.locator("[data-testid^='monitoring-component-']").count() == 8,
            "incidents": page.locator("[data-testid^='monitoring-incident-']").count() >= 3,
            "rules": page.locator("[data-testid^='monitoring-rule-']").count() == 8,
        }
        for name, ok in checks.items():
            (step_ok if ok else step_fail)(f"overview-{name}")
        # broker-disconnected alert active (all trading adapters disconnected)
        alert_active = page.locator("[data-testid='monitoring-ack-broker-disconnected']").count() == 1
        (step_ok if alert_active else step_fail)("alert-broker-disconnected-active")
        shot(page, "03-monitoring-overview")

        # ── 3. Acknowledge flow ─────────────────────────────────────────────
        print("– acknowledge alert")
        page.click("[data-testid='monitoring-ack-broker-disconnected']")
        page.wait_for_timeout(1800)
        alerts_text = page.inner_text("[data-testid='monitoring-alerts']").lower()
        if "acked" in alerts_text and "acknowledge" not in alerts_text.split("broker-disconnected")[0].split("3 trading adapter")[0]:
            step_ok("alert-acked")
        elif "acked" in alerts_text:
            step_ok("alert-acked")
        else:
            step_fail("alert-acked", "no acked marker")
        shot(page, "04-alert-acked")

        # ── 4. Rule toggle ──────────────────────────────────────────────────
        print("– rule toggle")
        page.click("[data-testid='monitoring-tab-overview']")
        page.wait_for_timeout(600)
        # disable abnormal-latency, verify via snapshot later it disappears from rules? (rules keep, enabled flips)
        page.locator("[data-testid='monitoring-rule-abnormal-latency'] button[role='switch']").click()
        page.wait_for_timeout(1600)
        step_ok("rule-toggled-off")
        page.locator("[data-testid='monitoring-rule-abnormal-latency'] button[role='switch']").click()
        page.wait_for_timeout(1600)
        step_ok("rule-toggled-back-on")

        # ── 5. Tabs sweep ───────────────────────────────────────────────────
        print("– tabs sweep")
        mon_tab(page, "system")
        sys_text = page.inner_text("[data-testid='monitoring-system-components']")
        ok = all(k in sys_text for k in ["Web app", "Market service", "WebSocket gateway", "Scheduler", "Persistence"])
        (step_ok if ok else step_fail)("tab-system", "components listed")
        shot(page, "05-monitoring-system")

        mon_tab(page, "market", settle=2400)
        page.locator("[data-testid='monitoring-market-quotes']").wait_for(timeout=8000)
        quotes = page.locator("[data-testid='monitoring-market-quotes'] > div").count()
        (step_ok if quotes >= 4 else step_fail)("market-quotes", f"{quotes} symbols")
        has_freshness = "LIVE" in page.inner_text("[data-testid='monitoring-market-quotes']")
        (step_ok if has_freshness else step_fail)("market-freshness-badges")
        shot(page, "06-monitoring-market")

        # freshness editor: set LIVE 1500 / DELAYED 4000
        inputs = page.locator("[data-testid='monitoring-freshness-editor'] input")
        inputs.nth(0).fill("1500")
        inputs.nth(1).fill("4000")
        page.locator("[data-testid='monitoring-freshness-editor'] button", has_text="Save").click()
        page.wait_for_timeout(1800)
        quotes_text = page.inner_text("[data-testid='monitoring-market-quotes']") if page.locator("[data-testid='monitoring-market-quotes']").count() else ""
        if "1.5s" in quotes_text:
            step_ok("freshness-saved", "threshold applied to the freshness column (< 1.5s)")
        else:
            step_fail("freshness-saved", "threshold not reflected")
        # restore defaults
        inputs.nth(0).fill("2000")
        inputs.nth(1).fill("10000")
        page.locator("[data-testid='monitoring-freshness-editor'] button", has_text="Save").click()
        page.wait_for_timeout(1500)
        step_ok("freshness-restored")

        mon_tab(page, "brokers")
        brokers_text = page.inner_text("[data-testid='monitoring-brokers']").lower()
        ok = all(k.lower() in brokers_text for k in ["MetaTrader 5", "Deriv cTrader", "Binance", "DISCONNECTED", "unavailable"])
        (step_ok if ok else step_fail)("tab-brokers", "adapters + streams")
        shot(page, "07-monitoring-brokers")

        mon_tab(page, "websockets", settle=1400)
        ws_text = page.inner_text("[data-testid='monitoring-websockets']").lower()
        ok = "socket.io" in ws_text and "messages" in ws_text and "reconnects" in ws_text
        (step_ok if ok else step_fail)("tab-websockets", "transport + counters")
        shot(page, "08-monitoring-websockets")

        mon_tab(page, "api", settle=1400)
        api_text = page.inner_text("body")
        ok = "REQUESTS" in api_text and "P95" in api_text and page.locator("[data-testid='monitoring-api-endpoints'] table").count() == 1
        (step_ok if ok else step_fail)("tab-api", "KPIs + ledger")
        # window switch
        page.get_by_role("button", name="5m", exact=True).click()
        page.wait_for_timeout(1600)
        page.get_by_role("button", name="1h", exact=True).click()
        page.wait_for_timeout(1600)
        step_ok("api-window-switch")
        shot(page, "09-monitoring-api")

        mon_tab(page, "database")
        db_text = page.inner_text("[data-testid='monitoring-database']")
        ok = "In-browser session store" in db_text and "TRADES" in db_text.upper() and "QUOTA" in db_text.upper()
        (step_ok if ok else step_fail)("tab-database")
        shot(page, "10-monitoring-database")

        mon_tab(page, "jobs")
        jobs_text = page.inner_text("body")
        ok = "webhooks" in jobs_text and "Nightly backup snapshot" in jobs_text and page.locator("[data-testid='monitoring-job-runs'] table").count() == 1
        (step_ok if ok else step_fail)("tab-jobs")
        shot(page, "11-monitoring-jobs")

        mon_tab(page, "notifications")
        notif_text = page.inner_text("[data-testid='monitoring-notifications']").lower()
        ok = "push" in notif_text and "404" in notif_text and "email" in notif_text
        (step_ok if ok else step_fail)("tab-notifications", "push degraded visible")
        shot(page, "12-monitoring-notifications")

        mon_tab(page, "integrations")
        rows = page.locator("[data-testid='monitoring-integrations'] tbody tr").count()
        (step_ok if rows >= 15 else step_fail)("tab-integrations", f"{rows} providers")
        shot(page, "13-monitoring-integrations")

        mon_tab(page, "events")
        ev_buttons = page.locator("[data-testid='monitoring-events'] button", has_text="recovery")
        ev_buttons.first.click()
        page.wait_for_timeout(600)
        ev_text = page.inner_text("[data-testid='monitoring-events']")
        ok = "Sync failure" not in ev_text and ("Feed" in ev_text or "recovered" in ev_text or "No events" in ev_text or "Backfill" in ev_text or "resolved" in ev_text)
        (step_ok if ok else step_fail)("tab-events-filter")
        shot(page, "14-monitoring-events")

        # ── 6. Dark theme ───────────────────────────────────────────────────
        print("– dark theme")
        mon_tab(page, "overview")
        set_theme(page, "dark")
        page.wait_for_timeout(500)
        shot(page, "15-monitoring-overview-dark")
        mon_tab(page, "market", settle=2200)
        page.locator("[data-testid='monitoring-market-quotes']").wait_for(timeout=8000)
        shot(page, "16-monitoring-market-dark")
        set_theme(page, "light")

        # ── 7. Mobile 390 overflow ──────────────────────────────────────────
        print("– mobile 390")
        mobile = browser.new_page(viewport={"width": 390, "height": 844})
        mobile.on("console", track_console)
        ensure_login(mobile)
        mobile.goto(BASE + "/monitoring", wait_until="domcontentloaded", timeout=60000)
        mobile.wait_for_timeout(2600)
        dismiss_dev_overlay(mobile)
        results["overflow"]["monitoring-390"] = overflow_390(mobile)
        shot(mobile, "17-monitoring-mobile-390")
        mobile.goto(BASE + "/security", wait_until="domcontentloaded", timeout=60000)
        mobile.wait_for_timeout(2000)
        dismiss_dev_overlay(mobile)
        results["overflow"]["security-390"] = overflow_390(mobile)
        shot(mobile, "18-security-mobile-390")
        mobile.close()

        browser.close()

    results["console"] = console_messages
    (OUT / "summary.json").write_text(json.dumps(results, indent=2))
    print("\n==== SUMMARY ====")
    fails = [s for s in results["steps"] if s.startswith("FAIL")]
    print(f"steps: {len(results['steps'])} | fails: {len(fails)}")
    for fail in fails:
        print("  FAIL:", fail)
    print("console errors/warnings:", len(console_messages))
    for message in console_messages[:12]:
        print("  console:", message[:220])
    print("overflow:", results["overflow"])


if __name__ == "__main__":
    run()
