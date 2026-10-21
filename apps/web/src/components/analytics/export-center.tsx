"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import type { AnalyticsSuiteResponse } from "@cosmoz/shared";

import { useAccounts } from "@/lib/api/queries/catalogs";
import {
  accountsCsv,
  downloadTextFile,
  suiteReportsCsv,
  suiteStrategiesCsv,
  suiteSummaryCsv,
  suiteSymbolsCsv,
} from "@/lib/export/builders";
import { apiErrorMessage } from "@/lib/api/client";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Export center (Dashboard Customization Phase 08 §5) — the dashboard/
 * reporting export workflow: choose a dataset, download it, get truthful
 * feedback. Every payload is built from the ONE filtered server dataset
 * (or the accounts catalog) by lib/export/builders — no recomputation, no
 * mock data, no fake success (a failed download surfaces an error toast).
 * Scope echo: the suite's descriptor rides in every summary row, and the
 * multi-currency honesty rule drops money columns entirely.
 */

function safeFileStem(descriptor: string): string {
  // Keep filenames safe + human-readable (spec §11) — strip path/quote chars.
  return (
    descriptor
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "analytics"
  );
}

export function ExportCenter({ suite }: { suite: AnalyticsSuiteResponse }) {
  const { dict } = useI18n();
  const T = dict.analytics.exports;
  const accounts = useAccounts();

  const onExport = React.useCallback(
    (dataset: string, build: () => string) => {
      try {
        const stem = safeFileStem(suite.meta.descriptor);
        downloadTextFile(`euforia-${dataset}-${stem}.csv`, build());
      } catch (error) {
        toast.error(apiErrorMessage(error, T.downloadFailed));
      }
    },
    [suite.meta.descriptor, T.downloadFailed],
  );

  const exports: Array<{ key: string; label: string; build: () => string; disabled?: boolean }> = [
    { key: "summary", label: T.summaryCsv, build: () => suiteSummaryCsv(suite) },
    {
      key: "strategies",
      label: T.strategiesCsv,
      build: () => suiteStrategiesCsv(suite),
      disabled: suite.strategies.length === 0,
    },
    {
      key: "symbols",
      label: T.symbolsCsv,
      build: () => suiteSymbolsCsv(suite),
      disabled: suite.symbols.length === 0,
    },
    {
      key: "monthly",
      label: T.monthlyCsv,
      build: () => suiteReportsCsv(suite, "monthly"),
      disabled: suite.reports.monthly.length === 0,
    },
    {
      key: "accounts",
      label: T.accountsCsv,
      build: () =>
        accountsCsv(
          (accounts.data?.accounts ?? []).map((account) => ({
            name: account.name,
            type: account.type,
            broker: account.broker,
            currency: account.currency,
            startingBalance: account.startingBalance,
            isDefault: account.isDefault,
          })),
        ),
      disabled: (accounts.data?.accounts ?? []).length === 0,
    },
  ];

  return (
    <section
      className="rounded-xl border border-border bg-surface p-4"
      data-testid="export-center"
      aria-label={T.title}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-heading text-sm font-semibold">{T.title}</h3>
          <p className="max-w-2xl text-xs text-muted-foreground">{T.description}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {exports.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled === true}
            onClick={() => onExport(item.key, item.build)}
            data-testid={`export-${item.key}`}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] transition-colors",
              item.disabled
                ? "cursor-not-allowed opacity-50"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-disabled={item.disabled === true}
          >
            <Download className="size-3.5" aria-hidden="true" />
            {item.label}
            <span className="text-[9px] font-semibold tracking-wider text-muted-foreground">
              {T.csvSuffix}
            </span>
          </button>
        ))}
      </div>
      {!suite.meta.singleCurrency && (
        <p className="mt-2 text-[11px] text-muted-foreground" data-testid="export-multicurrency-note">
          {T.multiCurrencyNote}
        </p>
      )}
    </section>
  );
}
