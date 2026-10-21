"""Audit interactions : drawers, notifications, coach, session chart, analytics."""
import json
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
R = {}

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text[:150]) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)[:150]))

    def go(path, wait=2000):
        page.goto(BASE + path, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(wait)

    # 1. Trades : clic sur une ligne -> drawer/dialog
    go("/trades", 2500)
    try:
        rows = page.locator('table tbody tr')
        count = rows.count()
        rows.first.click(timeout=5000)
        page.wait_for_timeout(900)
        dlg = page.locator('[role="dialog"], [data-slot="sheet-content"], [data-state="open"]').first
        R["trades_row_opens_detail"] = {"rows": count, "dialog_visible": dlg.is_visible()}
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
    except Exception as e:
        R["trades_row_opens_detail"] = {"error": str(e)[:150]}

    # 2. Notifications (cloche topbar)
    go("/", 1800)
    try:
        bell = page.locator('header button[aria-label*="otification"], header [data-testid*="notification"]').first
        bell.click(timeout=5000)
        page.wait_for_timeout(800)
        R["notifications_panel"] = {"opens": page.locator('[role="dialog"], [data-state="open"], [data-slot="popover-content"]').first.is_visible()}
        page.keyboard.press("Escape")
    except Exception as e:
        R["notifications_panel"] = {"error": str(e)[:150]}

    # 3. Dashboard best/worst -> drawer trade
    try:
        cards = page.locator('main table tbody tr')
        n = cards.count()
        clicked = False
        if n:
            cards.first.click(timeout=4000)
            page.wait_for_timeout(800)
            clicked = page.locator('[role="dialog"], [data-state="open"]').first.is_visible()
        R["dashboard_trade_click"] = {"rows": n, "opens_drawer": clicked}
        page.keyboard.press("Escape")
    except Exception as e:
        R["dashboard_trade_click"] = {"error": str(e)[:150]}

    # 4. Session live : chart ECharts + feed badge
    go("/session", 4500)
    try:
        canvas = page.locator('canvas').count()
        R["session_chart"] = {"canvas_count": canvas}
        badges = page.locator('text=/SIM|LIVE|STALE|OFFLINE|reconnecting/i').all_inner_texts()
        R["session_feed_badges"] = [b.strip()[:20] for b in badges[:5]]
        page.screenshot(path="/home/z/my-project/apps/web/scripts/shots/t48-audit/session-live-state.png")
    except Exception as e:
        R["session_chart"] = {"error": str(e)[:150]}

    # 5. Coach : envoi d'un message
    go("/coach", 2000)
    try:
        tb = page.locator('textarea, input[placeholder*="sk" i], input[type="text"]').last
        tb.fill("How many trades did I take this week?")
        tb.press("Enter")
        page.wait_for_timeout(20000)
        body = page.locator("main").inner_text()
        R["coach_reply"] = {"has_response": len(body) > 400,
                            "excerpt": body[-500:][:400]}
        page.screenshot(path="/home/z/my-project/apps/web/scripts/shots/t48-audit/coach-reply.png")
    except Exception as e:
        R["coach_reply"] = {"error": str(e)[:150]}

    # 6. Analytics : etat actuel
    go("/analytics", 1800)
    R["analytics_state"] = {"text": page.locator("main").inner_text()[:220]}

    # 7. Journal + discipline + goals + playbook : presence de contenu
    for name, path in [("journal", "/journal"), ("discipline", "/discipline"),
                       ("goals", "/goals"), ("playbook", "/playbook"),
                       ("calendar", "/calendar"), ("settings", "/settings")]:
        go(path, 1800)
        txt = page.locator("main").inner_text().strip()
        R[f"{name}_content_chars"] = len(txt)
        R[f"{name}_coming_soon"] = "coming soon" in txt.lower()

    ctx.close(); browser.close()

R["console_errors_during_interactions"] = errors[:15]
R["console_errors_count"] = len(errors)
out = "/home/z/my-project/scripts/audit_interactions.json"
open(out, "w").write(json.dumps(R, indent=2, ensure_ascii=False))
print(json.dumps(R, indent=2, ensure_ascii=False))
