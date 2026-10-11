"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, PanelBottom, ShieldOff, X } from "lucide-react";

import type { BrokerPosition } from "@cosmoz/shared";

import Link from "next/link";

import { useBrokerSession } from "@/lib/api/queries/broker";
import { useDict } from "@/i18n/i18n-provider";
import { useOryonPositionsOptional, type OryonPositionsContextValue } from "@/components/oryon/oryon-positions-context";
import { sameInstrument, sideLabel } from "@/lib/oryon/positions/match";
import { classifyPositionsStatus, snapshotAgeSeconds } from "@/lib/oryon/positions/status";
import {
  formatOpenedAt,
  formatSignedAmount,
  pnlTone,
  positionPriceDigits,
  sortPositionsForTable,
  summarizePnl,
} from "@/lib/oryon/positions/view";
import { cn } from "@/lib/utils";

/**
 * Oryon lower panel — the Open Positions monitor (Phase 4, PRD FR-15).
 *
 * Data honesty contract (spec §3/§4/§10):
 *   - the book comes from the app's private positions stream, which is a
 *     SIMULATED per-user book in this deployment — the SIM badge says so and
 *     never disappears while simulated rows are shown;
 *   - missing SL/TP/market/P&L render the neutral N/A — never zero, never a
 *     guess (missing ≠ 0);
 *   - connected-with-zero ≠ disconnected: the empty state appears ONLY on a
 *     synced book; a lost transport says so and keeps the last known rows;
 *   - the broker-account context line is a SEPARATE read-only surface
 *     (GET /broker/session): it never merges broker positions into the
 *     simulated book and never fakes a connection.
 *
 * Read-only by design: rows select (highlight the chart overlay) and nothing
 * else — there is no close/modify/order affordance anywhere in this panel.
 */

interface OryonLowerPanelProps {
  open: boolean;
  onClose: () => void;
  /** Symbol displayed by the chart — rows matching it carry the overlay. */
  activeSymbol: string | null;
}

export function OryonLowerPanel({ open, onClose, activeSymbol }: OryonLowerPanelProps) {
  const dict = useDict();
  const S = dict.oryon.lower;

  if (!open) return null;

  return (
    <section
      data-testid="oryon-lower-panel"
      aria-label={S.title}
      className="flex h-48 shrink-0 flex-col border-t border-border bg-surface"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <PanelBottom className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-xs font-semibold text-foreground">{S.title}</span>
        <PositionsSummary />
        <button
          type="button"
          aria-label={dict.common.close}
          data-testid="oryon-lower-close"
          onClick={onClose}
          className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <PositionsBody activeSymbol={activeSymbol} />
      </div>
    </section>
  );
}

// ── Summary (header): count + aggregated P&L + stream status + SIM badge ────

function PositionsSummary() {
  const dict = useDict();
  const S = dict.oryon.lower;
  const { positions } = usePositionsSafe();

  const summary = summarizePnl(positions);
  const total = summary.total !== null ? formatSignedAmount(summary.total, 2) : null;
  const tone = summary.total !== null ? pnlTone(summary.total) : "neutral";

  return (
    <div className="ml-1 flex min-w-0 items-center gap-2">
      <span data-testid="oryon-positions-count" className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {positions.length} {S.openCount}
      </span>
      {total !== null ? (
        <span
          data-testid="oryon-positions-pnl-total"
          className={cn(
            "shrink-0 font-mono text-[11px] font-semibold tabular-nums",
            tone === "profit" && "text-profit",
            tone === "loss" && "text-loss",
            tone === "neutral" && "text-muted-foreground",
          )}
          title={S.usdDenominated}
        >
          {S.pnlTotalLabel} {total}
        </span>
      ) : null}
      <PositionsStatusChip />
      <SimBadge />
    </div>
  );
}

/** SIM provenance badge — tooltip carries the full honesty statement. */
function SimBadge() {
  const dict = useDict();
  const S = dict.oryon.lower;
  return (
    <span
      data-testid="oryon-positions-sim-badge"
      title={S.simHint}
      className="shrink-0 rounded-sm bg-warning/15 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning"
    >
      {S.simBadge}
    </span>
  );
}

/**
 * Stream freshness chip — LEAF with its own 1 Hz ticker (same pattern as
 * OryonFeedStatus): the panel does not re-render for the clock, only the
 * chip does. A frozen stream renders STALE — never a permanent green Live.
 */
