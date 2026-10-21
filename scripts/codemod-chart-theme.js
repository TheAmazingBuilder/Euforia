/**
 * One-shot codemod: migrate chart consumers from the racy
 * `useTheme().resolvedTheme` token-read pattern to `useChartTheme()`
 * (attribute-observed, post-write). Verifiable via tsc/eslint/grep after.
 */
const fs = require("fs");

const files = [
  "apps/web/src/components/analytics/bucket-bars.tsx",
  "apps/web/src/components/analytics/mae-mfe-scatter.tsx",
  "apps/web/src/components/analytics/sleep-scatter.tsx",
  "apps/web/src/components/analytics/strategy-distributions.tsx",
  "apps/web/src/components/analytics/tilt-timeline.tsx",
  "apps/web/src/components/analytics/what-if-curve.tsx",
  "apps/web/src/components/analytics/r-heatmap.tsx",
  "apps/web/src/components/dashboard/equity-constellation.tsx",
  "apps/web/src/components/dashboard/calendar-heatmap.tsx",
];

const REGRET = "apps/web/src/components/session/regret-registry.tsx";

function transform(path) {
  let src = fs.readFileSync(path, "utf8");
  const before = src;

  // 1. Drop the next-themes import.
  src = src.replace(/import \{ useTheme \} from "next-themes";\n/, "");

  // 2. Swap the chart-theme import.
  src = src.replace(
    'import { getChartTheme } from "@/lib/utils/chart-theme";',
    'import { useChartTheme } from "@/lib/utils/chart-theme";',
  );

  // 3. Remove single-line comments mentioning resolvedTheme.
  src = src
    .split("\n")
    .filter((line) => !/^\s*\/\/.*resolvedTheme.*$/.test(line))
    .join("\n");

  // 4. Hook swap.
  src = src.replace("  const { resolvedTheme } = useTheme();", "  const theme = useChartTheme();");

  // 5. In-memo token read → snapshot from the hook.
  src = src.replace("    const t = getChartTheme();", "    const t = theme;");

  // 6. Dep arrays.
  src = src.replace(/, resolvedTheme\]\);/g, ", theme]);");

  // 7. Drop eslint-disable lines that directly precede a deps line (they were
  //    there for the old resolvedTheme dep only).
  src = src
    .split("\n")
    .filter((line, i, arr) => {
      const isDisable = /^\s*\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\s*$/.test(line);
      const next = arr[i + 1] ?? "";
      const nextIsDeps = /^\s*\}, \[.*\]\);$/.test(next);
      return !(isDisable && nextIsDeps);
    })
    .join("\n");

  if (src !== before) {
    fs.writeFileSync(path, src);
    console.log("UPDATED", path);
  } else {
    console.log("UNCHANGED", path);
  }
}

for (const file of files) transform(file);

// ── regret-registry.tsx — targeted block replacement ──────────────────────────
let src = fs.readFileSync(REGRET, "utf8");
src = src.replace(/import \{ useTheme \} from "next-themes";\n/, "");
src = src.replace(
  'import { getThemeToken } from "@/lib/utils/theme";',
  'import { useChartTheme } from "@/lib/utils/chart-theme";',
);
src = src.replace(
  `  const { resolvedTheme } = useTheme();
  const fearColor = getThemeToken("--warning");
  const disciplineColor = getThemeToken("--profit");`,
  "REPLACED_BLOCK_PLACEHOLDER",
);
// (comment lines already removed in the generic pass would break this exact
// match — handle both orders)
if (src.includes("REPLACED_BLOCK_PLACEHOLDER")) {
  src = src.replace(
    "REPLACED_BLOCK_PLACEHOLDER",
    `  const theme = useChartTheme();
  const fearColor = theme.warning;
  const disciplineColor = theme.profit;`,
  );
} else {
  src = src.replace(
    `  const { resolvedTheme } = useTheme();
  const fearColor = getThemeToken("--warning");
  const disciplineColor = getThemeToken("--profit");`,
    `  const theme = useChartTheme();
  const fearColor = theme.warning;
  const disciplineColor = theme.profit;`,
  );
}
fs.writeFileSync(REGRET, src);
console.log("UPDATED", REGRET);
