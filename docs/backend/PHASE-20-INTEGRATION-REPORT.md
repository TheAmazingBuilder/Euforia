# COSMOZ — BACKEND PHASE 20 — Rapport final

## Cross-Domain Integration, Domain Events & Workflow Orchestration

**Phase :** 20
**Statut :** TERMINÉE AVEC LIMITES DE PÉRIMÈTRE — intégration vérifiée et corrigée sur les six contextes réellement implémentés ; dix contextes référencés par le prompt n'existent pas côté serveur (phases 4–15 jamais reçues/implémentées). Aucun nouveau domaine créé (§62 respecté).

---

## Repository audit (§3 — obligatoire, préalable à tout changement)

- **Modules NestJS présents** (`apps/api/src/modules/`) : `identity`, `accounts`, `security` (SecurityModule + SecurityEventModule), `monitoring`, `calculators`, `ocr`. Infrastructure : config, logging (pino), prisma, rate-limit, health, telemetry ring, request-id.
- **Tables Prisma réelles** : Identity (User, Session, SecurityEvent, LoginRecord, AuthChallenge, RecoveryCode, ApiKey), Accounts (TradingAccount, TradingConnection, TradingAccountSnapshot, TradingPosition, TradingOrder, TradingDeal, TradingSyncRun), Monitoring (MonitoringSetting), OCR (OcrAsset, OcrRecognition). Aucune table Trade/Strategy/Review/Calendar/Academy/Nofy.
- **Événements de domaine** : aucun bus, aucun outbox, aucun `@OnEvent` — l'infrastructure d'événements n'existe pas ; seul le registre append-only `SecurityEvent` (port d'écriture partagé) joue un rôle d'audit, pas de réactivité.
- **WebSocket gateways** : aucun côté API (le temps réel frontend est simulé par MSW côté web).
- **Communication FastAPI** : exclusivement le moteur OCR via le port `OCR_ENGINE` (sidecar → mock → indisponible explicite).
- **Graphe de dépendances réel** (dérivé du code, pas du dessein) :
  - `Accounts → Identity, SecurityEventModule`
  - `Security (center) → Identity, SecurityEventModule`
  - `Monitoring → Accounts, Identity, SecurityEventModule`
  - `Identity → SecurityEventModule`
  - `OCR → SecurityEventModule`
  - `Calculators → (aucun module — pur Request → Result)`
- **Vérification statique** : `madge --circular` sur 124 fichiers source → **0 dépendance circulaire** (§60).
- **Frontend** (`apps/web`) : surface API canonique dans `lib/api/endpoints.ts` (~90 familles d'endpoints) dont la grande majorité est servie par les handlers MSW (trades, playbook, reviews, stats, session-live, academy, nofy, eco, integrations, discipline…). La tranche réellement branchée sur le backend NestJS : auth/me, accounts/broker, security, monitoring, calculators (via contrats partagés construits contrat-d'abord à chaque phase).

## Bounded contexts reviewed (§5)

| Domaine | État serveur | Propriété vérifiée |
| --- | --- | --- |
| Identity / Authentication | **Implémenté** (Ph. 2/16) | Users, sessions, MFA, challenges, recovery codes, API keys |
| Accounts / Trading Connectivity | **Implémenté** (Ph. 3) | Comptes externes, connexions, snapshots, positions, ordres, deals, sync runs |
| Security | **Implémenté** (Ph. 16) | Ledger append-only, LoginRecord, posture/activity/visibility |
| Monitoring | **Implémenté** (Ph. 17) | MonitoringSetting uniquement ; le reste est dérivé à la lecture |
| Calculators | **Implémenté** (Ph. 18) | Zéro persistance — calculs déterministes purs |
| OCR | **Implémenté** (Ph. 19) | OcrAsset + OcrRecognition ; ne touche jamais une table Trade |
| Trading Core, Trade Planner, Trade Review, Playbook, Analytics, Session Live, Academy, Nofy, Calendar, Integrations, Settings | **Non implémentés** (phases 4–15 jamais reçues) | — |

Aucun domaine ne s'approprie silencieusement les données d'un autre — la règle est désormais appliquée au niveau du code, pas seulement des commentaires (voir ADR-0003).

