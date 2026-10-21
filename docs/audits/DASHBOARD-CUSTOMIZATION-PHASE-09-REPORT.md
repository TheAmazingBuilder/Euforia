# DASHBOARD CUSTOMIZATION — PHASE 09 REPORT
## PERFORMANCE OPTIMIZATION & DATA FRESHNESS

Date: 2026-10-19 · Branch: `main` · Spec: owner re-upload (verbatim, session) · Prérequis : Phase 08 COMPLETE (même journée)
Statut: **COMPLETE (aux limites documentées §E)** — inspecter → mesurer → implémenter → valider · Phase 10 NON commencée

---

## A. Repository findings

### A.1 Architecture vérifiée (audit complet, agent d'exploration + lectures file:line)

- **QueryClient** (`components/providers/query-provider.tsx:10-24`) : `staleTime: 30_000`, `retry: 1` — pas d'override `refetchOnWindowFocus` (v5 default true, borné par le staleTime), gcTime v5 default 5 min. Init lazy `useState` correcte.
- **Clés** (`lib/api/keys.ts`) : registre central ; `analyticsSuite(filters-string)` inclut TOUT le sac de filtres + `sims` (le sac complet EST la clé → les réponses périmées ne peuvent pas traverser les clés) ; racines `*Root` pour les invalidations par préfixe.
- **Flux widgets dashboard** (`dashboard-view.tsx`) : UN fetch suite partagé pour 7 widget types (SUITE_WIDGET_TYPES, gate `needsSuite` — pas de fetch si aucun widget suite visible) ; `widgetData` bundle transmis au grid. Exceptions délibérées documentées : METRICS_CARD gère ses propres fetches par période (pas de double fetch, §14 de son propre contrat) ; GoalsPace/BestWorst/OpenPositions self-fetch (données propres, pas la suite).
- **Client HTTP** (`lib/api/client.ts`) : pas de timeout, pas de retry transport (déliber) ; 401 interceptor single-flight refresh + EXACTEMENT un retry ; support `signal` déjà présent mais NON forwardé par les hooks avant cette phase.
- **Modes** : `lib/api/mode.ts` matrice canonique (MSW dev-only, production = API réelle) — inchangée.

### A.2 Goulots confirmés (classés par force de preuve, audit #1–#5)

