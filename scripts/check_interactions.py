"""Interaction integrity — click through every rail item (desktop + mobile sheet),
check the command palette contents, and verify the sheet closes on navigate.
"""

from __future__ import annotations

import json
import pathlib

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = pathlib.Path("/home/z/my-project/apps/web/scripts/shots/sidebar-v2")
CONSOLE_NOISE = ("React DevTools", "[MSW]", "Autofocus", "Download the React DevTools")
issues: list[str] = []


def track(msg) -> None:
    text = msg.text or ""
    if any(n in text for n in CONSOLE_NOISE):
        return
    if msg.type == "error":
        issues.append(f"[console] {text[:200]}")


def dismiss(page) -> None:
    page.evaluate("() => { const p = document.querySelector('nextjs-portal'); if (p) p.remove() }")


def nav(page, path: str, settle: int = 1000) -> None:
    page.goto(BASE + path, wait_until="domcontentloaded")
    page.wait_for_timeout(settle)
    dismiss(page)


RAIL = {
    "/": "Dashboard",
    "/session": "Session Live",
    "/trades": "Trades",
    "/journal": "Trade Review",
    "/analytics": "Analytics",
    "/playbook": "Playbook",
    "/calendar": "Calendar",
    "/reports": "Reports",
    "/risk": "Risk",
    "/academy": "Academy",
    "/discipline": "Discipline",
    "/integrations": "Integrations",
    "/settings": "Settings",
}

result = {"desktop_clicks": {}, "mobile_sheet": {}, "palette": {}}

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- Desktop: click every rail link from Dashboard ----------
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("console", track)
    nav(page, "/", settle=1500)

    for href, label in RAIL.items():
        link = page.locator(f'nav[aria-label="Main navigation"] a[aria-label="Cosmoz — Dashboard"], nav[aria-label="Main navigation"] a[title="{label}"]').first
        try:
            link.click(timeout=4000)
            page.wait_for_timeout(700)
            dismiss(page)
            ok = page.url.rstrip("/") == (BASE + href).rstrip("/") if href != "/" else page.url.rstrip("/") == BASE
            result["desktop_clicks"][href] = {"ok": ok, "landed": page.url.replace(BASE, "") or "/"}
            if not ok:
                issues.append(f"[rail] click '{label}' landed on {page.url} (expected {href})")
            # back to dashboard for the next iteration (unless already there)
            if href != "/":
                nav(page, "/", settle=600)
        except Exception as exc:  # noqa: BLE001
            result["desktop_clicks"][href] = {"ok": False, "error": str(exc)[:150]}
            issues.append(f"[rail] click '{label}' failed: {str(exc)[:120]}")
            nav(page, "/", settle=600)

    # ---------- Command palette (Ctrl+K) ----------
    nav(page, "/", settle=800)
    page.keyboard.press("Control+k")
    page.wait_for_timeout(700)
    body = page.inner_text("body")
    missing = [label for label in ("Session Live", "Trade Review", "Calendar", "Integrations") if label not in body]
    stale = [label for label in ("Coach", "Goals") if label in body]
    result["palette"] = {"missing": missing, "stale_entries": stale}
    if missing:
        issues.append(f"[palette] missing entries: {missing}")
    if stale:
        issues.append(f"[palette] stale entries (should be removed): {stale}")
    page.keyboard.press("Escape")
    ctx.close()

    # ---------- Mobile: sheet opens, link navigates AND closes the sheet ----------
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    mpage = mctx.new_page()
    mpage.on("console", track)
    nav(mpage, "/", settle=1300)
    mpage.get_by_label("Open navigation menu").click()
    mpage.wait_for_timeout(600)
    sheet_link = mpage.locator('nav[aria-label="Main navigation"]:visible a[title="Trades"]').first
    sheet_link.click()
    mpage.wait_for_timeout(900)
    dismiss(mpage)
    url_ok = "/trades" in mpage.url
    sheet_gone = mpage.locator('[data-slot="sheet-content"], [role="dialog"]').count() == 0
    result["mobile_sheet"] = {"navigated": url_ok, "sheet_closed": sheet_gone, "landed": mpage.url.replace(BASE, "") or "/"}
    if not url_ok:
        issues.append(f"[mobile] sheet link did not navigate (url={mpage.url})")
    if not sheet_gone:
        issues.append("[mobile] sheet did not close after navigation")
    mctx.close()
    browser.close()

(OUT / "interactions.json").write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
print("---ISSUES---")
print("\n".join(issues) if issues else "NONE — all interactions healthy")