function PositionsStatusChip() {
  const dict = useDict();
  const S = dict.oryon.lower;
  const { connected, lastEventAt } = usePositionsSafe();

  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const status = classifyPositionsStatus({ connected, lastEventAt, now });
  const age = snapshotAgeSeconds(lastEventAt, now);

  const view =
    status === "live"
      ? { label: S.statusLive, tone: "live" as const, testid: "oryon-positions-live" }
      : status === "stale"
        ? { label: S.statusStale, tone: "warning" as const, testid: "oryon-positions-stale" }
        : status === "connecting"
          ? { label: S.statusConnecting, tone: "muted" as const, testid: "oryon-positions-connecting" }
          : { label: S.statusDisconnected, tone: "muted" as const, testid: "oryon-positions-disconnected" };

  return (
    <span
      data-testid="oryon-positions-status"
      data-status={status}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        view.tone === "live" && "border-border bg-surface-raised text-foreground",
        view.tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
        view.tone === "muted" && "border-border bg-surface text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          view.tone === "live" && "bg-primary",
          view.tone === "warning" && "bg-warning",
          view.tone === "muted" && "bg-muted-foreground/60",
        )}
      />
      {view.label}
      {status === "stale" && age !== null ? (
        <span className="font-mono">{S.staleAgo.replace("{s}", String(age))}</span>
      ) : null}
    </span>
  );
}

// ── Body: honest states → dense table → broker account context ──────────────

function PositionsBody({ activeSymbol }: { activeSymbol: string | null }) {
  const dict = useDict();
  const S = dict.oryon.lower;
  const { positions, connected, lastEventAt } = usePositionsSafe();

  // 1 Hz refresh for the freshness verdict ONLY (no table reshuffle — the
  // verdict gates which state renders, the rows themselves are stable).
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const status = classifyPositionsStatus({ connected, lastEventAt, now });

  if (status === "connecting") {
    return <CenteredState testid="oryon-positions-state-connecting" message={S.stateConnecting} spinner />;
  }
  if (positions.length === 0 && status === "disconnected") {
    return <CenteredState testid="oryon-positions-state-disconnected" message={S.stateDisconnected} icon={<ShieldOff className="size-5 text-muted-foreground" aria-hidden />} />;
  }
  if (positions.length === 0) {
    return <CenteredState testid="oryon-positions-state-empty" message={S.stateEmpty} hint={S.stateEmptyHint} />;
  }

  const rows = sortPositionsForTable(positions);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto" data-testid="oryon-positions-table">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-surface text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-1.5 font-medium">{S.table.symbol}</th>
              <th scope="col" className="px-2 py-1.5 font-medium">{S.table.side}</th>
              <th scope="col" className="px-2 py-1.5 font-medium">{S.table.volume}</th>
              <th scope="col" className="px-2 py-1.5 font-medium">{S.table.entry}</th>
              <th scope="col" className="px-2 py-1.5 font-medium">{S.table.market}</th>
              <th scope="col" className="px-2 py-1.5 font-medium">{S.table.sl}</th>
              <th scope="col" className="px-2 py-1.5 font-medium">{S.table.tp}</th>
              <th scope="col" className="px-2 py-1.5 font-medium">{S.table.pnl}</th>
              <th scope="col" className="px-2 py-1.5 font-medium">{S.table.opened}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((position) => (
              <PositionRow
                key={position.id}
                position={position}
                activeSymbol={activeSymbol}
              />
            ))}
          </tbody>
        </table>
      </div>
      <AccountContextRow />
    </div>
  );
}

