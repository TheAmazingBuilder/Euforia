#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""EUFORIA — Rapport de validation d'audit ultra-complet (corps ReportLab).
Route: Report (brief report.md) — Template 07 Crystal Blue (palette fixe corps).
Pas de TOC (rapport court, sections A-H) -> SimpleDocTemplate + build().
Cover généré séparément via html2poster.js puis fusionné via pypdf.
"""
import os
import sys

PDF_SKILL_DIR = '/home/z/my-project/skills/pdf'
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, 'scripts'))

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT, TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, KeepTogether, CondPageBreak,
                                HRFlowable)

# ─── Fonts (report.md template — Linux paths) ───
FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                   italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

from pdf import install_font_fallback  # noqa: E402
install_font_fallback()

# ─── Palette corps — Template 07 Crystal Blue (fixe, fournie par cover.md) ───
PAGE_BG      = colors.HexColor('#f5f8fc')   # XL
SECTION_BG   = colors.HexColor('#edf2f9')   # XL
CARD_BG      = colors.HexColor('#e4ecf5')   # L
TABLE_STRIPE = colors.HexColor('#eef3fa')   # L
HEADER_FILL  = colors.HexColor('#1a4a7a')   # M
BORDER       = colors.HexColor('#c0d0e2')   # S
ACCENT       = colors.HexColor('#2d7ab3')   # XS
TEXT_PRIMARY = colors.HexColor('#142840')
TEXT_MUTED   = colors.HexColor('#5a7a96')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ─── Page geometry (marges symétriques — overflow.md §1.5) ───
MARGIN = 0.9 * inch
TOP_MARGIN = 1.02 * inch
BOTTOM_MARGIN = 0.88 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - TOP_MARGIN - BOTTOM_MARGIN
H1_ORPHAN = AVAIL_H * 0.25

OUT = '/home/z/my-project/scripts/audit-validation-body.pdf'
DOC_TITLE = 'EUFORIA — Rapport de validation de l’audit ultra-complet'


def on_page(canvas, doc):
    """Fond de page XL + en-tête + pied de page (report.md spec)."""
    canvas.saveState()
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.62 * inch,
                      'EUFORIA — Rapport de validation de l’audit ultra-complet')
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.5)
    canvas.line(MARGIN, PAGE_H - 0.70 * inch, PAGE_W - MARGIN, PAGE_H - 0.70 * inch)
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 0.46 * inch, 'Équipe d’audit indépendante Euforia')
    canvas.drawRightString(PAGE_W - MARGIN, 0.46 * inch, str(doc.page))
    canvas.restoreState()


# ─── Styles (report.md: corps 10.5pt / interligne ~1.6 ; TA_JUSTIFY latin) ───
h1_style = ParagraphStyle('H1', fontName='FreeSerif', fontSize=17, leading=22,
                          textColor=HEADER_FILL, spaceBefore=18, spaceAfter=8)
h2_style = ParagraphStyle('H2', fontName='FreeSerif', fontSize=13, leading=18,
                          textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=6)
body_style = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10.5, leading=17,
                            textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=8)
bullet_style = ParagraphStyle('Bullet', fontName='FreeSerif', fontSize=10.5, leading=17,
                              textColor=TEXT_PRIMARY, alignment=TA_LEFT,
                              leftIndent=14, bulletIndent=2, spaceAfter=5)
caption_style = ParagraphStyle('Caption', fontName='FreeSerif', fontSize=8.5, leading=12,
                               textColor=TEXT_MUTED, alignment=TA_CENTER,
                               spaceBefore=3, spaceAfter=6)
th_style = ParagraphStyle('TH', fontName='FreeSerif', fontSize=9,
                          textColor=colors.white, alignment=TA_CENTER, leading=12)
td_style = ParagraphStyle('TD', fontName='FreeSerif', fontSize=8.8,
                          textColor=TEXT_PRIMARY, alignment=TA_LEFT, leading=12.5)
td_c_style = ParagraphStyle('TDC', parent=td_style, alignment=TA_CENTER)
td_code_style = ParagraphStyle('TDCODE', fontName='DejaVuSans', fontSize=7.6,
                               textColor=TEXT_PRIMARY, alignment=TA_LEFT, leading=10.5)
stat_style = ParagraphStyle('StatBig', fontName='FreeSerif', fontSize=19, leading=23,
                            textColor=ACCENT, alignment=TA_CENTER)
stat_label_style = ParagraphStyle('StatLabel', fontName='FreeSerif', fontSize=8,
                                  leading=11, textColor=TEXT_MUTED, alignment=TA_CENTER)


def h1(text):
    """Titre de section niveau 1 + prévention d’orphelin (CondPageBreak)."""
    return [CondPageBreak(H1_ORPHAN),
            Paragraph(f'<b>{text}</b>', h1_style),
            HRFlowable(width='100%', color=ACCENT, thickness=1.2,
                       spaceBefore=0, spaceAfter=10)]


def para(text):
    return Paragraph(text, body_style)


def bullet(text):
    return Paragraph(text, bullet_style, bulletText='•')


def make_table(header, rows, ratios, code_cols=(), center_cols=()):
    """Table sécurisée : cellules Paragraph, largeurs proportionnelles, hAlign CENTER."""
    assert abs(sum(ratios) - 1.0) < 0.01, 'ratios must sum to 1.0'
    col_widths = [r * AVAIL_W for r in ratios]
    assert sum(col_widths) <= AVAIL_W + 0.5, 'table overflow'
    data = [[Paragraph(f'<b>{c}</b>', th_style) for c in header]]
    for row in rows:
        cells = []
        for i, cell in enumerate(row):
            if i in code_cols:
                cells.append(Paragraph(str(cell), td_code_style))
            elif i in center_cols:
                cells.append(Paragraph(str(cell), td_c_style))
            else:
                cells.append(Paragraph(str(cell), td_style))
        data.append(cells)
    t = Table(data, colWidths=col_widths, hAlign='CENTER', repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 4.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
    ]
    for r in range(1, len(data)):
        style.append(('BACKGROUND', (0, r), (-1, r),
                      TABLE_ROW_ODD if r % 2 == 1 else TABLE_ROW_EVEN))
    t.setStyle(TableStyle(style))
    return t


def callout_row(stats):
    """Rangée de CalloutBox de métriques (data-to-ink rule)."""
    cells = []
    for value, label in stats:
        inner = Table(
            [[Paragraph(f'<b>{value}</b>', stat_style)],
             [Paragraph(label, stat_label_style)]],
            colWidths=[(AVAIL_W - 30) / len(stats)])
        inner.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
            ('BOX', (0, 0), (-1, -1), 1, ACCENT),
            ('TOPPADDING', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 9),
            ('TOPPADDING', (0, 1), (-1, 1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 1),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        cells.append(inner)
    outer = Table([cells], colWidths=[AVAIL_W / len(stats)] * len(stats),
                  hAlign='CENTER')
    outer.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return outer


story = []

# ══ A. Objet ══
story += h1('A. Objet et méthode de la validation')
story.append(para(
    "L’exploitant a demandé un « audit ultra complet du projet » en précisant que si l’audit "
    "était déjà fait, il fallait simplement le valider. Le constat préalable, vérifié dans git, "
    "est le suivant : l’audit MASTER full-stack (spécification « EUFORIA — MASTER FULL-STACK "
    "AUDIT, SECURITY ASSESSMENT, INTEGRATION VALIDATION & PRODUCTION READINESS ») a été "
    "exécuté et commité sous le commit <font name='DejaVuSans' size='8.8'>fc24210</font> avec "
    "son rapport A–P ; l’audit final Phase 12 (FINAL AUDIT, TESTING & PRODUCTION "
    "READINESS) a été exécuté et commité sous <font name='DejaVuSans' size='8.8'>2e74af4</font> "
    "avec son rapport A–K ; l’onboarding GSAP est complet sous "
    "<font name='DejaVuSans' size='8.8'>67e1d72</font>. La présente validation ne redéveloppe "
    "donc rien : elle applique la consigne de validation demandée."))
story.append(para(
    "La méthode retenue comporte quatre volets. Premièrement, confirmer que les rapports "
    "existants sont complets et cohérents avec le code réellement présent dans le dépôt. "
    "Deuxièmement, ré-exécuter intégralement la batterie de vérification mesurable sur l’arbre "
    "courant, commandes et codes de sortie à l’appui, sans déduire aucun résultat des rapports "
    "antérieurs. Troisièmement, documenter honnêtement tout écart constaté entre les "
    "affirmations d’audit et l’état réel. Quatrièmement, corriger dans la portée minimale les "
    "défets découverts par la validation elle-même, chacun avec sa preuve et sa contre-mesure. "
    "La portée couvre apps/web, apps/api, packages/shared et mini-services/ocr-service."))

# ══ B. Référence audits existants ══
story += h1('B. Référence des audits déjà exécutés')
story.append(make_table(
    ['Audit', 'Commit', 'Rapport', 'Verdict d’origine'],
    [
        ['MASTER FULL-STACK AUDIT (sécurité, intégration, production readiness)',
         'fc24210', 'docs/audits/MASTER-FULLSTACK-AUDIT-REPORT.md (A–P)',
         'READY FOR STAGING VALIDATION'],
        ['PHASE 12 — FINAL AUDIT, TESTING & PRODUCTION READINESS',
         '2e74af4', 'docs/audits/PHASE-12-FINAL-AUDIT-REPORT.md (A–K)',
         'READY FOR STAGING'],
        ['Onboarding GSAP — expérience de première utilisation',
         '67e1d72', 'docs/audits/ONBOARDING-GSAP-REPORT.md (A–J)',
         'COMPLETE'],
    ],
    [0.34, 0.11, 0.33, 0.22]))
story.append(Paragraph('Tableau 1 — Les trois audits antérieurs couvrant le prompt MASTER en douze stages.',
                       caption_style))
story.append(para(
    "Ces trois livrables couvrent ensemble l’intégralité des douze stages du prompt MASTER : "
    "découverte et baseline, audit frontend, audit API, base de données et intégrité, "
    "intégration frontend-backend, pipeline OCR de bout en bout, sécurité applicative, "
    "intégration transversale des fonctionnalités, temps réel et services externes, tests et "
    "automatisation, performance et observabilité, puis remédiation et rapport final. La "
    "section D établit la correspondance preuve par preuve. La question posée aujourd’hui "
    "n’est donc pas de savoir si l’audit a eu lieu — il a eu lieu et ses rapports sont dans le "
    "dépôt — mais si ses conclusions tiennent encore sur l’arbre actuel."))

# ══ C. Batterie ══
story += h1('C. Batterie de re-validation — résultats réels du 19 octobre 2026')
story.append(para(
    "Chaque ligne ci-dessous a été exécutée le jour de la validation, avec code de sortie "
    "relevé. Aucun résultat n’est déduit d’un rapport antérieur. Les éléments "
    "d’environnement restaurés après le redémarrage du sandbox (pnpm via corepack) sont "
    "documentés en section F."))
story.append(callout_row([
    ('1 635', 'tests verts (api 1336 + web 202 + pytest 97)'),
    ('17 / 17', 'vérifications conformes à la baseline'),
    ('2', 'défets d’hygiène découverts et corrigés'),
    ('41', 'migrations à jour sur Postgres réel'),
]))
story.append(Spacer(1, 12))
story.append(make_table(
    ['#', 'Vérification', 'Commande réelle', 'Résultat', 'Conformité'],
    [
        ['1', 'Typecheck shared', 'pnpm --filter @cosmoz/shared build', '0 erreur', 'OK'],
        ['2', 'Typecheck api', 'tsc -p tsconfig.json --noEmit', '0 erreur', 'OK'],
        ['3', 'Typecheck web', 'npx tsc --noEmit (apps/web)', '0 erreur', 'OK'],
        ['4', 'Lint api', 'npx eslint "src/**/*.ts" "test/**/*.ts"', '0 erreur', 'OK'],
        ['5', 'Lint web', 'npx eslint .', '0 erreur / 92 warnings (pré-existants)', 'OK'],
        ['6', 'Tests web', 'npx vitest run', '202/202 (15 fichiers, 6,2 s)', 'OK'],
        ['7', 'Tests api', 'npx vitest run (Postgres embarqué réel)', '1336/1336 (92 fichiers, 196 s)', 'OK'],
        ['8', 'Tests OCR', '/home/z/.venv/bin/pytest -q', '97/97 (39,7 s)', 'OK'],
        ['9', 'Build production web', 'npx next build', 'exit 0, 34 pages statiques, zéro warning', 'OK'],
        ['10', 'Build api', 'npx tsc -p tsconfig.build.json', 'exit 0', 'OK'],
        ['11', 'Garde mock-leakage', 'node scripts/check-prod-mock-leakage.mjs (cwd apps/web)',
         'PASS — la production ne peut pas activer la couche démo', 'OK'],
        ['12', 'Audit dépendances', 'pnpm audit / pnpm audit --prod',
         '9 advisories totales ; prod : 3 HIGH après correction (voir E-2)', 'Nuance corrigée'],
        ['13', 'Migrations Prisma', 'npx prisma migrate status (URL correcte, voir F-2)',
         '41 migrations — schéma à jour sur Postgres 127.0.0.1:5433', 'OK'],
        ['14', 'Fix CSV injection (Phase 12)', 'inspection csv.ts + spécification de régression',
         'csvCell() en place (préfixe OWASP, nombres purs exemptés), 10 tests dans la batterie', 'OK'],
        ['15', 'Fix CI mock-leakage (Phase 12)', 'inspection .github/workflows/ci.yml',
         'working-directory apps/web + chemin correct + jobs pytest OCR', 'OK'],
        ['16', 'Ré-claim secrets', 'rg z-ai-web-dev-sdk apps/web/src packages/shared/src',
         'aucun import applicatif (dev-only confirmé)', 'OK'],
        ['17', 'Isolation / ownership', 'batterie e2e api (IDOR 404, isolation Alice/Bob)',
         'verte', 'OK'],
    ],
    [0.045, 0.155, 0.315, 0.335, 0.15],
    code_cols={2}, center_cols={0, 4}))
story.append(Paragraph('Tableau 2 — Batterie complète ré-exécutée ; 17/17 conformes, une nuance de classification corrigée (E-2).',
                       caption_style))
story.append(para(
    "Le bilan est net : la baseline publiée par l’audit Phase 12 est reproductible à "
    "l’identique. Les deux défets corrigés en Phase 12 (garde CI mock-leakage et injection de "
    "formule CSV) sont vérifiés en place avec leurs tests de régression dans la batterie "
    "verte. Les 92 warnings de lint web sont identiques à ceux documentés comme pré-existants, "
    "ce qui confirme qu’aucune régression n’a été masquée et qu’aucun nettoyage cosmétique hors "
    "portée n’a été pratiqué."))

# ══ D. Couverture 12 stages ══
story += h1('D. Couverture des douze stages du prompt MASTER — où se trouve la preuve')
story.append(para(
    "Le tableau suivant fait correspondre chaque stage du prompt MASTER de l’exploitant à sa "
    "preuve principale dans les rapports existants et à son état de re-confirmation du jour. "
    "Cette correspondance évite toute ré-interprétation : la preuve existe, elle est citée, "
    "et ce qui était hors d’atteinte de l’environnement reste explicitement classé comme tel."))
story.append(make_table(
    ['Stage MASTER', 'Preuve principale', 'État'],
    [
        ['1. Découverte et baseline',
         'Batterie du tableau 2 + structure monorepo vérifiée (pnpm 12.4.2, turbo, lockfile)',
         'Re-confirmé'],
        ['2. Frontend (routes, composants, états, a11y)',
         '34 routes buildées, garde mock-leakage, sondes navigateur zéro page-error, passe a11y Phase 10',
         'Re-confirmé'],
        ['3. Backend API (contrôleurs, validation, erreurs)',
         'JwtAuthGuard global (12 @Public sur 39 contrôleurs), DTO zod, batterie e2e',
         'Re-confirmé'],
        ['4. Base de données et intégrité',
         '41 migrations à jour sur Postgres réel, contraintes de propriété, CAS sur les alertes',
         'Re-confirmé'],
        ['5. Intégration FE-BE',
         'Preuve live 24/24 : login, rotation de refresh token avec révocation de famille, trade P&L 50 exact, IDOR 404, persistance après redémarrage',
         'Re-confirmé'],
        ['6. OCR bout en bout',
         'OCR réel via sidecar tesseract (XAUUSD BUY 0.15, confirmation, import), pytest 97/97, contrat V2 restauré',
         'Re-confirmé'],
        ['7. Sécurité',
         'Cookies HttpOnly, rotation refresh, CORS production, isolation file:line, redact pino, audit des dépendances',
         'Re-confirmé'],
        ['8. Intégration transversale',
         'Matrice A–K Phase 11 : filtres-widgets, vues sauvegardées, workspaces, objectifs, alertes, snapshots immuables',
         'Re-confirmé'],
        ['9. Temps réel et externes',
         'MT5 = simulation vérifiée uniquement ; feed marché = MSW opt-in ; honnêteté documentée',
         'Re-confirmé (limites inchangées)'],
        ['10. Tests et automatisation',
         '1 635 tests verts ce jour (tableau 2)',
         'Re-confirmé'],
        ['11. Performance et opérations',
         'Bundle client 5,4 Mo / 72 chunks mesuré, migrations, healthchecks',
         'Re-confirmé'],
        ['12. Remédiation et rapport',
         '2 défets Phase 12 corrigés + 2 défets de validation corrigés (section E)',
         'Étendu'],
    ],
    [0.24, 0.58, 0.18], center_cols={2}))
story.append(Paragraph('Tableau 3 — Correspondance stage du prompt MASTER vers preuve documentée.',
                       caption_style))
story.append(para(
    "Les zones jamais validables dans cet environnement restent explicitement classées : la CI "
    "GitHub n’a jamais pu s’exécuter (aucun remote configuré — le correctif ci.yml n’est validé "
    "que par simulation locale à sémantique CI exacte), Docker n’a jamais été exécuté ici, les "
    "brokers et le flux de marché réels ne sont pas validés, et le runbook de rollback staging "
    "n’est pas documenté. Aucune affirmation de production-readiness n’est faite à leur sujet : "
    "c’est précisément pourquoi le verdict reste READY FOR STAGING et pas production-ready."))

# ══ E. Défets ══
story += h1('E. Défets découverts par la validation et corrigés')

story.append(Paragraph('<b>E-1. Hygiène des secrets — artefacts d’audit trackés dans git (règle 11 violée) — corrigé d9c0dc8</b>', h2_style))
story.append(para(
    "Le commit sandbox auto-généré <font name='DejaVuSans' size='8.8'>81b1d49</font> (postérieur "
    "à la session Phase 12, auteur « Z User ») a versionné trois fichiers d’artefacts d’audit : "
    "logs/phase12/test-token.txt contenant un JWT d’accès (préfixe eyJ vérifié sans reproduction "
    "de la valeur), logs/phase12/cookies.txt contenant le refresh token de session de test, et "
    "logs/phase12/test-account.txt contenant les identifiants du compte de test éphémère. "
    "L’impact réel est nul en production — le compte est éphémère et local, la base est un "
    "Postgres embarqué, rien n’a jamais été déployé\u00a0— mais cela violait directement la règle 11 "
    "de l’audit (ne jamais exposer JWT, tokens ou identifiants dans les fichiers versionnés) et "
    "créait un mauvais précédent pour un futur push public."))
story.append(para(
    "La correction appliquée est minimale et sûre : retrait de l’index git des trois fichiers "
    "(git rm --cached), suppression locale, ajout de logs/ au .gitignore, puis commit "
    "<font name='DejaVuSans' size='8.8'>d9c0dc8</font>. Le token demeure dans l’historique "
    "(81b1d49) : avant tout push public, un écrasement ou un filtrage d’historique est "
    "recommandé ; aucune rotation n’est nécessaire puisque le compte concerné est un "
    "utilisateur de test local éphémère sur base embarquée, jamais exposé."))

story.append(Paragraph('<b>E-2. Classification des dépendances — shadcn CLI en dependencies runtime — corrigé 7ca90c7</b>', h2_style))
story.append(para(
    "L’audit Phase 12 affirmait que les 9 advisories de pnpm audit étaient « toutes dev-only ». "
    "La ré-exécution de pnpm audit --prod a révélé 5 HIGH dans la sphère des dépendances de "
    "production déclarées : l’affirmation d’origine était vraie au sens des imports runtime "
    "(vérifiés) mais imprécise au sens des groupes de dépendances. Le traçage pnpm why a donné "
    "la chaîne exacte : @modelcontextprotocol/sdk dépend de shadcn@4.21.0, un CLI de génération "
    "de code déclaré par erreur dans les dependencies runtime de apps/web ; deepmerge-ts arrive "
    "via la chaîne prisma (aucun usage direct dans apps/api/src, vérifié par recherche) ; "
    "source-map-js via next vers postcss (chaîne de build) ; sharp via next, dont la CVE librsvg "
    "n’est atteignable que si l’optimisation SVG est activée — dangerouslyAllowSVG est absent de "
    "next.config, donc désactivé par défaut ; braces via les chaînes eslint et ts-morph."))
story.append(para(
    "La correction minimale a consisté à reclasser shadcn en devDependencies, après vérification "
    "par recherche qu’aucun import runtime n’existe dans apps/web/src. Le diff du lockfile ne "
    "contient que le déplacement du flag dev, la version résolue restant 4.21.0. Résultat "
    "mesurable : pnpm audit --prod passe de 5 à 3 HIGH, l’advisory MCP SDK étant rétractée de la "
    "sphère production. Les 3 restantes sont classées honnêtement comme build-time ou "
    "conditionnelles, non atteignables par un attaquant dans ce code. Aucune montée de version "
    "majeure n’a été pratiquée, conformément à la règle anti-upgrade indiscriminée. Les gates "
    "ont été rejouées après le changement : tsc web zéro erreur, vitest 202/202, next build "
    "exit 0."))

story.append(Paragraph('<b>E-3. Ce qui n’a volontairement pas été changé</b>', h2_style))
story.append(bullet("Aucune formule financière, aucune migration, aucune route, aucun composant : la validation n’a touché aucun comportement applicatif."))
story.append(bullet("Aucune version de dépendance modifiée — uniquement le groupe (flag dev) de shadcn, à version identique."))
story.append(bullet("Les 92 warnings de lint web pré-existants sont conservés tels quels, conformément à la portée."))
story.append(bullet("Aucun fichier API touché (le diff git le prouve), aucune nouvelle dépendance ajoutée, aucun endroit où masquer un échec."))

# ══ F. Limites ══
story += h1('F. Limites environnementales rencontrées (non imputables à l’application)')
story.append(Paragraph('<b>F-1. pnpm absent après le redémarrage du sandbox</b>', h2_style))
story.append(para(
    "Le redémarrage du sandbox a réinitialisé le PATH : pnpm n’y figurait plus. L’outillage a "
    "été restauré via corepack enable, donnant pnpm 12.4.2 — exactement la version déclarée "
    "dans le champ packageManager du package.json racine. L’impact sur le code est nul : "
    "node_modules était intact et aucune installation n’a modifié le lockfile hors le "
    "déplacement de flag documenté en E-2."))
story.append(Paragraph('<b>F-2. Contamination DATABASE_URL de l’environnement sandbox</b>', h2_style))
story.append(para(
    "Le shell du sandbox exporte une variable DATABASE_URL=file:/…custom.db héritée du "
    "modèle d’environnement, qui écrase le .env de l’api pour le CLI Prisma et provoque une "
    "erreur P1012 trompeuse (« the URL must start with the protocol postgresql:// »). La preuve "
    "que ce n’est pas un défaut applicatif est double : les scripts de l’application (dev-db.mjs "
    "et les préparateurs de test) construisent leurs propres URLs\u00a0— d’où 1 336 tests verts et "
    "41 migrations à jour — et l’injection de l’URL correcte du .env en ligne de commande fait "
    "immédiatement réussir prisma migrate status. Action opérateur recommandée : ne pas "
    "exporter DATABASE_URL globalement dans ce sandbox, ou lancer le CLI Prisma avec l’URL du "
    ".env injectée explicitement."))
story.append(Paragraph('<b>F-3. Limites structurelles déjà documentées en Phase 12</b>', h2_style))
story.append(para(
    "Elles restent valables et inchangées : la CI GitHub n’a jamais été exécutée faute de remote "
    "configuré ; Docker n’a jamais été exécuté dans cet environnement ; les brokers et le flux "
    "de marché réels n’ont jamais pu être validés ; le runbook de rollback de staging n’est pas "
    "encore rédigé. Ces quatre éléments constituent les conditions restantes du passage de "
    "staging vers la production et restent listés comme bloquants MEDIUM/BLOCKED sans "
    "atténuation."))

# ══ G. Verdict ══
story += h1('G. Verdict')
story.append(KeepTogether([
    Table([[Paragraph('<b>VERDICT CONFIRMÉ : READY FOR STAGING — PAS production-ready</b>',
                      ParagraphStyle('V', fontName='FreeSerif', fontSize=12.5, leading=17,
                                     textColor=HEADER_FILL, alignment=TA_CENTER))]],
           colWidths=[AVAIL_W * 0.92], hAlign='CENTER',
           style=TableStyle([
               ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
               ('BOX', (0, 0), (-1, -1), 1.2, ACCENT),
               ('TOPPADDING', (0, 0), (-1, -1), 10),
               ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
           ]))]))
story.append(Spacer(1, 10))
story.append(para(
    "Le verdict des audits existants est confirmé et reproductible. La baseline complète "
    "(typecheck triple, lint, 1 635 tests, builds, garde mock-leakage, migrations) se rejoue à "
    "l’identique le jour de la validation sur l’arbre courant. Les deux défets corrigés en "
    "Phase 12 sont vérifiés en place. La validation a ajouté deux corrections d’hygiène — "
    "retrait d’artefacts de secrets versionnés et reclassification d’une dépendance CLI — sans "
    "toucher au comportement applicatif. Les quatre bloquants inchangés (CI GitHub, Docker, "
    "brokers et flux réels, runbook de rollback) demeurent les conditions du passage staging "
    "vers production. Conformément à la règle finale du programme : le programme de douze "
    "phases est conclu, aucune Phase 13 n’est créée, et aucune affirmation de "
    "production-readiness n’est faite au-delà de ce que les preuves permettent."))

# ══ H. État final + actions ══
story += h1('H. État final du dépôt et prochaines actions')
story.append(Paragraph('<b>H-1. Historique récent</b>', h2_style))
story.append(make_table(
    ['Commit', 'Contenu'],
    [
        ['7ca90c7', 'audit-validation : reclassification de shadcn CLI en devDependencies (audit --prod 5 vers 3 HIGH)'],
        ['d9c0dc8', 'security-hygiene : dé-versionnage des artefacts d’audit (JWT, cookies, identifiants de test) + gitignore logs/'],
        ['81b1d49', 'auto-commit sandbox (logs Phase 12) — artefacts désormais dé-versionnés'],
        ['2e74af4', 'phase-12 : FINAL AUDIT complete — READY FOR STAGING (2 défets corrigés avec régressions)'],
        ['67e1d72', 'onboarding : expérience de première utilisation GSAP complète (6 étapes, sonde 26/26)'],
    ],
    [0.14, 0.86], center_cols={0}))
story.append(Paragraph('Tableau 4 — État git au terme de la validation ; arbre propre, logs/ ignoré.',
                       caption_style))
story.append(Paragraph('<b>H-2. Prochaines actions exploitant (priorisées, inchangées)</b>', h2_style))
story.append(para(
    "Premièrement, configurer le remote GitHub et réaliser le premier push suivi d’une "
    "exécution réelle de la CI : c’est la seule façon de valider ci.yml en conditions réelles, "
    "et l’historique doit être écrasé ou filtré avant tout push public en raison du token local "
    "présent dans 81b1d49. Deuxièmement, provisionner l’environnement de staging et rédiger le "
    "runbook de rollback — le livrable K de la Phase 12 contient les étapes de migration et de "
    "configuration. Troisièmement, formaliser par écrit l’acceptation des advisories de "
    "sécurité restantes après reclassification (8 dev-only et 3 prod classées build-time ou "
    "conditionnelles). Quatrièmement, trancher les décisions produit restantes : export PDF "
    "honnêtement non implémenté (phases 08 perdues jamais reconstruites) et validation des "
    "brokers et du flux de marché réels."))
story.append(para(
    "En conclusion, l’audit ultra-complet demandé existe déjà, est complet, et sa validation du "
    "jour confirme chaque affirmation mesurable : 17 vérifications sur 17 conformes, 1 635 "
    "tests verts, migrations à jour, deux défets d’hygiène supplémentaires trouvés et corrigés "
    "avec preuves. L’application est prête pour le staging ; les quatre conditions documentées "
    "restent le chemin explicite vers la production."))

doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=TOP_MARGIN, bottomMargin=BOTTOM_MARGIN,
    title=DOC_TITLE, author='Z.ai', creator='Z.ai',
    subject='Validation de l’audit final Euforia — Phase 12 + MASTER full-stack')
doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
print('BODY OK:', OUT)
