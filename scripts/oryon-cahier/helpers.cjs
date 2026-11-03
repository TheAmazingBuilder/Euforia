/**
 * Helpers de génération - Cahier des charges Oryon (skill docx, recette R4 + palette GO-1).
 * Un seul point de vérité du contenu : les blocs structurés sont rendus en docx ET en markdown.
 */
const {
  Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  TableLayoutType, VerticalAlign,
} = require("docx");

// ── Palette GO-1 (Graphite Orange - proposals, bidding, PRD) ────────────────
const P = {
  bg: "1A2330",
  accent: "D4875A",
  primary: "1A2330",           // titres du corps (graphite foncé - variante assombrie du bg)
  body: "000000",              // corps de texte : noir pur (profil A formel)
  secondary: "595959",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "D4875A", headerText: "FFFFFF", accentLine: "D4875A", innerLine: "DDD0C8", surface: "F8F0EB" },
};

// ── Bordures (règle non négociable : allNoBorders explicite sur les tables de couverture) ──
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ── Typographie (document français - profil formel A, Times New Roman partout) ──
const FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: "SimSun" };

/** Convertit un texte « avec du **gras** inline » en TextRun docx (backticks markdown retirés). */
function runs(text, opts = {}) {
  const size = opts.size ?? 24;
  const color = opts.color ?? P.body;
  const parts = String(text).replace(/`/g, "").split("**");
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "") continue;
    out.push(new TextRun({
      text: parts[i],
      bold: i % 2 === 1 ? true : (opts.bold ?? false),
      italics: opts.italics ?? false,
      size, color, font: FONT,
    }));
  }
  return out;
}

// ── Constructeurs de blocs docx ──────────────────────────────────────────────
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160, line: 312 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 4 } },
    children: [new TextRun({ text, bold: true, size: 32, color: P.primary, font: FONT })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 28, color: P.primary, font: FONT })],
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 312 },
    children: runs(text, opts),
  });
}

/** Élément de liste - aligné à GAUCHE (jamais justifié), un item par ligne. */
function listItem(text, opts = {}) {
  const base = {
    alignment: AlignmentType.LEFT,
    spacing: { after: 80, line: 312 },
    children: runs(text, { size: 24 }),
  };
  if (opts.numbered) base.numbering = { reference: opts.numbered, level: 0 };
  else base.bullet = { level: 0 };
  return new Paragraph(base);
}

/** Légende de tableau - keepNext pour rester soudée à sa table. */
function caption(text) {
  return new Paragraph({
    keepNext: true,
    alignment: AlignmentType.LEFT,
    spacing: { before: 200, after: 80, line: 312 },
    children: runs("**" + text + "**", { size: 21, color: P.primary }),
  });
}

const CELL_MARGINS = { top: 60, bottom: 60, left: 120, right: 120 };

function cell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.PERCENTAGE },
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 0, line: 312 },
      children: runs(text, { size: 20, color: opts.color ?? P.body, bold: opts.bold ?? false }),
    })],
  });
}

/** Tableau de données - en-tête répété, lignes insécables, largeurs en pourcentage. */
function dataTable(headers, rows, widths) {
  const w = widths ?? headers.map(() => Math.floor(100 / headers.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: P.table.innerLine },
      insideVertical: NB,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((htext, i) => cell("**" + htext + "**", {
          width: w[i], fill: P.table.headerBg, color: P.table.headerText, bold: true,
        })),
      }),
      ...rows.map((row, r) => new TableRow({
        cantSplit: true,
        children: row.map((c, i) => cell(c, {
          width: w[i],
          fill: r % 2 === 1 ? P.table.surface : undefined,
        })),
      })),
    ],
  });
}

/** Rend une liste de blocs structurés en éléments docx. */
function renderDocx(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.t === "h1") out.push(h1(b.x));
    else if (b.t === "h2") out.push(h2(b.x));
    else if (b.t === "p") out.push(para(b.x, b.o ?? {}));
    else if (b.t === "ul") b.items.forEach((it) => out.push(listItem(it)));
    else if (b.t === "ol") b.items.forEach((it) => out.push(listItem(it, { numbered: b.ref })));
    else if (b.t === "table") {
      if (b.caption) out.push(caption(b.caption));
      out.push(dataTable(b.headers, b.rows, b.widths));
      out.push(new Paragraph({ spacing: { after: 120, line: 312 }, children: [] }));
    }
  }
  return out;
}

/** Rend les mêmes blocs en markdown (copie docs/oryon, source de vérité versionnée). */
function renderMd(blocks, title, meta) {
  const lines = ["# " + title, ""];
  meta.forEach((m) => lines.push("> " + m));
  lines.push("");
  let tableIndex = 0;
  for (const b of blocks) {
    if (b.t === "h1") { lines.push("## " + b.x, ""); tableIndex = 0; }
    else if (b.t === "h2") { lines.push("### " + b.x, ""); }
    else if (b.t === "p") { lines.push(b.x, ""); }
    else if (b.t === "ul") { b.items.forEach((it) => lines.push("- " + it)); lines.push(""); }
    else if (b.t === "ol") { b.items.forEach((it, i) => lines.push((i + 1) + ". " + it)); lines.push(""); }
    else if (b.t === "table") {
      tableIndex += 1;
      if (b.caption) lines.push("**" + b.caption + "**", "");
      const esc = (s) => String(s).replace(/\|/g, "\\|");
      lines.push("| " + b.headers.map(esc).join(" | ") + " |");
      lines.push("|" + b.headers.map(() => "---").join("|") + "|");
      b.rows.forEach((row) => lines.push("| " + row.map(esc).join(" | ") + " |"));
      lines.push("");
    }
  }
  return lines.join("\n");
}

module.exports = { P, NB, noBorders, allNoBorders, FONT, runs, h1, h2, para, listItem, caption, cell, dataTable, renderDocx, renderMd };
