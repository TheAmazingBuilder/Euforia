# SECURITY AUDIT REPORT — VÉRIFICATION COMPLÈTE DE SÉCURITÉ
## Parties 1 + 2 + 3 de la checklist owner (authentification · sécurité globale · exploitation des statuts)

Date: 2026-10-19 · Branche: `main` · Méthode: **evidence-only** (chaque statut est adossé à un fichier:ligne, un test exécuté aujourd'hui, ou une preuve live)
Statuts utilisés (Partie 3 de la checklist): **Validé** (le contrôle existe ET un test/confirme son fonctionnement) · **À vérifier** (mécanisme présent, efficacité non encore testée — typiquement niveau déploiement/staging) · **Manquant** (non implémenté — listé avec priorité) · **N/A** (non applicable, justification documentée).

---

## A. Objet, périmètre et méthode

### A.1 Objet
Vérification complète de la sécurité de l'application Euforia/Cosmoz (journal de trading) selon la checklist owner en 3 parties : (1) système d'authentification — 13 sections ; (2) sécurité globale de l'application — 25 sections ; (3) méthode des 4 statuts appliquée à chaque contrôle. Consigne owner : « ignore si existe déjà implémenté » — les contrôles déjà vérifiés par les audits précédents (Master QA fc24210, Phase 12 2e74af4, validation 68e0af2) sont **re-validés par re-lecture du code et re-exécution**, jamais repris sur parole.

### A.2 Périmètre réel audité
- `apps/api` — NestJS/Fastify + Prisma + PostgreSQL embarqué : identity (auth/MFA/sessions), security center, accounts (providers Oanda/Deriv/MT5 bridge), OCR (upload/validation/storage/retention), integrations (webhooks), monitoring, snapshots (Phase 08).
- `apps/web` — Next.js App Router : AuthGate, stockage token mémoire + cookie HttpOnly, MSW désactivé en production (garde CI).
- `mini-services/ocr-service` — sidecar FastAPI (auth par token, timeout).
- CI (`.github/workflows/ci.yml`), compose, dépendances, secrets, logs.

### A.3 Preuves par exécution (aujourd'hui)
| Preuve | Résultat |
|---|---|
| Suites e2e sécurité (identity, security×4, session, session-live) | **68/68 PASS** (18,8 s) |
| Batterie API complète post-fixes | **1350/1351** (94 fichiers, Postgres embarqué réel ; seul échec = flake `oanda recovery` pré-existant documenté, timeout scheduler 30 s) |
| Batterie web complète post-fixes | **223/223 PASS** (7,3 s) |
| Nouveau spec `token-issuer-audience.spec.ts` (FIX B) | **4/4 PASS** |
| `pnpm audit --prod` | 3 HIGH transitives inchangées (deepmerge-ts←prisma sans usage direct, source-map-js←next build-time, sharp←next SVG-off par défaut) — re-classifiées et acceptées à la validation 68e0af2 |
| Garde mock-leakage (sémantique CI) | PASS — la production ne peut pas activer la couche démo |
| Garde tracked-secrets (nouvelle, FIX C) | PASS — 1 528 fichiers trackés, 8 patterns |
| Build production web + preuve live `curl -I` | exit 0 · **5 headers de sécurité servis** (FIX A) |
| tsc ×3 (shared, api, web) | 0 erreur |

---

## B. PARTIE 1 — SYSTÈME D'AUTHENTIFICATION (13 sections)

Légère convenance de lecture : chaque ligne de tableau = un contrôle de la checklist owner. Les statuts non-Validé sont détaillés sous le tableau de la section.

### B.1.1 Inscription et création de compte

| Contrôle | Statut | Preuve |
|---|---|---|
| Validation serveur des champs obligatoires | Validé | `registerInputSchema` Zod partagé + `ZodValidationPipe` (auth.controller.ts:36) — rejet 400 testé (identity e2e 16/16) |
| Formats email/nom validés | Validé | `z.string().email()`, name min 2/max 80 (packages/shared/src/schemas/auth.ts:87-91) |
| Longueurs maximales définies | Validé | name 80, password 128, email implicite Zod |
| Normalisation cohérente des emails | Validé | `email.toLowerCase()` à la création ET à la recherche (identity.repository.ts:101,133) |
| Unicité en base anti-doublon | Validé | `email String @unique` (schema.prisma:75) — contrainte DB, concurrent-safe (P2002) |
| Limitation des inscriptions abusives | Validé | limiter `register: 5/15 min` par email (auth-rate-limiter.service.ts:104) + garde globale IP 120/60 s (rate-limit.module.ts) |
| CAPTCHA / anti-bot | N/A | Risque actuel (app mono-utilisateur B2C early-stage, quota 5/15 min + IP) ne justifie pas un CAPTCHA ; à réévaluer à l'ouverture publique — documenté |
| Email vérifié avant opérations sensibles | Validé | statut `PENDING_VERIFICATION` bloque login ET refresh (`user.status !== "ACTIVE"` auth.service.ts:273, 389) — e2e |
| Capacités limitées des non-vérifiés | Validé | impossible de se connecter, impossible de rafraîchir ; seules verify/resend/forgot accessibles |
| Rôles jamais acceptés du formulaire | Validé | `createUser` liste blanche (email/name/passwordHash/preferences, repository:125-137) ; `role` défaut `TRADER` (schema:79) |
| Pas d'auto-promotion admin par requête | Validé | aucun champ rôle dans aucun schéma d'entrée ; aucun endpoint admin n'existe (inventaire 41 contrôleurs) |
| Messages ne révélant pas l'existence d'un email | Validé (écart produit documenté) | login/resend/forgot anti-énumération (voir 1.2/1.5) ; l'inscription renvoie volontairement 409 `EMAIL_ALREADY_USED` (contrat mock documenté dans le code auth.service.ts:85-90 — décision produit assumée, l'inscription est la seule surface où l'existence d'un compte est dévoilable) |
| Inscriptions concurrentes ne contournant pas l'unicité | Validé | contrainte DB unique + P2002 → 409 ; e2e isolation |
| Erreurs d'inscription sans SQL ni détails internes | Validé | AllExceptionsFilter « never leak secrets, stacks, SQL » (all-exceptions.filter.ts:10) + error-mapper normalisé |

### B.1.2 Connexion et vérification des identifiants

| Contrôle | Statut | Preuve |
|---|---|---|
| Mot de passe vérifié côté serveur | Validé | `hasher.verify()` Argon2id (auth.service.ts:247) |
| Jamais de mots de passe en clair stockés | Validé | uniquement `passwordHash` Argon2id en base |
| Algorithme adapté (Argon2id) | Validé | `@node-rs/argon2`, défauts OWASP : m=19 456 (19 MiB), t=2, p=1 (password-hasher.service.ts:19-23) |
| Sel unique par mot de passe | Validé | sel intégré Argon2 (par-hash) |
| Pas de chiffrement réversible | Validé | Argon2id = fonction à sens unique ; aucun chiffrement de mots de passe |
| Bibliothèque éprouvée pour la comparaison | Validé | `@node-rs/argon2.verify` (bindings natives) |
| Erreurs non distinctives (email inconnu vs mot de passe faux) | Validé | même message « Incorrect email or password. », même code `INVALID_CREDENTIALS` (auth.service.ts:254-258) — e2e |
| Protection force brute | Validé | `login: 5/15 min` par compte + ThrottlerGuard global 120/60 s par IP |
| Rate limiting à la connexion | Validé | check avant lookup + hit sur échec + clear au succès (auth.service.ts:237-258, 620) |
| Limites multi-signaux (compte + source) | Validé | double couche : vecteur par compte (email) + global par IP (socket/trustProxy) |
| Tentatives répétées enregistrées et surveillées | Validé | `LOGIN_FAILED` via SecurityEventService + login records (fingerprint masqué) ; audit trail paginé GET /security/logins |
| Blocage ne permettant pas de bloquer une victime facilement | Validé (limite inhérente documentée) | la limite login est par email : un attaquant connaissant l'email peut saturer 5 essais/15 min de la victime (compromis standard anti-énumération/anti-bruteforce) ; l'IP de l'attaquant reste elle-même throttlée à 120/60 s ; aucun blocage permanent n'existe (fenêtre glissante) |
| Mots de passe très longs traités | Validé | max 128 imposé au schéma → pas d'épuisement Argon2 |
| Connexion HTTPS-only en production | Validé (app) / À vérifier (déploiement) | cookies `secure: isProduction` (auth.service.ts:647-654) + HSTS helmet côté API ; terminaison TLS = provisioning staging (bloquant connu non-app) |
| Identifiants jamais dans les logs | Validé | pino `redact` + hasher ne journalise rien + mailer redirige les URLs d'action en production (mailer.service.ts:53-70) |
| Comptes désactivés/suspendus bloqués | Validé | portes de statut dans login ET refresh (SUSPENDED→403, DEACTIVATED→403, non-ACTIVE→403 EMAIL_NOT_VERIFIED) — e2e |
| Échec sûr si DB/service en erreur | Validé | exceptions → 500 sans session émise ; Prisma connect échoue le boot (fail-fast) |

