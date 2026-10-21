#!/bin/bash
# Audit all 22 wired lessons: every SVG <text> must fit its viewBox.
PAIRS=(
"course-foundations/les-f-orders-costs"
"course-foundations/les-f-leverage-margin"
"course-risk/les-r-r-multiples"
"course-risk/les-r-drawdown-ruin"
"course-technical/les-t-charts-timeframes"
"course-technical/les-t-trends-ranges"
"course-technical/les-t-breakouts-retests"
"course-price-action/les-p-impulse-correction"
"course-price-action/les-p-liquidity-imbalance"
"course-strategies/les-s-blueprint-template"
"course-strategies/les-s-breakout-retest"
"course-strategies/les-s-pullback-trend"
"course-strategies/les-s-range-reversion"
"course-structure/les-s-invalidation"
"course-management/les-m-winners"
"course-management/les-m-losers"
"course-management/les-m-exit-system"
"course-psychology/les-y-traps"
"course-psychology/les-y-process"
"course-advanced/les-a-multi-timeframe-regimes"
"course-advanced/les-a-correlation-exposure"
"course-advanced/les-a-system-statistics"
)
CHECK='(() => {
  const out = [];
  document.querySelectorAll("[data-testid=lesson-figure] svg").forEach((svg, fi) => {
    const vb = svg.viewBox.baseVal;
    svg.querySelectorAll("text").forEach((t) => {
      const bb = t.getBBox();
      const over =
        bb.x < -1 || bb.y < -1 ||
        bb.x + bb.width > vb.width + 1 || bb.y + bb.height > vb.height + 1;
      if (over) out.push(`f${fi} "${t.textContent.slice(0,40)}" box=${Math.round(bb.x)},${Math.round(bb.y)},${Math.round(bb.x+bb.width)},${Math.round(bb.y+bb.height)} vb=${vb.width}x${vb.height}`);
    });
  });
  return out.length ? out.join(" | ") : "OK";
})()'
for pair in "${PAIRS[@]}"; do
  agent-browser open "http://localhost:3000/academy/courses/$pair" > /dev/null 2>&1
  agent-browser wait --load networkidle > /dev/null 2>&1
  agent-browser wait 400 > /dev/null 2>&1
  res=$(agent-browser eval "$CHECK" 2>/dev/null | tail -1)
  echo "$pair → $res"
done
