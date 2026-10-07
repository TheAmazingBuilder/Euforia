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
