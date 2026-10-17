# EUFORIA — DASHBOARD CUSTOMIZATION
## ROADMAP DE LA SÉRIE — PHASES 01 → 11 (restaurée)

Date: 2026-10-17 · Branch: `main` · Demandeur: owner
Statut du document: **ROADMAP OFFICIELLE RESTAURÉE** — la série avait disparu du suivi
actif après les restores de sandbox / compactions de session ; ce document la remet
au registre avec le statut **vérifiable** de chaque phase.

---

## 1. Pourquoi ce document existe

La série « Dashboard Customization » est une suite de **11 phases** dont les specs ont
été fournies par l'owner en conversation (fichiers uploadés). Trois phases ont été
livrées et prouvées (01, 02, 07). Après plusieurs restores de l'environnement, la file
de la série avait disparu des récapitulatifs de session — le worklog, l'historique git
et le rapport Phase 07 en gardaient pourtant la trace. Conformément à la règle du
projet (uniquement des faits prouvés, jamais d'invention), ce document :

1. restaure la série complète 01 → 11 ;
2. attache à chaque phase son **statut réel avec preuves** (commits, worklog, sondes) ;
3. marque **honnêtement** ce qui n'existe plus nulle part (textes de specs perdus) ;
4. fixe l'ordre de reprise proposé et les prérequis.

---

## 2. Table de statut — série complète

| Phase | Titre (convention de la série) | Statut | Preuves |
|---|---|---|---|
| **01** | Customization foundation (edit mode, widget registry, layouts, templates) | **DONE** | commit `81513e1` · worklog `6-dashboard-customization-phase01` · sonde `verify-dashboard-customize.js` |
| **02** | Widget customization & performance analytics | **DONE** | commit `e3b773a` · worklog `7-dashboard-customization-phase02` · sondes widgets + upgrades 35/35 |
| **03** | Global dashboard filters & saved analytical views | **DONE** | commits `a48fa7b` / `686d821` / step 3 · rapport complet `docs/audits/DASHBOARD-CUSTOMIZATION-PHASE-03-REPORT.md` · web 145/145 · e2e API 25/25 (Postgres réel) · sonde Playwright 28/28 · spec verbatim : `docs/specs/dashboard-customization/PHASE-03-GLOBAL-FILTERS-AND-SAVED-ANALYTICAL-VIEWS.md` |
| **04** | Performance goals | **PRÉ-EXISTANT (le système existait avant la série)** | `GoalService` (`apps/api/src/modules/review/goal.service.ts`) : CRUD `/goals` + progression serveur (8 métriques, statuts PENDING/ACHIEVED/ON_TRACK/AT_RISK/BEHIND) ; widget GOALS_PACE au dashboard. Aucun travail « Phase 04 » phase-spécifique |
| **05** | Performance insights & pattern analysis | **NOT IMPLEMENTED — spec restaurée** | spec verbatim : `docs/specs/dashboard-customization/PHASE-05-PERFORMANCE-INSIGHTS-PATTERN-ANALYSIS.md` (reçue owner 2026-10-17) |
| **06** | Workspace management | **NOT IMPLEMENTED — spec restaurée** | spec verbatim : `docs/specs/dashboard-customization/PHASE-06-WORKSPACE-MANAGEMENT-LAYOUT-COLLECTIONS-TEMPLATES.md` (reçue owner 2026-10-17) |
| **07** | Alerts, threshold monitoring & event history | **DONE** | commit `1da3d75` · rapport complet `docs/audits/DASHBOARD-CUSTOMIZATION-PHASE-07-ALERTS-REPORT.md` · 24 unit + 18 e2e + 80 adjacentes · sonde live 18/18 · sonde UI 12/12 |
| **08** | *Spec owner — texte perdu des sessions* | **À RÉ-UPLOADER (aucun contenu inventé)** | mentionnée comme « next » dans le §G du rapport Phase 07 ; le texte de la spec n'existe ni dans le repo ni dans les sessions actives |
| **09** | *Spec owner — texte perdu des sessions* | **À RÉ-UPLOADER (aucun contenu inventé)** | — |
| **10** | *Spec owner — texte perdu des sessions* | **À RÉ-UPLOADER (aucun contenu inventé)** | — |
| **11** | *Spec owner — texte perdu des sessions* | **À RÉ-UPLOADER (aucun contenu inventé)** | — |

> **Note d'honnêteté (mise à jour 2026-10-17)** : les specs des phases **03, 05 et 06**
> ont été re-fournies par l'owner et sont désormais restaurées **verbatim** dans
> `docs/specs/dashboard-customization/` (plus aucune dépendance aux sessions perdues).
> Les phases **08 → 11** restent attendues : leur texte exact n'existe ni dans le repo
> ni dans les sessions actives — placeholders **sans aucune invention**. Dès ré-upload,
> elles seront restaurées verbatim au même endroit et liées ici.

---

## 3. Détail des phases livrées (résumé + preuves)

### Phase 01 — Customization foundation (`81513e1`)
Édition du dashboard en vrai mode draft transactionnel : registry + library de widgets,
add/remove/hide/show, réordonnancement drag-and-drop, resize (grille 12 colonnes +
niveaux min-height), multi-layouts (switch/duplicate/rename/delete), 4 templates,
reset-to-default. Persistance par le domaine **existant** des préférences dashboard
côté serveur (widgetOrder conservé pour legacy/backup, `layouts` + `activeLayoutId`
ajoutés, colonne JSON : **aucune migration**).

### Phase 02 — Widget customization & performance analytics (`e3b773a`)
Configuration par widget typée (unions discriminées en shared, resolve/validate/migrate
sûrs à la lecture, UN contrat de validation partagé dialogue + persistance), dialogue de
réglages par widget (draft transactionnel, restore defaults, validation inline), sélection
de KPI depuis le catalogue serveur, comparaisons période précédente sur presets résolus
serveur (zéro calcul de date client), widgets STRATEGY_COMPARE / LONG_SHORT /
ACTIVITY_HEATMAP alimentés par les agrégats de la suite analytics existante. Suite de
7 widgets par défaut préservée ; nouveaux widgets opt-in via la library.

### Phase 07 — Alerts, threshold monitoring & event history (`1da3d75`)
Règles d'alerte THRESHOLD (6 métriques du registry à unités typées : NET_PNL,
WIN_RATE, PROFIT_FACTOR, TRADE_COUNT, DRAWDOWN_PCT, AVG_R — 9 périodes résolues
serveur + scopes compte/stratégie) et GOAL (ACHIEVED / PROGRESS_BELOW) consommant le
moteur de goals autoritaire. Moteur d'évaluation **pur** à transitions (false→true
déclenche une fois, cooldown anti-flapping, NO_DATA/CALC_FAILED ne retournent jamais
l'état, règles désactivées gelées) — batching par scope (1 appel suite par scope),
1 passe goals. Événements dans la boîte de réception **existante** (type
`METRIC_THRESHOLD`, sévérité NOTIFY) avec payload gelé survivant à la suppression de
règle, ids déterministes uuid-v5 (rejouer = no-op stockage), CAS sur `triggerCount`
(concurrence sûre). Nouveau `PATCH /alerts/:id/dismiss` (historique d'audit conservé).
UI : gestionnaire de règles + formulaire depuis le centre de notifications, mirroir
MSW. Rapport complet : `DASHBOARD-CUSTOMIZATION-PHASE-07-ALERTS-REPORT.md`.

---

## 4. Prérequis avant la Phase 08 (état mis à jour)

Le §G du rapport Phase 07 fixait trois prérequis. État actuel :

1. **Phases 03/05/06 non implémentées** — Toujours vrai. Toute spec Phase 08 qui
   s'appuie sur des vues analytiques sauvegardées, des insights ou des workspaces
   exige de livrer ces phases d'abord (elles sont indépendantes du domaine alertes
   de Phase 07).
