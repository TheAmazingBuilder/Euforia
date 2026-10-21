# ONBOARDING GSAP — RAPPORT D'IMPLÉMENTATION (first-run experience)

**Date** : 2026-10-19 · **Phase** : roadmap §5 ligne 7 — « Onboarding GSAP — implémentation »
**Périmètre** : expérience de première utilisation premium, GSAP, persistée côté backend, pour tout utilisateur authentifié n'ayant jamais complété ni ignoré le parcours.
**Verdict** : **COMPLETE** (implémenté + testé aux trois niveaux ; limites documentées §H — aucune claim production/broker/feed).

---

## A. Résumé de l'expérience implémentée

Une overlay plein écran modale (Radix Dialog) apparaît **uniquement** lorsqu'un utilisateur authentifié, vérifié (ACTIVE), dont le document de préférences porte un état d'onboarding `NOT_STARTED` ou `IN_PROGRESS`, ouvre l'application pour la première fois. Six étapes courtes, animations GSAP courtes et contenues (≤ 0,55 s, easings power/back), intégration stricte au design system existant (thèmes Encre/Carbone/Papier, tokens, `font-heading`, accent cobalt unique, hairlines — zéro glow, zéro glass, zéro illustration fabriquée).

Écritures réelles uniquement :

- l'étape Préférences écrit via les endpoints **existants** : timezone → `PATCH /me` (source unique du jour de trading), devise d'affichage + session préférée → `PATCH /me/preferences/trading` (domaine entier) ;
- l'étape Personnaliser écrit `appearance.defaultDashboardLayout` (réglage réel existant) ;
- le compte et les brokers sont **reliés** aux flux existants (`/accounts`, `/integrations`) — jamais dupliqués, jamais simulés ; aucune credential demandée dans l'onboarding ; aucun trade/solde fabriqué.

## B. Séquence finale des étapes (6)

| # | id | Contenu | Écriture |
|---|----|---------|----------|
| 1 | `welcome` | Marque (EuforiaLogo full/auto), promesse, « Get started » / « Skip introduction » | `IN_PROGRESS` au Get started (`onboardingStartInput`) |
| 2 | `tour` | 8 modules réels (Dashboard, Trades, Trade Review, Accounts, Analytics, Playbook, Academy, Nofy) + note secondaire (Recognition, Calendar, Discipline, Events, Tasky, Oryon, Tools) — tuiles icônes, pas de fausses captures | pointeur de reprise |
| 3 | `preferences` | Timezone (liste IANA validée), devise d'affichage (8 devises du contrat), session — « Skip for now » = zéro écriture | `PATCH /me` + domaine trading (seulement ce qui a changé) |
| 4 | `accounts` | 2 cartes-liens (Accounts, Integrations) → complétion confirmée PUIS navigation ; « Continue without an account » | — |
| 5 | `personalize` | 3 layouts réels (COACH_FIRST/RISK_FIRST/PERFORMANCE_FIRST), schémas CSS étiquetés « Illustrative preview — not your data », badge « Current », « Keep the default layout » = zéro écriture | domaine appearance (si changement) |
| 6 | `ready` | Check succès sobre, « Open my dashboard » → complétion persistée, **attendue confirmée**, puis navigation | `COMPLETED` (+ `completedAt`) |

**Skip policy** : « Skip introduction » marque `SKIPPED` + `skippedAt`, ne marque AUCUNE étape comme faite, n'écrit jamais `completedAt` (pas de complétion fabriquée), supprime l'affichage automatique (tests A11/B2, unit).
**Pause/resume** : ESC / X / clic extérieur = pause (état reste `IN_PROGRESS` au pointeur persisté ; toast de confirmation) ; reprise au pointer via `resolveResumeStep` (unit 23 tests + sonde C2).
**Versions futures** : `version` (int ≥ 1, écrit = 1) — un pointer inconnu/étranger retombe sur la 1ʳᵉ étape de la séquence courante ; `onboarding` ABSENT du document = utilisateur antérieur à la fonctionnalité → **jamais** ré-affiché (rétrocompatibilité par contrat, pas par migration).

## C. Fichiers créés / modifiés

**Créés**
- `packages/shared/src/schemas/settings.ts` → section onboarding (dans le fichier existant) : `ONBOARDING_VERSION`, `onboardingStatusSchema`, `onboardingStepIdSchema`, `onboardingPreferencesSchema` (+ superRefine), input schema, type.
- `apps/web/src/lib/onboarding/steps.ts` — ordre des étapes, `normalizeStepId` (ghost step → 1ʳᵉ étape), next/prev.
- `apps/web/src/lib/onboarding/state.ts` — machine à états PURE : `resolveOnboardingEligibility`, `resolveResumeStep`, builders de domaine (start/step/complete/skip), overlays trading/appearance.
- `apps/web/src/lib/onboarding/motion.ts` — système GSAP (§F).
- `apps/web/src/lib/onboarding/use-onboarding.ts` — contrôleur React (TanStack Query → machine pure).
- `apps/web/src/lib/onboarding/__tests__/onboarding.spec.ts` — 23 tests unitaires.
- `apps/web/src/components/onboarding/` — `onboarding-overlay.tsx` (contrôleur UI + Radix Dialog), `onboarding-progress.tsx`, `onboarding-status-error.tsx`, `steps/` (6 étapes + `step-types.ts`).
- `apps/web/src/i18n/dictionaries/en/onboarding.ts` + enregistrement namespace dans `en.ts`.
- `apps/api/test/e2e/onboarding.e2e.spec.ts` — 11 tests e2e (Postgres réel).
- `scripts/probe-onboarding.js` — sonde Playwright 26 checks.

