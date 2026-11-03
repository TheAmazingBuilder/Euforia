/** Générateur - Cahier des charges Oryon (skill docx : recette R4 + GO-1, 3 sections, TDM). */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, NumberFormat, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, TableLayoutType, SectionType,
  TableOfContents, LevelFormat, PageOrientation,
} = require("docx");
const fs = require("fs");
const path = require("path");

const H = require("./helpers.cjs");
const { P, NB, noBorders, allNoBorders, FONT } = H;

const blocks = [
  ...require("./content1.cjs"),
  ...require("./content2.cjs"),
  ...require("./content3.cjs"),
  ...require("./content4.cjs"),
];

// ── Helpers de titre de couverture (design-system.md - code obligatoire) ────
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."，。、；：！？", ..."的与和及之在于为", ..."-_-–·/", ..." \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) {
      breakAt = charsPerLine;
      const prevChar = remaining[breakAt - 1];
      const nextChar = remaining[breakAt];
      if (prevChar && nextChar && !breakAfter.has(prevChar) && !breakAfter.has(nextChar) &&
          /[\u4e00-\u9fff]/.test(prevChar) && /[\u4e00-\u9fff]/.test(nextChar)) breakAt -= 1;
    }
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += last;
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 20;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt;
  let lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLines(title, charsPerLine(minPt));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

const emptyPara = () => new Paragraph({ spacing: { before: 0, after: 0 }, children: [] });

// ── Recette R4 : Top Color Block (design-system.md - code validé, non modifié) ──
function buildCoverR4(config) {
  const Pal = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR;

  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 26);
  const titleSize = titlePt * 2;

  const titleBlockHeight = titleLines.length * (titlePt * 23 + 200);
  const englishLabelH = config.englishLabel ? (9 * 23 + 500) : 0;
  const subtitleH = config.subtitle ? (12 * 23 + 200) : 0;
  const upperContentH = englishLabelH + titleBlockHeight + subtitleH;
  const UPPER_MIN = 7500;
  const UPPER_H = Math.max(UPPER_MIN, upperContentH + 1500 + 800);
  const DIVIDER_H = 60;

  const contentEstimate =
    (config.englishLabel ? (9 * 23 + 500) : 0) +
    titleLines.length * (titlePt * 23 + 200) +
    (config.subtitle ? (12 * 23 + 200) : 0);
  const spacerIntrinsic = 280;
  const topSpacing = Math.max(UPPER_H - contentEstimate - spacerIntrinsic - 800, 400);

  const upperBlock = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: UPPER_H, rule: "exact" },
      children: [new TableCell({
        shading: { fill: Pal.bg }, borders: noBorders,
        verticalAlign: "top",
        margins: { left: padL, right: padR },
        children: [
          new Paragraph({ spacing: { before: topSpacing } }),
          config.englishLabel ? new Paragraph({
            spacing: { after: 500 },
            children: [new TextRun({ text: config.englishLabel.split("").join(" "),
              size: 18, color: Pal.accent, font: { ascii: "Calibri" }, characterSpacing: 60 })],
          }) : null,
          ...titleLines.map((line, i) => new Paragraph({
            spacing: { after: i < titleLines.length - 1 ? 100 : 200, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
            children: [new TextRun({ text: line, size: titleSize, bold: true,
              color: Pal.cover.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
          })),
          config.subtitle ? new Paragraph({
            spacing: { after: 100, line: 312 },
            children: [new TextRun({ text: config.subtitle, size: 24, color: Pal.cover.subtitleColor,
              font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
          }) : null,
        ].filter(Boolean),
      })],
    })],
  });

  const divider = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: DIVIDER_H, rule: "exact" },
      children: [new TableCell({ borders: noBorders,
        shading: { fill: Pal.accent }, children: [emptyPara()] })],
    })],
  });

  const lowerContent = [
    new Paragraph({ spacing: { before: 800 } }),
    ...(config.metaLines || []).map(line => new Paragraph({
      indent: { left: padL }, spacing: { after: 100, line: 312 },
      children: [new TextRun({ text: line, size: 28, color: Pal.cover.metaColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    })),
    new Paragraph({ spacing: { before: 2000 } }),
    new Paragraph({
      indent: { left: padL },
      children: [
        new TextRun({ text: config.footerLeft || "", size: 22, color: "909090", font: { ascii: "Arial" } }),
        new TextRun({ text: "          " }),
        new TextRun({ text: config.footerRight || "", size: 22, color: "909090", font: { ascii: "Arial" } }),
      ],
    }),
  ];

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { fill: "FFFFFF" }, borders: noBorders,
        verticalAlign: "top",
        children: [upperBlock, divider, ...lowerContent],
      })],
    })],
  })];
}