2. **Dette de tests pré-existante** (5 e2e bridge HMAC + 2 guards scheduler) —
   **RÉSOLUE depuis** : commit `4970571` (Task 9, sessions CI/CD) — migrations
   réconciliées pour rejeu propre sur base fraîche + tests bridge auto-contenus ;
   suite API **1293/1293** et simulation CI clone frais **7/7 étapes vertes**
   (`docs/audits/GUIDE-INSTALLATION-LOCALE.md`, § CI).
3. **Réutilisables vérifiés de Phase 07** : domaine de règles (schemas shared,
   registry), moteur d'évaluation (logique pure + CAS + ids déterministes), pont
   inbox (`publishAlert`/`dismissAlert`), déclencheur debouncé `trade.closed` —
   toute extension future (digests, templates de règles) doit étendre ces briques,
   pas les dupliquer.

---

## 5. Ordre de reprise proposé (à confirmer par l'owner)

| # | Élément | Condition |
|---|---|---|
| 1 | ~~Re-upload specs 03/05/06~~ | **FAIT** — restaurées verbatim le 2026-10-17 dans `docs/specs/dashboard-customization/` |
| 2 | **Phase 03 — Global dashboard filters & saved analytical views** | **DONE** (rapport §I : COMPLETE dans le périmètre v1 documenté — barre globale + vues sauvegardées + métadonnées §8 ; limites honnêtes listées dans le rapport §H) |
| 3 | Phase 05 — Performance insights & pattern analysis | Après Phase 03 implémentée et vérifiée (spec §10) |
| 4 | Phase 06 — Workspace management, layout collections & templates | Après Phases 01–05 vérifiées (spec §2) |
| 5 | Phases 08 → 11 | Specs toujours attendues de l'owner (placeholders §2) |
| 6 | R3 — limiteur composite compte+IP + régressions e2e | Hors série, en file (sécurité) |
| 7 | Onboarding GSAP — **implémentation** (la spec 15 sections a été reçue ; aucun code commité — voir §6) | En file après la série / R3 selon priorité owner |

