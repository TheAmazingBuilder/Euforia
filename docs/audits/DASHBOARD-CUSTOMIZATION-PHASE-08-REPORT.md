# DASHBOARD CUSTOMIZATION — PHASE 08 REPORT
## REPORTING, DATA EXPORTS & PERFORMANCE SNAPSHOTS

Date: 2026-10-19 · Branch: `main` · Spec: owner re-upload (verbatim, archived in the session; the original was lost in the sandbox restore per the roadmap loss note)
Statut: **COMPLETE** (within the honest limits of §E) · Exécution: audit → implémentation → tests → gates → rapport

---

## A. Repository audit

### A.1 Mécanismes existants vérifiés (avant travaux)

| Mécanisme | Emplacement | Statut pré-Phase 08 |
|---|---|---|
| CSV — trades ledger | `apps/web/src/components/trades/trades-table.tsx` (client-side, csvCell) | EXISTANT (Phase 12: injection-safe) |
| CSV — analytics R-curve | `apps/web/src/components/analytics/panels-behavior.tsx` `exportCsv(suite)` | EXISTANT |
| CSV — monitoring event ledger | `apps/web/src/components/monitoring/monitoring-panels-data.tsx` | EXISTANT |
| `csvCell()` partagée | `packages/shared/src/utils/csv.ts` — RFC 4180 + garde injection OWASP (fix Phase 12), numéros purs exemptés | EXISTANT — réutilisé pour TOUT nouveau dataset |
| PDF — rapport trimestriel | `quarterly-report-dialog.tsx` — feuille print-scoped (browser print → Save as PDF), rendue depuis la MÊME suite filtrée (zéro recalcul) | EXISTANT — mécanique PDF établie du repo |
| Moteur analytique autoritaire | `computeAnalyticsSuite` (`analytics/domain/analytics-suite.ts`) + `AnalyticsService.getAnalyticsSuite` | EXISTANT — SEULE source des métriques |
| Persistence conventions | modèles `*Row` + colonne `data Json` (contrat partagé), PrismaService, ownership par userId | EXISTANT — suivi (MetricAlertRuleRow comme gabarit) |
| Phases 01–07 | roadmap `DASHBOARD-CUSTOMIZATION-ROADMAP-PHASES-01-11.md` | DONE avec preuves (01/02/03/04-pré-existant/05/06/07) |

### A.2 Décision PDF (évaluation exigée par la spec §4B)

La spec conditionne le PDF à un support existant fiable et interdit une grosse dépendance
non évaluée. Le repo possède DÉJÀ sa mécanique PDF : la feuille trimestrielle print-to-PDF
(titre, plage résolue, echo des filtres, bande KPI, courbe d'équité SVG, rollup mensuel,
breakdown stratégies, risque, émotions, erreurs, observations serveur, footer méthodologie).
Décision : **conformer plutôt que remplacer** — ajout de l'horodatage de génération manquant
(§4B « Generation timestamp »). Aucune dépendance PDF nouvelle introduite (options évaluées
et écartées : puppeteer ~300 Mo de Chrome embarqué, pdfkit/pdfmake = nouveau moteur de layout
pour des tables paginées — risque inutile vs la mécanique existante zéro-dépendance).

### A.3 Ce qui manquait (et est livré)

1. Snapshots de performance — **aucune entité existante** (les plan-snapshots du trade-review sont un autre domaine) ;
2. CSV summaries agrégés (summary / stratégies / symboles / rollup mensuel / comptes) ;
3. Comparaison de snapshots ;
4. Centre d'exports intégré à l'interface de reporting.

---

## B. Implemented functionality

| B.1 Datasets CSV (client-side, `lib/export/builders.ts`) | Contenu | Source |
|---|---|---|
| Summary | 25 métriques réalisées + `open_trades_excluded` + echo scope (descriptor, fenêtre résolue, devise) | suite autoritaire |
| Strategies | 1 ligne/stratégie (trades, winRate, PF, expectancy, netPnl*, avgWin/LossR, maxDD-R, followedPlanPct, durée) | suite.strategies |
| Symbols | 1 ligne/instrument | suite.symbols |
| Monthly rollup | agrégats mensuels | suite.reports.monthly |
| Accounts | compte/type/broker/devise/solde initial/défaut | catalogue /accounts |
| Snapshot | capture figée + bloc contexte complet (capturedAt, fenêtre, scope, devise, version schéma, notes) | PerformanceSnapshot |

*Les colonnes monétaires sont **omises** (pas mises à 0) quand le scope n'est pas
mono-devise — même honnêteté que l'UI ; séparées du ledger brut (trades réalisés ≠ agrégats dérivés).*

