/**
 * Journal PDF export — the Cosmoz trading journal as a printable A4 document.
 *
 * Design follows the "Le Registre" design language: a restrained 4-ink
 * semantic palette (cobalt accent, profit green, loss red, warning ocre) on
 * neutral grays, a clear typographic hierarchy, ledger tables with repeating
 * headers and zebra rows, and a paginated footer. No decoration for
 * decoration's sake — the numbers are the design.
 *
 * The builder is pure (no DOM, no window) so the exact same document
 * definition runs in the browser (pdfmake download) and in Node (sample
 * generation for visual QA).
 */
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Currency } from "@cosmoz/shared";
import {
  formatPrice,
  formatR,
  formatSignedMoney,
} from "@cosmoz/shared";

// ── Palette (restrained, semantic) ───────────────────────────────────────────
const INK = "#0f172a";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const BORDER = "#e2e8f0";
const ZEBRA = "#f8fafc";
const COBALT = "#1b3fb8";
const COBALT_SOFT = "#eef2ff";
const PROFIT = "#059669";
const LOSS = "#dc2626";

const CONTENT_WIDTH = 595.28 - 42 * 2; // A4 minus symmetric margins

// ── Input model ──────────────────────────────────────────────────────────────

export interface JournalPdfTrade {
  tradingDate: string;
  symbol: string;
  direction: string;
  entryPrice: string | null;
  exitPrice: string | null;
  quantity: string | null;
  rMultiple: string | null;
  pnlNet: string | null;
  decisionGrade: string | null;
  status: string;
  strategyName: string | null;
  notes: string | null;
  lessons: string | null;
}

export interface JournalPdfSummaryItem {
  label: string;
  value: string;
  tone?: "neutral" | "profit" | "loss";
}

export interface JournalPdfInput {
  /** Document headline, e.g. "Trading journal" or "Weekly report". */
  title: string;
  /** One-line context under the headline, e.g. "Sep 19 – Sep 25 · 12 trades". */
  subtitle: string;
  currency: Currency;
  /** File name without extension. */
  fileName: string;
  /** Rasterized brand mark (PNG dataURL). Optional. */
  logoDataUrl?: string;
  /** Optional opening paragraph (the auto-written weekly sentence). */
  lead?: string | null;
  /** Key figures under the headline. */
  summary?: JournalPdfSummaryItem[];
  /** Optional comparison line (weekly report). */
  comparison?: string | null;
  /** Rows of the trade log table. */
  trades: JournalPdfTrade[];
  /** Print the notes & lessons section (journal exports). */
  includeNotes?: boolean;
}

// ── Small helpers ────────────────────────────────────────────────────────────

const toneColor = (tone: JournalPdfSummaryItem["tone"]): string =>
  tone === "profit" ? PROFIT : tone === "loss" ? LOSS : INK;

/**
 * The embedded Roboto subset lacks the narrow no-break space (U+202F) that
 * fr-FR Intl uses for digit grouping — normalize it to a plain space.
 */
const pdfSafe = (text: string): string => text.replace(/[\u202F\u00A0]/g, " ");

/** Adaptive price format: FX ticks get 4 decimals, larger instruments 2. */
function priceCell(price: string | null): string {
  if (price === null) return "—";
  const value = Number(price);
  return pdfSafe(formatPrice(price, Number.isFinite(value) && Math.abs(value) >= 100 ? 2 : 4));
}

/** Trade-log table body rows (money/R coloring happens per cell). */
function tradeRows(
  trades: JournalPdfTrade[],
  currency: Currency,
): TableCell[][] {
  return trades.map((trade) => {
    const closed = trade.status === "CLOSED";
    const rText = closed ? formatR(trade.rMultiple) : "—";
    const pnlText = closed
      ? pdfSafe(formatSignedMoney(trade.pnlNet, currency, { digits: 2 }))
      : "open";
    const pnlValue = trade.pnlNet === null ? 0 : Number(trade.pnlNet);
    const rValue = trade.rMultiple === null ? 0 : Number(trade.rMultiple);
    return [
      { text: trade.tradingDate, color: INK },
      { text: trade.symbol, color: INK },
      { text: trade.direction, color: trade.direction === "BUY" ? PROFIT : LOSS },
      {
        text: trade.entryPrice === null ? "—" : priceCell(trade.entryPrice),
        color: INK,
      },
      { text: trade.exitPrice === null ? "—" : priceCell(trade.exitPrice), color: INK },
      {
        text: rText,
        color: closed && trade.rMultiple !== null ? (rValue >= 0 ? PROFIT : LOSS) : MUTED,
      },
      { text: pnlText, color: closed ? (pnlValue >= 0 ? PROFIT : LOSS) : MUTED },
      { text: trade.decisionGrade ?? "—", color: MUTED },
      { text: trade.strategyName ?? "Out of playbook", color: MUTED },
    ];
  });
}

// ── Document builder ─────────────────────────────────────────────────────────

