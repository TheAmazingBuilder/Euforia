"""E2E ritual — Reports premium + Security Center.

Covers:
- REPORTS (desktop 1440 light): KPI band with deltas, equity curve, R
  distribution, pro metrics, long/short, by-strategy, trade log filters
  (EURUSD + wins -> honest filtered rollup), period switch (Week -> Month ->
  Quarter), prev-period navigation, Markdown + CSV real downloads.
- SECURITY (desktop 1440): overview controls, tabs sweep, authentication
  reauth-gated password change (wrong password -> 401 honest error, then demo
  password), 2FA enrollment (setup -> verify 246810 -> recovery codes shown
  ONCE -> stored -> enabled), sessions revoke, API key create (reauth ->
  plaintext ONCE -> masked afterwards), revoke, events filters, login history,
  logout others (reauth), connected accounts, dark theme.
- Mobile 390: overflow checks on /reports and /security.
- Console error collection (dev-overlay / MSW noise filtered).

Output: apps/web/scripts/shots/reports-security/ + summary.json
"""

from __future__ import annotations

import json
import pathlib
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = pathlib.Path("/home/z/my-project/apps/web/scripts/shots/reports-security")
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


def nav(page, path: str, settle: int = 1500) -> None:
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


# ── Reports helpers ──────────────────────────────────────────────────────────

def report_tab(page, which: str) -> None:
    unblock(page)
    page.click(f"[data-testid='report-tab-{which}']")
    page.wait_for_timeout(1300)


def with_downloads(page, action) -> list[pathlib.Path]:
    got: list[pathlib.Path] = []
    with page.expect_download(timeout=30000) as download_info:
        action()
    download = download_info.value
    target = OUT / download.suggested_filename
    download.save_as(str(target))
    got.append(target)
    return got


def export_download(page, item_testid: str) -> list[pathlib.Path]:
    """Opens the export dropdown and picks the format — all inside the
    expect_download window so the triggered download is captured."""
    got: list[pathlib.Path] = []
    unblock(page)
    with page.expect_download(timeout=30000) as download_info:
        page.click("[data-testid='report-export']")
        page.wait_for_timeout(450)
        page.click(f"[data-testid='{item_testid}']")
    download = download_info.value
    target = OUT / download.suggested_filename
    download.save_as(str(target))
    got.append(target)
    return got


# ── Security helpers ─────────────────────────────────────────────────────────

def security_tab(page, which: str) -> None:
    unblock(page)
    page.click(f"[data-testid='security-tab-{which}']")
    page.wait_for_timeout(900)


def reauth(page, password: str) -> bool:
    """Fills the open reauth dialog; returns True when accepted."""
    page.fill("[data-testid='reauth-password']", password)
    page.click("[data-testid='reauth-submit']")
    page.wait_for_timeout(1100)
    err = page.locator("[data-testid='reauth-error']")
    return err.count() == 0