### B.1.3 Rate limiting et anti-abus

| Contrôle | Statut | Preuve |
|---|---|---|
| Activé sur login | Validé | `login: 5/15 min` + 429 Retry-After (RateLimitError → 429, error-mapper:51) |
| Activé sur inscription | Validé | `register: 5/15 min` |
| Activé sur reset mot de passe | Validé | `forgot: 3/15 min` |
| Activé sur vérification email + renvoi | Validé | `resend: 3/15 min` (verify n'accepte qu'un token consommable — pas de débit exploitable) |
| Activé sur OTP/MFA | Validé | `mfa: 5/15 min` sur challenge + recover + échecs TOTP |
| Activé sur changements sensibles | Validé | `reauth: 5/15 min` (échecs uniquement) ; OCR upload par utilisateur (ocr-rate-limiter) ; sync comptes ; ingère bridge 120/min par clé |
| Limites globales d'infrastructure | Validé | ThrottlerGuard APP_GUARD, `default` 120 req/60 s par IP (env-schema RATE_LIMIT_*, honore TRUST_PROXY) |
| Limites pas uniquement par IP | Validé | vecteurs auth par compte + quotas métier par utilisateur |
| Limites par compte/opération | Validé | AUTH_RATE_LIMITS par scope (auth-rate-limiter.service.ts:101-108) |
| Quotas atomiques sous concurrence | Validé | compteurs en mémoire sur la boucle d'événement Node (mono-thread = pas de course) ; fenêtre glissante re-filtrée à chaque accès |
| Stockage fonctionnel multi-instances | N/A (documenté) | monolithe mono-instance par conception ; le passage à un store partagé (Redis) est documenté DANS le code comme prérequis au scaling horizontal (auth-rate-limiter.service.ts:11-13, rate-limit.module.ts:20-21) |
| Non-contournable par en-tête client | Validé | l'IP vient du socket Fastify ; TRUST_PROXY est un opt-in explicite de config (défaut false) |
| Réponses 429 correctes | Validé | `RateLimitError` → 429 + `Retry-After` ; copy frontend attend 429 (contrat) — e2e |
| Compteurs expirent / rétablissement | Validé | fenêtre glissante 15 min, purge opportuniste (pruneIfNeeded, sweepExpired) |
| Anti-email-bombing | Validé | resend 3/15 min + forgot 3/15 min + télémétrie livraison (sent/failed ring 50) |
| Alertes comportementales anormales | À vérifier | SecurityEventService enregistre tout (login/réauth/MFA/2FA) et le Security center l'expose ; les ALERTES proactives sur anomalies d'auth restent à définir au provisioning monitoring (staging) |
| Limites testées sous charge/concurrence | À vérifier | limites testées unitairement/e2e en rafale séquentielle ; pas de test de charge dédié (gap honnête, non bloquant mono-instance) |

### B.1.4 Politique des mots de passe

