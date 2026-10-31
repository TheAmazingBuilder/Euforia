"""E2E ritual - v3 features wave (reports filters+exports, risk ops, trade review, wide trade detail).

Captures:
- Desktop 1440x900, light + dark, for /reports /risk /journal /trades
- Interactive proofs: report filter -> filtered rollup, export dropdown,
  trade detail dialog width (>=1300px = near full width), journal row -> same dialog
- Mobile 390x844: bottom-sheet trade detail + overflow checks
- Console error collection (noise filtered: React DevTools, MSW, Autofocus, dev-overlay)

Output: apps/web/scripts/shots/v3-features/ + summary.json
"""

from __future__ import annotations

import json
import pathlib

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = pathlib.Path("/home/z/my-project/apps/web/scripts/shots/v3-features")
OUT.mkdir(parents=True, exist_ok=True)

CONSOLE_NOISE = (
    "React DevTools",
    "[MSW]",
    "Autofocus",
    "Download the React DevTools",
)

console_messages: list[str] = []
results: dict = {"steps": [], "console": [], "overflow": {}}


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
    text = page.evaluate(
        "() => { const p = document.querySelector('nextjs-portal'); return p ? (p.shadowRoot ? p.shadowRoot.textContent : p.textContent) : null }"
    )
    if text and text.strip():
        console_messages.append(f"[nextjs-portal] {text.strip()[:600]}")
        print(f"  !! dev-overlay: {text.strip()[:200]}")
    page.evaluate("() => { const p = document.querySelector('nextjs-portal'); if (p) p.remove() }")


def nav(page, path: str, settle: int = 1100) -> None:
    page.goto(BASE + path, wait_until="domcontentloaded")
    page.wait_for_timeout(settle)
    dismiss_dev_overlay(page)


def unblock(page) -> None:
    """Re-dismiss the dev overlay right before interacting (it remounts)."""
    dismiss_dev_overlay(page)
    page.wait_for_timeout(120)


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
    results["steps"].append(name)