export function buildJournalPdfDoc(input: JournalPdfInput): TDocumentDefinitions {
  const { currency } = input;
  const generatedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());

  // Running header (pages ≥ 2): brand + context + hairline.
  const headerTable: Content = {
    stack: [
      {
        columns: [
          ...(input.logoDataUrl
            ? [{ width: 22, height: 22, image: input.logoDataUrl, alignment: "left" as const }]
            : []),
          {
            width: "*",
            margin: input.logoDataUrl ? [8, 2, 0, 0] : [0, 2, 0, 0],
            stack: [
              { text: "COSMOZ", fontSize: 11, bold: true, characterSpacing: 3, color: INK },
              { text: "Trading journal", fontSize: 7.5, color: MUTED, margin: [0, 1, 0, 0] },
            ],
          },
          {
            width: "auto",
            stack: [
              { text: input.subtitle, fontSize: 8, color: MUTED, alignment: "right" as const, margin: [0, 2, 0, 0] },
              { text: `Generated ${generatedAt}`, fontSize: 7.5, color: FAINT, alignment: "right" as const, margin: [0, 2, 0, 0] },
            ],
          },
        ],
      },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.8, lineColor: BORDER }],
        margin: [0, 6, 0, 0],
      },
    ],
    margin: [0, 0, 0, 10],
  };

  // Headline block — the first page's record card.
  // (single-cell row: cast through unknown — @types disallow stack+margin+fill
  // on one TableCell, but pdfmake's runtime supports all three.)
  const headline: Content = {
    table: {
      widths: ["*"],
      body: [
        [
          {
            fill: COBALT,
            margin: [14, 12, 14, 12],
            stack: [
              { text: input.title, fontSize: 20, bold: true, color: "#ffffff", characterSpacing: 0.5 },
              { text: input.subtitle, fontSize: 9, color: "#dbe4ff", margin: [0, 5, 0, 0] },
            ],
          } as unknown as TableCell,
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => COBALT,
    },
    margin: [0, 0, 0, 14],
  };

  const leadBlock: Content | null = input.lead
    ? {
        table: {
          widths: ["*"],
          body: [
            [
              {
                fill: COBALT_SOFT,
                margin: [10, 8, 10, 8],
                text: pdfSafe(input.lead),
                fontSize: 9,
                lineHeight: 1.35,
                color: INK,
              } as unknown as TableCell,
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          fillColor: () => COBALT_SOFT,
        },
        margin: [0, 0, 0, 8],
      }
    : null;

  // Summary register — label/value pairs in two balanced columns.
  // (pdfmake's @types are stricter than the runtime — cast the composite block.)
  const summaryBlock: Content[] = (input.summary && input.summary.length > 0
    ? (() => {
        const half = Math.ceil(input.summary.length / 2);
        const left = input.summary.slice(0, half);
        const right = input.summary.slice(half);
        const renderItem = (item: JournalPdfSummaryItem, offset: boolean) => ({
          columns: [
            // Fixed label width: "auto" under-measures and wraps labels.
            { width: 96, text: item.label, fontSize: 8.5, color: MUTED, margin: [offset ? 10 : 0, 1.5, 8, 1.5] as [number, number, number, number] },
            { width: "*", text: pdfSafe(item.value), fontSize: 9, bold: true, color: toneColor(item.tone), alignment: "right" as const, margin: [0, 1.5, 0, 1.5] as [number, number, number, number] },
          ],
        });
        return [
          { text: "PERFORMANCE SUMMARY", fontSize: 9, bold: true, characterSpacing: 2, color: MUTED, margin: [0, 2, 0, 7] },
          {
            columns: [
              { width: "*", stack: left.map((item) => renderItem(item, false)) },
              { width: "*", stack: right.map((item) => renderItem(item, true)) },
            ],
            margin: [0, 0, 0, 14],
          },
        ];
      })()
    : []) as Content[];

  const comparisonBlock: Content[] = input.comparison
    ? [{ text: pdfSafe(input.comparison), fontSize: 8.5, color: MUTED, margin: [0, 0, 0, 14] }]
    : [];

  // ── Trade log table ──
  const tableHeader: TableCell[] = ["Date", "Instrument", "Dir", "Entry", "Exit", "R", "Net P&L", "Grade", "Strategy"].map(
    (text) => ({ text, bold: true, color: "#ffffff", fontSize: 7.5 }),
  );

  const columnWidths = [52, 58, 26, 50, 50, 46, 56, 30, 143];
  const columnWidthSum = columnWidths.reduce((sum, width) => sum + width, 0);
  if (columnWidthSum > CONTENT_WIDTH) {
    // Overflow guard (skill rule: never exceed the content width).
    const scale = CONTENT_WIDTH / columnWidthSum;
    for (let index = 0; index < columnWidths.length; index += 1) {
      columnWidths[index] = Math.floor(columnWidths[index]! * scale);
    }
  }

  const tradeLog: Content[] = [
    {
      text: input.includeNotes === false ? "TRADES THIS WEEK" : "TRADE LOG",
      fontSize: 9,
      bold: true,
      characterSpacing: 2,
      color: MUTED,
      margin: [0, 4, 0, 7],
    },
    {
      table: {
        widths: columnWidths,
        headerRows: 1,
        dontBreakRows: true,
        body: [tableHeader, ...tradeRows(input.trades, currency)],
      },
      layout: {
        hLineWidth: (rowIndex: number) => (rowIndex >= 1 ? 0.8 : 0),
        vLineWidth: () => 0,
        hLineColor: () => BORDER,
        fillColor: (rowIndex: number) =>
          rowIndex === 0 ? COBALT : rowIndex % 2 === 0 ? ZEBRA : null,
        paddingLeft: () => 5,
        paddingRight: () => 5,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      fontSize: 7.8,
    },
    ...(input.trades.length === 0
      ? [{ text: "No trade to report for this period.", fontSize: 9, color: MUTED, margin: [0, 6, 0, 0] as [number, number, number, number] }]
      : []),
  ];

  // ── Notes & lessons (journal exports) ──
  const notedTrades = input.trades.filter(
    (trade) => (trade.notes !== null && trade.notes !== "") || (trade.lessons !== null && trade.lessons !== ""),
  );
  const notesBlock: Content[] =
    input.includeNotes === true
      ? [
          {
            text: "JOURNAL — NOTES & LESSONS",
            fontSize: 9,
            bold: true,
            characterSpacing: 2,
            color: MUTED,
            margin: [0, 18, 0, 7],
            pageBreak: "before",
          },
          ...(notedTrades.length === 0
            ? [{ text: "No notes recorded for this period.", fontSize: 9, color: MUTED }]
            : notedTrades.map((trade) => {
                const parts: Content[] = [
                  {
                    text: `${trade.symbol} · ${trade.tradingDate}${trade.strategyName ? ` · ${trade.strategyName}` : ""}`,
                    fontSize: 8.5,
                    bold: true,
                    color: INK,
                    margin: [0, 0, 0, 2],
                  },
                ];
                if (trade.notes) {
                  parts.push({ text: trade.notes, fontSize: 8.5, color: MUTED, lineHeight: 1.3, margin: [0, 0, 0, 2] });
                }
                if (trade.lessons) {
                  parts.push({ text: `Lesson: ${trade.lessons}`, fontSize: 8.5, italics: true, color: COBALT, lineHeight: 1.3, margin: [0, 0, 0, 2] });
                }
                parts.push({
                  canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.5, lineColor: BORDER }],
                  margin: [0, 4, 0, 10],
                });
                return parts;
              })),
        ]
      : [];

  const content: Content[] = [
    headline,
    ...(leadBlock ? [leadBlock] : []),
    ...summaryBlock,
    ...comparisonBlock,
    ...tradeLog,
    ...notesBlock,
  ];

  return {
    defaultStyle: { font: "Roboto", color: INK },
    pageSize: "A4",
    pageMargins: [42, 46, 42, 52],
    info: {
      title: `Cosmoz — ${input.title}`,
      author: "Cosmoz",
      subject: "Trading journal export",
      creator: "Cosmoz",
    },
    header: (currentPage: number) => (currentPage > 1 ? headerTable : null),
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: "Cosmoz · trading journal export", fontSize: 7.5, color: FAINT, margin: [0, 6, 0, 0] },
        { text: `Page ${currentPage} / ${pageCount}`, fontSize: 7.5, color: FAINT, alignment: "right", margin: [0, 6, 0, 0] },
      ],
      margin: [42, 0, 42, 0],
    }),
    content,
  };
}

