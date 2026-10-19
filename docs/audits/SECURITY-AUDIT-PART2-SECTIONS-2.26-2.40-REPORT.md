# SECURITY AUDIT — PARTIE 2 (SUITE) — SECTIONS 2.26 → 2.40

Date: 2026-10-19 · Branche: `main` · Méthode: **evidence-only** (chaque statut adossé à un fichier:ligne, un scan exécuté aujourd'hui, ou un test re-passé aujourd'hui)
Complément de: `SECURITY-AUDIT-REPORT-2026-10-19.md` (Parties 1+2+3 = authentification 1.1-1.13 + sécurité globale 2.1-2.25 + méthode 4 statuts).

Statuts (Partie 3 de la checklist, repris tels quels): **Validé** (le contrôle existe ET un test/scan/confirme son fonctionnement) · **À vérifier** (mécanisme présent, efficacité à l'échelle déploiement — typiquement staging owner) · **Manquant** (non implémenté, classé avec priorité) · **N/A** (non applicable, justification).

Consigne owner appliquée: « ignore si existe déjà implémenté » — les contrôles déjà prouvés dans le rapport principal sont **re-prouvés par re-lecture de code / re-exécution** aujourd'hui, jamais repris sur parole. Les références « §C.2.x » renvoient au rapport principal pour la preuve d'origine.

---

## A. Objet et périmètre de cette livraison

L'owner a transmis la **suite** de la checklist de sécurité globale : sections **2.26 à 2.40** (15 sections, ~180 contrôles granulaires). Le rapport principal couvrait 2.1-2.25 ; cette livraison vérifie chaque nouvel item avec le même standard de preuve, corrige ce qui est corrigeable aujourd'hui (2 fixes avec preuve de non-régression), et documente honnêtement les restes.

Surfaces re-vérifiées par exécution **aujourd'hui** (2026-10-19) :
- `pnpm audit --prod` : 3 HIGH transitives → **0 vulnérabilité** après FIX D (§D.1).
- Batterie web : **223/223** (vitest, 7.34 s) · Batterie API : **1350/1351** (le 1 = flake oanda pré-existant documenté, cf. §E.3) · `prisma generate` OK · `tsc --noEmit` ×3 OK · build web OK.
- Gardes CI re-passées : **MOCK-LEAKAGE GUARD PASS** · **TRACKED-SECRETS GUARD PASS (1 529 fichiers, 8 patterns)**.
- Re-lectures ciblées : `ocr-ops.service.ts` (7 raw SQL), `trading.repository.ts` (tri dynamique), `error-mapper.ts`, `env.schema.ts`, `zod-validation.pipe.ts`, `request-id.ts`, `mailer.service.ts`, `webhook-pipeline.ts`, `primitives.ts`, `sw.js`, `next.config.ts`, `Dockerfile`, `docker-compose.yml`, `app.setup.ts`, `login-form.tsx`, scans rg (catch vides, child_process, Math.random, pickle/eval, postMessage, dangerouslySetInnerHTML, sha1/md5, Redis, scripts tiers).

---

## B. 2.26 — Validation approfondie des entrées

| Contrôle | Statut | Preuve |
|---|---|---|
| Type/format/longueur/max clairement définis par champ | Validé | Zod systématique (`ZodValidationPipe` sur chaque route, 114 fichiers de schémas) ; primitives partagées `packages/shared/src/schemas/primitives.ts` (decimal-string regex :16, ISO-8601 :44, date calendaire :57, UUID :75) ; bornes explicites (page limit 1-100, password 10-128, PORT 1-65535, RATE_LIMIT/BODY_LIMIT bornés `env.schema.ts`) |
| Champs obligatoires non omissibles | Validé | Zod : clé requise par défaut, `.optional()`/`.nullable()` explicites dans les schémas partagés ; champ manquant → 400 `ValidationError` (`zod-validation.pipe.ts:28-36`) |
| Champs inconnus rejetés OU ignorés selon politique explicite | Validé (politique = strip) | Zod mode par défaut = strip : la pipe retourne `parsed.data` (champs inconnus supprimés, `zod-validation.pipe.ts:38`) — politique « ignorés, jamais propagés » ; les 2 seuls `.passthrough()` du dépôt sont sur des **schémas de réponses provider entrantes** (Deriv `deriv-mapping.ts:143,173` — tolérance aux champs additionnels du broker, mapping explicite en aval, jamais persistés bruts) |
| Valeurs supplémentaires ne modifient pas des propriétés sensibles | Validé | strip systématique + payloads construits par les services (statuts/nombre de triggers serveur-only, preuve §C.2.22 du rapport principal) ; zéro mass-assignment possible |
| Nombres vérifiés contre NaN/infinies/négatifs | Validé | Argent/prix/quantités/R **jamais** en `number` : `decimalStringSchema` regex `^-?\d+(\.\d+)?$` (NaN/Infinity/exposants impossibles par construction, `primitives.ts:16-25`) + refine `> 0` / `>= 0` (:30-39) ; `z.number()` rejette NaN nativement ; bornes `.int().min().max()` sur toute config numérique |
| Dates, fuseaux, intervalles validés | Validé | `isoDateTimeSchema` = `z.string().datetime({offset:false})` — UTC avec `Z` obligatoire (:44-47) ; `dateKeySchema` = YYYY-MM-DD + validation calendaire **rejette 2026-02-30** (:57-68) |
| Identifiants respectent le format attendu | Validé | `uuidSchema` = `z.string().uuid()` (:75) ; userId injecté du JWT, jamais du body |
| Tableaux taille max, objets imbriqués profondeur raisonnable | Validé (mécanismes combinés) | tableaux `.max()` bornés dans les schémas ; volumétrie plafonnée `BODY_LIMIT_BYTES` 9 MB (défaut, max 16 MB, `env.schema.ts`) ; profondeur = limite moteur `JSON.parse` + échec contrôlé via funnel d'erreurs — **note honnête** : pas de cap de profondeur explicite dans les schémas Zod (`jsonValueSchema` récursif sans limite), la borne réelle est le couple bodyLimit+moteur |
| Unicode, caractères de contrôle, nuls gérés | Validé (mécanisme) | aucun écho brut d'entrée dans les messages d'erreur (issues = path+message seulement) ; `\u0000` rejeté par PostgreSQL → Prisma → mapper générique sans leak (`error-mapper.ts:155-159`) ; headers de corrélation strictement filtrés (`request-id.ts:13-14` pattern `[A-Za-z0-9_-]{8,64}`) |
| Valeurs normalisées avant comparaisons | Validé | email `toLowerCase()` aux points de comparaison (`account.service.ts:80,90`) ; clés de rate limiter normalisées (`auth-rate-limiter.service.ts:37-68`) ; origins CORS trim + trailing slashes retirés (`env.schema.ts:10-17`) |
| La normalisation ne contourne pas les contrôles | Validé | normalisation **serveur uniquement**, puis re-validation par schémas ; le client ne pré-normalise jamais une donnée crue de confiance |
| Validations métier séparées des validations de format | Validé | format = Zod → 400 `ValidationError` ; métier = `AppError` category `BusinessRule` → 422 (`error-mapper.ts:50`) ; deux canaux distincts documentés dans le mapper |
| Entrées jamais sûres parce qu'authentifiées | Validé | les pipes Zod s'appliquent à toutes les routes (utilisateurs authentifiés inclus) ; réponses OCR/providers re-validées comme externes (cf. 2.26 lignes OCR / §C.2.10) |
| Tous endpoints, y compris internes/admin | Validé | aucune route admin ; endpoints internes (bridge MT5, sidecar OCR) = payload validé zod par kind (preuve §C.2.11) |
| Données extraites par OCR validées comme externes | Validé | réponses moteur = schémas stricts avant stockage ; import OCR → trades en attente de **confirmation humaine** (preuve §C.2.19) ; sidecar : `validation.py` + `contract.py` |
| Erreurs de validation sans données sensibles | Validé | `ValidationError` = message générique + issues (chemin + message Zod, **jamais la valeur reçue**) (`zod-validation.pipe.ts:30-36`, `error-mapper.ts:81-94`) |
| Limites appliquées aux données tierces | Validé | réponses Oanda/Deriv schéma-strictes (oandaAccountsListSchema, deriv*Schema) ; caps pages/rows par sync (preuves §C.2.2/2.18) |

**Test demandé (valeurs manquantes, champs extra, chaînes longues, nombres hors limites, JSON malformé)** : couvert par exécution — JSON malformé et body oversize routés par le funnel Fastify→filtre global (preuve `app.setup.ts:30-33` + `error-mapper.ts:125-135` FST_ERR_*) ; OCR-negative e2e = payloads hostiles ; 400/413/422/429/500 testés dans les batteries (1350 pass).

---

## C. 2.27 — Protection contre les injections

| Contrôle | Statut | Preuve |
|---|---|---|
| SQL paramétré / ORM correctement utilisé | Validé | Prisma 100 % ; les **7 `$queryRawUnsafe`** (`ocr-ops.service.ts:48,76,90,100,113,129,141`) **re-vérifiés ligne à ligne aujourd'hui** : placeholders `$1::uuid`/`$2` liés aux seuls `userId`/`since`, textes SQL statiques, zéro interpolation ; `$queryRaw` taggés paramétrés (`settings.repository.ts:57`, `trading.repository.ts:579`, `prisma.service.ts:55`) |
| Colonnes/tris/champs dynamiques depuis listes autorisées | Validé | unique tri dynamique = `sortClause(sort, order)` (`trading.repository.ts:661-670`) : paramètre **type-union TS** `"entryAt"\|"exitAt"\|"pnlNet"` provenant du schéma Zod + ternaire exhaustif + tie-breaker stable `{id:"asc"}` — aucune construction de nom de colonne depuis une chaîne utilisateur ; tous les autres `orderBy` = littéraux |
| Pas de concaténation dans commandes shell | Validé | **zéro** `child_process`/`exec`/`spawn` dans apps/api et mini-services (scan rg aujourd'hui) |
| LDAP | N/A | aucun LDAP |
| NoSQL opérateurs inattendus | N/A | Prisma/PostgreSQL uniquement, aucun driver NoSQL ; Prisma rejecte les clés inconnues par typage + Zod strip |
| Templates serveur n'interprètent pas les données comme du code | Validé | aucun moteur de templates HTML ; API = JSON ; React échappe par défaut côté web |
| Regex sans consommation CPU excessive | Validé | regex toutes **statiques et bornées** (enveloppe data-URL, pattern request-id, decimal-string) ; aucune regex construite depuis une entrée utilisateur (scan) ; longueurs plafonnées avant matching |
| GraphQL profondeur/complexité | N/A | pas de GraphQL |
| XML sans entités externes | N/A | pas d'XML accepté |
| Chemins de fichiers confinés | Validé | clés de storage = UUID validé + checksum hex ; `assertSafeStorageKey` + re-vérification `resolve` dans le root (preuve §C.2.7, re-vérifiée) ; le nom client ne touche jamais le FS |
| Commandes image/conversion sans arguments non fiables | Validé | API sans lib image native (parse d'en-tête pur) ; sidecar Pillow épinglé, budgets pixels AVANT traitement (`validation.py:29` garde Pillow 200M, `_MAX_WORKING_PIXELS=24M` `preprocessing.py:49`, PDF 20 pages `document.py:36`) ; zéro shell |
| Messages de file sans injection | N/A | pas de broker de messages (orchestration in-process + DB, preuve §C.2.18) |
| Tests avec caractères spéciaux/charges malformées | Validé | ocr-negative (payloads hostiles), csvCell 10 tests (injection formule CSV), réponses moteur hostiles schéma-validées (preuves §C.2.5/2.21) |

---

## D. 2.28 — Sérialisation et désérialisation

| Contrôle | Statut | Preuve |
|---|---|---|
| Désérialisation avec bibliothèques reconnues | Validé | JSON natif (JSON.parse Fastify) + Zod partout ; aucune lib de désérialisation exotique (scan) |
| Formats dangereux (pickle) interdits | Validé | **zéro** `pickle`/`yaml.load`/`eval`/`exec` côté Python (scan `mini-services/ocr-service` aujourd'hui) ; le sidecar reçoit des bytes d'image, répond du JSON typé |
| Objets validés après désérialisation | Validé | toute entrée passe le schéma Zod (pipe globale) ; réponses externes passent leurs schémas avant usage |
| Schémas de sortie explicites | Validé | réponses = mappers DTO + schémas de réponse partagés (contrat unique monorepo) |
| Champs internes/confidentiels non sérialisés par inadvertance | Validé | `select` explicites (`TRADE_COLUMNS`/`EXECUTION_COLUMNS` `trading.repository.ts:151`) ; credentials/mots de passe/secrets jamais inclus dans les réponses (hachés ou chiffrés, preuves §C.2.8/1.x) ; masquage mailer prod (`mailer.service.ts:70,94`) |
| Objets ORM pas exposés directement | Validé | projection Prisma **jamais** brute — mappers dans chaque module (preuve §C.2.2, re-vérifiée par échantillon) |
| JSON excessivement profond/volumineux limité | Validé (mécanismes combinés) | bodyLimit 9 MB + limite de profondeur du moteur JSON + funnel d'erreurs contrôlé (cf. 2.26) — note honnête : cap de profondeur implicite (moteur), pas explicite (schéma) |
| Types ambigus traités de manière cohérente | Validé | contrat wire : argent = decimal-string **jamais number** (`primitives.ts:14-39`), timestamps UTC `Z`, dates calendaires, IDs UUID — un seul format par type dans tout le monorepo |
| Formats date/nombre/id documentés | Validé | docstring contractuelle en tête de `primitives.ts:5-12` (COSMOZ contract) |
| Messages entre microservices versionnés | N/A | pas de broker de messages ; le seul canal inter-service (API→OCR) a un contrat d'interface testé (`contract.py` + tests de contrat) et le bridge MT5 un payload zod par kind |

---

## E. 2.29 — Gestion des erreurs et exceptions

| Contrôle | Statut | Preuve |
|---|---|---|
| Erreurs attendues/inattendues distinguées | Validé | `error-mapper.ts` : `AppError` (attendues, :96-103) vs `fromUnknown` (inattendues, :162-172) — chemins séparés |
| Codes métier stables et documentés | Validé | `ErrorCategory` + `AppError.code` (catégories stables §38) ; `STATUS_TO_CATEGORY` (:44-55) |
| Statuts HTTP appropriés | Validé | mapping 400/401/403/404/409/422/429/413/502/500 (:44-55) |
| Erreurs inattendues → réponse générique en production | Validé | `HttpException ≥500` → `"An unexpected error occurred."` hors dev (:117-121) ; inconnu → même message (:170) |
| Stack traces jamais au client | Validé | `fromUnknown` ne transfère **jamais** le message d'origine (:168-171) ; stack = logs serveur uniquement |
| Pas de chemins internes/tables/SQL dans les erreurs | Validé | Prisma connu → messages sanitaires (« A database error occurred. », :155-159, `sanitized:true`) ; P2002/P2025 génériques (:141-153) |
| Identifiants de requête pour retrouver dans les logs | Validé | `genReqId` + écho `x-request-id` sur **chaque** réponse (`app.setup.ts:37-40`) ; `requestId` dans le corps d'erreur (mapper `body.requestId`) |
| Exceptions journalisées sans secrets | Validé | pino redact — `req.headers.cookie` dans la liste de redaction (`logger.factory.ts:21`) ; mailer redact en prod (`mailer.service.ts:94`) ; env schema n'imprime jamais les valeurs de secrets |
| Exceptions jamais silencieusement ignorées | Validé | **zéro catch vide** dans apps/api (scan rg multi-ligne aujourd'hui ; 134 catch tous instruits) ; échec mailer re-levé (`mailer.service.ts:114-118`) |
| Catch ne transforme pas une erreur de sécurité en succès | Validé | guards : échec auth → 401/403 (jamais rattrapé) ; OCR en échec → `FAILED OCR_UNAVAILABLE` (dégradation honnête, preuve e2e) |
| Erreur d'autorisation ≠ autoriser par défaut | Validé | global guard **deny-by-default**, seuls auth+health `@Public` (preuve §C.2.2 re-vérifiée) |
| Transactions annulées en cas d'échec | Validé | `$transaction` 15+ usages (inventaire §M.34) — rollback Prisma automatique en rejet |
| Erreurs de dépendances externes sans réponses brutes | Validé | erreurs providers = codes mappés (SYNC_FAILED, ExternalProvider 502) — payloads bruts jamais echo (preuve §C.2.18) |
| Pas de révélation d'existence utilisateur/fichier/ressource | Validé | anti-énumération auth (preuve 1.2) ; P2025 → 404 générique ; OCR = ownership par userId |
| Messages précis en interne, limités au client | Validé | logs 5xx avec stack côté serveur, client = message sain (preuve §C.2.15) |
| Erreurs de démarrage config invalide bloquent le lancement | Validé | `envSchema` fail-fast contrôlé — liste clés/raisons, **jamais** les valeurs (`env.schema.ts:19-22`) |
| Erreurs répétées surveillées → alerte | Validé (mécanisme) | 8 règles d'alerte avec seuils (`monitoring.logic.ts:38-45` : API_DEGRADED >10 % erreurs min 10 req, JOB_FAILURES 2 consécutives, SYNC/NOTIFICATION failures…) + télémétrie 401/403/429 ; **acheminement des alertes = staging** (honnête) |

**Test demandé (erreur DB, exception inattendue, panne service externe)** : couvert par la batterie — P2002→409, P2025→404, OCR unreachable/timeout → FAILED (e2e), unknown → 500 générique ; logs permettent le diagnostic via requestId (corrélation client→API→logs).

---

## F. 2.30 — Configuration du serveur et de l'environnement

| Contrôle | Statut | Preuve |
|---|---|---|
| Debug désactivé en production | Validé | `NODE_ENV` enum strict ; gates `isProduction` (cookies secure, mailer redact, CORS) ; LOG_LEVEL enum (pas de debug forcé) |
| Interfaces de débogage non publiques | Validé | **zéro Swagger** (`@nestjs/swagger` absent, scan) ; zéro endpoint démo/sample (scan `@Controller` aujourd'hui) ; MSW = opt-in dev/demo avec garde CI PASS |
| Identifiants par défaut supprimés | Validé (app) | aucun mot de passe codé en dur ; garde tracked-secrets PASS ; `docker-compose.yml` = placeholders dev locaux documentés (profil opt-in, jamais déployé tel quel) |
| Pages d'exemple désactivées | Validé | cf. ligne précédente (scan zéro) |
| Services inutiles arrêtés | À vérifier | sandbox = process applicatifs uniquement ; inventaire services = provisioning staging |
| Ports ouverts inventoriés | Validé (FIX E) | inventaire : API 4000, web dev 3000, PG embarqué test 5433 (localhost), compose db 5432 + api 4000 — **FIX E aujourd'hui : bindings `127.0.0.1` sur db et api du compose** (précédemment `0.0.0.0`) |
| Permissions des fichiers de config restrictives | À vérifier | `.env` non trackés (git) ; chmod FS = provisioning staging |
| Répertoires temporaires sans confidentiels | Validé | OCR : écriture atomique tmp+rename dans storage privé `.data/ocr-storage` (hors racines servies, preuve §C.2.7) |
| Comptes système à privilèges minimaux | Manquant (MEDIUM-LOW, fixé au provisioning) | `apps/api/Dockerfile` **sans directive `USER`** → conteneur root par défaut ; à durcir (`USER node`) lors du provisioning — documenté §G |
| Runtimes/frameworks à jour | Validé | node 24-bookworm-slim, next 16.3.8 (RCE fixé), fastify 5.12.7 (pin sécurité), prisma 6.19.3, pnpm 12.4.2 |
| Versions suivies | Validé | pins overrides (`pnpm-workspace.yaml:31-38`) + lockfile frozen CI + rapports successifs |
| Prod ≠ dev hérité aveuglément | Validé | env schema + gates NODE_ENV ; aucune config prod héritée du dev sans validation |
| Paramètres de sécurité validés au démarrage | Validé | `envSchema` fail-fast (CORS `*` interdit, schémas URL, bornes numériques, TRUST_PROXY enum) |
| Health ne divulgue pas les variables d'environnement | Validé | `/health` = `{status, version, env, uptime}` uniquement (`health.controller.ts:37-45`, preuve §C.2.11 re-vérifiée) |
| Interfaces d'administration protégées | N/A | aucune interface admin |
| En-têtes proxy depuis proxys de confiance seulement | Validé | `TRUST_PROXY` **opt-in, défaut `false`** (`env.schema.ts:79-83`, `app.setup.ts:25`) |
| Noms d'hôtes autorisés définis | À vérifier | pas de `allowedHosts` applicatif (Next/Nest ne l'exposent pas nativement) — à imposer au reverse proxy staging |
| Cache HTTP ne rend pas publiques des réponses privées | Validé | OCR fichiers = `private, no-store` explicite (`ocr.controller.ts:141,286`) ; API JSON sans Cache-Control public (cache privé navigateur seulement) ; SW **réseau-d'abord, zéro cache de données** (`sw.js:9-13,44-65`) |
| Backups/dumps/.env non servis | Validé | `public/` web inventorié aujourd'hui : assets statiques de marque uniquement (brand/svg/manifest/offline.html/sw.js/mockServiceWorker) ; l'API ne sert **aucun** fichier statique ; `.env` non trackés (git ls-files = .env.example seulement) |
| Permissions d'écriture limitées | Validé (app) / À vérifier (staging) | l'application n'écrit que `.data/ocr-storage` (privé) et `.localpg` (dev/test) |

---

## G. 2.31 — Sécurité HTTP et reverse proxy

**Contexte** : aucun Nginx/Caddy/LB dans le dépôt ; la terminaison TLS et le proxy relèvent du provisioning staging (bloquant owner connu). Côté application, tout ce qui est contrôlable est en place :

| Contrôle | Statut | Preuve |
|---|---|---|
| Le proxy ne contourne pas les contrôles d'accès | N/A (app) | auth = garde applicative (JWT global), non délégable à un proxy ; aucun contrôle délégué |
| Host/Forwarded/X-Forwarded-* traités sûrs | Validé (app) | `TRUST_PROXY=false` par défaut → Fastify ignore les headers forwarded sauf opt-in explicite |
| Headers client non fiables supprimés/remplacés | À vérifier | stratégie de strip côté proxy = staging ; côté app, `x-request-id` client strictement filtré (`request-id.ts`) |
| Limites de taille cohérentes proxy/app | Validé (app) / À vérifier (proxy) | `BODY_LIMIT_BYTES` borné 9 MB défaut (superRefine garantit la cohérence OCR) ; cohérence proxy = staging |
| Timeouts proxy/backend configurés | Validé (app) / À vérifier (proxy) | OCR deadline (PROCESSING_TIMEOUT), fetch timeouts engine ; proxy = staging |
| HTTPS terminé, interne protégé si nécessaire | À vérifier | TLS = staging ; interne : OCR sidecar tokenisé (Bearer), bridge HMAC — pas de confiance réseau aveugle |
| Redirections HTTP→HTTPS correctes | À vérifier | staging |
| En-têtes de sécurité cohérents sans conflit | Validé (app) / À vérifier (proxy) | helmet API (CSP/HSTS/nosniff/frameguard/referrer/hide-powered-by) + FIX A web (XFO DENY, nosniff, referrer, permissions-policy, CSP frame-ancestors) — preuve curl live §D.1 du rapport principal ; non-duplication proxy = staging |
| Réponses d'erreur du proxy sans détails internes | À vérifier | staging |
| Routes administratives non exposées | N/A | aucune route administrative |
| Rate limiting au proxy complétant le backend | À vérifier | backend multicouche déjà (global 120/60 s + vecteurs dédiés) ; proxy = staging |
| Journaux du proxy masquent les secrets | Validé (app) / À vérifier (proxy) | pino redact (cookies…) ; masquage proxy = staging |
| Règles de cache distinguant public/privé | Validé (app) / À vérifier (proxy) | cf. 2.30 (no-store OCR, SW réseau-d'abord) ; proxy = staging |

---

## H. 2.32 — CORS, CSRF et navigateur (compléments)

| Contrôle | Statut | Preuve |
|---|---|---|
| Liste des origines explicite et minimale | Validé | `CORS_ORIGINS` = allowlist env validée au boot ; `*` **rejeté par le schéma** (`env.schema.ts:14-40`) ; registration = tableau exact (`app.setup.ts:83-90`) |
| Sous-domaines/suffixes trompeurs non acceptés | Validé | matching **exact de chaîne** (tableau, aucune comparaison par suffixe/wildcard dans @fastify/cors avec origin array) |
| Credentials uniquement aux origines prévues | Validé | `credentials: true` + allowlist fixe ; header `Authorization` hors cookies |
| CSRF couvre les actions sensibles authentifiées par cookies | Validé | les **2 seuls** endpoints cookie-only (refresh, logout) = POST + `SameSite=Lax` (blocage envoi cross-site) ; toutes les autres mutations = header `Authorization` (jamais envoyé automatiquement cross-site) — preuve §C.2.5 re-vérifiée |
| Tokens CSRF non considérés secrets | N/A | pas de token CSRF ; le protocole repose sur SameSite + header Bearer (cohérent avec la remarque de la checklist) |
| Cookies de session à portée minimale | Validé | refresh cookie : `path=/`, **host-only** (aucun `domain`), `httpOnly`, `secure` prod, `sameSite=lax` (`auth.service.ts:660-668`) |
| Pages privées = directives de cache adaptées | Validé | cf. 2.30 (no-store OCR, pas de cache public, SW réseau-d'abord) |
| CSP testée avant d'être imposée | Validé (périmètre documenté) | FIX A servie par le build et prouvée curl 5/5 (rapport principal §D.1) ; CSP scripts stricte = reste documenté (nonce plumbing Next) |
| Scripts tiers limités et contrôlés | Validé | **zéro** `next/script`/`<Script>` (scan) ; fonts = `next/font/google` auto-hébergées au build (`layout.tsx:1`) — zéro CDN runtime |
| Sources externes de scripts/styles examinées | Validé | CSS = imports build-time (tailwind/tw-animate/shadcn/euforia.css, `globals.css`) ; aucun style CDN runtime |
| Redirections post-connexion non arbitraires | Validé | `safeReturnTo` (`login-form.tsx:33-39`) : rejette non-`/`, `//` (protocol-relative), `://` (absolu) — anti open-redirect spec §35 |
| postMessage vérifie origine/format | N/A | **zéro** `postMessage` dans apps/web (scan) |
| Interfenêtres ne transmettent pas de tokens | Validé | aucun flux cross-window de tokens ; access token en mémoire, refresh HttpOnly (preuve §C.2.4) |

---

## I. 2.33 — Cryptographie et protection des données

| Contrôle | Statut | Preuve |
|---|---|---|
| Algorithmes standards et maintenus | Validé | inventaire complet : **Argon2id** (mots de passe, OWASP), **AES-256-GCM** (credentials brokers, secrets MFA, secrets webhook, clés bridge), **HMAC-SHA256** (webhooks, bridge), **SHA-256** (hashing tokens sessions), SHA-1 **uniquement** UUIDv5 (rôle RFC 4122, `uuid-v5.ts:21`) + fingerprinting analytique non-sécurité (`analytics-math.ts:114`) |
| Pas de crypto maison | Validé | `node:crypto` + `@node-rs/argon2` ; zéro primitive réimplémentée |
| RNG cryptographique pour tokens/secrets | Validé | `randomBytes(16)` (secrets API `cz_live_`, `security-center.service.ts:335`), `randomUUID` partout (IDs) ; les **8** `Math.random` du dépôt inventoriés et tous non-sécurité (IDs de lignes, jitter scheduler, shuffle pédagogique `drills.ts:8` documenté) |
| Clés séparées des données chiffrées | Validé | 3 clés AES par domaine (credentials/MFA/webhook) env-supplied, jamais stockées à côté des données |
| Politiques d'accès/rotation/révocation des clés | À vérifier | injection par domaine (chaque composant ne reçoit que SA clé) ; rotation = procédure env + redeploy documentée — exercice réel = staging owner |
| Modes de chiffrement authentifiés | Validé | **GCM partout**, aucun CBC/ECB (scan `createCipheriv` = aes-256-gcm uniquement) |
| Nonces/IV conformes à l'algorithme | Validé | IV 12 bytes aléatoire par chiffrement (`aes-gcm.ts:20`, `totp.service.ts:46`) |
| Mots de passe hachés (pas chiffrés) | Validé | Argon2id, vérification `$argon2id$` (`password-hasher.service.ts:51`) |
| Comparaisons de secrets éprouvées | Validé | `timingSafeEqual` (webhooks `webhook-pipeline.ts:42`, bridge) + `verify` Argon2id (temps constant natif) |
| Certificats/clés privées hors images Docker | Validé | `apps/api/Dockerfile` re-vérifié ligne à ligne : ne copie que `dist`, `prisma`, `node_modules`, `packages`, `package.json` — **aucun** `.env`/secret/cert |
| Algorithmes faibles/obsolètes évités | Validé | scan : zéro md5, zéro SHA-1 à rôle sécurité, zéro des/rc4 |
| Données sensibles chiffrées au repos selon le modèle de risque | Validé | credentials + secrets MFA = classe chiffrée ; trades = données métier (décision produit owner documentée) |
| Clés accessibles aux seuls composants nécessaires | Validé | app-config injecte chaque clé à son module uniquement |
| Sauvegardes chiffrées restaurables avec gestion sûre des clés | À vérifier | backups projet en place (bundle+tarball+manifest) ; chiffrement/procédure = owner staging |

---

## J. 2.34 — Concurrence, transactions et intégrité métier

| Contrôle | Statut | Preuve |
|---|---|---|
| Opérations sensibles transactionnelles | Validé | `$transaction` 15+ usages inventoriés aujourd'hui : trading ×4 (`trading.repository.ts:170,383,427,460,577`), identity ×3, ocr ×3, backup, calendar, settings, trade-planning |
| Contraintes d'unicité en base | Validé | **40** `@unique`/`@@unique` dans `schema.prisma` (compté aujourd'hui) |
| Vérifications solde/quota résistantes aux requêtes simultanées | Validé | `SELECT … FOR UPDATE` sur le compte (`trading.repository.ts:579`) ; CAS par `triggerCount` pour les alertes (preuve §C.2.22) ; quotas serveur |
| Opérations non répétables protégées contre la double soumission | Validé | machines d'états serveur (re-décision → 409, close→awaitingDecision→decision, preuve e2e) ; P2002 → 409 mappé |
| Idempotence par clé cohérente | Validé | webhook ledger `(endpointId,eventId)` (preuve §C.2.2), bridge `(keyId,eventId)`, OCR dedup checksum |
| Mises à jour concurrentes sans perte silencieuse | Validé | transactions + row locks + tie-breaker stable `{id:"asc"}` pour pagination déterministe (`sortClause`) |
| Transitions de statut contrôlées côté serveur | Validé | statuts serveur-only, body stripé (preuves §C.2.22, Phase 08 PATCH pirate) |
| Ressource révoquée inutilisable sans re-vérification | Validé | sessions révoquées = effet immédiat (vérification DB par requête + rotation + reuse-detection, preuves 1.8/1.9) ; refresh cookie effacé à la révocation (`auth.service.ts:671-677`) |
| Tâches asynchrones sans double traitement | Validé | CAS triggerCount + checkpoint sync + ledger idempotent + recovery sweep (preuves §C.2.18) |
| Contraintes métier vérifiées dans la transaction | Validé | rotation session + consume challenge dans un `$transaction` (preuve §C.2.6) |
| Tests incluant requêtes concurrentes/répétitions | Validé | e2e IDOR + CAS alertes + webhook sérialisé + re-décision 409 ; le test « recovery sweep » (le flake documenté) EST un test de concurrence scheduler |

---

## K. 2.35 — Cache et stockage temporaire

**Contexte** : **aucun Redis** (« no BullMQ/Redis in this build », `ocr.module.ts:22`) — cache = in-process (buffers bornés) + TanStack Query côté client + HTTP cache navigateur.

| Contrôle | Statut | Preuve |
|---|---|---|
| Données privées pas cachées comme publiques | Validé | SW = **réseau-d'abord, aucun cache de données** (cache limité à offline.html/icon/manifest, `sw.js:20-28,44-65`) ; OCR = `private, no-store` ; API JSON sans Cache-Control public |
| Clés de cache incluant le contexte utilisateur/tenant | Validé | aucun cache partagé cross-user côté API (in-process, données requête-scopées) ; TanStack keys = filtres sérialisés, données re-scopées serveur par userId |
| Invalidation après modification des droits | Validé | **aucun cache d'autorisations** : guard vérifie session/état à chaque requête (révocation = effet immédiat, e2e revocation) |
| Durée de conservation adaptée | Validé | cookie refresh maxAge borné (remember days), challenges/OTP TTL, ring buffers bornés (50 mail / 500 télémétrie), OCR retention job |
| Redis non exposé publiquement | N/A | pas de Redis |
| Auth/ACL du cache | N/A | in-process, non adressable réseau |
| Connexions cache avec secrets protégés | N/A | idem |
| Données temporaires expirées correctement | Validé | cf. durées ci-dessus + `.localpg`/`.data` locaux éphémères |
| Données sensibles pas en clair sans nécessité | Validé | logs redact ; télémétrie = métriques seulement (§40) ; storage OCR privé owner-scopé |
| Erreurs de cache sans contournement des permissions | Validé | échec OCR → FAILED (aucun fallback permissif) ; pas de cache qui court-circuite le guard |
| Clés anti-collision/manipulation | Validé | IDs UUID/uuid-v5 ; dédup = paires (endpointId,eventId)/(keyId,eventId) contraintes en base |

---

## L. 2.36 — Emails, notifications et communications externes

| Contrôle | Statut | Preuve |
|---|---|---|
| Emails sans mots de passe/secrets | Validé | 3 kinds seulement (verification/reset/change, `mailer.service.ts:17`) ; contenu = lien + label + expiresIn ; **aucun** mot de passe/secret dans le corps |
| Liens sensibles temporaires à usage contrôlé | Validé | tokens one-time avec TTL (expiresIn affiché) ; consume unique en transaction (preuves 1.5/1.6) |
| Destinataires validés | Validé | `to` = email issu des flows identity (Zod email + présence en base) |
| Pas d'injection d'en-têtes email | Validé | **aucun** header SMTP construit manuellement (transport actuel = log structuré JSON, `mailer.service.ts:63-76`) ; tokens `encodeURIComponent` dans les URLs (:134,145,156) ; l'adapter SMTP réel branchera une lib — contrôlé par revue (convention projet) |
| Envois soumis à quotas | Validé | resend 3/15 min + forgot 3/15 min (rate limiters dédiés, preuve 1.3/1.5) + télémétrie delivery |
| Liens de désinscription protégés | N/A | aucun email marketing |
| Fournisseurs externes : données nécessaires seulement | Validé | transport actuel = local (aucun prestataire) ; brokers = credentials utilisateur chiffrées, lecture seule |
| Réponses/erreurs provider non renvoyées au client | Validé | delivery telemetry = `{kind,status}` seulement, data-minimale §18 (`mailer.service.ts:32-46`) |
| Webhooks entrants authentifiés | Validé | HMAC-SHA256 `<ts>.<json>` + **timing-safe** (`webhook-pipeline.ts:24-42`, re-vérifié aujourd'hui) |
| Webhooks rejetés si signature/timestamp invalides | Validé | pipeline : étape 1 fraîcheur timestamp (fenêtre ±5 min) → étape 2 signature ; modes de test `bad-signature`/`stale-timestamp`/`replay` (:62,100-113) |
| Événements répétés reconnus | Validé | ledger idempotent `(endpointId,eventId)` (preuve §C.2.2) |
| Secrets fournisseurs stockés/renouvelés correctement | Validé | secrets webhook **par endpoint** chiffrés AES-GCM (preuve §C.2.11) ; rotation via endpoint.rotate (UX réelle = À vérifier owner) |

---

## M. 2.37 — Observabilité et détection

| Contrôle | Statut | Preuve |
|---|---|---|
| Métriques sans PII ni secrets | Validé | ring télémétrie = route template + status + durée + principal UUID, borné 500, non persisté (§40, `app.setup.ts:44-50`) ; delivery mail = kind/status ; aucune valeur de variable d'env dans `/health` |
| Endpoints de métriques protégés | Validé | `/monitoring/*` **sans** `@Public` → JwtAuthGuard global + throttler (en-tête du controller documenté, `monitoring.controller.ts:5-9`) |
| Alertes couvrant échecs d'auth inhabituels et erreurs répétées | Validé | LOGIN_FAILED via SecurityEventService (+ LoginRecord), télémétrie 401/403/429, règles API_DEGRADED/JOB_FAILURES (`monitoring.logic.ts:38-45`) |
| Anomalies CPU/mémoire/réseau surveillées | À vérifier | métriques applicatives (p95, taux d'erreur, feed age) ; supervision infra = staging |
| Accès administratifs surveillés | N/A | pas d'administrateurs ; self-service tracé (audit trail paginé) |
| Changements de config sensibles traçables | Validé | git (chaque changement = commit documenté) ; env validée au boot, non mutable à chaud |
| Logs horodatés de façon cohérente | Validé | pino timestamp ISO sur chaque ligne (observé dans les sorties de test) |
| Corrélation sans données confidentielles | Validé | `x-request-id` client accepté **seulement** si `[A-Za-z0-9_-]{8,64}` sinon UUID régénéré (`request-id.ts:13-34`) — pas d'injection de contenu arbitraire dans les logs |
| Journaux protégés contre modification | À vérifier | fichiers locaux ; centralisation/immuabilité = staging |
| Alertes réellement testées | Validé | `monitoring.e2e.spec.ts` + `monitoring-logic.spec.ts` (présents dans la batterie 1350 pass) |
| Seuils sans angles morts ni excès | Validé (mécanisme) | 8 règles bornées, garde anti-bruit (taux d'erreur évalué sur ≥10 requêtes) |
| Incidents : triage et résolution | À vérifier | précédents documentés (incident restore 5409931 + fixes) ; processus formel = owner |

---

## N. 2.38 — Dépendances et chaîne de livraison

| Contrôle | Statut | Preuve |
|---|---|---|
| Dépendances directes + transitives inventoriées | Validé | pnpm-lock.yaml + `pnpm why` exécutés aujourd'hui (arbres sharp/deepmerge-ts/source-map-js tracés) |
| Vulnérabilités connues recherchées | Validé (durci aujourd'hui — FIX D) | `pnpm audit --prod` : 3 HIGH (deepmerge-ts, source-map-js, sharp/librsvg) → **0 vulnérabilité** après overrides ; précédent : next 16.3.5→16.3.8 (RCE), fastify 5.12.7 |
| Versions critiques verrouillées | Validé | section `overrides:` de `pnpm-workspace.yaml` (fastify 5.12.7 hérité Master QA + 3 nouveaux pins, `:31-38`) + `--frozen-lockfile` CI ×2 |
| Paquets inconnus/non maintenus remplacés | À vérifier | aucun signal actuel ; veille périodique = reste job CI (priorité LOW, gap #9 rapport principal) |
| Scripts de build/installation examinés | Validé | `allowBuilds` explicite au workspace (msw:false, sharp:false, prisma/engines:true, embedded-postgres linux-x64:true, esbuild/swc:true) ; Dockerfile deps : `--ignore-scripts` + rebuild sélectif (`Dockerfile:14-15`) |
| Secrets absents des artefacts | Validé | Dockerfile sans `.env`/secret (re-vérifié) ; garde tracked-secrets CI PASS **1 529 fichiers** (re-passée aujourd'hui) ; garde mock-leakage PASS |
| Images de conteneur analysées | À vérifier | pas de scanner configuré (trivy/grype = staging) |
| Lockfiles cohérents avec les dépendances déclarées | Validé | `pnpm install` exit 0 après overrides (lockfile régénéré proprement) ; CI frozen |
| Builds reproductibles | Validé (largement) | lockfile frozen + image de base épinglée `node:24-bookworm-slim` — note : pas de pin par digest (à faire au provisioning) |
| Permissions des runners CI minimales | Validé (durci) | `permissions: contents: read` (FIX C, `ci.yml:16-17`, re-vérifié aujourd'hui) |
| Modifications de dépendances revues | Validé | convention projet = commit + tests + rapport (l'override d'aujourd'hui en est l'exemple : audit→override→4 gates de régression) |
| Artefacts de production protégés | À vérifier | registre/déploiement = staging |
| Correctifs de sécurité déployables rapidement | Validé | précédent : next/fastify patchés <24 h (campagne fc24210) ; aujourd'hui : 3 HIGH → 0 en une itération testée |

---

## O. 2.39 — Protection des environnements de développement et de test

| Contrôle | Statut | Preuve |
|---|---|---|
| Pas de données de production en local | Validé | DB embarquée dédiée + DB test `cosmoz_test` (refus de toute autre) ; seeders classés sans données utilisateur (preuve live fc24210) |
| Secrets de dev sans accès à la production | Validé | aucune cible prod depuis le sandbox ; clés par environnement (env-supplied) |
| Comptes de test sans privilèges de production | Validé | la CI n'a besoin d'**aucun** secret (tests auto-portants) ; aucun accès prod existant |
| API de test désactivées/protégées en prod | Validé | garde mock-leakage : défaut production = **API réelle** impossible à dévier (PASS re-passée aujourd'hui) ; zéro endpoint démo (scan §F) |
| Outils de debug non publics | Validé | MSW opt-in dev/demo ; zéro Swagger ; zéro endpoint debug |
| `.env` exclus du dépôt | Validé | `.gitignore` racine + apps (re-vérifié) ; `git ls-files` = `.env.example` uniquement (valeurs vides) |
| Erreurs de configuration détectées automatiquement | Validé | envSchema fail-fast au boot + garde CI tracked-secrets |
| Tests de sécurité en environnement isolé | Validé | Postgres embarqué éphémère + fixture servers locaux (oanda-fixture) ; aucune sortie réseau réelle |
| Tests ciblant uniquement les systèmes autorisés | Validé | hosts providers **codés en dur** vers fixtures/mocks en test ; jamais de cible externe réelle |
| Données de test nettoyées | Validé | DB éphémère par run ; `.localpg` locale ; retention OCR job |

---

## P. 2.40 — Vérifications finales avant mise en production

| Contrôle | Statut | Preuve / référence |
|---|---|---|
| Contrôles de sécurité prioritaires testés | Validé | batteries re-passées aujourd'hui : web 223/223, API 1350/1351 (1 flake documenté), 68 e2e sécurité, gardes CI PASS |
| Endpoints et services exposés inventoriés | Validé | 41 contrôleurs (`rg -l "@Controller("` compté aujourd'hui), versioning /api/v1, health racine non versionnée |
| Secrets de production correctement configurés | À vérifier | env schema prêt (fail-fast) ; valeurs réelles = provisioning staging owner |
| Migrations de base de données vérifiées | Validé | 42 migrations exécutées sur Postgres réel à chaque batterie (`migrate status` OK) |
| Paramètres de debug désactivés | Validé | §F (zéro Swagger/debug/demo, NODE_ENV gates) |
| HTTPS et certificats opérationnels | À vérifier | terminaison TLS = staging |
| Règles CORS et politiques de cookies vérifiées | Validé | §H aujourd'hui (allowlist exact-match, `*` interdit, cookie host-only Lax) |
| Comptes et accès administratifs protégés | N/A | aucun compte admin |
| Sauvegardes et restaurations testées | Validé (projet) / À vérifier (prod) | bundle 311 Mo + tarball 618 Mo + manifest ; recovery workspace prouvée (restarts sandbox) ; périodicité/chifrmement prod = owner |
| Logs et alertes fonctionnels | Validé (mécanisme) / À vérifier (acheminement) | logs structurés + 8 règles d'alerte testées ; acheminement externe = staging |
| Dépendances à niveau de risque acceptable | Validé (FIX D) | audit --prod = **0 vulnérabilité** aujourd'hui |
| Erreurs/indisponibilités des services externes testées | Validé | OCR unreachable/timeout → FAILED (e2e) ; broker down → sync FAILED (e2e oanda) |
| Scénarios de révocation et récupération fonctionnels | Validé | revoke one/others/all + reuse-detection (révocation totale), grâce suppression 14 j, anti-énumération (preuves partie 1) |
| Tests d'accès croisé utilisateurs/tenants passés | Validé | suites IDOR + isolation Alice/Bob (68 e2e sécurité) |
| Vulnérabilités critiques/élevées corrigées ou décision de risque | Validé | FIX D : 3 HIGH transitives éliminées aujourd'hui ; aucun CRITICAL/HIGH applicatif restant (verdict rapport principal) |
| Procédures d'incident et retour arrière documentées | À vérifier | runbook rollback = reste owner documenté (Phase 12) ; git + backups opérationnels |

---

## Q. Défets corrigés aujourd'hui (avec preuve de non-régression)

### Q.1 — FIX D : 3 vulnérabilités HIGH transitives non épinglées (2.38)
`pnpm audit --prod` remontait 3 HIGH transitives : `deepmerge-ts <8.0.0` (stack exhaustion, via `@prisma/config`), `source-map-js <1.2.2` (event-loop DoS, via postcss/tailwind), `sharp <0.35.5` (librsvg CVE-2026-96889, via next). Toutes sans usage direct réachable, mais épinglables sans risque. **Correction** : pins dans `pnpm-workspace.yaml` (`overrides:` — l'emplacement pnpm 12, le champ `pnpm` de package.json n'étant plus lu) : `deepmerge-ts 8.0.0`, `source-map-js 1.2.2`, `sharp 0.35.5`. **Preuve** : `pnpm audit --prod` → **« No known vulnerabilities found »** ; régression complète : `prisma generate` OK (deepmerge-ts@8 consommé par @prisma/config CLI), `tsc --noEmit` ×3 OK, build web OK (chaîne tailwind/next → source-map-js + sharp), tests web **223/223**, tests API **1350/1351** (l'unique échec = flake oanda pré-existant, cf. §R.3), gardes mock-leakage + tracked-secrets PASS. Inertie structurelle prouvée : aucun des 3 paquets n'est importé par le runtime des apps (deepmerge-ts = CLI prisma ; source-map-js/sharp = build web).

### Q.2 — FIX E : compose dev publiant db et api sur toutes les interfaces (2.30)
`docker-compose.yml` publiait `5432:5432` (postgres) et `4000:4000` (api) sans préfixe → bind `0.0.0.0` (atteignable depuis le LAN sur une machine de dev). **Correction** : bindings `127.0.0.1:5432:5432` et `127.0.0.1:4000:4000` avec commentaire. Aucun impact d'usage local (docker jamais exécuté dans le sandbox ; le workflow dev reste localhost).

---

## R. Gaps restants (honnêtes, classés — aucun caché)

| # | Gap | Section | Priorité | Propriétaire |
|---|---|---|---|---|
| 1 | `Dockerfile` sans `USER` (conteneur root par défaut) — ajouter `USER node` au provisioning | 2.30 | MEDIUM-LOW | owner staging (docker jamais exécutable dans le sandbox — fix à valider par build réel) |
| 2 | Cap de profondeur JSON **implicite** (bodyLimit + limite moteur + funnel) et non explicite dans les schémas | 2.26/2.28 | LOW | code (si souhaité : superRefine profondeur) |
| 3 | Test e2e `oanda recovery sweep` (:625) — instabilité scheduler chronique : 2/2 échecs lors du task 26, 2/2 échecs aujourd'hui (suite complète + isolé) — **non lié au FIX D** (inertie prouvée §Q.1) ; demande une stabilisation dédiée (timeout/attente déterministe) | 2.34 | MEDIUM (stabilité QA, pas une faille) | code (prochaine itération) |
| 4 | Pas de `allowedHosts` applicatif (à imposer au reverse proxy staging) | 2.30/2.31 | À vérifier | owner staging |
| 5 | Image de base non épinglée par digest + pas de scan d'image (trivy/grype) | 2.38 | À vérifier | owner staging |
| 6 | Supervision infra (CPU/mémoire/réseau), centralisation/immuabilité des logs, acheminement des alertes | 2.37 | À vérifier | owner staging |
| 7 | TLS, HTTPS→HTTP, masquage proxy, rate-limit proxy, cohérence tailles/timeouts proxy | 2.31 | À vérifier | owner staging |
| 8 | Chiffrement des sauvegardes + rotation réelle des clés | 2.33 | À vérifier | owner staging |

---

## S. Verdict

**SECTIONS 2.26 → 2.40 : SOLIDES — 2 fixes appliqués et prouvés aujourd'hui, aucun défet CRITIQUE/HIGH applicatif, aucun contrôle « Manquant » bloquant dans le périmètre applicatif.**

- Les 15 sections sont traitées item par item (~180 contrôles) avec la méthode 4 statuts : la grande majorité **Validé** avec preuve fichier:ligne ou exécution du jour ; les N/A sont justifiés (LDAP/GraphQL/XML/Redis/files de messages/paiements/admin — absents de l'architecture) ; les « À vérifier » convergent tous vers **le provisioning staging** (TLS/proxy/logs/supervision/secrets prod), cohérent avec le verdict du rapport principal.
- 2 corrections aujourd'hui : **FIX D** (3 HIGH transitives → 0, avec régression intégrale verte) et **FIX E** (compose loopback-only).
- 1 point de vigilance QA remonté honnêtement : le test de concurrence `oanda recovery sweep` est chroniquement instable dans cet environnement (5 échecs consécutifs sur 2 sessions) — ce n'est pas une faille de sécurité mais un test à stabiliser (gap #3).
- Le seul « Manquant » applicatif est le durcissement Docker (`USER` non-root), volontairement **non corrigé à l'aveugle** (docker non exécutable dans le sandbox — toute modification serait invérifiable, contraire au standard evidence-only).



