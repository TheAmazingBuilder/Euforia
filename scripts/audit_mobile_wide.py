"""Mobile /trades : sw/iw + elements qui etendent vraiment le document."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    page = ctx.new_page()
    page.goto(BASE + "/trades", wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(2500)
    res = page.evaluate("""() => {
      const d = document.documentElement;
      const out = {sw: d.scrollWidth, iw: window.innerWidth,
                   bw: document.body.scrollWidth, vw: visualViewport.width};
      const wide = [];
      document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right > 392 && el.tagName !== 'TABLE' && el.tagName !== 'TBODY' &&
            el.tagName !== 'THEAD' && el.tagName !== 'TR' && el.tagName !== 'TD' &&
            el.tagName !== 'TH' && el.tagName !== 'COL') {
          // nearest scrollable ancestor
          let a = el.parentElement, scrollable = 'document';
          while (a) {
            const s = getComputedStyle(a);
            if (s.overflowX === 'auto' || s.overflowX === 'scroll') { scrollable = a.tagName + '.' + String(a.className).slice(0,40); break; }
            a = a.parentElement;
          }
          wide.push({tag: el.tagName, cls: String(el.className).slice(0,80),
                     right: Math.round(r.right), w: Math.round(r.width),
                     scrollParent: scrollable,
                     fixed: getComputedStyle(el).position});
        }
      });
      out.wide = wide.slice(0, 15);
      return out;
    }""")
    import json
    print(json.dumps(res, indent=1, ensure_ascii=False))
    ctx.close(); browser.close()