def step_ok(label: str, detail: str = "") -> None:
    results["steps"].append(f"OK {label} {detail}".strip())
    print(f"  OK: {label} {detail}")


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- Desktop 1440 - light ----------
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    page = ctx.new_page()
    page.on("console", track_console)

    nav(page, "/reports", settle=1600)
    set_theme(page, "light")
    page.wait_for_timeout(600)
    shot(page, "desktop-light-reports")

    # Filter: pick the first non-"All instruments" option -> rollup appears
    try:
        unblock(page)
        page.get_by_test_id("report-filter-instrument").click()
        page.wait_for_timeout(400)
        unblock(page)
        options = page.locator('[role="option"]')
        count = options.count()
        picked = None
        for i in range(count):
            opt = options.nth(i)
            label = (opt.text_content() or "").strip()
            if label and label.lower() not in ("all instruments", "all directions", "all outcomes", "all strategies"):
                picked = label
                opt.click()
                break
        page.wait_for_timeout(600)
        if picked and page.get_by_test_id("report-filtered-rollup").is_visible():
            step_ok("report-filter", f"instrument={picked} -> filtered rollup visible")
            shot(page, "desktop-light-reports-filtered")
        else:
            results["steps"].append(f"WARN report-filter - picked={picked} rollup_visible={page.get_by_test_id('report-filtered-rollup').is_visible()}")
        unblock(page)
        page.get_by_test_id("report-filters-reset").click()
        page.wait_for_timeout(300)
    except Exception as exc:  # noqa: BLE001
        results["steps"].append(f"FAIL report-filter: {exc}")
        print(f"  FAIL report-filter: {exc}")
        page.keyboard.press("Escape")

    # Export dropdown open (visual proof) + CSV download proof
    try:
        unblock(page)
        page.get_by_test_id("report-export").click()
        page.wait_for_timeout(300)
        shot(page, "desktop-light-reports-export-menu", full=False)
        with page.expect_download(timeout=45000) as dl_info:
            page.get_by_test_id("report-export-csv").click()
        download = dl_info.value
        results["steps"].append(f"OK report-export-csv file={download.suggested_filename}")
        print(f"  OK: csv download -> {download.suggested_filename}")
    except Exception as exc:  # noqa: BLE001
        results["steps"].append(f"FAIL report-export: {exc}")
        print(f"  FAIL report-export: {exc}")
        page.keyboard.press("Escape")

    # Risk Command Center
    nav(page, "/risk", settle=1600)
    shot(page, "desktop-light-risk")
    for testid in ("risk-budget", "risk-open", "risk-recovery", "risk-sizer", "risk-exposure"):
        visible = page.get_by_test_id(testid).is_visible()
        results["steps"].append(f"{'OK' if visible else 'MISS'} risk panel {testid}")

    # Trade Review
    nav(page, "/journal", settle=1600)
    shot(page, "desktop-light-trade-review")
    for testid in ("review-coverage", "review-grade-mix", "review-stats", "review-pending", "review-ledger"):
        visible = page.get_by_test_id(testid).is_visible()
        results["steps"].append(f"{'OK' if visible else 'MISS'} review section {testid}")

    # Click a reviewed row -> near-full-width dialog
    nav(page, "/trades", settle=1600)
    shot(page, "desktop-light-trades")
    try:
        unblock(page)
        page.get_by_test_id("trades-row").first.click()
        page.wait_for_selector('[data-testid="trade-detail-dialog"]', timeout=6000)
        box = page.get_by_test_id("trade-detail-dialog").bounding_box()
        width = int(box["width"]) if box else 0
        step_ok("trade-detail-dialog", f"width={width}px")
        results["dialog_width"] = width
        shot(page, "desktop-light-trade-detail-dialog", full=False)
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
    except Exception as exc:  # noqa: BLE001
        results["steps"].append(f"FAIL trade-detail-dialog: {exc}")
        print(f"  FAIL trade-detail-dialog: {exc}")

    # ---------- Desktop 1440 - dark ----------
    set_theme(page, "dark-blue")
    nav(page, "/reports")
    page.wait_for_timeout(500)
    shot(page, "desktop-dark-reports")
    nav(page, "/risk")
    page.wait_for_timeout(500)
    shot(page, "desktop-dark-risk")
    nav(page, "/journal")
    page.wait_for_timeout(500)
    shot(page, "desktop-dark-trade-review")
    # Journal row -> same wide dialog (dark)
    try:
        unblock(page)
        page.get_by_test_id("review-ledger-row").first.click()
        page.wait_for_selector('[data-testid="trade-detail-dialog"]', timeout=6000)
        page.wait_for_timeout(400)
        shot(page, "desktop-dark-trade-review-dialog", full=False)
        page.keyboard.press("Escape")
    except Exception as exc:  # noqa: BLE001
        results["steps"].append(f"WARN review-ledger-row click: {exc}")
    nav(page, "/trades")
    page.wait_for_timeout(500)
    shot(page, "desktop-dark-trades")
    ctx.close()

    # ---------- Mobile 390 ----------
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, accept_downloads=True)
    mpage = mctx.new_page()
    mpage.on("console", track_console)

    for route in ("/reports", "/risk", "/journal", "/trades"):
        nav(mpage, route, settle=1400)
        ovf = overflow_390(mpage)
        results["overflow"][route] = ovf
        shot(mpage, f"mobile-light-{route.strip('/')}")
        print(f"  overflow {route}: {ovf}")

    # Mobile trade detail = bottom sheet
    try:
        unblock(mpage)
        mpage.get_by_test_id("trades-row").first.click()
        mpage.wait_for_selector('[data-testid="trade-detail-drawer"]', timeout=6000)
        mpage.wait_for_timeout(400)
        shot(mpage, "mobile-light-trade-detail-sheet", full=False)
        mpage.keyboard.press("Escape")
    except Exception as exc:  # noqa: BLE001
        results["steps"].append(f"FAIL mobile sheet: {exc}")
        print(f"  FAIL mobile sheet: {exc}")

    mctx.close()
    browser.close()

results["console"] = console_messages
(OUT / "summary.json").write_text(json.dumps(results, indent=2))
print("\n==== SUMMARY ====")
print(f"console issues: {len(console_messages)}")
for line in console_messages[:8]:
    print(f"  {line[:180]}")
print(f"overflow: {results['overflow']}")
print(f"steps: {len(results['steps'])}")
