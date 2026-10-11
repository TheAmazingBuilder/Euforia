# Worklog — Projet Cosmoz

> Journal partagé multi-agents. Append-only. Ce fichier protège l'état du projet contre les restores de sandbox.
> RÈGLE VERROUILLÉE : commit après CHAQUE livrable terminé — jamais laisser du travail non committé entre deux sessions.

---
Task ID: 0-recovery
Agent: Super Z (main)
Date: 2026-10-06 01:26 UTC

Task: Diagnostic post-restart + récupération du travail perdu

Work Log:
- Vérifié git : main @ `146edfe` (4 oct 2026, 17:25) "restore the canonical product version". Tree PROPRE.
- Vérifié backend NestJS : 8 modules présents — accounts, calculators, identity, monitoring, **ocr**, security, settings, trades.
- Module OCR backend COMPLET (`apps/api/src/modules/ocr/`) : 6 routes (POST /recognitions, GET /recognitions, GET /:id, GET /:id/image, POST /:id/confirm, DELETE /:id), service, logic, repository, rate-limiter, engines deterministic + fastapi adapter, validation image, storage local.
- Serveur web :3000 en marche. API :4000 éteinte au diagnostic.

Stage Summary:
- CAUSE DE LA PERTE : la sandbox restaure le disque depuis git au restart. Travail non committé écrasé : page frontend /recognition + sidecar FastAPI Python.
- SAUVEGARDE : 100% du backend OCR NestJS, produit canonical English-only, 15 routes frontend, 22 handlers MSW, 8 modules backend, migrations Prisma, branche backup.
- À RECONSTRUIRE : page /recognition + sidecar FastAPI + ce worklog (recréé).
- MISSION PRINCIPALE INTACTE : audit Phase A conservé (matrice ci-dessous). Zéro code B1-B13 n'avait été écrit.

---
Task ID: 0-audit (CONSERVÉ depuis session précédente)
Agent: Super Z (main)
Date: 2026-10-05

Task: Audit complet backend NestJS ↔ frontend — chaque module doit consommer son backend dédié

