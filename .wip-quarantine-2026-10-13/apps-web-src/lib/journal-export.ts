/**
 * Journal PDF export — typesets the written log the way "Le Registre" reads
 * on paper: a date margin, ruled hairlines, mono annotations and honest
 * outcomes. Generated client-side with jsPDF (lazy-imported on click); the
 * export mirrors exactly what the on-screen filters currently show.
 */

export interface JournalExportLink {
  symbol: string;
  side: "long" | "short";
  /** "+1.76R" for closed executions, "open" otherwise. */
  outcome: string;
}

export interface JournalExportItem {
  /** Trading-date key (YYYY-MM-DD). */
  date: string;
  title: string;
  body: string;
  tags: string[];
  mood: string | null;
  linked: JournalExportLink | null;
}

export interface JournalExportMeta {
  fileName: string;
  /** Human note about the active filters, printed under the header. */
  filtersNote?: string;
}

const INK = { r: 26, g: 29, b: 38 };
const MUTED = { r: 107, g: 114, b: 128 };
const HAIRLINE = { r: 214, g: 213, b: 206 };
const ACCENT = { r: 46, g: 107, b: 246 };

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function dateLabel(dateKey: string): { margin: string; long: string } {
  const asUtc = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(asUtc.getTime())) return { margin: dateKey, long: dateKey };
  const day = String(asUtc.getUTCDate()).padStart(2, "0");
  const month = MONTHS[asUtc.getUTCMonth()]!;
  const weekday = WEEKDAYS[asUtc.getUTCDay()]!;
  return { margin: `${day} ${month}`, long: `${day} ${month} ${asUtc.getUTCFullYear()} — ${weekday}` };
}

/**
 * Build the PDF and hand it to the browser as a download. Returns the page
 * count for the success toast. Throws when generation fails — the caller
 * owns the error toast.
 */
export async function exportJournalPdf(
  items: JournalExportItem[],
  meta: JournalExportMeta,
): Promise<number> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const marginDate = 17; // the ledger margin column
  const contentX = marginX + marginDate;
  const contentW = pageW - contentX - marginX;
  const topFirst = 30;
  const topNext = 22;
  const bottomLimit = pageH - 20;

  let y = topFirst;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = topNext;
    }
  };

  // ── Header (first page only) ─────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(INK.r, INK.g, INK.b);
  doc.text("COSMOZ", marginX, 14);

  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text("TRADING JOURNAL - LE REGISTRE", marginX + 24, 14);

  const stamp = new Date().toISOString().slice(0, 10);
  doc.text(`${items.length} ${items.length === 1 ? "entry" : "entries"} - exported ${stamp}`, pageW - marginX, 14, {
    align: "right",
  });

  if (meta.filtersNote) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
    doc.text(`Filtered view: ${meta.filtersNote}`, marginX, 19.5);
  }

  doc.setDrawColor(HAIRLINE.r, HAIRLINE.g, HAIRLINE.b);
  doc.setLineWidth(0.3);
  doc.line(marginX, 22.5, pageW - marginX, 22.5);

  // ── Entries ──────────────────────────────────────────────────────────────
  for (const item of items) {
    const { long } = dateLabel(item.date);
    const bodyLines: string[] = doc.splitTextToSize(item.body, contentW - 2);
    const titleLines: string[] = doc.splitTextToSize(item.title, contentW - 2);
    const metaParts = [
      item.tags.map((tag) => `#${tag}`).join(" "),
      item.mood ? `mood: ${item.mood}` : null,
      item.linked ? `trade: ${item.linked.symbol} ${item.linked.side} ${item.linked.outcome}` : null,
    ].filter((part): part is string => part !== null);
    const metaLines: string[] = metaParts.length
      ? doc.splitTextToSize(metaParts.join("   "), contentW - 2)
      : [];

    const blockHeight =
      5 + titleLines.length * 5.4 + metaLines.length * 4.2 + bodyLines.length * 4.3 + 9;
    ensureSpace(blockHeight);

    // Date margin — the ledger column.
    doc.setFont("courier", "bold");
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(long, marginX, y + 3.4);

    const textY = y + 3.4;

    // Title.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(INK.r, INK.g, INK.b);
    titleLines.forEach((line, index) => {
      doc.text(line, contentX, textY + 4 + index * 5.4);
    });
    y = textY + 4 + titleLines.length * 5.4;

    // Meta line — annotations in mono, wrapped like the body.
    doc.setFont("courier", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    metaLines.forEach((line) => {
      y += 4.2;
      doc.text(line, contentX, y);
    });

    // Body.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(INK.r, INK.g, INK.b);
    bodyLines.forEach((line) => {
      y += 4.3;
      doc.text(line, contentX, y);
    });
    y += 4;

    // Ruled hairline between entries.
    ensureSpace(6);
    doc.setDrawColor(HAIRLINE.r, HAIRLINE.g, HAIRLINE.b);
    doc.setLineWidth(0.25);
    doc.line(marginX, y, pageW - marginX, y);
    y += 7.5;
  }

  // ── Footers (every page) ─────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(HAIRLINE.r, HAIRLINE.g, HAIRLINE.b);
    doc.setLineWidth(0.25);
    doc.line(marginX, pageH - 14, pageW - marginX, pageH - 14);
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text("cosmoz - the trading register", marginX, pageH - 10);
    doc.text(`Page ${page} / ${total}`, pageW - marginX, pageH - 10, { align: "right" });
  }

  doc.save(meta.fileName);
  return total;
}
