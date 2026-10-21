# Dashboard Customization — Phase 06 Report
## Workspace Management, Layout Collections & Dashboard Templates

Date: 2026-10-19 · Spec: `docs/specs/dashboard-customization/PHASE-06-WORKSPACE-MANAGEMENT-LAYOUT-COLLECTIONS-TEMPLATES.md` (verbatim on disk)

> Context note: like Phase 05, this phase was REBUILT from the verbatim spec
> after the 2026-10-19 sandbox restore rolled the repository back (worklog
> task 14). The rebuild implements the spec against the CURRENT Phase 01–05
> code, reusing the existing layout collection rather than inventing a
> second model.

---

## A. Repository audit (spec §2)

- **Verified status**: Phase 01 (layout collection with switch / duplicate /
  rename / delete / create-empty / 4 built-in templates + draft-transaction
  edit mode, `81513e1`), Phase 02 (per-instance typed configs, `e3b773a`),
  Phase 03 (global filters + saved analytical views, `7b83374`), Phase 05
  (insights widgets + §10 wiring, commits of 2026-10-19) — all present and
  committed. Phase 04 = the pre-existing goals engine (roadmap note).
- **Existing mechanisms reused** (spec's anti-duplication mandate):
  - Workspace = the stored layout document (`dashboardLayoutDocumentSchema`):
    name, description, ordered widget items with stable `instanceId`s and
    per-instance configs. NO second workspace model was created.
  - The draft-transaction edit mode already prevents silent data loss while
    switching (active-changing ops disabled during a live draft, §10.2).
  - `activeLayoutId` persistence already restores the last active workspace.
  - Template application already spawns independent layouts (fresh layout id
    + fresh instance ids, registry-validated widget lists).
  - The wholesale domain PATCH (`PATCH /me/preferences/dashboard`) with
    server-side Zod validation + per-user ownership.
- **Genuinely missing before this phase**: an explicit DEFAULT workspace, a
  distinction between built-in and user-owned templates, user-created
  templates at all, and the workspace naming/labeling in the UI.

## B. Implemented functionality (spec §4–§9)

1. **Workspace lifecycle** — create / rename / duplicate / delete /
   switch are the existing Phase 01 operations, now presented as what they
   are (the manager is titled "Workspaces", rows say workspace; stored
   testids keep the Phase 01 `dashboard-layout-*` contract). Added:
   - **Default workspace** (`defaultLayoutId`, additive optional domain
     key): star action per row, "Default" badge, documented fallback chain
     stored-active → explicit default → first layout (`resolveActiveLayoutId`),
     and deleting the default workspace CLEARS the flag (never silently
     re-points at an arbitrary layout).
   - **Deletion semantics** documented: hard delete via the existing
     ConfirmDialog (the product's deletion convention); archive is NOT
     implemented — documented as a limitation (§E), the spec allows either
     ("archive or delete according to existing deletion conventions").
2. **Workspace duplication** — the existing `cloneLayout` deep copy (fresh
   layout id + fresh instance ids, singleton constraints preserved). Applied
   per-copy: configs, visibility, ordering, grid positions all clone; no
   mutable object is shared (unit-tested via the template path below).
3. **User-created templates** (spec §6 "if appropriate to the existing
   architecture" — it is): `userTemplates` additive optional domain key
   (max 10, per-item schema validation). Flow: freeze the ACTIVE workspace
   into a frozen deep copy (`layoutToUserTemplate`, structuredClone) →
   "Yours" badge distinguishes them from built-ins → apply spawns a NEW
   independent workspace (fresh ids via `cloneLayout`) → delete anytime.
   Templates are private to the user (per-user domain; e2e isolation test).
   Workspaces already created from a deleted template stay untouched.
4. **Concept separation (§3)** — documented in the model header and enforced
   by architecture: saved analytical views remain a SEPARATE global pool
   (Phase 03 convention preserved per §9: filters are global user state).
   Switching workspaces never touches views; applying a view never moves
   widgets; a deleted view leaves workspaces usable. Pinned by existing
   Phase 03 tests + this phase's persistence tests.
5. **Configuration isolation (§8)** — per-instance configs live INSIDE each
   workspace's widget items (stable `instanceId`s), so two workspaces
   holding the same widget type keep independent settings; duplicated or
   template-spawned workspaces get fresh instance ids (§10.3 independence).

## C. Architecture and persistence (spec §10)

- `packages/shared/src/schemas/settings.ts` — `dashboardUserTemplateSchema`
  (+ type) and two OPTIONAL additive keys on `dashboardPreferencesSchema`:
  `defaultLayoutId` (string 1–64) and `userTemplates` (array max 10). Legacy
  documents keep validating unchanged (the Phase 03 additive pattern).
- `apps/web/src/lib/dashboard-customization/workspaces.ts` (NEW) — pure
  model: `normalizeUserTemplates` (per-item validation, id dedupe, cap),
  `resolveActiveLayoutId` (fallback chain), `layoutToUserTemplate` (frozen
  deep copy), `validateUserTemplateName` (unique CI, ≤60), `newUserTemplateId`.
- `layout-model.ts` — `readStoredCustomization`/`normalizeCustomization` read
  + salvage the new keys (invalid default id → null; malformed template
  dropped individually).
- `persistence.ts` — `preferencesFromSnapshot` emits the new keys on every
  domain PATCH (wholesale semantics: omitted keys would be wiped).
- `customization-reducer.ts` — actions `defaultLayoutSet`,
  `userTemplateSaved`, `userTemplateDeleted`; `layoutDeleted` clears the
  default flag when the deleted workspace was the default.
- `use-dashboard-customization.ts` — ops `setDefaultLayout`,
  `deleteUserTemplate`, `saveWorkspaceAsTemplate` (view-mode only, name
  validated, cap enforced), `createWorkspaceFromUserTemplate`; collection-op
  persistence now carries the FULL snapshot (both Phase 03 halves + Phase 06
  keys) — the cross-talk lesson of Phase 03 applied generically.
- `layouts-manager-dialog.tsx` — retitled "Workspaces" (labels only; testids
  unchanged), Default badge + star, user-template section with save /
  apply / delete, built-in section unchanged, editing guards preserved.
- No backend route, migration, or endpoint changed — the domain rides the
  existing per-user preferences JSON with server-side schema validation.

## D. Validation (spec §14)

- Web vitest **161/161** — includes the new `workspaces.spec.ts` (9 tests:
  per-item salvage, dedupe, cap, fallback chain, frozen-copy independence,
  name rules) and the updated reducer-spec snapshots.
- API suite **1319/1319** — includes 3 new settings e2e tests:
  round-trip persistence of `defaultLayoutId` + `userTemplates` (fresh GET),
  400 on 11 templates / malformed template with domain untouched, per-user
  isolation of workspace data.
- `tsc` clean (shared / api / web); eslint clean on changed files;
  `next build` exit 0.
- Probe `probe-dashboard-workspaces.js` **16/16** (mock preview): manager
  opens as Workspaces, rename, duplicate (+1 row), set default (badge),
  built-in templates listed, save-as-template → "Yours" badge, apply → new
  active workspace, delete template, delete the default workspace through
  the ConfirmDialog → Default badge gone (flag cleared, never re-pointed),
  zero page errors.
- Regression probes: `probe-dashboard-insights.js` 21/21 and
  `probe-dashboard-filters.js` 28/28 still green on the same build.

## E. Limitations (honest)

- **No archive state** — deletion is hard (existing convention). An archived
  tier would need an additive `archivedAt` + filtered collection; not built.
- **Workspace description editing** — the layout schema carries a
  `description`, but the manager edits names only (descriptions exist for
  template-born workspaces). Renaming a description is a small follow-up.
- **User templates are full-workspace snapshots** — no partial templates
  (e.g. "copy only widget selection"), and no import/export.
- **No concurrent-edit conflict detection** — last-write-wins through the
  existing wholesale PATCH (unchanged Phase 01/03 behavior, unchanged risk).
- The 20-layout and 10-template caps are product constants (documented in
  the schemas); raising them is a schema change, not a code fix.

## F. Phase status

**COMPLETE** within the documented scope. Evidence: unit tests pinning every
workspace rule (fallback chain, frozen copies, caps, salvage), server e2e
proving persistence + validation + isolation on real PostgreSQL, probe 16/16
covering the interactive lifecycle end-to-end, full suites green
(1319/1319 API, 161/161 web), build + typechecks + lint clean.

## G. Phase 07 readiness

Phase 07 (alert rules) is ALREADY implemented and committed (`1da3d75`,
2026-10-17) — it predates this phase in execution order and does not depend
on Phase 06. No prerequisites flow from Phase 06 to Phase 07. Per the spec's
boundary, nothing beyond this report was started for Phase 07 in this work.