## Cross-domain workflows implemented (§7/§36/§56)

Vérifiés et corrigés (interactions réellement existantes, toutes synchrones) :

1. **Accounts → Identity** : validation utilisateur + contexte d'audit via `IdentityRepository` (contrat exporté).
2. **Accounts → Security** : faits de sécurité (connect/disconnect/failure) via le port `SecurityEventService` — jamais de second système d'audit.
3. **Identity → Security** : événements d'auth + historique de connexions via `SecurityEventService` ; la branche d'échec MFA a été réacheminée par le port (correction Ph. 20, voir plus bas).
4. **Security (center) → Identity** : orchestration des capacités d'identité (re-auth, MFA, sessions) sans réimplémentation — modèle de responsabilité de la Phase 16 conservé.
5. **Monitoring → Accounts/Identity/Security** : santé de synchro, télémétrie d'emails, comptages d'entités — **désormais exclusivement via contrats propriétaires** (`AccountsRepository`, `MailerService`, `IdentityRepository.countUserEntities`, `SecurityEventRepository.countUserEntities`).
6. **OCR → Security** : événements OCR via le port partagé ; idempotence `(userId, idempotencyKey)` ; confirmation humaine obligatoire avant tout usage.

Workflows A–G du §56 (Trade Planning → Trade Creation → Review → Analytics → OCR→Trade → Session Live → Calendar) : **non vérifiables** — leurs domaines n'existent pas côté serveur. Aucun fake, aucune table fantôme n'a été créée pour « faire passer » ces critères.

## Events introduced/updated (§8–§14)

