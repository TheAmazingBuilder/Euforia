"use client";

import * as React from "react";
import { Download, Eye, EyeOff, Link2, Lock } from "lucide-react";

import type { BridgePairing } from "@cosmoz/shared";

import { CopyButton } from "@/components/calculators/calculator-shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDict } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * The MT5 terminal pairing sheet (Phase 08) — the one component that ever
 * renders the bridge secret, reused by BOTH pairing surfaces:
 *   1. the connect-time follow-up state (connect-account-dialog), and
 *   2. the account-detail "Pairing sheet" dialog (account-detail-drawer).
 *
 * Honesty rules mirrored from the backend contract:
 *  - the ingest URL is rendered ABSOLUTE (window.location.origin + the
 *    server-provided ingestPath) because the terminal must WebRequest it;
 *  - the secret is masked by default with an explicit reveal — unlike
 *    API-key credentials it is re-readable from the pairing view by design,
 *    and the copy says so;
 *  - the EA download is a plain anchor with `download` pointing at the
 *    static asset path the backend declares (public/bridge/EuforiaBridge.mq5);
 *  - copy buttons reuse the shared CopyButton (no third clipboard impl).
 * Zero hardcoded copy — every string comes from dict.accounts.bridge.
 */
export function BridgePairingPanel({
  pairing,
  testIdPrefix = "bridge-pairing",
}: {
  pairing: BridgePairing;
  /** Testid namespace — lets the two surfaces assert independently. */
  testIdPrefix?: string;
}) {
  const dict = useDict();
  const B = dict.accounts.bridge;
  const [secretRevealed, setSecretRevealed] = React.useState(false);

  // The terminal needs a fully qualified URL for Tools → Options → Expert
  // Advisors → "Allow WebRequest". Client-rendered only (both surfaces gate
  // on an open dialog), but guarded anyway for purity.
  const ingestUrl = React.useMemo(
    () =>
      typeof window === "undefined"
        ? pairing.ingestPath
        : `${window.location.origin}${pairing.ingestPath}`,
    [pairing.ingestPath],
  );

  const copyLabels = { copy: B.copy, copied: B.copied };
  const masked = "•".repeat(16);

  return (
    <div className="grid gap-3.5" data-testid={testIdPrefix}>
      {/* (a) Ingest URL — absolute, copyable, the WebRequest allowlist entry */}
      <div className="grid gap-1.5" data-testid={`${testIdPrefix}-ingest`}>
        <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="size-3" aria-hidden />
          {B.ingestUrlLabel}
        </Label>
        <div className="flex items-center gap-2">
          <code
            className={cn(
              "min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-2",
              "font-mono text-xs text-foreground",
            )}
            title={ingestUrl}
          >
            {ingestUrl}
          </code>
          <CopyButton payload={ingestUrl} labels={copyLabels} testId={`${testIdPrefix}-copy-ingest`} />
        </div>
      </div>

      {/* (b) Bridge key — the X-Bridge-Key header value */}
      <div className="grid gap-1.5" data-testid={`${testIdPrefix}-key`}>
        <Label className="text-xs text-muted-foreground">{B.bridgeKeyLabel}</Label>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-2 font-mono text-xs text-foreground">
            {pairing.bridgeKeyId}
          </code>
          <CopyButton payload={pairing.bridgeKeyId} labels={copyLabels} testId={`${testIdPrefix}-copy-key`} />
        </div>
      </div>

      {/* (c) Bridge secret — masked by default, reveal + copy, re-readable */}
      <div className="grid gap-1.5" data-testid={`${testIdPrefix}-secret-block`}>
        <Label className="text-xs text-muted-foreground">{B.secretLabel}</Label>
        <div className="flex items-center gap-2">
          <code
            className={cn(
              "min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-2",
              "font-mono text-xs",
              secretRevealed ? "text-foreground" : "select-none text-muted-foreground",
            )}
            data-testid={`${testIdPrefix}-secret`}
          >
            {secretRevealed ? pairing.secret : masked}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSecretRevealed((revealed) => !revealed)}
            aria-pressed={secretRevealed}
            data-testid={`${testIdPrefix}-reveal`}
          >
            {secretRevealed ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
            {secretRevealed ? B.secretHide : B.secretReveal}
          </Button>
          <CopyButton payload={pairing.secret} labels={copyLabels} testId={`${testIdPrefix}-copy-secret`} />
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid={`${testIdPrefix}-secret-warning`}>
          <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
          {B.secretOnceWarning}
        </p>
      </div>

      {/* (d) The EA download + the compact 4-step attach guide */}
      <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3" data-testid={`${testIdPrefix}-setup`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{B.eaLabel}</p>
          <span className="font-mono text-[11px] text-muted-foreground">
            {pairing.ea.fileName} · {B.eaVersion} {pairing.ea.version}
          </span>
        </div>
        <Button variant="outline" size="sm" asChild className="justify-start">
          <a href={pairing.ea.downloadPath} download={pairing.ea.fileName} data-testid={`${testIdPrefix}-download`}>
            <Download className="size-3.5" aria-hidden />
            {B.downloadButton}
          </a>
        </Button>
        <div className="grid gap-1.5">
          <p className="text-xs font-medium text-foreground">{B.stepsTitle}</p>
          <ol className="grid gap-1.5">
            {[B.steps.one, B.steps.two, B.steps.three, B.steps.four].map((step, index) => (
              <li key={step} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <span
                  className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[10px]"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
