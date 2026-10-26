"""E2E ritual - Integration Hub: Communication platforms (Telegram / Discord / Slack).

Covers:
- Desktop 1440x900 light: overview matrix grows to 15 providers, Communication tab
  renders 3 first-class providers + alert contract + fan-out pipeline, connect
  Telegram (dynamic credential form) -> CONNECTED, test dialog on Discord (4 checks),
  notifications tab shows relay-owned channels only (email + webhook push).
- Desktop dark: overview + communication.
- Mobile 390x844: overflow checks + tab strip usability.
- Console error collection (dev-overlay / MSW noise filtered).

Output: apps/web/scripts/shots/communication/ + summary.json
"""

from __future__ import annotations

import json
import pathlib
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = pathlib.Path("/home/z/my-project/apps/web/scripts/shots/communication")
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
    """Themes: dark-blue / dark / light. The main button cycles light<->dark-blue;
    the exact 'dark' theme goes through the dropdown (aria-label 'All themes')."""
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

    # ---------- Desktop 1440 - light ----------
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("console", track_console)

    ensure_login(page)

    # ===== Overview - matrix now includes the 3 communication providers =====
    nav(page, "/integrations", settle=1800)
    set_theme(page, "light")
    page.wait_for_timeout(500)
    shot(page, "01-desktop-light-overview")

    matrix_rows = page.locator('[data-testid^="hub-row-"]').count()
    tg_overview = hub_row_status(page, "telegram-bot")
    dc_overview = hub_row_status(page, "discord")
    sl_overview = hub_row_status(page, "slack")
    if matrix_rows >= 15 and tg_overview != "UNKNOWN" and dc_overview != "UNKNOWN" and sl_overview != "UNKNOWN":
        step_ok("overview", f"matrix rows={matrix_rows}, telegram={tg_overview}, discord={dc_overview}, slack={sl_overview}")
    else:
        step_fail("overview", f"rows={matrix_rows} tg={tg_overview} dc={dc_overview} sl={sl_overview}")

    # ===== Communication tab =====
    goto_tab(page, "Communication", settle=900)
    shot(page, "02-desktop-light-communication")

    comm_rows = page.get_by_test_id("hub-communication").locator('[data-testid^="hub-detail-"]').count()
    contract = page.get_by_text("Normalized alert payload").count()
    pipeline = page.get_by_text("Alert fan-out pipeline").count()
    if comm_rows == 3 and contract > 0 and pipeline > 0:
        step_ok("communication-tab", f"providers={comm_rows}, alert contract + pipeline visible")
    else:
        step_fail("communication-tab", f"rows={comm_rows} contract={contract} pipeline={pipeline}")

    # ===== Connect Telegram (dynamic credential form) =====
    try:
        unblock(page)
        page.get_by_test_id("integration-connect-telegram-bot").click()
        page.wait_for_selector("#credential-telegram-bot-bot_token", timeout=6000)
        page.fill("#credential-telegram-bot-bot_token", "7284912777:AAHdemo-token-9f3k2")
        page.fill("#credential-telegram-bot-chat_id", "@cosmoz_alerts")
        shot(page, "03-desktop-light-connect-telegram", full=False)
        unblock(page)
        page.get_by_role("button", name="Connect", exact=True).last.click()
        page.wait_for_timeout(1800)
        status = hub_row_status(page, "telegram-bot")
        if "CONNECTED" in status:
            step_ok("connect-telegram", f"status -> {status}")
        else:
            step_fail("connect-telegram", f"status={status}")
    except Exception as exc:  # noqa: BLE001
        step_fail("connect-telegram", str(exc)[:160])
        page.keyboard.press("Escape")

    shot(page, "04-desktop-light-communication-after-connect")

    # ===== Test dialog on Discord (4 safe checks) =====
    try:
        unblock(page)
        page.get_by_test_id("integration-test-discord").click()
        page.wait_for_selector('[data-testid="integration-test-checks"]', timeout=8000)
        page.wait_for_timeout(1400)
        checks = page.locator('[data-testid="integration-test-checks"] > div').count()
        shot(page, "05-desktop-light-test-discord", full=False)
        if checks >= 4:
            step_ok("test-discord", f"checks rendered={checks}")
        else:
            step_fail("test-discord", f"checks={checks}")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
    except Exception as exc:  # noqa: BLE001
        step_fail("test-discord", str(exc)[:160])

    # ===== Notifications tab - relay-owned channels only =====
    goto_tab(page, "Notifications", settle=900)
    page.wait_for_selector('[data-testid="notifications-panel"]', timeout=8000)
    channel_count = page.locator('[data-testid^="notify-channel-"]').count()
    shot(page, "06-desktop-light-notifications-relay")
    if channel_count == 2:
        step_ok("notifications-relay", f"channels={channel_count} (email + webhook push only)")
    else:
        step_fail("notifications-relay", f"channels={channel_count} (expected 2)")

    # ---------- Desktop dark ----------
    set_theme(page, "dark")
    goto_tab(page, "Overview", settle=900)
    shot(page, "07-desktop-dark-overview")
    goto_tab(page, "Communication", settle=900)
    shot(page, "08-desktop-dark-communication")
    step_ok("dark-mode", "overview + communication captured")

    # ---------- Mobile 390 - light ----------
    set_theme(page, "light")
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(500)
    overflow = overflow_390(page)
    results["overflow"]["communication-390"] = overflow
    shot(page, "09-mobile-communication")
    if not overflow:
        step_ok("mobile-390", "no horizontal overflow on Communication tab")
    else:
        step_fail("mobile-390", "horizontal overflow detected")

    ctx.close()

    # ---------- Mobile 390 - fresh context (tabs strip usability) ----------
    ctx_m = browser.new_context(viewport={"width": 390, "height": 844})
    page_m = ctx_m.new_page()
    page_m.on("console", track_console)
    ensure_login(page_m)
    nav(page_m, "/integrations", settle=1800)
    page_m.wait_for_timeout(600)
    unblock(page_m)
    page_m.locator('[role="tab"]', has_text="Communication").first.click()
    page_m.wait_for_timeout(900)
    overflow_m = overflow_390(page_m)
    results["overflow"]["overview-to-communication-390"] = overflow_m
    shot(page_m, "10-mobile-communication-flow")
    if not overflow_m:
        step_ok("mobile-flow-390", "tab navigation usable at 390px")
    else:
        step_fail("mobile-flow-390", "overflow in mobile flow")

    ctx_m.close()
    browser.close()

results["console"] = console_messages[:40]
(OUT / "summary.json").write_text(json.dumps(results, indent=2))
print(json.dumps({"steps_ok": sum(1 for s in results["steps"] if s.startswith("OK")),
                  "steps_fail": sum(1 for s in results["steps"] if s.startswith("FAIL")),
                  "console": len(console_messages),
                  "overflow": results["overflow"]}, indent=2))