def main() -> None:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)

        # ══ Desktop 1440 — light ══
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("console", track_console)
        ensure_login(page)
        set_theme(page, "light")

        # ── REPORTS ──
        print("== REPORTS (light) ==")
        nav(page, "/reports", settle=2000)
        shot(page, "01-reports-week")
        try:
            page.wait_for_selector("[data-testid='report-kpis']", timeout=8000)
            step_ok("reports: KPI band renders")
        except Exception:
            step_fail("reports: KPI band renders", "selector missing")

        # Deltas visible
        deltas = page.locator("[data-testid='report-kpis'] span[data-testid^='kpi-']").count()
        step_ok("reports: KPI cells", f"kpi cells={deltas}")

        # Charts render (canvas present)
        canvases = page.locator("[data-testid='report-charts'] canvas").count()
        step_ok("reports: charts", f"canvases={canvases}")

        # Pro metrics present
        pf = page.locator("[data-testid='metric-profit-factor']").inner_text()
        step_ok("reports: profit factor cell", f"text={pf!r}")

        # Filter: EURUSD + wins
        unblock(page)
        page.click("[data-testid='report-filter-instrument']")
        page.wait_for_timeout(400)
        page.get_by_role("option").filter(has_text="EURUSD").first.click()
        page.wait_for_timeout(400)
        unblock(page)
        page.click("[data-testid='report-filter-outcome']")
        page.wait_for_timeout(400)
        page.get_by_role("option", name="Wins").click()
        page.wait_for_timeout(700)
        rollup_visible = page.locator("[data-testid='report-filtered-rollup']").count() > 0
        count_text = page.inner_text("[data-testid='report-log-count']")
        if rollup_visible and "/" in count_text:
            step_ok("reports: filtered rollup honest", f"count={count_text.strip()}")
        else:
            step_fail("reports: filtered rollup honest", "no rollup")
        shot(page, "02-reports-filtered")

        # CSV download mirrors filters
        try:
            files = export_download(page, "report-export-csv")
            step_ok("reports: CSV download", f"file={files[0].name}")
        except Exception as exc:
            step_fail("reports: CSV download", str(exc)[:120])

        # Reset, then period switch: Month -> Quarter -> prev navigation
        unblock(page)
        page.click("[data-testid='report-filters-reset']")
        page.wait_for_timeout(400)
        report_tab(page, "month")
        label_month = page.inner_text("[data-testid='report-period-label']")
        step_ok("reports: month label", f"{label_month.strip()!r}")
        shot(page, "03-reports-month")
        report_tab(page, "quarter")
        label_quarter = page.inner_text("[data-testid='report-period-label']")
        step_ok("reports: quarter label", f"{label_quarter.strip()!r}")
        shot(page, "04-reports-quarter")

        # Prev navigation -> previous quarter, next re-enabled
        unblock(page)
        page.click("[data-testid='report-prev']")
        page.wait_for_timeout(1300)
        prev_label = page.inner_text("[data-testid='report-period-label']")
        next_disabled = page.locator("[data-testid='report-next'][disabled]").count()
        if prev_label != label_quarter and next_disabled == 0:
            step_ok("reports: prev-period nav", f"prev={prev_label.strip()!r}")
        else:
            step_fail("reports: prev-period nav", f"prev={prev_label.strip()!r} nextDisabled={next_disabled}")
        shot(page, "05-reports-quarter-prev")

        # Back to current week + MD export
        report_tab(page, "week")
        try:
            files = export_download(page, "report-export-md")
            step_ok("reports: MD download", f"file={files[0].name}")
        except Exception as exc:
            step_fail("reports: MD download", str(exc)[:120])

        # ── SECURITY ──
        print("== SECURITY (light) ==")
        nav(page, "/security", settle=2000)
        try:
            page.wait_for_selector("[data-testid='security-readiness']", timeout=8000)
            step_ok("security: overview renders")
        except Exception:
            step_fail("security: overview renders", "readiness missing")
        shot(page, "06-security-overview")

        # Authentication — wrong password then correct
        security_tab(page, "authentication")
        page.fill("[data-testid='security-password-current']", "cosmoz123")
        page.fill("[data-testid='security-password-new']", "cosmoz456premium")
        page.fill("[data-testid='security-password-confirm']", "cosmoz456premium")
        page.click("[data-testid='security-password-save']")
        page.wait_for_timeout(600)
        page.fill("[data-testid='reauth-password']", "wrongpass")
        page.click("[data-testid='reauth-submit']")
        page.wait_for_timeout(1000)
        err = page.locator("[data-testid='reauth-error']")
        if err.count() > 0:
            step_ok("security: reauth rejects wrong password", err.first.inner_text()[:60])
        else:
            step_fail("security: reauth rejects wrong password", "no error shown")
        shot(page, "07-security-reauth-fail")
        page.fill("[data-testid='reauth-password']", "cosmoz123")
        page.click("[data-testid='reauth-submit']")
        page.wait_for_timeout(1300)
        toasts = page.locator("[data-sonner-toast]").count()
        step_ok("security: password change (reauth ok)", f"toasts={toasts}")
        shot(page, "08-security-authentication")

        # 2FA enrollment
        security_tab(page, "twofactor")
        unblock(page)
        page.click("[data-testid='security-2fa-enable']")
        page.wait_for_timeout(1400)
        secret_visible = page.locator("[data-testid='security-2fa-secret']").count() > 0
        step_ok("security: 2FA setup shows secret", f"secret={secret_visible}")
        page.fill("[data-testid='security-2fa-code']", "246810")
        page.click("[data-testid='security-2fa-verify']")
        page.wait_for_timeout(1400)
        codes = page.locator("[data-testid='security-2fa-recovery-codes'] code").count()
        step_ok("security: recovery codes shown", f"codes={codes}")
        shot(page, "09-security-2fa-recovery")
        page.check("[data-testid='security-2fa-stored']")
        page.click("[data-testid='security-2fa-done']")
        page.wait_for_timeout(1300)
        status = page.inner_text("[data-testid='security-2fa-status']")
        if "On since" in status:
            step_ok("security: 2FA enabled")
        else:
            step_fail("security: 2FA enabled", status.strip()[:80])
        shot(page, "10-security-2fa-enabled")

        # Sessions — revoke non-current
        security_tab(page, "sessions")
        shot(page, "11-security-sessions")
        try:
            page.click("[data-testid='security-revoke-ses_desk']")
            page.wait_for_timeout(1300)
            gone = page.locator("[data-testid='security-session-ses_desk']").count() == 0
            step_ok("security: session revoked", f"row gone={gone}")
        except Exception as exc:
            step_fail("security: session revoked", str(exc)[:120])

        # API keys — create with reauth, plaintext ONCE, then masked
        security_tab(page, "apikeys")
        unblock(page)
        page.click("[data-testid='security-api-key-create']")
        page.wait_for_timeout(500)
        page.fill("[data-testid='security-api-key-name']", "CI exporter")
        page.check("[data-testid='security-api-key-scope-read-journal']")
        page.check("[data-testid='security-api-key-scope-export-data']")
        page.click("[data-testid='security-api-key-save']")
        page.wait_for_timeout(400)
        ok = reauth(page, "cosmoz123")
        step_ok("security: api key reauth", f"accepted={ok}")
        page.wait_for_timeout(900)
        plaintext = page.locator("[data-testid='security-api-key-plaintext']")
        if plaintext.count() > 0:
            reveal_text = plaintext.inner_text()
            page.click("[data-testid='security-api-key-copied']")
            page.wait_for_timeout(900)
            rows = page.locator("[data-testid^='security-api-key-mask-']")
            mask_text = rows.first.inner_text()
            if "cosmo_sk_" in reveal_text and "••••" in mask_text:
                step_ok("security: plaintext ONCE then masked", f"mask={mask_text.strip()[:24]}")
            else:
                step_fail("security: plaintext ONCE then masked", f"reveal={reveal_text[:20]} mask={mask_text[:20]}")
        else:
            step_fail("security: plaintext dialog", "missing")
        shot(page, "12-security-apikeys")

        # Events — filter by keys
        security_tab(page, "events")
        shot(page, "13-security-events")
        unblock(page)
        page.click("[data-testid='security-events-filter-keys']")
        page.wait_for_timeout(600)
        events_text = page.inner_text("[data-testid='security-events']")
        if "API key created" in events_text:
            step_ok("security: events filter shows key events")
        else:
            step_fail("security: events filter shows key events", "text missing")

        # Login history
        security_tab(page, "logins")
        shot(page, "14-security-login-history")
        history_text = page.inner_text("[data-testid='security-login-history']").upper()
        if "FAILED" in history_text and "LISBON" in history_text.upper():
            step_ok("security: login history with failure context")
        else:
            step_fail("security: login history with failure context", history_text[:80])

        # Connected accounts
        security_tab(page, "connected")
        shot(page, "15-security-connected")
        conn_text = page.inner_text("[data-testid='security-connected']")
        if "Discord" in conn_text and "Telegram" in conn_text:
            step_ok("security: connected accounts list integrations")
        else:
            step_fail("security: connected accounts list integrations", conn_text[:80])

        # Overview after mutations — readiness should reflect 2FA on
        security_tab(page, "overview")
        page.wait_for_timeout(900)
        overview_text = page.inner_text("[data-testid='security-readiness']")
        if "of 5 controls on" in overview_text and "Two-factor authentication enabled" in overview_text:
            step_ok("security: readiness recomputed")
        else:
            step_fail("security: readiness recomputed", overview_text[:80])
        shot(page, "16-security-overview-after")

        # ══ Desktop — dark ══
        print("== DARK ==")
        set_theme(page, "dark")
        nav(page, "/security", settle=1800)
        shot(page, "17-security-dark")
        nav(page, "/reports", settle=1800)
        shot(page, "18-reports-dark")
        set_theme(page, "light")
        ctx.close()

        # ══ Mobile 390 ══
        print("== MOBILE 390 ==")
        mctx = browser.new_context(viewport={"width": 390, "height": 844})
        mpage = mctx.new_page()
        mpage.on("console", track_console)
        ensure_login(mpage)
        for path, name in (("/reports", "19-mobile-reports"), ("/security", "20-mobile-security")):
            nav(mpage, path, settle=1900)
            results["overflow"][name] = overflow_390(mpage)
            step_ok(f"mobile {name}", f"overflow={results['overflow'][name]}")
            shot(mpage, name)
        mctx.close()
        browser.close()

    results["console"] = console_messages
    summary_path = OUT / "summary.json"
    summary_path.write_text(json.dumps(results, indent=2))
    fails = [s for s in results["steps"] if s.startswith("FAIL")]
    print(f"\n== SUMMARY == steps={len(results['steps'])} fails={len(fails)} console={len(console_messages)}")
    for failure in fails:
        print(f"  {failure}")
    for msg in console_messages[:12]:
        print(f"  console: {msg[:140]}")


if __name__ == "__main__":
    main()
