/** debug-oryon-boot.js - why doesn't the sidebar link appear? */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
  });

  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(8_000);

  const info = await page.evaluate(() => {
    const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    const sidebar = document.querySelector("aside");
    return {
      title: document.title,
      url: location.href,
      linkCount: links.length,
      navLinks: links.filter((h) => h && h.startsWith("/")).slice(0, 30),
      sidebarText: sidebar ? sidebar.innerText.slice(0, 400) : "NO <aside>",
      bodySnippet: document.body.innerText.slice(0, 300),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  console.log("ERRORS:", errors.slice(0, 10));
  await page.screenshot({ path: "/home/z/my-project/scripts/shots/debug-oryon-boot.png" });
  await browser.close();
})();
