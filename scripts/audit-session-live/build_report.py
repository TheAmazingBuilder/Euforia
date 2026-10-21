#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Audit Session Live V1 — corps du rapport (ReportLab) + merge couverture.
Palette fixe Template 07 Crystal Blue (cover.md) — cobalt, famille bleue unique."""
import os, sys, hashlib

PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, CondPageBreak, KeepTogether, Image, HRFlowable)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from PIL import Image as PILImage

# ---------- Fonts (registered set only — FreeSerif pour le français) ----------
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans", f"{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf"))
registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold",
                   italic="FreeSerif-Italic", boldItalic="FreeSerif-BoldItalic")
registerFontFamily("DejaVuSans", normal="DejaVuSans", bold="DejaVuSans")

from pdf import install_font_fallback
install_font_fallback()

# ---------- Palette fixe Template 07 Crystal Blue (body, light) ----------
PAGE_BG      = colors.HexColor("#f5f8fc")   # XL
SECTION_BG   = colors.HexColor("#edf2f9")   # XL
CARD_BG      = colors.HexColor("#e4ecf5")   # L
TABLE_STRIPE = colors.HexColor("#eef3fa")   # L
HEADER_FILL  = colors.HexColor("#1a4a7a")   # M
BORDER       = colors.HexColor("#c0d0e2")   # S
ACCENT       = colors.HexColor("#2d7ab3")   # XS
TEXT_PRIMARY = colors.HexColor("#142840")
TEXT_MUTED   = colors.HexColor("#5a7a96")

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ---------- Document ----------
OUT_DIR   = "/home/z/my-project/scripts/audit-session-live"
BODY_PDF  = os.path.join(OUT_DIR, "body.pdf")
COVER_PDF = os.path.join(OUT_DIR, "cover.pdf")
FINAL_PDF = "/home/z/my-project/download/audit-session-live-v1.pdf"
DIAGRAM   = os.path.join(OUT_DIR, "diagram.png")

MARGIN = 1.0 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
DOC_TITLE = "Audit de conformité Session Live V1 — COSMOZ"

class AuditDoc(SimpleDocTemplate):
    """TOC cliquable + pagination en zones (TOC = romain, corps = arabe reset)."""
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self._front_offset = 1  # par défaut : 1 page de TOC

    def afterFlowable(self, flowable):
        if getattr(flowable, "_content_start_marker", False):
            self._front_offset = self.page - 1
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            shown = max(1, self.page - self._front_offset)
            self.notify("TOCEntry", (level, text, shown, key))

class ContentStartMarker(Spacer):
    _content_start_marker = True
    def __init__(self):
        super().__init__(0, 0)

ROMAN = {1: "i", 2: "ii", 3: "iii", 4: "iv", 5: "v", 6: "vi", 7: "vii", 8: "viii"}

def on_page(canvas, doc):
    canvas.saveState()
    # fond de page bleu très clair (palette T07)
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # en-tête : titre + filet accent
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.55 * inch, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.62 * inch, PAGE_W - MARGIN, PAGE_H - 0.62 * inch)
    # pied : auteur à gauche, numéro seul à droite (jamais de dénominateur)
    canvas.setFillColor(TEXT_MUTED)
    canvas.setFont("FreeSerif", 7.5)
    canvas.drawString(MARGIN, 0.5 * inch, "Le Registre · Audit technique interne")
    offset = getattr(doc, "_front_offset", 1)
    if doc.page <= offset:
        num = ROMAN.get(doc.page, str(doc.page))
    else:
        num = str(doc.page - offset)
    canvas.drawRightString(PAGE_W - MARGIN, 0.5 * inch, num)
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.restoreState()

# ---------- Styles ----------
body = ParagraphStyle("Body", fontName="FreeSerif", fontSize=10.5, leading=17,
                      alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=8)
h1 = ParagraphStyle("H1", fontName="FreeSerif", fontSize=22, leading=27,
                    textColor=TEXT_PRIMARY, spaceBefore=18, spaceAfter=4)
h2 = ParagraphStyle("H2", fontName="FreeSerif", fontSize=15, leading=20,
                    textColor=HEADER_FILL, spaceBefore=12, spaceAfter=6)
bullet = ParagraphStyle("Bullet", parent=body, alignment=TA_LEFT, leftIndent=14,
                        bulletIndent=2, spaceAfter=6, bulletFontName="FreeSerif")
caption = ParagraphStyle("Caption", fontName="FreeSerif", fontSize=8.5, leading=12,
                         alignment=TA_CENTER, textColor=TEXT_MUTED, spaceBefore=3, spaceAfter=6)
th = ParagraphStyle("TH", fontName="FreeSerif", fontSize=9.5, leading=12.5,
                    alignment=TA_CENTER, textColor=colors.white)
td = ParagraphStyle("TD", fontName="FreeSerif", fontSize=9.5, leading=13,
                    alignment=TA_LEFT, textColor=TEXT_PRIMARY)
td_c = ParagraphStyle("TDC", parent=td, alignment=TA_CENTER)
toc_title = ParagraphStyle("TocTitle", fontName="FreeSerif", fontSize=20, leading=25,
                           textColor=TEXT_PRIMARY, spaceAfter=14)
toc_l0 = ParagraphStyle("TOC0", fontName="FreeSerif", fontSize=11.5, leading=20,
                        leftIndent=6, textColor=TEXT_PRIMARY)
stat_big = ParagraphStyle("StatBig", fontName="FreeSerif", fontSize=22, leading=26,
                          textColor=ACCENT, alignment=TA_CENTER)
stat_lbl = ParagraphStyle("StatLbl", fontName="FreeSerif", fontSize=9, leading=12,
                          textColor=TEXT_MUTED, alignment=TA_CENTER)

H1_THRESHOLD = AVAIL_H * 0.25
MAX_KEEP = PAGE_H * 0.4

def safe_keep(elements):
    total = 0
    for el in elements:
        w, h = el.wrap(AVAIL_W, PAGE_H)
        total += h
    if total <= MAX_KEEP:
        return [KeepTogether(elements)]
    if len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)

def heading(num, text):
    """Retourne [paragraphe_titre, filet] — le CondPageBreak est posé à part."""
    label = f"{num}. {text}"
    key = "h_" + hashlib.md5(label.encode()).hexdigest()[:8]
    p = Paragraph(f'<a name="{key}"/><b>{label}</b>', h1)
    p.bookmark_name = key
    p.bookmark_level = 0
    p.bookmark_text = label
    p.bookmark_key = key
    rule = HRFlowable(width="100%", color=ACCENT, thickness=1.5, spaceBefore=0, spaceAfter=10)
    return [p, rule]

def section_start(num, text, first_para):
    """CondPageBreak anti-orphelin + titre + filet + 1er paragraphe liés ensemble."""
    story.append(CondPageBreak(H1_THRESHOLD))
    story.extend(safe_keep(heading(num, text) + [first_para]))

def mk_table(header, rows, ratios, style_extra=None):
    widths = [r * AVAIL_W for r in ratios]
    assert abs(sum(widths) - AVAIL_W) < 1.0
    data = [[Paragraph(f"<b>{c}</b>", th) for c in header]]
    for row in rows:
        data.append([Paragraph(c, td) for c in row])
    t = Table(data, colWidths=widths, hAlign="CENTER", repeatRows=1)
    st = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        st.append(("BACKGROUND", (0, i), (-1, i), TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD))
    if style_extra:
        st += style_extra
    t.setStyle(TableStyle(st))
    return t

def embed_image(path, max_w, max_h):
    im = PILImage.open(path)
    ow, oh = im.size
    ratio = min(max_w / ow if ow > max_w else 1.0, max_h / oh if oh > max_h else 1.0)
    return Image(path, width=ow * ratio, height=oh * ratio)

story = []

def fr(text):
    """Lie le tiret cadratin au mot précédent (jamais de — en début de ligne)."""
    return text.replace(" \u2014 ", "\u00a0\u2014 ")

_Paragraph = Paragraph
def Paragraph(text, style, **kw):
    return _Paragraph(fr(text), style, **kw)

# ---------- TOC (page i) ----------
story.append(Paragraph("<b>Table des matières</b>", toc_title))
toc = TableOfContents()
toc.levelStyles = [toc_l0]
story.append(toc)
story.append(PageBreak())
story.append(ContentStartMarker())

# ---------- 1. Analyse de l'existant ----------
p1 = Paragraph(
    "Le save restauré contenait une implémentation complète de Session Live V1 (commit 47cb98e), "
    "organisée en trois couches clairement séparées. Cette architecture n'avait pas besoin d'être "
    "recréée : l'audit a consisté à la vérifier point par point contre le cahier des charges, sans "
    "introduire d'architecture parallèle. Le tableau ci-dessous inventorie les fichiers examinés et "
    "le rôle de chacun dans la chaîne de données, depuis le WebSocket de Binance jusqu'aux composants "
    "React de la station Session Live.", body)
section_start(1, "Analyse de l'existant", p1)
t1 = mk_table(
    ["Couche", "Fichiers", "Rôle"],
    [
        ["Présentation", "components/session/ : session-view, session-toolbar, price-chart, broker-panel, symbol-positions, open-trade-card",
         "Station de trading : sélecteur symbole/timeframes, badge de connexion, chart temps réel + overlays, métriques de compte, positions du symbole"],
        ["Données navigateur", "lib/realtime/market.ts · lib/api/queries/broker.ts · endpoints.ts · next.config.ts",
         "WS client de prix (STALE_MS = 8 s, phases LIVE/SIM/STALE), requêtes broker en lecture seule, rewrites /broker vers le port 3003"],
        ["Service", "mini-services/market-service/ : index.ts, providers/types.ts, binance.ts, simulated.ts",
         "Routes /candles, /prices, /health sans mutation ; contrat MarketDataProvider ; Binance WS réel + provider simulé honnête"],
        ["Contrats et mocks", "packages/shared/src/schemas/broker.ts · src/mocks/handlers/broker.ts",
         "Schémas Zod read-only (aucun schéma d'exécution) ; mocks MSW actifs uniquement quand NEXT_PUBLIC_API_MOCKED=true"],
    ],
    [0.16, 0.42, 0.42])
story.append(Spacer(1, 10))
story.append(t1)
story.append(Spacer(1, 6))
story.append(Paragraph("Tableau 1 — Inventaire des fichiers audités par couche.", caption))
story.append(Spacer(1, 8))
story.append(Paragraph(
    "Deux observations structurelles ressortent déjà de cette lecture. D'une part, la séparation des "
    "responsabilités est réelle et non cosmétique : le mini-service ne sait rien de React, les composants "
    "ne savent rien de Binance, et les contrats partagés sont la seule zone de contact. D'autre part, "
    "l'honnêteté des états est inscrite dans le code : un provider simulé s'affiche SIM, un compte non "
    "configuré s'affiche NOT_CONFIGURED, un flux gelé s'affiche STALE. L'interface ne présente jamais une "
    "donnée simulée comme si elle était réelle, ce qui est exactement l'esprit du cahier des charges.", body))

# ---------- 2. Modifications ----------
p1 = Paragraph(
    "L'audit n'a presque rien modifié, et c'est un signal positif sur la qualité de l'existant. Un seul "
    "changement de code a été nécessaire, et il a été découvert par la vérification E2E sur mobile plutôt "
    "que par la lecture statique. À 390 px de large, le prix marqué de la barre d'outils provoquait un "
    "débordement horizontal de 11 pixels : le prix prend désormais une ligne complète sous le breakpoint "
    "sm (w-full sm:flex-1), et la largeur de défilement re-mesurée retombe exactement à 390 pixels.", body)
section_start(2, "Modifications", p1)
t2 = mk_table(
    ["Élément", "Commit", "Détail"],
    [
        ["session-toolbar.tsx", "3e4d57b",
         "Prix marqué pleine largeur sous sm : corrige 11 px de débordement horizontal à 390 px (scrollWidth = innerWidth après correctif)"],
        ["Environnement (hors produit)", "n/a",
         "Après le reset : réinstallation pnpm 12.4.2 via corepack, recréation de .env.local (NEXT_PUBLIC_API_MOCKED=true). Relève de l'environnement, pas de Session Live"],
    ],
    [0.22, 0.12, 0.66])
story.append(Spacer(1, 10))
story.append(t2)
story.append(Spacer(1, 6))
story.append(Paragraph("Tableau 2 — Changements effectués pendant l'audit.", caption))
story.append(Spacer(1, 8))
story.append(Paragraph(
    "Aucune autre ligne du module session n'a été touchée : ni les composants, ni le client temps réel, "
    "ni le mini-service, ni les contrats. Ce volontarisme de non-écriture est délibéré. La mission était "
    "d'évaluer ce que le save contenait déjà, et réécrire l'architecture pendant un audit de conformité "
    "aurait invalidé l'exercice lui-même : on se serait donné les preuves de ce qu'on prétendait mesurer.", body))

# ---------- 3. Ajouts ----------
p1 = Paragraph(
    "Aucun ajout fonctionnel n'a été fait au produit : zéro nouveau composant, zéro route, zéro provider, "
    "zéro contrat. Cette absence est le résultat le plus net de l'audit : l'implémentation existante "
    "couvrait déjà les quatre capacités attendues (market data temps réel, chart multi-timeframes, "
    "positions en lecture seule, account monitoring) ainsi que la totalité des garde-fous de sécurité. "
    "Les seuls artefacts ajoutés au dépôt sont documentaires : le présent rapport archivé en trois "
    "formats (PDF, CSV, Markdown) dans docs/audits/, les six captures E2E de l'audit dans "
    "apps/web/scripts/shots/t16-audit/, et l'entrée correspondante du worklog partagé.", body)
section_start(3, "Ajouts", p1)
story.append(Paragraph(
    "Le backlog de Phase 2 (section 8) a été rédigé mais volontairement non implémenté, conformément à la "
    "consigne. Cette frontière nette entre constater et construire protège la lisibilité de l'audit : "
    "chaque écart relevé reste imputable au save d'origine, chaque correction éventuelle fera l'objet "
    "d'une feature dédiée avec ses propres tests et son propre commit.", body))

# ---------- 4. Architecture finale ----------
p1 = Paragraph(
    "La figure ci-dessous résume la chaîne de données complète. Les sources (Binance réel, provider "
    "simulé) alimentent le mini-service market-service sur le port 3003, qui expose des routes HTTP de "
    "lecture et un push WebSocket. Next.js relaie les appels via un rewrite /broker, la librairie client "
    "market.ts gère le flux de prix et la détection de gel, et les composants Session affichent le tout "
    "sans jamais offrir d'action d'exécution. Les contrats Zod partagés et les mocks MSW traversent "
    "transversalement l'ensemble, l'un comme langage commun, l'autre comme doublure de développement.", body)
section_start(4, "Architecture finale", p1)
diagram_img = embed_image(DIAGRAM, AVAIL_W, 320)
story.append(Spacer(1, 14))
story.extend(safe_keep([diagram_img, Paragraph("Figure 1 — Architecture Session Live V1 : flux Binance/Simulated vers la station UI, couches transverses.", caption)]))
story.append(Spacer(1, 10))
story.append(Paragraph(
    "Trois propriétés structurelles méritent d'être soulignées. D'abord le découplage des providers : le "
    "mini-service ne connaît de Binance que ce que le contrat MarketDataProvider expose, ce qui rend un "
    "futur adaptateur MT5 branchable sans toucher au frontend. Ensuite la séparation des données : les "
    "positions et le compte viennent exclusivement de l'API broker, le graphique n'est qu'un support de "
    "visualisation ; la source de vérité reste le broker, jamais le chart. Enfin la lisibilité des états "
    "du flux : chaque phase (LIVE, SIM, STALE, RECONNECTING, OFFLINE) possède son propre libellé et sa "
    "propre couleur dans la barre d'outils, ce qui rend l'état de la connexion immédiatement perceptible.", body))

# ---------- 5. Acceptance criteria ----------
p1 = Paragraph(
    "La matrice complète des quinze critères, preuves à l'appui, est archivée en CSV "
    "(audit-session-live-v1-matrice.csv) à côté du présent rapport. Le tableau ci-dessous en donne la "
    "synthèse : douze critères pleinement validés, un critère partiel (le mapping des symboles) et deux "
    "validations assorties de réserves assumées (rendu graphique et broker réel). Chaque statut renvoie "
    "à une preuve concrète : code lu, capture d'écran, test runtime ou échantillon d'API.", body)
section_start(5, "Acceptance criteria validés", p1)
t5 = mk_table(
    ["#", "Critère", "Statut", "Preuve clé"],
    [
        ["AC-01", "Market data temps réel WS (pas de polling)", "Validé", "health source real, transport websocket ; ticks BTCUSDT observés en direct"],
        ["AC-02", "Chart + 7 timeframes (1m à 1D)", "Validé (réserve)", "7/7 fonctionnels sur ECharts ; TradingView natif non utilisé (licence)"],
        ["AC-03", "Positions read-only, overlays Entry/SL/TP", "Validé", "overlays purement informatifs, non déplaçables, jamais recalculés"],
        ["AC-04", "Account panel + N/A honnête", "Validé", "6 métriques affichées ; valeur indisponible rendue par un tiret, jamais devinée"],
        ["AC-05", "READ-ONLY absolu (frontend et backend)", "Validé", "0 route de mutation, 0 bouton, 0 schéma d'exécution dans les contrats"],
        ["AC-06", "Source de vérité = broker", "Validé", "positions et compte via API broker ; le chart n'alimente aucune donnée"],
        ["AC-07", "P&L temps réel WS, updates ciblées", "Validé", "recalcul à chaque tick via le store ; aucun interval de polling détecté"],
        ["AC-08", "Pending orders sans actions", "Validé", "panneau en view only, aucun bouton cancel/modify/execute"],
        ["AC-09", "Mapping symboles internal/broker/chart", "Partiel", "symboles passés tels quels ; pas de table tri-couche ni d'UI dédiée"],
        ["AC-10", "États connexion + badge LIVE", "Validé", "phases LIVE/SIM/STALE/RECONNECTING/OFFLINE avec libellés dédiés"],
        ["AC-11", "Protection stale data", "Validé", "kill test : badge STALE à 16 s avec age du flux affiché (seuil 8 s)"],
        ["AC-12", "Resync après reconnexion", "Validé", "relance du service : resync complet, âge revenu à 0 s, aucun état fantôme"],
        ["AC-13", "Isolation par utilisateur", "Validé", "requêtes broker scopées par la session authentifiée (à re-tester broker réel)"],
        ["AC-14", "Credentials jamais exposés", "Validé", "scan frontend négatif ; le mini-service joue le rôle de relais côté serveur"],
        ["AC-15", "Providers découplés, mock hors produit", "Validé", "contrat provider + provider simulé honnêtement étiqueté SIM ; MSW flag dev"],
    ],
    [0.09, 0.30, 0.14, 0.47])
story.append(Spacer(1, 10))
story.append(t5)
story.append(Spacer(1, 6))
story.append(Paragraph("Tableau 3 — Matrice de conformité synthétique (15 critères du cahier des charges V1).", caption))
story.append(Spacer(1, 12))
callout = Table(
    [[Paragraph("<b>12 / 15</b>", stat_big)],
     [Paragraph("critères pleinement validés. Verdict : CONFORME<br/>3 écarts documentés, tous non bloquants", stat_lbl)]],
    colWidths=[240])
callout.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
    ("BOX", (0, 0), (-1, -1), 1, ACCENT),
    ("TOPPADDING", (0, 0), (-1, 0), 10),
    ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
]))
callout.hAlign = "CENTER"
story.extend(safe_keep([callout]))
story.append(Spacer(1, 12))
story.append(Paragraph(
    "Les trois écarts, détaillés, sont les suivants. Premièrement, le rendu graphique s'appuie sur ECharts "
    "plutôt que sur TradingView : cette dernière librairie n'est pas utilisée faute de licence acquise "
    "pour le projet, et toutes les fonctionnalités attendues (timeframes, overlays, prix marqué) restent "
    "présentes. Deuxièmement, le mapping tri-couche des symboles (interne, broker, chart, par exemple "
    "XAUUSD contre XAUUSDm contre GOLD) n'est pas encore implémenté : les symboles circulent tels quels "
    "entre l'interface et les providers. Troisièmement, le backend broker réel n'est pas encore branché : "
    "en démonstration, le compte s'affiche honnêtement NOT_CONFIGURED et les données de compte proviennent "
    "des mocks MSW en environnement mocké, sans jamais se faire passer pour des données réelles.", body))

# ---------- 6. Tests exécutés ----------
p1 = Paragraph(
    "La campagne a combiné lecture statique et vérifications runtime, dans cet ordre : comprendre le code "
    "avant de le faire tourner, puis confronter les deux. Côté statique, quatorze fichiers ont été lus "
    "intégralement, des greps ciblés ont recherché sans succès toute route de mutation broker et toute "
    "exposition de credentials, et un échantillon de bougies a confirmé la provenance réelle des données "
    "de marché. Côté runtime, les scénarios couvrent le nominal, la coupure, la reprise et le mobile.", body)
section_start(6, "Tests exécutés", p1)
t6 = mk_table(
    ["Test", "Conditions", "Résultat"],
    [
        ["Lecture statique", "14 fichiers (composants, lib, service, providers, contrats, mocks)",
         "Architecture 3 couches confirmée ; 0 mutation ; 0 secret exposé ; contrats read-only"],
        ["API candles réelle", "GET /candles?symbol=BTCUSDT&interval=1m",
         "Réponse source real (Binance) ; bougies conformes"],
        ["E2E desktop 1440", "/session, BTCUSDT puis BOOM500",
         "Badge LIVE avec ticks réels ; SIM étiqueté ; overlays silencieux ; panel sans bouton ; 7/7 timeframes"],
        ["Coupure du flux (stale)", "kill du process market-service, observation 16 s",
         "Badge STALE à 16 s, âge du flux affiché, aucune valeur figée présentée comme vivante"],
        ["Reprise (resync)", "relance du market-service",
         "Resync complet : candles et prix recalés, badge restauré, âge revenu à 0 s"],
        ["Mobile 390", "viewport 390 px, mesure scrollWidth",
         "11 px de débordement détectés, corrigés (3e4d57b), re-mesure à 390 exactement"],
        ["Qualité statique", "tsc --noEmit ; eslint --max-warnings=0 ; console navigateur",
         "0 erreur TypeScript, 0 warning ESLint, 0 erreur console"],
    ],
    [0.20, 0.34, 0.46])
story.append(Spacer(1, 10))
story.append(t6)
story.append(Spacer(1, 6))
story.append(Paragraph("Tableau 4 — Campagne de tests : statique, runtime, mobile et qualité.", caption))
story.append(Spacer(1, 8))
story.append(Paragraph(
    "Le test de coupure mérite un mot, car il valide la promesse centrale de la protection stale data. "
    "En tuant le market-service, le flux de prix se fige immédiatement mais le transport côté navigateur "
    "peut rester connecté un certain temps : c'est précisément le cas que la protection doit couvrir. "
    "Huit secondes après le dernier tick (STALE_MS = 8 000), le badge bascule en STALE et l'interface "
    "affiche l'âge du flux en secondes ; à la relance du service, la resynchronisation recale les bougies "
    "et le badge revient à son état nominal sans intervention manuelle. Les captures desktop-feed-lost et "
    "desktop-stale-16s documentent les deux instants clés.", body))

# ---------- 7. Points non vérifiés ----------
p1 = Paragraph(
    "Un audit honnête se termine par la liste de ce qu'il n'a pas pu vérifier. Les limites suivantes sont "
    "assumées et tracées pour une future campagne de tests ; aucune n'invalide le verdict, mais plusieurs "
    "devront être levées avant un usage réel avec des fonds.", body)
section_start(7, "Points non vérifiés", p1)
for b in [
    "<b>Broker MT5 réel.</b> Non connectable depuis cet environnement de développement : le comportement avec un compte broker authentique (données de compte, positions réelles, marges, symboles réels du broker) reste à valider en conditions réelles.",
    "<b>Build de production.</b> L'audit a porté sur le serveur de développement ; un passage en build de production (rewrites, variables d'environnement, optimisations Next) n'a pas été exercé.",
    "<b>Charge multi-utilisateurs.</b> Le market-service agrège un WebSocket Binance partagé ; sa tenue de charge avec de nombreuses sessions simultanées n'a pas été mesurée.",
    "<b>Réseau dégradé prolongé.</b> Au-delà du test local kill/relance, les reconnexions longues (latence élevée, coupures intermittentes, incidents côté exchange) n'ont pas été simulées.",
    "<b>Montée en durée.</b> La stabilité du flux sur de très longues sessions (plus de 24 heures) n'a pas été observée.",
    "<b>Isolation fine avec broker réel.</b> La séparation par utilisateur est garantie côté API et mocks ; elle devra être re-testée une fois les credentials réels par utilisateur branchés.",
]:
    story.append(Paragraph(b, bullet, bulletText="•"))

# ---------- 8. Phase 2 ----------
p1 = Paragraph(
    "Conformément à la consigne, le backlog ci-dessous est listé sans aucune implémentation. Les items "
    "sont ordonnés par priorité implicite : ce qui débloque des données réelles d'abord, ce qui améliore "
    "l'expérience ensuite, ce qui durcit la production enfin. Chacun fera l'objet, le moment venu, d'une "
    "feature dédiée avec vérification E2E et commit séparé.", body)
section_start(8, "Phase 2 (liste, sans implémentation)", p1)
for i, b in enumerate([
    "<b>Adaptateur broker réel</b> (MT5 ou bridge équivalent) implémentant le contrat MarketDataProvider côté compte, avec credentials chiffrés par utilisateur et relais serveur uniquement.",
    "<b>Mapping symboles tri-couche</b> complet (interne / broker / chart, par exemple XAUUSD contre XAUUSDm contre GOLD), avec table de correspondance et UI de résolution.",
    "<b>Persistance des candles historiques</b> pour un démarrage instantané des graphiques et une meilleure résilience aux coupures.",
    "<b>Alertes prix / SL / TP</b> côté client, alimentées par le flux live existant.",
    "<b>Observabilité du market-service</b> : métriques (latence, ticks par seconde, reconnexions), logs structurés, reconnexion résiliente avec backoff.",
    "<b>Chart TradingView Lightweight Charts</b> si la licence est confirmée, en remplacement éventuel d'ECharts.",
    "<b>Tests de charge WebSocket</b> (sessions simultanées, plafond de providers) et durcissement production (build, environnement, supervision).",
    "<b>Comptes multi-brokers</b> par utilisateur, avec sélection du compte actif dans la station Session Live.",
], start=1):
    story.append(Paragraph(f"<b>{i}.</b> {b}", bullet))

# ---------- Build ----------
doc = AuditDoc(BODY_PDF, pagesize=A4,
               leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
               title=DOC_TITLE, author="Z.ai", creator="Z.ai",
               subject="Audit de conformité Session Live V1 — lecture seule, stale data, mapping symboles")
doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
print("body ->", BODY_PDF)

# ---------- Merge couverture + corps ----------
from pypdf import PdfReader, PdfWriter
A4_W, A4_H = 595.28, 841.89

def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.4 or abs(h - A4_H) > 0.4:
        page.scale_to(A4_W, A4_H)
    return page

writer = PdfWriter()
writer.add_page(normalize(PdfReader(COVER_PDF).pages[0]))
for p in PdfReader(BODY_PDF).pages:
    writer.add_page(normalize(p))
writer.add_metadata({"/Title": DOC_TITLE, "/Author": "Z.ai", "/Creator": "Z.ai",
                     "/Subject": "Audit de conformité Session Live V1 — COSMOZ, Le Registre"})
with open(FINAL_PDF, "wb") as f:
    writer.write(f)
print("final ->", FINAL_PDF)