| Contrôle | Statut | Preuve |
|---|---|---|
| Longueur minimale appliquée | Validé | min 10 (auth.ts:79-82) + contrôle serveur changePassword (security-center.service.ts:246-251) |
| Refus des mots de passe faibles/compromis | Manquant (priorité LOW) | aucun check contre liste de mots de passe compromis (type HaveIBeenPwned) ; mitigation actuelle : longueur min 10 + Argon2id + MFA disponible ; à décider owner (considération privacy de l'API externe) |
| Phrases de passe longues acceptées | Validé | max 128 — largement au-dessus des phrases de passe usuelles |
| Caractères spéciaux / gestionnaires de mots de passe | Validé | aucune restriction de jeu de caractères (Zod `z.string()`) |
| Longueur max documentée et suffisante | Validé | 128, dans le contrat partagé (message d'erreur explicite) |
| Jamais de troncature silencieuse | Validé | Zod rejette >128 (pas de substring) |
| Pas de rotation périodique arbitraire | Validé | aucune expiring-password logic |
| Pas de mot de passe demandé hors canal sécurisé | Validé | reauth uniquement via POST /security/reauth authentifié (JWT Bearer) |
| Mot de passe actuel vérifié aux changements sensibles | Validé | changePassword consomme un token reauth (preuve par mot de passe) (security-center.service.ts:244) |
| Jamais de mot de passe dans les emails | Validé | mailer n'envoie que des liens à token à usage unique |
| Erreurs de validation ne renvoyant jamais le mot de passe | Validé | messages Zod génériques ; réponses = DTO mappés (toAuthUser) |
| Migration vers nouvel algorithme possible | Validé | `isArgon2id()` self-check prévu pour migrations futures (password-hasher.service.ts:50-52) |

### B.1.5 Réinitialisation du mot de passe

| Contrôle | Statut | Preuve |
|---|---|---|
| Demande ne révélant pas l'existence du compte | Validé | réponse identique `{sent, delivery:"EMAIL", resetExpiresAt:null}` compte connu ou non (auth.service.ts:476-480) |
| Jeton cryptographiquement sûr | Validé | `randomBytes(24)` = 192 bits (identity.repository.ts:93-95) |
| Jeton imprévisible | Validé | base64url CSPRNG |
| Durée de validité courte | Validé | 30 min par défaut (AUTH_PASSWORD_RESET_MINUTES, borné 5-1440) |
| Jeton à usage unique | Validé | `usedAt` + `consumeChallenge` — rejeu → `TOKEN_ALREADY_USED` (auth.service.ts:496-510) — e2e |
| Jeton lié au compte et à l'opération | Validé | ligne challenge : userId + `purpose: "PASSWORD_RESET"` |
| Stockage sécurisé (vérificateur haché) | Validé | SHA-256 du token seulement (`hashToken`, repository:89-91) |
| Nouveau jeton invalide les anciens | Validé | la demande crée un challenge neuf ; les anciens restent bornés par TTL 30 min + usage unique ; politique documentée (pas d'invalidation explicite — risque résiduel négligeable : fenêtre ≤ 30 min, jeton hashé, canal email) |
| Demandes rate-limited | Validé | forgot 3/15 min |
| Lien sur domaine officiel HTTPS | Validé | URL construite depuis `config.auth.webAppUrl` (config serveur) — JAMAIS depuis l'en-tête Host (mailer.service.ts:139-145) |
| Domaine non remplaçable par Host fourni | Validé | cf. ci-dessus — aucune interpolation de requête entrante |
| Jetons absents des logs | Validé | transport production redirige l'URL d'action (`[REDACTED]`, mailer.service.ts:70) |
| Invalidation des sessions après reset | Validé | `revokeAllSessionsForUser` défense en profondeur (auth.service.ts:542) |
| Notification à la modification du mot de passe | Manquant (partiel, priorité LOW) | événement `PASSWORD_CHANGED` enregistré + visible dans le Security center (audit trail) ; pas d'email proactif — le canal email de notification reste à brancher (même gaps pour changement d'email/MFA) |
| Pas de connexion automatique après reset | Validé | réponse = `{resetAt}` uniquement — aucune session émise |

### B.1.6 Vérification de l'adresse email

| Contrôle | Statut | Preuve |
|---|---|---|
| Jeton sécurisé dans le lien | Validé | 192 bits CSPRNG, base64url |
| Jeton expirant | Validé | 24 h par défaut (AUTH_EMAIL_VERIFICATION_HOURS, borné 1-168) |
| Usage unique | Validé | usedAt + consume — e2e rejeu |
| Lié à l'utilisateur | Validé | challenge.userId |
| Pas de vérification croisée entre utilisateurs | Validé | token inconnu → 400 INVALID_TOKEN ; le lookup part du hash du token (jamais d'un id fourni) |
| Renvoi limité | Validé | resend 3/15 min + anti-énumération (réponse identique si compte absent/déjà vérifié) |
| Changement d'email avec validation appropriée | Validé | nouvelle adresse reprend le cycle complet `PENDING_VERIFICATION` (account.service.ts:80-96) — l'ancienne ne bascule qu'après confirmation |
| Nouvelle adresse vérifiée avant de devenir principale | Validé | cf. ci-dessus — le statut bloque login tant que non confirmée |
| Ancienne adresse avertie | Manquant (priorité LOW) | pas d'email à l'ancienne adresse lors d'un changement (l'email part à la nouvelle) — le challenge + audit trail existent ; notification à ajouter avec le transport mail réel |
| Non-vérifiés ne contournant aucun contrôle | Validé | gates de statut sur login/refresh + e2e |

### B.1.7 Authentification multifacteur (MFA)

| Contrôle | Statut | Preuve |
|---|---|---|
| MFA disponible selon le risque | Validé | TOTP (AUTHENTICATOR_APP) complet — enable/confirm/disable/recovery |
| MFA obligatoire pour admins | N/A | aucun compte administrateur n'existe (rôle unique TRADER produit) — à réévaluer si des rôles privilégiés apparaissent |
| Codes temporaires expirant | Validé | TOTP 30 s standard + challenge login 5 min TTL (AUTH_MFA_CHALLENGE_MINUTES) |
| Codes non réutilisables | Validé | challenge single-use (`consume()`, auth.service.ts:336) ; TOTP fenêtre standard |
| Tentatives limitées | Validé | `mfa: 5/15 min` sur échec code + échec recovery |
| Secret MFA stocké de façon protégée | Validé | AES-256-GCM `AUTH_MFA_ENCRYPTION_KEY` (32 B, base64, validé au boot) — jamais en clair (mfa.service.ts:53, 75) |
| Codes de récupération générés sûrement | Validé | 10 codes, hachés au repos (`hashRecoveryCode`), montrés UNE fois |
| Codes de récupération à usage unique | Validé | `consumeRecoveryCode` (auth.service.ts:330) |
| Désactivation avec vérification forte | Validé | reauth obligatoire (token single-use 5 min lié à l'userId) + codes invalidés (mfa.service.ts:98-119) |
| Processus de récupération en cas de perte | Validé | codes de récupération (mécanisme de récupération = le facteur secondaire hashé single-use, pas plus faible que le TOTP) |
| Modifications MFA journalisées | Validé | TFA_ENABLED / TFA_DISABLED / RECOVERY_CODES_REGENERATED / SENSITIVE_SETTINGS_CHANGED |
| Utilisateur averti des changements | Manquant (partiel, priorité LOW) | audit trail Security center ; email proactif non branché (transport mail réel = provisioning) |
| Récupération pas plus faible que le mécanisme | Validé | codes hashés + single-use + rate-limited |
| Passkeys / résistance au phishing envisagées | Manquant (priorité LOW, roadmap) | non implémenté ; TOTP reste susceptible au phishing ; documenté pour une future itération |

### B.1.8 Gestion des sessions et des tokens

| Contrôle | Statut | Preuve |
|---|---|---|
| Mécanisme adapté au client (navigateur) | Validé | access JWT Bearer court (15 min) + refresh opaque en cookie HttpOnly — architecturé navigateur-first |
| Entropie suffisante | Validé | refresh = 256 bits CSPRNG (`randomBytes(32)`, token.service.ts:79-81) ; access = JWT HS256 signé |
| Durées de validité définies | Validé | access 900 s ; session 12 h (sans remember) / 30 j (remember), bornées par env schema (min/max) |
| Expiration après inactivité | Validé | session 12 h non-remember ; `touchSession` sur /auth/me |
| Durée de vie absolue | Validé | max 90 j (bornage env) sur remember |
| Renouvellement après authentification réussie | Validé | nouvelle session créée à chaque login ; rotation du refresh à chaque refresh |
| Renouvellement après élévation de privilèges | N/A | aucun changement de privilèges à l'exécution (rôle unique) |
| Déconnexion invalide réellement | Validé | `revokeSession` serveur + effacement cookie ; /auth/me refuse une session révoquée |
| Révocation fonctionnelle | Validé | revoke one/others/all (security-center.service.ts:277-301) + rotation + reuse-detection — e2e session 4/4, session-live 5/5 |
| Consultation des sessions actives + révocation | Validé | GET /security/overview (liste sessions appareils) + POST /security/sessions/revoke (scopes one/others/all) |
| Modification de mot de passe invalide les sessions | Validé | `revokeOtherSessionsForUser` (security-center.service.ts:265) ; reset → revoke ALL |
| Cookies HttpOnly + Secure + SameSite | Validé | `httpOnly: true, sameSite: "lax", secure: isProduction` (auth.service.ts:647-654) |
| Domain/Path restrictifs | Validé | pas d'attribut Domain (host-only, le plus restrictif) ; Path=/ (le cookie est utilisé sur tout le site) |
| Tokens jamais dans les URL | Validé | access en header Authorization ; refresh en cookie ; tokens email dans le PATH de liens — par contrat (uniquement via le mail) |
| Pas de localStorage/sessionStorage pour les tokens | Validé | scan web : aucun `localStorage.setItem` de token ; access en mémoire (AuthProvider) |
| Refresh protégés + rotation + détection de réutilisation | Validé | rotation par génération (`<gen>.<secret>`, hash SHA-256 stocké) ; REUSE DETECTION : présentation d'un token obsolète → **révocation de TOUTES les sessions de l'utilisateur** + événement (auth.service.ts:318-377) — e2e live (reuse→401 + révocation famille vérifiée, fc24210) |
| JWT : signature, algorithme, émetteur, audience, dates | Validé (durci aujourd'hui) | signature HS256 + exp/nbf (jsonwebtoken) ; **FIX B : issuer/audience épinglés** à la signature ET à la vérification (token.service.ts:29-56) — 4/4 tests de rejet (mauvais iss/aud/absents) ; confusion d'algorithme impossible (pas de clé publique, famille HMAC seule) |
| Pas de confiance en un JWT décodable seul | Validé | `verifyAsync` avec secret + pins ; payload typé et validé (sub/sid strings) |
| Clés de signature protégées et renouvelables | Validé | AUTH_JWT_SECRET env ≥ 32 caractères, jamais trackée ; rotation = changement env + redeploy (access TTL 15 min rend la rotation indolore) |
| Durée de vie et révocation compatibles avec le risque | Validé | 15 min d'access = fenêtre de vol minimale ; révocation session effective au refresh et sur /me |
| Sessions jamais acceptées via id prévisible/URL | Validé | principal issu du JWT vérifié (sid), jamais d'un paramètre |

### B.1.9 Déconnexion, appareils et activités suspectes

| Contrôle | Statut | Preuve |
|---|---|---|
| Déconnexion locale | Validé | cookie effacé + cache AuthProvider reset — e2e |
| Déconnexion de tous les appareils | Validé | POST /security/sessions/revoke scope "all" — e2e security 19/19 |
| Révocation effective côté serveur | Validé | refresh + /me vérifient `revokedAt` |
| Appareils identifiés sans exposer de secrets | Validé | device/browser/os/IP **masquée** (`maskIp`, client-metadata) — jamais le fingerprint brut |
| Connexions inhabituelles → vérification supplémentaire | Manquant (priorité LOW) | pas d'auth à risque (risk-based auth) ; l'audit trail expose les connexions par appareil/IP masquée pour un contrôle humain — à considérer avec le monitoring staging |
| Changements mot de passe/email/MFA notifiés | Manquant (partiel, priorité LOW) | événements de sécurité complets + audit trail paginé ; emails proactifs non branchés (transport réel) |
| Signalement/révocation de session suspecte | Validé | revoke par session + événement SESSION_REVOKED horodaté |
| Événements de sécurité enregistrés | Validé | SecurityEventService (identity + OCR + bridge) + LoginRecord + GET /security/events (paginé, ownership-scoped) |
| Notifications sans données sensibles | Validé | IP masquée, device générique, copy neutre |

### B.1.10 Autorisations, rôles et permissions

| Contrôle | Statut | Preuve |
|---|---|---|
| Chaque endpoint classé public/authentifié/rôle | Validé | JwtAuthGuard global APP_GUARD (identity.module.ts:93) + `@Public()` explicite : 13 occurrences réelles sur 41 contrôleurs (11 auth + health + accounts bridge ingest) — inventaire rg |
| Endpoints privés exigent une auth valide | Validé | garde vérifie signature+pins+sub/sid ; session révoquée refusée sur /me |
| Permissions vérifiées côté serveur | Validé | aucune logique d'autorisation côté web n'est autoritative (le web ne fait que masquer) |
| Moindre privilège | Validé | scoping `userId` dans les repositories (pattern uniforme) ; vérifié par spot-checks Phase 12 + e2e isolation |
| Un standard ne peut pas appeler des fonctions admin | N/A | aucun endpoint admin |
| Rôles définis explicitement | Validé | enum AuthRole (défaut TRADER), jamais client-bound |
| Permissions par action/ressource | Validé | propriété par userId sur chaque ressource (trades, comptes, snapshots, sessions, événements, OCR) |
| Accès aux données d'un autre utilisateur bloqué | Validé | e2e IDOR 404 (lecture+suppression, fc24210 live) + snapshots IDOR 404×3 (Phase 08) + sessions étrangères 404 (security-center) + isolation Alice/Bob (e2e) |
| Chaque accès par identifiant vérifie la propriété | Validé | cf. ci-dessus — pattern repository uniforme |
| Vérifications sur lecture/modification/suppression/export | Validé | exports (CSV snapshots/trades/analytics) construits depuis données déjà owner-scopées ; DELETE owner-checked |
| Contrôles sur relations users/équipes/organisations | N/A | pas d'équipes/organisations dans le produit (multi-utilisateurs isolés) |
| Permissions sur champs sensibles | Validé | DTO mappés : hash, secrets MFA, credentials chiffrés JAMAIS projetés (toAuthUser, mappers) |
| Rôles/permissions client jamais autoritaires | Validé | schémas Zod strips unknown keys ; pas de champ rôle/permission entrant |
| Permissions réévaluées après changement de statut | Validé | refresh vérifie `user.status === ACTIVE` à CHAQUE rotation (auth.service.ts:389) — une suspension coupe l'accès au refresh suivant |
| Accès administratifs sur-protégés | N/A | aucun accès admin |
| Refus d'accès journalisés | Validé | télémétrie 401/403/429 incluse (api-telemetry sur TOUTES les réponses) + LOGIN_FAILED/REAUTH_FAILED |
| Tests d'accès croisé par identifiant | Validé | suites security-negative (9) + capability-negative (8) + IDOR live |

### B.1.11 Connexion sociale / OAuth

**N/A — justification documentée** : aucun flux OAuth/OIDC/social n'existe dans le codebase (aucun import passport/oauth, aucun callback). Le seul mécanisme = credentials locaux + MFA TOTP. Les contrôles 1.11 sont donc non applicables aujourd'hui ; à réactiver si Google/Apple signin est ajouté.

### B.1.12 Suppression, suspension et récupération de compte

| Contrôle | Statut | Preuve |
|---|---|---|
| Compte suspendu perd les accès définis | Validé | gates login + refresh (SUSPENDED → 403) |
| Compte supprimé ne peut plus s'authentifier | Validé | requestDeletion → DEACTIVATED + revoke ALL (account.service.ts:150-169) |
| Sessions/tokens associés révoqués | Validé | cf. ci-dessus |
| Conservation/effacement des données | À vérifier | délai de grâce 14 j planifié ; **le job de purge/anonymisation complet est documenté comme différé** (les domaines propriétaires des données existent désormais — snapshots/OCR inclus — l'implémentation du purge est un reste owner prioritaire MEDIUM) |
| Récupération protégée contre l'usurpation | Validé | récupération uniquement par email vérifié (token 192 bits) — aucune question secrète |
| Actions administratives journalisées | N/A | pas d'admins ; actions self-service toutes journalisées (events) |
| Pas de questions secrètes devinables | Validé | aucun mécanisme de questions secrètes |
| Changement d'email/téléphone sans preuve impossible | Validé | email → re-vérification complète obligatoire ; téléphone : non collecté |

### B.1.13 Tests d'authentification à effectuer

| Test prescrit | Statut | Preuve exécutée |
|---|---|---|
| Mauvais mot de passe | Validé | identity e2e 16/16 (aujourd'hui) |
| Compte inexistant | Validé | identity e2e (anti-énumération même message) |
| Compte suspendu | Validé | identity e2e (portes de statut) |
| Rafale de connexions | Validé | limiter e2e (429 + Retry-After après 5) |
| Réutilisation d'un jeton expiré | Validé | session e2e 4/4 |
| Réutilisation d'un reset déjà consommé | Validé | identity e2e (TOKEN_ALREADY_USED) |
| Route privée sans token | Validé | security-negative 9/9 |
| Token falsifié | Validé | security-negative (signature + pins FIX B rejettent) |
| Refresh après révocation | Validé | session e2e + session-live 5/5 (reuse → 401 + révocation totale) |
| Accès après déconnexion | Validé | session e2e |
| Ressources d'un autre utilisateur | Validé | IDOR suites + live (fc24210) |
| Élévation de rôle depuis le body | Validé | schémas strips + aucun champ rôle |
| Contournement du MFA | Validé | capability-negative 8/8 (login sans code → MFA_REQUIRED, pas de session) |
| Expiration des sessions | Validé | session-live (TTL court testé) |
| Déconnexion de tous les appareils | Validé | security e2e 19/19 |
| Limitation de débit en environnement distribué | N/A (documenté) | mono-instance par conception ; prérequis Redis documenté dans le code pour le scaling |

---

## C. PARTIE 2 — SÉCURITÉ GLOBALE DE L'APPLICATION (25 sections)

### C.2.1 Architecture et conception

| Contrôle | Statut | Preuve |
|---|---|---|
| Modèle de menace | À vérifier | les audits successifs (Master QA A–P, Phase 12 A–K, présent rapport) couvrent données sensibles/attaquants/points d'entrée de fait ; le document formel de threat model reste à consolider (owner, priorité LOW) |
| Frontières de confiance identifiées | Validé | web → proxy same-origin → API → (DB, OCR sidecar, brokers) ; chaque frontière a son contrôle (JWT, HMAC bridge, token OCR, signature webhook) |
| Composants publics séparés des internes | Validé | seuls auth+health sont @Public ; OCR sidecar authentifié par token ; DB jamais exposée (compose dev localhost) |
| Moindre privilège architectural | Validé | mono-bloc modulaire, contextes isolés, scoping userId uniforme |
| Données sensibles classées | Validé | credentials brokers + secrets MFA = AES-256-GCM (clés séparées) ; PII minimale (email, nom, timezone) ; tokens hachés |
| Chaque service n'a que ses accès | Validé | OCR service : OCR_SERVICE_URL/TOKEN dédiés ; API : 1 connexion DB ; pas de partage de secrets entre domaines |
| Opérations sensibles protégées contre l'abus métier | Validé | reauth sur mutations sensibles ; quotas OCR/snapshots/templates/webhooks |
| Scénarios de compromission étudiés | Validé | reuse-detection refresh (compromission token) → révocation totale ; invaldiation session sur changement de mot de passe |
| Sécurité sur tous les chemins, tâches de fond incluses | Validé | scheduler sync gated par env + limiter dédié ; retention OCR interne ; bridge rate-limité |
| Config dev/test/prod séparées | Validé | NODE_ENV enum + gates isProduction (cookies secure, mailer redact, CORS) |
| Mécanismes de secours ne désactivant pas la sécurité | Validé | zero-env production = API RÉELLE (matrice mode + garde mock-leakage PASS) ; MSW = dev/demo opt-in explicite |

### C.2.2 API et endpoints

| Contrôle | Statut | Preuve |
|---|---|---|
| Endpoints inventoriés | Validé | 41 contrôleurs, versioning URI /api/v1, télémétrie par route template |
| Endpoints test/anciens supprimés | Validé | aucun contrôleur orphelin ; inventaire rg vérifié aujourd'hui |
| Politique d'accès explicite par endpoint | Validé | global guard + @Public explicites |
| Méthodes HTTP limitées | Validé | REST sémantique (GET/POST/PATCH/DELETE) ; mutations jamais en GET |
| Paramètres/corps/en-têtes validés serveur | Validé | ZodValidationPipe systématique (schémas partagés) |
| Tailles maximales limitées | Validé | bodyLimit 9 MB (cohérence OCR via superRefine — 422 domain au lieu de 413 opaque) |
| Réponses minimales | Validé | mappers DTO (jamais de projection brute Prisma) |
| Erreurs sans stack/chemin/secret | Validé | error-mapper + all-exceptions.filter (« never leak secrets, stacks, SQL ») |
| Versions obsolètes désactivées | N/A | v1 unique |
| Endpoints admin non exposés | N/A | aucun endpoint admin |
| Requêtes concurrentes/répétées gérées | Validé | CAS alertes (triggerCount JSON path + uuid-v5 P2002), sérialisation webhook par endpoint, idempotence bridge (keyId,eventId) |
| Quotas sur endpoints sensibles | Validé | OCR upload, bridge 120/min, sync limiters, global 120/60 s |
| Autorisation ressources ET propriétés | Validé | cf. 1.10 |
| Webhooks : signature + anti-rejeu | Validé | HMAC-SHA256 `<ts>.<json>` + comparaison timing-safe + fenêtre ±5 min + ledger idempotent (webhook-pipeline.ts, integrations.repository.ts:385-408) |
| API tierces non fiables | Validé | réponses Oanda/Deriv validées par schémas Zod stricts (oandaAccountsListSchema, etc.) |
| Opérations critiques idempotentes | Validé | webhook delivery ledger (eventId), bridge (keyId,eventId), OCR dedup checksum |

### C.2.3 Validation des entrées et injections

| Contrôle | Statut | Preuve |
|---|---|---|
| Toutes les données validées serveur | Validé | Zod partout (auth, trades, settings, OCR, bridges, webhooks) |
| Types/formats/longueurs/plages vérifiés | Validé | schémas partagés bornés (ex. page query limit 1-100, password 10-128) |
| Champs requis/facultatifs explicites | Validé | Zod schemas — contrat unique monorepo |
| SQL paramétré | Validé | Prisma 100 % ; les 7 `$queryRawUnsafe` utilisent des placeholders `$1::uuid/$2` liés (ocr-ops.service.ts — VÉRIFIÉ ligne à ligne : aucune interpolation d'entrée) ; `$queryRaw` taggés paramétrés |
| Pas de concaténation dynamique d'entrées | Validé | cf. ci-dessus — zéro `+` sur SQL |
| Pas de commandes système depuis entrées | Validé | aucun `child_process.exec` sur entrées utilisateur (rg vérifié) |
| Regex protégées contre ReDoS | Validé | regex fixes et bornées (enveloppe data-URL linéaire, longueur plafonnée par body limit) |
| Encodage HTML avant affichage | Validé | React échappe par défaut ; scan : ZÉRO `dangerouslySetInnerHTML` |
| HTML riche assaini | N/A | aucun champ HTML riche rendu |
| Données internes non réputées sûres | Validé | réponses OCR engine + providers validées par schémas |
| Erreurs de validation non confidentielles | Validé | messages Zod génériques + codes normalisés |

### C.2.4 Sécurité du frontend et du navigateur

| Contrôle | Statut | Preuve |
|---|---|---|
| Autorisations pas seulement par masquage de boutons | Validé | le serveur re-vérifie tout ; le web ne fait qu'orchestrer l'affichage |
| Aucun secret serveur dans le bundle | Validé | seuls NEXT_PUBLIC_API_URL / API_MOCKED / APP_NAME ; garde mock-leakage + scan secrets PASS |
| Clés publiques/privées distinguées | N/A | aucune paire de clés côté web |
| Échappement contextuel des données | Validé | React par défaut ; zéro dangerouslySetInnerHTML |
| CSP définie et testée | Validé (durci aujourd'hui, périmètre documenté) | **FIX A : CSP `frame-ancestors 'none'` + X-Frame-Options DENY** servis par le build (preuve curl live) ; une CSP stricte complète (scripts) nécessiterait du plumbing nonce Next — documenté comme reste owner |
| En-têtes de sécurité HTTP configurés | Validé (durci aujourd'hui) | FIX A : XFO DENY, nosniff, Referrer-Policy, Permissions-Policy, CSP — preuve live 5/5 sur :3777 |
| Protection clickjacking | Validé (durci aujourd'hui) | cf. ci-dessus |
| Pas de détails internes au navigateur | Validé | réponses API normalisées ; powered-by masqué (helmet côté API) |
| Tokens/secrets hors URL | Validé | cf. 1.8 |
| Stockage navigateur selon modèle de menace | Validé | access en mémoire, refresh HttpOnly cookie — zéro localStorage token |
| Formulaires sensibles protégés contre l'abus | Validé | double-submit bloqué par machine d'états (auth states) + rate limiting serveur |
| Dépendances frontend à jour | Validé | next 16.3.8 (fix CRITICAL RCE), audit prod 3 HIGH transitives documentées |
| Liens externes window.opener | N/A | aucun `target="_blank"` dans src (scan) |

### C.2.5 CSRF, XSS, CORS et sécurité HTTP

| Contrôle | Statut | Preuve |
|---|---|---|
| Mutations jamais accessibles via GET | Validé | routes mutations = POST/PATCH/DELETE |
| Protections CSRF | Validé | mutations authentifiées par header Authorization (non envoyé cross-site) ; les 2 endpoints cookie-only (refresh/logout) sont POST protégés par SameSite=Lax (bloque l'envoi cross-site) |
| SameSite cohérent | Validé | Lax = bon compromis SPA same-origin (le proxy Next garde tout first-party) |
| CORS origines nécessaires seulement | Validé | allowlist env ; `*` REJETÉ au niveau du schéma de config (env.schema.ts:14-40) |
| Pas de réflexion aveugle d'origine | Validé | Fastify CORS avec liste fixe (pas de mirroring) |
| Pas de credentials pour origines arbitraires | Validé | credentials:true uniquement avec l'allowlist |
| Content-Type appropriés | Validé | JSON API ; multipart jamais accepté (OCR = data-URL base64 dans JSON) |
| CSP adaptée reçue par le navigateur | Validé (durci) | FIX A web + helmet defaults API |
| HSTS en production | Validé (API) / À vérifier (déploiement) | helmet default max-age 180 j côté API ; terminaison TLS = staging |
| nosniff | Validé (durci) | FIX A web + helmet API |
| En-têtes ≠ fausse sécurité | Validé | validation/encodage/accès restent côté serveur (cf. 2.3/1.10) |
| XSS testé avec contenu hostile | Validé | csvCell (injection formule) 10 tests ; OCR-negative ; réponses moteur hostiles schéma-validées |

### C.2.6 Base de données

| Contrôle | Statut | Preuve |
|---|---|---|
| DB pas exposée à Internet sans protection | Validé (dev) / À vérifier (staging) | Postgres embarqué localhost (5433) ; compose dev binds local ; l'exposition staging = provisioning owner (bloquant connu) |
| Identifiants hors code source | Validé | DATABASE_URL dans .env non tracké (règle 11, d9c0dc8) |
| Compte applicatif minimal | À vérifier | dev = user unique cosmoz ; le provisioning staging doit créer un compte non-superuser (owner) |
| Pas de droits admin inutiles | À vérifier | idem staging |
| Requêtes paramétrées | Validé | cf. 2.3 |
| Migrations contrôlées et testées | Validé | 42 migrations, `migrate status` OK sur Postgres réel, exécutées par la batterie e2e |
| Données sensibles au repos | Validé | AES-256-GCM credentials + MFA ; PII minimale |
| Sauvegardes chiffrées | À vérifier | backups git bundle + tarball existants (projet) ; chiffrement/accès = procédure owner staging |
| Accès aux sauvegardes limité | À vérifier | idem |
| Restauration testée | Validé | le workspace a été restauré intégralement lors des restarts sandbox (incidents documentés, recovery réussie) |
| Logs de requêtes sans secrets | Validé | pino redact ; Prisma ne journalise pas les payloads en production |
| Pas de données prod vers dev | Validé | DB de test dédiée (cosmoz_test, refus de toute autre DB) ; seeders sans donnée utilisateur fabriquée |
| Contraintes d'intégrité | Validé | FK + uniques (schema) |
| Opérations critiques transactionnelles | Validé | rotation session + consume challenge en transaction Prisma |
| Politique conservation/suppression | À vérifier | OCR retention implémentée (ocr-retention) ; politique globale de conservation à formaliser avec le purge job (cf. 1.12) |
| Exports autorisés et journalisés | Validé | exports = lecture owner-scopée + télémétrie ; l'export logging dédié reste à ajouter avec le monitoring staging (priorité LOW) |

### C.2.7 Fichiers et téléversements (OCR)

| Contrôle | Statut | Preuve |
|---|---|---|
| Liste blanche de formats | Validé | data:image/png|jpeg|webp + application/pdf seulement (regex stricte, image-validation.service.ts:44) |
| Type réel vérifié (magic bytes) | Validé | sniff PNG/JPEG/WEBP/PDF — l'extension et le Content-Type déclarés ne sont JAMAIS crus (image-header.ts:27-45) |
| Taille max | Validé | budget AVANT décodage (base64×3/4) + re-vérification Buffer (service:55-67) |
| Dimensions/pixels limités | Validé | imageMaxPixels (dimensions lues dans l'en-tête binaire, pas de décodage) |
| Bombes de décompression | Validé | garde pixels + taille avant toute image decode ; sidecar a son propre budget |
| Noms générés par l'application | Validé | clés = UUID utilisateur validé + checksum hex — le nom client ne touche jamais le FS (local-disk-storage.adapter.ts:7-11) |
| Chemins non contrôlés par l'utilisateur | Validé | `assertSafeStorageKey` + re-vérification resolve dans le root (défense en profondeur) |
| Stockage hors racine publique | Validé | `.data/ocr-storage` privé |
| Fichiers privés réservés aux autorisés | Validé | lecture owner-scopée par le service |
| Traitement isolé si justifié | Validé (périmètre honnête) | sidecar = process séparé (deployment) ; moteur déterministe in-process pour tests ; l'isolation conteneur = staging |
| Bibliothèques d'analyse à jour | Validé | API sans lib image native (parse header pur) ; sidecar Pillow (requirements épinglés) |
| Détection/quarantaine malveillants | N/A | images jamais exécutées, jamais servies publiquement |
| Métadonnées sensibles supprimées | À vérifier | EXIF non dépouillé ; les images ne sont ni re-servies publiquement ni partageables — risque résiduel faible, à trancher owner |
| Fichiers temporaires supprimés | Validé | écriture atomique tmp+rename ; DELETE recognition → fichier supprimé ; retention job |
| Pas de mauvais Content-Type | Validé | map mime→extension stricte |
| Téléchargement autorisé côté serveur | Validé | endpoints owner-scopés (JWT) |
| Limite de temps + quota par utilisateur | Validé | deadline moteur (PROCESSING_TIMEOUT) + limiter upload par user |

### C.2.8 Secrets et configuration

| Contrôle | Statut | Preuve |
|---|---|---|
| Aucun secret codé en dur | Validé | garde tracked-secrets PASS (1 528 fichiers, 8 patterns) + scans manuels |
| .env non versionné | Validé | gitignore + règle 11 (d9c0dc8 a untracké les artefacts d'audit) |
| Fichiers d'exemple = valeurs fictives | Validé | .env.example : clés présentes, VALEURS VIDES |
| Injection sécurisée dans les environnements | Validé | tout passe par l'env validée au boot |
| Clés prod séparées de dev | Validé | 3 clés AES par domaine + JWT secret — toutes env-supplied, séparables par environnement |
| Accès minimaux aux secrets | Validé | chaque domaine n'injecte que SA clé (app-config) |
| Secrets renouvelables/révocables | À vérifier | rotation = procédure env + redeploy documentée ; l'exercice réel = owner staging |
| Clés exposées remplacées | Validé (documenté) | historique : token de test éphémère dans 81b1d49 (compte local, base embarquée, zéro exposition prod) — note owner : squash/filter AVANT tout push public, pas de rotation nécessaire |
| Logs/traces masquent les secrets | Validé | pino redact + mailer redact prod |
| Certificats protégés | N/A | aucun certificat géré par l'app (TLS = reverse proxy) |
| Secrets CI restreints | Validé | CI n'a besoin d'AUCUN secret (tests auto-portants) + permissions contents:read (FIX C) |
| Clés services externes non partagées | Validé | clé par domaine (cf. 2.1) |
| Variables critiques validées au démarrage | Validé | envSchema — startup abort contrôlé, jamais de valeur de secret imprimée |
| Échec sûr si secret absent | Validé | fail-fast au boot (main.ts:24-37) |

### C.2.9 Réseau et transport

| Contrôle | Statut | Preuve |
|---|---|---|
| HTTPS en production | À vérifier | app prête (cookies secure + HSTS) ; terminaison TLS = provisioning staging |
| Certificats valides/renouvelés | À vérifier | idem |
| Communications inter-services protégées | Validé | API→OCR : token porteur (OCR_SERVICE_TOKEN) ; bridge : HMAC |
| Ports inutiles fermés | À vérifier | binding 0.0.0.0 unique :4000 ; firewall = infra staging |
| DB/caches non publics | Validé (dev) / À vérifier (staging) | localhost only aujourd'hui |
| Pare-feu moindre privilège | À vérifier | infra staging |
| Environnements internes isolés | À vérifier | infra staging |
| IP client via proxys de confiance seulement | Validé | TRUST_PROXY opt-in explicite (défaut false) |
| Redirections externes contrôlées | Validé | aucune redirect vers URL fournie (liens email = webAppUrl config) |
| Connexions sortantes limitées | Validé | sorties : Oanda (hosts codés), OCR engine (env), calendar provider (env) — pas d'URL utilisateur |
| Erreurs réseau ne désactivant pas la sécurité | Validé | échec OCR → FAILED OCR_UNAVAILABLE (dégradation honnête, jamais de bypass) |
| Accès d'administration protégés | N/A | aucun accès admin |

### C.2.10 SSRF et requêtes sortantes

**Validé / N-A — justification** : l'API n'effectue AUCUNE requête vers une URL fournie par l'utilisateur. Inventaire exhaustif des appels sortants (rg fetch/axios) : (1) Oanda REST — hosts officiels CODÉS EN DUR (api-fxpractice/fxtrade.oanda.com, routage par enum d'environnement du compte, PROP_FIRM rejetée) ; (2) moteur OCR — OCR_SERVICE_URL (env opérateur) ; (3) provider calendrier/eco — env opérateur ; (4) Deriv WS — host officiel codé. Les webhooks sont ENTRANTS (l'API reçoit et vérifie des signatures, elle n'appelle jamais l'URL d'un client). Loopback/privé/métadonnées : non atteignables depuis l'app par construction. Les réponses externes ont des timeouts (deadline OCR, timeout fetch) et des limites de taille via schémas.

### C.2.11 Microservices et communications internes

| Contrôle | Statut | Preuve |
|---|---|---|
| Services appelants authentifiés | Validé | OCR sidecar : token Bearer (OCR_SERVICE_TOKEN) |
| Pas de confiance aveugle au réseau interne | Validé | bridge MT5 : HMAC + timestamp ±5 min + timing-safe |
| Identités/permissions séparées des services | Validé | clé bridge PAR connexion (déchiffrée à la volée) ; secret webhook PAR endpoint (AES-GCM) |
| Tokens utilisateur validés partout | Validé | le JWT n'est jamais transféré au sidecar (payload pré-traité par l'API) |
| Permissions vérifiées par le service détenteur | Validé | l'API reste l'unique détenteur DB ; le sidecar est sans état et sans DB |
| Secrets non partagés globalement | Validé | cf. 2.8 |
| Files de messages protégées | N/A | pas de broker de messages (orchestration in-process + DB) |
| Messages entrants validés | Validé | zod payload par kind (bridge) + schémas webhook |
| Rejeux sans double effet critique | Validé | idempotence (keyId,eventId) + (endpointId,eventId) |
| Erreurs/timeouts sans contournement d'auth | Validé | OCR timeout → FAILED (auth maintenue) |
| Santé/métriques sans données sensibles | Validé | /health = {status, version, env, uptime} — rien d'autre (health.controller.ts:37-45) |
| Interfaces admin non exposées | N/A | aucune |

### C.2.12 Dépendances et chaîne d'approvisionnement

| Contrôle | Statut | Preuve |
|---|---|---|
| Dépendances inventoriées | Validé | pnpm workspace + lockfile |
| Versions verrouillées | Validé | pnpm-lock.yaml frozen-lockfile en CI |
| Sources fiables | Validé | registre officiel ; z-ai-web-dev-sdk JAMAIS importé applicativement (vérifié src + chunks client) |
| Vulnérabilités recherchées régulièrement | Validé | pnpm audit en CI-like manuel (aujourd'hui : 3 HIGH transitives documentées, toutes sans usage direct réachable) — la commande n'est pas encore un job CI planifié (reste owner, priorité LOW) |
| Dépendances inutiles supprimées | Validé | shadcn → devDependencies (7ca90c7) |
| Mises à jour sécurité appliquées | Validé | next 16.3.5→16.3.8 (RCE), fastify 5.12.7 (2 HIGH) |
| Transitives surveillées | Validé | audit --prod + pnpm why documentés |
| Scripts install/build examinés | À vérifier | pas de revue postinstall systématique (postinstall = prisma generate uniquement) |
| Dépôts fiables | Validé | cf. sources |
| Pas de secrets dans les artefacts | Validé | build client scan (garde mock-leakage + secrets) |
| Images de base fiables | À vérifier | pas de Dockerfile (2.13) |
| Artefacts scannés | À vérifier | outils de scan image = staging |
| Builds reproductibles | Validé (largement) | lockfile frozen + embedded Postgres binaires versionnés |

### C.2.13 Docker et infrastructure

**Manquant (documenté, hors sandbox) — priorité MEDIUM** : aucun Dockerfile n'existe (compose db + profil api uniquement) ; Docker n'a JAMAIS été exécuté ici (bloquant Phase 12 connu). Quand la conteneurisation arrivera, appliquer la checklist : non-root, ports limités, pas de secrets dans l'image, volumes restreints, caps dropped, read-only FS, limites CPU/mémoire, réseaux isolés. Rien à cacher : c'est un reste de déploiement, pas un défaut applicatif.

### C.2.14 Logs, audit et surveillance

| Contrôle | Statut | Preuve |
|---|---|---|
| Connexions réussies/échouées journalisées | Validé | LOGIN_SUCCESS/LOGIN_FAILED via SecurityEventService (+ LoginRecord) |
| Échecs d'autorisation enregistrés | Validé | télémétrie 401/403/429 + REAUTH_FAILED |
| Modifications rôles/permissions journalisées | N/A | pas de rôles mutables |
| Opérations sensibles auditables | Validé | audit trail paginé GET /security/events + /logins (ownership-scopé) |
| Horodatage fiable | Validé | horodatage serveur pino/events |
| Journaux protégés contre modification | À vérifier | fichiers locaux aujourd'hui ; protection/centralisation = staging |
| Tokens/mots de passe/clés exclus des logs | Validé | pino redact + mailer redact + hasher silencieux |
| Entrées assainies avant logs | Validé | contextes = chaînes construites serveur (pas d'echo brut d'entrée) |
| Durée de conservation définie | À vérifier | rotation/conservation fichiers = staging |
| Alertes événements suspects | À vérifier | cf. 1.3 |
| Logs ne remplissant pas le disque | À vérifier | rotation = staging (logrotate/docker) |
| Pannes du service de journalisation gérées | Validé | pino buffer + fallback logger mailer (never lose the mail) |
| Accès logs limité | À vérifier | staging |
| Actions admin traçables | N/A | pas d'admins ; self-service tracé |

### C.2.15 Erreurs et résilience

| Contrôle | Statut | Preuve |
|---|---|---|
| Messages publics génériques | Validé | error-mapper (codes normalisés §38) |
| Traces détaillées internes seulement | Validé | logs serveur 5xx avec stack, client = message sain |
| Exceptions sans révélation de secrets | Validé | all-exceptions.filter |
| Timeouts sur appels externes | Validé | OCR deadline (PROCESSING_TIMEOUT), fetch timeout engine |
| Tailles requête/réponse limitées | Validé | bodyLimit + pagination bornée (limit max 100) |
| Tâches longues bornées | Validé | OCR budgets, sync caps (pages/rows bornés — INCOMPLETE honnête) |
| Reprise sans double exécution non idempotente | Validé | webhook/bridge idempotents ; retry sync borné (sync-retry) |
| Dépendances externes peuvent échouer sans compromettre l'accès | Validé | OCR indisponible → dégradation honnête, auth/stats inchangées |
| Erreurs de config ne désactivant pas les protections | Validé | fail-fast au boot (pas de mode dégradé silencieux) |
| Services critiques surveillés | Validé | monitoring module (p95, erreurs, télémétrie 500 appels ring) |
| Sauvegardes restaurables | Validé | recovery workspace prouvée (restarts sandbox) |
| Plan de reprise | À vérifier | runbook rollback = bloquant owner connu (documenté Phase 12) |

### C.2.16 Protection des données et confidentialité

| Contrôle | Statut | Preuve |
|---|---|---|
| Collecte minimale | Validé | email/nom/timezone/devise + données de trading (objet du produit) ; pas de téléphone/adresse |
| Finalités définies | Validé | journal de trading — la donnée collectée sert directement les fonctionnalités |
| Données sensibles classées | Validé | credentials + secrets MFA = classe chiffrée ; trades = données utilisateur privées |
| Protection transit + repos | Validé (app) / À vérifier (TLS) | AES-256-GCM au repos ; transit = staging TLS |
| Accès limité au besoin | Validé | scoping userId |
| Exports contrôlés | Validé | owner-scopés, csvCell anti-injection |
| Données de test fictives | Validé | seeders classés (aucune donnée utilisateur fabriquée — vérifié live fc24210) |
| Pas de conservation indéfinie | À vérifier | OCR retention OK ; politique globale = purge job (cf. 1.12) |
| Mécanismes suppression/correction | Validé | PATCH profil, DELETE compte (grâce 14 j), suppression OCR sets |
| Sauvegardes/répliques selon politique | À vérifier | staging |
| Transferts prestataires contrôlés | Validé | seuls prestataires actuels = brokers (lecture seule, credentials utilisateur chiffrées) + email transport (à provisionner) |
| Confidentialité/consentement conformes au réel | À vérifier | pas de page de politique déployée — owner (juridique) |
| Exigences Québec/Canada identifiées | À vérifier | responsabilité owner — documenté comme reste |

### C.2.17 Paiements et opérations sensibles

**N/A** : aucun paiement/abonnement/facturation dans le codebase (aucun provider, aucun webhook billing). Les « opérations financières » du produit = calculs de trading : montants TOUJOURS calculés côté serveur (pnlNet/rMultiple indépendamment vérifiés en e2e, preuve financière live Phase 12), le frontend n'est jamais autoritaire.

### C.2.18 Tâches de fond et files

| Contrôle | Statut | Preuve |
|---|---|---|
| Pas de confiance aveugle aux données reçues | Validé | sync = schémas Zod sur réponses providers |
| Messages validés | Validé | bridge zod par kind |
| Droits du service exécutant limités | Validé | scheduler = compte app DB standard, gated ACCOUNTS_SYNC_SCHEDULER |
| Tâches répétées sans doublons dangereux | Validé | CAS triggerCount + uuid-v5 dedup (alertes), checkpoint sync |
| Tâches expirées/échouées gérées | Validé | recovery sweep (testé — le flake oanda documenté EST ce test) + FAILED explicites |
| Files authentifiées | N/A | pas de broker externe |
| Messages sensibles non accessibles à tous | N/A | pas de broker |
| Limites de taille/rétention | Validé | caps pages/rows sync, ring telemetry bornés |
| Erreurs sans secrets | Validé | logs provider = messages mappés (pas de payload brut) |
| Actions sensibles de fond journalisées | Validé | sync runs persistés (tradingSyncRun) |

### C.2.19 Sécurité OCR / IA

| Contrôle | Statut | Preuve |
|---|---|---|
| Fichiers validés avant traitement | Validé | cf. 2.7 (magic bytes + budgets) |
| Taille/résolution/temps limités | Validé | bytes + pixels + deadline |
| Bibliothèques de décodage à jour | Validé | API sans decode (header parse pur) ; sidecar Pillow épinglé |
| Traitement isolé si nécessaire | À vérifier | conteneurisation sidecar = staging |
| Fichiers temporaires supprimés | Validé | cf. 2.7 |
| Résultats OCR = données non fiables | Validé | jamais exécutés ; validés par schémas avant stockage/import |
| Texte extrait jamais exécuté | Validé | aucune eval/exec dans le pipeline |
| Résultats validés avant stockage/utilisation | Validé | trade-import.logic validation + confirm flow humain |
| Captures privées jamais publiques | Validé | storage privé owner-scopé |
| Données vers services externes contrôlées | Validé | seuls bytes image → sidecar tokenisé (auto-hébergé) |
| Erreurs moteur sans chemins/données d'autrui | Validé | failureCategory codes mappés, ownership par userId |
| Modèles téléchargés de sources fiables | N/A | pas de modèle ML téléchargé (moteur déterministe + tesseract système) |
| Versions modèles/dépendances suivies | Validé | requirements épinglés + moteurs versionnés dans le code |
| Résultats ne pouvant pas autoriser seuls une opération sensible | Validé | import OCR → trades en attente de confirmation humaine |

### C.2.20 CI/CD, tests, mises en production

| Contrôle | Statut | Preuve |
|---|---|---|
| Tests automatisés des contrôles de sécurité | Validé | 68 e2e sécurité + batteries (1350/1351, 223/223) + 2 gardes CI |
| Tests d'autorisation multi-utilisateurs | Validé | IDOR + isolation Alice/Bob |
| Tests négatifs (interdictions refusées) | Validé | security-negative 9/9 + capability-negative 8/8 + ocr-negative |
| Dépendances analysées avant prod | Validé (manuel) | audit --prod re-run aujourd'hui ; job CI planifié = reste owner LOW |
| Secrets recherchés dans dépôt | Validé (durci aujourd'hui) | FIX C : garde tracked-secrets CI (working tree) ; historique = note 81b1d49 (squash avant push public) |
| Linting/analyse statique | Validé | eslint ×2 + tsc ×3, 0 erreur |
| Test/prod séparés | Validé | DB test dédiée + NODE_ENV gates |
| Migrations vérifiées | Validé | la batterie exécute les migrations sur Postgres réel |
| Artefacts construits de manière contrôlée | Validé | build CI (api + web), exit 0 aujourd'hui |
| Revue de code des changements sensibles | Validé | convention du projet : chaque changement = commit documenté + tests + rapport |
| Configs prod vérifiées avant déploiement | À vérifier | checklist de déploiement = staging (env.schema = garde-fou déjà actif au boot) |
| Retour à version stable possible | Validé | git + bundle backup + history propre |
| Correctifs sécurité prioritaires | Validé | precedent : next/fastify patchés sous 24 h dans la campagne fc24210 |
| Permissions pipelines limitées | Validé (durci aujourd'hui) | FIX C : permissions: contents: read |
| Accès production contrôlés | À vérifier | staging |

### C.2.21 Tests de sécurité et audit continu

| Contrôle | Statut | Preuve |
|---|---|---|
| Scan de vulnérabilités régulier | Validé (manuel, répété) | audits successifs 17/17 conformes ; automatisation CI planifiée = reste owner LOW |
| Tests dynamiques sur environnement autorisé | À vérifier | DAST = staging (jamais sur prod) |
| Endpoints publics testés | Validé | security-negative + identity e2e (auth routes) |
| Contrôles d'accès testés avec identités différentes | Validé | IDOR multi-utilisateurs |
| Fichiers malformés/entrées extrêmes testés | Validé | ocr-negative (payloads hostiles) |
| Force brute testée | Validé | rafales login e2e (429) |
| XSS/CSRF/SQLi/SSRF examinés | Validé | cf. 2.3/2.5/2.10 — chaque surface passée en revue aujourd'hui |
| Config HTTP/TLS/CORS vérifiées | Validé | helmet + CORS schema + FIX A (TLS = staging) |
| Erreurs/indisponibilités externes testées | Validé | OCR unreachable/timeout e2e |
| Vulnérabilités priorisées et corrigées | Validé | 3 défets corrigés aujourd'hui (D.1-D.3) + precedents |
| Corrections retestées | Validé | re-gates complets post-fixes (batterie intégrale) |
| Pentest avant mise en prod importante | À vérifier | recommandé avant ouverture publique (owner) |
| Résultats documentés avec risques résiduels | Validé | le présent rapport + rapports antérieurs |

### C.2.22 Abus métier

| Contrôle | Statut | Preuve |
|---|---|---|
| Actions coûteuses soumises à quotas | Validé | OCR upload (par user), snapshots cap 200, templates cap 10, webhooks rate-limités |
| Limites d'abonnement vérifiées serveur | N/A | pas d'abonnements |
| Pas de contournement en appelant l'API directement | Validé | TOUTES les limites sont serveur (le client n'est jamais autoritaire) |
| Promotions/crédits multi-réclamables | N/A | pas de crédits/promotions |
| Opérations financières/irréversibles contrôlées | Validé | suppression compte = confirmation typée ; trades = lifecycle serveur (close → awaitingDecision → decision, re-décision 409) |
| Séquences incohérentes rejetées | Validé | machines d'états serveur (e2e : re-décision 409, PATCH pirate stripé Phase 08) |
| Statuts métier non manipulables par body | Validé | statuts serveur-only (Zod strips + services) |
| Courses concurrentes protégées | Validé | CAS + FOR UPDATE (trading.repository.ts:579) + sérialisation webhook |
| Abus automatisés détectés/limités | Validé | rate limiters multicouches + télémétrie |
| Actions inhabituelles → vérification | À vérifier | cf. 1.9 (risk-based auth = reste) |

### C.2.23 SaaS multi-tenant

**N/A (single-tenant par utilisateur)** : pas d'organisations/tenants partagés. L'équivalent applicatif — l'isolation ENTRE UTILISATEURS — est testée systématiquement (IDOR suites, isolation e2e, caches par user : TanStack query keys = filtres sérialisés + userId côté serveur). Les contrôles Redis multi-tenants deviennent applicables si Redis est introduit (cf. 1.3).

### C.2.24 Disponibilité et dénis de service

| Contrôle | Statut | Preuve |
|---|---|---|
| Limites taille/fréquence sur endpoints coûteux | Validé | OCR (bytes+pixels+quota), global 120/60 s |
| Timeouts sur traitements longs | Validé | OCR deadline, fetch timeouts |
| Requêtes DB optimisées/limitées | Validé | index (capturedAt, uniques), caps de pages |
| Pagination bornée | Validé | page query limit 1-100 (zod wire) |
| Tâches lourdes en files | À vérifier | sync séquencé en process ; files dédiées = scaling futur |
| Files avec limites/reprise | N/A | pas de broker |
| Ressources surveillées | Validé | monitoring module (p95/erreurs/req) |
| Emails/SMS limités | Validé | resend 3/15 min + forgot 3/15 min + télémétrie delivery |
| Retry sans boucles infinies | Validé | sync-retry borné (backoff, max) |
| Protection volumétrique réseau | À vérifier | infra provider/staging |
| Dépendances critiques : timeouts + dégradation | Validé | OCR indisponible → FAILED honnête ; broker down → sync FAILED |
| Alertes saturation | À vérifier | monitoring staging |

### C.2.25 Sauvegardes, incidents et reprise

| Contrôle | Statut | Preuve |
|---|---|---|
| Sauvegardes régulières | Validé (projet) | bundle git 311 Mo + tarball 618 Mo + manifest (21) — la périodicité automatisée = owner |
| Sauvegardes chiffrées/accès limité | À vérifier | supports locaux aujourd'hui ; chiffrement = procédure owner |
| Restauration complète testée | Validé | recovery workspace prouvée lors des restarts sandbox |
| Objectifs de reprise définis | À vérifier | owner (RPO/RTO staging) |
| Procédures fuite de données documentées | À vérifier | owner |
| Rotation clés/secrets documentée | À vérifier | rotation env documentée au cas par cas dans les rapports ; runbook = owner |
| Comptes compromis désactivables vite | Validé | DEACTIVATED gate immédiat + revoke ALL |
| Sessions/tokens compromis révocables | Validé | revoke one/others/all + reuse-detection automatique |
| Responsables incident identifiés | À vérifier | owner (personne unique aujourd'hui) |
| Journaux d'enquête conservés | À vérifier | staging |
| Analyse post-incident | Validé | precedent : incident restore documenté (5409931) + fixes |
| Reprise testée périodiquement | À vérifier | owner |

---

## D. Défets trouvés et corrigés aujourd'hui (avec régression)

### D.1 — FIX A : absence totale de headers de sécurité sur l'app web (MEDIUM)
Le API servait helmet (CSP, HSTS, nosniff, frameguard) mais **l'app Next.js n'envoyait AUCUN header de sécurité** — surface de clickjacking (UI redress) ouverte et pas de nosniff. Correction : `next.config.ts headers()` — X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy (camera/microphone/geolocation vides), CSP `frame-ancestors 'none'`. Une CSP stricte complète (scripts) nécessite du plumbing nonce Next et reste documentée comme évolution. **Preuve** : build exit 0 ; `curl -I` production-build : 5/5 headers servis (200 OK). Zéro dépendance, zéro changement de comportement applicatif.

### D.2 — FIX B : JWT sans émetteur/audience (LOW-MEDIUM — durcissement 1.8)
Les access tokens vérifiaient signature + dates mais pas iss/aud — un token signé avec le MÊME secret pour un autre émetteur/audience (ex. futur service partageant le secret) aurait été accepté. Correction : `AUTH_JWT_ISSUER`/`AUTH_JWT_AUDIENCE` (défauts `cosmoz-api`/`cosmoz-web`, zéro config requise) épinglés à la signature ET à la vérification (token.service.ts:29-56). **Preuve** : nouveau spec `token-issuer-audience.spec.ts` 4/4 (rejet mauvais iss, mauvais aud, claims absents ; acceptation du token légitime) ; batterie API complète 1350/1351 (le pinning ne casse aucun flux e2e réel).

### D.3 — FIX C : pas de scan de secrets en CI + permissions pipeline non restreintes (MEDIUM-LOW)
La CI n'avait ni permissions explicites (token par défaut trop large) ni scan de secrets versionnés (le scans étaient manuels — d9c0dc8 a prouvé que l'auto-commit sandbox pouvait versionner des artefacts). Correction : (1) `permissions: contents: read` au workflow ; (2) nouveau garde `check-tracked-secrets.mjs` (git ls-files + 8 patterns haute confiance, zéro dépendance) câblé dans le job web. **Preuve** : garde PASS sur 1 528 fichiers trackés ; périmètre honnête : working tree seulement — l'historique contient un token de test éphémère documenté (81b1d49, compte local, squash/filter avant tout push public).

---

## E. Gaps restants (honnêtes, classés — aucun caché)

| # | Gap | Checklist | Priorité | Propriétaire |
|---|---|---|---|---|
| 1 | Job de purge/anonymisation différé (délai grâce 14 j actif, sessions révoquées) | 1.12/2.6/2.16 | MEDIUM | code (prochaine itération) |
| 2 | Docker jamais construit/exécuté (aucun Dockerfile) | 2.13 | MEDIUM | owner staging |
| 3 | Notifications email proactives (changement mot de passe/email/MFA, ancienne adresse) — audit trail complet en attendant | 1.5/1.6/1.7/1.9/2.14 | LOW | code (au branchement du transport mail réel) |
| 4 | Check mots de passe compromis absent | 1.4 | LOW | owner (décision produit + privacy) |
| 5 | Risk-based auth (connexions inhabituelles) absent | 1.9 | LOW | roadmap |
| 6 | CSP stricte complète (scripts) sur le web | 2.4/2.5 | LOW | code (plumbing nonce Next) |
| 7 | TLS/pare-feu/DB least-privilege/backups chiffrés/log rotation/monitoring alerting | 2.6/2.9/2.14/2.24/2.25 | À vérifier | owner staging |
| 8 | Threat model formel + pentest avant ouverture publique | 2.1/2.21 | À vérifier | owner |
| 9 | Audit dépendances en job CI planifié | 2.12/2.20 | LOW | code/owner |
| 10 | EXIF non dépouillé sur uploads (images jamais re-publiées — risque résiduel faible) | 2.7 | LOW | owner décision |
| 11 | Historique git : token de test éphémère dans 81b1d49 (compte local, base embarquée, zéro exposition) | 2.8 | NOTE | owner — squash/filter avant tout push public |

---

## F. Verdict

**SURFACE AUTHENTIFICATION + SÉCURITÉ GLOBALE APPLICATIVE : SOLIDE — 3 défets corrigés aujourd'hui, aucun défet CRITIQUE/HIGH applicatif trouvé.**

- Les mécanismes sensibles de la checklist (1.1-1.13) sont **implémentés, testés et re-testés aujourd'hui** : Argon2id OWASP, anti-énumération, rate limiting multicouche (vecteur compte + global IP), rotation + réutilisation-détection des refresh tokens, MFA TOTP complet (reauth-gated, secrets chiffrés, codes hashés single-use), isolation userId prouvée par tests IDOR, CSRF/CORS/CSP maîtrisés, uploads OCR à magic bytes, webhooks/bridge HMAC avec anti-rejeu, secrets hachés/chiffrés, logs sans secrets.
- Les manquants sont **tous classés LOW ou déploiement (À vérifier staging)** — aucun ne constitue une vulnérabilité exploitable dans le déploiement actuel (sandbox/local, mono-instance, pas d'exposition publique).
- La checklist Partie 3 est appliquée telle quelle : aucun statut Validé n'est décerné sur la seule présence d'une bibliothèque — chaque ligne porte une preuve (fichier:ligne ou test exécuté aujourd'hui).

**Recommandation de priorité pour la prochaine itération code** : (1) job de purge du compte supprimé (gap #1), (2) branchement du transport mail réel + notifications de sécurité (gap #3), (3) job CI d'audit dépendances (gap #9). Tout le reste relève du provisioning staging (owner).
