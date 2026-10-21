const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (m) => console.log("CONSOLE[" + m.type() + "]:", m.text().slice(0, 160)));
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    const r = await fetch("/api/instruments");
    return {
      swCount: regs.length,
      swState: regs[0]?.active?.state ?? "none",
      scope: regs[0]?.scope ?? "none",
      apiStatus: r.status,
      body: (await r.text()).slice(0, 120),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
