// export-journal-sample.mts — génère un PDF d'échantillon via le MÊME builder
// que l'app (lib/pdf/journal-pdf.ts) pour contrôle visuel.
// Usage : cd apps/web && npx -y tsx ../scripts/export-journal-sample.mts
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const webRequire = createRequire("/home/z/my-project/apps/web/package.json");
const PdfMake = webRequire("pdfmake/build/pdfmake");
const vfsModule = webRequire("pdfmake/build/vfs_fonts");
// 0.2.20: the module IS the vfs ({ 'Roboto-Regular.ttf': base64, ... }).
const vfs = (vfsModule as { default?: unknown }).default ?? vfsModule;
(PdfMake as { vfs: unknown }).vfs = vfs;

const { buildJournalPdfDoc } = await import(
  "/home/z/my-project/apps/web/src/lib/pdf/journal-pdf.ts"
);
const { buildJournalInput, buildWeeklyInput } = await import(
  "/home/z/my-project/apps/web/src/lib/pdf/export-inputs.ts"
);

const logo = `data:image/png;base64,${readFileSync(
  "/home/z/my-project/apps/web/src/app/apple-icon.png",
).toString("base64")}`;

// ── Fixture réaliste (structure identique aux données des hooks) ──
const instruments = [
  { id: "i1", symbol: "GBPUSD" },
  { id: "i2", symbol: "XAUUSD" },
  { id: "i3", symbol: "BOOM500" },
];
const strategies = [
  { id: "s1", name: "London breakout" },
  { id: "s2", name: "Trend pullback" },
];
const mk = (
  date: string,
  instrumentId: string,
  direction: "BUY" | "SELL",
  entry: string,
  exit: string,
  r: string,
  pnl: string,
  grade: "A" | "B" | "C" | "D" | "F" | null,
  strategyId: string | null,
  notes: string | null = null,
  lessons: string | null = null,
) => ({
  id: Math.random().toString(),
  instrumentId,
  direction,
  entryPrice: entry,
  exitPrice: exit,
  quantity: "1",
  rMultiple: r,
  pnlNet: pnl,
  decisionGrade: grade,
  status: "CLOSED" as const,
  strategyId,
  notes,
  lessons,
  followedPlan: true,
  tradingDate: date,
});

const trades = [
  mk("2026-09-21", "i1", "BUY", "1.2680", "1.2712", "2.64", "845.20", "A", "s1",
    "Clean break of the London range after NFP drift. Waited for the retest instead of chasing.", "Patience on the retest is what paid — chasing costs me."),
  mk("2026-09-21", "i2", "SELL", "4285.5", "4311.0", "-1.04", "-380.00", "C", "s2",
    "Shorted strength into resistance but the daily trend was still bullish."),
  mk("2026-09-22", "i1", "SELL", "1.2705", "1.2679", "1.12", "395.50", "B", "s1"),
  mk("2026-09-23", "i3", "BUY", "15020", "14890", "-2.10", "-560.00", "F", null,
    "Averaged down on a spike — doubled the risk the plan allowed.", "Never widen risk on BOOM/CRASH. Cut it."),
  mk("2026-09-24", "i2", "BUY", "4268.0", "4302.5", "1.58", "620.00", "A", "s2"),
];

const currency = "USD";

// ── Journal complet ──
const journalInput = buildJournalInput({ trades, instruments, strategies, currency, logoDataUrl: logo });
const journalDoc = buildJournalPdfDoc(journalInput);
const journalBuffer: Buffer = await new Promise((resolve, reject) => {
  PdfMake.createPdf(journalDoc).getBuffer((buffer: Buffer) => resolve(buffer));
});
mkdirSync("/home/z/my-project/apps/web/scripts/shots/t16b", { recursive: true });
writeFileSync("/home/z/my-project/apps/web/scripts/shots/t16b/journal-export-sample.pdf", journalBuffer);
console.log("journal sample:", journalBuffer.length, "octets");

// ── Weekly report ──
const weeklyInput = buildWeeklyInput({ trades, instruments, strategies, currency, logoDataUrl: logo });
const weeklyDoc = buildJournalPdfDoc(weeklyInput);
const weeklyBuffer: Buffer = await new Promise((resolve, reject) => {
  PdfMake.createPdf(weeklyDoc).getBuffer((buffer: Buffer) => resolve(buffer));
});
writeFileSync("/home/z/my-project/apps/web/scripts/shots/t16b/weekly-export-sample.pdf", weeklyBuffer);
console.log("weekly sample:", weeklyBuffer.length, "octets");
console.log("OK");