**Modifiés**
- `packages/shared/src/schemas/settings.ts` — domaine `onboarding` **optionnel** dans `userPreferencesSchema`, ajout à `preferenceDomainSchema`, défauts `DEFAULT_USER_PREFERENCES`, type `UserPreferencesDefaults` durci (onboarding requis au niveau défauts).
- `apps/api/src/modules/settings/settings.service.ts` + `domain/settings-rules.ts` — entrée `onboarding` dans les deux cartes `PREFERENCE_DOMAIN_SCHEMAS` (imposée par le compilateur).
- `apps/web/src/app/(app)/layout.tsx` — montage `<FirstRunOnboarding />` dans `AuthGate` (après `AppShell`).
- `apps/web/src/mocks/store.ts` — parité mock : entrée `onboarding` dans la carte de domaines (le provisioning mock hérite des défauts → nouveau domaine servi automatiquement).
- `apps/web/vitest.config.ts` — include `src/lib/onboarding/__tests__`.
- `apps/web/package.json` + lockfile — `gsap@^3.15.0`, `@gsap/react@^2.1.2` (seules ajouts de dépendances ; aucune autre lib d'animation).

## D. Stratégie de persistance

- **Autorité = backend** : domaine `onboarding` du document de préférences (`PATCH /me/preferences/onboarding`, sémantique whole-domain existante). **Aucun** localStorage/sessionStorage pour l'état d'éligibilité ; le client n'écrit jamais `userId`/`updatedAt` (strippés côté serveur, testé).
- Écritures à chaque changement d'étape **significatif** uniquement (pas de frame d'animation sur le fil) ; `stepsDone` = jalons confirmés, dédupliqués.
- Complétion : `mutateAsync` attend la confirmation serveur AVANT toute navigation/animation de succès ; en cas d'échec → `role="alert"` + retry, l'utilisateur n'est **pas** marqué fait (mutation optimiste avec rollback du cache — l'état affiché revient à l'état réel).
- Invariants serveur (superRefine, e2e) : `currentStep` null si terminal ; `completedAt`/`skippedAt` seulement sur terminal et requis respectivement pour COMPLETED/SKIPPED ; `startedAt` requis en IN_PROGRESS ; `stepsDone` sans doublons ; version entière ≥ 1.
- **Compatibilité arrière** : `onboarding` est le SEUL domaine optionnel du contrat — absence = « précède l'onboarding » → `not_required` (jamais de tour forcé aux existants, jamais de migration, le `loadDoc` des anciens documents reste valide — testé e2e `accepts a preferences document WITHOUT the onboarding key`).

## E. Backend & migrations

- **Zéro migration Prisma** (le domaine vit dans le JSON `User.preferences` existant — évolution, pas duplication).
- Zéro nouvelle route : le PATCH par domaine existant suffit ; validation par l'entrée `onboardingPreferencesSchema` des cartes de domaines (service + rules + mock store, alignées par le type `Record<PreferenceDomain, …>`).
- Sécurité : garde JWT globale (401 testé), ownership dérivé du token, envelope strippée (testé), isolation par utilisateur (testé : Alice COMPLETED → Bob NOT_STARTED), reset du domaine = re-armement documenté (testé, frères intacts).

## F. Architecture d'animation GSAP

- `gsap` + `@gsap/react` (uniques libs d'animation ajoutées) ; `useGSAP` scoppé au conteneur d'étape, auto-revert (StrictMode-safe, aucun leak inter-étapes) ; tweens `gsap.from` → **l'état final est l'état CSS** : si GSAP échoue, l'écran reste statique et pleinement fonctionnel (échec d'animation n'empêche jamais d'avancer — try/catch sur chaque builder).
- Entrées : `data-onb="brand"` (scale+fade 0.55 s), `data-onb="reveal"` (y+fade stagger 0.055 s/0.45 s) ; sorties : fade 0.18 s + **fallback timer 450 ms one-shot** (une sortie interrompue ne peut jamais bloquer la navigation) ; progression : `scaleX` 0.45 s ; succès : check `back.out(1.6)` sobre — pas de confetti.
- `prefers-reduced-motion` : hook `usePrefersReducedMotion` (matchMedia + listener) → entrées/sorties/sautées, état final immédiat (sonde F1/F2).

