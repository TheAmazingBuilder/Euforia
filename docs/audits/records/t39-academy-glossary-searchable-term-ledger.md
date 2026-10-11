# Audit record — t39: Academy glossary — searchable term ledger

- **Date**: 2026-09-27
- **Verdict**: PASS
- **Commit**: `059b811`

## Scope
- Route /academy/glossary — server-side search (220ms debounce) across term, simple reading, professional reading and related concepts; fold-open rows reveal the professional definition, example and related chips; count + honest empty state.
- Glossary tab (List) joins the Academy fold.

## Ritual results
tsc 0, eslint 0 · Desktop 1440: 54 terms, search 'liquidity' → 4, expand shows Professional + Example + Related · Mobile 390 sw=iw · console 0 errors.

## Evidence
- `apps/web/scripts/shots/t39/ (3 PNG)`
