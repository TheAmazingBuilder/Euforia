"""Diagnostic ciblé : URLs 404/400, data-theme, élément overflow mobile trades."""
import json
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
APP_PAGES = [("dashboard", "/"), ("session", "/session"), ("playbook", "/playbook"),
             ("analytics", "/analytics"), ("calendar", "/calendar"), ("trades", "/trades"),
             ("journal", "/journal"), ("discipline", "/discipline"), ("coach", "/coach"),
             ("goals", "/goals"), ("settings", "/settings"), ("profile", "/profile")]

bad = []          # (page, status, url)
theme_log = []

with sync_playwright() as p:
    browser = p.chromium.launch()

    # --- Desktop : collecte des réponses >=400 + data-theme ---
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("response", lambda r: bad.append((r.url, r.status)) if r.status >= 400 else None)

    for name, path in APP_PAGES:
        page.goto(BASE + path, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(1800)
        theme_log.append((name, page.evaluate(
            "() => document.documentElement.getAttribute('data-theme')")))

    # toggle theme -> data-theme attendu 'light'
    page.goto(BASE + "/", wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(1500)
    before = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    page.locator('[data-testid="theme-toggle-button"]').click()
    page.wait_for_timeout(1200)
    after = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    # dropdown: 3e option light existe?
    page.locator('[aria-label="All themes"]').click()
    page.wait_for_timeout(600)
    options = page.locator('[role="menuitem"]').all_inner_texts()
    page.keyboard.press("Escape")
    # toggle retour
    page.locator('[data-testid="theme-toggle-button"]').click()
    page.wait_for_timeout(1000)
    restored = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    theme = {"before": before, "after_toggle": after, "restored": restored,
             "menu_options": options}
    ctx.close()

    # --- Mobile 390 : qui déborde sur /trades ? ---
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    mp = mctx.new_page()
    mp.goto(BASE + "/trades", wait_until="domcontentloaded", timeout=45000)
    mp.wait_for_timeout(2000)
    wide = mp.evaluate("""() => {
      const out = [];
      document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > 400) {
          out.push({tag: el.tagName, cls: String(el.className).slice(0,90),
                    w: Math.round(r.width), right: Math.round(r.right)});
        }
      });
      return out.sort((a,b) => b.w - a.w).slice(0, 12);
    }""")
    sw_iw = mp.evaluate("() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth})")
    mctx.close()
    browser.close()

agg = {}
for url, st in bad:
    agg.setdefault(f"{st} {url.split('?')[0]}", 0)
    agg[f"{st} {url.split('?')[0]}"] += 1

print("=== REPONSES >=400 (par endpoint) ===")
for k, v in sorted(agg.items(), key=lambda x: -x[1]):
    print(f"{v:3d}x  {k}")
print()
print("=== DATA-THEME ===")
for name, th in theme_log:
    print(f"{name:<12} data-theme={th}")
print(json.dumps(theme, ensure_ascii=False, indent=2))
print()
print(f"=== MOBILE /trades : sw={sw_iw['sw']} iw={sw_iw['iw']} - éléments larges ===")
for w in wide:
    print(f"w={w['w']:>5} right={w['right']:>5}  <{w['tag']}> {w['cls']}")