function PositionRow({
  position,
  activeSymbol,
}: {
  position: BrokerPosition;
  activeSymbol: string | null;
}) {
  const dict = useDict();
  const S = dict.oryon.lower;
  const { selectedId, select } = usePositionsSafe();

  const selected = selectedId === position.id;
  const onChart = activeSymbol !== null && sameInstrument(position.symbol, activeSymbol);
  const digits = positionPriceDigits(position, null);
  const long = sideLabel(position.direction) === "LONG";
  const opened = formatOpenedAt(position.openedAt);

  const na = <span className="text-muted-foreground/60">{S.na}</span>;
  const price = (value: string | null) =>
    value !== null && Number.isFinite(Number(value)) ? (
      <span className="font-mono tabular-nums text-foreground">{Number(value).toFixed(digits)}</span>
    ) : (
      na
    );

  const pnl = position.unrealizedPnl !== null ? formatSignedAmount(position.unrealizedPnl, 2) : null;
  const pnlToneValue = position.unrealizedPnl !== null ? pnlTone(position.unrealizedPnl) : "neutral";

  const handleToggle = React.useCallback(() => {
    select(selected ? null : position.id);
  }, [select, selected, position.id]);

  return (
    <tr
      data-testid="oryon-position-row"
      data-position-id={position.id}
      data-selected={selected}
      tabIndex={0}
      aria-selected={selected}
      aria-label={`${S.rowSelectAria} ${position.symbol}`}
      onClick={handleToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleToggle();
        }
      }}
      className={cn(
        "cursor-pointer border-t border-border/60 transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected ? "bg-surface-raised" : "bg-surface",
      )}
    >
      <td className="px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono font-semibold text-foreground">{position.symbol}</span>
          {onChart ? (
            <span
              data-testid="oryon-position-on-chart"
              title={S.selectHint}
              className="rounded-sm bg-primary/15 px-1 py-px text-[9px] font-semibold uppercase text-primary"
            >
              chart
            </span>
          ) : null}
        </span>
      </td>
      <td className="px-2 py-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-sm border px-1 py-px font-mono text-[10px] font-semibold",
            long ? "border-profit/30 text-profit" : "border-loss/30 text-loss",
          )}
        >
          {long ? (
            <ArrowUpRight className="size-2.5" aria-hidden />
          ) : (
            <ArrowDownRight className="size-2.5" aria-hidden />
          )}
          {long ? S.sideLong : S.sideShort}
        </span>
      </td>
      <td className="px-2 py-1.5 font-mono tabular-nums text-foreground">{position.volume}</td>
      <td className="px-2 py-1.5">{price(position.entryPrice)}</td>
      <td className="px-2 py-1.5">{price(position.currentPrice)}</td>
      <td className="px-2 py-1.5">{position.stopLoss !== null ? price(position.stopLoss) : na}</td>
      <td className="px-2 py-1.5">{position.takeProfit !== null ? price(position.takeProfit) : na}</td>
      <td className="px-2 py-1.5">
        {pnl !== null ? (
          <span
            className={cn(
              "font-mono font-semibold tabular-nums",
              pnlToneValue === "profit" && "text-profit",
              pnlToneValue === "loss" && "text-loss",
              pnlToneValue === "neutral" && "text-muted-foreground",
            )}
          >
            {pnl}
          </span>
        ) : (
          na
        )}
      </td>
      <td className="px-2 py-1.5 text-muted-foreground">{opened ?? na}</td>
    </tr>
  );
}

/**
 * Broker account context (§10) — a SEPARATE, read-only surface. It states
 * which real account (if any) backs the workspace and never merges broker
 * positions into the simulated book shown above.
 */
function AccountContextRow() {
  const dict = useDict();
  const S = dict.oryon.lower;
  // Gated polling: the panel is the only consumer — no requests while closed.
  const session = useBrokerSession({ enabled: true });

  let content: React.ReactNode;
  if (session.isError) {
    content = (
      <span data-testid="oryon-positions-account-error" className="inline-flex items-center gap-1.5 text-warning">
        <ShieldOff className="size-3" aria-hidden />
        {S.stateError}
      </span>
    );
  } else if (session.data?.state === "CONNECTED" && session.data.account !== null) {
    content = (
      <span data-testid="oryon-positions-account-connected" className="inline-flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded-sm bg-primary/15 px-1 py-px text-[9px] font-semibold uppercase text-primary">
          {session.data.account.broker}
        </span>
        <span className="truncate font-mono text-muted-foreground">{session.data.account.accountNumber}</span>
        <span className="shrink-0 text-muted-foreground/70">·</span>
        <span className="truncate text-muted-foreground">{S.positionsSourceNote}</span>
      </span>
    );
  } else {
    content = (
      <span data-testid="oryon-positions-account-empty" className="inline-flex items-center gap-1.5 text-muted-foreground">
        <ShieldOff className="size-3" aria-hidden />
        {S.accountNotConfigured}
        <Link
          href="/accounts"
          data-testid="oryon-positions-account-link"
          className="shrink-0 font-medium text-primary underline-offset-4 hover:underline"
        >
          {S.accountLink}
        </Link>
      </span>
    );
  }

  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-t border-border/60 px-3 text-[10px]">
      {content}
    </div>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function CenteredState({
  testid,
  message,
  hint,
  spinner = false,
  icon = null,
}: {
  testid: string;
  message: string;
  hint?: string;
  spinner?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center" data-testid={testid}>
      {icon}
      {spinner ? (
        <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" aria-hidden />
      ) : null}
      <p className="text-xs font-medium text-foreground">{message}</p>
      {hint !== undefined ? <p className="max-w-md text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Context accessor that TOLERATES a missing provider (defensive display
 * leaves): consumers inside the Oryon workspace always have the provider;
 * this keeps the panel renderable in isolation instead of crashing the
 * workspace shell.
 */
function usePositionsSafe(): OryonPositionsContextValue {
  return useOryonPositionsOptional();
}