// ── Browser download ─────────────────────────────────────────────────────────

type PdfMakeClient = {
  vfs?: unknown;
  createPdf: (doc: TDocumentDefinitions) => { download: (fileName?: string) => void };
};

/** Rasterizes /icon.svg to a square PNG dataURL (browser only). */
export async function rasterizeBrandMark(size = 128): Promise<string> {
  const response = await fetch("/icon.svg");
  const svgText = await response.text();
  const blob = new Blob([svgText], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("brand mark rasterization failed"));
      element.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    context.drawImage(image, 0, 0, size, size);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Builds the document and triggers the browser download (lazy-loads pdfmake). */
export async function downloadPdf(input: JournalPdfInput): Promise<void> {
  const [{ default: PdfMake }, vfsModule] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts") as any,
  ]);
  const client = PdfMake as unknown as PdfMakeClient;
  // The vfs module shape varies across pdfmake builds — unwrap defensively.
  const unwrap = (module: unknown): unknown =>
    typeof module === "object" && module !== null && "default" in (module as any)
      ? (module as { default: unknown }).default
      : module;
  const inner = unwrap(vfsModule);
  const vfs = (inner as any)?.pdfMake?.vfs ?? (inner as any)?.vfs ?? inner;
  client.vfs = vfs;

  const doc = client.createPdf(buildJournalPdfDoc(input));
  doc.download(`${input.fileName}.pdf`);
}