| B.2 PDF | Statut |
|---|---|
| Rapport trimestriel print-to-PDF | EXISTANT + conformité §4B (horodatage ajouté au footer) |
| XLSX / JSON / image exports | NON implémentés (hors spec : « only if they provide clear value » — documenté) |

| B.3 Snapshots | Implémentation |
|---|---|
| Capture | `POST /snapshots` — fige summary + devise + fenêtre RÉSOLUE + descriptor, côté serveur depuis `AnalyticsService.getAnalyticsSuite` (sims=100, plancher du clamp) |
| Management | list (newest-first, cap 200), détail, rename/notes (métadonnées SEULEMENT), delete (204) |
| Comparaison | moteur pur partagé `comparePerformanceSnapshots` (deltas absolus B−A, % relatifs seulement si base≠0 et jamais sur winRate/counts, direction par métrique `higherIsBetter`, garde devise + version schéma avec warnings) |
| Export CSV | par snapshot, depuis la capture figée |

---

## C. Architecture and security

### C.1 Fichiers

**Shared (contrat)** : `packages/shared/src/schemas/performanceSnapshots.ts` (NOUVEAU : schémas
zod snapshot/scope/metrics/comparison, `SNAPSHOT_SCHEMA_VERSION=1`, codes d'erreur
`SNAPSHOT_NOT_FOUND`/`SNAPSHOT_NAME_TAKEN`, moteur `comparePerformanceSnapshots`), export index.

**API** : `prisma/schema.prisma` (+model `PerformanceSnapshotRow`: data Json + nameKey +
`@@unique([userId,nameKey])` + index `(userId,capturedAt)`) · migration
`20261019100000_performance_snapshots` · `modules/snapshots/` (controller 5 routes, service,
repository — frontière Prisma dédiée) · `app.module.ts` (SnapshotsModule → AnalyticsModule +
AccountsModule + PlaybookModule ; graphe acyclique).

**Web** : `lib/export/builders.ts` (builders CSV purs) · `lib/api/queries/snapshots.ts`
(TanStack, invalidation ciblée `queryKeys.snapshots`) · `endpoints.ts`/`keys.ts` ·
`mocks/handlers/snapshots.ts` (miroir MSW — capture via `mockStore.analyticsSuite`, MÊME
moteur que la route /stats/analytics-suite mock : parité garantie) · `components/analytics/
export-center.tsx` + `snapshots-panel.tsx` (wire dans ReportsTab) · i18n dict analytics
(sections `exports` + `snapshots`) · `quarterly-report-dialog.tsx` (horodatage).

### C.2 Sécurité

