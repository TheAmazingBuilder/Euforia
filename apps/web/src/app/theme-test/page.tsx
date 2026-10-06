import { COSMOZ_VERSION } from "@cosmoz/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export const metadata = {
  title: "Euforia — Theme test",
  description:
    "QA page for the COSMOZ 3-theme system: tokens, typography and P&L semantics.",
};

const TRADE_ROWS = [
  { id: "EU60-128", instrument: "EUR/USD", entry: "1.08432", exit: "1.08790", pnl: "+358.00", r: "+2.4R", win: true },
  { id: "BTC-129", instrument: "BTC/USDT", entry: "64120.5", exit: "63480.0", pnl: "-640.50", r: "-1.1R", win: false },
  { id: "B500-130", instrument: "Boom 500", entry: "8412.33", exit: "8601.90", pnl: "+189.57", r: "+1.3R", win: true },
  { id: "V75-131", instrument: "Volatility 75", entry: "192 480", exit: "191 100", pnl: "-1 380.00", r: "-1.8R", win: false },
];

export default function ThemeTestPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="font-heading text-3xl font-bold tracking-tight">
              Theme test
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              QA page for the COSMOZ design tokens. Every color below comes from
              a semantic CSS variable mapped in globals.css — switch between
              dark-blue, dark and light with the toggle and confirm that all
              surfaces, text and P&amp;L semantics update without a flash.
            </p>
          </div>
          <ThemeToggle />
        </header>

        {/* Surfaces card */}
        <Card className="border-border bg-surface">
          <CardHeader>
            <CardTitle className="font-heading">Surfaces &amp; borders</CardTitle>
            <CardDescription>
              Card = <code className="font-mono text-xs">bg-surface</code>,
              inner panel = <code className="font-mono text-xs">bg-surface-raised</code>,
              borders = <code className="font-mono text-xs">border-border</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <p className="text-sm font-medium">
                Raised panel — text-primary on surface-raised
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Muted paragraph — text-muted-foreground, for secondary
                descriptions and captions across the app.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <span className="text-sm text-warning">
                Warning — daily loss limit at 87%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* P&L semantics */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Net profit (session)
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-profit">
              +1 250.00
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Net loss (session)
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-loss">
              -318.40
            </p>
          </div>
        </section>

        {/* Numbers table */}
        <section className="rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Trade</th>
                <th className="px-4 py-3 font-medium">Instrument</th>
                <th className="px-4 py-3 text-right font-medium">Entry</th>
                <th className="px-4 py-3 text-right font-medium">Exit</th>
                <th className="px-4 py-3 text-right font-medium">P&amp;L</th>
                <th className="px-4 py-3 text-right font-medium">R</th>
              </tr>
            </thead>
            <tbody>
              {TRADE_ROWS.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-4 py-3 font-mono tabular-nums">{row.id}</td>
                  <td className="px-4 py-3">{row.instrument}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {row.entry}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {row.exit}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono tabular-nums font-medium ${
                      row.win ? "text-profit" : "text-loss"
                    }`}
                  >
                    {row.pnl}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono tabular-nums ${
                      row.win ? "text-profit" : "text-loss"
                    }`}
                  >
                    {row.r}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Buttons */}
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-heading text-lg font-semibold">Buttons</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Primary uses <code className="font-mono text-xs">bg-primary</code>;
            accent uses <code className="font-mono text-xs">bg-accent</code> with{" "}
            <code className="font-mono text-xs">hover:bg-accent-hover</code>.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent-hover"
            >
              Accent
            </Button>
            <Button variant="outline">Outline</Button>
            <Button disabled>Disabled</Button>
          </div>
        </section>

        <footer className="pb-4 text-center font-mono text-xs tabular-nums text-muted-foreground">
          cosmoz v{COSMOZ_VERSION} — foundation build · default theme:
          dark-blue
        </footer>
      </div>
    </main>
  );
}