1. **Invalidation suite manquante après mutation de trade unique** — `tradeMutationInvalidations` (5 racines) ne contenait PAS `analyticsSuiteRoot` : créer/modifier/clôturer/décider/supprimer un trade laissait les agrégats dérivés (widgets comparaison, page Analytics) périmés SANS même le marquer stale ; le bulk-tag et l'import CSV l'invalidaient déjà (preuve : `trades.ts:258,273`, `tradeReview.ts:63`) — le chemin single-trade était le trou.
2. **Requêtes orphelines** — les hooks pilotés par filtres (`useAnalyticsSuite`, `useTrades`) ne forwardaient pas le `signal` TanStack → changement de filtre/unmount laissait courir la requête remplacée jusqu'à complétion (gaspillage, réponses jetées).
3. **`widgetData` non mémoïsé** — reconstruit à CHAQUE render de DashboardView (churn d'identité objet + closure refetch pour 7 widgets).
4. **Code mort** — `useAnalytics()` + clé `statsAnalytics` : zéro consommateur (vérifié), endpoint legacy volontairement non implémenté côté API.
5. **Double-computation sims 50/400** (documenté, NON corrigé — décision §C.4).

---

## B. Implemented changes

| # | Changement | Fichier(s) | Nature |
|---|---|---|---|
| 1 | `analyticsSuiteRoot` ajouté au bundle d'invalidation des mutations trade (freshness après create/edit/close/decision/delete) + contrat de test | `lib/api/keys.ts` (+ test `freshness-invalidation.spec.ts`) | **fraîcheur/correctivité** |
| 2 | Forward du `signal` TanStack → `apiRequest` sur `useAnalyticsSuite` + `useTrades` (annulation des requêtes remplacées) | `queries/stats.ts`, `queries/trades.ts` | **efficacité fetch** |
| 3 | Mémoïsation du bundle `widgetData` + déstructuration suite (identité stable objet + refetch pour les 7 widgets suite-fed) | `dashboard-view.tsx` | **rendu** |
| 4 | Suppression du hook mort `useAnalytics` + clé `statsAnalytics` + re-export | `queries/stats.ts`, `queries/index.ts`, `keys.ts` | **hygiène** |
| 5 | Sonde de mesure reproductible (requested vs COMPLETED, dup URL, SPA nav, changement filtre) | `scripts/probe-perf-dashboard.js` (NOUVEAU) | **mesure** |

**Non changé (décisions documentées §C.4)** : sims 50/400 par page ; `refetchOnWindowFocus` (feature de fraîcheur bornée par staleTime) ; pas de `React.memo` global (pas de preuve de besoin) ; pas de `keepPreviousData` (cohérence données/echo au filtre, §C.4.4) ; timeout client (hors périmètre, risque de changement de comportement).

---

## C. Performance evidence

### C.1 Baseline & après — build PRODUCTION (MSW opt-in, :3005, sonde reproductible)

| Scénario | Baseline (avant Phase 9) | Après | Lecture |
|---|---|---|---|
| Dashboard cold load — requêtes /api | 16 (15 uniques) | **16 (15 uniques)** | neutre ✓ |
| — dont séquence auth | ×2 `/api/auth/me` | ×2 `/api/auth/me` | **élucidé (§C.3) : ce n'est PAS un doublon** |
| SPA → /analytics | 3 req / 0 dup | **3 req / 0 dup** | neutre ✓ |
| SPA → retour dashboard (< 30 s) | **0 req** (cache servi) | **0 req** | le cache TanStack est déjà efficace ✓ |
| 1 changement de filtre période | 2 req / 0 dup | **2 req / 0 dup** | pas de tempête, pas de course ✓ |
| Page errors | 0 | 0 | ✓ |
| Bundle client | 5,4 Mo / 72 chunks / max 724 K | **5,7 Mo / 72 chunks / max 724 K** | +0,3 Mo = Phase 08 (snapshots + exports), max chunk inchangé |

### C.2 Effet des corrections (mesuré)

- **Annulation (fix 2)** : en dev, StrictMode double-mount montrait 19 req/16 completed après fix vs 16/16 avant — les 3 « req » supplémentaires sont des requêtes **abortées avant complétion** (précisément l'économie visée : avant, les orphelines couraient à terme inutilement ; après, le fetch est cancel). En production pas de double-mount, mais toute navigation/changement de filtre en cours bénéficie du même abort.
- **Fraîcheur (fix 1)** : effet comportemental prouvé par le contrat de test (le bundle DOIT contenir les 6 racines) — après toute mutation trade, la suite dérivée est marquée stale → refetch actif immédiat sur le dashboard, refetch-on-mount après navigation vers Analytics.
- **Rendu (fix 3)** : preuve structurelle — l'objet `widgetData` + closure refetch ont une identité stable entre renders non liés aux données (deps exhaustives lint-verifiées).

### C.3 Élucidation du « ×2 /api/auth/me » (mesure, pas supposition)

Capture des statuts : **401 puis 200 (+139 ms)**. Au rechargement, l'access token (en mémoire) est perdu → `auth/me` 401 → interceptor single-flight `refreshAccessToken` (cookie HttpOnly `cosmoz_rt`) → EXACTEMENT un retry → 200. C'est la rotation de token documentée du client (`client.ts:70-85,141-167`), pas une duplication. Aucune action.

### C.4 Décisions « ne pas changer » (évaluées et rejetées, avec raisons)

1. **sims 50 (dashboard) vs 400 (analytics)** — choix produit : le dashboard n'affiche pas l'onglet Monte-Carlo, 50 sims suffisent à ses widgets ; unifier ferait payer 400 sims au dashboard ou dégraderait la précision analytics. Le coût = 1 recalcul à la navigation (borné, staleTime 30 s). Documenté, accepté.
2. **refetchOnWindowFocus true** — feature de fraîcheur (spec Step 6), bornée par staleTime 30 s : au plus 1 batch refetch/30 s. Le désactiver RÉDUIRAIT la fraîcheur.
3. **Pas de React.memo global** — aucun profiling ne l'exige ; la mémoïsation aveugle est explicitement déconseillée par la spec §5.
4. **Pas de keepPreviousData sur la suite** — évalué : rendrait les anciennes données visibles ~400 ms sous les NOUVEAUX chips de filtre (incohérence données/echo, le descriptor suit les données). Au latence actuelle le squelette est plus honnête. Réévaluer si le latence réel (API distante) devient mesurable en secondes.
5. **Pas de timeout client** — nécessiterait une politique de retry associée (risque de faux échecs sur agrégats lents) ; hors preuve de problème.

---

## D. Validation results

| Commande | Résultat |
|---|---|
| `tsc --noEmit` (web) | 0 erreur |
| `eslint` (web) | **0 erreur, 92 warnings = baseline exacte** (le warning du memo a été résolu par déstructuration, pas par disable) |
| `vitest run` (web) | **223/223** (219 avant + 3 nouveaux freshness + 1 symbols builder déjà comptés Phase 08 : 219→223 avec les 3 tests freshness ; net +4 vs début de session 202) |
| `next build` (production) | exit 0 |
| Sonde perf (dev + prod build) | 7/7 PASS, zéro page error, chiffres §C.1 |
| API (vitest complet) | non ré-exécutée pour cette phase — **zéro fichier API modifié** (git diff = preuve) ; baseline 1346/1347 tient (1 flake oanda pré-existant documenté Phase 08) |

Tests ajoutés : `freshness-invalidation.spec.ts` (3) — contrat de fraîcheur : toute racine dérivée des trades doit être invalidée par une mutation ; invalidations = préfixes (1 segment) ; clés suite paramétrées par le sac de filtres complet.

---

## E. Acceptance checklist (§12 de la spec)

| Critère | Statut |
|---|---|
| Dashboard audité AVANT optimisation | **PASS** (audit A, file:line) |
| Baseline enregistrée pour les indicateurs mesurables | **PASS** (§C.1 — sonde reproductible ; limites §E) |
| Goulots confirmés traités | **PASS** (#1 invalidation, #2 signaux, #3 mémoïsation, #4 code mort ; #5 documenté-accepté) |
| Requêtes dupliquées/inutiles réduites là où démontré | **PASS** (annulation effective ; ×2 auth/me élucidé = légitime ; pas d'autre dup en prod) |
| Identité de requête + invalidation correctes | **PASS** (clé = sac complet ; + racine suite ; test contrat) |
| Le cache ne compromet pas l'isolation compte/workspace | **PASS** (aucune clé élargie ; l'accountId reste dans les clés trades/suite) |
| Refresh prévisible, courses gérées | **PASS** (clé=commande de filtres + abort signal + réponse périmée impossible entre clés ; sonde filtre : 2 req/0 dup) |
| Données périmées / échecs de refresh communiqués | **PASS (inchangé)** — suiteStatus isLoading/isError + retry existants conservés |
| Grand datasets sans travail évitable | **PASS** (suite gate needsSuite ; aborts ; pas de virtualization introduite — non justifiée aux volumes actuels) |
| Calculs financiers et règles métier inchangés | **PASS** — zéro ligne de calcul touchée ; API non modifiée |
| Fonctionnalités dashboard existantes opérationnelles | **PASS** (223/223, build, probes, zéro page error) |
| Lint / typecheck / build vérifiés | **PASS** |
| Améliorations supportées par des mesures | **PASS** (§C — mesures avant/après reproductibles ; aucune invention) |
| Aucune fonctionnalité hors périmètre | **PASS** |

---

## F. Remaining issues (réels, vérifiés)

1. **Flake oanda recovery e2e (pré-existant)** — 30 s timeout scheduler, échec prouvé sur baseline par stash ; environnement/timing sandbox post-restore ; non contourné (contourner = masquer).
2. **Bundle +0,3 Mo** — coût de la Phase 08 (fonctionnalité nouvelle), max chunk inchangé (724 K, ECharts-dominated). Aucune action Phase 9 (le découpage est déjà par page).
3. **Dev-only StrictMode aborts** — visibles uniquement en `next dev` (double-mount) ; production épargnée ; documenté.
4. **Mesures non disponibles dans cet environnement** : profilage React Profiler interactif, Web Vitals terrain (RUM), charge API réelle — la sonde couvre le comportement réseau client ; le latence serveur réel reste à mesurer en staging (déjà listé dans les bloquants owner des rapports Phase 12).

---

## G. Phase boundary

**Phase 09 COMPLETE** au sens démontré par les preuves ci-dessus (audit → baseline → corrections ciblées → re-mesure → tests → gates). **Phase 10 n'a pas été commencée** — aucun fichier hors périmètre performance/fraîcheur modifié (git diff = preuve), aucune fonctionnalité nouvelle.