Stage Summary (matrice d'audit consolidée) :
- ✅ AVEC backend NestJS complet (11) : Auth/Identity · Profile/Me · Settings · Journal/Trades core · Security Center · Monitoring · Recognition/OCR (backend) · Broker session · Account switcher · Tools calculators · Tasky (100% local par design)
- ❌ SANS backend NestJS (13 chantiers, ~140 routes, servis uniquement par MSW) :
  | # | Module | Routes manquantes |
  |---|---|---|
  | B1 | Stats/Analytics | 3 — overview, analytics, analytics-suite |
  | B2 | Backup | 2 — export, import |
  | B3 | Trades compléments | 4 — tags, tradeMistake, tradeSessionSeries |
  | B4 | Discipline | 12 — rules, violations, score, emotion-matrix, mistakes-ledger, alerts |
  | B5 | Session | 4 — timeline, notes |
  | B6 | Ghosts (skipped trades) | 3 |
  | B7 | Eco-Calendar (+ Events) | 5 |
  | B8 | Trade Review + Goals | 9 |
  | B9 | Session Live | 12 |
  | B10 | Playbook | 22 |
  | B11 | Nofy | 23 |
  | B12 | Academy | 33 |
  | B13 | Accounts (contrat riche /trading-accounts) | 12 |
- Constats clés : tous les schémas Zod existent dans `packages/shared/src/schemas/` (api.ts 1675 lignes + domaines) → backends valident leurs sorties contre LES MÊMES schémas que le frontend.
- Logique métier à transplanter depuis mockStore `apps/web/src/mocks/store.ts` (statsOverview ~L1307, analytics ~L1536). Collections énumérées par `FixtureData` (`apps/web/src/mocks/fixtures/generate.ts`).
- Registre endpoints : `apps/web/src/lib/api/endpoints.ts` (~180). Handlers MSW : `apps/web/src/mocks/handlers/*.ts`. Gabarit module : `apps/api/src/modules/monitoring/`.
- PLAN : B1→B13 + Phase C (bridge live NEXT_PUBLIC_API_LIVE + smoke E2E) + Phase D (vérification + commits + rapport). Commit par chantier.

---
Task ID: 0-specs-recovery
Agent: Super Z (main)
Date: 2026-10-06 03:45 UTC

Task: Retrouver le travail de la session du 5 oct 5h-17h (Toronto)

Work Log:
- Fouillé upload/ (survit aux restores) : retrouvé LES 4 SPECS collées ce jour-là + refs design Profile.
- Archivé dans docs/specs-recovered/ : SPEC-1-accounts-module.md (44K), SPEC-2-ocr-frontend-v1.md (35K), SPEC-3-ocr-backend-nestjs-fastapi.md (53K), SPEC-4-ocr-v2-complete-expansion.md (48K, 40 capacités), Profile 01-04.png, Collspase header.png. Commit dédié.
- Vérifié : le commit auto plateforme 79d4a1e (01:43 UTC) a sauvé mes changements Prisma (10 tables module-upgrade + relations User) — PERSISTANCE DES 13 DOMAINES PRÊTE, migration restant à appliquer.
- Reconstitué le travail de 5h-17h : specs Accounts + OCR Frontend V1 + OCR Backend + OCR V2 collées ; produit = backend OCR (survécu, ebee7f8+15a6161) + frontend /recognition (perdu au restore, RECONSTRUIT et commit 7fe462e avec E2E Playwright OK) + audit OCR V2 Phase 0.

Stage Summary:
- RIEN n'est définitivement perdu : specs archivées dans git, frontend /recognition reconstruit, backend OCR intact.
- Reste à faire (ordre) : appliquer migration Prisma module_upgrade_contexts → B3→B6→B4→B5→B7→B8→B9→B10→B11→B12→B1(stats)→B13(accounts, SPEC-1)→B2(backup) → Phase C (bridge live) → Phase D (vérif totale).
- OCR V2 (SPEC-4, 40 capacités) reste en file après la parité backend B1-B13, comme convenu.

---
Task ID: 1-backends (B3→B5 livrés)
Agent: Super Z (main)
Date: 2026-10-06 05:00-05:50 UTC

Task: Appliquer la migration Prisma puis construire les backends manquants (chantier par chantier, commit par livrable)

Work Log:
- Postgres 17 embarqué relancé via `node scripts/dev-db.mjs up` (le restore sandbox avait effacé les paquets système ; embedded-postgres est une devDep d'apps/api).
- Piège .env : un `/home/z/my-project/.env` racine (DATABASE_URL=file:) écrase apps/api/.env pour Prisma → exporter DATABASE_URL explicitement ou exécuter depuis apps/api.
- Migration `module_upgrade_contexts` créée + appliquée (10 tables), commit 57bbe44. Puis migration `tag_catalog` (TagRow).
- B3 (commit dédié) : tags GET/POST (starter seed paresseux 10 tags, 409 dup case-insensitive, 422 vide), jointures trade↔tag via review PATCH + projection tagIds dans la liste, détection d'erreurs à la decision gate (no_stop_loss, revenge_trade — fenêtre 15 min) stockée en TradeSubRow kind=MISTAKE, PATCH /trades/:id/mistakes/:mid (resolve), GET /trades/:id/session-series (projection déterministe mulberry32 ancrée sur entry/exit/MFE/MAE — le test Phase 4 "NOT served" remplacé). Fichiers : trades/trade-catalogs.ts (SYSTEM_MISTAKES ids fixes 00000000-...-000001..6, STARTER_TAGS), trades/session-series.ts, TagRow model.
- B6 (commit dédié) : module ghosts — GET/POST /skipped-trades, PATCH /skipped-trades/:id/settle (re-settle = écrasement, parité mock). SkippedTradeRow. Instrument validé (422 UNKNOWN_INSTRUMENT).
- B4 (commit dédié) : module discipline — rules CRUD + /rules/status (banner), évaluation des règles déclenchée par un NOUVEAU bus d'événements domaine `trade.closed` (infrastructure/events/domain-events.module.ts, node:events, @Global, zéro cycle Trades→Discipline), violation + alerte créées avec contexte figé à T, dédoublonnage (tradeId, ruleId), log /violations + acknowledge, inbox /alerts + mark read, agrégats serveur : /discipline/score (index par jour : 0.55 plan + 0.25 erreurs + 0.2 violations, moyenne sur jours scorés), /discipline/emotion-matrix, /mistakes/ledger (catalogue système). DisciplineRow kind=RULE|VIOLATION|ALERT.
- B5 (commit dédié) : module session — GET /session/timeline (ENTRY/EXIT depuis journal, SL/TP_MODIFIED depuis tradeEvents, ALERT du jour depuis Discipline, mood strip BEFORE/AOUT avec attribution par jour du tap), notes /session/notes GET/POST/DELETE (date + horodatage serveur). SessionNoteRow. IMPORTANT : le schéma sessionEventSchema.id exige un UUID — le mock violait son propre contrat ("entry-<id>") ; l'API génère des UUID déterministes dérivés (derivedId, base+variant). Ids d'événements utilisés uniquement comme clés React côté front.
- Pièges découverts : createTrade exige strategyId OU outOfPlaybook:true ; initialStop est optional NON nullable (omettre, pas null) ; le mood AFTER passe par PATCH /trades/:id/psychology (pas au close) ; close = mode "single"/"partial" (pas "full") ; Decimal Prisma normalise les zéros de fin (1.0850 → "1.085") ; repository `data Json` nécessite des casts `as unknown as Prisma.InputJsonValue`.

Stage Summary:
- 4 chantiers livrés + testés (B3, B6, B4, B5) — suite : 408/408 vitest vert, lint propre, build OK, typecheck OK.
- Reste B7 (eco, 5 routes) → B8 (reviews/goals, 9) → B9 (session live, 12) → B10 (playbook, 22) → B11 (nofy, 23) → B12 (academy, 33) → B1 (stats, 3, dépend ghosts/discipline) → B13 (accounts riche, SPEC-1) → B2 (backup) → Phase C (bridge live + smoke E2E) → Phase D (vérif totale + rapport).
- Infra ajoutée : DomainEventsModule (bus d'événements @Global) réutilisable pour les prochains chantiers (B8 goals→alerts, B9 note push...).

---
Task ID: 1-backends (B7+B8 livrés)
Agent: Super Z (main)
Date: 2026-10-06 ~06:40 UTC

Work Log:
- B7 (commit dédié) : module calendar — /eco-events (générateur déterministe seedé par date clé, ±14 jours, mulberry32 + uuidFrom), /calendar-blocks GET/PUT/DELETE/import-eco (colonne `date` dédiée dans CalendarBlockRow), /calendar-view?from&to (agrégats par jour depuis journal+discipline, jours OFF exclus serveur, dailyLossLimitPct via SettingsService, devise compte). DisciplineService expose maintenant dailyScores(userId,{from,to}) et violationsByDay() publics (consommés par Calendar). SettingsService exporté (contrat étroit).
- B8 (commit dédié) : module review — /reviews GET (read model PENDING+REVIEWED joint trades), PUT/DELETE /reviews/:tradeId (upsert 1/trade + sync trade.lessons/followedPlan), /reviews/lessons (union REVIEW+TRADE_NOTE), /reviews/overview (stats, distribution, streak avec freeze 1 jour/semaine, weeklyGradeTrend, pendingQueuePreview, lastImprovementNote), /goals GET/POST/PATCH/DELETE avec progrès CALCULÉ (8 métriques, resolvePeriod week/month/quarter, pacing ON_TRACK/AT_RISK/BEHIND/ACHIEVED, DISCIPLINE_SCORE via dailyScores). reviewRow kind=REVIEW|GOAL ; row id = goal.id (PATCH/DELETE adressent l'entité). Fichiers : review/review-domain.ts (helpers purs), goal.service.ts, review.service.ts.
- Pièges : target goal non-nul (schema refine) ; psychology PATCH pour emotionAfter (pas au close) ; Decimal normalise "1.0850"→"1.085" (assertions tests) ; strategyName/setupName = null honnête en attendant B10 (playbook).

Stage Summary:
- 6 chantiers livrés (B3,B6,B4,B5,B7,B8) — 420/420 tests verts, build+lint OK.
- Reste : B9 (session live, 12 routes) → B10 (playbook 22) → B11 (nofy 23) → B12 (academy 33) → B1 (stats 3) → B13 (accounts riche SPEC-1) → B2 (backup 2) → Phase C (bridge live) → Phase D (vérif+rapport).

---
Task ID: 1-backends (B9 livré)
Agent: Super Z (main)
Date: 2026-10-06 ~07:10 UTC

Work Log:
- B9 (commit dédié) : module session-live — sessions (start/409 single-active, PATCH bias/objective/notes avec événement BIAS_CHANGED, end avec résumé §43 honnête depuis journal/discipline/eco/notes/analyses, cancel), analyses sauvegardées (push ANALYSIS_SAVED), key levels (filtre symbol, push LEVEL_ADDED). sessionLiveRow kind=SESSION|ANALYSIS|LEVEL, row id = entity id. Pièges : end/cancel répondent 200 (@HttpCode OK), createSavedAnalysisInput exige indicator.id + params.length (pas period), keyLevel.price est un NUMBER.

Stage Summary:
- 7 chantiers livrés (B3,B6,B4,B5,B7,B8,B9) — 425/425 tests verts.
- Reste : B10 (playbook 22) → B11 (nofy 23) → B12 (academy 33) → B1 (stats 3) → B13 (accounts SPEC-1) → B2 (backup) → Phase C → Phase D.

---
Task ID: 1-backends (B10 livré + forensic)
Agent: Super Z (main)
Date: 2026-10-06 13:30 UTC

Task: Forensic demandée par l'utilisateur (travail 5h-17h) + finalisation B10 playbook

Work Log:
- FORENSIC : inventaire complet du jour reconstitué depuis git log/reflog/find — TOUS les commits 01:38→05:27 UTC identifiés (7fe462e → 6dfa88c), zéro perte. git status propre au réveil.
- Découverte clé : le commit-snapshot plateforme 6dfa88c (05:27 UTC) contient B10 PLAYBOOK COMPLET (2071 lignes : service 811, seed 598, contrôleur 235, repo 62, module 43, e2e 313) committé sous message UUID — le code était SÛR mais non documenté.
- DB embarquée relancée (node scripts/dev-db.mjs up), migrations réappliquées (migrate deploy), .env recréé (il disparaît à chaque restore — piège récurrent).
- B10 finalisé : 2 tests rouges corrigés — (1) service : snapshot VERSION doit exposer `id` (= row id, exigé par strategyVersionSnapshotSchema) ; (2) test : category "ENTRY" n'existe pas dans le contrat (enum : RISK/SESSION/NEWS/BEHAVIOR/EXECUTION/CUSTOM) → "EXECUTION".
- Suite complète : 433/433 vitest vert.

Stage Summary:
- 8 chantiers livrés et VERROUILLÉS dans git : B3, B6, B4, B5, B7, B8, B9, B10 — 433/433 tests e2e verts.
- Reste : B11 (nofy 23) → B12 (academy 33) → B1 (stats 3) → B13 (accounts SPEC-1) → B2 (backup 2) → Phase C (bridge live) → Phase D (vérif+rapport).
- Rappel pièges permanents : .env disparaît au restore ; DB fresh → migrate deploy ; commit à CHAQUE livrable.

---
Task ID: 1-backends (B11 livré)
Agent: Super Z (main)
Date: 2026-10-06 13:40 UTC

Work Log:
- B11 (module nofy, 23 routes) : nofyRow kind=NOTE|FOLDER|TAG|TEMPLATE|VERSION (row id = entity id). Lazy seed par user (7 dossiers, 10 tags, 5 templates builtin, 8 notes + 1 trashed) avec refs pointant vers les VRAIES entités du user (trade perdant/gagnant, stratégie, setup, event HIGH, instrument XAUUSD — fallbacks gracieux si absents).
- Reads : overview (totaux, activity 8 semaines lundi→dimanche, topTags, recentEdited/Viewed/Favorites), listes (view all/favorites/trash/recent/folder/tag + q + sort), note détail (GET re-résout les refs et touche lastViewedAt), search (snippets ±60/80), listNotesLinkedTo (?refKind&refId — intégration Playbook/Trade Review), refs entity picker (TRADE/STRATEGY/SETUP/RULE/EVENT/SYMBOL/NOTE — LESSON stocké mais non résolu tant que B12 n'existe pas, documenté honnête).
- Writes : note CRUD (create avec template, PATCH autosave avec snapshot version conditionnel 3 min + cap 12 PERSISTANT, trash/restore/purge + purge des versions, duplicate "(copy)"), folders (create/rename 409 case-insensitive, delete → notes fallback "No folder"), tags idempotents par nom (strip #), templates (capture depuis note SANS fuir les refs personnelles, instantiate DRAFT).
- Refs re-résolues à CHAQUE lecture (labels/hrefs jamais stalés, spec §24/§31). TRADE via TradesService.listTrades (rMultiple wire), SYMBOL via instruments, EVENT via generateEcoEvents (B7), STRATEGY/SETUP/RULE via PlaybookService (export ajouté), NOTE via nofyRow.
- CONTRAT : schémas de réponse Zod ajoutés à packages/shared/src/schemas/nofy.ts (nofyNoteSchema, nofyNotesResponseSchema, overview/search/refs/versions...) — l'API et les tests valident les sorties contre les MÊMES schémas que le frontend.
- Pièges : purgeNote doit matcher les VERSION rows par data.noteId (le row id EST la version id) ; le template "from note" garde des blocs type "ref" SANS payload (le mock fait pareil) ; TradesModule exporte maintenant TradesService aussi.

Stage Summary:
- 9 chantiers livrés (B3,B6,B4,B5,B7,B8,B9,B10,B11) — 442/442 tests verts, typecheck OK.
- Reste : B12 (academy 33) → B1 (stats 3) → B13 (accounts SPEC-1) → B2 (backup 2) → Phase C (bridge live) → Phase D (vérif+rapport).

---
Task ID: 1-backends (B12 livré)
Agent: Super Z (main)
Date: 2026-10-06 14:05 UTC

Work Log:
- REFACTOR CONTENU : le corpus pédagogique (types/catalog/5 lessons/glossary/patterns/scenarios, ~5300 lignes) DÉPLACÉ de apps/web/src/mocks/academy/ vers packages/shared/src/content/academy/ — source unique servie par l'API et réexportée par le mock (shims). events-tasks.ts reste au mock (logique mock), portée dans le service.
- B12 (module academy, 33 routes) : academyRow kind=STATE|TASK|EVENT_REG. STATE = blob JSON par user (completedLessons, quizAttempts, bookmarks, practice ledger cap 300, wrongPatternIds, flashcardStates Leitner, examAttempts, viewedLessons, notes, activityDates). TASK/EVENT_REG = rows par entité (lazy seed 6 tâches slug + uuid dérivé).
- Contenu : 12 catégories, 25+ cours, leçons à blocs visuels, quiz (réponses JAMAIS sur le wire — stripQuestion), checkpoints déterministes par lessonId+UTC day, glossaire 100+ termes, 10 pattern exemplars, scénarios.
- Moteur : catalog (cards + paths avec progression), course detail, lesson (touchViewed + resume), notes (PUT, clear via ""), complete idempotent, quiz attempts (best score server-side), progress (streaks UTC walk), overview (continueLearning + resume + weeklyPlan lun→dim + recommandations par règles + recent 6), bookmarks toggle, search multi-corpus, practice log (ledger + weakness bank PATTERN_ID), 4 drills générés (pattern/sr random-walk/position sizing/zones supply-demand), flashcards SRS (Leitner 5 boîtes 1/2/4/8/15j, cap quotidien 10, free practice si rien dû), exams (pool 20 questions, tiers BRONZE/SILVER/GOLD), certifications, milestones 13 (computés du vrai état), suggestions journal→cours (5 règles lisibles sur trades CLOSED), events (seeds relatifs à now, toggle registration, passé non joignable), tasks (create/toggle/delete, XP, streak).
- Suggestions via TradesService.listTrades(status CLOSED) — rMultiple/mfeR/plannedRR/emotionAfter/strategyId.
- Pièges : noUncheckedIndexedAccess (guards partout) ; toggle/delete tasks adressent row id OU slug payload ; heredoc python "\\n" a corrompu une ligne (questionsashString) — corrigé ; test TF peut matcher par hasard (assertion honnête).

Stage Summary:
- 10 chantiers livrés (B3,B6,B4,B5,B7,B8,B9,B10,B11,B12) — 453/453 tests verts, lint propre, typecheck API+web OK.
- Reste : B1 (stats 3) → B13 (accounts SPEC-1) → B2 (backup 2) → Phase C (bridge live) → Phase D (vérif+rapport).

---
Task ID: 1-backends (B1 livré)
Agent: Super Z (main)
Date: 2026-10-06 14:25 UTC

Work Log:
- B1 (module stats, 3 routes READ-ONLY, zéro table propre — analytics = lens sur le journal) : stats-helpers (TradeLike, date keys, mulberry32), service transposé 1:1 du mock :
  · statsOverview — netPnl/winRate/profitFactor/expectancy, disciplineScore (moyenne des dailyScores B4), equity curve + dailyPnl, equity peak + maxDD %, deltas 7j vs 7j (netPnl/sparklines hebdo 8 semaines lundi), ghostTrend 30j (fear/discipline), disciplineSaved + hesitationCost (ghosts settled), weeklyCompare 7 colonnes zero-filled.
  · analytics — cards (winRate, PF, expectancy, payoff, maxDD R, recovery trades/days), heatmap 7×6, buckets heures/jours/sessions, emotions (pire avgR d'abord), grade×outcome A-F, tilt timeline (streaks + spikes), sleepScatter [] HONNÊTE (pas de stockage daily-stats), mistakes ledger (B4), distributions R par stratégie.
  · analyticsSuite — resolvePeriodRange (11 périodes + CUSTOM), filtres complets (account/instrument/assetClass/strategy "none"/direction/session/emotion/exitReason/tag), meta (resolvedFrom/To, descriptor, warnings, anomalies TAIL_LOSS, singleCurrency), summary (Sharpe/Sortino √252 methodology notes, SQN), equity+drawdownPct, cumulativeR, rolling 10, dailyPnl, histogrammes R/PnL/durées, drawdowns (flush pattern), risk (concurrent positions, riskDeviationPct, plannedVsRealized), strategies/symbols/assetClasses/directions, psychology (emotions before/after, confidence bands, tilt), quality (MFE capture, scatter), mistakes sur set filtré, events (phases vs éco ±4h, coverage), advanced (moments, percentiles, streaks), Monte Carlo bootstrap seedé (100-2000 sims), reports daily/weekly/monthly ISO.
- Sources : TradesRepository (Decimal→TradeLike), AccountsRepository (currency/balance), DisciplineService (dailyScores+mistakesLedger), GhostsService (export ajouté), PlaybookService (noms stratégies), generateEcoEvents.
- ALIGNEMENT CONTRAT : la vraie shape analyticsSuiteResponseSchema diffère des noms du mock (meta.resolvedFrom/resolvedTo/closedTrades/singleCurrency ; risk ; quality {excursionAvailable, mfe/mae {avgR,medianR,capturePct}, scatter} ; events.calendarCoverage.classifiedTrades ; advanced.r{...}/streaks{avgWin,avgLoss} ; monteCarlo {tradesPerRun, finalR p05/p50/p95, maxDrawdownR p50/p95/worst, methodology}) — service aligné sur LE CONTRAT (source de vérité), pas sur le mock.
- Pièges : heredoc python "\\n" a mangé un `[h` et un commentaire (réparé) ; ordre de déclaration plannedBuckets/plannedVsRealized ; TradeSubRow sans createdAt (lastSeenAt via data.detectedAt) ; anomaly.hint requis ; currency enum cast.

Stage Summary:
- 11 chantiers livrés (B3,B6,B4,B5,B7,B8,B9,B10,B11,B12,B1) — 457/457 tests verts, lint propre, TS OK.
- Reste : B13 (accounts SPEC-1) → B2 (backup 2) → Phase C (bridge live) → Phase D (vérif+rapport).

---
Task ID: 1-backends (B13 vérifié + B2 livré — PARITÉ BACKEND COMPLÈTE)
Agent: Super Z (main)
Date: 2026-10-06 14:50 UTC

Work Log:
- B13 (accounts riche) : VÉRIFIÉ DÉJÀ IMPLÉMENTÉ — le module accounts (trading-account.service 672 lignes, sync 324, provider-registry, encryption AES-256-GCM, rate limiter) couvre le contrat trading-account.ts Phase 3 : providers, connect+initial sync, reconnect/disconnect (§52), test connection (checks nommés), sync trigger/status (idempotent §18), snapshot, positions/orders/deals, codes d'erreur stables §36, 35 tests e2e dans la suite. La matrice d'audit visait le FRONTEND (aucun consommateur du contrat riche) — l'API est prête pour l'UI future.
- B2 (backup, 2 routes) : export GET /export/backup (snapshot wire : trades via toTradeView, playbook strategies, tags) + import POST /import/backup (backupPayloadSchema partagé, re-own au user demandeur, REPLACE trades transactionnel, MERGE strategies/tags).
- DÉCOUVERTE CRITIQUE : les PK (Trade.id, PlaybookRow.id, TagRow.id) sont GLOBALES en DB — le mock les scope par user. Politique d'import : id préservé si libre (restore même-user = ids stables), nouvel uuid sinon (cross-user). accountId des trades importés remappé au compte de l'importeur (422 si aucun). Déduplication strategies/tags par nom (les ids réémis cassent le merge par id). accountId @unique sur TradingConnection/Snapshot : 1:1.
- Pièges : tradeEvent/TradeScreenshot deleteMany via relation trade.userId (pas de colonne userId) ; le sync initial MOCK du connect crée des trades de démo EN ARRIÈRE-PLAN → counts cross-user non déterministes (test aligné sur le déterminisme : restore même-user strict + merge cross-user).

Stage Summary:
- PARITÉ BACKEND COMPLÈTE : B1-B13 tous livrés — 460/460 tests e2e verts (38 fichiers), lint propre, typecheck OK.
- Reste : Phase C (bridge live NEXT_PUBLIC_API_LIVE + smoke E2E) → Phase D (vérification totale + worklog + rapport final).

---
Task ID: phase-c (bridge live + B14)
Agent: Super Z (main)
Date: 2026-10-06 17:10 UTC

Task: Phase C — brancher le frontend sur le vrai backend (NEXT_PUBLIC_API_LIVE + smoke E2E) et Phase D partielle

Work Log:
- Pont live : rewrite Next `/api/v1/:path*` → `API_PROXY_TARGET` (défaut http://localhost:4000) — same-origin, zéro CORS, cookie HttpOnly `cosmoz_rt` first-party. `NEXT_PUBLIC_API_LIVE=true` → base `/api/v1` + pas de MSW ; le mock reste le DÉFAUT zéro-env (sémantique inversée : NEXT_PUBLIC_API_MOCKED!=="false" && LIVE!=="true").
- DÉRIVE DE CONTRAT TRACQUÉE : le refresh frontend envoyait `Content-Type: application/json` avec corps vide — le mock MSW tolérait, Fastify rejette 400 → session non restaurée au reload. Fix : plus de header sur le refresh (contrat : pas de corps).
- DÉCOUVERTE MAJEURE : le module Integration Hub (page /integrations, 6 routes §5-§27) n'avait AUCUN backend — l'audit l'avait manqué. B14 CONSTRUIT : module `integrations` (catalogue 12 providers statique + état par user sur IntegrationRow kind=PROVIDER|WEBHOOK|EVENT|ERROR|ECO|NEWS|SEEN, seed paresseux, connect/disconnect/test/sync, §32 scénario cTrader, §12 pipeline webhook HMAC idempotent, §28 rétention, secrets jamais sur le wire). 2 migrations (table + unique). 4 e2e.
- Smoke live `scripts/verify-live-bridge.js` : register UI → token dev-mail → verify → login → 15 routes → write-through discipline/OCR/nofy + persistance après reload → audit trafic. RÉSULTAT FINAL : 26/26, 330 requêtes /api/v1, zéro 4xx/5xx, zéro pageerror.
- Pièges : process serveurs qui meurent entre appels bash → subshell `(setsid nohup … &)` OBLIGATOIRE ; pkill "next start" ne tue pas next-server → `fuser -k 3000/tcp` ; build mélangé (serveur stale + .next neuf) = pages vides sans hydratation ; racine/.env + DATABASE_URL shell sqlite écrasent apps/api/.env pour Prisma (migrate dev non-interactif échoue sur warning → migration SQL manuelle + migrate deploy) ; identifiants mock = trader@cosmoz.app / cosmoz-demo-2026 (verify-recognition.js corrigé).
- Suite API : 464/464 verts (460 + 4 B14), lint propre, typecheck OK. Builds défaut (mocké, probe recognition vert) et live (26/26) validés. Commit `git log -1`.

Stage Summary:
- PHASE C COMPLÈTE : le frontend tourne de bout en bout sur le vrai backend. Parité backend B1-B14 (14/14 domaines).
- Reste : Phase D — vérification finale totale + rapport.

---
Task ID: phase-d (vérification totale + rapport)
Agent: Super Z (main)
Date: 2026-10-06 17:35 UTC

Task: Phase D — vérification totale du projet après Phase C + rapport final

Work Log:
- Vérification API : 464/464 vitest verts (39 fichiers e2e/unit), lint 0 erreur, tsc build OK, 12 migrations appliquées.
- Vérification Web : typecheck OK, lint 0 erreur (après 2 correctifs : eslint override scripts/*.js CommonJS + recognition-view setState-in-effect → ajustement d'état au rendu), build mocké et build live OK.
- E2E mocké : probe recognition VERT (login → upload → analyse → review → confirm) ; sonde session-restore VERT (reload complet → Dashboard, 0 pageerror — valide le fix refresh sur les deux transports).
- E2E live : smoke verify-live-bridge 26/26 (register → verify → login, 15 routes, write-throughs discipline/OCR/nofy persistés après reload, 330 requêtes /api/v1, zéro 4xx/5xx).
- Probes legacy périmés documentés (préexistants, pas des régressions) : probe-regression.js (sélecteur `aref` corrompu), verify-final-modules.js (sans login), verify-auth.js (testids register périmés).
- PIÈGE INFRA VERROUILLÉ : ne JAMAIS builder pendant qu'un next-server tourne — le vieux process sert l'ancien .next (chunks fantômes → 500, pages vides). Kill par PID (kill -9 <pid>) ou fuser -k 3000/tcp vérifié par `ss -tlnp` AVANT le build ; vérifier l'absence de EADDRINUSE au log après start.
- Captures probes (scripts/shots) désormais ignorées par eslint + checkout avant commit.

Stage Summary:
- PHASE D COMPLÈTE : parité backend B1-B14 (14 domaines, ~190 routes), pont live prouvé par E2E de bout en bout, mock par défaut intact.
- Livrables : commits a5c1064 (Phase C + B14) et 287bc6f (Phase D) sur main — tout verrouillé dans git.

---
Task ID: rebrand-euforia (logo app + rebrand complet)
Agent: Super Z (main)
Date: 2026-10-06 18:20 UTC

Task: Implémenter le logo de l'app depuis Eurofia.zip (kit "Euforia") en suivant docs/brand-guide.md + README.md ; commit avant chaque livrable (règle verrouillée).

Work Log:
- État disque vérifié d'abord : Phases C/D committées (a5c1064→c3b72f0), tree propre. Zip extrait → kit complet "Euforia" (marque E 3 rubans, tagline TRADE SMARTER. GROW FASTER., palette violet #8B5CF6 / indigo #6366F1 / cyan #22D3EE sur navy #020617).
- Commit d9c50f5 — assets : public/brand/** (15 SVG + PNG), icon.svg remplacé (favicon squircle officiel), favicon.ico reconstruit (16/32/48, Pillow), apple-icon.png 180 généré (auto-découvert par Next), icon-192.png générée (manquante du kit), PNG tronqué du zip réparé (mark-light-512 depuis le 1024) — script persisté scripts/build-euforia-icons.py ; manifest mergé (identité Euforia + chrome navy #020617, PNG any+maskable) ; design tokens src/design-system/brand.ts + euforia.css importés dans globals.css (valeurs opt-in, thème "Le Registre" intact) ; metadata racine mergée (title template %s — Euforia, description, applicationName, og-image 1200×630).
- Commit b960dbc — composant : src/components/brand/euforia-logo.tsx, artwork géométrie kit verbatim (paths rubans, gradient 135°, IDs scopés useId), API documentée variant=mark|full tone=dark|light|white|black|auto size=sm|md|lg (+withTagline, interdit <120px), tone auto = mot-symbole text-foreground (thème-aware) avec marque invariante ; remplace CosmozLogo dans SidebarBrand (mark collapsed / full étendu), AuthLayout (watermark 560px + lockups), AuthGate splash ; cosmoz-logo.tsx supprimé.
- Commit 36b09bc — rebrand chaînes web : sed sensible à la casse sur 40 fichiers/94 occurrences (i18n dictionaries, metadata layouts auth/app, navigation.ts root crumb, topbar match, command palette, user-avatar fallback, register/login, discipline gauge "Euforia Discipline Score" + aria, kpi "Euforia Index · /100", integrations hub copy + headers doc X-Cosmoz-*→X-Euforia-* [simulateur seul, aucun wire réel], security device labels "Euforia PWA", playbook template library, monthly report, offline.html + sw.js, comment sw-register/sonner/theme-toggle/equity-constellation) ; probes verify-analytics (locator aria-label) + verify-live-bridge (commentaire) mis à jour. Emails @cosmoz.app, cookie cosmoz_rt, identifiants démo CONSERVÉS (identité de connexion, pas de la marque).
- Commit d506538 — rebrand chaînes API : EMAIL_FROM "Euforia <no-reply@cosmoz.app>", TOTP ISSUER "Euforia" (codes inchangés — issuer ne fait que labeler l'URI otpauth, HMAC = secret+temps ; test security ligné), sujets mail ×3, "Euforia Mock Broker" + "Euforia-MT5-Sim", catalogue intégrations (PWA/Sample Wire), commentaires modules. Suite vitest : 464/464 verte.
- Commit d7e87ba — fix manifest (chemins /brand/png/* — le kit range les PNG dans png/) + sonde scripts/verify-rebrand.js : 16/16 verts (assets 200, manifest name Euforia, lockups login/dashboard, zéro texte Cosmoz visible, zéro pageerror) + captures scripts/shots/rebrand-{login,dashboard}.png vérifiées visuellement (squircle + rubans gradient + wordmark Inter, watermark discret, design par ailleurs intact).
- Build web clean-rebuild OK (ports tués par PID avant build — piège verrouillé), lint 0 erreur, tsc 0 erreur.

Stage Summary:
- REBRAND EUFORIA COMPLET : app 100% Euforia (logo, favicon, manifest, UI, i18n, mocks, API payloads), design système préexistant intact, identifiants démo inchangés (trader@cosmoz.app / cosmoz-demo-2026).
- 5 commits : d9c50f5 (assets) → b960dbc (composant+swap) → 36b09bc (chaînes web) → d506538 (API, 464/464) → d7e87ba (fix manifest + sonde 16/16).
- Vérification : tsc/lint/build verts, sonde navigateur 16/16, captures validées à l'œil.

---
Task ID: rebrand-euforia-mark-identique (correction du E)
Agent: Super Z (main)
Date: 2026-10-06 20:55 UTC

Task: « Je veux que le E soit exactement pareil, à l'identique » — le E du kit ne correspondait pas à l'image de référence fournie.

Work Log:
- CONSTAT : comparaison côte à côte (scripts/compare-e-marks.py) — le kit zip et l'image de référence sont DEUX dessins différents (rubans plus fins + pointes crantées + gradient inversé violet TL→cyan BR dans le kit ; référence = rubans gras à pointes arrondies + gradient cyan TR→violet BL). L'image de l'utilisateur = vérité.
- VECTORISATION DE LA RÉFÉRENCE : extraction du masque (seuil luminance 0.20→0.34, despeckle, feather) → silhouette 250×306 (crop 185,435→455,770 de l'image 1233²) ; vtracer 0.6.15 mode binary/spline sur mask 3x (750×918) → 1 seul path (pas de trous) ; PIÈGE : le path porte son propre transform translate(733.375,5.625) — conservé, gradient userSpaceOnUse recalé dans l'espace local du path.
- GRADIENT ÉCHANTILLONNÉ sur les vrais pixels : #7B22F4 (échine) → #6318E8 28% → #4299FD 62% → #28D6F6 (pointe TR), axe gauche→haut-droit (~93°). Rendu final comparé à la référence : IDENTIQUE (scripts/shots/e-compare-v2.png, e-final-check.png).
- ASSETS RECONSTRUITS (commit f678bd5) : euforia-mark{,-white,-black}.svg, euforia-icon.svg (squircle 256 rx56 + marque à hauteur 208), favicon.svg, 21 PNG re-rastérisés Playwright transparent (mark 64→1024, mono, icon 16→512), og-image.png rebuild (Carlito-Bold, tagline dégradée), icon.svg/favicon.ico/apple-icon.png régénérés ; fichiers kit à l'ancien E supprimés (logo-*, wordmark-*, variantes light/dark).
- COMPOSANT (commit 5d56f29) : EuforiaLogo en <img> des SVG servis (/brand/euforia-icon.svg ou mono), width/height en ATTRIBUTS (les classes size-* les surchargent — watermark 560px et sidebar size-7 préservés), API variant/tone/size inchangée ; tokens brand.ts + euforia.css alignés sur le gradient échantillonné.
- PIÈGE INFRA RE-DÉCLENCHÉ : EADDRINUSE au redémarrage — l'ancien next-server survivait à fuser -k et servait un .next supprimé (chunks 404, hydration morte, body vide dans la sonde). FIX : kill par PID via ss -tlnp, port vérifié LIBRE, start, log "Ready" vérifié → sonde 16/16.
- Vérification : tsc 0, lint 0 erreur, build OK, sonde rebrand 16/16, captures login+dashboard validées à l'œil — E identique à la référence.

Stage Summary:
- LE E DE L'APP = TA RÉFÉRENCE, à l'identique (silhouette vectorisée de ton image, gradient sur tes couleurs). Assets cohérents de bout en bout (SVG, PNG, favicon, og-image, composant, tokens).
- 2 commits : f678bd5 (assets) → 5d56f29 (composant + tokens). Scripts persistés : trace-euforia-mark.py, extract-reference-mark.py, rasterize-euforia.js, rebuild-og-and-icons.py, compare-e-marks.py.

---
Task ID: mark-depth-ombres-contours (fidélité photométrique du E)
Agent: Super Z (main)
Date: 2026-10-07 00:15 UTC

Task: « c'est parfait… mais on va juste bien ajouter, arranger les détails des contours, les ombres — c'est ce qui fait la vraie différence » — ajouter la profondeur 3D (ombres de plis + brillance) au marqueur, désormais silhouette-exact.

Work Log:
- CONSTAT : la référence est un rendu 3D — le gradient linéaire plat n'a ni les creux sombres sous chaque pli ni la brillance le long des rubans (MAE plat vs référence : 20.23).
- TENTATIVE 1 (abandonnée, scripts/add-mark-depth.py) : cartes d'ombre/lumière = écarts réf vs plat, vectorisées vtracer binary ×niveaux + feGaussianBlur → taches nuageuses (MAE 21.8) ; les seuils bas captent le mismatch gradient, le blanc désature la brillance.
- TENTATIVE 2 (abandonnée, scripts/try-color-trace.py) : vtracer colormode='color' sur la réf compositée → 630 paths / 510KB postérisés en bandes plates (MAE 23.2) — vtracer couleur est fait pour l'art à aplats, pas les dégradés lisses.
- SOLUTION RETENUE (scripts/bake-reference-shading.py) : hybride vector/raster — silhouette vectorielle tracée + gradient de base CONSERVÉS (bords nets à toute taille, fallback si image rejetée) + <image data:URI PNG 500×612 lossless (≈2× détail natif, 148KB→198KB b64)> des pixels DE LA RÉFÉRENCE, clippée par la silhouette. MAE 20.23 → 1.14 (résidu = rééchantillonnage). Data-URI obligatoire : un SVG chargé en <img> ne peut pas fetcher de ressources externes.
- Pièges quantification : P-256 FASTOCTREE = 39KB mais banding visible à 2× (p95=12) → rejeté ; WebP-lossless possible (114KB) mais PNG = compat universelle, retenu.
- Mono white/black INTENTIONNELLEMENT plats (reproduction monochrome — pratique marque standard).
- Propagation : 21 PNG re-rastérisés (rasterize-euforia.js), og-image + public/icon.svg + favicon.ico + apple-icon reconstruits (rebuild-og-and-icons.py).
- PIÈGE INFRA re-confirmé : le serveur lancé via setsid meurt à la fin de l'appel shell (sandbox reape les enfants) → lancer next start ET la sonde dans LE MÊME appel bash. EADDRINUSE évité (kill par PID d'abord, port vérifié libre, "Ready" au log).
- Vérification : sonde rebrand 16/16 (pageerrors=0), captures in-app — plis visibles header 56px, sidebar 28px, watermark auth ; MAE panel scripts/shots/depth-compare-2.png (gauche=app, droite=référence : identiques).

Stage Summary:
- LE E DE L'APP = TA RÉFÉRENCE Y COMPRIS OMBRES ET CONTOURS (exactitude photométrique, pas seulement la silhouette).
- 1 commit : 89f1201. Scripts persistés : bake-reference-shading.py (production), add-mark-depth.py + try-color-trace.py (tentatives documentées), render-mark-frame.js (utilitaire).
- Intermédiaires gardés : scripts/euforia-trace/{flat-render,baked-render,map-shadow,map-hilite}.png.

---
Task ID: auth-demo-panel-fix (login bloqué — identifiants démo invisibles)
Agent: Super Z (main)
Date: 2026-10-07 01:05 UTC

Task: « je suis bloqué à la page login, j'arrive pas à me connecter, j'ai pas les emails et password de démos »

Work Log:
- CAUSE RACINE : deux tests de mode mock divergents. MockProvider : mock PAR DÉFAUT (mocked sauf API_MOCKED=false ou API_LIVE=true — la preview canonique n'a aucune env) ; les panneaux démo auth : test strict legacy `NEXT_PUBLIC_API_MOCKED === "true"` → undefined en zero-env → couche mock ACTIVE mais panneaux d'identifiants CACHÉS. Login fonctionnel, mais aucun identifiant visible nulle part.
- FIX (commit aef9f27) : src/lib/api/mode.ts = constante canonique API_MOCKED unique, importée par MockProvider + login/register/forgot + auth-gate + dev-hooks (dev-hooks garde son garde-fou NODE_ENV=production).
- BONUS : le panneau DEMO ACCOUNT affiche maintenant LES DEUX identifiants (trader@cosmoz.app + cosmoz-demo-2026) — le bouton Fill les remplit, plus besoin de deviner.
- PIÈGE SONDE : le check "no Cosmoz text" matchait l'email démo puis le mot de passe démo désormais AFFICHÉS → le probe strip l'identité de connexion (données de connexion ≠ copie marque) et asserte maintenant "demo credentials panel visible" → 17/17 verts.
- Vérification : tsc 0 erreur, eslint 0 erreur (7 fichiers), rebuild + start propre (kill PID d'abord), login end-to-end rejoué sur build frais → dashboard.

Stage Summary:
- PLUS JAMAIS DE BLOCAGE LOGIN : identifiants démo affichés sur la page (panneau Demo account), bouton Fill, sonde 17/17 avec assertion panel visible.
- Identifiants inchangés : trader@cosmoz.app / cosmoz-demo-2026 (identité de connexion, volontairement non rebrandée).
- 1 commit : aef9f27.

---
Task ID: ocr-prompt3-rebuild (Import & Recognition V1 — section Insights)
Agent: Super Z (main)
Date: 2026-10-07 03:30 UTC

Task: « On passe à l'implémentation du module OCR, dans la section INSIGHTS (l'entrée entre Analytics et Calendar). Audit d'abord — si ça existe déjà, supprime l'ancien et applique le prompt. » (PROMPT 3 — FRONTEND OCR & TRADE RECOGNITION V1, upload/Pasted Content_1791324302241.txt, 2369 lignes)

Work Log:
- PRÉ-REQUIS : tree propre (travaux précédents committés : a2f6662 + fix auth aef9f27). Règle « commit avant chaque implementation » respectée.
- SKILLS chargés : fullstack-dev (conventions projet appliquées en priorité — apps/web, MSW, probes) + impeccable (PRODUCT.md/DESIGN.md « Le Registre » : Operate mode, ruling over cards, stamps, mono tabular, 1 accent cobalt, zéro hex en dur) + craft-floor/new-work/operate lus avant l'UI.
- AUDIT (§5/§72) : le module EXISTAIT — /recognition (section Trading), recognition-view.tsx monolithique 562 lignes (upload → liste plate → confirm), queries/recognition.ts, handlers MSW ocr.ts, contrat partagé packages/shared/src/schemas/ocr.ts (Phase 19 : statuts, champs+confiance+sourceRegion, corrections, pagination), module NestJS apps/api/src/modules/ocr (hors scope frontend). Verdict : contrat SAIN (réutilisé, §69), UI NON CONFORME au prompt V1 → suppression + reconstruction.
- Commit 3e51379 — suppression V0 + navigation : entrée déplacée Trading → INSIGHTS entre /analytics et /calendar (demande utilisateur), label « Import & Recognition » (FileScan), shell temporaire cohérent.
- Commit ac9e4be — couche service : handlers MSW reconstruits = MockRecognitionService ASYNCHRONE (POST → PROCESSING, settle time-based côté serveur sur GET — aucun setTimeout en React, §15 ; échec déterministe min(w,h)<200 → EXTRACTION_FAILED pour la QA) ; historique seedé réaliste (XAUUSD BUY 94% confirmé, EURUSD, NAS100 SELL, BTCUSD exit manquant, US30 FAILED — §60) ; useOcrRecognition(id) poll 700ms pendant PROCESSING ; endpoints Phase 19 inchangés (§69 — rien d'inventé) ; namespace i18n complet dictionaries/en/recognition.ts (terminologie du prompt : « recognition confidence », jamais « accuracy »).
- Commit bbf00c6 — workspace complet : recognition-model.ts (étapes, timeline d'affichage, stamps, validation par champ — décimal/symbole/direction/datetime, volume positif — formatage financier EXACT §47, dates locale §48, limites upload miroir du schéma) ; ScreenshotUploader (drag&drop + picker natif, validation type/taille/vide, preview+dims, replace/remove, object-URL via dérivation au rendu — pattern React canonique) ; RecognitionSettings (auto-detect informatif, modes futurs DÉSACTIVÉS « coming soon » §14) ; RecognitionProgress (7 étapes aria-live, cancel = vrai DELETE §55) ; RecognitionResult (capture | liste réglée de champs, 2 col desktop / empilé mobile §35) ; RecognizedField (confiance, statuts, warnings, édition inline validée — Select BUY/SELL, Input ailleurs) ; TradeDraftReview (5 sections miroir du formulaire + R:R calculé « 1 : X » §24, confirmation explicite §28, corrections = valeurs autoritaires, le contrat ne crée JAMAIS de Trade) ; succès §29 + lien journal ; URL state ?job= (refresh-safe) + ?tab=history §44 ; étapes DÉRIVÉES au rendu (zéro effet cascade — règles react-hooks 2025) ; stat-strip + hero-as-empty-state §10.
- Commit ef72e17 — historique : table réglée (thumb auth lazy · plateforme · stamp statut · confiance · créé · actions), collapse mobile en cartes réglées §35, filtres avec empty-states dédiés §33, suppression derrière dialog focalisé §61, tab-nav Overview | History.
- Commit 5651e45 — vérification : probe scripts/verify-recognition.js 24/24 (parcours §75 complet + FAILED + CANCEL + captures 3 viewports + zéro pageerror). 3 bugs réels attrapés par le probe : (1) ocrHandlers jamais ré-enregistrés dans handlers/index.ts après suppression V0 → 404 sur /api/ocr/* ; (2) pathParam(params, ":id") — MSW v2 key SANS deux-points → 400 sur tous les calls par-id, job jamais settle ; (3) networkidle jamais atteint (WebSocket session-live) → wait strategy corrigée. 2 défauts visuels corrigés : « Recent imports » dupliqué (overview + mobile), « BASIC INFORMATION » répété (platform replacé dans la section Basic). Sonde rebrand 17/17 — zéro régression. impeccable detect --json : [] (zéro finding).

Stage Summary:
- PROMPT 3 LIVRÉ : module Import & Recognition complet dans INSIGHTS (entre Analytics et Calendar), production-grade, integration-ready (MockRecognitionService ⇄ ApiRecognitionService interchangeables, l'UI ne voit que des hooks React Query → apiClient → NestJS), Le Registre respecté (détecteur design : 0 finding), a11y + responsive + i18n-namespace EN (FR prêt à revenir — décision EN-only verrouillée).
- 5 commits : 3e51379 → ac9e4be → bbf00c6 → ef72e17 → 5651e45.
- Hors scope respecté (§66) : aucun moteur OCR, aucun appel FastAPI direct, aucun modèle Prisma — le contrat Phase 19 reste la frontière.

---
Task ID: ocr-phase21-backend-bridge (confirmation → Trading Core)
Agent: Super Z (main)
Date: 2026-10-07 00:40 UTC

Task: « On continue avec le module OCR, cette fois on passe backend » + prompt maître backend uploadé (Pasted Content_1791329188474.txt == SPEC-3, 3639 lignes : NestJS orchestration + FastAPI déterministe, sans ML/LLM, human-in-the-loop obligatoire).

Work Log:
- PRÉ-REQUIS : tree propre (c0d1d12) — règle « commit avant chaque implémentation » respectée.
- AUDIT §8–§26 (découverte seule, zéro modif) : le backend OCR Phase 19 EXISTE ET EST VÉRIFIÉ (module complet + sidecar FastAPI/Tesseract 27 pytest + migration + 68 tests) ; le frontend PROMPT 3 consomme ce contrat 1:1 ; Trading Core (modules/trades) EXISTE MAINTENANT — le report Phase 19 (« Trade-creation DEFERRED until Trading Core exists ») est le SEUL trou restant. Décisions : pont = orchestration APRÈS le commit de confirmation via TradesService.createTrade (§77, jamais prisma.trade côté OCR) ; compte = convention importTrades (défaut persisté, jamais la capture §81) ; dédoublonnage externalRef ocr:<recognitionId> (§79) ; échec d'import NE JAMAIS faire échouer la confirmation (§126 → warning stable + audit).
- Commit bridge : contrat additif (OcrRecognition.tradeId nullable, capture input source MANUAL|IMPORT pour la provenance §82, 2 types d'audit OCR_TRADE_IMPORTED/OCR_TRADE_IMPORT_SKIPPED) ; Prisma tradeId FK ON DELETE SET NULL + migration 20261007010000_ocr_trade_link (provenance à sens unique : supprimer la reconnaissance garde le Trade) ; trade-import.logic.ts PURE (éligibilité = les 4 champs cœur complets et positifs ; variante CLOSED seulement si prix de sortie ET closeTime confirmés — rien d'inventé §54 ; P&L JAMAIS copié de l'OCR §55/§15) ; ocr-trade-import.service.ts (résolution compte/instrument/doublon, skips honnêtes INCOMPLETE/NO_ACCOUNT/UNKNOWN_SYMBOL/REJECTED, isolation totale) ; repository.linkTrade gardé sur status=CONFIRMED ; source traversée dans createTrade (+3 lignes). Compat frontend minimale (§7) : tradeId null dans les seeds MSW, 2 libellés d'audit — UI intacts, le mock ne crée toujours JAMAIS de Trade.
- Commit tests : 11 unitaires mapping (éligibilité, variantes, planchers, provenance) + 7 e2e Phase 21 sur AppModule/DB/moteur réels (import canonique miroir des valeurs confirmées, replay sans doublon, skips honnêtes, IDOR, survie du Trade) + gate typecheck restauré (7 erreurs noUncheckedIndexedAccess préexistantes sur HEAD dans integrations.e2e).
- Commit runtime : scripts/phase21-runtime-verify.sh — sidecar RÉEL (:3004) + API compilée (:4000) + DB dev : compte MOCK → vraie capture MT5 1150×420 → Tesseract → confirm → Trade lié → asserts journal (source IMPORT, SL/TP/quantité reflétés, notes provenance, OPEN honnête car prix de sortie illisible §54) → replay ×1 → suppression reconnaissance garde le Trade. **PHASE 21 RUNTIME VERIFICATION: ALL CHECKS PASSED**.
- BUG RÉEL ATTRAPÉ AU RUNTIME (§106) : le replay idempotent comparait le payload BRUT au record CANONISÉ → retry « 2345,60 » = 409 au lieu de 200. FIX : canonicalizeCorrections AVANT la comparaison de replay (canonical-vs-canonical) + e2e de régression (replay forme virgule → 200). 64 tests OCR verts après fix.
- Vérification finale : tsc 0 (src+test), eslint 0, api 480/482 (2 échecs PRÉEXISTANTS sur HEAD vérifiés par stash : discipline B4 tradesToday + session B5 — hors scope, documentés), sidecar pytest 27/27, web build + sonde recognition 24/24 + sonde rebrand 17/17 (zéro pageerror), migration appliquée à la DB dev (migrate deploy).
- PIÈGE INFRA : la ligne mail du register arrive avec un délai — boucle de token durcie (80×0.5s) dans le script runtime ; le premier échec venait aussi de la migration absente de la DB dev (migrate deploy avant le run).

Stage Summary:
- LE PONT CONFIRMATION → TRADE CANONIQUE EST EN PLACE ET VÉRIFIÉ SUR STACK RÉELLE : « Confirm & import » du frontend fait maintenant atterrir le trade dans le journal en mode live (source IMPORT, P&L recalculé serveur, lien traçable recognition→trade, suppression à sens unique). Contrat frontend inchangé (tradeId additif), human-in-the-loop intact, zéro ML/LLM.
- 3 commits : bridge (contrat+logique+service) → tests+gate → fix replay+runtime. Rapport : docs/backend/PHASE-21-OCR-TRADE-BRIDGE-REPORT.md.
- Restes connus : 2 échecs e2e préexistants hors module (discipline B4, session B5) ; fuseau horaire des timestamps wall-clock = report Phase 19 assumé.

---
Task ID: ocr-engine-quality-phase (13 suggestions — moteur, anti-erreurs, intégration, ops)
Agent: Super Z (main)
Date: 2026-10-07 04:30 UTC

Task: « Implémente toutes les suggestions features, absolument toutes, avec audit préalable… redesign moi le frontend, meilleur design professionnel et premium » — 4 volets : (1) qualité de reconnaissance (preprocessing avancé, second moteur en arbitrage, templates de layout), (2) anti-erreurs (doublons pHash, multi-trades, mémoire de corrections, re-OCR par crop), (3) intégration COSMOZ (rattachement comptes, OCR Analytics, tags playbook auto-suggérés), (4) robustesse/ops (progression temps réel SSE, rétention + stockage, PDF multi-pages).

Work Log:
- PRÉ-REQUIS : tree propre (a92b3d2) — règle « commit avant chaque implémentation » respectée. AUDIT COMPLET : sidecar FastAPI (extraction PSM 6 unique, preprocessing minimal), NestJS (pipeline request-scoped, pont Phase 21 vérifié), contrat Phase 19, frontend PROMPT 3 (polling 700ms, mono-trade), MSW, design system Le Registre. Découvert au passage : dérive Prisma latente Phase 21 (tradeId sans @db.Uuid → migrate dev aurait coercé en TEXT) — CORRIGÉE au passage.
- COMMIT 1 (moteur sidecar, pipeline v2.0.0) : preprocessing.py = dénoise médian (petits panneaux) + deskew par profils de projection (−6°..+6°, appliqué ≥ 0.35°) + upscale LANCZOS plancher ×2 + unsharp + CLAHE numpy (clip+redistribution+blend bilinéaire 8×8) + binarisation Otsu + dHash 64 bits ; arbitration.py = seconde passe PSM 11 sparse sur la variante binarisée avec arbitrage PAR CHAMP (PASS_AGREEMENT booste, PASS_DISAGREEMENT consigne sans moyenner, SECOND_PASS_ONLY secourt) ; templates.py = a priori structurels MT5 desktop history / mobile summary / generic (fenêtres de plausibilité, détection ligne d'en-tête S/L T/P, profit en fin de ligne à signe explicite UNIQUEMENT, bonus LAYOUT_MATCH plafonné) ; extraction multi-trades (candidates groupées par ligne d'ordre, jamais fusionnées en un faux trade) ; /v1/recrops re-OCR ciblé ; réponse enrichie (perceptualHash, passes, layoutTemplate, deskewDeg). 43/43 pytest (27 existants + 16 nouveaux).
- COMMIT 2 (contrat + DB) : schémas partagés additifs (suggestion, tradeCandidates, duplicateOf, accountId, tradeIds, batches[], recrop, analytics, storage, asset.purged, PDF accepté) ; migration 20261007012014_ocr_engine_quality (OcrAsset.phashHex, OcrRecognition.accountId FK SET NULL + tradeIds JSONB + screenshotPurgedAt, modèle OcrCorrectionPattern (userId+fieldKey+rawValue→correctedValue, count, lastSeenAt)) ; port moteur étendu (candidates, hash, métadonnées passes/layout/deskew/dims document, crop optionnel).
- COMMIT 3 (services NestJS) : dédoublonnage pHash (pool récent 400, Hamming ≤ 8, flag ADVISORY duplicateOf — le pipeline tourne quand même, la review décide) ; attachement compte à l'upload ET au confirm (ownership validé → 404) ; mémoire de corrections (chaque champ MODIFIÉ au confirm devient un pattern à récurrence ; les futurs imports portent des suggestions advisory, jamais auto-appliquées §21) ; re-OCR crop (rate-limité, bornes validées, éphémère — rien persisté) ; confirmation groupée (batches[] canonisés contre LES CHAMPS de chaque candidate, isolation §126 PAR DRAFT, externalRef ocr:<id>:<i>, replay idempotent canonical-vs-canonical, tradeId=primaire + tradeIds=total) ; PDF multi-pages côté sidecar (pypdfium2, budget 10 pages, deadline soft ENTRE pages avec avertissement PARTIAL explicite, dims rendues remontées à l'asset) ; suggestions de tags déterministes (Import + session UTC + classe d'actif). 29 nouveaux tests (unit purs + e2e app/DB réelles).
- COMMIT 4 (ops) : SSE GET /ocr/recognitions/:id/events (poll serveur 300ms, fenêtre bornée 60s, événement gone, auth JWT — lecture fetch-stream côté client car EventSource ne porte pas d'Authorization) ; rétention OCR_RETENTION_DAYS (défaut 30, 0=off) — purge des BINAIRES des CONFIRMED/FAILED après fenêtre (REVIEW_REQUIRED grâce 2×), rows JAMAIS supprimées, image 404 après purge, asset.purged exposé, passse idempotente 6h ; GET /ocr/storage (usedBytes retenus, compteurs, fenêtre) ; GET /ocr/analytics (funnel uploads→completed→review→confirmed→importedTrades lu depuis Trading Core via externalRef ocr:%, corrections par champ depuis le ledger mémoire, confiance/durée moyennées en jsonb SQL, doublons bloqués). FIX requis : casts $1::uuid sur les requêtes raw.
- COMMIT 5 (frontend) : MSW miroir de toutes les routes + seed d'un history panel groupé 2 drafts + ledger mémoire mock ; hooks useOcrRecrop/useOcrAnalytics/useOcrStorage/useOcrRecognitionEvents (lecteur fetch-stream qui écrit dans le cache React Query, no-op en mode mock où le polling garde le job) ; vue résultat : bannière « Already imported » + lien profond, outil de crop par rectangle glissé (mapping boîte d'affichage → pixels réels), lectures de région éphémères applicables en un clic ; chips de suggestion par champ (×occurrences) ; confirmation groupée : cartes par draft avec include + corrections par draft via sélecteur + batches[] au confirm ; succès : nombre de trades importés + chips de tags suggérés ; configure : sélecteur de compte ACCOUNTS ; uploader accepte les PDF (carte fichier honnête, pas de faux raster) ; carte « Import & Recognition quality » dans l'onglet Quality d'Analytics ; i18n EN étendu (engine/duplicate/suggestions/crop/multi/storage/tags/analytics), tokens Le Registre partout.
- VÉRIFICATIONS : sidecar 46/46 pytest (Tesseract 5.5.0 réel) ; API 511/511 (unit + e2e sur AppModule/DB réelles — y compris les 2 échecs préexistants, désormais verts) ; web tsc + eslint + build propres ; sonde recognition 24/24 (zéro pageerror, parcours complet + FAILED + CANCEL + captures) ; sonde rebrand 17/17 (zéro régression) ; scripts/ocr-engine-quality-verify.py sur stack RÉELLE : ALL CHECKS PASSED — résumé/multi-trades 3 drafts groupés symboles distincts/dHash déterministe/recrop/double passe/deskew, 5.0s.
- PIÈGES : (1) migration dev échouée restaurée via migrate resolve --rolled-back + purge de l'enregistrement orphelin avant relance ; (2) MultiEdit sur ocr.ts partagé a créé un bloc dupliqué (TDZ) — corrigé par déplacement de ocrFieldSuggestionSchema AVANT ocrExtractedFieldSchema ; (3) $queryRawUnsafe sérialise les uuid en TEXT → casts explicites ; (4) probes relancées serveur+sonde DANS LE MÊME appel bash (setsid tué entre les appels).

Stage Summary:
- LES 13 SUGGESTIONS SONT IMPLÉMENTÉES DE BOUT EN BOUT (moteur réel vérifié, contrat additif, human-in-the-loop intact — rien ne devient autoritaire sans confirmation explicite, aucun LLM, zéro valeur inventée).
- 5 commits : preprocessing/arbitrage/templates/candidates/pHash/recrop (sidecar) → contrat+migration+port → services NestJS (dédoublonnage/compte/mémoire/recrop/groupé/PDF/tags) → ops (SSE/rétention/stockage/analytics) → frontend intégral + carte Analytics.
- Le design reste « Le Registre » (détection impeccable : ruling, stamps, mono tabulaire, un accent cobalt) — les nouvelles surfaces (bannière doublon, cartes de drafts, crop tool, chips) suivent les mêmes tokens sans hex en dur.
- Restes connus : l'arbitrage est un second passage DÉTERMINISTE (PSM 11 sur binarisé), pas un VLM — l'adaptateur port est prêt pour un vrai second moteur ; purge rétention pilotée par intervalle in-process (pas de BullMQ) ; suggestions de tags informatives (l'application se fait au journal).

---
Task ID: ocr-v2-master-spec (105 sections — complete feature expansion)
Agent: Super Z (main)
Date: 2026-10-07 04:40 UTC

Task: « Voici d'autres suggestions à implémenter, si elle existe déjà tu ignores ce qui existe déjà » — le V2 MASTER PROMPT (105 sections, ~40 features) : audit → réutilisation → extension → implémentation → vérification, zéro ML/LLM, human-in-the-loop intact.

Work Log:
- PRÉ-REQUIS : tree propre (ae28493). AUDIT §2/§8 complet via 3 sondes parallèles (sidecar FastAPI, module NestJS, frontend+contrat) : la plateforme V1 + Phase 21 + engine-quality couvre ~60 % des 40 features ; le rapport d'audit a listé 9 vrais trous (multi-screenshots/fusion, doublons de TRADE par contenu, couche décision — issues/qualité/cross-field/timeline, largeur plateformes/types, reprocess, collections, comparaison, prefill review, overlays frontend) + 3 violations d'audit (numpy/pypdfium2 non déclarés, label PSM mensonger, checksum jamais vérifié).
- COMMIT 1 fbb70b0 — sidecar pipeline v3.0.0 : detect_platform (7 plateformes) + detect_screenshot_type (7 types fins, règles structurelles documentées, UNKNOWN explicite), vérification SHA-256 déclarée (images ET PDF → VALIDATION_FAILED), exitPrice par labels explicites uniquement (« Exit price »/« Closed: » — le mot « close » d'une ligne d'historique ne capture JAMAIS le volume), _labeled_value en fullmatch décimal (bug latent de champs null corrigé), LONG/SHORT mots de direction, label honnête block_psm3, recrop à dégradation single-pass honnête, requirements.txt complété. Contrat partagé étendu additivement (ocrPlatformSchema, types, classification.platform default). 67/67 pytest ; api 511/511.
- COMMIT 2 54cd294 — couche décision NestJS : ocr.logic pure (deriveRecognitionIssues 12 codes, computeQualityScore poids documentés 0.4/0.25/0.2/0.15, buildRecognitionTimeline omis-si-pas-de-preuve, tradeDuplicateEvidence ENTRY_PRICE décimal exact / ENTRY_TIME ±48h), règle close≥open, findTradeDuplicateCandidates (repo Trades), detectTradeDuplicate advisory persisté au processing, DTO dérive issues/qualité/timeline À LA LECTURE (§33 confirmées jamais mutées), confirmations bloquées sans acquittement explicite (409 OCR_DUPLICATE_UNACKNOWLEDGED / OCR_TRADE_DUPLICATE_UNACKNOWLEDGED §58). 24 unit + 3 e2e ; api 538/538.
- COMMIT 3 c7cc521 — SETS multi-screenshots (§1/§2/§18) : Prisma OcrSet/OcrSetItem (migration 20261007031808), fusion.logic PURE (accord boosté plafonné 0.99, conflits conservés avec les deux valeurs + provenance, single-source sans boost, coherent = corrélation symbole+direction §14), OcrSetService : membres via le pipeline complet d'OcrService (zéro réimplémentation), confirm fusionné par le MÊME pont Trading Core avec ref idempotente ocr:set:<id>, suppression du set garde les membres (§15), IDOR 404. Corrigé au passage : POST confirm sans body → 400/OK jamais 500 (§76), @Injectable manquant sur le repo set. 9 unit fusion + 6 e2e sets ; api 553/553.
- COMMIT 4 81746de — ops (§28/§30/§32/§39/§62) : reprocess (reconnaissance FRAÎCHE depuis l'asset, clé idempotente par révision, asset purgé → 409, original jamais muté, OCR_REPROCESSED), collections (migration 20261007031836, noms uniques par owner, adhésion idempotente, suppression sans toucher aux reconnaissances), analytics + correctionRate (null si pas de base) + distributions plateforme/type via jsonb SQL, filtres d'historique serveur (chemins jsonb). 5 e2e ; api 558/558.
- COMMIT 5 aa18738 — frontend (Le Registre intact) : overlay des sourceRegion avec mapping letterbox + surbrillance bidirectionnelle champ↔région (§10/§55), bloc qualité à composants expliqués (§15), panneau d'issues avec explication par code cliquable (§16), timeline (§23), bannières doublon à 3 affordances + tampons d'evidence (§58), DIALOGUE de confirmation en 3 actions avec lignes USER_CORRECTED (§59/§60), SetWorkspace (pick 2..6 → draft fusionné → résolution de conflits → confirm), historique Load more via useInfiniteQuery (zéro effet cascade — règle react-hooks maison), filtres corrected/flagged, reprocess par ligne, indicateur de stockage VIVANT (mort avant), carte analytics complète (§30). MSW miroir de toutes les routes + dérivations V2 à la lecture + régions non-nulles. tsc 0, eslint 0 erreur, build vert, sonde recognition 24/24 (adaptée au dialogue §60), sonde rebrand 17/17.
- VÉRIFICATION RÉELLE : sidecar pytest 67/67 ; api vitest 558/558 ; scripts/ocr-engine-quality-verify.py sur Tesseract 5.5.0 réel → ALL CHECKS PASSED 16/16 (checksum désormais vérifié + label corrigé dans le script) ; rapport complet docs/backend/OCR-V2-REPORT.md.
- PIÈGES : (1) probe e2e sans payload POST → 500 via pipe Zod passthrough — durci côté routes confirm ; (2) OcrSetRepository sans @Injectable → $transaction undefined ; (3) le serveur next meurt entre appels bash (setsid reaped) — start + sonde dans LE MÊME appel ; (4) useInfiniteQuery imposé par la règle react-hooks/set-state-in-effect (pas d'effet de synchronisation) ; (5) pickCoherentNonces doit sauter les buckets 0/1 du moteur déterministe.

Stage Summary:
- OCR V2 LIVRÉ DE BOUT EN BOUT : 40 features auditées, les trous implémentés, l'existant réutilisé (§8 — jamais de doublon), zéro ML/LLM, human-in-the-loop renforcé (acquittements serveur, dialogue de confirmation), design « Le Registre » intact (sondes + détection).
- 5 commits : fbb70b0 (sidecar v3) → 54cd294 (couche décision) → c7cc521 (sets/fusion) → 81746de (ops) → aa18738 (frontend) + docs/backend/OCR-V2-REPORT.md.
- Vérifications : sidecar 67/67, api 558/558, web tsc/eslint/build verts, sondes 24/24 + 17/17, real-stack 16/16 ALL CHECKS PASSED.
- Limites honnêtes documentées (rapport §8) : templates de layout uniquement MT5 (les autres plateformes sont détectées mais GENERIC), pas de proposition cross-set de « possible group », idempotence du reprocess par révision, pas de page collections dans Analytics.

---
Task ID: ocr-v11-frontend-console-redesign
Agent: Super Z (main)
Date: 2026-10-07 14:20 UTC

Task: « d'abord je veux que l'on retravaille notre frontend… professionnel, premium… ensuite qu'il soit aussi capable de detecter, travailler, analyser les Account et les Chart analysis » — finir le frontend Account/Chart V1.1 interrompu, puis redesign premium complet du module OCR.

Work Log:
- REPRISE GIT : les 833 lignes non commités de la session précédente = le frontend Account/Chart V1.1 complet (profile cards sélectionnables, AccountSnapshotView KPI+ledger, ChartReadingView quote+indicateurs, mode stamps history, mocks déterministes). Fix des props orphelines de recognition-history (reprocess → bouton RotateCcw desktop+mobile, load-more → rangées dédiées, clés dict `reprocess.action`/`history2.loadMore`), commit `d3565ae`.
- AUDIT : plus aucun « coming soon » dans le module OCR (les hits restants = placeholder générique des autres modules). Sonde verify-recognition.js : 14 étapes dont Account (11) et Chart (12).
- BASELINE : capture-recognition.js écrit (login → overview/history/configure/result trade/account/chart, PREFIX=env). Reconstruit .next (l'ancien build servait des chunks 500) ; kills par PID avant build ; server+probe dans le même appel bash.
- REDESIGN « CONSOLE » (commit `78951f5`) : header de page avec bloc méta réglé à droite (Recognition modes / Pipeline stages / Duplicate guard — vérités produit statiques) ; primitives CSS `.scan-frame` + `.scan-corner-*` (coins viseur accent) + `.meter` (barre d'usage) dans globals.css ; dropzone viewfinder avec chips formats PNG/JPG/WEBP/PDF + « 6 MB max » ; HeroModes numérotés 01/02/03 ; StepShell 01→02→03 ; progression : étapes numérotées + meter honnête (pas de tweening) ; StorageIndicator avec meter ; imports récents avec stamp de mode accent ; profile cards premium (index mono + icône en carré réglé) ; rule-double sous les titres Account/Chart ; clés dict `overview.meta.*` + `uploader.formatsLabel/maxSizeLabel`.
- BUG SONDE RÉSOLU (pas un bug produit) : l'étape 12 (chart) confirmait le MÊME PNG vierge que l'étape 11 (account) → le garde-fou pHash rejetait à juste titre la confirmation (« A near-duplicate of this screenshot was already imported »), le dialog restait ouvert avec le toast d'erreur — comportement backend+frontend CORRECT. Fix : paramètre `tint` dans makeScreenshotPng (chart = +24), sync capture-recognition.js.
- VÉRIFICATION : sonde complète **35/35 passed, 0 failed, pageerrors=0** (login, overview, history, upload→confirm, failure, cancel, Account confirm, Chart confirm, captures tablette/mobile, intégrité console) ; tsc 0 erreur ; eslint 0 erreur (4 warnings `_locale` préexistants hors module).

Stage Summary:
- Les deux consignes du user sont LIVRÉES : (1) redesign professionnel/premium du module OCR — « The Console », dans la discipline Le Registre (hairlines, zéro hex hors tokens, un seul accent) ; (2) Account/position + Chart analysis pleinement reconnus, éditables, confirmables — plus aucun « coming soon ».
- Commits : `d3565ae` (frontend V1.1 account/chart), `78951f5` (console redesign + probe fix).
- Artifacts : scripts/capture-recognition.js (baseline avant/après), scripts/shots/redesign-{before,after}-*.png (12 captures).
- Suite : les 13 features des phases précédentes sont déjà commitées (git log : preprocessing/dual-pass/templates/multi-trade/pHash v9da499f, contract 5de638b, service f34da20, ops 928182f, frontend 098be19, sidecar fbb70b0, decision 54cd294, multi-shot c7cc521, ops slice 81746de, frontend v2 aa18738). Reste à vérifier la couverture PDF multi-pages et clôturer l'inventaire 12 points.

---
Task ID: tools-section-v1
Agent: Super Z (main)
Date: 2026-10-07 16:10 UTC

Task: « D'abord fait un audit juste du module OCR, verifie si tout fonctionne bien, si le backend de ce module est complet et si son frontend consomme bien le backend (NestJs et FastAPI). Ensuite tu vas faire un commit pour save cela, et ensuite On va creer et implementer une nouvelle section qui doit s'appeller TOOLS dans la quelle il y aura deux module : Lot size et Compounding » (la section s'appelle TOOLS, pas FEATURES).

Work Log:
- AUDIT OCR COMPLET (agent Explore very thorough + runtime) : backend NestJS 22 routes validées (Zod partagé, owner-scoped, SSE, retention, analytics, sets/collections), pont moteur port/adapter avec validation stricte de la réponse sidecar ; FastAPI 3 profils implémentés (trade/account/chart), preprocessing complet, PDF multi-pages, dHash ; frontend 22/22 hooks ↔ endpoints (parité parfaite), AccountSnapshotView/ChartReadingView montées, « coming soon » absent du module. Rapport : docs/backend/OCR-AUDIT-REPORT.md, commit `9b28050`.
- RUNTIME : sidecar pytest 79/79 · API vitest FULL 572/572 · web tsc 0 / eslint 0 erreur (4 warnings `_locale` préexistants).
- DÉFAUT PRÉEXISTANT CORRIGÉ au passage : test/unit/ocr-trade-import.spec.ts — Record<OcrFieldKey,…> non mis à jour après l'union V1.1 (24 clés account/chart) → Partial Record (commit `0c05d80`).
- LAYER CALCUL PARTAGÉ : packages/shared/src/utils/compounding.ts (calculateCompounding — A = P×(1+r)ⁿ par période, boucle full-precision, émission toDecimalString 8dp, garde overflow 1e15, taux négatifs [−100, +10 000] pour what-ifs, cap périodes réutilisé du contrat calculators — pas de double export barrel). 8 tests unitaires (apps/api/test/unit/shared-compounding.spec.ts, import relatif source — l'API ne dépend pas du workspace package).
- NAVIGATION : section TOOLS entre Academy et System (hrefs /tools/lot-size, /tools/compounding, icônes Scale/TrendingUp), /tools → redirect lot-size ; libellés nav dérivés automatiquement (nav.items/nav.sections par href/titre). Dict i18n : nouveau namespace `tools` (dictionaries/en/tools.ts) — libellés, validations (codes stables), disclaimers, copy.
- MODÈLE : components/calculators/calculator-model.ts — schemas Zod champs texte → codes d'erreur stables (dict rend la copie), validateLotSizeForm (règles directionnelles stop/entry, risk ≤ 100 %), calculateLotSize (sizing broker-step §16 : raw → floor(step) → realized ≤ budget, statut explicite BELOW_STEP — aucun clamp silencieux), validateCompoundingForm (bornes + mapping overflow).
- LOT SIZE : selects instrument (6 presets specs explicites éditables, miroir du catalogue mock) + devise (9 devises), segmented Long·Buy/Short·Sell, presets risque 0.25–2 %, advanced params (pip/contract/volume step + avertissement broker), R:R via computeRR partagé (négatif signalé), hero résultat + stamp WITHIN LIMITS/BELOW STEP, stat band 4 KPI, breakdown ledger avec rule-double + ligne équivalence micro/mini/standard, Copy result. Bouton Calculate (flux DoD) puis live.
- COMPOUNDING : calcul LIVE à chaque frappe (§19), stat band 2×2 héros (Initial/Final/Total Profit/Total Gain, +signe, tokens profit/loss + icônes), graphique EChart sur chart-paper (tooltip mono, axe compact devise, rebuild thème), table results sticky-header 5 colonnes (Period/Starting/Ending/Total Profit/Total Gain — Total Gain cumulé vs balance ORIGINALE), cartes mobiles par période (§31), presets balance/gain, How it works 3 lignes, Copy summary, disclaimer « projection mathématique — pas une promesse de performance ».
- DESIGN : headers console (kicker + bloc méta réglé), ledger-label/rule-double/stat-strip/chart-paper — discipline Le Registre respectée, zéro hex hors tokens, dark/light OK.
- BUG SONDE → FIX : stat band compounding squeezed (section sans col-span + 18/12 colonnes) → lg:col-span-7 + 4 stat-hero 2×2 (+ !border-l-0 sur la cellule ouvrant la rangée 2). Commit `903362c`.
- VÉRIFICATION : sonde apps/web/scripts/verify-tools.js **38/38 passed, 0 pageerrors** (login, section TOOLS sidebar, redirect /tools, vecteur spec 10 000/1 %/XAUUSD 2650→2640 → 0.10 lots $100 R:R 1:2.35, erreurs same-price/short-side/risk-range, advanced disclosure, vecteur compounding 1000/20×5 % → $2,653.30 +165.33 %, live 10 % → $6,727.50, taux négatif, erreur périodes, mobile 390 px (20 cartes), light theme, nav sidebar) · tsc 0 / eslint 0 erreur · API 580/580 · build OK (3 routes /tools/*).

Stage Summary:
- Section TOOLS livrée (2 calculateurs frontend-only V1, zéro backend/Prisma/FastAPI/exécution — math déterministe pure côté client via couches partagées existantes).
- Commits : `9b28050` (audit OCR), `0c05d80` (layer calcul + fix spec préexistant), `808008c` (implémentation TOOLS complète), `903362c` (fix stat band + sonde 38/38).
- Artifacts : docs/backend/OCR-AUDIT-REPORT.md · scripts/verify-tools.js · scripts/shots/tools-{lotsize,compounding}-{desktop,mobile,light}.png (6 captures).
- Restes connus (documentés, non bloquants) : UI collections OCR sans surface (hooks+mocks prêts), code mort listé §5 du rapport d'audit.

---
Task ID: ocr-collections-ui-and-cleanup
Agent: Super Z (main)
Date: 2026-10-08 01:20 UTC

Task: « continu » — poursuivre après la livraison TOOLS : fermer les écarts documentés par l'audit OCR §5 (surface UI collections absente — 5 hooks + namespace dict inutilisés — et code mort listé §5.2/§5.3).

Work Log:
- ÉTAT DÉPART : tree propre (413f085), TOOLS livré (38/38), audit OCR §5 documentait 3 écarts actionnables + 3 choix documentés.
- COMMIT 1 `7b9eaac` — COLLECTIONS UI (V2 §28) : nouveau `components/recognition/recognition-collections.tsx` — CollectionsProvider possède les 5 hooks useOcrCollection* (list/create/add/remove/delete) + toasts + dialogs ; CollectionsPanel dans l'onglet Historique (rangées réglées nom · N screenshots · créé, expansibles vers les membres avec open/remove, dialog création depuis l'en-tête, suppression avec confirmation focalisée — les reconnaissances sont TOUJOURS conservées, contrat §28) ; AddToCollectionButton dans chaque rangée d'historique (desktop ledger + cartes mobiles) : toggle d'appartenance avec check marks, « New collection… » ouvre le dialog pré-ciblé (create & add). Résolution des détails membres : d'abord les pages d'historique déjà chargées (Map), fallback single-GET via useOcrRecognition (enabled: false quand connue — pas de fan-out). dict.collections étendu (created/deleted/deleteTitle/deleteBody/membersTitle/remove/menuEmpty). Le membre affiché par la sonde : « CHART · Auto detect · 77% · this minute · CONFIRMED ».
- SONDE : verify-recognition.js +13 checks (création panneau → état 0 → ajout par menu → expansion + membre → retrait → create & add 2e collection → membre pré-rempli → suppression avec confirm → historique intact ≥5 rangées) → **48/48 passed, 0 pageerrors**.
- COMMIT 2 `cc3a8ad` — CLEANUP §5.2/§5.3 : suppression useOcrRecognitions (non-infinite) + fetchOcrHistoryPage (+ import OcrRecognitionStatus orphelin) ; NavItem.comingSoon retiré du type + des 16 entrées (le commentaire de `description` mis à jour) ; PagePlaceholder supprimé (unique consommateur) + dossier shared/ vidé ; clés dict viewSource/viewSourceSoon supprimées (remplacées par l'overlay source-region + crop tool) ; SUPPORTED_PROFILES retiré du config.py sidecar.
- VÉRIFICATIONS : web tsc 0 / eslint 0 erreur (4 warnings `_locale` préexistants) · build OK (30 routes statiques) · sonde recognition 48/48 · sonde rebrand 17/17 · sidecar pytest 79/79 (après edit config.py) · API non touchée (dernier run complet 580/580 reste valable).
- RAPPORT : docs/backend/OCR-AUDIT-REPORT.md §5 réécrit en « CLOSURE STATUS » (3 écarts marqués ✅ CLOSED avec preuves) + §6 conclusion mise à jour ; restent documentés comme choix (docker-compose sans ocr-service, pas de test runner web, limites produit §8 V2).

Stage Summary:
- Les 3 écarts actionnables de l'audit OCR sont FERMÉS : la feature collections a maintenant sa surface UI complète (panneau Historique + menu par rangée, fidèle au contrat §28 — jamais destructrice), le code mort listé est supprimé.
- 2 commits : `7b9eaac` (collections UI + sonde 48/48) → `cc3a8ad` (cleanup + rapport audit mis à jour).
- Discipline Le Registre intacte : tokens uniquement, rangées réglées, stamps, confirmation focalisée ; le pipeline human-in-the-loop n'est pas touché (collections purement référentielles).
- Restes connus : uniquement les 3 items documentés comme choix de workflow dans §5 (docker-compose, test runner web, limites produit V2).

---
Task ID: ocr-collections-result-filter-and-full-audit
Agent: Super Z (main)
Date: 2026-10-08 02:30 UTC

Task: « ajouter l'affichage des collections d'un screenshot dans la vue résultat, intégrer un filtre "par collection" dans l'historique, Ensuite fait moi un commit de ce que l'on a deja fait afin de rien perdre et un audit complet du module OCR et du module Lot size/compounding. Enfin des que tu fini fais moi signe »

Work Log:
- COMMIT `feat(ocr)` — DEUX SURFACES + UN FIX : (1) RecognitionCollectionsRow dans la vue résultat — chips folder des collections contenant le screenshot (masquée si aucune) + menu d'appartenance à portée ; (2) filtre « All collections / <nom> » dans la rangée de filtres de l'historique (membres sur les pages chargées, options à check marks + comptes) ; (3) refactor du module collections en 3 composants autonomes sur le même cache React Query (plus de contexte) ; (4) FIX RÉEL : ouvrir un enregistrement depuis l'historique (ou les imports récents) héritait du step « success » périmé d'une confirmation précédente → onOpen reset stepRaw → les jobs CONFIRMED montrent leur enregistrement read-only (découvert par la sonde, étape result-chips en timeout). dict += allCollections. Sonde +4 checks → **51/51, 0 pageerror** · rebrand 17/17.
- AUDIT TOOLS (agent Explore + exécution réelle des vecteurs) : 8/9 PASS — frontend-only prouvé (zéro apiRequest/useQuery/fetch/lib.api dans tools/*), vecteur lot-size exécuté (10 000 $/1 %/XAUUSD 2650/2640 → 100 $/0.10 lots, floor step, BELOW_STEP explicite), vecteur compounding exécuté (1 000 $/20×5 % → 2 653.29770514 → $2,653.30/+165.33 %, boucle par période, pas d'annualisée), validations dict-keyées, presets (BTCUSDT documenté vs BTCUSD du prompt), UI complète (live recompute, sticky header, cartes mobiles, ECharts partagé), navigation « Tools » + redirect, 8 tests unitaires. CORRECTION FACTUELLE : RR 1:2.35 ⇔ TP 2673.50 (l'UI et la sonde utilisent bien 2673.50 ; « TP 2660 → 2.35 » était incohérent).
- HOUSEKEEPING same-day : sonde tools — l'assert mobile tautologique (|| true) remplacée par un vrai contrôle d'overflow 390px (→ 0px) ; 4 clés dict mortes (rrUnit/2×stopPips/pipSize) + parseFormField + import orphelin supprimés. Dettes acceptées documentées (payloads clipboard EN, pas de test runner web, endpoints Phase-18 non consommés par le V1 frontend).
- AUDIT OCR re-vérifié : API vitest FULL **580/580 (51 fichiers)** · sidecar pytest **79/79** · tsc 0 · eslint 0 erreur (4 warnings préexistants) · build OK (30 routes) · sondes recognition **51/51** + rebrand **17/17** · rapports : docs/backend/TOOLS-AUDIT-REPORT.md (nouveau) + OCR-AUDIT-REPORT.md (§0/§4/§5 actualisés).
- PIÈGE : la sonde 28b échouait AVANT le fix onOpen — ce n'était pas un problème de sonde mais le bug produit du step périmé ; le fix est un vrai gain UX couvert par la sonde.

Stage Summary:
- La surface §28 est COMPLÈTE : panneau historique + menu par rangée + chips en vue résultat + filtre par collection — le tout non destructeur, même cache, même discipline Le Registre.
- Audit complet des deux modules : VERDICTS « COMPLETE AND SPEC-COMPLIANT » (OCR) et « COMPLETE AND SPEC-COMPLIANT (8/9 PASS, housekeeping fermé) » (TOOLS) avec preuves chiffrées dans les deux rapports.
- 2 commits de feature/audit + 1 commit worklog ; toutes les suites vertes au head.

---
Task ID: session-charts-indicators-drawings
Agent: Super Z (main)
Date: 2026-10-08 (IM continuation)

Task: « D'abord fait un commit pour save le travail precedent et ensuite je veux d'autres indicateurs (RSI, volumes en histogramme), les drawing tools » — dans la continuité de la demande charts « TradingView/MT5, toute la largeur ».

Work Log:
- ÉTAT DÉPART : tree PROPRE à `7839589` — le travail précédent était DÉJÀ committé (aucun commit vide créé ; le point de sécurité demandé est ce commit de feature + le worklog, règle verrouillée respectée). Contexte perdu confirmé : les commits Tasky/Events de la session résumée n'existent plus dans l'historique (restaure disque), le cockpit Session Live actuel reste la surface charts canonique.
- DIAGNOSTIC RACINE : le moteur existait déjà (computeIndicators réel — Wilder RSI/MACD/ATR/BB/VWAP + drawings HLINE/TREND/RAY/RECT/TEXT/MEASURE/FIB) MAIS le template par défaut était VIDE (`seeded.indicators ?? []`) → un chart nu sans RSI ni volume à la première visite, outils enterrés dans un rail latéral de 230px, chart coincé entre deux colonnes.
- TEMPLATE PAR DÉFAUT : `defaultIndicatorTemplate()` dans lib/utils/chart-state.ts — [VOLUME, RSI(14)] ids déterministes "tpl-*", INDICATOR_DEFAULTS appliqués ; l'état persisté par symbole gagne toujours dès la première édition. Panneaux visibles d'office : histogramme de volume coloré par direction + sous-pane RSI avec guides 30/70.
- RESTRUCTURE FULL-WIDTH (session-live-view.tsx) : la grille 3-colonnes [230px | 1fr | 320px] est remplacée par — (1) barre d'outils pleine largeur AU-DESSUS du chart (timeframe chips · IndicatorsPopover · DrawingToolbar · ChartGridToolbar bare (layout 1/2/4 + syncs) · SessionTimer compact horizontal à droite), (2) chart (master + observation panes) sur TOUTE la remaining width (hauteurs h-[420/520/640] en layout 1), (3) grille de panneaux contexte responsive dessous (md:2 / xl:3 : MarketContext, KeyLevels, Broker, PrivatePositionsStream, SymbolPositions). ContextTabs inchangé. Skeleton aligné sur la nouvelle structure.
- ADAPTATIONS : popovers side="bottom" + boutons auto-width (chart-tool-rail.tsx) ; ChartGridToolbar prop `bare` (sans bordure, hint readonly masqué) ; SessionTimer réorganisé en rangée horizontale (testids conservés) ; dict : +view.chartToolbarAria, +view.contextGridAria, −view.tools, −view.leftRailAria, −view.rightRailAria.
- SONDE NOUVELLE : scripts/verify-session-charts.js — **20/20 passed, 0 pageerror** : rails supprimés, toolbar + context grid présents, chart width == market-row width (drift 0px = pleine largeur prouvée), template par défaut 2 indicateurs, chip légende "RSI 14", popover liste Volume+RSI, add EMA→3/remove→2, flux dessin complet (arm HLINE → hint → clic chart → drawing-list 1), layout 2 → 2 charts dont aux hérite du template, mobile 390px (0 overflow, toolbar wrap, chart ≈ full viewport), light theme intact. Captures : session-charts-{desktop,mobile,light}.png.
- INFRA : market-service :3003 était éteint (candles/socket 500 → chart en erreur) — `bun install` + relance, feed opérationnel ; le flow 401 /api/auth/* pré-login est le comportement attendu (filtré comme bruit dans la sonde).
- VÉRIFICATIONS : web tsc 0 / eslint 0 erreur (4 warnings `_locale` préexistants) · build OK (compilation 6.6s, routes statiques) · régressions : verify-recognition **51/51**, verify-tools **38/38** (1er run instable au cold-compile, rerun vert), verify-rebrand **17/17**.
- PIÈGE OUTIL : le gateway IM réécrit le littéral `a[href=` en `aref=` dans TOUTES les écritures de fichiers (cause du « typo » historique des sondes) — contourné par goto direct /session dans la nouvelle sonde.

Stage Summary:
- Le cockpit Session Live est passé à l'expérience TradingView : chart PLEINE LARGEUR (plus de rails latéraux), RSI(14) + histogramme de volume visibles dès la première visite, drawing tools et multi-chart dans une barre d'outils au-dessus du chart, panneaux de contexte en grille dessous.
- 1 commit de feature + 1 commit worklog ; toutes les suites vertes (20/20 · 51/51 · 38/38 · 17/17), tsc/eslint/build OK.
- Restes connus : session-view.tsx + price-chart.tsx (ancienne station non montée) toujours présents — code mort documenté, nettoyage à l'audit suivant.

---
Task ID: post-restart-recovery
Agent: Super Z (main)
Date: 2026-10-08 (IM — « la preview ne reflète pas notre travail d'hier »)

Task: Restaurer la preview après le restart de la sandbox — l'utilisateur voyait une app ne reflétant pas la livraison charts committée (19451c6 + 7768de8, tree propre vérifié).

Work Log:
- ÉTAT DÉPART : git log confirme les 3 commits cités intacts (7839589 / 19451c6 / 7768de8 = HEAD), tree propre → le CODE n'a jamais été perdu ; problème purement runtime.
- DIAGNOSTIC LONG : la sonde verify-session-charts passait 9/20 puis timeout sur add-EMA ; bissect 7/7 kinds → tout ajout d'indicateur « tue le chart ». Pistes éliminées une à une : corruption fichiers (FAUSSE ALERTE — le canal d'affichage des outils avale les séquences `[h`/`[m`/`me`, preuve par char-codes 0x5b ; tsc --noEmit --incremental false EXIT=0), root-unmount React (CDP Runtime.exceptionThrown : zéro exception ; DebugErrorBoundary : n'attrape rien ; fibres intactes), suspension (aucun useSuspenseQuery/lazy/loading.tsx), bougies vides (crash persiste avec données mock injectées via route interception).
- VERDICT : MutationObserver sur <main> → 0 removal + innerHTML 93k caractères INTACT au moment du « crash » → le composant AnalysisChart se SUBSTITUE lui-même par sa carte d'erreur (`if (isError)` sans data-testid=analysis-chart) quand la query useCandles (proxy :3003, retry: 2) passe en erreur — le service marchand :3003 (bun, mini-services/market-service) était MORT après le restart (ECONNREFUSED + node_modules effacés). Hier le même service avait dû être relancé (déjà documenté) — le restart de sandbox ne persiste ni les processus ni node_modules non-trackés.
- FIX : `bun install` + relance market-service → :3003 LISTEN. 
- VÉRIFICATIONS POST-FIX : verify-session-charts **20/20** (template VOLUME+RSI, EMA add/remove, HLINE drawing, layout 2, mobile 390, light, zéro pageerror/HTTP≥400) · verify-recognition **51/51** (module OCR en mock mode sans sidecar : OK). Dev server :3100 de debug tué, fichiers de debug supprimés, page.tsx restauré.
- LEÇON INFRA : chaque restart de sandbox exige — (1) relancer mini-services/market-service (`cd mini-services/market-service && bun install && bun index.ts`), (2) `next build/start` est géré par le supervisor (BUILD_ID 12:53). Le service OCR sidecar (:3004) exige OCR_SERVICE_TOKEN partagé avec l'API Nest : non requis pour la preview (web en mock MSW), à remonter si un jour l'API réelle est branchée.

Stage Summary:
- Le travail d'hier était INTACT (code committé + build servi) ; seule l'infra runtime manquait. La preview :3000 sert désormais l'expérience charts complète : 20/20 · 51/51 vertes.
- Artifacts : captures session-charts-* et recognition-* régénérées sur l'état fonctionnel (commit de rafraîchissement).
- Ne pas rejouer ce diagnostic : si la preview semble « ne rien montrer » après un restart sandbox, TESTER D'ABORD `curl localhost:3000/candles?XTransformPort=3003&symbol=BOOM500&interval=5m&limit=5` (AUTH_REQUIRED attendu = service vivant ; ECONNREFUSED/500 = relancer le market-service).

---
Task ID: preview-verification-aid
Agent: Super Z (main)
Date: 2026-10-08 (IM — « rien n'a changé »)

Task: L'utilisateur rapporte que la preview ne change toujours pas malgré le fix market-service.

Work Log:
- ÉTAT SERVEUR RE-VÉRIFIÉ : :3000 (next start prod) + :3003 (market-service) up, /candles → 401 AUTH_REQUIRED (service vivant), gateway :81 (Caddy) sert le HTML de l'app actuelle, sondes 20/20. Le serveur est certain de servir le travail d'hier → le décalage est côté lien navigateur (ancien bot-id) ou cache client persistant.
- BOOT HOOK LUS (/start.sh + .zscripts/dev.sh) : l'archive repo.tar ne contient PAS les node_modules des mini-services → au boot, market-service crashait sur socket.io manquant (cosmoz-market.log) — cause racine de l'incident, désormais corrigée dans dev.sh (bun install avant start, idempotent).
- BUILD STAMP : src/components/layout/build-stamp.tsx — chip fixe discret bas-gauche `build <hash> · <heure> UTC` (server component, git lu au build, testid=build-stamp) → l'utilisateur peut vérifier EN UN COUP D'ŒIL quel build son navigateur affiche. Rebuild prod (NEXT_PUBLIC_API_MOCKED=true) + restart :3000 (pid 5257). Stamp servi : « build a7e827f · 14:02 UTC ».
- VÉRIFICATIONS : tsc 0 erreur, build OK, verify-session-charts 20/20 après redémarrage.

Stage Summary:
- Commit b6b2ba6 (stamp + dev.sh). Le réflexe de dépannage devient : voir le stamp = bon build ; pas de stamp = vieux lien/cache → vider les données du site ou rouvrir le lien courant du chat.

---
Task ID: tasky-events-delivery-audit-and-events-probe
Agent: Super Z (main)
Date: 2026-10-09 (IM — « continu » après compression de contexte)

Task: Reprendre après la compression du contexte : auditer l'état réel des commits non journalisés (66ebb19 / 634232b / 285738f), vérifier la conformité aux exigences Tasky/Events, combler les trous de vérification, et avancer la liste « nouvelle base » de l'utilisateur.

Work Log:
- ÉTAT DÉPART : tree propre, HEAD 285738f (message UUID, cosmétique). La session précédente avait DÉJÀ livré et committé, sans journaliser : (1) 66ebb19 renames Recognition/Lot/Interest + typographie unifiée des 3 modules (headers standard h1 font-heading), (2) 634232b collapse déplacé de la sidebar vers une icône header (PanelLeft, lg+, aria, persistance 240<->72px intacte, verify-shell 10/10), (3) 285738f Tasky + Events complets + section ACADEMY 4 entrées (/academy /nofy /events /tasky) + verify-tasky.js.
- CONFORMITÉ EXIGENCES VÉRIFIÉE DANS LE CODE : Tasky — titre « Tasky Board » + sous-titre court, colonnes gauche→droite dans un board overflow-x-auto, grip drag curseur ET doigt (Pointer Events unifiés, touch-action none), add-list à droite ; Events — groupes My Calendars/Favorites/Other comme filtres (checkbox + collapse), menu tri time/title/calendar, modal New Calendar (nom + 9 couleurs + groupe), New event, carte détails (star/rename/delete), drag inter-jours curseur ET doigt, mini-mois, panneau repliable, persistance localStorage 100%.
- RUNTIME : :3000 up (next start prod, build 285738f), market-service :3003 vivant (AUTH_REQUIRED attendu), /tasky + /events 200. verify-tasky 33/33.
- SONDE EVENTS CRÉÉE (verify-events.js, 48 checks) : couvre structure, filtres par groupe (décocher « work » masque ses pills, collapse/expand Favorites), tri (time → e7,e8 ; calendar → e8,e7 ; title → e8,e7 + label bouton), modal New Calendar (create désactivé si nom vide, routage groupe Other), New event (désactivé si titre vide, pill sur le jour du dropdown date), détails (star → Starred + glyphe, rename persistant, delete), drag souris e1 Oct1→Oct2 avec ghost visible, drag touch (pointerType touch, pointerId dédié) e2 Oct2→Oct3, toggle panneau, persistance reload, mobile 390px, light, zéro pageerror.
- BUG RÉEL TROUVÉ + FIXÉ PAR LA SONDE : overflow horizontal de 524px à 390px — le cluster droit de la toolbar (ml-auto flex) ne rétrécissait pas : chips 652px + sort + nav mois = 826px > viewport. Fix : min-w-0 + flex-wrap + justify-end sur le cluster, min-w-0 sur les chips → elles passent sous le label du mois et scrollent (overflow mesuré 0px). Diag par script jetable (éléments dépassant le viewport), supprimé après usage.
- 2 ASSERTIONS DE SONDE CORRIGÉES PENDANT L'AUTORING : e9 (Mom's Birthday) est sur le calendrier « family » invisible par défaut → check sur e7 ; le tri par titre met « Dentist » AVANT « Design Review » (ordre alphabétique réel) — l'assertion initiale inversait l'attendu.
- LINT : react-hooks/set-state-in-effect (préexistant aux 2 vues, commit 285738f) — la règle ne permet pas d'exprimer le chargement local one-shot post-hydratation (le pattern effect est la voie hydration-safe standard ici) ; eslint-disable ciblé + justification dans tasky-view et events-view. tsc 0, eslint 0 erreur.
- INFRA LEÇON (nouvelle, à ne PAS re-diagnostiquer) : dans CETTE session IM, tout processus spawné depuis un appel d'outil est purgé à la frontière d'appel suivante (testé : next start via node ET bun, sleep, http.server — tous tués ; ceux des sessions précédentes survivent). Conséquences : (1) toute vérification sonde doit se faire DANS LE MÊME appel que le démarrage du serveur ; (2) la preview :3000 revient au prochain boot plateforme via dev.sh (BUILD_ID présent → pas de rebuild) ; (3) le piège shell : `cd X && cmd &` attache le cd au job de fond — le shell principal ne change pas de cwd (MODULE_NOT_FOUND sur les sondes).
- VÉRIFICATION FINALE (un seul appel : build → start → 5 sondes) : events **48/48** · tasky **33/33** · shell **10/10** · tools **37/37** · rebrand **17/17**, zéro pageerror partout · tsc 0 · eslint 0 · build OK.
- COMMITS : `880a5d1` fix(events) mobile wrap + sonde 48/48 + captures events/tasky (+ ce commit worklog).

Stage Summary:
- La « nouvelle base » est presque complète : typographie unifiée ✅ renames ✅ collapse header ✅ ACADEMY 4 entrées ✅ Tasky (titre, horizontal, scroller, touch) ✅ Events (filtres, tri, New Calendar, touch, extras) ✅ — tout vérifié par sondes dédiées, 5 suites vertes au head 880a5d1.
- Restant : la page Profile « à l'identique » — les images fournies en IM ont été perdues par la compression de contexte (aucune trace disque) ; redemander les captures à l'utilisateur.
- Reflet preview : au prochain restart plateforme, le serveur repartira directement sur le build 880a5d1 (stamp visible en bas à gauche).

---
Task ID: profile-replica-reference
Agent: Super Z (main)
Date: 2026-10-09 (IM — images Profile 01→04 re-fournies)

Task: « Voici les images de profile » — répliquer à l'identique les 4 captures (en-tête identité + onglets Personal/Account/Security/Notifications), dernier item de la liste « nouvelle base ».

Work Log:
- SPÉC EXTRAITE DES 4 CAPTURES : (01) header avatar rond + badge caméra, nom + pill « Pro Member », sous-titre métier, meta email/localisation/« Joined March 2023 », bouton Edit Profile ; barre 4 onglets segmentée à pill active bordée. (02) Account : rangées séparées par hairlines — statut (badge vert Active), plan (Manage Subscription), visibilité (switch), export ; carte Danger Zone rouge avec Delete Account. (03) Security : Password (Change Password, icône clé), 2FA (badge Enabled + Configure), Login Notifications (switch), Active Sessions (View Sessions, icône bouclier). (04) Notifications : 5 switches — email ON, push OFF, marketing ON, weekly ON, security alerts verrouillé ON (« always enabled »).
- CARTOGRAPHIE DONNÉES (réel d'abord, local pour le reste) : name/email/bio + avatar → PATCH /me existant (name splitté First/Last, rejoint au save, header synchronisé) ; extras de la référence (téléphone/métier/société/localisation/joinedAt seed « 2023-03-01 ») → document local cosmoz.profile.extras.v1 ; toggles préférences → cosmoz.profile.prefs.v1 ; Security tab → VRAIES données : useSecurityOverview (passwordLastChangedAt relatif « Last changed 34 days ago », état 2FA, sessions live + useRevokeSessions) ; Change Password et Configure → routage vers /security (le flow reauthToken complet y vit déjà) ; Export Data → téléchargement JSON réel (profil + extras + préférences) ; Delete Account → dialog focalisé avec saisie « DELETE » obligatoire (demo : requête simulée).
- L'ANCIENNE PAGE (hero + stats + achievements + formulaire identity + appearance) est REMPLACÉE — la référence n'a pas ces sections ; le h1 module header standard est conservé (cohérence typographie demandée précédemment) ; le theme picker reste accessible via l'icône topbar + /settings.
- SONDE verify-profile.js (59 checks, seed-agnostique — le nom/email sont dérivés du rendu et non codés en dur) : header complet, 4 onglets, formulaire pré-rempli + save désactivé si propre, flow PATCH (Probe → header sync → restore), focus Edit Profile sur first-name, Account (badge, switch + persistance, download réel attrapé via waitForEvent), danger (3 états de confirmation), Security (âge mot de passe réel, badge 2FA, dialog sessions avec 3 lignes réelles), Notifications (seeds exacts, persistance reload, security verrouillé), mobile 390px 0 overflow, light, 0 pageerror.
- PIÈGE RÉCURRENT : le seed mock utilisateur du store est « Dev Trader » (pas « Alex Moreau » de l'auth-engine) → sonde rendue agnostique du seed ; et `cd X && cmd &` attache le cd au job de fond (2e fois) — réflexe : `cd X;` en instruction séparée.
- VÉRIFICATIONS : tsc 0 · eslint 0 · build OK · profile **59/59** · régressions events 48/48, tasky 33/33, shell 10/10, tools 37/37, rebrand 17/17.
- COMMITS : `b2afbdc` feat(profile) + captures profile-{desktop,mobile,light}.png (+ ce commit worklog).

Stage Summary:
- La liste « nouvelle base » de l'utilisateur est COMPLÈTE : typographie ✅ renames ✅ Profile répliqué ✅ collapse header ✅ ACADEMY 4 entrées ✅ Tasky ✅ Events ✅ — 6 suites vertes au head (59/48/33/10/37/17).
- La preview servira ce build au prochain boot plateforme (stamp b2afbdc en bas à gauche).

---
Task ID: session-live-removal
Agent: Super Z (main)
Date: 2026-10-09 (IM — « on va repartir sur de nouvelle base »)

Task: Supprimer complètement le module Session Live (frontend) + commit, préalable à l'audit frontend avant la reconstruction du module « Oryon » (le prompt utilisateur emploie « Charty », NB explicite : le module doit se nommer Oryon).

Work Log:
- ÉTAT DÉPART : tree PROPRE à `8b4b0fe` (l'audit de récupération de la session précédente a établi qu'Oryon n'a jamais été committé ; la substance charts vivait dans Session Live).
- CARTOGRAPHIE : components/session autonome (0 import externe) ; accroches externes : navigation (entrée + section TRADING), topbar (SessionLiveBadge), dashboard open-positions-card (lien « Open the session runner »), mocks/nofy-engine (deep-link SYMBOL), i18n (en/session.ts + assemblage en.ts), lib/api (queries/sessionLive.ts, endpoints, keys), mocks (handlers/sessionLive.ts + bloc store 3776–4020 + hook createTrade + hook addSessionNote), settings trading-card (contrôles chart-preferences sans plus aucun consommateur), 12 sondes dédiées.
- SUPPRESSIONS (29 fichiers) : app/(app)/session, components/session (23 : analysis-chart, chart-grid, chart-tool-rail, session-live-view, session-replay, session-shell, session-view/price-chart morts documentés, context-tabs, market-context-panel, private-positions-stream, broker-panel, symbol-picker, session-timer/toolbar, logbook, mood-strip, ghosts, regret-registry, event-timeline, open-trade-card, price-alert-toaster, symbol-positions), session-live-badge, lib/utils/{chart-state,drawings,indicators}.ts, queries/sessionLive.ts, dictionaries/en/session.ts, handlers/sessionLive.ts + sondes (verify-session-charts, verify-session-live-rebuild, verify-sl-multichart, verify-sl-replay, probe-sl 1/2/4/5, root verify-session-upgrades, e2e-session-live.sh, verify-chart-prefs). PNG de captures conservés (artefacts historiques inertes).
- ÉDITS : navigation.ts (entrée retirée + TRADING = ["/trades","/journal","/playbook"]) · en.ts (import + clé session + commentaire namespaces) · topbar.tsx (badge + doc-comment) · open-positions-card.tsx (bouton + imports Link/Button) · nofy-engine.ts (SYMBOL href → /trades) · handlers/index.ts · queries/index.ts (export * sessionLive) · endpoints.ts + keys.ts (entrées sessionLive) · queries/session.ts (invalidation sessionLiveState dans useCreateSessionNote) · store.ts (bloc session-live 244 lignes, hookSessionTradeDetected dans createTrade, hook NOTE_ADDED dans addSessionNote, 21 imports types, 13 exports) · trading-card.tsx (3 contrôles chart + import ToggleRow) · settings-view.tsx (description « session runner » + keywords) · sondes verify-shell (goto /trades), verify-live-bridge, check-console, verify-academy (assert TRADING sans /session).
- CONSERVÉ (distinctions) : queries/session.ts + handlers/session.ts = module session JOURNAL (timeline/notes, consommé par trades/journal) — NE PAS confondre ; lib/realtime/market.ts (useCandles/useLiveQuotes/useFeedStatus/usePrivatePositions/unrealizedPnl — consommé par dashboard + monitoring) ; useBrokerSession (couche données réutilisable pour Oryon) ; BACKEND apps/api/src/modules/session-live INTACT (la mission interdit de toucher le backend pendant l'audit frontend) — orphelins documentés : API /session-live/* + deep-link nofy backend (nofy.service.ts:241 href "/session") à traiter en étape backend séparée.
- PIÈGE ÉVITÉ : le tsc initial rapportait une erreur `.next/types/validator.ts` sur la page supprimée — cache stale ; régénéré par le build (jamais supprimer .next à la main, il sert la preview next start).
- VÉRIFICATIONS : rg résidus sessionLive + "/session" dans src = 0 · tsc --noEmit 0 · eslint 0 erreur (1 warning ToggleRow introduit puis corrigé ; reste = préexistants) · next build OK (route /session disparue de la liste des routes).

Stage Summary:
- Le module Session Live frontend est complètement retiré ; commit `079a8e0` (+ ce commit worklog). La base est propre pour l'audit frontend Oryon (lecture seule, zéro modification, zéro commit pendant l'audit).
- Orphelins backend connus (décision séparée à demander) : modules/session-live API + deep-link nofy côté Nest.
- Couche données réutilisable pour Oryon confirmée : market.ts (candles/quotes/positions/feed) + schemas shared (market, sessionLive restants pour l'API, broker, trade).

---
Task ID: oryon-cahier-des-charges
Agent: Super Z (main)
Date: 2026-10-10 (IM — « On passe au cahier de charge »)

Task: Rédiger et livrer le cahier des charges fonctionnel et technique du module Oryon (document français), première phase de la reconstruction après le retrait Session Live de la veille.

Work Log:
- ÉTAT DÉPART : tree propre à `b9f52fa` ; Session Live déjà retiré (`079a8e0`). FAITS RE-VÉRIFIÉS SUR DISQUE avant rédaction : `lib/realtime/market.ts` (hooks + constantes : 300 bougies, refetch 60 s, polling 2 s, grâce 3,5 s, STALE 8 s, retries auth 3/30 s, télémétrie), `mini-services/market-service/index.ts` (REST /prices /candles /health, plafonds 500/1 000, diffusion 750 ms, providers Binance/Simulated, garde-fou prod), `useBrokerSession` (GET /broker/session, 15 s, lecture seule), `packages/shared/src/schemas/market.ts` (7 intervals, real|sim, Candle), `navigation.ts` (18 entrées, TRADING sans /session), `globals.css` (tokens 3 thèmes du Registre), `apps/web/package.json` (echarts ^6.1.0 — 7 usages grep confirmés : dashboard×2, analytics×3, trades×1, wrapper charts/ ; lightweight-charts ABSENT ; react-query 5, zod 3, msw 2, tailwind 4, next 16.3.5, react 19.2.8, pnpm).
- SKILL DOCX : chaîne lue intégralement (SKILL.md → create.md → common-rules.md → design-system.md recette R4 + GO-1 + helpers obligatoires → docx-js-core.md → scenes/report.md → toc.md) ; `postcheck.py` consulté pour trancher PageBreak-après-TDM vs règle anti-double-saut (décision : section TDM SANS PageBreak final, corps en NEXT_PAGE — check 3 du postcheck).
- GÉNÉRATEUR (scripts/oryon-cahier/, docx@9.9.0 installé) : helpers.cjs (palette GO-1, rendu blocs → docx ET markdown depuis une source unique ; backticks markdown retirés du docx, pipes échappés dans le md), content1-4.cjs (14 sections, 114 blocs, 9 tableaux), generate.cjs (recette R4 EXACTE : calcTitleLayout/splitTitleLines, wrapper 16838 exact, allNoBorders, UPPER_H dynamique, title « Module Oryon » 1 ligne 40 pt ; 3 sections : couverture marges 0 sans footer / TDM UPPER_ROMAN start 1 / corps DECIMAL start 1 ; numbering « list-verif » ; styles heading outlineLevel), patch_footers.py (instrText PAGE \* ROMAN / \* arabic par ordre des footerReference + purge pgNumType vide).
- PIPELINE : node generate.cjs → add_toc_placeholders.py --auto (exit 0 : 43 entrées, updateFields=true, outlineLvl, fldChar split) → patch_footers.py (footer1→ROMAN, footer2→arabic, 1 pgNumType purgé) → postcheck.py **9/9 ✅ 0 erreur 0 warning**.
- VÉRIFICATION VISUELLE : LibreOffice→PDF→PNG pages 1-4 : couverture R4 conforme (bloc sombre, libellé espacé accent, filet orange, méta blanche), TDM 2 pages peuplée (folios I/II, note de rafraîchissement italique), corps correct (titres H1 soulignés accent, gras inline, sans backticks, folio 1, en-tête discret). Artefact connu : 1re ligne TDM dupliquée dans les rendus SANS mise à jour des champs (LibreOffice) — updateFields=true fait régénérer la TDM proprement par Word à l'ouverture ; comportement documenté du skill, laissé en l'état.
- PIÈGE ÉVITÉ : auto-diagnostic erroné pendant la session (fausses alertes « contenu brouillon » sur content1.cjs et « 2029 ») — le relecture disque a prouvé deux fois que les fichiers étaient corrects ; leçon réaffirmée : ne jamais juger un fichier sans le relire depuis le disque.
- LIVRABLES : download/Oryon-Cahier-des-charges-v1.0.docx (43,3 Ko, ignoré par git — artefact de livraison) + docs/oryon/cahier-des-charges.md (source versionnée, commitée).
- CONTENU : 14 sections — résumé exécutif ; contexte (genèse Oryon/Session Live + retrait 079a8e0) ; périmètre avec contrainte cardinale LECTURE SEULE (3 niveaux) + tableau in/out ; 5 cas d'usage ; état des lieux vérifié (7 actifs réutilisables, retiré, lacunes V1 → exigences, leçons d'exploitation, orphelins backend) ; 10 exigences fonctionnelles MoSCoW rattachées aux jalons (dont RF-03 fusion tick→bougie à réimplémenter, RF-09 persistance Zod clé nouvelle, RF-10 replay en Could) ; 8 RNF vérifiables (dont RNF-06 revue lecture seule par diff, RNF-08 états d'erreur testidés — leçon AnalysisChart) ; architecture PROPOSÉE (Lightweight Charts recommandé vs ECharts conservé pour ses 7 usages, arborescence composants, hooks useTickMerge/useDrawings/useIndicators, schemas Zod oryon.ts, Shadow DOM évalué → non en V1, backend non bloquant) ; intégrations (MT5 hors V1) ; jalons P0-P3 avec critères de sortie ; protocole de vérification en 6 étapes ; 8 risques chiffrés ; 7 questions ouvertes avec recommandations (route /oryon, replay reporté, watchlist P3, entrée nav après Trades, état local sans lib d'état, suppression orphelins backend à la passe dédiée, pas de migration des dessins V1) ; annexes (références officielles, glossaire, traçabilité des faits datée b9f52fa).

Stage Summary:
- Livré : cahier des charges Oryon v1.0 — 14 sections, 9 tableaux, TDM 43 entrées, postcheck 9/9, statut « Proposition à valider » (docx de livraison + md versionné).
- Le document sépare explicitement le VÉRIFIÉ (section 5) du PROPOSÉ (section 8) et fait de la lecture seule une exigence testable (RNF-06).
- Prochaine étape côté produit : arbitrage des 7 questions ouvertes (§13) par l'utilisateur, puis lancement du jalon P0 (socle graphique + POC Lightweight Charts v5/panes).

---
Task ID: oryon-phase1
Agent: Super Z (main)
Date: 2026-10-10 (IM — « phase 1 : EUPHORIA — ORYON »)

Task: Implémenter Oryon Phase 1 — workspace de charting plein écran + fondation du moteur graphique (Lightweight Charts), code fonctionnel uniquement, lecture seule trading, sans dessins/indicateurs/positions.

Work Log:
- ÉTAT DÉPART : tree propre à 0e3ff57 (session-live retiré 079a8e0, cahier des charges 0e3ff57). Relecture disque : market.ts (useCandles 300/60s, useLiveQuote, useFeedStatus, STALE_MS 8s), schemas market (7 intervals, Candle, QuoteSource real|sim), fixtures catalog (7 instruments specs complets), market-service :3003 (REST /candles ≤500, Binance+Simulated, health public), MSW par défaut, EN-only (i18n dict.* conservé), AppShell main px-4 py-6 lg:px-8 lg:pb-8, topbar h-14.
- DÉPENDANCE : lightweight-charts@5.2.1 installé (pnpm --filter web — 1 ligne package.json + lockfile ; AGENTS.md sanctionne déjà « TradingView Lightweight Charts (price charts) » ; ECharts ^6.1.0 intouché, 7 usages préservés).
- ARCHITECTURE : lib/charting/oryon-chart-engine.ts (adaptateur v5 — createChart/addSeries(CandlestickSeries|LineSeries), autoSize, thème via getChartTheme() zéro hex codé, fusion tick→bougie dans le dernier bucket impérative, magnet, goToLatest, crosshair callback, attribution logo TradingView conservé) ; lib/charting/oryon-intervals.ts (source unique = marketIntervalSchema partagé) ; components/oryon/* (12 fichiers) : view (dérivation instrument par défaut = catalogue ∩ health.symbols, zéro symbole codé en dur), toolbar, tool-rail (outils dessin TOUS disabled honnêtes), chart-panel (états waiting/loading/error+retry/empty/ready — placeholder data → loading, jamais de données déguisées), price-chart (TickBridge impératif — zéro re-render workspace par tick, légende OHLC seedée dernière bougie, badge SIM/REAL honnête), instrument-selector (couverture feed réelle, « No feed » explicite), timeframe-selector, feed-status (feuille 1 Hz, stale honnête), utility-rail (docké lg+ / Sheet <lg ; notifications = état reporté assumé ; calendrier éco = réusage useEcoEvents lecture seule), lower-panel (replié défaut, copie honnête, zéro contrôle d'ordre), icon-button ; page.tsx server + metadata ; i18n oryon.ts + en.ts ; navigation (entrée après Trades).
- PIÈGE SESSION (documentation honnête) : échos d'outils corrompus en milieu de session (chemins/contenus hallucinés, éditions en échos incohérents) — discipline rétablie par « vérité compilateur » uniquement : tsc/noEmit + next build (leur sortie disque fait foi), éditions minimes verbatim, double lecture indépendante, journal de sonde sur disque. Deux échos hallucinés ont visé des chemins inexistants (aucun effet disque confirmé par tsc final = 0).
- VÉRIFICATIONS : tsc --noEmit 0 · eslint (oryon/**) 0 · next build OK (/oryon route statique) · sonde Playwright scripts/verify-oryon-phase1.js **31 PASS / 0 FAIL** (connexion démo réelle via bouton démo, desktop 1440 + mobile 390, screenshots shots/oryon-phase1-*.png, 0 erreur console des deux viewports) — incluant : 7 timeframes, switch 1H/5m sans dupliquer le canvas, type line/candles, rail outils désactivé, panneau bas replié + copie reportée, rail utilité docké/overlay, BTCUSDT → badge REAL (données Binance réelles via passerelle) + canvas unique, retour EURUSD SIM.
- ENVIRONNEMENT : preview = next start sur build (BUILD_ID) — les nouvelles routes exigent build+restart (dev.log vide) ; flux auth démo = bouton demo-hint (fills directs non fiables) ; redirection /login côté client après hydratation (waitUntil load + waitForSelector).

Stage Summary:
- Livré : Oryon Phase 1 complet — commit `feat(oryon)` sur main ; route /oryon opérationnelle en preview (200), moteur Lightweight Charts v5.2.1 rendant bougies réelles (SIM EURUSD par défaut + REAL BTCUSDT vérifié), états honnêtes partout, lecture seule stricte (aucun ordre, aucune position, outils dessin désactivés).
- Limites documentées : orphelins backend session-live (passe dédiée), dessins/indicateurs/positions = phases suivantes (frontières d'intégration prêtes), MT5 hors V1.
- Prochaine phase recommandée : moteur de dessin (Phase 2) sur la frontière engine existante (setCandles/applyTick déjà séparés de l'UI).

---
Task ID: oryon-phase2
Agent: Super Z (main)
Date: 2026-10-10 (IM — « On passe a la phase 2: PROFESSIONAL DRAWING ENGINE AND TECHNICAL-ANALYSIS TOOLS »)

Task: Implémenter Oryon Phase 2 — moteur de dessin professionnel intégré au chart réel (audit → modèle → lifecycle → outils → édition → undo/redo → persistance → tests → doc). Sans indicateurs ni overlays de positions.

Work Log:
- PRÉ-RESTART : sandbox sur le point de redémarrer — sécurité d'abord : bundle git complet (download/oryon-backup-full-history-2026-10-10.bundle, 156M, verify OK + test-clone OK), archives source complète (254M) + min (72M) avec .env inclus, guide RESTORE-ORYON-GUIDE.md. Travail Phase 1 intact après restart (2d7ab67 tête, tree propre).
- BASELINE (§2) : route (app)/oryon + 11 composants Phase 1 vérifiés ; engine v5.2.1 (temps UTCTimestamp secondes, setChartType REMPLACE la série → ré-attachement requis) ; rail 7 outils disabled honnêtes ; zod 3.25 ; PAS de runner de tests unitaires (bun 1.3.14 dispo) ; PRD lu : RF-04 Must/P1 = 8 types (7 V1 dont FIB+MEASURE + VLINE), undo/redo ≥50, persistance PAR SYMBOLE clé euforia.oryon.drawings.v1 (Q7 : pas de migration), Zod au chargement ; API primitives v5 vérifiée dans typings (attachPrimitive, IPrimitivePaneView zOrder normal|top, paneSize).
- CONTRATS PARTAGÉS : packages/shared/src/schemas/oryon.ts — 8 types en discriminated union (anchors t unix-sec + p prix domaine chart), style = CLÉS DE TOKENS (jamais hex), envelope fichier v1 {version, symbol, savedAt, drawings≤500}, ORYON_FIB_LEVELS (0→1) ; export index.ts.
- DOMAINE PUR (lib/oryon/drawings/) : geometry.ts (distance segment/ray + sortie slab-clipping, hitRect, hitHandle, fibLevelPrice) ; history.ts (snapshots immuables, cap 50, batch begin/end/abort = UNE entrée) ; store.ts (updates immuables, INVARIANTS : caché non sélectionnable, verrouillé refuse replace/style mais autorise visible/lock, loadAll vide l'historique anti-corruption inter-instruments, useSyncExternalStore-ready) ; persistence.ts (localStorage par symbole, debounce 300ms + flush, safeParse Zod, drop+console.warn, types non rendables filtrés) ; draft.ts (DraftOverlay create|edit — zéro React pendant un drag) ; interaction.ts (machine à états idle/drafting/moving/anchoring, listeners CAPTURE sur le wrapper hôte — consomme→stopPropagation avant LWC sinon pan natif, click-click ET press-drag-release, Escape/pointercancel propres, hit-testing topmost inverse, cursor affordances crosshair/grab/not-allowed).
- MOTEUR (chart-engine étendu au minimum) : façade OryonDrawingConversions null-safe — PIPELINE LOGIQUE (index fractionnaire interpolé par recherche binaire sur les bougies) au lieu de timeToCoordinate (qui échoue hors barres exactes : un dessin 5m restait invisible en 1D) ; xToSnappedTimeSec (ancrage = vraie barre, aller-retour déterministe), logicalToSnappedTimeSec, extrapolation linéaire hors bornes ; attachDrawings/detachDrawings avec RÉ-ATTACHEMENT automatique sur setChartType et mount.
- RENDU : oryon-drawing-primitive.ts (ISeriesPrimitive v5 — updateAllViews projette TOUT en CSS px pane-relatif avant chaque repaint LWC : pan/zoom/autoscale/resize/ticks alignés par construction, deux paneViews normal+top pour poignées, labels fib/measure précalculés, drafts rendus sans store) + canvas-render.ts purs (8 peintres + poignées, setTransform DPR, palette résolue getChartTheme() par peinture).
- UI : contexte OryonDrawingsProvider (store useState-lazy + activeTool + listOpen) ; tool-rail réécrit (9 outils actifs groupés + undo/redo + toggle liste, disabled honnête si collection vide) ; drawing-layer (montage gating engine, primitive+controller wiring, abonnement store → redraw + persistance debounced, chargement/flush par symbole, clavier document gardé INPUT/TEXTAREA, éditeur texte auto-invalidant par symbole, blur=commit / Esc-vide=suppression) ; object-list (useSyncExternalStore, œil/lock/poubelle par objet, style editor compact : 8 swatches tokens, largeur, dash, opacité fill, édition texte locale commitée) ; i18n rail+drawings EN.
- PIÈGES CORRIGÉS EN ROUTE : surface div qui interceptait tous les pointeurs → listeners sur le wrapper ancêtre + data-oryon-ui exclut l'UI du layer ; getters conversions (this) → méthodes fléchées ; narrowing union ProjectedDrawing → discriminant kind top-level ; cast ISeriesPrimitive<UTCTimestamp>→Time documenté aux frontières ; react-hooks v6 (refs en rendu, setState en effet) → refs synchronisées en effets + textEdit auto-invalidant ; libellés liste = lookup dictionnaire (S[typeTrend]) et non clés brutes.
- TESTS : bun apps/web/scripts/oryon-drawing-tests.ts — 61 PASS / 0 FAIL (géométrie 20, Zod 6, historique 10, store 14, persistance 8) ; 6 assertions de test initialement fausses corrigées (le code n'a pas bougé).
- VÉRIFICATIONS : tsc --noEmit 0 · eslint (web src) 0 erreur / 5 warnings PRÉEXISTANTS (logo, app-shell, localization, i18n config) · next build OK (/oryon statique) · sonde Playwright scripts/verify-oryon-phase2.js **41 PASS / 0 FAIL** : 9 outils armés, trend click-click + désarmement, undo/redo, hline visible + pixel-check APRÈS pan horizontal (alignement), vline/ray/rect/fib/measure créés, texte Esc-vide ne laisse pas d'artefact + Ctrl+Enter commite, lock/hide, persistance 8 objets après reload, CHANGEMENT D'INSTRUMENT sans fuite + retour restauré, UT 1H + type line conservent les dessins, delete-all avec confirmation, JSON corrompu sans crash, 0 erreur console — captures shots/oryon-phase2-*.png. Environnement : double next-server concurrent a causé un flake login → nettoyage pkill + restart propre (pid 4930, nouveau build).
- LECTURE SEULE : aucun ordre, aucune position, aucun indicateur ; ECharts intact ; draw V1 supprimé avec Session Live — aucune reprise de l'ancienne clé.

Stage Summary:
- Livré : Oryon Phase 2 complet — moteur de dessin 8 types ancré temps+prix (pipeline logique), sélection/déplacement/édition d'ancres/verrouillage/masquage/suppression, undo/redo 50 niveaux batché, liste d'objets + éditeur de style, persistance Zod par symbole versionnée, 61 tests unitaires + 41 vérifications E2E vertes.
- Décisions : pipeline logique (alignement inter-timeframes), snap ancres sur barres réelles, ré-attachement primitive sur changement de type, thème par clés de tokens persistées, tool désarmé après création (comportement TV).
- Limites documentées : persistance locale (pas cross-device), ancres hors fenêtre chargée = objet masqué, drag hors données = ancre snappée à la dernière barre, measure pips dépend instrument.pipSize.
- Prochaine phase recommandée (PRD P2) : indicateurs techniques (Wilder RSI, MACD, ATR, Bollinger, VWAP) sur le socle series v5, puis overlays de positions (P3 watchlist/layouts).

---
Task ID: oryon-phase3
Agent: Super Z (main)
Date: 2026-10-10 19:50 UTC

Task: « passant a la phase 3 : EUPHORIA — ORYON — PHASE 3: TECHNICAL INDICATOR ENGINE, CONFIGURATION, AND CHART INTEGRATION » — moteur d'indicateurs techniques réutilisable, configuration et intégration graphique (RF-05 / jalon P2 du cahier des charges)

Work Log:
- AUDIT PRÉALABLE (spec §2) : dépôt intact sur `main` @ `47b18ef` (arbre propre) — Phase 1 (`d3480a8`) et Phase 2 dessin (`47b18ef`) commitées, aucune restauration nécessaire. Vérifié sur pièce : route `/oryon`, `OryonChartEngine` (Lightweight Charts v5.2.1), `useCandles` (300 bougies, refetch 60 s, keepPreviousData), tick-bridge, store dessin immuable, persistance Zod par symbole, conventions de tests bun + sondes Playwright, `getChartTheme().indicatorPalette` déjà réservée par la DS. APIs panes v5.2.1 confirmées dans les typings (`addSeries(def, opts, paneIndex)`, `chart.panes()`, `removePane`, `IPaneApi.setStretchFactor`).
- CONTRATS PARTAGÉS (`packages/shared/src/schemas/oryon.ts`, extension chirurgicale) : union discriminée 7 types implémentés (sma/ema/rsi/macd/bbands/atr/volume), style par CLÉS DE TOKENS (jamais de hex), instance {id, visible, createdAt, updatedAt}, enveloppe versionnée `oryonIndicatorsFileSchema` (max 50). Règles métier inexpressibles en Zod (MACD fast<slow, RSI lower<upper) documentées et déléguées à la couche calc/validation.
- MOTEUR DE CALCUL PUR (`apps/web/src/lib/oryon/indicators/`, zéro import UI/navigateur) : `math.ts` (noyaux sma/ema/emaSparse/wilder/stddev population deux-passes/trueRange — warm-up = null, jamais 0 ni valeur fabriquée ; anti-dérive du glissement sommatoire), `normalize.ts` (tri ascendant, doublons → dernière écriture gagne, bougies non-finies jetées sans invention de prix), `calculate.ts` (RSI Wilder documenté : moyen pure → 50, pertes nulles → 100, jamais NaN/Inf ; MACD = EMA(fast)−EMA(slow), signal = EMA du segment défini, histogramme = macd−signal ; BB ±k·σ population ; ATR première valeur = moyenne des TR puis récursion Wilder ; garde exhaustive + règle métier re-vérifiée en profondeur), `validation.ts`, `registry.ts` (métadonnées, défauts RF-05 : SMA 20, EMA 20, RSI 14 30/70, MACD 12/26/9, BB 20/2, ATR 14), `format.ts`, `store.ts` (immuable, useSyncExternalStore, toute mutation revalidée schéma+règles — config invalide REFUSÉE, dernière valide conservée), `persistence.ts` (clé unique niveau graphique `euforia.oryon.indicators.v1`, safeParse, pile vide = fichier explicite distinct de la première visite, template PRD semé à la première visite : Volume + RSI 14).
- INTÉGRATION GRAPHIQUE (`lib/charting/oryon-indicator-series.ts`) : gestionnaire de séries — overlays en pane 0 sur l'échelle de prix principale, RSI/MACD/ATR/Volume dans des PANES NATIFS v5 (jamais d'offsets pixels), diff structurel par id (créer/mettre à jour/détruire — un ajout ne recrée jamais le graphique), instances masquées gardées `visible:false` (bascule sans réassignation de panes), lignes 30/70 du RSI via createPriceLine (vraies lignes de prix), histogrammes MACD/Volume colorés par point depuis les tokens (profit/loss résolus au paint), hauteurs proportionnelles 3:1:1, purge des panes vides en queue, mise à jour tick = recalcul pur puis `series.update()` du SEUL dernier point (pas de setData par tick, pas de render React).
- MOTEUR (`oryon-chart-engine.ts`) : manager créé au mount, délégations setCandles→rebuild, applyTick→updateLast, applyTheme→restyle, setIndicators→sync, onIndicatorValues→légende, destroy nettoyage, `debugStats` (sonde), handle dev `window.__ORYON_CHART_DEBUG__` (dev uniquement).
- UI (`components/oryon/`) : contexte `OryonIndicatorsProvider` (chargement validé + semis + sauvegarde debouncée 300 ms + flush unmount), `OryonIndicatorDialog` (recherche clavier sur le registre IMPLÉMENTÉ uniquement — aucun placeholder, pile active avec visibilité/réglages/retrait, éditeur de réglages à draft : paramètres min/max/step, palette de swatches tokens, largeur 1-4, dash, switch visible, Apply/Cancel — erreur inline et dernière config valide conservée), `OryonIndicatorLegend` (chip par instance : pastille token, libellé paramétré distinguant les instances jumelles, valeur live via callback moteur — M/H pour MACD, eye/× sur la chip ; `pointer-events-auto` requis — le conteneur légende est pointer-events-none, bug détecté PAR la sonde), bouton toolbar Indicators (testid `oryon-indicators`), i18n namespace `indicators` (EN canonique).
- TESTS : `apps/web/scripts/oryon-indicator-tests.ts` (bun) — **92 PASS / 0 FAIL** : SMA valeurs/fenêtre glissante anti-dérive/données insuffisantes ; EMA seed SMA + récursion calculées main ; RSI hausse pure 100 / baisse pure 0 / marché plat 50 / récursion Wilder calculée main (5 points) / bornes 0-100 sans NaN ; MACD ligne+signal+histogramme en fractions exactes (4/3, 41/18, 361/108…) ; fast≥slow rejeté (règle + throw calc) ; BB σ population ; ATR TR + Wilder exacts ; volume ; normalisation (tri, doublons dernière-écrit-gagne, non-finies jetées) ; valeurs les plus récentes ; formatage ; registre+défauts validés par schéma ; store (isolation des instances, rejet invalide, conservation dernière valide) ; persistance (semis première visite, round-trip, JSON corrompu, mauvaise version, filtrage par-instance des règles). Régression dessins : **61 PASS / 0 FAIL**.
- SONDE `scripts/verify-oryon-phase3.js` (Playwright, 1440) : **43 PASS / 0 FAIL** — template PRD au premier avis (2 chips, 3 panes, valeur RSI numérique), dialogue/recherche sur 7 implémentés, ajout SMA overlay + double instance (ids distincts), MACD +1 pane +3 séries, masquage conserve séries/panes, retrait purge tout, réglages (période 50 appliquée, période 1 invalide → message + dernière valide conservée), rechargement restauré (4 chips/3 panes), changement d'instrument (EURUSD→GBPUSD) et d'unité de temps : setup de niveau graphique conservé et recalculé, dessin coexistant (1 tendance tracée), bascule candles/line intacte, **0 erreur console**. Captures : oryon-phase3-{default-template,overlays,panes,drawings,final}.png.
- CHECKS : tsc web **0 erreur**, tsc shared **0 erreur**, ESLint oryon (fichiers nouveaux/modifiés) **0 problème**, build Next **OK** (toutes routes prérendues). Incident d'infrastructure résolu : le `next build` a écrasé le `.next` du serveur dev vivant (chunks 500, pages vides) — serveur tué, `.next` régénéré, relance via `devrun.sh` (pnpm absent du PATH → npx next dev).
- LECTURE SEULE PRÉSERVÉE : aucun ordre, aucune position, aucun courtier ; ECharts intouché ; aucun consommateur hors Oryon modifié.

Stage Summary:
- Oryon Phase 3 LIVRÉE et committée : 7 indicateurs (SMA, EMA, RSI, MACD, Bollinger, ATR, Volume) mathématiquement exacts et testés (92 tests unitaires), panes natifs v5, gestion complète (recherche/ajout/réglages/masquage/retrait/multi-instances), template par défaut PRD (Volume + RSI 14), persistance locale validée niveau graphique, régression dessins et sondes vertes (43/43), lecture seule intacte.
- DÉCISIONS DOCUMENTÉES : persistance au niveau du GRAPHIQUE (pas par symbole — convention TradingView, recalculé depuis les bougies affichées) ; RSI plat = 50 (convention documentée) ; EMA initialisé par SMA ; MACD signal ancré sur le premier segment défini ; σ population (convention TradingView) ; mise à jour tick par recalcul pur + update dernier point (correct et borné, mémoïsation côté React inutile à ≤2 Hz × 300 bougies).
- LIMITES : persistance locale uniquement (pas de synchronisation inter-appareils/comptes) ; données ~temps réel via refetch 60 s + ticks (source de vérité = serveur) ; remplissage volume de la bougie en formation à 0 jusqu'au refetch serveur ; thème clair couvert par la résolution de tokens (non re-sondé dédié).

---
Task ID: oryon-phase4
Agent: Super Z (main)
Date: 2026-10-11 (IM — « phase 4: ORYON — PHASE 4 — Open Position Visualization, Chart Overlays, and Live Position Monitoring »)

Task: Implémenter Oryon Phase 4 — visualisation read-only des positions ouvertes : panneau bas (table, résumé, statuts honnêtes), overlays graphiques entry/SL/TP (price lines v5), sélection panel↔chart, flux positions privé existant, contexte compte broker — sans aucune exécution d'ordre (spec §4 cardinale).

Work Log:
- AUDIT (spec §2) : dépôt sur `main` @ `06a979a` (Phases 1-3 committées). Catégorie d'intégration vérifiée = **3 — Mock-only sur contrats réels** : `packages/shared/src/schemas/broker.ts` complet (BrokerPosition, BrokerPositionsStreamEvent snapshots source:"sim", brokerSessionResponseSchema, lecture seule par design) ; market-service :3003 émet un livre SIM par utilisateur (mark-to-market ~2 s, SL/TP, snapshot idempotent, room user:<id>) ; hook `usePrivatePositions()` tracké SANS consommateur tracked ; `useBrokerSession()` (poll 15 s) → NOT_CONFIGURED honnête en mode MSW ; backend Accounts = provider mock uniquement (PAS de pont MT5 — limite divulguée) ; panneau bas = placeholder Phase 1 ; LWC v5.2.1 `createPriceLine`/`IPriceLine.applyOptions` confirmés dans les typings (lignes NON interactives = lecture seule native).
- DÉCOUVERTE MAJEURE (infrastructure) : une restauration d'archive post-boot a fait réapparaître ~540 fichiers/routes zombies non-trackés (ère Session Live, pré-079a8e0) PAR-DESSUS l'arbre committé — dont `app/oryon/` en CONFLIT de route avec `(app)/oryon` et des modules référençant des deps inexistantes (pdfmake) → `next build` impossible (174 erreurs Turbopack) + 2 238 erreurs tsc. Le build de boot de 22:30 (log /tmp) prouve que le graphe tracké est autonome. DÉCISION : QUARANTAINE réversible (mv, zéro suppression, manifestes + README + procédure rsync) de tout ce qui est non-tracké sous apps/web, fichiers Phase 4 exclus — arbre résultant = état committé + travail Phase 4 exactement. Un fichier Phase 4 (oryon-position-overlays.ts) emporté par erreur a été restauré immédiatement.
- DOMAINE PUR (lib/oryon/positions/, zéro UI) : match.ts (égalité EXACTE trim+upper — BTCUSD ≠ BTCUSDT jamais de substring ; label court #n ; BUY→LONG/SELL→SHORT) ; sanitize.ts (safeParse par enregistrement sur le schéma partagé, drop compté, doublons id last-write-wins, jamais de throw) ; status.ts (machine connecting/live/stale/disconnected, STALE_MS 8 s — jamais vert par défaut) ; view.ts (digits depuis decimal strings, formatSignedAmount, tone P&L, agrégation cents-integer — total null si aucune valeur, ordre de table déterministe) ; overlay.ts (specs entry/SL/TP — SL/TP seulement si présents/finis/positifs, clés stables `id:level`, diff structurel create/update/remove idempotent).
- CHART (lib/charting/oryon-position-overlays.ts) : OryonPositionOverlayManager sur price lines v5 natives (non draggables = lecture seule par construction) — entry colorée par direction (tokens profit/loss), SL warning dashed, TP accent dashed, axis label sur entry seulement ; diff appliqué en place (jamais de recréation par tick) ; setSeries() rejoue les specs après reconstruction de série (bascule candles↔line) ; restyle() sur changement de thème ; clear()/destroy() — ne possède que SES lignes.
- ENGINE (oryon-chart-engine.ts) : délégations setPositions/restyle/destroy + debugStats.priceLines (sonde) ; **DÉFAUT LATENT PHASE 3 CORRIGÉ** : `setChartType` sans overlay en pane 0 → removeSeries vide le pane 0 que LWC v5.2.1 auto-supprime (cleanupIfPaneIsEmpty) → les panes indicateurs perdaient leur ancre et la série principale atterrissait dans le mauvais pane (masqué jusqu'ici par l'overlay SMA du flux de sonde P3) — fix : `setPreserveEmptyPane(true)` sur pane 0 pendant la reconstruction, restauré ensuite (vérifié : panes=3 constants sur toute la séquence).
- UI : OryonPositionsProvider (contexte, UNE souscription app-wide au flux privé — même socket/auth que le feed ; re-render limité aux consommateurs : panneau + bridge feuille) ; OryonLowerPanel réécrit DANS le shell existant (toggle toolbar conservé, replié par défaut) : résumé (nombre, total P&L latent cents-safe, chip de fraîcheur 1 Hz leaf — Synced/Connecting/Stale Ns/Disconnected, badge SIM avec tooltip honnête), états distincts connecting/disconnected/empty (connecté-à-zéro ≠ déconnecté), table 9 colonnes (Symbol/Side/Volume/Entry/Market/SL/TP/P&L/Opened — N/A neutre pour SL/TP/prix manquants, JAMAIS 0, side LONG/SHORT en texte+icône, tabular-nums, ligne sélectionnable clavier+souris aria-selected, chip « chart » sur les positions de l'instrument affiché), ligne contexte compte (useBrokerSession gated : NOT_CONFIGURED honnête + lien Accounts / CONNECTED = broker+n°+note « livre SIM non fusionné » / erreur requête) ; OryonPositionsOverlayBridge dans price-chart (feuille imperative — filtre par dataSymbol affiché, specs → engine.setPositions, mounted-signal pour l'ordre des effets) ; i18n oryon.lower EN canonique (~40 clés).
- READ-ONLY : aucun ordre/clôture/modification/drag-exécution nulle part ; les price lines LWC n'ont AUCUN handler d'interaction ; la sélection ne fait que surligner ; aucun endpoint/mutation nouveau (schémas partagés intouchés).
- TESTS : scripts/oryon-position-tests.ts (bun) — **66 PASS / 0 FAIL** (match exact BTCUSD≠BTCUSDT, sanitize valides/malformés/doublons/nulls du contrat, machine de fraîcheur 8 s, digits/formats/agrégation, specs entry/SL/TP+sélection, diff structurel idempotent). Régressions bun : indicateurs 92/92, dessins 61/61.
- SONDES (Playwright) : verify-oryon-phase4.js — **28 PASS / 0 FAIL** (dev :3001, handle structural dev-only, convention P1-P3) : livre SIM 2-3 positions, badge+statuts honnêtes, side LONG/SHORT, overlays = position matchée ×3 exactement (6 au démarrage sur EURUSD, 3 sur XAUUSD, 0 sur BTCUSDT — matching exact vérifié), sélection/désélection update-in-place sans doublon, bascule type : overlays re-attachés + panes intacts, switch instrument sans fuite + retour restauré, chips indicateurs intactes, 0 erreur console. verify-oryon-phase3.js **43/43** (régression indicateurs+panes). verify-oryon-phase2.js 38/3 FAIL — **DÉRIVE PRÉEXISTANTE PROUVÉE** : mêmes échecs sur le code committé pur (swap 6 fichiers + re-sonde) — la sonde P2 précède le template d'indicateurs P3 (clics à hauteur fixe hors du pane principal rétréci) ; flakiness pixels hline identique aux deux configurations. smoke-p4-prod.js sur le build final :3000 : rows=3/badge/table/contexte OK.
- CHECKS : tsc --noEmit **0 erreur projet entier** (première fois depuis la restauration), ESLint fichiers Phase 4 **0 problème**, `next build` **OK** (/oryon statique, TypeScript 20.7 s), preview :3000 ressuscitée proprement (leçon P3 répétée : zombie next-server de la veille → ChunkLoadError ; pkill next-server + restart sur build final).
- HONNÊTETÉ DES DONNÉES : livre = SIM étiqueté partout (badge+tooltip, jamais présenté comme réel) ; P&L = valeur du flux (mark-to-market serveur avec contract sizes), JAMAIS recalculée localement ; total agrégé seulement dans le livre USD-denominated documenté, partiel affiché sans total ; BTCUSD/ETHUSD du livre sans correspondance exacte dans le catalogue → table oui, overlay NON ; contexte compte séparé du livre, fusion explicite refusée (note « positions du broker non fusionnées »).

Stage Summary:
- Oryon Phase 4 LIVRÉE : panneau Open Positions professionnel (résumé/statuts/table/sélection/contexte compte) + overlays entry/SL/TP sur price lines v5 natives non-interactives, filtrage par instrument exact, cycle de vie sans fuite, sélection panel↔chart, 66 tests unitaires + 28 vérifications E2E vertes, régression P3 43/43, tsc 0, build OK, lecture seule intacte.
- Infrastructure : quarantaine réversible documentée des zombies de restauration (build/tsc débloqués) ; défaut latent P3 (pane 0 auto-supprimé au changement de type) corrigé et vérifié.
- Limites : PAS de pont MT5 (provider mock seul — dépendance d'intégration explicite) ; livre SIM par utilisateur (pas par compte) ; persistance sélection = éphémère (non requise) ; fraîcheur per-position limitée par le contrat (ts de snapshot global) ; matching sans mécanisme de mapping provider (exacts seulement, documenté).
- Prochaine étape recommandée (PRD) : pont broker réel (MT5/CTR) côté Accounts + mapping d'instruments vérifié, puis compte-sélecteur Oryon ; ordres pending (P1) ; layouts multi-graphes (P3).

---
Task ID: oryon-phase5-audit
Agent: Super Z (main)
Date: 2026-10-11 (IM — « phase 5 : ORYON — PHASE 5 Advanced Chart Interaction, Measurement Tools, and Price Alerts »)

Task: Audit initial Phase 5 (spec §2) — état réel des Phases 1-4, moteur graphique, dessins, indicateurs, positions, flux market data, infrastructure d'alertes prix existante.

Work Log:
- Git : `main` @ `0a9164f`, arbre PROPRE. Phases 1-4 committées (d3480a8 → 3dcd631). Sondes verify-oryon-phase{1..4}.js présentes à la racine `scripts/` (trackées), tests bun dans apps/web/scripts/ (3 suites : dessins 61, indicateurs 92, positions 66).
- Moteur : lightweight-charts **5.2.1** (lockfile) ; OryonChartEngine = frontière unique (crosshair subscription, conversions pipeline logique, primitive dessins, manager indicateurs, manager overlays positions, debugStats dev-only `window.__ORYON_CHART_DEBUG__` = {series, panes, priceLines}).
- Mesure (Phase 2) : outil MEASURE deux ancres DÉJÀ dans l'union dessins (persistant par symbole, Zod) — readout actuel : Δ prix signé, Δ%, pips, bars (calculé dans la primitive via timeSecToLogical). Limites P2 documentées : pas de prix de départ/arrivée explicites, pas de durée écoulée, direction implicite (signe seul). → Phase 5 = EXTENSION du readout (pas de framework parallèle) ; §4.2 « price range/percentage range » = déjà couvert par MEASURE (décision documentée : pas d'outil redondant).
- Crosshair : `OryonCrosshairBar` = {t,o,h,l,c} SANS volume ni valeurs d'indicateurs ; légende = OHLC seul. → extension : volume (v du Candle partagé, affiché si fini et > 0 — la bougie en formation vaut 0 localement, JAMAIS fabriqué), horodatage UTC aligné sur l'axe, valeurs d'indicateurs à l'heure survolée (lookup pur sur calc.times/outputs).
- ALERTES PRIX : **AUCUN domaine existant** — alertSchema partagé = domaine DISCIPLINE (risque/émotions), monitoring = infra, nofy = base de connaissances ; ni module NestJS, ni modèle Prisma, ni endpoint, ni transport. → Catégorie d'intégration : frontend + frontière d'intégration propre, persistance navigateur-local (convention établie dessins/indicateurs), évaluation client sur le flux existant ; limites honnêtes documentées (pas de monitoring serveur, pas de push/email/SMS).
- FLUX (clé pour l'évaluation) : `lib/realtime/market.ts` = UN socket app-wide (:3003 via gateway) diffusant les quotes de TOUT le catalogue (dirty-flush ≤750 ms) + fallback polling 2 s ; `useLiveQuotes()` (Map toutes symbols) / `useLiveQuote(symbol)` / `useFeedStatus()` (phase connecting|live|reconnecting|offline, STALE_MS 8s) ; machine à états auth partagée. L'évaluation d'alertes consommera CE store (zéro nouvelle connexion, zéro poller par alerte). market-service :3003 EN MARCHE (providers Binance+Simulated, book SIM par user).
- Persistance : conventions établies — dessins `euforia.oryon.drawings.v1:{symbol}`, indicateurs `euforia.oryon.indicators.v1`, safeParse Zod, drop+warn, debounce 300 ms + flush. Alertes suivront : `euforia.oryon.alerts.v1` (enveloppe versionnée partagée).
- UI : panneau bas = Open Positions uniquement (pas d'onglets) ; utility rail = rails à onglets EXISTANT (notifications|calendar) → 3e onglet « Alerts » = point d'intégration naturel (§8 « existing Oryon panel ») ; toolbar = rangée OryonIconButton (entrée création d'alerte) ; dialogs Radix disponibles ; toasts sonner déjà montés globalement (usage trades/auth).
- Environnement : preview :3000 UP (build), dev :3001 DOWN (à démarrer pour sondes — handle debug dev-only), market :3003 UP, bun 1.3.14. Leçon P3/P4 : `next build` écrase le .next du serveur dev vivant → build APRÈS les sondes, preview relancée ensuite.
- Lecture seule : aucune mutation d'ordre/position nulle part ; les price lines LWC v5 sont non-interactives par construction (§4 cardinal préservé).

Stage Summary:
- Audit complet consigné. Classification : mesure = partielle (à étendre) ; crosshair = partiel (à étendre) ; alertes = absentes (frontière propre navigateur-local à construire sur le flux partagé vérifié) ; tout le reste (route, moteur, dessins, indicateurs, positions, flux) = implémenté et vérifié, régression obligatoire.

---
Task ID: oryon-phase5
Agent: Super Z (main)
Date: 2026-10-11 (IM — « phase 5 : ORYON — PHASE 5 Advanced Chart Interaction, Measurement Tools, and Price Alerts »)

Task: Implémenter Oryon Phase 5 — outils de mesure avancés (§4), feedback crosshair enrichi (§5), alertes de prix avec frontière d'intégration honnête (§6-§10), overlays de graphique, accessibilité clavier, performance et tests (§13) — sans rien casser des Phases 1-4.

Work Log:
- AUDIT (voir oryon-phase5-audit) : Phases 1-4 committées et vérifiées ; mesure = readout Δ/Δ%/pips/bars à étendre ; crosshair = OHLC seul ; AUCUN domaine d'alertes prix existant → frontière navigateur-local sur le flux quotes partagé (UN socket, zéro connexion par alerte).
- MESURE (§4) : module PUR `lib/oryon/drawings/measure.ts` (computeMeasureReadout — départ/arrivée formatés, direction explicite ↑/↓/→, Δ signé, Δ% = formule spec avec validation du dénominateur zéro, pips (pipSize instrument), bars (pipeline logique fourni par le primitive), durée écoulée = |Δt| RÉEL des timestamps d'ancres — JAMAIS bars × intervalle, formatElapsedDuration 2 unités significatives ; valeurs indisponibles OMISES, ancre invalide → pas de label) ; `canvas-render.paintMeasure` multi-lignes (boîte clampée, rien de calculé dans le peintre) ; le primitive délègue. Décision documentée (§4.2) : le mode « price range / percentage range » est DÉJÀ le readout du MEASURE — pas d'outil redondant. Interaction préservée (click-click, drag-release, Escape, Delete, liste d'objets, persistance par symbole).
- CROSSHAIR (§5) : `OryonCrosshairBar` étendu avec `v` (volume du Candle partagé) ; légende = horodatage UTC (aligné sur l'axe LWC, intraday vs 1D) + volume SEULEMENT si fini et > 0 (la bougie en formation vaut 0 localement — jamais fabriqué) via `lib/oryon/crosshair/format.ts` PUR ; valeurs d'indicateurs À L'HEURE survolée : lookups purs `indicators/lookup.ts` (binary search exacte sur calc.times — pas d'interpolation, warm-up → rien), manager.valuesAtTime + engine.indicatorValuesAtTime, chips de légende basculent survol↔flux live sans nouvelle souscription.
- ALERTES (§6-§10) : CONTRAT PARTAGÉ (`packages/shared/schemas/oryon.ts`) — oryonAlertSchema {id, symbol≤32 exact, targetPrice finite, condition crosses_above|crosses_below, label≤64 nullable, status active|triggered|disabled, createdAt/updatedAt, triggeredAt nullable} + enveloppe v1 max 100, SANS champ de canal de livraison (le seul canal = toast in-app ; prétendre email/push serait un mensonge produit). DOMAINE PUR lib/oryon/alerts/ : evaluate.ts (isCrossing sémantique exacte §6.2 — prev ≤/≥ T STRICT de l'autre côté ; OryonAlertEngine : priming au 1er snapshot JAMAIS déclenchant, dédup des prix égaux, observation stale ts<last ignorée, perte de flux → ré-amorçage global, one-shot via statut, re-arm) ; store.ts (immuable useSyncExternalStore, add normalisé trim+upper, cap 100, toggle/rearm/markTriggered idempotent) ; persistence.ts (`euforia.oryon.alerts.v1`, safeParse enveloppe + salvage PAR ENREGISTREMENT, debounce 300 ms + flush) ; overlay.ts (specs {key=alertId, price, condition, titre ▲/▼+label} filtrées statut=active + symbole EXACT, diff structurel idempotent). CHART : oryon-alert-overlays.ts (manager price lines v5 NON-interactives, ligne neutre textPrimary solide + axis label — distincte des positions profit/loss/warning/accent et des dessins accent, setSeries replay sur bascule type, restyle thème, clear/destroy ne possèdent que SES lignes) ; engine (setAlerts, debugStats.alertLines).
- UI (§6.1/§8) : provider OryonAlertsProvider (store+engine+wiring ; OryonAlertsFeedBridge leaf renders null — useLiveQuotes TOUTES symbols → engine.observe au rythme de diffusion, gate phase live, handle dev-only `__ORYON_ALERTS_DEBUG__.inject` pour les sondes) ; dialogue création compact (Radix, instrument actif lecture seule, cible préremplie au prix courant via getLiveQuote IMPÉRATIF — la toolbar ne re-render jamais par tick, condition par défaut crosses_above, label optionnel, note honnête « in-app only / navigateur-local », erreur inline cible invalide, formulaire REMONTÉ à chaque ouverture — zéro reset par effet, règle react-hooks v6) ; panneau gestion = 3e ONGLET du rail utilité EXISTANT (aucune navigation top-level) : statut d'évaluation (live/paused), lignes triées triggered→active→disabled, chip statut par ligne, actions réelles seulement (re-arm/enable-disable/delete — rien d'éditable en drag, rien d'implicite serveur), note de périmètre permanente ; toolbar = bouton BellPlus unique ; toast sonner au trigger confirmé.
- READ-ONLY (§4 cardinal) : aucune mutation d'ordre/position nulle part ; les lignes d'alerte LWC ne sont PAS draggables (natif) — l'édition passe exclusivement par le panneau validé ; création d'alerte = enregistrement local + ligne, zéro surface broker.
- TESTS : scripts/oryon-measure-tests.ts (bun) — **33 PASS / 0 FAIL** ; scripts/oryon-crosshair-tests.ts — **23 PASS / 0 FAIL** (temps UTC, gating volume, lookups exacts, warm-up honnête, multi-sorties MACD) ; scripts/oryon-alert-tests.ts — **62 PASS / 0 FAIL** (sémantique de croisement 8 cas, moteur : priming/doublons/one-shot/re-arm/reconnexion/stale/matching exact/non-finis/cross-below bout-en-bout, store + cap 100, schéma Zod, specs+diff, persistance roundtrip/JSON corrompu/salvage). Régressions bun : dessins **61/61**, indicateurs **92/92**, positions **66/66**.
- SONDE scripts/verify-oryon-phase5.js (Playwright, dev :3001) : **45 PASS / 0 FAIL** — mesure : Escape annule le draft, deux-clics persiste (enveloppe temps+prix), outil désarmé, Ctrl+Z / Ctrl+Shift+Z, 0 crash ; crosshair : horodatage au survol, OHLC, chip numérique, volume affiché sur BTCUSDT REAL ; alertes : onglet + état vide + statut live, dialogue prérempli (= instrument actif), rejet inline cible vide, création → 1 ligne (handle alertLines), enveloppe persistée, trigger déterministe via inject (amorce SOUS le seuil → franchit) → triggered + toast + ligne retirée, re-arm → restaurée, disable/enable → 0/1 sans doublon, matching exact BTCUSDT≠EURUSD + aller-retour instruments sans fuite, suppression propre ; régressions : positions 3 lignes + 6 price lines attendues/obtenues, 2 chips, 3 panes, dessins intacts, **0 erreur console**. Captures shots/oryon-phase5-*.png.
- RÉGRESSIONS sondes (dev :3001) : P4 **28/28**, P3 **43/43** — intactes ; P2 **38/3** = la DÉRIVE PRÉEXISTANTE documentée en Phase 4 (mêmes 3 échecs sur l'état committé pur : clics à hauteur fixe vs pane principal rétréci par le template P3 — aucun code P5 ne touche ce chemin) ; smoke-p4-prod sur le build final :3000 OK (rows=3, badge SIM, table, contexte).
- CHECKS : tsc web **0 erreur** ; ESLint fichiers P5 **0 problème** (2 erreurs react-hooks v6 corrigées en route : formulaire remonté au lieu d'un reset par effet, handler de trigger installé en effet — API engine setTriggerHandler) ; `next build` **OK** (/oryon statique) APRÈS arrêt du serveur dev (leçon P3), preview :3000 relancée proprement sur le build final (route 200).
- DÉCOUVERTE INFRA (pré-existante, documentée) : le commit savepoint `0a9164f` (entre sessions) a commité des fichiers zombies hors Oryon (packages/shared/security-center.ts, settingsDefaults.ts) → tsc standalone du package shared = 12 erreurs PRÉ-EXISTANTES, sans effet sur apps/web (tsc web = 0, transpilePackages) ni sur le build. Non corrigé (hors périmètre, non-Oryon) — signalé au rapport.
- HONNÊTETÉ DES DONNÉES : prix de référence = quote du flux (LA même valeur fusionnée dans la bougie — la contract ne porte qu'un prix, pas de mix bid/ask/last) ; déclenchement UNIQUEMENT pendant que le workspace est ouvert et le flux live ; persistance navigateur-local affichée en toutes lettres dans le panneau ; aucun canal email/push/SMS impliqué ; pas de monitoring serveur.

Stage Summary:
- Oryon Phase 5 LIVRÉE : mesure enrichie (départ/arrivée, direction, Δ, Δ%, pips, bars, durée réelle — module pur testé), crosshair enrichi (UTC + volume honnête + valeurs d'indicateurs à l'heure survolée), alertes de prix complètes (contrat partagé, moteur de croisement exact avec priming/dédup/reconnexion, persistance navigateur-local validée, dialogue de création compact, panneau de gestion dans le rail existant, overlays price lines non-interactifs distincts, toast in-app), 118 tests unitaires verts + 45 vérifications E2E vertes + régressions P3/P4/production intactes, tsc 0, eslint 0 (P5), build OK, lecture seule intacte.
- Décisions documentées : pas d'outil de range redondant (§4.2) ; one-shot + re-arm manuel (pas de modèle existant à suivre) ; persistance navigateur-local (convention dessins/indicateurs) ; canal de notification = in-app seulement ; entrée de création unique (toolbar) ; ligne d'alerte neutre textPrimary + titre ▲/▼.
- Limites : AUCUNE évaluation serveur (l'alerte ne déclenche pas navigateur fermé — documenté dans l'UI) ; pas de mapping provider (matching exact, hérité P4) ; alerts = périmètre navigateur (pas de synchro inter-appareils) ; le domaine discipline `alertSchema` partagé est RESTÉ intouché (domaine différent).
- Prochaine étape recommandée : backend d'alertes (module NestJS + modèle Prisma + évaluation côté serveur sur le flux market-service + transport du trigger) — la frontière frontend est prête à brancher, le contrat local se transpose tel quel.

---
Task ID: oryon-phase6-audit
Agent: Super Z (main)
Date: 2026-10-11 (IM — « phase 6 : ORYON — PHASE 6 Workspace Layouts, Chart Templates, and Persistent User Preferences »)

Task: Audit initial Phase 6 (spec §2) — état réel des Phases 1-5, modèle d'état du workspace, mécanismes de persistance existants (local + backend préférences), conventions UI/i18n/tests.

Work Log:
- Git : `main` @ `28f02a2` (Phase 5 commitée), arbre PROPRE. Aucun fichier zombie non-tracké dans apps/web (quarantaine P4 tient).
- WORKSPACE (composant oryon-view.tsx) : état d'arrangement = 7 useState DANS OryonWorkspace — {instrumentId, interval, chartType, magnet, utilityOpen, utilityPanel, lowerOpen} — mémoire composant UNIQUEMENT (perdu au reload). Panneau bas = hauteur fixe h-48 (pas de proportions splittables) ; rail utilité = docked lg+ / Sheet <lg ; panneau bas = positions uniquement (pas d'onglets). OryonChartType = "candles"|"line" ; intervalles = marketIntervalSchema (7 valeurs, source de vérité partagée).
- PERSISTANCE LOCALE (convention Oryon établie, 3 précédents) : dessins `euforia.oryon.drawings.v1:{symbol}` (P2), indicateurs `euforia.oryon.indicators.v1` (P3, OryonIndicatorStore.loadAll documenté pour « persistence load / template seeding » — prêt pour l'application de templates), alertes `euforia.oryon.alerts.v1` (P5). Toutes : enveloppe versionnée Zod partagée, safeParse, salvage par enregistrement, debounce 300 ms + flush, dégradation sans storage.
- BACKEND PRÉFÉRENCES (audit §8) : le module Settings existe (NestJS settings.controller : GET /me/preferences, PATCH /me/preferences/:domain, POST reset) MAIS (a) document à 9 domaines FIXES (trading/risk/journal/notifications/appearance/dashboard/academy/privacy/localization) — aucun domaine oryon, (b) collections multi-enregistrements non supportées (un objet par domaine), (c) DÉCISIF : le déploiement canonique tourne en MSW mocké (NEXT_PUBLIC_API_MOCKED=true, API NestJS :3002 DOWN) et le mockStore preferences est EN MÉMOIRE (structuredClone d'un objet module — perdu à chaque reload). Étendre le domaine = modifications shared+API+MSW pour une « persistance compte » qui serait en réalité volatile → exactement le mensonge que la spec §8 interdit (« do not pretend that local browser storage is cloud synchronization »).
- SavedTradeView (modèle Prisma + API trades) = précédent de vues sauvegardées mais contexte trades — un nouveau modèle+module+migration pour layouts/templates serait une nouvelle architecture API sans justification (spec §8 dernier §).
- DÉCISION ARCHITECTURALE (documentée) : persistance NAVIGATEUR-LOCAL versionnée (`euforia.oryon.layouts.v1`, `euforia.oryon.templates.v1`) derrière une couche pure réutilisable, divulguée honnêtement dans l'UI (mêmes conventions que dessins/indicateurs/alertes), avec distinction claire layouts (arrangement workspace) vs templates (réglages d'analyse). Le schéma layouts réserve l'extensibilité multi-graphes sans l'implémenter (spec §12).
- ÉTAT ANALYSE (capture layout) : {symbol, interval, chartType, magnet, lowerOpen, utilityOpen, utilityPanel} — tout est applicable par l'app actuelle ; instrument stocké par SYMBOL (identité stable cross-session, convention flux/alertes), résolu via le catalogue au mount.
- INDICATEURS POUR TEMPLATES : oryonIndicatorSchema (7 types) porte déjà config+style+visibilité validés — un template stocke des instances ; application = OryonIndicatorStore.loadAll (remplace la pile, ids stables, zéro doublon) + filtrage règle métier (MACD fast<slow, RSI lower<upper) avec compte des rejets → notification partielle honnête.
- CONVENTIONS UI VÉRIFIÉES : Dialog Radix (oryon-alerts-dialog = référence, formulaire remonté par open, erreur inline), DropdownMenu dispo (nofy), sonner toast monté globalement, OryonIconButton toolbar, i18n oryonDict (toolbar/utility/alerts namespaces), lucide icons, tokens bg-surface/border-border/text-muted-foreground/bg-loss...
- TESTS : suites bun apps/web/scripts/oryon-*-tests.ts (dessins 61, indicateurs 92, positions 66, measure 33, crosshair 23, alerts 62) ; sondes Playwright scripts/verify-oryon-phase{1..5}.js. Leçon P3/P5 : build APRÈS sondes (next build écrase .next du dev), pkill next-server avant preview.
- Environnement : web :3000 UP (preview build), market :3003 UP, API :3002 DOWN (attendu en mode mocké), bun 1.3.14.

Stage Summary:
- Audit consigné. Classification : état d'arrangement = mémoire composant (à déplacer dans un store persistant) ; persistance locale conventionnée = À RÉUTILISER ; backend préférences = existant mais inadapté (domaines fixes, multi-enregistrements non supportés, mock volatile) → local-only derrière abstraction propre, divulgué honnêtement ; indicateurs = prêts pour templates via loadAll ; dessins/alertes/positions = domaines séparés structurellement (aucun couplage à préserver de la casse). Prochaine étape : Stage B — contrats Zod layouts+templates dans packages/shared.

---
Task ID: oryon-phase6
Agent: Super Z (main)
Date: 2026-10-11 (IM — « phase 6 : ORYON — PHASE 6 Workspace Layouts, Chart Templates, and Persistent User Preferences »)

Task: Implémenter Oryon Phase 6 — gestion des layouts de workspace (§4-§5), templates de graphique (§6), sémantiques save/apply/restore (§7), persistance honnête (§8), validation/migration (§9), changements non sauvés (§10), préservation dessins/indicateurs/positions/alertes (§11), UX design system (§13), performance (§14), tests (§15) — sans rien casser des Phases 1-5.

Work Log:
- AUDIT (voir oryon-phase6-audit) : Phases 1-5 committées ; état d'arrangement en mémoire composant ; persistance locale conventionnée (3 précédents) ; backend préférences = 9 domaines fixes, mock MSW VOLATIL (en mémoire, perdu au reload) → DÉCISION : persistance navigateur-local versionnée derrière abstraction propre, divulguée honnêtement (patcher le settings backend aurait affiché un contrat serveur tout en stockant moins durablement que localStorage — le mensonge que la spec §8 interdit).
- CONTRATS PARTAGÉS (packages/shared/schemas/oryon.ts, extension) : oryonWorkspaceLayoutSchema {id, name 1..48, symbol nullable, interval (marketIntervalSchema), chartType candles|line, magnet, lowerPanel, utilityRail {open, panel}, createdAt, updatedAt} + enveloppe oryonLayoutsFileSchema v1 (max 20 + activeLayoutId nullable — le DÉFAUT n'est JAMAIS stocké, constante code) ; oryonChartTemplateSchema {id, name, chart {type, interval NULLABLE = « analyse seule »}, indicators = RÉUTILISE oryonIndicatorSchema (config validée, pas d'objets runtime), createdAt, updatedAt} + enveloppe v1 max 30. Zod n'exprime pas l'unicité de nom → politique store (insensible à la casse, documentée).
- DOMAINE PUR (lib/oryon/workspace/, zéro UI) : naming.ts (trim/1..48, collision insensible casse, uniqueCopyName « (copy) »/« (copy N) » tronqué pour toujours rentrer dans le cap) ; layouts.ts (ORYON_DEFAULT_SESSION déterministe, layoutSessionOf, sessionStateEqual champ-par-champ = détecteur dirty, buildLayout, newConfigId) ; templates.ts (planTemplateApply — re-vérifie les RÈGLES MÉTIER via la même fonction que le live, dédoublonne les ids template-locaux première-occurrence-gagne, compte les ignorés pour un rapport PARTIEL honnête) ; persistence.ts (2 clés `euforia.oryon.layouts.v1` / `euforia.oryon.templates.v1`, enveloppe lâche + SALVAGE PAR ENREGISTREMENT, salvage PAR INDICATEUR pour les templates (frame valide → entrées invalides jetées, le reste survit), pointeur actif pendant normalisé → null, debounce 300 ms + flush, dégradation sans storage) ; store.ts (OryonWorkspaceConfigStore — useSyncExternalStore, snapshot {session, layouts, templates, activeLayoutId, dirty, hydrated, version} ; mutations session NE persistent JAMAIS seules ; saveActive/saveAsNew/rename/duplicate (copie du SAUVEGARDÉ, non activée)/delete (actif → défaut, session préservée)/switch (applique la config SAUVEGARDÉE)/restoreDefault (records conservés) ; templates CRUD ; capacités 20/30).
- INTÉGRATION (components/oryon/) : oryon-workspace-context.tsx (provider au-dessus du workspace, hydrate en effet post-mount — zéro mismatch SSR/hydration ; applyTemplate = plan → indicatorStore.loadAll (UN commit, diff par id, AUCUNE réinitialisation graphique) → applyTemplateChart (interval si défini) ; saveCurrentTemplate capture la pile vivante) ; oryon-view.tsx refactoré — les 7 useState remplacés par la session du store, instrument résolu par SYMBOL via catalogue (dérivé, sans effet), effet de restauration partielle : symbole inconnu → reset au défaut + toast honnête, dirty reflète la différence ; oryon-toolbar.tsx : cluster « configuration workspace » (2 boutons après les alertes) ; oryon-layouts-menu.tsx (déclencheur = icône + NOM ACTIF + pastille dirty warning ; menu = radio défaut/layouts + save/save-as/rename/duplicate/delete/restore ciblés sur l'ACTIF ; dialogues nom (erreur inline, jamais de perte de saisie), confirmation delete, garde « changements non sauvés » 3 voies [Save & switch / Discard / Cancel] sur tout remplacement d'arrangement dirty) ; oryon-templates-menu.tsx (liste avec méta « N indicators · intervalle|analysis only », application CONFIRMÉE quand une pile vivante existe, dialogue de sauvegarde décrivant EXACTEMENT le périmètre, « Manage templates » = dialog compact rows apply/rename/delete) ; oryon-config-dialogs.tsx (NameDialog + ConfirmDialog partagés, contenu remonté par ouverture) ; BUG CORRIGÉ EN ROUTE : restore-default précocement court-circuité quand le défaut était déjà actif (le reset ne partait jamais) — targetId null ne no-op plus.
- i18n : namespaces oryon.layouts + oryon.templates (~90 clés EN canoniques, chaînes statiques, composition dynamique côté composants).
- ISOLATION STRUCTURELLE (§11) : dessins (store par symbole), alertes (store+engine), positions (flux) — AUCUN fil vers le config store ; le template ne capture ni ne restaure jamais dessins/alertes/positions ; le layout peut afficher des panneaux mais ne possède aucun domaine.
- TESTS : scripts/oryon-workspace-tests.ts (bun) — **106 PASS / 0 FAIL** : nommage (trim/48/casse/copies tronquées), session (défaut, roundtrip, égalité), plan template (pass-through, dédoublonnage ids, règles métier MACD/RSI, comptes honnêtes, pile vide), persistance (roundtrips, JSON corrompu, mauvaise version, salvage par enregistrement ET par indicateur, pointeur pendant, storage indisponible), store (hydrate vide/avec actif, save/save-as/rename/duplicate/switch/delete/restore, dirty tracking, default_immutable, capacités 20/30, roundtrip hydrate→mutate→flush→hydrate = reload retrouve l'arrangement). Régressions bun : dessins **61/61**, indicateurs **92/92**, positions **66/66**, mesure **33/33**, crosshair **23/23**, alertes **62/62**.
- SONDE scripts/verify-oryon-phase6.js (Playwright, dev :3001) : **64 PASS / 0 FAIL** — état initial honnête, création (enveloppe + arrangement capturés), dirty pastille + save, switch aller-retour restaure intervalle/type/panneau bas/rail, rename pré-rempli, duplicate « (copy) » non activé, rejet doublon insensible casse inline, garde unsaved (discard préserve la sauvegarde 1H, save & switch sauve l'original), delete confirmé (session vivante préservée), restore default (5m + records gardés), templates (capture exacte de la pile, confirmation d'application, restauration EXACTE, ids stables pile vivante == template — ZÉRO doublon, ré-application idempotente, moteur stable panes/series, gestion rename/delete, isolation dessins/alertes INTACTE, reload restaure layout actif + templates, 0 erreur console). Mobile 390 : déclencheur/menu/dialogue accessibles, 0 erreur.
- RÉGRESSIONS sondes (dev :3001) : P3 **43/43**, P4 **28/28**, P5 **45/45** ; P2 **38/3** = la DÉRIVE PRÉ-EXISTANTE documentée en Phase 4 (mêmes 3 échecs pixels sur l'état committé pur, aucun code P6 ne touche ce chemin).
- CHECKS : tsc web **0 erreur** (1 erreur de test corrigée en route : spread d'union → cast documenté, revalidé Zod au runtime) ; ESLint fichiers P6 **0 problème** ; `next build` **OK** (32/32 statiques, /oryon prérendu) APRÈS arrêt du dev (leçon P3), preview :3000 relancée proprement sur le build final (route 200) ; smoke P4 prod **rows=3 simBadge=1 table=1** ; smoke P6 prod scripts/smoke-p6-prod.js **8 PASS / 0 FAIL** (workspace, déclencheur, états vides honnêtes, save-as complet sur le build final, 0 erreur console).
- HONNÊTETÉ DES DONNÉES : persistance NAVIGATEUR-LOCAL affichée en toutes lettres dans les dialogues/panneaux (« stored in this browser », pas de langage cloud/compte) ; le défaut est immuable et toujours récupérable ; l'application d'un template remplace la pile d'indicateurs DOCUMENTÉ dans le dialogue de confirmation ; les applications partielles sont signalées (toast « N of M indicators skipped » — moteur testé, l'UI ne peut pas fabriquer d'indicateur non supporté sans build futur) ; layouts et templates restent DEUX contrats distincts, jamais fusionnés.

Stage Summary:
- Oryon Phase 6 LIVRÉE : layouts de workspace complets (save/save-as/rename/duplicate/switch/delete/restore-default, dirty tracking honnête, garde de changements non sauvés 3 voies, restauration au reload), templates de graphique distincts (capture pile d'indicateurs validée + type + intervalle optionnel, application sans doublon via loadAll, confirmation, gestion complète), contrats Zod versionnés partagés, persistance navigateur-local salvée par enregistrement derrière une abstraction propre, 106 tests unitaires + 64 vérifications E2E vertes + régressions P3/P4/P5 et smokes production intacts, tsc 0, eslint 0 (P6), build OK, lecture seule intacte.
- Décisions documentées : persistance locale (backend mock volatile — voir audit) ; défaut = constante code jamais stockée ; noms uniques insensibles à la casse ; duplicate = copie du SAUVEGARDÉ ; delete de l'actif préserve l'arrangement vivant ; switch applique la config sauvegardée (abandon explicite via garde) ; template = remplacement de pile documenté ; intervalle template nullable (« analyse seule ») ; instrument par symbol (identité cross-session).
- Limites : PAS de synchronisation inter-appareils/compte (le bridge backend exigerait d'étendre le contrat Settings 9 domaines + un stockage réel — la frontière est prête : remplacer les 2 adaptateurs de persistence.ts suffit) ; opérations de gestion ciblées sur le layout ACTIF (renomer un non-actif = switch d'abord) ; pas de proportions de panneaux (l'app n'a pas de splits redimensionnables — le schéma croîtra additivement) ; mono-graphe (le schéma réserve l'extensibilité multi-graphes sans l'implémenter) ; hygiène cross-tab non couverte (convention des autres enregistrements Oryon).
- Prochaine étape recommandée : extension du backend Settings (10e domaine `oryon` multi-enregistrements OU ressource dédiée) + adaptation des 2 adaptateurs de persistance pour la synchronisation de compte, puis multi-graphes (le schéma layouts est prêt à croître).

---
Task ID: oryon-phase7-audit
Agent: Super Z (main)
Date: 2026-10-11 (IM — « On passe a la phase7 : ORYON — PHASE 7 Multi-Chart Workspace, Market Comparison, and Chart Synchronization »)

Task: Audit initial Phase 7 (spec §2) — état réel des Phases 1-6 et des fondations réutilisables pour le multi-chart.

Work Log:
- Git : `main` @ `32fe4e2` (Phase 6 commitée), arbre PROPRE. Branche backup `backup/modifs-du-29-sept` intacte (jamais de gc).
- PHASES 1-6 VÉRIFIÉES OPÉRATIONNELLES : P1 workspace plein écran + LWC v5.2.1 (lockfile confirmé) ; P2 drawings 8 outils ; P3 indicateurs 7 types sur panes natifs v5 ; P4 positions read-only (lower panel + overlays price lines) ; P5 mesure avancée + crosshair enrichi + alertes ; P6 layouts + templates (Zod v1, store useSyncExternalStore, menus toolbar, 106 tests bun + 64 E2E).
- CHART ENGINE (lib/charting/oryon-chart-engine.ts) : adaptateur unique — mount/destroy, autoSize:true (le ResizeObserver de la lib gère le resize de grille SANS travail manuel), addSeries v5, panes natifs, conversions drawing null-safe. API sync ABSENTES (visible range, crosshair positionnel) → à étendre. onCrosshair = handler unique (légende) → à multiplexer.
- DONNÉES MARCHÉ (lib/realtime/market.ts) : DÉDUPLICATION DÉJÀ EN PLACE — useCandles = TanStack Query key ["candles", symbol, interval] (2 panneaux même symbole+TF = UNE requête partagée) ; UN socket global (prices + positions) broadcast à tous les consommateurs ; useLiveQuote lit la map globale. Multi-chart hérite de la dédup sans changement.
- CONFLITS MULTI-PANNEL identifiés (3) : (1) OryonDrawingStore = UNIQUE par workspace + layer charge par symbole → 2 panneaux s'écraseraient (violations §11) → registry par symbole requis ; (2) OryonIndicatorStore = UNIQUE + persiste fichier global → ownership par panneau requis (registry par panelId, panel-main garde la persistance legacy `euforia.oryon.indicators.v1`) ; (3) raccourcis clavier drawings au niveau document + object list par layer → gating « panneau actif » requis.
- CONTRÔLEUR INTERACTION (drawings/interaction.ts) : gate `canInteract` à ajouter aux deps — premier clic = activation sans dessin, second clic dessine (sémantique TV prévisible, §7).
- API LWC v5.2.1 CONFIRMÉES dans typings : subscribeVisibleTimeRangeChange, getVisibleRange/setVisibleRange (IRange<number> = seconds UTC), series.setCrosshairPosition(price, time, series) + chart.clearCrosshairPosition (en fait méthodes CHART), subscribeCrosshairMove.
- ÉTAT SESSION v1 (layouts.ts) : {symbol, interval, chartType, magnet, lowerOpen, utilityOpen, utilityPanel} — aplati mono-graphe ; le schéma partagé documente déjà « a future multi-chart engine adds a `charts` array in a NEW schema version » → migration v1→v2 prévue par le design existant.
- SCHEMA v2 DÉCIDÉ : layout {id, name, grid, panels[≤4]{id, symbol nullable, interval, chartType, indicators array|null}, activePanelId, sync{timeScale, crosshair, instrument, timeframe}, magnet, lowerPanel, utilityRail, timestamps} ; envelope version 2 ; migration v1 déterministe (grid single, panel "panel-main", indicators null = « non géré », sync false) ; dirty exclut activePanelId (préférence de vue).
- GRILLES : single | twoHorizontal | twoVertical | quad via CSS grid (auto-placement + grid-auto-rows minmax(0,1fr) pour les effectifs 3) ; <md → pile 1 colonne ; stable keys = panel ids → transitions SANS recréation de chart ; sync groupe unique implicite (tous les panneaux, 4 flags indépendants — membres dérivés = jamais de références stale, §9).
- COMPARAISON (§13) : le contrat CandlesResponse n'a AUCUN mode de comparaison normalisée → comparaison = graphes côte à côte synchronisés ; overlay normalisé documenté « future work » (lecture honnête de la spec : pas de moteur normalisé non requis).
- ICÔNES lucide 1.46 vérifiées : Columns2, Rows2, Grid2x2, Link2, Unlink2, Copy, Trash, Square, LayoutGrid, Maximize2 présentes (Trash2 absente).
- TESTIDS : les headers de panneau utiliseront des testids namespacés (`oryon-panel-{index}-*`) pour ne PAS casser le strict mode Playwright des sondes P1-P6 (toolbar garde les testids canoniques).
- Services : web :3000 UP (build preview), market :3003 UP, API mockée (NEXT_PUBLIC_API_MOCKED=true), bun 1.3.14.
- ISOLATION : positions/alerts overlays déjà filtrés par dataSymbol PAR PANNEAU (bridges dans OryonPriceChart) → prêts pour multi-chart sans modification.

Stage Summary:
- Audit consigné. Fondation single-chart STABLE (aucun bloqueur — la spec autorise la construction directe). 3 conflits de ownership identifiés avec solutions (registries + gating). API sync LWC confirmées. Prochaine étape : Stage B — contrats Zod v2 + domaine pur (session multi-panneau, migration, sync coordinator).

---
Task ID: oryon-phase7-wip-checkpoint
Agent: Super Z (main)
Date: 2026-10-11 (IM — demande utilisateur explicite : commit avant restart sandbox ~00h00)

Task: CHECKPOINT Phase 7 — figer le travail en cours dans git pour survivre au restart du sandbox.

Work Log:
- ÉTAT STAGE B/C/D/E (implémentation ~70% faite, TOUT commité dans ce checkpoint) :
  * Contrats partagés v2 (packages/shared/schemas/oryon.ts) : oryonGridSchema, oryonSyncSettingsSchema, oryonChartPanelSchema (indicators nullable = « non géré »), oryonWorkspaceLayoutV2Schema, oryonLayoutsFileV2Schema, ORYON_MAIN_PANEL_ID, ORYON_MAX_PANELS=4.
  * Domaine (lib/oryon/workspace/layouts.ts) : session v2 {grid, panels[], activePanelId, sync, magnet, lowerOpen, utilityOpen, utilityPanel}, ORYON_DEFAULT_SESSION, panelsForGrid (invariants fill/trim), normalizeActivePanel, buildLayout (capture stacks par panneau), migrateLayoutV1toV2 (déterministe), sessionStateEqual (activePanelId EXCLU du dirty).
  * Persistance (workspace/persistence.ts) : charge v1 ET v2 (migration par enregistrement), sauvegarde toujours v2, salvage inchangé.
  * Store (workspace/store.ts) : setActivePanel/setPanelSymbol/setPanelInterval/setPanelChartType/setSync/setGrid/duplicatePanel/removePanel/applyTemplateChart(panelId) + propagation instrument/timeframe (null ne propage pas) + hook setPanelIndicatorsCapture pour les saves.
  * Sync (lib/oryon/sync/alignment.ts + sync-engine.ts) : rangesEqual, findBarContainingTime (containment honnête, gaps rejetés), EchoGuard (150 ms), OryonSyncCoordinator (register(id, adapter), time-scale + crosshair, triple garde anti-boucle, features indépendantes).
  * Engine (lib/charting/oryon-chart-engine.ts) : getVisibleRange/applyVisibleRange/onVisibleRangeChange/applyCrosshairAtTime/clearCrosshairPosition/onCrosshairTime + guards écho + dispatch crosshair multiplexé (légende + sync) + subscribeVisibleTimeRangeChange branché dans mount/destroy.
  * Contextes : indicators = REGISTRY par panelId (panel-main garde persistance legacy `euforia.oryon.indicators.v1`) ; drawings = REGISTRY par symbole (LRU 24, dispose) + bindActiveStore ; workspace context : applyTemplate/saveCurrentTemplate ciblent le panneau ACTIF, applySavedLayout orchestre switch + stacks, hydrate applique les stacks du layout actif.
  * UI : OryonChartGrid (CSS grid single/twoHorizontal/twoVertical/quad, <md pile), OryonChartGridPanel (activation pointerdown/focus capture, résolution instrument, header par panneau), OryonPanelHeader (sélecteurs namespacés oryon-panel-{index}-*, badge actif, menu duplicate/remove/latest), OryonGridMenu + OryonSyncMenu (toolbar), OryonView réécrite (coordinator sync, engines map, toast agrégé instruments inconnus), tool rail sur activeStore publiée, drawing layer (store par prop, gate canInteract dans interaction.ts : premier clic = activation sans dessin, hover/shortcuts/object-list gated), sélecteurs instrument/timeframe avec idPrefix, i18n grids/panels/sync + copies templates multi-panneau.
  * Tests workspace réécrits v2 (~120 assertions attendues) — PAS ENCORE RUNNÉS.
- RESTE À FAIRE après restart (dans l'ordre) :
  1. `cd apps/web && npx tsc --noEmit` — corriger les erreurs résiduelles (la suite tests vient d'être réécrite ; templates-menu/légende/price-chart corrigés mais non re-vérifiés).
  2. Créer scripts/oryon-multichart-tests.ts (coordinator avec fake adapters : broadcast range/crosshair, écho, epsilon, unregister, gaps) — le Write était en cours quand l'interruption est arrivée, FICHIER NON CRÉÉ.
  3. Bun : oryon-workspace-tests + régressions P2/P3/P4/P5 (drawings 61, indicators 92, positions 66, measure 33, crosshair 23, alerts 62) + multichart.
  4. eslint fichiers P7 ; vérifier lint de oryon-chart-grid (toast import utilisé ?), oryon-grid-menu (SVG check inline — remplacer par lucide si refusé).
  5. Sonde Playwright scripts/verify-oryon-phase7.js (grids, panneau actif, sync on/off, layout multi save/restore, template → panneau actif, isolation drawings/indicators, positions/alertes scoping, mobile 390, 0 erreur console) + debug handle dev `__ORYON_PANEL_DEBUG__` si nécessaire.
  6. next build + smokes prod P4/P6 + régression sonde P6 64 checks.
  7. Vérifier : engine destroy() a unsubscribeVisibleTimeRangeChange ; lower panel activeSymbol = panneau actif ; createAlert = panneau actif.
- DÉCISIONS FIGÉES : sync = un groupe implicite (tous panneaux, 4 flags) ; comparison §13 = graphes synchronisés côte à côte (overlay normalisé = future work, contrat sans mode comparaison) ; stacks non-main = mémoire + capture layout (documenté) ; magnet/shell = workspace-level.
- ATTENTION au restart : auto-snapshot `23f56ac` a déjà capturé l'état +30 fichiers ; CE checkpoint est le commit de référence Phase 7 WIP. La branche backup/modifs-du-29-sept n'a PAS été touchée. Jamais de git gc.

Stage Summary:
- Phase 7 à ~70% (Stages B-C-D-E codés, F partiellement — données/overlays déjà multi-panneau par construction, G persistances v2 codées) ; H (tests+vérifications) à démarrer. Tout est commité — le restart ne peut plus rien perdre.

---
Task ID: oryon-phase7
Agent: Super Z (main)
Date: 2026-10-11 (IM — « on continue la phase 7 » — reprise du checkpoint 76512db)

Task: Compléter Oryon Phase 7 (Stages F-H restants du checkpoint ~70%) — tests, vérifications, corrections, build et rapport final.

Work Log:
- REPRISE : checkpoint 76512db intact, arbre propre. tsc --noEmit : 0 erreur d'emblée (H1).
- H2 — tests multichart (apps/web/scripts/oryon-multichart-tests.ts, bun) : EchoGuard (fenêtre 150 ms, expiration, epsilon de plage, null), rangesEqual, findBarContainingTime (containment, gaps, hors-span, non-finis), coordinateur avec FAKE adapters : discipline d'inscription (double id no-op strict-mode, unregister bidirectionnel, dispose), time-scale (broadcast aux autres, source jamais re-appliquée, écho synchrone terminé, skip epsilon, range null ignoré), crosshair (timestamp exact, cible non représentable → clear honnête), indépendance des 4 canaux, copie défensive setFeatures, remount. **67/67 PASS**.
- H3 — workspace v2 : 3 échecs → 2 DÉVIATIONS D'IMPLÉMENTATION vs design consigné : (1) sessionStateEqual incluait activePanelId (le checkpoint dit « dirty exclut activePanelId ») → exclu + sessionStateIdentical ajoutée pour le no-change guard de patchSession (sinon l'activation était avalée) ; (2) panelsForGrid élaguait à 2 pour twoHorizontal/twoVertical → non destructif (auto-placement CSS, 3-4 panneaux survivent), trim défensif quad uniquement. Test dirty restructuré (baseline propre avant activation). **169/169 PASS**. Régressions P2-P5 : 61/92/66/33/23/62 vertes.
- H4 — eslint P7 : 5 erreurs react-hooks/refs (lectures de ref pendant le render dans oryon-view : lazy-init du coordinateur) → accesseur getSync impératif (création au premier usage effet/callback) + prop sync inutilisée retirée de OryonChartGridPanel ; 5 imports inutilisés nettoyés. **0 erreur 0 warning**.
- H5 — sonde scripts/verify-oryon-phase7.js (54 vérifications) + handle dev __ORYON_PANELS_DEBUG__ (oryon-view : identité/sync/range/crosshair/stats par panneau) + lastCandleTime + observedCrosshairTime côté moteur. Corrections en route :
  * sémantique premier-clic-active : les contrôles de header d'un panneau inactif exigent l'activation d'abord (la sonde active explicitement comme un utilisateur) ;
  * app — focus-capture : activation au clavier uniquement (:focus-visible) — la restitution de focus Radix après duplicate/remove volait l'activation à la copie/survivant ;
  * app — sync-engine : cible non représentable → clearCrosshair (le docstring promettait un crosshair vide, le code laissait une position stale) ;
  * app — moteur : applyVisibleRange guard time-scale vide (setVisibleRange LWC lève « Value is null » pendant les rechargements de données — cause de 7 erreurs console) ; lastCrosshairTime enregistré AUTORITAIREMENT dans applyCrosshairAtTime/clearCrosshairPosition (LWC passe skipEvent=true pour les positions synthétiques — l'événement crosshair-moved ne fire jamais — la métrique mentait, PAS la sync) ;
  * app — headers de panneaux overflow-x-auto (<md, §15) ;
  * sonde — hover sur les barres (35% de largeur, la marge droite LWC ne produit pas de timestamp), leavePlot entre les hovers (expiration des gardes d'écho 150 ms face aux événements synthétiques de fermeture de menu), attente de disparition des toasts sonner avant la mesure mobile (éléments fixed hors périmètre), polling des positions WS avant les assertions de scoping.
  **54/54 PASS** (desktop 1440 + mobile 390, 0 erreur console).
- Régressions sondes : P6 64/64 (lectures d'enveloppe adaptées v2 : panels[0].interval/chartType) ; P3 43/43, P4 28/28, P5 45/45 sur dev :3001 avec reset config (les sondes P1-P5 prédatent le multi-chart — baseline usine ajoutée à leur setup ; PIÈGE DÉCOUVERT : leur BASE par défaut est :3000 production où les handles dev n'existent pas — d'où 14/10/11 faux échecs avant BASE_URL explicite) ; P2 38/3 = la dérive pré-existante documentée (inchangée).
- H6 — next build OK (32/32 statiques, /oryon prérendu) APRÈS arrêt du dev (leçon P3) ; preview :3000 relancée ; smokes prod : **P7 12/12** (scripts/smoke-p7-prod.js nouveau), P6 8/8, P4 baseline rows=3.
- H7 — destroy() du moteur vérifié (unsubscribeCrosshairMove + unsubscribeVisibleTimeRangeChange + overlays) ; lower panel activeSymbol et createAlert ciblent l'instrument du panneau ACTIF (code revu) ; tsc 0, eslint 0, commit final.
- Décisions : comparison §13 = graphes côte à côte synchronisés (overlay normalisé = future work, contrat sans mode comparaison) ; sync = un groupe implicite (4 flags indépendants) ; dirty exclut l'activation (préférence de vue) ; grilles à deux non destructives ; le handle __ORYON_PANELS_DEBUG__ est dev-only (jamais en production).
- Limites documentées : pas de réorganisation libre par glisser-déposer (les 4 arrangements supportés seulement) ; comparaison en pourcentage non implémentée (future work) ; piles d'indicateurs des panneaux non-main = mémoire + capture au save (documenté) ; sync crosshair inter-intervalles = containment honnête (gaps → clear).

Stage Summary:
- **ORYON PHASE 7 LIVRÉE ET VÉRIFIÉE** : multi-panneaux (1/2h/2v/2×2) sans recréation de graphes, modèle de panneau actif (premier clic = activation), 4 synchronisations indépendantes (time-scale, crosshair par timestamp, instrument, timeframe) avec triple protection anti-boucle, ownership respecté (dessins par symbole, indicateurs par panneau, positions/alertes scopées par symbole, alertes indépendantes des panneaux), layouts v2 multi-panneaux avec migration v1 déterministe, templates appliqués au panneau actif. 573 assertions unitaires + 54 vérifications E2E + smokes prod verts, tsc/eslint/build propres. Commit final sur main.

---
Task ID: oryon-phase8-audit
Agent: Super Z (main)
Date: 2026-10-11 (IM — « phase 8 : ORYON — PHASE 8 Market Sessions, Economic Events, and Temporal Context Engine »)

Task: Audit obligatoire Phase 8 (spec §2) — calendrier éco existant, sessions de marché, conventions temporelles, capacité LWC v5.2.1 pour les overlays session/événement.

Work Log:
- Git : `main` @ `b856fe5` (Phase 7 livrée), arbre PROPRE.
- PHASES 1-7 VÉRIFIÉES OPÉRATIONNELLES (worklog + code) : P1 moteur LWC v5.2.1 ; P2 dessins 8 outils (registry par symbole) ; P3 indicateurs 7 types (registry par panneau) ; P4 positions overlay scopé symbole ; P5 mesure + crosshair UTC + alertes ; P6 layouts+templates ; P7 multi-panneaux (1/2h/2v/quad), panneau actif, sync 4 flags, layouts v2 + migration v1.
- CALENDRIER ÉCO EXISTANT (VERIFIED — réutilisation obligatoire, spec §6) :
  * Contrat partagé `eco-event.ts` : EcoEvent {id, title, currency(3), impact HIGH|MEDIUM|LOW, scheduledAt ISO-UTC, actual/forecast/previous nullable} — via `ecoEventsResponseSchema` (api.ts) GET /eco-events.
  * API NestJS module `calendar/` complet : port provider (`EconomicCalendarProvider.fetchWindow`) + adaptateur `builtin-economic.provider.ts` (échantillon déterministe « builtin-sample », créneaux Toronto, fenêtre [-92..+13] j) + repository Prisma + contrôleurs. Le domaine dérive SCHEDULED/RELEASED (actual non null + passé).
  * Web : `useEcoEvents()` (TanStack, key ["eco-events"]) → MSW mock OU API réelle — les DEUX servent le même générateur déterministe. Source = DONNÉES D'ÉCHANTILLON, aucun provider live n'existe → étiquetage honnête obligatoire (spec §13).
  * UI existante : page /events (eco-calendar.tsx, 525 l.) + trading-calendar.tsx + **le rail utilitaire Oryon a DÉJÀ un onglet calendar** (OryonEcoPanel l.183 : 8 prochaines, read-only, Toronto codé en dur).
- SESSIONS DE MARCHÉ : **MISSING**. Seul `ANALYTIC_SESSIONS` (shared/constants.ts) = buckets UTC fixes pour analytics journal (Asia 20-07, London 07-13, NY 13-20 UTC) — convention journal, PAS un moteur de sessions (offsets fixes interdits par spec §4.2 pour le rendu).
- FUSEAUX (VERIFIED) : transport ISO-UTC/epoch-ms partout ; axe graphique + légende crosshair = UTC (format.ts documenté) ; **préférence timezone utilisateur EXISTE : Profile.timezone (PATCH /me, ianaTimezoneSchema, défaut America/Toronto, source unique spec settings.ts)** → réutilisée (§9.1) via useProfile().
- INSTRUMENTS : catalogue {symbol, name, assetClass FOREX|CRYPTO|SYNTHETIC|INDEX|METAL|ENERGY, quoteCurrency, pipSize, digits} — AUCUNE métadonnée horaires → périmètre sessions défini par assetClass dans les définitions Phase 8 (CRYPTO/SYNTHETIC = 24/7, sessions non applicables — affiché honnêtement) ; mapping événement↔instrument fiable INDISPONIBLE (pas de devise de base dans le schéma) → §10 : browse-all + filtres utilisateur, jamais de match par préfixe.
- LAYOUTS v2 : panels[]{id,symbol,interval,chartType,indicators} + utilityRail{open,panel:notifications|alerts|calendar} → préférences contextuelles par panneau = CROISSANCE ADDITIVE v3 (pattern v1→v2 établi, migration déterministe).
- LWC v5.2.1 CAPACITÉS CONFIRMÉES (typings) : PrimitivePaneViewZOrder = "bottom"|"normal"|"top" → shading session DERRIÈRE les séries ; createSeriesMarkers(series, markers, options) → setMarkers, SeriesMarker {time, position, shape, color, id?, text?} (ids stables) ; subscribeClick → MouseEventParams {time?, point?, paneIndex?} → sélection de marqueur sans primitive custom.
- OUTILS : datetime.ts (helpers formulaires), useNowMs (ticker 1 Hz, SSR-safe), getChartTheme (tokens), i18n dictionaries/en.ts, tests bun scripts/oryon-*-tests.ts + sondes Playwright verify-oryon-phase*.js + tsc/eslint/next build.

Stage Summary:
- Audit consigné : TOUTES les dépendances Phase 8 sont résolues — calendrier éco RÉUTILISÉ (contrat + requête existants), timezone utilisateur RÉUTILISÉE (Profile), sessions à construire (moteur Intl pur, IANA, sans nouvelle lib), rendu via primitive zOrder "bottom" + createSeriesMarkers natifs. Limites documentées : pas de calendrier vacances vérifié (sessions = indicatives), pas de provider live (événements = échantillon étiqueté). Prochaine étape : Stage B — schéma v3 contextuel + définitions sessions typées + moteur pur.

---
Task ID: oryon-phase8
Agent: Super Z (main)
Date: 2026-10-11 (IM — « phase 8 » + « continu » — Market Sessions, Economic Events, and Temporal Context Engine)

Task: Implémenter la Phase 8 d'Oryon contre le code réel (Stages B-H après l'audit) — moteur de sessions, contexte événements économiques, annotations de graphique, architecture temporelle, intégration multi-graphe + layouts.

Work Log:
- STAGE B/C — DOMAINE + MOTEUR : contrats partagés v3 (OryonPanelContext {sessionShading, eventMarkers, eventMinImportance}, layout v3 + enveloppe v3, migrations déterministes v1→v3 / v2→v3, ORYON_DEFAULT_PANEL_CONTEXT shading ON + markers ON + MEDIUM) ; définitions de sessions typées CODE (Sydney/Tokyo/London/NY — IANA, heures locales, jours locaux, scope par assetClass : FOREX 4 sessions, METAL/ENERGY/INDEX London+NY indicatif, CRYPTO/SYNTHETIC aucune 24/7 honnête, holidayCalendar null documenté) ; moteur pur (offsets Intl longOffset/shortOffset, « offset twicing » pour wall→UTC, cross-midnight → lendemain local, demi-ouvert [start,end), cache par session-jour clé FULL définition — bug de clé id-seul corrigé, statut indicatif + prochaine transition lookahead 10 j, computeSessionBands trié) ; domaine événements (statut dérivé SCHEDULED/RELEASED miroir de l'API, seuil d'importance par rangs, span demi-ouvert, dédoublonnage id, devise exacte jamais sous-chaîne, span graphique = bucket de marge de chaque côté) ; helpers d'affichage Intl (formatInstant/Time/dateKey/abbr, cache borné) + hook useDisplayTimezone (réutilise Profile.timezone PATCH /me, validation plateforme, fallback America/Toronto — source unique §9.1 respectée).
- STAGE D — VISUALISATION : primitive série OryonSessionOverlayPrimitive (zOrder « bottom » vérifié dans les typings 5.2.1 = DERRIÈRE les bougies, fill alpha 0.07 + hairline de début + label compact conditionné à la largeur, résolution de couleurs par tokens thématisés avec cache invalidé sur applyTheme) ; manager attach/detach/destroy miroir des overlays positions/alertes ; surface moteur setSessionBands (diff-free, applyOptions({}) pour redraw, JAMAIS de recréation de graphe) ; porte intraday documentée (1D → pas de shading, le panneau contextuel rapporte les statuts).
- STAGE E — PANNEAU CONTEXTE : l'onglet calendar du rail EXTENDU en Market context (aucun module dupliqué) — statuts de session pour l'instrument ACTIF (cadence 15 s via useNowMs, badges texte+point jamais couleur seule, heure locale de session + abréviation zone, note « indicative » explicite, état « trades continuously » pour 24/7) + liste d'événements sur la VRAIE surface éco partagée (useEcoEvents) avec filtres réellement applicables au contrat (portée upcoming/all, importance, devise des données présentes), statut dérivé affiché, A/F/P avec « — » honnête, loading/error/retry/empty, note de source « sample provider — development fixtures » EN CLAIR (aucun événement inventé), lien /events, timezone d'affichage = profil.
- STAGE F — MARQUEURS : createSeriesMarkers natif 5.2.1 (ids = ids d'événements stables, position aboveBar, couleur+taille encodent l'importance — jamais couleur seule, autoScale false) ; snap par containment findBarContainingTime (jamais de position fabriquée) ; ponts null-render (mirroir positions/alertes) — requêtes PARTAGÉES catalog+eco (§11 pas de flux par panneau) ; onEventMarkerClick → popover ancré au clic listant TOUS les événements du bucket (plusieurs releases au même créneau empilées dans une carte), valeurs manquantes « — », Escape + close + click-outside, invalidation dérivée par clé de fenêtre (aucun setState en effet — règle purity) ; seuil d'importance + toggles par panneau via menu Globe dans le header de panneau (testids namespacés).
- STAGE G — INTÉGRATION : store setPanelContext (jamais propagé — préférence par panneau), duplicatePanel copie le contexte, dirty inclut le contexte ; persistance charge v1/v2/v3 sauvegarde v3 ; layout v3 sur disque.
- CORRECTIONS DE DURETÉ DÉCOUVERTES PAR LES SONDÉS : (1) clé de cache session = définition complète (id-seul → stale interval) ; (2) re-validation des marqueurs contre les bougies QUE LE MOTEUR REND (les effets enfants passent AVANT l'effet setCandles du parent — marqueurs hors données → « Value is null » LWC) ; (3) ordre rebuildSeriesData AVANT re-attach des overlays temporels dans setChartType (time scale chart-level garde les rows précédentes) ; (4) React purity — plus aucun Date.now() en rendu (placeholder « — » avant le premier tick).
- STAGE H — VÉRIFICATIONS : bun — temporal 81/81 (DST 2026 vérifié US/EU/NSW, cross-midnight, bornes demi-ouvertes, week-ends, métadonnées manquantes, zones inconnues, jour férié = session indicative maintenue, filtres, dédoublonnage, clés de date cross-zone, mutations store) + workspace v3 171/171 + multichart 67/67 + régressions 61/92/66/33/23/62 ; tsc 0 (12 erreurs pré-existantes dans shared/security-center+settingsDefaults — non liées, drift documenté) ; eslint 0 (fichiers P8) ; sonde verify-oryon-phase8.js **36/36 PASS** (desktop 1440 + mobile 390, 0 erreur console : contextes par défaut, bandes FOREX 15m=7, marqueurs=8, toggles sans recréation viewport stable, seuil HIGH 5≤8 sous-ensemble, clic marqueur → popover honnête, gates 1D+crypto, panneau contexte 4 statuts + note source + filtres ALL≥upcoming 40≥0, layout v3 save→switch→restore contexte, indépendance 2 panneaux, mobile overlay) ; régressions P3 43/43, P4 28/28, P5 45/45, P6 64/64, P7 53/54, P2 38/3 (dérive documentée inchangée) — PIÈGE rappelé : sondes P3-P5 exigent BASE_URL=:3001 (défaut :3000 = 14/10/11 faux échecs) ; next build OK (32/32 statiques, /oryon prérendu) APRÈS arrêt du dev ; preview :3000 relancée sur le build P8 ; smokes prod P7 12/12, P6 8/8, P4 rows=3 baseline.
- CONSTAT HONNÊTE P7-L1 (documenté, non régressé) : 8-11 erreurs console « Value is null » dans la section template-apply de la sonde P7 — stack complète capturée : ensureNotNull(findBar) dans SeriesBarColorer pendant drawSourceViews (course de peinture LWC pendant une transition de données du flux template/panes) ; A/B CONCLUANT : seed d'un layout v3 avec TOUS les overlays P8 désactivés → les MÊMES erreurs se produisent (11) → PAS une régression Phase 8 ; sonde P7 verte à sa livraison (timing flaky) ; les vérifications fonctionnelles du template PASS (I1-I4) — le paint suivant réussit, impact utilisateur nul ; sonde P7 restaurée à l'état propre après l'expérience ; suivi recommandé : investigation amont LWC (paires setData+invalidate).

Stage Summary:
- **ORYON PHASE 8 LIVRÉE ET VÉRIFIÉE** : moteur de sessions IANA/DST-correct avec étiquetage « indicatif » honnête (aucun calendrier vacances inventé), shading DERRIÈRE les bougies par primitive bottom-zOrder sans recréation de graphe, marqueurs d'événements natifs bar-snappés à seuil d'importance par panneau, popover de détail honnête (— pour les valeurs manquantes), panneau Market context réutilisant la VRAIE surface éco avec la note « sample provider » en clair, timezone d'affichage = profil unique (jamais de décalage d'instant), contrats v3 additifs avec migrations déterministes v1/v2, intégration multi-panneaux indépendante + layouts persistés. 593 assertions unitaires + 36 vérifications E2E + smokes prod verts, tsc/eslint/build propres.
- Décisions : sessions = constantes code versionnées (jamais persistées — un vieux layout ne peut pas ressusciter un horaire périmé) ; CRYPTO/SYNTHETIC = « sessions do not apply » affiché ; 1D = pas de shading (porte intraday documentée) ; seuil MEDIUM par défaut (LOW reste dans le panneau) ; mapping événement↔instrument REFUSÉ (pas de métadonnée fiable dans le catalogue — §10 browse-all + filtres, jamais de préfixe) ; événements = échantillon déterministe étiqueté (aucun provider live n'existe — audit) ; filtres du panneau = état de lecture local non persisté (les prefs persistées sont les préférences de graphique).
- Limites : pas de calendrier vacances vérifié (sessions indicatives, jours fériés non exclus — dit en toutes lettres dans l'UI) ; pas de provider éco live (fixtures déterministes étiquetées) ; race LWC pré-existante au template-apply documentée avec stack + preuve A/B (hors périmètre P8) ; pas de mode pourcentage/comparaison (future work P7).
- Prochaine étape recommandée : pont provider éco réel derrière le port existant (swap d'adaptateur, zéro changement de domaine) OU notification d'approche d'événement HIGH sur les instruments du workspace (réutilise le moteur d'alertes) ; investiguer la race LWC côté template-apply (upstream).

---
Task ID: oryon-phase9-audit
Agent: Super Z (main)
Date: 2026-10-12 (IM — « Phase 9 : ORYON — ADVANCED MARKET STRUCTURE & KEY PRICE LEVELS »)

Task: Audit obligatoire Phase 9 (spec §2) — structure de marché existante, key levels, overlays, configuration, multi-chart, tests.

Work Log:
- Git : `main` @ `cad6024` (arbre PROPRE). **Phases 1–8 TOUTES VÉRIFIÉES OPÉRATIONNELLES** (worklog + git log : d3480a8 P1 moteur, 47b18ef P2 dessins, 06a979a P3 indicateurs, 3dcd631 P4 positions, 28f02a2 P5 mesure/crosshair/alertes, 32fe4e2 P6 layouts+templates, 912b6fb P7 multi-graphe, c7e8dd2+b7b5e05 P8 sessions/événements/temporel). Le résumé de session précédente (« P8 jamais exécutée ») était OBSOLÈTE — le dépôt fait foi.
- Stack vérifiée : LWC **5.2.1**, Next 16.3.5, React 19.2.8, Zod 3.25, TanStack Query 5, pnpm 12.4.2, bun 1.3.14 présent.
- MATRICE (spec §2.2) : Chart data = ✅ useCandles(symbol, interval) 300 bougies validées Zod (7 intervalles 1m→1D ; 1D = séries autoritaires pour les niveaux ; useCandlesRange fenêtres fixes) ; Market structure = ❌ ABSENT (aucun pivot/swing) ; Key levels = ❌ ABSENT ; Chart overlays = ✅ 3 patterns éprouvés à miroir (positions/alertes = price lines diffées ; sessions = primitive zOrder bottom ; événements = createSeriesMarkers natif, ids stables, containment) ; Configuration = ✅ pattern per-panel (context v3 + setPanelContext + menu header) ; Multi-chart = ✅ registres par panneau + requêtes TanStack partagées ; Tests = ✅ harnais maison bun (ok/eq) + sondes Playwright scripts/verify-oryon-phaseN.js (BASE_URL :3001 dev).
- CAPACITÉS RÉUTILISÉES P9 : moteur sessions pur Phase 8 (sessionIntervalsForUtcRange IANA/DST — base de l'Opening Range) ; useDisplayTimezone (Profile.timezone) ; getChartTheme tokens (jamais de hex) ; conversions engine (time↔X, price↔Y) ; useInstruments (assetClass, pipSize, digits) ; migrations layouts v1/v2→v3 (pattern v4 additif à suivre) ; debugStats/__ORYON_PANELS_DEBUG__ (probes).
- DÉCISIONS PRÉ-IMPLÉMENTATION (spec §4-§9) : pivots confirmation droite stricte (jamais confirmé avant i+right bougies) + candidats « provisional » distincts (opt-in) ; HH/HL/LH/LL sur pivots successifs de MÊME type ; BOS/CHoCH = machine à états causale (niveau actif confirmable AVANT la bougie de cassure, mode close|wick configurable, un seul événement par niveau cassé, ids stables dérivés des bougies sources) ; niveaux PD/PW calculés depuis les bougies **1D** (source autoritaire,frontière = minuit UTC du datafeed — jamais le fuseau navigateur ; semaine ISO lundi 00:00 UTC documentée) ; OR = session Phase 8 + durée config, gate assetClass (FOREX/METAL/ENERGY/INDEX) + intraday, developing/complète honnêtes ; config per-panel `analysis` en v4 ADDITIVE (migration v3→v4 déterministe, défauts neutres = tout désactivé → zéro changement visuel des layouts existants) ; rendu = 2e plugin markers (structure) + manager price lines (levels, miroir positions) + primitive box OR (miroir session overlay, alpha faible, zOrder bottom).

Stage Summary:
- Audit consigné : TOUTES les dépendances P9 sont résolues par réutilisation (moteur sessions, patterns overlays, persistance versionnée, harnais tests). Deux calculs purs à créer (structure, levels) + un moteur OR adossé au moteur de sessions P8. Périmètre honnête : pas de calendrier vacances (sessions indicatives — hérité P8), niveaux = convention UTC du datafeed documentée dans l'UI, BOS/CHoCH implémenté avec sémantique explicite testée. Prochaine étape : Stage B — calculs purs + tests.

---
Task ID: oryon-phase9
Agent: Super Z (main)
Date: 2026-10-12 (IM — « Phase 9 : ORYON — ADVANCED MARKET STRUCTURE & KEY PRICE LEVELS »)

Task: Implémenter la Phase 9 contre le code réel (Stages B-H après l'audit) — structure de marché, niveaux clés, opening range, interface de configuration, persistance v4, isolation multi-panneaux.

Work Log:
- STAGE B — CALCULS PURS : `lib/oryon/structure/pivots.ts` (détection swings STRICTS left/right, confirmation causale — dépend uniquement des bougies ≤ i+right, candidats PROVISIONAL distincts opt-in, filtres minDistancePips/minSeparationBars appliqués contre les pivots ACCEPTÉS only, ids stables `h-<sec>`/`l-<sec>`, normalizeCandles first-wins + invalides écartées, prix zéro = valide) ; `classifyPivots` (HH/LH/HL/LL sur chaînes confirmées de MÊME type, pivot isolé jamais classifié, provisional ni classifié ni comparateur) ; `structure/breaks.ts` (machine BOS/CHoCH causale documentée : niveau actif = swing le plus récent CONFIRMÉ avant la bougie j (p+right ≤ j), mode close|wick strict, toucher égal ≠ cassure, gap = cassure, consommation du niveau (pas de re-fire), remplacement avant cassure, high évalué avant low (tie-break), ids `<type>-<pivotId>-<breakSec>`) ; `lib/oryon/levels/levels.ts` (PDH/PDL/PDO/PDC + PWH/PWL/PWO/PWC depuis la série **1D du datafeed** — bornes = buckets UTC minuit du service, semaines ISO lundi 00:00 UTC documentées, semaine courante partielle exclue, périodes manquantes SAUTÉES jamais zéro) ; `levels/opening-range.ts` (RÉUTILISE sessionIntervalsForUtcRange Phase 8 — fenêtre [start, start+durée) demi-ouverte, complete vs developing relatifs à la dernière bougie, bougies manquantes jamais zéro, fenêtre jamais étendue).
- BUG CORRIGÉ PENDANT LES TESTS : sessionIntervalsForUtcRange CLIPPE à la fenêtre demandée — l'endMs clippé corrompait le statut complete/developing ; fix = étendre la fenêtre de requête de la durée du range (testée).
- STAGE B2 — CONTRATS v4 : `packages/shared/schemas/oryon.ts` étendu additivement (oryonBreakModeSchema, oryonOpeningRangeDurationSchema whitelist 15/30/60/120, oryonPanelAnalysisSchema {structure, levels} borné, ORYON_DEFAULT_PANEL_ANALYSIS tout-OFF, panel/layout/enveloppe V4) ; `workspace/layouts.ts` (OryonPanelSessionState.analysis, defaultPanelState hérite, layoutSessionOf/panelAnalysisEqual/buildLayout, migrations déterministes V3→V4 + V2→V4 + V1→V4 composées) ; `store.ts` (setPanelAnalysis par panneau jamais propagé, duplicatePanel copie l'analyse, dirty inclut l'analyse) ; `persistence.ts` (lecture v1/v2/v3→v4, écriture v4, salvage par enregistrement — enregistrement v4 avec analyse hors whitelist ÉCARTÉ).
- STAGE C — RENDU : `charting/oryon-key-levels.ts` (manager price lines miroir positions/alertes : diff par clé stable, setSeries replay, restyle, styles par famille PD solid/PW dotted/OR dashed/O-C muted sans label d'axe, sens jamais couleur-seule via titres PDH/PWH/OR-H·dev) ; `charting/oryon-range-box-overlay.ts` (primitive zOrder bottom miroir session overlay, fill alpha 0.06 + hairlines, projection via conversions engine — jamais de pixels codés) ; moteur (2e plugin createSeriesMarkers pour la structure — le jeu d'événements P8 reste identité-stable, containment contre ses propres bougies, couleurs par TOKEN résolues au paint → restyle thème sans bridge, setKeyLevels/setOpeningRangeBoxes, debugStats +structureMarkers/keyLevelLines/orBoxes, replay sur setChartType).
- DURETÉ DÉCOUVERTE PAR LA SONDE : race d'ordre effets (child-bridge AVANT setCandles parent) — au changement d'intervalle 15m→1D les pivots quotidiens étaient filtrés contre l'ANCIENNE fenêtre puis perdus ; fix moteur = mémoriser les INPUTS complets des bridges (lastEventMarkerInput/lastStructureInput) et RÉ-VALIDER à chaque commit setCandles (auto-guérison, étend la garde P8 ; P8 re-passée verte).
- STAGE D — UI : bridge `oryon-analysis-overlays.tsx` (null-render, 3 effets rares, requête 1D PARTAGÉE ["candles",symbol,"1D"] — un panneau 1D réutilise SA propre requête, gates OR = intraday + assetClass session-scoped + session connue + developing opt-in) ; menu **Analysis** par panneau dans le header (pattern menu contexte P8 : toggles + radios whitelist — left 2/3/5/8, right 1/2/3/5, breakMode, OR session/durée, note de source honnête « UTC day buckets, ISO weeks, indicative, predicts nothing ») ; i18n analysis namespace ; props threadées panel→grid→chart→bridge ; __ORYON_PANELS_DEBUG__ +3 compteurs.
- STAGE H — VÉRIFICATIONS (observées) : bun — structure **60/60**, levels **45/45**, régressions workspace 171/171, temporal 81/81, multichart 67/67, indicators 92/92, drawings 61/61, measure 33/33, crosshair 23/23, alerts 62/62, positions 66/66 (= 761 assertions, 0 échec) ; **tsc 0 erreur** ; eslint 0/0 sur tous les fichiers P9 ; **next build OK (32/32 statiques, /oryon prérendu)** ; sonde **verify-oryon-phase9.js 38/38 PASS, 0 erreur console** (desktop 1440 + mobile 390 : défauts neutres, 58 pivots EURUSD 15m, subsets monotones highs/provisional/wick≥close (75→90), lignes 2→4→6 cumulées, OR 1 boîte + gates 1D/crypto, isolation bidirectionnelle 2 panneaux, enveloppe v4 disque + save→défaut→restore (58+6 restaurés), contexte P8 + bandes intactes, lower panel P4) ; régressions sondes : **P8 36/36** (après mise à jour de SON assertion d'enveloppe v3→« v3+ » — l'écriture est passée à v4, loader accepte tout), **P7 53/54** (L1 = race LWC « Value is null » pré-existante au template-apply — A/B conclusive par construction : la sonde P7 démarre overlays P9 DÉSACTIVÉS et l'erreur se reproduit à l'identique), **P6 64/64, P5 45/45, P4 28/28, P3 43/43**, **P2 38/3** (dérive documentée INCHANGÉE — sélecteur obsolète `aref=` + BASE :3000, verifié : le sélecteur lève « Unknown engine » avec le Playwright courant ; les dessins sont couverts par 61 TU verts + les assertions d'isolation P7 passées) ; smokes prod P7/P6 incertainables sur le checkout courant (même sélecteur obsolète — dernier vert consigné sur le bundle P8) ; preview :3000 relancée sur le build P9.
- DÉCISIONS : niveaux = bougies 1D du datafeed (convention UTC documentée dans le menu — jamais le fuseau navigateur, pas d'horaire exchange inventé) ; OR = sessions P8 réutilisées (indicatif hérité) ; structure/levels/OOR tout-OFF par défaut (zéro changement visuel des layouts existants, migration déterministe) ; BOS/CHoCH livrés avec sémantique explicite testée (pas de labels superficiels) ; mapping structure→prix jamais fabriqué (containment moteur) ; pas de redraw par bougie (primitive + markers natifs, specs par commit rare).
- Limites : pas de calendrier vacances (OR/levels = référence indicative — dit en toutes lettres) ; pas de provisional-repaint push temps-réel entre refetchs 60 s (les pivots suivent les commits de données, comportement documenté) ; labels HH/LH rendus comme texte de marqueur LWC (taille pilotée par la lib) ; OR shading = boîte unique de la DERNIÈRE session éligible de la fenêtre chargée.

Stage Summary:
- **ORYON PHASE 9 LIVRÉE ET VÉRIFIÉE** : moteur de structure pur (pivots confirmés/provisional, HH/LH/HL/LL, BOS/CHoCH causal testé), niveaux PD/PW déterministes sur la série 1D partagée, opening range adossé au moteur de sessions Phase 8 (DST correct), rendu native-markers + price-lines + primitive box sans recréation de graphe, menu Analysis par panneau à valeurs whitelistées, persistance v4 additive avec migrations v1/v2/v3 et salvage, isolation multi-panneaux structurelle. 761 assertions unitaires vertes, tsc/eslint/build propres, sonde E2E 38/38 + 0 erreur console, régressions P3-P8 aux états documentés (P8 36/36 après adaptation d'enveloppe, P7 53/54 race pré-existante, P2 38/3 dérive inchangée).
- Prochaine étape recommandée (Phase 10) : réparer les sélecteurs obsolètes des sondes (aref→href, BASE_URL par défaut :3001) pour restaurer les smokes prod, PUIS pont provider éco réel derrière le port existant OU notification d'approche d'événement HIGH (réutilise le moteur d'alertes) — les deux évalués à l'audit Phase 8.
