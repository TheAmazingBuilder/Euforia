"""
Audit E2E complet — Cosmoz (Le Registre)
Phases:
  A. Desktop dark 1440x900 : 12 pages, console, overflow, screenshots
  B. Navigation sidebar par clics réels
  C. Toggle thème (app toggle) -> light, re-check
  D. Palette de commandes (Ctrl+K)
  E. Mobile 390x844 : pages clés, bottom-nav, overflow, screenshots
Sortie: JSON + tableau console. PNG -> apps/web/scripts/shots/t48-audit/
"""
import json
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = Path("/home/z/my-project/apps/web/scripts/shots/t48-audit")
SHOTS.mkdir(parents=True, exist_ok=True)

APP_PAGES = [
    ("dashboard", "/"),
    ("session", "/session"),
    ("playbook", "/playbook"),
    ("analytics", "/analytics"),
    ("calendar", "/calendar"),
    ("trades", "/trades"),
    ("journal", "/journal"),
    ("discipline", "/discipline"),
    ("coach", "/coach"),
    ("goals", "/goals"),
    ("settings", "/settings"),
    ("profile", "/profile"),
]

MOBILE_PAGES = ["dashboard", "trades", "playbook", "analytics", "session", "coach", "discipline"]

NOISE_PATTERNS = [
    re.compile(r"Download the React DevTools", re.I),
    re.compile(r"\[MSW\]", re.I),
    re.compile(r"Autofocus processing", re.I),
]


def noisy(msg: str) -> bool:
    return any(p.search(msg or "") for p in NOISE_PATTERNS)


class Collector:
    def __init__(self):
        self.console = []      # (page, type, text)
        self.pageerrors = []   # (page, text)
        self.reqfailed = []    # (page, url, failure)

    def attach(self, page, label):
        page.on("console", lambda m, l=label: self.console.append(
            (l, m.type, m.text)) if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e, l=label: self.pageerrors.append((l, str(e))))
        page.on("requestfailed", lambda r, l=label: self.reqfailed.append(
            (l, r.url, r.failure)))

    @staticmethod
    def check_overflow(page):
        return page.evaluate(
            "() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth})")


def settle(page, ms=2000):
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_timeout(ms)


