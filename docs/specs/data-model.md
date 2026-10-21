1. Design principles (non-negotiable)
Decimal everywhere, never float. Money/prices = numeric(18,8).
All timestamps UTC. User timezone lives on User. A computedtradingDate (the user's local trading day) is stored per trade — withoutit, "per day" stats are wrong for anyone trading across midnight.
Snapshot live references. Trades freeze the checklist answers (JSONB).If the template changes tomorrow, history stays true.
Lightweight event sourcing on trades. Every sensitive mutation (SL, TP,size) is logged in TradeEvent. This is the ONLY way to detect"stop widened" — final state doesn't tell the story.
Seeded catalogs vs free data. Mistakes and emotions = system catalogs(extensible). Tags = free, hierarchical, user-owned.
Import idempotence from day 1. Unique externalRef per account —re-importing the same CSV adds zero duplicates.
2. Enums
Theme          DARK_BLUE | DARK | LIGHTCurrency       USD | EUR | GBP | CHF | CAD | AUD | JPY | NZD | SGDAccountType    DEMO | LIVE | PROP_FIRMBroker         MANUAL | MT4 | MT5 | DERIV | BINANCE | CTRADER | OTHERAssetClass     FOREX | CRYPTO | SYNTHETIC | INDEX | METAL | ENERGYConnectionStatus CONNECTED | DISCONNECTED | ERROR | SYNCINGImportStatus   PENDING | PROCESSING | COMPLETED | FAILEDTradeStatus    PLANNED | OPEN | CLOSED | CANCELLEDDirection      BUY | SELLExitReason     TP | SL | MANUAL | TRAILING | PARTIAL | MARGINEmotion        CALM | CONFIDENT | ANXIOUS | FOMO | TIRED | FRUSTRATED |               REVENGE | EUPHORIC | RELIEVED | BOREDGrade          A | B | C | D | FTradeEventType SL_MODIFIED | TP_MODIFIED | SIZE_MODIFIED | REOPENED | NOTEEventSource    USER | AUTO | IMPORTShotKind       BEFORE | AFTER | CHART | OTHERStrategyGrade  A_PLUS | A | B | CStrategyStatus DRAFT | ACTIVE | PAUSED | RETIREDTagCategory    SETUP | CONTEXT | MISTAKE | EMOTION | CUSTOMMistakeCategory ENTRY | EXIT | MANAGEMENT | BEHAVIORDetector       AUTO | MANUALSkipReason     DISCIPLINE | FEAR | OUT_OF_PLAYBOOK | NO_SETUP | MISSED_EXECUTIONOutcome        WOULD_HAVE_WON | WOULD_HAVE_LOST | UNKNOWNRuleType       MAX_TRADES_PER_DAY | MAX_LOSSES_PER_DAY | MAX_RISK_PCT_PER_TRADE |               MAX_DAILY_LOSS_PCT | MAX_DAILY_RISK_R | MIN_RR |               COOLDOWN_AFTER_LOSSES | TRADING_WINDOW | MAX_OPEN_POSITIONS |               NO_NEWS_WINDOWSeverity       NOTIFY | WARN | ALERT | LOCKAlertType      RULE_VIOLATION | TILT_WARNING | RISK_BUDGET | STRATEGY_DECAY |               STREAK | DISCIPLINE_WIN | SYSTEMPeriod         DAILY | WEEKLY | MONTHLY | QUARTERLY | YEARLYGoalMetric     R_EARNED | PNL_NET | DISCIPLINE_SCORE | FOLLOW_PLAN_PCT |               TRADES_COUNT | MISTAKES_COUNT | WIN_RATE | MAX_DRAWDOWNGoalDirection  MINIMIZE | MAXIMIZEGoalStatus     ACTIVE | ACHIEVED | MISSED | ARCHIVEDInsightKind    WEEKLY_SUMMARY | PRE_MORTEM | ERROR_ANALYSIS | SUGGESTIONFeedback       HELPFUL | NOT_HELPFUL



Domaine 1 — Identité & Sécurité

model User {
  id             String    @id @default(uuid())
  email          String    @unique
  passwordHash   String    // argon2id
  name           String?
  baseCurrency   Currency  @default(USD)
  timezone       String    @default("Europe/Paris")
  theme          Theme     @default(DARK_BLUE)  // ton défaut ✓
  weekStartsOn   Int       @default(1)           // lundi
  emailVerifiedAt DateTime?
  createdAt      DateTime  @default(now())
  deletedAt      DateTime?                       // soft-delete RGPD
}

model Session {
  id                String    @id @default(uuid())
  userId            String
  refreshTokenHash  String    @unique            // hashé, jamais le token brut
  userAgent         String?
  ip                String?
  expiresAt         DateTime                      // rotation 30j
  revokedAt         DateTime?                     // détection réutilisation
  replacedById      String?                       // chaîne de rotation
}

model AuditLog {
  id        String   @id @default(uuid())
  userId    String?
  action    String   // "LOGIN_SUCCESS", "PASSWORD_CHANGED", "TRADE_DELETED"...
  entity    String   // "trade", "session"...
  entityId  String?
  meta      Json?
  ip        String?
  createdAt DateTime @default(now())
}

Domaine 2 — Comptes, Marchés & Imports

model Account {
  id              String     @id @default(uuid())
  userId          String
  name            String     // "Deriv Live", "FTMO Challenge 2"
  type            AccountType @default(LIVE)     // DEMO | LIVE | PROP_FIRM
  broker          Broker     @default(MANUAL)    // MANUAL | MT4 | MT5 | DERIV | BINANCE | CTRADER
  currency        Currency   @default(USD)
  startingBalance Decimal
  isDefault       Boolean    @default(false)
  // Mode Prop Firm : les règles du challenge vivent ici, pas dans une table dédiée
  propConfig      Json?      // { firm, maxDailyLossPct, maxTotalDd, profitTarget, minTradingDays }
  createdAt       DateTime   @default(now())
}

model Instrument {
  id            String      @id @default(uuid())
  symbol        String      @unique  // "EURUSD", "VOL75(1s)", "BOOM500", "BTCUSDT"
  name          String
  assetClass    AssetClass             // FOREX | CRYPTO | SYNTHETIC | INDEX | METAL | ENERGY
  quoteCurrency Currency
  pipSize       Decimal                // 0.0001 forex, 1.0 pour Boom/Crash
  digits        Int
  contractSize  Decimal     @default(1)
  isActive      Boolean     @default(true)
}
// ⚠️ Indices synthétiques : taille de position ≠ lots forex.
// On stocke les specs par instrument, jamais de constantes dans le code.

model BrokerConnection {
  id                  String   @id @default(uuid())
  userId              String
  accountId           String
  provider            Broker
  credentialsEncrypted String  // AES-GCM, clé en env
  status              ConnectionStatus @default(DISCONNECTED)
  lastSyncAt          DateTime?
}

model ImportBatch {
  id            String   @id @default(uuid())
  userId        String
  accountId     String
  source        String   // "CSV_MT5", "DERIV_API", "BINANCE_API"
  filename      String?
  status        ImportStatus @default(PENDING)  // PENDING → PROCESSING → COMPLETED/FAILED
  rowsTotal     Int      @default(0)
  rowsImported  Int      @default(0)
  rowsSkipped   Int      @default(0)   // doublons détectés = normal, pas des erreurs
  errorLog      Json?
  createdAt     DateTime @default(now())
}

Domaine 3 — Trades (le cœur)

model Trade {
  id             String    @id @default(uuid())
  userId         String
  accountId      String
  instrumentId   String
  strategyId     String?   // null = trade hors playbook (précieux à tracker !)

  status         TradeStatus @default(OPEN)   // PLANNED | OPEN | CLOSED | CANCELLED
  direction      Direction                    // BUY | SELL

  // ── LE PLAN (ce qui était décidé AVANT) ──
  entryPrice     Decimal
  entryAt        DateTime                     // UTC
  quantity       Decimal
  initialStop    Decimal?                      // SL planifié
  initialTP      Decimal?                      // TP planifié
  plannedRR      Decimal?                      // R:R planifié
  riskAmount     Decimal?                      // $ risqué au départ

  // ── LA RÉALITÉ (ce qui s'est passé) ──
  finalStop      Decimal?                      // SL au moment de la sortie (≠ initial → stop déplacé)
  exitPrice      Decimal?                      // null tant qu'ouvert
  exitAt         DateTime?
  exitReason     ExitReason?                   // TP | SL | MANUAL | TRAILING | PARTIAL | MARGIN
  fees           Decimal   @default(0)
  swap           Decimal   @default(0)

  // ── RÉSULTATS (calculés serveur à la fermeture, stockés pour la perf) ──
  pnlGross       Decimal?                      // devise du compte
  pnlNet         Decimal?
  rMultiple      Decimal?                      // LA métrique du trader
  mfePrice       Decimal?                      // Maximum Favorable Excursion
  maePrice       Decimal?                      // Maximum Adverse Excursion
  mfeR           Decimal?                      // excursions converties en R
  maeR           Decimal?

  // ── PSYCHOLOGIE (friction minimale : 1 tap) ──
  emotionBefore  Emotion?                      // CALM | CONFIDENT | ANXIOUS | FOMO | TIRED | FRUSTRATED | REVENGE...
  emotionAfter   Emotion?
  confidence     Int?                          // 1–5

  // ── TIER 1 : DECISION SCORE ──
  decisionGrade  Grade?                        // A | B | C | D | F — saisi AVANT de voir le résultat

  // ── DISCIPLINE ──
  followedPlan   Boolean?                      // self-report (le ressenti)
  checklistSnap  Json?                         // réponses figées au moment du trade

  // ── CONTEXTE ──
  notes          String?
  lessons        String?                       // "qu'est-ce que j'apprends ?"
  tradingDate    Date                          // jour de trading (calculé via timezone user)
  externalRef    String?                       // ID du trade chez le broker → idempotence

  importBatchId  String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?                     // soft-delete (undo possible)

  @@index([userId, tradingDate])
  @@index([userId, status])
  @@index([strategyId])
}

// Sorties partielles : optionnelles. Trade simple → exitPrice directement sur Trade.
model TradeExit {
  id        String    @id @default(uuid())
  tradeId   String
  price     Decimal
  quantity  Decimal
  exitedAt  DateTime
  reason    ExitReason
  note      String?
}

// ⭐ Event sourcing léger : LA condition pour détecter "stop élargi"
model TradeEvent {
  id        String   @id @default(uuid())
  tradeId   String
  type      TradeEventType  // SL_MODIFIED | TP_MODIFIED | SIZE_MODIFIED | REOPENED | NOTE
  payload   Json            // { from: 1.0850, to: 1.0800 }
  source    EventSource     // USER | AUTO | IMPORT
  createdAt DateTime @default(now())
}

model TradeScreenshot {
  id        String   @id @default(uuid())
  tradeId   String
  kind      ShotKind          // BEFORE | AFTER | CHART | OTHER
  storageKey String           // MinIO
  caption   String?
  annotations Json?           // flèches, zones — dessinées par l'utilisateur
  createdAt DateTime @default(now())
}

Domaine 4 — Playbook, Tags & Taxonomie d'erreurs

model Strategy {
  id          String   @id @default(uuid())
  userId      String
  name        String                          // "Breakout BOOM500 NY open"
  description String?
  entryRules  String?                         // markdown
  exitRules   String?
  riskRules   String?
  grade       StrategyGrade?                  // A_PLUS | A | B | C   ← setup et stratégie fusionnés
  status      StrategyStatus @default(ACTIVE) // DRAFT | ACTIVE | PAUSED | RETIRED
  color       String?
  createdAt   DateTime @default(now())
  // V2 : strategy_versions (le playbook évolue, l'historique doit rester vrai)
}

model Tag {
  id        String  @id @default(uuid())
  userId    String
  name      String
  category  TagCategory             // SETUP | CONTEXT | MISTAKE | EMOTION | CUSTOM
  color     String?
  parentId  String?                 // hiérarchie
  @@unique([userId, name, category])
}

model TradeTag {
  tradeId String
  tagId   String
  @@id([tradeId, tagId])
}

// ⭐ TIER 1 : Taxonomie d'erreurs — catalog seedé + erreurs custom
model Mistake {
  id             String  @id @default(uuid())
  key            String  @unique              // "moved_stop", "revenge_trade", "oversized"...
  category       MistakeCategory              // ENTRY | EXIT | MANAGEMENT | BEHAVIOR
  label          String                       // "Stop déplacé contre soi"
  description    String?
  severity       Int      @default(3)         // 1–5
  isSystem       Boolean  @default(true)
  userId         String?                      // null = système ; sinon erreur custom
  detectionHint  Json?                        // détection auto paramétrable
}

model TradeMistake {
  id           String   @id @default(uuid())
  tradeId      String
  mistakeId    String
  detectedBy   Detector             // AUTO | MANUAL
  userConfirmed Boolean?            // l'utilisateur valide/conteste la détection auto
  note         String?
  createdAt    DateTime @default(now())
  @@unique([tradeId, mistakeId])
}

Domaine 5 — ⭐ Ghost Trades (le Registre des Regrets)

model SkippedTrade {
  id            String   @id @default(uuid())
  userId        String
  instrumentId  String
  strategyId    String?
  direction     Direction?             // ce que tu aurais tradé
  seenAt        DateTime               // moment de l'observation
  reason        SkipReason             // DISCIPLINE | FEAR | OUT_OF_PLAYBOOK | NO_SETUP | MISSED_EXECUTION
  outcomeGuess  Outcome?               // WOULD_HAVE_WON | WOULD_HAVE_LOST | UNKNOWN
  hypotheticalR Decimal?              // R estimé si évalué
  notes         String?
  createdAt     DateTime @default(now())
}

Domaine 6 — Journal quotidien & Checklists

model DailyJournal {
  id          String   @id @default(uuid())
  userId      String
  date        Date
  // Pre-market (colonnes queryables → corrélations possibles)
  sleepHours  Decimal?
  energy      Int?                    // 1–5
  focus       Int?                    // 1–5
  moodPre     Emotion?
  planText    String?                 // intentions, niveaux à surveiller
  // Post-market
  moodPost    Emotion?
  reviewText  String?
  lessons     String?
  bestTradeId String?                 // auto-suggéré
  worstTradeId String?
  @@unique([userId, date])
}

model ChecklistTemplate {
  id        String  @id @default(uuid())
  userId    String
  name      String
  items     Json             // [{ key, label, required: true }] — les RÉPONSES vont dans Trade.checklistSnap
  isDefault Boolean @default(false)
}

Domaine 7 — Discipline Engine, Violations & Alertes

model Rule {
  id          String    @id @default(uuid())
  userId      String
  type        RuleType   // MAX_TRADES_PER_DAY | MAX_LOSSES_PER_DAY | MAX_RISK_PCT_PER_TRADE |
                         // MAX_DAILY_LOSS_PCT | MAX_DAILY_RISK_R | MIN_RR | COOLDOWN_AFTER_LOSSES |
                         // TRADING_WINDOW | MAX_OPEN_POSITIONS | NO_NEWS_WINDOW
  params      Json       // { limit: 3 } / { minutes: 30 } — générique = extensible
  severity    Severity   @default(WARN)   // NOTIFY | WARN | ALERT | LOCK
  accountId   String?    // null = global ; sinon lié au compte prop
  isActive    Boolean    @default(true)
  createdAt   DateTime   @default(now())
}

model RuleViolation {
  id             String    @id @default(uuid())
  ruleId         String
  userId         String
  tradeId        String?   // nullable : "3 pertes" n'est pas 1 trade
  occurredAt     DateTime
  context        Json      // { tradesToday: 4, limit: 3 } ← le pourquoi, figé
  acknowledgedAt DateTime?
  userNote       String?
}

model Alert {
  id          String    @id @default(uuid())
  userId      String
  type        AlertType  // RULE_VIOLATION | TILT_WARNING | RISK_BUDGET | STRATEGY_DECAY |
                         // STREAK | DISCIPLINE_WIN | SYSTEM
  severity    Severity
  title       String
  message     String
  payload     Json?
  tradeId     String?
  readAt      DateTime?
  dismissedAt DateTime?
  createdAt   DateTime   @default(now())
}

Domaine 8 — Objectifs, Stats journalières & Insights IA

model Goal {
  id           String    @id @default(uuid())
  userId       String
  period       Period              // DAILY | WEEKLY | MONTHLY | QUARTERLY | YEARLY
  metric       GoalMetric          // R_EARNED | PNl_NET | DISCIPLINE_SCORE | FOLLOW_PLAN_PCT |
                                   // TRADES_COUNT | MISTAKES_COUNT | WIN_RATE | MAX_DRAWDOWN
  direction    Direction           // MIN vs MAX (réduire les erreurs = un objectif)
  targetValue  Decimal
  startDate    Date
  endDate      Date?
  status       GoalStatus @default(ACTIVE)

  // 👆 Orientes les goals vers le PROCESS autant que le P&L —
  // un objectif "discipline score > 80" est plus sain que "+20% ce mois"
}

// Table CALCULÉE par job nocturne. Exception au principe "ne jamais stocker du calculé" :
// c'est le carburant des heatmaps, pre-mortems, coach IA et goals — et ça évite
// de recalculer des agrégats à chaque affichage.

model DailyStat {
  id               String  @id @default(uuid())
  userId           String
  date             Date
  tradesCount      Int
  winsCount        Int
  lossesCount      Int
  pnlNet           Decimal
  rEarned          Decimal
  disciplineScore  Decimal?    // ⭐ Index Cosmoz : conformité plan, violations, checklist, régularité
  mistakesCount    Int
  violationsCount  Int
  ghostTradesCount Int
  savedR           Decimal?    // Discipline Saved (ghost trades qui auraient perdu)
  hesitatedR       Decimal?    // Hesitation Cost (ghost trades qui auraient gagné)
  sleepHours       Decimal?    // dénormalisé du journal → corrélation 1 requête
  moodPre          Emotion?
  @@unique([userId, date])
}

model AiInsight {
  id          String   @id @default(uuid())
  userId      String
  kind        InsightKind   // WEEKLY_SUMMARY | PRE_MORTEM | ERROR_ANALYSIS | SUGGESTION
  periodStart Date
  periodEnd   Date
  payload     Json          // constats structurés + recommandation
  model       String
  userFeedback Feedback?    // HELPFUL | NOT — pour améliorer les prompts
  generatedAt DateTime @default(now())
}

🔗 Diagramme des relations

User ─┬─ Session, AuditLog
      ├─ Account ─┬─ BrokerConnection, ImportBatch
      │           └─ Trade*─┬─ TradeExit*
      │                      ├─ TradeEvent*(SL déplacé, etc.)
      │                      ├─ TradeScreenshot*
      │                      ├─ TradeTag*─ Tag
      │                      ├─ TradeMistake* ─ Mistake   (catalog)
      │                      └─ Strategy*(null = hors playbook)
      ├─ Instrument (réf. partagée Trade + SkippedTrade)
      ├─ SkippedTrade* ──(corrélation analytique)── Trade
      ├─ DailyJournal*(1/jour), ChecklistTemplate*
      ├─ Rule*── RuleViolation* ── Alert*
      ├─ Goal*, AiInsight*
      └─ DailyStat* (job nocturne — jamais saisi à la main)


Tier-1 feature wiring
Feature	Lives in	Computation
Ghost Trades	skipped_trades	Discipline Saved = Σ|hypotheticalR| of WOULD_HAVE_LOST · Hesitation Cost = Σ of WOULD_HAVE_WON · Fear Index = FEAR/(FEAR+DISCIPLINE). Crossed with trades per (instrument, strategy) to tell justified fear from paralysis
Decision Score	trades.decisionGrade	Grade × outcome matrix: "A decisions: +0.8R/trade, C: −0.35R". Virtual equity curve "A/B only". Grade submitted BEFORE seeing P&L (API-enforced)
Mistake taxonomy	mistakes + trade_mistakes + trade_events + rules	Auto-detection service: stop widened = finalStop ≠ initialStop + events; revenge = next trade < X min after a loss with size ↑; overtrading = rules. Each detection writes TradeMistake(detectedBy: AUTO), user confirms/contests
Discipline Engine	rules + rule_violations + alerts	Evaluated on every trade mutation (event-driven) + cron (risk budget, tilt, cooldowns). Context JSONB freezes values at time T
Pre-Mortem AI	ai_insights + daily_stats	LLM receives daily_stats + patterns (weekday, news, streaks) → morning briefing. Cached in table, no API call per render
What-If Simulator	queries over trades	Filters + re-aggregation of rMultiple. No dedicated table — this replaces backtesting
Cosmoz Index	daily_stats.disciplineScore	Composite: % followedPlan, violations, checklist completion, journaling consistency. Decoupled from P&L on purpose
13. Where logic lives
P&L / R / MFE computations → Nest service at WRITE time. Never SQLtriggers, never client-side. Single source of truth, testable.
Mistake detection → service + cron, writes to tables (the V3 analytics AIreads these tables, not raw trades).
daily_stats → nightly job (BullMQ later, plain cron first).
V1: on-the-fly analytics is fine (< 10k trades per user). Materialize onlyif it hurts.
14. Migration order
Users, Sessions, AuditLogs (foundation + custom auth)
Accounts, Instruments, Trades, TradeExits, TradeEvents, TradeScreenshots
Strategies, Tags, Mistakes, TradeMistakes
DailyJournals, ChecklistTemplates
Rules, RuleViolations, Alerts
SkippedTrades, Goals, DailyStats
BrokerConnections, ImportBatches (externalRef already exists — no pain)
AiInsights
15. Security invariants
Never trust a client-sent pnl / rMultiple / MFE — everything isrecomputed server-side.
Never trust a client-sent userId — always extracted from the token.
Every Prisma query on trading data is scoped by session userId. IDOR test:accessing another user's trade by id must return 403.
Catalog seeding (mistakes, instruments forex/crypto/synthetic) is part ofmigration tooling — never hand-inserted.
