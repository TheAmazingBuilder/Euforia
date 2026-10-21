# COSMOZ — Audit Archive

> Le Registre keeps honest books. This folder archives the audit trail of the
> build itself: every feature that earned a commit did so only after passing
> the full verification ritual, and every ritual leaves a written record here.

## What this archive is

Each delivered feature goes through a fixed verification pass before its
commit. The pass is numbered (`tNN`), executed in a real browser against the
running app, and archived as a record in [`records/`](records/) plus one row
in the chronological [`ledger.md`](ledger.md). The archive exists so that the
quality history of the project survives independently of chat sessions,
worklog files or workspace rollbacks.

Records are written from the evidence that still exists: the worklog, the git
history and the screenshot folders. When the workspace rolled back (HEAD
restored to `47cb98e`), the records of the early era were lost with the
commits — the ledger marks those passes honestly instead of inventing
results that can no longer be checked.

## The ritual (what every pass must clear)

A feature is only committed when all seven checks are green:

1. **TypeScript** — `tsc --noEmit`, zero errors (app + shared packages).
2. **Lint** — `eslint --max-warnings=0`, zero warnings.
3. **Desktop E2E** — real browser at 1440px: the feature is driven through
   its main flows (create, filter, toggle, navigate…), not just screenshotted.
4. **Mobile E2E** — same flows at 390px.
5. **Zero horizontal overflow** — `scrollWidth <= innerWidth` on every
   page/viewport touched by the feature.
6. **Themes** — light, dark-blue and (when relevant) the third theme verified
   with tokens only; no hardcoded colors outside the brand SVG.
7. **Clean console** — no errors or unhandled rejections during the run.

Evidence is saved as PNG captures under
`apps/web/scripts/shots/tNN/` (plus real artifacts — downloaded PDFs — when
the feature produces them). Only then does the feature get its single commit.

## Index

- [`ledger.md`](ledger.md) — every audit pass, chronological, with verdicts.
- [`records/`](records/) — one markdown record per pass (details, evidence,
  commit). Early-era passes (t01–t18 era) are marked **lost** where the
  rollback destroyed the record; the surviving screenshot folders
  (`t12`, `t13`, `t16`) are referenced as partial evidence.

## Conventions

- One feature = one pass = one record = one commit. No batching.
- A failed check blocks the commit until fixed; fixes found during E2E are
  noted inside the record (they are part of the feature's history).
- The archive documents what was verified, not what was hoped: negative
  results and re-application after rollback are recorded as such.