// ── Pieds de page / en-têtes (instances distinctes → footer1/footer2) ───────
const pageFooter = () => new Footer({ children: [new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: FONT })],
})] });
const docHeader = () => new Header({ children: [new Paragraph({
  alignment: AlignmentType.RIGHT,
  children: [new TextRun({ text: "Oryon - Cahier des charges", size: 18, color: "808080", font: FONT })],
})] });

// ── Configuration ────────────────────────────────────────────────────────────
const pgSize = { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

const coverConfig = {
  englishLabel: "CAHIER DES CHARGES",
  title: "Module Oryon",
  subtitle: "Station d'analyse graphique de trading - spécification fonctionnelle et technique",
  metaLines: [
    "Application : Euforia - client web (Next.js)",
    "Module : Oryon - station d'analyse graphique",
    "Statut : Proposition v1.0 - à valider",
    "Date : 10 octobre 2026",
  ],
  footerLeft: "Euforia - document de travail",
  footerRight: "Lecture seule par conception",
  palette: P,
};

// ── Document ─────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Euforia",
  title: "Cahier des charges - Module Oryon",
  description: "Spécification fonctionnelle et technique du module Oryon (station d'analyse graphique, lecture seule)",
  styles: { default: {
    document: {
      run: { font: FONT, size: 24, color: "000000" },
      paragraph: { spacing: { line: 312 } },
    },
    heading1: {
      run: { font: FONT, size: 32, bold: true, color: P.primary },
      paragraph: { spacing: { before: 360, after: 160, line: 312 }, outlineLevel: 0 },
    },
    heading2: {
      run: { font: FONT, size: 28, bold: true, color: P.primary },
      paragraph: { spacing: { before: 240, after: 120, line: 312 }, outlineLevel: 1 },
    },
  }},
  numbering: { config: [
    { reference: "list-verif", levels: [{
      level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720, hanging: 360 } } },
    }] },
  ]},
  sections: [
    { // Section 1 - Couverture (marges 0, aucun pied de page, pas de pageNumbers)
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR4(coverConfig),
    },
    { // Section 2 - Table des matières (romains, redémarre à I)
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      headers: { default: docHeader() },
      footers: { default: pageFooter() },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 360, line: 312 },
          children: [new TextRun({ text: "Table des matières", bold: true, size: 32, color: P.primary, font: FONT })],
        }),
        new TableOfContents("Table des matières", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({
          spacing: { before: 200, line: 312 },
          children: [new TextRun({
            text: "Remarque : cette table des matières est générée par champs. Après toute modification du document, cliquez droit sur la table puis choisissez « Mettre à jour les champs » pour actualiser les numéros de page.",
            italics: true, size: 18, color: "888888", font: FONT,
          })],
        }),
      ],
    },
    { // Section 3 - Corps (arabes, redémarre à 1)
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: docHeader() },
      footers: { default: pageFooter() },
      children: H.renderDocx(blocks),
    },
  ],
});

// ── Sorties ──────────────────────────────────────────────────────────────────
const OUT_DOCX = "/home/z/my-project/download/Oryon-Cahier-des-charges-v1.0.docx";
const OUT_MD = "/home/z/my-project/docs/oryon/cahier-des-charges.md";

const metaMd = [
  "Statut : Proposition v1.0 - à valider",
  "Date : 10 octobre 2026",
  "Application : Euforia - client web (Next.js)",
  "Contrainte cardinale : lecture seule",
];

Packer.toBuffer(doc).then((buf) => {
  fs.mkdirSync(path.dirname(OUT_DOCX), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_DOCX, buf);
  fs.writeFileSync(OUT_MD, H.renderMd(blocks, "Cahier des charges - Module Oryon", metaMd));
  const counts = blocks.reduce((acc, b) => { acc[b.t] = (acc[b.t] || 0) + 1; return acc; }, {});
  console.log("DOCX écrit :", OUT_DOCX, "(" + buf.length + " octets)");
  console.log("MD écrit :", OUT_MD);
  console.log("Blocs :", JSON.stringify(counts));
}).catch((e) => { console.error("ÉCHEC :", e); process.exit(1); });
