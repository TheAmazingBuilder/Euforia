"""Capture l'URL exacte des requetes 400/404 cote app (page /session et /)."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    hits = []
    def on_resp(r):
        if r.status >= 400:
            hits.append((r.status, r.url))
    page.on("response", on_resp)
    for path in ["/", "/session"]:
        page.goto(BASE + path, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(6000)  # laisse le temps aux retries socket/polling
    ctx.close(); browser.close()

for st, url in hits:
    print(st, url[:160])
print("total:", len(hits))
