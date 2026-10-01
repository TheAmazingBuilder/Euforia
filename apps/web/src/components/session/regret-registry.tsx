"use client";

import { useTheme } from "next-themes";
import type { GhostTrendPoint } from "@cosmoz/shared";
import { formatR } from "@cosmoz/shared";

import { useI18n } from "@/i18n/i18n-provider";
import { getThemeToken } from "@/lib/utils/theme";

/**
 * Regret Registry widget (Session Live): "Discipline Saved +X.XR" (profit
 * color) vs "Hesitation Cost −X.XR" (warning color), plus the 30-day
 * fear-vs-discipline trend sparkline. All aggregates come from
 * GET /stats/overview — the client renders tokens only, and re-reads them
 * when the resolved theme changes (same contract as the chart wrapper).
 */

const WIDTH = 220;
const HEIGHT = 44;
const PAD = 4;

function TrendSparkline({ trend }: { trend: GhostTrendPoint[] }) {
  const { resolvedTheme } = useTheme();
  const { dict } = useI18n();
  const S = dict.session;
  // Theme tokens are read at render time; resolvedTheme in the dependency
  // trail guarantees a fresh read after a theme switch.
  void resolvedTheme;
  const fearColor = getThemeToken("--warning");
  const disciplineColor = getThemeToken("--profit");

  if (trend.length < 2) return null;

  const max = Math.max(1, ...trend.map((point) => Math.max(point.fear, point.discipline)));
  const step = (WIDTH - PAD * 2) / (trend.length - 1);
  const yFor = (value: number) => HEIGHT - PAD - (value / max) * (HEIGHT - PAD * 2);

  const line = (pick: (point: GhostTrendPoint) => number): string =>
    trend.map((point, index) => `${(PAD + index * step).toFixed(1)},${yFor(pick(point)).toFixed(1)}`).join(" ");

  const last = trend[trend.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-11 w-full"
      role="img"
      aria-label={S.regret.sparkAria}
      preserveAspectRatio="none"
    >
      <polyline
        points={line((point) => point.discipline)}
        fill="none"
        stroke={disciplineColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={line((point) => point.fear)}
        fill="none"
        stroke={fearColor}
        strokeWidth={1.5}
        strokeDasharray="4 3"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={PAD + (trend.length - 1) * step} cy={yFor(last.discipline)} r={2} fill={disciplineColor} />
      <circle cx={PAD + (trend.length - 1) * step} cy={yFor(last.fear)} r={2} fill={fearColor} />
    </svg>
  );
}

export function RegretRegistry({
  disciplineSavedR,
  disciplineSavedCount,
  hesitationCostR,
  hesitationCostCount,
  trend,
}: {
  disciplineSavedR: string;
  disciplineSavedCount: number;
  hesitationCostR: string;
  hesitationCostCount: number;
  trend: GhostTrendPoint[];
}) {
  const { dict } = useI18n();
  const S = dict.session;

  return (
    <section aria-label={S.regret.aria} className="rounded-xl border border-border bg-surface">
      <header className="border-b border-border px-4 py-3">
        <h2 className="font-heading text-base font-semibold text-foreground">{S.regret.title}</h2>
        <p className="text-xs text-muted-foreground">
          {S.regret.subtitle}
        </p>
      </header>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="rounded-lg border border-profit/25 bg-profit/5 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{S.regret.disciplineSaved}</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-profit">
            {formatR(disciplineSavedR)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {`${S.regret.savedBody} ${disciplineSavedCount} ${disciplineSavedCount === 1 ? S.regret.tradeOne : S.regret.tradeMany}`}
          </p>
        </div>
        <div className="rounded-lg border border-warning/25 bg-warning/5 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{S.regret.hesitationCost}</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-warning">
            {formatR(-Number(hesitationCostR))}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {`${S.regret.costBody} ${hesitationCostCount} ${hesitationCostCount === 1 ? S.regret.tradeOne : S.regret.tradeMany}`}
          </p>
        </div>
      </div>

      <div className="border-t border-border px-4 pb-4 pt-3">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{S.regret.trendTitle}</p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="size-2 rounded-full bg-warning" /> {S.regret.fear}
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="size-2 rounded-full bg-profit" /> {S.regret.discipline}
            </span>
          </div>
        </div>
        <TrendSparkline trend={trend} />
      </div>
    </section>
  );
}