- **Ownership** : toutes les routes lisent userId du principal JWT (garde globale, aucun @Public) ; lecture/écriture/patch/delete scoppés par requête Prisma `where: { userId, id }` ; cross-user = 404 (« foreign = not found », batterie IDOR).
- **Références** (§11) : accountId/strategyId validés contre le catalogue de l'utilisateur AVANT capture (étranger = 404) ; strategyId "none" autorisé.
- **Immutabilité structurelle** : le schéma d'update n'a AUCUN champ métrique ; le merge repository est metadata-only ; les clés inconnues sont stripées par zod (preuve e2e : tentative `netPnl/metrics` dans un PATCH → ignorées).
- **Noms** : uniques par utilisateur (insensible à la casse, index unique + garde applicative) → 409 SNAPSHOT_NAME_TAKEN ; chaque POST = NOUVEL enregistrement (jamais d'écrasement, §7).
- **Fichiers** : generation 100% côté client depuis des réponses API authentifiées (aucun fichier serveur, aucune URL devinable, aucun chemin interne exposé) ; noms de fichiers assainis ; content-type `text/csv;charset=utf-8`.
- **Injection CSV** : chaque cellule passe `csvCell()` (RFC 4180 + préfixe OWASP) — tests de régression inclus.
- **Limites** : liste cap 200 (§11) ; capture = 1 passe suite (sims=100) ; zéro fichier non borné.

---

## D. Validation

| Commande | Résultat |
|---|---|
| `tsc --noEmit` ×3 (shared / api / web) | 0 erreur |
| `eslint` api + web | 0 erreur, 92 warnings (baseline inchangée) |
| `vitest run` API (92 fichiers, Postgres embarqué réel) | **1346/1347** — 1 échec = flake oanda recovery PRÉ-EXISTANT (prouvé sur baseline par stash : échec identique sans mes changements ; timeout scheduler 30 s, timing sandbox post-restore, hors scope) |
| `vitest run` web | **219/219** (202 avant + 17 nouveaux) |
| `next build` | exit 0 |
| garde mock-leakage (sémantique CI) | PASS |
| `prisma migrate status` (Postgres réel 127.0.0.1:5433) | **42 migrations — up to date** (inclut la nouvelle) |
| e2e snapshots (`test/e2e/snapshots.e2e.spec.ts`) | **11/11** |
| specs unitaires web nouveaux | 17/17 (compare 8 + builders 9 + symboles inclus) |

### D.1 Preuves clés (e2e, Postgres réel)

1. **Exactitude financière INDÉPENDANTE** : journal canonique +500 (R=+5) / −300 (R=−3) → capture fige netPnl="200", winRate="0.5", avgR="1", expectancyR="1", PF≈500/300, maxDD≤0 — attendus calculés DANS le test, jamais via le code applicatif.
2. **Immutabilité §9** : après capture, +700 en base → l'ANCIEN snapshot relit exactement les valeurs figées ; une NOUVELLE capture voit 900 (distinction capturé/recalculé prouvée).
3. **PATCH metadata-only** : payload pirate `{netPnl:"999999", metrics:{...}}` → stripé par le contrat, métriques intactes ; `{}` → 400.
4. **Noms** : doublon insensible à la casse → 409 SNAPSHOT_NAME_TAKEN.
5. **Isolation** : utilisateur B → GET/PATCH/DELETE du snapshot A = 404 ×3 ; liste B sans le snapshot A ; capture avec accountId étranger → 404.
6. **Auth** : 401 sans token (GET + POST) ; paramètre non-uuid → 400.
7. **Déterminisme** : deux captures même scope → métriques identiques, ids distincts.
8. **MSW parité** : le miroir mock capture via le MÊME moteur `analyticsSuite` que la route mock de la suite.

### D.2 Défaut environnemental trouvé & corrigé (infra de test, hors Phase 8)

Les 27 échecs OCR de la première passe étaient **pré-existants** (preuve stash sur baseline).
Cause racine : le `.env` restauré contient `OCR_SERVICE_URL`+`TOKEN` (ajoutés pour les preuves
live) → la factory OCR préfère le sidecar FastAPI → les e2e OCR appelaient un service absent.
Fix hermétique : `test/global-setup.ts` épingne le moteur déterministe POUR LES TESTS SEULEMENT
(`OCR_SERVICE_URL=""`, `OCR_MOCK_ENGINE=enabled` — le `.env` dev est intact, le sidecar réel
reste disponible hors tests). OCR e2e 25/25 après fix. Le flake oanda recovery (1 test) reste
en échec sur baseline — timing scheduler post-restore, documenté, non contourné.

---

## E. Limitations (honnêteté)

1. **PDF = mécanique print du navigateur** (feuille trimestrielle), pas un fichier généré serveur — choix documenté §A.2 ; un futur générateur serveur (pdfkit) resterait à évaluer.
2. **Exports client-side** : la génération se fait dans le navigateur depuis des réponses API authentifiées ; pas de streaming serveur. Les listes restent bornées par les paginations API existantes — cohérent avec les 3 exports pré-existants ; un export serveur streamé serait une évolution, pas un défaut.
3. **snapshots = summary band** (8 métriques figées) — pas l'intégralité des 13 onglets (§6 : « smallest useful and maintainable representation ») ; la comparaison porte sur ces métriques à définitions stables.
4. **Drawdown %** peut être null (pas de contexte de solde) — affiché « — », jamais 0.
5. **Multi-devise** : métriques monétaires null à la capture ; comparaison refuse les lignes money + warn (pas de conversion inventée).
6. **Colonne `nameKey`** : renommer vers un nom existant → 409 (cohérent avec la création).
7. **Flake oanda recovery** : 1 test pré-existant instable (prouvé baseline), non lié à cette phase, non contourné.
8. **MSW capture** : le mock capture depuis les fixtures mock — la parité moteur garantit la cohérence mock/API, sans prétendre à l'équivalence données.

---

## F. Phase status

**COMPLETE** — preuves : D.1 (11 e2e + exactitude financière indépendante + immutabilité +
isolation), D (gates), C.1 (inventaire fichiers). Definition of Done §17 : exports corrects et
sûrs (csvCell partout) ✓ ; snapshots persistants immuables ✓ ; comparaison précise avec
devise/scope/version explicites ✓ ; tests et checks pass ✓ ; limites documentées ✓ ; dashboard
existant intact (aucune régression : 1346/1347 avec l'unique échec prouvé pré-existant) ✓.

---

## G. Phase 09 readiness

Prérequis **satisfaits** pour la Phase 09 (Performance Optimization & Data Freshness) :
- La suite analytique unique + ses query keys existent et sont testées (Phase 03/05/08) ;
- Les mutations snapshots suivent le pattern d'invalidation ciblée établi ;
- Le build/lint/typecheck/tests sont verts et reproductibles ;
- Baseline mesurable disponible : bundle client (Phase 12 : 5,4 Mo / 72 chunks), suites de tests comme filet de non-régression.

Aucun travail Phase 09 n'a été commencé dans ce cycle (frontière de phase respectée).