- **Aucun événement de domaine introduit** — décision justifiée : zéro consommateur réel existe aujourd'hui (tout besoin cross-domain actuel est une requête synchrone) ; §8 « only implement events actually required by real workflows », §13 « prefer the simplest mechanism », §7 pas d'architecture événementielle pour la sophistication.
- Le ledger `SecurityEvent` n'est **pas** un bus : append-only, catalogue fermé, jamais consommé pour la réactivité.
- Stratégie documentée dans **ADR-0002** (in-process d'abord, outbox seulement si exigence de fiabilité démontrée ; catalogue de noms §8 conservé comme convention).

## Contracts (§38/§40/§41)

- **Ajouts** : `countUserEntities(userId)` sur `IdentityRepository` (`{sessions, apiKeys}`), `SecurityEventRepository` (`{securityEvents, loginRecords}`), `AccountsRepository` (`{accounts, positions, orders, deals, syncRuns}`) — contrats de lecture étroits, nommage uniforme, propriété claire.
- **Nettoyage** : suppression des 5 méthodes security-owned héritées de `IdentityRepository` (4 mortes + 1 réacheminée par le port).
- **Surface exportée** : chaque module n'exporte que ce qui est consommé ; aucun module entier n'est exposé.
- **`@cosmoz/shared` (§41)** : schémas utilisés par l'API = `api`, `auth`, `security`, `monitoring`, `trading-account`, `broker`, `account`, `instrument`, `ocr`, `calculators` (sous-ensemble stable) ; les schémas des domaines non implémentés (trade, playbook, academy, nofy, eco-event…) servent aujourd'hui le contrat UI↔MSW et resteront les contrats cross-boundary quand leurs phases arriveront. Aucune logique de domaine dans shared. Pas de DTO dupliqué pour une même frontière.
- **Cohérence API (§40)** : enveloppe d'erreur unifiée (`error-mapper`), validation Zod systématique, IDs UUID, timestamps ISO-8601 UTC, pagination keyset sur le ledger — conventions existantes réutilisées, aucune refonte.

## Orchestrators (§36/§37)

- **Aucun orchestrateur ajouté** — aucun workflow multi-domaines réel ne le justifie encore. Pas de « God orchestrator » : la règle §37 est respectée par l'abstention, pas par la construction.

## Database changes (§59/§62)

- **Aucun changement de schéma.** Aucune nouvelle table, aucune migration. Les 5 migrations existantes (identity_auth, session_previous_hash, accounts_connectivity, ocr_screenshot_recognition, monitoring_settings) s'appliquent proprement (`prisma migrate deploy` : « Database schema is up to date »).
- **Contrôles d'intégrité §59 exécutés** sur la base de test peuplée par les e2e (script `scripts/phase20-db-integrity.mjs`, lecture seule) : **21/21 OK** — orphelins (sessions, security events, login records, comptes, connexions, snapshots, positions, ordres, deals, sync runs, assets OCR, reconnaissances, monitoring settings), doublons (idempotence OCR, checksum assets, identité provider), statuts invalides, syncs RUNNING concurrentes. Aucune logique de réparation nécessaire, aucune ajoutée.

## Security (§28/§51/§52/§57)

- Frontière security centralisée : révocation de sessions, MFA, re-auth et hachage restent propriété d'Identity ; le center orchestre. Aucun domaine ne contourne la frontière d'un autre.
- Tests IDOR existants (User A → User B sur comptes, sessions, MFA, OCR, monitoring) : **passants** (suites e2e `security-negative`, `security-capability-negative`, `accounts`, `ocr-negative`).
- Vérification runtime : `/health/live` OK, `/health/ready` → `database: up`, endpoints protégés → **401** sans token.
- Payloads d'événements : contexte sanitisé, jamais de secret — les e2e existants filtrent explicitement les credentials dans `SecurityEvent.context` (y compris le motif `fail-invalid` du provider).
- Aucun secret dans les payloads cross-domain : les entrées `SecurityEvent`/`LoginRecord`/`TradingSyncRun`/`OcrRecognition` portent des références et des catégories, jamais du matériel sensible.

## Failure handling (§32/§33/§34/§43/§48)

- Transactions courtes vérifiées (6 usages, tous dans les repositories, aucun appel externe sous transaction ouverte) — la suppression OCR purge le binaire **après** commit (§50) ; la confirmation OCR verrouille `REVIEW_REQUIRED → CONFIRMED` en une transaction gardée (double confirmation impossible).
- Idempotence : OCR par `(userId, idempotencyKey)` ; upserts provider par identité externe stable ; au plus un `RUNNING` par compte (index partiel) ; comptages Monitoring résilients (échec de count ≠ échec d'overview).
- Retry borné : OCR `attempt` borné + timeouts engine mappés vers des catégories d'échec explicites (`OCR_UNAVAILABLE`, `PROCESSING_TIMEOUT` — e2e dédiés) ; provider adapter avec timeout par appel.
- Cache : aucun cache à invalider (§48 — « do not introduce caching where none is necessary ») ; le statut « cache layer (none in this build) » est affiché honnêtement dans l'overview Monitoring.

## Tests (§55/§57)

- **310/310 tests passants (22 fichiers)** après les corrections Ph. 20 : unitaires (logique monitoring/OCR, mapping d'erreurs, AES-GCM, schémas d'env, contrats partagés, provider mock, statuts de synchro, request-id) + e2e HTTP réels (app, identity, accounts, security-events, security-negative, security-capability-negative, monitoring, calculators, ocr, ocr-negative) contre PostgreSQL embarquée, y compris scénarios FastAPI réel (timeout → `PROCESSING_TIMEOUT`, indisponibilité → `OCR_UNAVAILABLE`).
- Capacités négatives cross-domain (§57) : couvertes par les suites existantes — IDOR, OCR sans confirmation, monitoring sans surface de mutation, security sans réimplémentation d'auth. Les scénarios « Event duplication » n'ont pas de surface live (aucun consommateur asynchrone) ; l'idempotence est testée au niveau OCR/provider.
- Scénarios de panne (§58) : couverts côté providers/engines/base (échec provider, timeout engine, DB down → health READY dégradé). Les pannes de projections n'ont pas de surface live (aucune projection).

## Verification (§65 — exécution fraîche, rien de présumé)

| Étape | Résultat |
| --- | --- |
| `prisma generate` + `tsc --noEmit` (typecheck) | ✅ 0 erreur |
| `eslint src test` | ✅ 0 erreur |
| `vitest run` (unit + e2e, DB embarquée réelle) | ✅ 310/310 (22 fichiers) |
| `tsc -p tsconfig.build.json` (build) | ✅ |
| `prisma migrate deploy` | ✅ schema up to date |
| Intégrité DB §59 (21 assertions, lecture seule) | ✅ 21/21 |
| Analyse de dépendances `madge --circular` (124 fichiers) | ✅ 0 cycle |
| Boot runtime + health + gardes d'auth | ✅ live/ready OK, 401 attendus |
| Contrats frontend | ✅ inchangés (`GET /monitoring/overview` répond à l'identique) |

## Architectural issues discovered (§4/§66)

1. **Fuite Prisma cross-contexte — Monitoring** : `MonitoringRepository` comptait directement les tables d'Identity et d'Accounts (motif exact visé par §39), contournant le principe « consume, never duplicate » de la Phase 17.
2. **Fuite Prisma cross-contexte — Identity** : `IdentityRepository` conservait 5 méthodes sur les tables security-owned (`SecurityEvent`, `LoginRecord`) issues d'avant l'extraction Phase 16 ; 1 appel vivant : l'écriture du `LoginRecord` d'échec MFA dans `AuthService`, en Prisma direct à côté du port.
3. **Absence des phases 4–15** : 10 des 17 contextes référencés par la Phase 20 n'existent pas côté serveur — les workflows §15–§31 et §56 ne sont pas implémentables et n'ont pas été simulés.
4. **Surface OCR sans consommateur frontend** : le frontend n'appelle aucun endpoint OCR (usage mock uniquement) — surface backend-only documentée, pas un défaut.
5. **Quirk d'environnement (hors dépôt)** : le sandbox exporte `DATABASE_URL=file:…/custom.db` (SQLite) dans l'environnement shell, qui écrase le `.env` pour Prisma CLI et le runtime Node si non contourné — cause réelle des échecs CLI observés, le `.env` du dépôt étant correct (`.env` gitignored, jamais committé).

## Architectural issues fixed

1. **Monitoring** : les comptages d'entités passent par les contrats propriétaires (`IdentityRepository`/`SecurityEventRepository`/`AccountsRepository` `.countUserEntities`) ; `MonitoringRepository` ne touche plus que `monitoringSetting` + ping. Contrat HTTP inchangé, e2e monitoring inchangés et passants (ADR-0003).
2. **Identity** : les 5 méthodes security-owned supprimées ; l'échec MFA enregistre la paire (événement + historique de connexion) via `SecurityEventService.recordLogin` — lignes identiques, un seul port, un seul écrivain (ADR-0003).
3. Frontière documentée par **ADR-0001/0003** et règle de revue explicite : « un accesseur Prisma hors de son module propriétaire est un défaut ».

## Known limitations

- Les workflows cross-domaines métier (Trade lifecycle, Playbook→Planner, Review→Analytics, OCR→Trade, Session Live, Calendar) restent **non implémentés** faute de leurs domaines — les phases 4–15 doivent être fournies avant toute intégration de ces flux.
- Le frontend continue de fonctionner sur MSW pour tous les domaines non implémentés ; seuls auth/me, accounts, security, monitoring, calculators consomment l'API réelle.
- Le quirk `DATABASE_URL` du shell sandbox nécessite un export explicite pour Prisma CLI et le boot runtime (contournement documenté, sans impact CI propre).
- Pas d'infrastructure temps réel côté API : les endpoints WS du frontend restent simulés MSW (aucun second protocole réel n'a été introduit, §45).

## Deferred (avec ancrage)

- **Infrastructure d'événements** (bus in-process, outbox, versioning) — ADR-0002 ; à rouvrir au premier consommateur réel (candidat canonique : `TradeClosed → Analytics`).
- **OCR → création de Trade** — différé par la Phase 19 (§22/§42), le reste jusqu'à Trading Core ; la confirmation humaine reste le verrou.
- **Projections/read models, caches, recherche** — ADR-0004 ; uniquement à la demande d'un consommateur réel (§30/§48/§49).
- **Notifications** — aucun domaine de notification n'existe ; différé (§46).
- **Microservices** — aucun ; FastAPI OCR reste le seul service spécialisé (§61).

## Files changed

- `apps/api/src/modules/monitoring/monitoring.repository.ts` — recentré sur son propre contexte (suppression des comptages cross-contexte).
- `apps/api/src/modules/monitoring/monitoring.service.ts` — composition des entités via contrats propriétaires ; injection `IdentityRepository` + `SecurityEventRepository`.
- `apps/api/src/modules/monitoring/monitoring.module.ts` — import `SecurityEventModule` ; graphe documenté.
- `apps/api/src/modules/identity/identity.repository.ts` — suppression des 5 méthodes security-owned ; ajout `countUserEntities` (sessions, apiKeys).
- `apps/api/src/modules/identity/auth.service.ts` — échec MFA réacheminé par `SecurityEventService.recordLogin` (§39).
- `apps/api/src/modules/security/security-event.repository.ts` — ajout `countUserEntities` (ledger + login records).
- `apps/api/src/modules/accounts/accounts.repository.ts` — ajout `countUserEntities` (comptes, positions, ordres, deals, sync runs).
- `scripts/phase20-db-integrity.mjs` — contrôles d'intégrité §59 (lecture seule).
- `docs/backend/adr/ADR-0001-modular-monolith-and-contracts.md` — monolithe modulaire + contrats (ratification).
- `docs/backend/adr/ADR-0002-domain-event-strategy.md` — stratégie d'événements (diffèrement justifié).
- `docs/backend/adr/ADR-0003-cross-domain-prisma-boundary.md` — frontière Prisma (corrections Ph. 20).
- `docs/backend/adr/ADR-0004-consistency-model.md` — modèle de cohérence + matrice de communication.

## Bounded Context Map & Communication Matrix (§63)

```text
                    COSMOZ (réel, aujourd'hui)
                              │
                           Next.js  (UI + MSW pour les domaines non implémentés)
                              │
                           NestJS
                              │
   ┌──────────┬───────────────┼────────────────┬─────────────┐
   │          │               │                │             │
 Identity   Accounts      Security          Monitoring   Calculators
   │          │          (ledger + center)      │             │
   └── SecurityEventService (port d'écriture)  │             │
   └── IdentityRepository (contrat) ───────────┤             │
   └── AccountsRepository (contrat) ───────────┘             │
   └── SecurityEventRepository (contrat) ───► Monitoring     │
                                              │             │
                                             OCR ──► FastAPI (sidecar OCR)
```

| Producteur | Consommateur | Type | Contrat | Cohérence | Stratégie d'échec |
| --- | --- | --- | --- | --- | --- |
| Identity | Accounts | Requête applicative | `IdentityRepository` | Immédiate (forte) | Exception → 401/erreur mappée |
| Identity | Security center | Requête + commandes | Exports Identity (MFA, reauth, sessions) | Immédiate | Politiques Identity (verrouillages, rate limits) |
| Accounts | Security | Fait d'audit (écriture) | `SecurityEventService` | Forte (append-only) | Écriture non bloquante journalisée |
| Identity | Security | Fait d'audit + historique | `SecurityEventService` (`record`/`recordLogin`) | Forte | Idem |
| OCR | Security | Fait d'audit | `SecurityEventService` | Forte | Idem |
| Accounts | Monitoring | Requête applicative | `AccountsRepository` (santé synchro, comptages) | Immédiate | Count/route dégradée ≠ panne overview |
| Identity | Monitoring | Requête applicative | `IdentityRepository` + `MailerService` | Immédiate | Idem |
| Security | Monitoring | Requête applicative | `SecurityEventRepository.countUserEntities` | Immédiate | Idem |
| OCR sidecar (FastAPI) | OCR | Commande spécialisée | `OCR_ENGINE` (port + factory) | Par requête | Timeout → `PROCESSING_TIMEOUT` ; indispo → `OCR_UNAVAILABLE` ; retries bornés |
| Trading Core | Analytics, Review, Session Live | Événement de domaine | — (non implémenté, phases 4–15) | — | ADR-0002/0004 à l'arrivée |

---

Conformément au §68 (STRICT SCOPE STOP), la Phase 20 s'arrête ici : aucun backtesting, aucune exécution d'ordres, aucun nouveau microservice, aucun domaine additionnel, aucun refactoring hors périmètre.