## G. Accessibilité & responsive

Radix Dialog modal : focus trap, restauration au centre, interactions extérieures bloquées (le dashboard ne reçoit aucun pointeur). Focus par étape sur le titre (`data-onb-focus`, vérifié par sonde A3/D1/D3) ; annonces d'étape `aria-live="polite"` (« Step X of 6: title ») — le sens n'est jamais porté par l'animation ou la couleur seule (check icône + `aria-checked` sur les radios layouts + bordure) ; labels sur contrôles icon-only ; cibles ≥ 44 px (`min-h-11`) ; 390 px sans débordement horizontal (sonde E1) ; contrastes des tokens existants ; erreurs `role="alert"` ; heading sémantique par étape + DialogTitle/Description sr-only.

## H. Tests — ce qui est prouvé, et comment

**API e2e — `apps/api/test/e2e/onboarding.e2e.spec.ts` — 11/11 PASS (Postgres réel embarqué)** : provisioning NOT_STARTED (nouvel inscrit) ; document legacy sans clé onboarding valide le contrat racine ; persistance du pointeur (GET indépendant) ; complétion avec re-parse du contrat complet ; 400 sur : complétion sans completedAt / currentStep non null en terminal / horodatage fantôme / IN_PROGRESS sans startedAt / stepsDone dupliqués / step inconnu / status inconnu / version 0 / version fractionnaire ; strip d'envelope planté ; SKIPPED sans complétion fabriquée ; reset = domaine seul ; 401 non-authentifié ; isolation Alice/Bob.

**Web unitaires — `src/lib/onboarding/__tests__/onboarding.spec.ts` — 23/23 PASS** : matrice d'éligibilité complète (initializing/pending/unauth/non-ACTIVE/COMPLETED/SKIPPED/undefined→not_required/error) ; reprise (pointer, ghost, version étrangère, terminal) ; builders (startedAt idempotent, jalons uniques, skip ne fabrique rien, sorties validées par le schéma partagé) ; overlays (frères préservés, défauts sûrs, ne touche que l'affichage).

**Sonde UI Playwright — `scripts/probe-onboarding.js` — 26/26 PASS (dev :3000, mode mock documenté)** : parcours complet 6 étapes ; écritures réellement persistées (COMPLETED + EUR + PERFORMANCE_FIRST relus) ; pas de complétion fabriquée ; suppression in-session après complétion ET après skip ; pause → `IN_PROGRESS` au pointeur `tour` ; focus titre, Tab confiné, refocus par étape ; 390 px sans overflow ; reduced-motion fonctionnel ; **zéro page error sur 6 contextes**.

**Batterie finale (ordre du dépôt)** : api vitest **1336/1336** (92 fichiers, +11) · web vitest **192/192** (+23) · tsc shared/api/web **OK** · eslint **0 erreur** · `next build` **exit 0** · garde mock-leakage **PASS**.

**Limites honnêtes (non claim)** :
1. La persistance **après rechargement complet** et la reprise multi-session ne sont pas démontrées en mode mock (le store MSW est en mémoire, reseedé à chaque chargement — comportement C3 attendu). Elles sont couvertes par : e2e API sur Postgres réel (persistance serveur) + unitaires de `resolveResumeStep` (mapping client) + sonde C2 (écriture du pointeur en condition réelle d'UI). Un run navigateur contre build production + API réelle reste à faire pour un éventuel runbook staging (pattern `live-integration-evidence.mjs`).
2. Pas de session lecteur d'écran réelle (assertions programmatiques ARIA uniquement).
3. Le parcours complet n'est pas branché CI (comme toutes les sondes Playwright du dépôt — infrastructure de vérification locale).
4. Écran « error » d'éligibilité : chemin de reprise implémenté et rendu, non déclenché en sonde (injection d'échec réseau non simulée) ; la règle « jamais eligible par défaut » est testée unitairement.

## I. Défauts environnementaux résolus pendant la cycle

Le serveur dev de longue date (turbopack) servait un module graph périmé pour le layout `(app)` (watcher miss) — l'overlay ne montait pas. Diagnostic par chunks compilés + logs instrumentés (supprimés depuis) ; résolu par redémarrage du serveur dev. Aucun code défaut produit par cet incident (l'application, buildée, n'était pas affectée).

## J. Comment tester

```bash
# unitaires + contrats
pnpm --filter @cosmoz/api test            # inclut test/e2e/onboarding.e2e.spec.ts (Postgres embarqué)
pnpm --filter web test                    # inclut src/lib/onboarding/__tests__ (23)
# sonde UI (dev :3000 requis, mode mock par défaut)
node scripts/probe-onboarding.js
```

Politique de re-déclenchement : ré-armement manuel possible via `POST /me/preferences/reset { domain: "onboarding" }` (documenté, testé) — aucune UI n'y est branchée (hors périmètre).
