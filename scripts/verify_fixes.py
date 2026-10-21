"""Verif fixes : console /session propre (plus de 400 candles, 404 socket)."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errs, bad = [], []
    page.on("console", lambda m: errs.append(f"{m.type}: {m.text[:140]}") if m.type in ("error", "warning") else None)
    page.on("response", lambda r: bad.append(f"{r.status} {r.url[:120]}") if r.status >= 400 else None)
    page.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)[:140]))

    page.goto(BASE + "/session", wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(12000)  # laisse le temps au socket + polling + candles
    ctx.close(); browser.close()

print("=== Console errors/warnings ===")
for e in errs[:20]:
    print(" ", e)
print("total:", len(errs))
print("=== Reponses >= 400 ===")
for b in bad[:20]:
    print(" ", b)
print("total:", len(bad))
