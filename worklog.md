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