def main():
    results = {"pages": [], "nav_clicks": [], "theme": {}, "palette": {},
               "mobile": [], "errors_summary": {}}
    col = Collector()

    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------- A. Desktop dark 1440x900 ----------
        ctx = browser.new_context(viewport={"width": 1440, "height": 900},
                                  color_scheme="dark")
        page = ctx.new_page()
        col.attach(page, "desktop")

        for name, path in APP_PAGES:
            entry = {"name": name, "path": path}
            try:
                page.goto(BASE + path, wait_until="domcontentloaded", timeout=45000)
                settle(page, 2200)
                ov = col.check_overflow(page)
                entry["scrollWidth"] = ov["sw"]
                entry["innerWidth"] = ov["iw"]
                entry["overflow"] = ov["sw"] > ov["iw"]
                entry["title"] = page.title()
                page.screenshot(path=str(SHOTS / f"desktop-dark-{name}.png"),
                                full_page=False)
                entry["ok"] = not entry["overflow"]
            except Exception as e:  # noqa: BLE001
                entry["ok"] = False
                entry["error"] = str(e)[:200]
            results["pages"].append(entry)

        # ---------- B. Sidebar click-through ----------
        for name, path in APP_PAGES[1:]:
            try:
                page.goto(BASE + "/", wait_until="domcontentloaded", timeout=45000)
                settle(page, 900)
                link = page.locator(f'a[href="{path}"]').first
                link.click(timeout=5000)
                page.wait_for_url(f"**{path}", timeout=10000)
                settle(page, 700)
                results["nav_clicks"].append(
                    {"target": path, "ok": True, "landed": page.url})
            except Exception as e:  # noqa: BLE001
                results["nav_clicks"].append(
                    {"target": path, "ok": False, "error": str(e)[:150]})

        # ---------- C. Theme toggle (app toggle) ----------
        try:
            page.goto(BASE + "/", wait_until="domcontentloaded", timeout=45000)
            settle(page, 2000)
            html_before = page.evaluate("() => document.documentElement.className")
            btn = page.locator('[data-testid="theme-toggle-button"]')
            btn.click(timeout=5000)
            settle(page, 1200)
            html_after = page.evaluate("() => document.documentElement.className")
            results["theme"] = {
                "before": html_before, "after": html_after,
                "changed": html_before != html_after,
            }
            page.screenshot(path=str(SHOTS / "desktop-light-dashboard.png"))
            # re-check overflow en light sur pages clés
            light_checks = []
            for name, path in [("dashboard", "/"), ("trades", "/trades"),
                               ("analytics", "/analytics"), ("session", "/session")]:
                page.goto(BASE + path, wait_until="domcontentloaded", timeout=45000)
                settle(page, 1800)
                ov = col.check_overflow(page)
                light_checks.append({"name": name, "overflow": ov["sw"] > ov["iw"],
                                     "sw": ov["sw"]})
                page.screenshot(path=str(SHOTS / f"desktop-light-{name}.png"))
            results["theme"]["light_checks"] = light_checks
            # retour dark-blue
            btn2 = page.locator('[data-testid="theme-toggle-button"]')
            btn2.click(timeout=5000)
            settle(page, 900)
            results["theme"]["restored"] = page.evaluate(
                "() => document.documentElement.className")
        except Exception as e:  # noqa: BLE001
            results["theme"] = {"error": str(e)[:200]}

        # ---------- D. Command palette Ctrl+K ----------
        try:
            page.goto(BASE + "/", wait_until="domcontentloaded", timeout=45000)
            settle(page, 1500)
            page.keyboard.press("ControlOrMeta+k")
            page.wait_for_timeout(700)
            visible = page.locator('[role="dialog"]').first.is_visible()
            results["palette"]["opens"] = bool(visible)
            page.keyboard.type("trades")
            page.wait_for_timeout(600)
            page.keyboard.press("Enter")
            page.wait_for_timeout(1200)
            results["palette"]["navigates_to"] = page.url
            results["palette"]["ok"] = "/trades" in page.url
            page.screenshot(path=str(SHOTS / "palette-navigated.png"))
        except Exception as e:  # noqa: BLE001
            results["palette"] = {"error": str(e)[:200]}

        ctx.close()

        # ---------- E. Mobile 390x844 ----------
        mctx = browser.new_context(viewport={"width": 390, "height": 844},
                                   color_scheme="dark", is_mobile=True,
                                   device_scale_factor=2)
        mpage = mctx.new_page()
        col.attach(mpage, "mobile")
        for name in MOBILE_PAGES:
            path = dict(APP_PAGES)[name]
            entry = {"name": name, "path": path}
            try:
                mpage.goto(BASE + path, wait_until="domcontentloaded", timeout=45000)
                settle(mpage, 2000)
                ov = col.check_overflow(mpage)
                entry["scrollWidth"] = ov["sw"]
                entry["innerWidth"] = ov["iw"]
                entry["overflow"] = ov["sw"] > ov["iw"]
                entry["ok"] = not entry["overflow"]
                mpage.screenshot(path=str(SHOTS / f"mobile-{name}.png"))
            except Exception as e:  # noqa: BLE001
                entry["ok"] = False
                entry["error"] = str(e)[:200]
            results["mobile"].append(entry)

        # bottom-nav click test (mobile)
        bn = []
        for path in ["/trades", "/playbook", "/analytics"]:
            try:
                mpage.goto(BASE + "/", wait_until="domcontentloaded", timeout=45000)
                settle(mpage, 900)
                mpage.locator(f'a[href="{path}"]').last.click(timeout=5000)
                mpage.wait_for_url(f"**{path}", timeout=10000)
                bn.append({"target": path, "ok": True})
            except Exception as e:  # noqa: BLE001
                bn.append({"target": path, "ok": False, "error": str(e)[:120]})
        results["mobile_bottom_nav"] = bn
        mctx.close()
        browser.close()

    # ---------- Synthèse erreurs ----------
    errs = [c for c in col.console if c[1] == "error" and not noisy(c[2])]
    warns = [c for c in col.console if c[1] == "warning" and not noisy(c[2])]
    results["errors_summary"] = {
        "console_errors": [{"page": l, "text": t[:300]} for l, _ty, t in errs[:30]],
        "console_errors_count": len(errs),
        "console_warnings": [{"page": l, "text": t[:200]} for l, _ty, t in warns[:20]],
        "console_warnings_count": len(warns),
        "pageerrors": [{"page": l, "text": t[:300]} for l, t in col.pageerrors[:20]],
        "pageerrors_count": len(col.pageerrors),
        "reqfailed": [{"page": l, "url": u, "failure": str(f)} for l, u, f in col.reqfailed[:20]],
        "reqfailed_count": len(col.reqfailed),
    }

    out = Path("/home/z/my-project/scripts/audit_results.json")
    out.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