---

## 6. Note sur l'onboarding GSAP (correction de statut)

Le sujet a été raised par l'owner (« on a déjà fait l'onboarding GSAP »). Vérification
faite le 2026-10-17, evidence complète :

- **Spec** : reçue OUI — une spécification GSAP onboarding complète (15 sections) a
  été fournie par l'owner dans une session antérieure.
- **Implémentation** : AUCUNE — aucune dépendance `gsap`/`@gsap/react` dans les
  `package.json` (`apps/web`, `apps/api`, racine), aucun composant onboarding/tour,
  aucun commit onboarding/gsap dans tout l'historique git (`--all`), aucune entrée
  worklog d'implémentation. La seule occurrence « onboarding » dans `apps/web/src`
  est une carte de données mock (tasky-view, « Redesign onboarding flow »).

Statut honnête : **spec faite, implémentation non commencée** — la phase reste en
file (§5, ligne 7). Si l'owner a une preuve contraire (capture, repo distant), elle
sera vérifiée immédiatement.

---

## 7. Traçabilité

- Preuves phases 01/02 : commits `81513e1`, `e3b773a` ; worklog tasks
  `6-dashboard-customization-phase01`, `7-dashboard-customization-phase02`.
- Preuves Phase 07 : commit `1da3d75` ; rapport
  `docs/audits/DASHBOARD-CUSTOMIZATION-PHASE-07-ALERTS-REPORT.md` (§A audit Phases
  01–06 = source des titres et statuts 03/04/05/06).
- Mise à jour dette tests : commit `4970571` ; guide
  `docs/audits/GUIDE-INSTALLATION-LOCALE.md`.
- Ce document : restauré à la demande de l'owner le 2026-10-17 ; commit dédié.
