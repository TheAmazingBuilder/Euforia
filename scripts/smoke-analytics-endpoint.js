/** smoke-analytics-endpoint.js - quick API-level check of /stats/analytics-suite. */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);

  const result = await page.evaluate(async () => {
    const res = await fetch("/api/stats/analytics-suite?period=ALL&sims=200");
    if (!res.ok) return { http: res.status, text: (await res.text()).slice(0, 300) };
    return { http: res.status, data: await res.json() };
  });

  if (result.http !== 200) {
    console.log("HTTP", result.http, result.text);
    process.exit(1);
  }
  const d = result.data;
  const m = d.meta;
  const s = d.summary;
  console.log("meta:", m.descriptor, "|", m.closedTrades, "closed |", m.openTradesExcluded, "open excl |", m.resolvedFrom, "→", m.resolvedTo);
  console.log("warnings:", m.warnings, "| singleCurrency:", m.singleCurrency);
  console.log("netPnl:", s.netPnl, "| WR:", s.winRate, "| PF:", s.profitFactor, "| expR:", s.expectancyR, "| payoff:", s.payoffRatio);
  console.log("maxDD_R:", s.maxDrawdownR, "| maxDD%:", s.maxDrawdownPct, "| sharpe:", s.sharpe, "| sortino:", s.sortino, "| sqn:", s.sqn, "| recFactor:", s.recoveryFactor);
  console.log("equity pts:", d.equity.length, "| cumR:", d.cumulativeR.length, "| rolling:", d.rolling.length, "| daily:", d.dailyPnl.length);
  console.log("histograms: R", d.rHistogram.length, "pnl", d.pnlHistogram.length, "dur", d.durationHistogram.length);
  console.log("drawdowns:", d.drawdowns.length, d.drawdowns[0] ? JSON.stringify({ ddR: d.drawdowns[0].drawdownR, ddMoney: d.drawdowns[0].drawdownMoney, days: d.drawdowns[0].durationDays, rec: d.drawdowns[0].recoveredDate, trades: d.drawdowns[0].trades.length }) : null);
  console.log("risk:", JSON.stringify({ avg: d.risk.avgRiskMoney, devPct: d.risk.riskDeviationPct, maxConcurrent: d.risk.maxConcurrentPositions, planned: d.risk.plannedVsRealized.map((b) => `${b.bucket}:${b.trades}`).join(",") }));
  console.log("strategies:", d.strategies.map((x) => `${x.name}(${x.trades},PF${x.profitFactor},plan${x.followedPlanPct})`).join(" | "));
  console.log("symbols:", d.symbols.map((x) => `${x.symbol}:${x.trades}`).join(","));
  console.log("assetClasses:", d.assetClasses.map((x) => `${x.assetClass}:${x.trades}`).join(","));
  console.log("directions:", d.directions.map((x) => `${x.direction}:${x.trades}:${x.winRate}`).join(" | "));
  console.log("time: sessions", d.sessions.length, "hours", d.hours.length, "weekdays", d.weekdays.length, "heatmap", d.heatmap.length);
  console.log("psych: before", d.psychology.emotionsBefore.length, "after", d.psychology.emotionsAfter.length, "conf", d.psychology.confidenceBands.map((b) => `${b.band}:${b.trades}`).join(","), "tilt", d.psychology.tilt.length);
  console.log("quality: plan", JSON.stringify(d.quality.planFollowed), "| mfe", d.quality.mfe.avgR, "capture", d.quality.mfe.capturePct, "| mae", d.quality.mae.avgR, "| scatter", d.quality.scatter.length, "| excAvailable:", d.quality.excursionAvailable);
  console.log("mistakes:", d.mistakes.entries.length, "entries | violating:", d.mistakes.violatingTrades, "| totalR:", d.mistakes.totalR, "| top:", d.mistakes.entries[0]?.label, d.mistakes.entries[0]?.rCost);
  console.log("events:", JSON.stringify(d.events.calendarCoverage), "| phases:", d.events.phases.map((p) => `${p.label.split(" ")[0]}:${p.trades}`).join(","));
  console.log("advanced R: mean", d.advanced.r.mean, "std", d.advanced.r.stddev, "skew", d.advanced.r.skewness, "kurt", d.advanced.r.kurtosis, "| streaks:", JSON.stringify(d.advanced.streaks));
  console.log("MC: sims", d.monteCarlo.simulations, "| bands", d.monteCarlo.bands.length, "| finalR", JSON.stringify(d.monteCarlo.finalR), "| dd p95", d.monteCarlo.maxDrawdownR.p95);
  console.log("reports: daily", d.reports.daily.length, "weekly", d.reports.weekly.length, "monthly", d.reports.monthly.map((r) => r.key).join(","));

  // Filtered run: SELL only
  const d2 = await page.evaluate(async () => {
    const res = await fetch("/api/stats/analytics-suite?period=ALL&direction=SELL&sims=100");
    return res.json();
  });
  console.log("SELL-only:", d2.meta.closedTrades, "trades | WR:", d2.summary.winRate, "| dir rows:", d2.directions.map((x) => `${x.direction}:${x.trades}`).join(","));

  // Empty run honesty
  const d3 = await page.evaluate(async () => {
    const res = await fetch("/api/stats/analytics-suite?period=ALL&direction=SELL&assetClass=CRYPTO&emotion=CALM");
    return res.json();
  });
  console.log("empty-run:", d3.meta.closedTrades, "| warnings:", d3.meta.warnings, "| WR:", d3.summary.winRate, "| PF:", d3.summary.profitFactor);
  await browser.close();
})();
