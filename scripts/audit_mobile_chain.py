"""Mobile /trades : chaine d'ancetres de la table pour trouver qui exp le layout."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    page = ctx.new_page()
    page.goto(BASE + "/trades", wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(2500)
    chain = page.evaluate("""() => {
      const t = document.querySelector('[data-testid="trades-table"]');
      if (!t) return ['no trades-table found'];
      const out = [];
      let el = t;
      let i = 0;
      while (el && i < 14) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        out.push(`${el.tagName}.${String(el.className).slice(0,70)} w=${Math.round(r.width)} ` +
                 `ovx=${cs.overflowX} disp=${cs.display} minw=${cs.minWidth}`);
        el = el.parentElement; i++;
      }
      return out;
    }""")
    for line in chain:
        print(line)
    ctx.close(); browser.close()
