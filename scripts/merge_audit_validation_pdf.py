#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fusion cover (Playwright) + corps (ReportLab) -> PDF final unique (A4 normalisé)."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

COVER = '/home/z/my-project/scripts/audit-validation-cover.pdf'
BODY = '/home/z/my-project/scripts/audit-validation-body.pdf'
OUT = '/home/z/my-project/download/EUFORIA-AUDIT-VALIDATION-REPORT-2026-10-19.pdf'


def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page


writer = PdfWriter()
cover_page = PdfReader(COVER).pages[0]
writer.add_page(normalize_page_to_a4(cover_page))
for page in PdfReader(BODY).pages:
    writer.add_page(normalize_page_to_a4(page))
writer.add_metadata({
    '/Title': 'EUFORIA — Rapport de Validation de l’Audit Ultra-Complet',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'Validation de l’audit final Euforia — Phase 12 + MASTER full-stack',
})
with open(OUT, 'wb') as f:
    writer.write(f)
print('MERGED:', OUT, 'pages:', len(writer.pages))
