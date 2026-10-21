# EUFORIA — RAPPORT DE VALIDATION DE L'AUDIT ULTRA-COMPLET

**Date :** 2026-10-19
**Nature :** Validation indépendante des audits déjà exécutés (consigne owner : « si c'est déjà fait, valide juste »)
**Méthode :** Re-exécution intégrale de la batterie de vérification sur l'arbre actuel, ré-audits ponctuels des affirmations sensibles, correction des défets découverts pendant la validation.
**Portée :** apps/web · apps/api · packages/shared · mini-services/ocr-service

---

## A. Objet

L'owner a demandé « un audit ultra complet du projet » en précisant que si l'audit était déjà fait, il fallait simplement le **valider**. Constat préalable vérifié dans git :

| Audit | Commit | Rapport | Verdict d'origine |
|---|---|---|---|
| MASTER FULL-STACK AUDIT (spec « EUFORIA — MASTER FULL-STACK AUDIT, SECURITY ASSESSMENT, INTEGRATION VALIDATION & PRODUCTION READINESS ») | `fc24210` | `docs/audits/MASTER-FULLSTACK-AUDIT-REPORT.md` (A–P + Mermaid) | READY FOR STAGING VALIDATION |
| PHASE 12 — FINAL AUDIT, TESTING & PRODUCTION READINESS | `2e74af4` | `docs/audits/PHASE-12-FINAL-AUDIT-REPORT.md` (A–K) | READY FOR STAGING |
| Onboarding GSAP | `67e1d72` | `docs/audits/ONBOARDING-GSAP-REPORT.md` (A–J) | COMPLETE |

La présente validation **ne re-développe rien** : elle (1) confirme que ces rapports sont complets et cohérents avec le code, (2) ré-exécute chaque vérification mesurable, (3) documente honnêtement tout écart, (4) corrige dans la portée les défets découverts par la validation elle-même.

---

## B. Batterie de re-validation — résultats réels du 2026-10-19

Chaque ligne a été exécutée aujourd'hui, exit code relevé. Aucun résultat déduit d'un rapport antérieur.

| # | Check | Commande réelle | Résultat | Audit d'origine | Conformité |
|---|---|---|---|---|---|
| 1 | Typecheck shared | `pnpm --filter @cosmoz/shared build` | **0 erreur** | clean | ✅ |
| 2 | Typecheck api | `pnpm --filter @cosmaz/api typecheck` → `tsc -p tsconfig.json --noEmit` | **0 erreur** | clean | ✅ |
| 3 | Typecheck web | `npx tsc --noEmit` (apps/web) | **0 erreur** | clean | ✅ |
| 4 | Lint api | `npx eslint "src/**/*.ts" "test/**/*.ts"` | **0 erreur** | 0 erreur | ✅ |
| 5 | Lint web | `npx eslint .` | **0 erreur / 92 warnings** | 0 erreur / 92 warnings pré-existants | ✅ (identiques) |
| 6 | Tests web | `npx vitest run` | **202/202** (15 fichiers, 6,2 s) | 202/202 | ✅ |
| 7 | Tests api | `npx vitest run` (Postgres embarqué réel) | **1336/1336** (92 fichiers, 196 s) | 1336/1336 (92 fichiers) | ✅ |
| 8 | Tests OCR | `/home/z/.venv/bin/pytest -q` | **97/97** (39,7 s) | 97/97 | ✅ |
| 9 | Build production web | `npx next build` | **exit 0**, 34 pages statiques, zéro warning | exit 0 | ✅ (re-passé après chaque modification) |
| 10 | Build api | `npx tsc -p tsconfig.build.json` | **exit 0** | OK | ✅ |
| 11 | Garde mock-leakage (sémantique CI exacte) | `node scripts/check-prod-mock-leakage.mjs` (cwd `apps/web`) | **PASS** — « production default cannot activate the demo layer » | PASS | ✅ |
| 12 | Audit dépendances | `pnpm audit` / `pnpm audit --prod` | 9 advisories totales (2 mod / 5 high / 2 crit) ; **prod : 3 HIGH** après fix — voir §D-2 | « 9, toutes dev-only » | ⚠️→✅ nuance corrigée |
| 13 | Migrations Prisma | `npx prisma migrate status` (URL correcte injectée, §E-2) | **41 migrations, « Database schema is up to date! »** sur Postgres réel 127.0.0.1:5433 | 41 up-to-date | ✅ |
| 14 | Fix CSV injection (Phase 12) | inspection `packages/shared/src/utils/csv.ts` + spec régression | `csvCell()` présente (préfixe `'` OWASP, numéros purs exemptés), 10 tests dans la batterie web | corrigé | ✅ |
| 15 | Fix CI mock-leakage (Phase 12) | inspection `.github/workflows/ci.yml` | `working-directory: apps/web` + chemin script correct + jobs pytest OCR présents | corrigé | ✅ |
| 16 | Ré-claim secrets | `rg z-ai-web-dev-sdk apps/web/src packages/shared/src` | **AUCUN import applicatif** (dev-only confirmé à nouveau) | jamais importé | ✅ |
| 17 | Isolation / ownership | couvert par la batterie e2e api (IDOR 404, isolation Alice/Bob — specs onboarding, settings, trades) | verte | vérifié Phase 12 | ✅ |

**Bilan : 17/17 conformes** (dont 1 nuance d'audit dépendances corrigée §D-2). La baseline de l'audit Phase 12 est **reproductible à l'identique** aujourd'hui.

---

## C. Couverture des 12 stages du prompt MASTER — où se trouve la preuve

Le prompt MASTER de l'owner (12 stages) a été exécuté dans les deux audits antérieurs. Table de correspondance preuve ← rapport :

| Stage MASTER | Preuve principale | Rapport & section |
|---|---|---|
| 1. Découverte & baseline | Batterie §B ci-dessus + structure monorepo vérifiée | PHASE-12 §A ; MASTER §Stage 1 |
| 2. Frontend (routes, composants, états, a11y) | 34 routes buildées, garde mock-leakage, sondes navigateur zéro page-error, a11y Phase 10 | PHASE-12 §B/E ; ONBOARDING §sonde 26/26 |
| 3. Backend API (contrôleurs, validation, erreurs) | JwtAuthGuard global (12 @Public/39 contrôleurs), DTO zod, batterie e2e | PHASE-12 §B ; MASTER §Stage 3 |
| 4. Base de données & intégrité | 41 migrations up-to-date sur Postgres réel, contraintes ownership, CAS alertes | PHASE-12 §D ; batterie api e2e |
| 5. Intégration FE↔BE | Preuve live 24/24 (`scripts/live-integration-evidence.mjs`) : login→rotation refresh→trade P&L 50 exact→IDOR→persistance post-restart | MASTER rapport §preuves live |
| 6. OCR end-to-end | Real OCR e2e via sidecar tesseract (XAUUSD BUY 0.15 → confirm → import), pytest 97/97, V2 contract restaurée | MASTER §OCR ; fc24210 |
| 7. Sécurité | Cookies HttpOnly, rotation refresh + révocation famille, CORS prod, isolation file:line, redact pino, audit deps | PHASE-12 §D ; MASTER §Stage 7 |
| 8. Intégration cross-features | Matrice A–K Phase 11 (filtres→widgets, vues sauvegardées, workspaces, objectifs, alertes, snapshots immutables) | PHASE-11 §matrice |
| 9. Real-time & externes | MT5 = simulation vérifiée uniquement ; feed marché = MSW opt-in ; honnêteté documentée | PHASE-11 §classification |
| 10. Tests & automation | §B : 1635 tests verts (api 1336 + web 202 + pytest 97) | ce rapport |
| 11. Performance & opérations | Bundle 5,4 Mo/72 chunks mesuré, migrations, healthchecks | PHASE-12 §E |
| 12. Remédiation & rapport | 2 défets Phase 12 corrigés + 2 défets validation corrigés (§D) | PHASE-12 §F ; ce rapport |

**Les 12 stages ont une couverture documentée et aujourd'hui re-confirmée.** Les zones jamais validables dans cet environnement (brokers réels, feed marché réel, Docker, CI GitHub) restent explicitement classées BLOCKED/unverified — aucune affirmation de production-readiness n'est faite à leur sujet.

---

## D. Défets découverts PAR LA VALIDATION et corrigés (portée minimale)

### D-1. Hygiène secrets — artefacts d'audit trackés dans git (règle 11 violée) — corrigé `d9c0dc8`

- **Constat :** le commit sandbox auto-généré `81b1d49` (post-session, auteur `Z User <z@container>`) a versionné `logs/phase12/test-token.txt` (JWT access, préfixe `eyJ` vérifié), `logs/phase12/cookies.txt` (refresh token) et `logs/phase12/test-account.txt` (identifiants du compte de test éphémère de l'audit Phase 12).
- **Impact :** nul en production (utilisateur éphémère local, Postgres embarqué, aucun déploiement) mais violation directe de la règle 11 de l'audit (« ne pas exposer JWT/tokens dans les fichiers versionnés ») et mauvais précédent pour un futur push public.
- **Correction :** `git rm --cached` des 3 fichiers + suppression locale + `logs/` ajouté au `.gitignore` + commit.
- **Note owner :** le token reste dans l'historique (`81b1d49`). Avant tout push public : squash/filtrage d'historique recommandé ; **aucune rotation nécessaire** (compte local éphémère, base embarquée, jamais exposée).

### D-2. Classification dépendances — `shadcn` CLI en `dependencies` runtime — corrigé `7ca90c7`

- **Constat :** `pnpm audit --prod` montrait **5 HIGH** en dépendances « production », alors que l'audit Phase 12 affirmait « 9/9 dev-only ». L'affirmation d'origine était **imprécise** (vraie au sens des imports runtime, fausse au sens des groupes de dépendances). Traçage `pnpm why` :
  - `@modelcontextprotocol/sdk` ← `shadcn@4.21.0` (CLI de génération, déclaré runtime dans apps/web) ;
  - `deepmerge-ts` ← `@prisma/client`/prisma (aucun usage direct dans `apps/api/src`, vérifié rg) ;
  - `source-map-js` ← `next`→postcss (chaîne build-time) ;
  - `sharp` ← `next` (CVE librsvg atteignable uniquement si l'optimisation SVG est activée — `dangerouslyAllowSVG` absent de `next.config` = **désactivé par défaut**) ;
  - `braces` ← eslint/ts-morph (dev chains).
- **Correction (minimale, sûre) :** `shadcn` déplacé vers `devDependencies` — vérifié : **zéro import runtime** dans `apps/web/src` ; diff lockfile = **uniquement le flag dev** (même version résolue 4.21.0). Résultat : `pnpm audit --prod` **5→3 HIGH**, l'advisory MCP SDK est rétractée de la sphère production.
- **Classification honnête des 3 restantes :** build-time/conditionnelles, non atteignables par un attaquant dans ce code (pas d'usage direct, pas d'entrée utilisateur vers deepmerge-ts, SVG optimization off). Aucune upgrade de version majeure pratiquée (règle « pas d'upgrade indiscriminé »).
- **Re-gates après changement :** web tsc 0 erreur · vitest **202/202** · `next build` **exit 0**.

### D-3. Ce qui n'a PAS été changé

- Aucune formule financière, aucune migration, aucune route, aucun composant.
- Aucune version de dépendance modifiée (flag de groupe uniquement).
- Les 92 warnings lint web pré-existants conservés (aucun « fix » cosmétique hors portée).

---

## E. Limites environnementales rencontrées pendant la validation (documentées, non imputables à l'application)

1. **`pnpm` absent après restart sandbox** — restauré via `corepack enable` (version 12.4.2, conforme au champ `packageManager`). Impact : aucun sur le code.
2. **Contamination `DATABASE_URL` de l'environnement sandbox** — le shell exporte `DATABASE_URL=file:/…custom.db` (template hérité), qui **écrase** le `.env` de l'api pour le CLI Prisma → erreur P1012 trompeuse. Preuve que ce n'est pas un défaut applicatif : `dev-db.mjs` et les setups de test construisent leurs propres URLs (d'où 1336/1336 + 41 migrations OK avec l'URL correcte). Action opérateur : ne pas exporter `DATABASE_URL` global dans ce sandbox, ou lancer le CLI Prisma avec l'URL du `.env` injectée.
3. Les autres limites structurelles déjà documentées en Phase 12 restent valables : **CI GitHub jamais exécutée** (aucun remote configuré — le fix `ci.yml` n'est validé que par simulation locale à sémantique CI exacte), **Docker jamais exécuté ici**, **brokers/feed marché réels non validés**, **rollback staging non documenté**.

---

## F. Verdict

**Le verdict des audits existants est CONFIRMÉ et reproductible : READY FOR STAGING — PAS production-ready.**

- La baseline complète (tsc×3, lint, 1635 tests, builds, garde, migrations) se rejoue **à l'identique** aujourd'hui sur l'arbre courant.
- Les 2 défets corrigés en Phase 12 (CI mock-leakage, injection formule CSV) sont **vérifiés en place** avec leurs tests de régression dans la batterie verte.
- La validation a ajouté **2 corrections d'hygiène** (secrets artefacts, classification dépendances) sans toucher au comportement applicatif.
- Les 4 bloquants inchangés (CI GitHub, Docker, brokers/feed réels, rollback runbook) restent les conditions du passage staging → production.

## G. État final du dépôt

```
7ca90c7 audit-validation: reclassify shadcn CLI dependencies→devDependencies
d9c0dc8 security-hygiene: untrack ephemeral audit artifacts (JWT/cookies/creds)
81b1d49 (sandbox auto-commit logs — artefacts désormais dé-versionnés)
2e74af4 phase-12: FINAL AUDIT complete — READY FOR STAGING
```

Arbre propre, aucun fichier non-tracké hors `logs/` (désormais ignoré). Programme 12 phases **conclus** — aucune Phase 13.

## H. Prochaines actions owner (inchangées, priorisées)

1. **Push GitHub + première exécution CI réelle** (remote + token) — seule façon de valider `ci.yml` en conditions réelles ; filtrer/squasher l'historique avant push public (token local dans `81b1d49`).
2. Provisioning staging + **runbook rollback** (le livrable K de Phase 12 contient les étapes migration/config).
3. Acceptation formelle écrite des 9 advisories (8 dev-only + 3 prod-classées build-time/conditionnelles après reclassification — voir §D-2).
4. Décision produit sur PDF export (honnêtement NOT IMPLEMENTED, phases 08 perdues jamais reconstruites) et sur la validation brokers/feed réels.
