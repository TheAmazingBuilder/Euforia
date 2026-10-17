# GUIDE COMPLET — Installation locale, CI/CD & Redis

**Projet** : COSMOZ (EUFORIA / Oryon) — journal de trading professionnel
**Date** : 2026-10-17 · **HEAD vérifié** : `4970571`
**Objectif de ce document** : (1) rendre compte honnêtement de l'état du CI/CD GitHub Actions et de Redis, (2) permettre à n'importe qui d'installer et de lancer l'application **en local sur son PC**, étape par étape, avant une mise sur GitHub puis en production.

> **Convention d'honnêteté du repo** : chaque affirmation est classée —
> **PASS** = prouvé par exécution réelle · **PARTIAL** = fonctionne avec une limite documentée · **N-A** = non applicable · **À VALIDER** = pas encore exécuté dans cet environnement.

---

## 0. Résumé exécutif — ce qui a été vérifié le 2026-10-17

| Vérification | Verdict | Preuve |
|---|---|---|
| CI/CD GitHub Actions (`ci.yml`) | **PASS** après 3 corrections | Simulation complète sur clone git frais : les 7 étapes des 2 jobs passent (`install` `lint` `typecheck` `build` `test` `tc shared/web` `next build` — toutes exit 0) |
| Suite de tests API sur base fraîche | **PASS** | **1293/1293** tests (89 fichiers) sur une `cosmoz_test` reconstruite de zéro |
| Redis | **N-A — n'existe pas dans cette app** | Zéro dépendance `redis`/`ioredis`/`bullmq` dans tout le monorepo ; aucune variable `REDIS_*` ; aucun service compose ; le code le documente explicitement |
| Run local (web + api + DB embarquée) | **PASS** | Même chaîne que le CI, exécutée dans le sandbox de développement |
| Docker (compose / build image) | **À VALIDER sur votre PC** | Aucun démon Docker dans l'environnement de développement — le compose est prêt mais jamais exécuté ici |
| CI réel sur GitHub | **À VALIDER (1er push)** | Pas de remote configuré ; le CI exécute exactement les commandes/OS/Node de la simulation réussie |

### Les 3 défauts trouvés et corrigés (commits)

1. **`f08ad68` — Le CI échouait dès l'installation sur un clone frais.**
   Le client Prisma généré n'était pas committé (normal) et rien ne le régénérait : le repo principal ne fonctionnait que parce qu'un développeur avait lancé `prisma generate` manuellement. Preuve : sur clone propre, `pnpm --filter @cosmoz/api typecheck` sortait **exit 1** (`Module '"@prisma/client"' has no exported member 'Prisma'`). **Correctif** : `"postinstall": "prisma generate"` dans `apps/api/package.json` (vérifié : fonctionne sans `DATABASE_URL`, ~0,5 s, s'exécute à chaque `pnpm install` en local comme en CI).

2. **`4970571` — Le rejeu des migrations était cassé sur une base fraîche** (`P3018 : relation "Trade" does not exist` sur une `cosmoz_test` vierge — exactement ce que reçoit le CI). Les bases du sandbox masquaient le défaut depuis des semaines (migrations appliquées incrémentalement avant les réécritures). Deux fichiers réparés selon le pattern de réconciliation déjà documenté dans le repo :
   - `20261003145823_trade_review` → tombe en **tombestone vide** (byte-dupliqué par `20261004130000_trade_review`, et référençait `"Trade"` avant sa création réelle dans `20261004120000_trade_journal_core`) ;
   - `20261006120000_ocr_v2` → **tombestone vide** (byte-identique à `20261006085000_ocr_v2` → duplicate `ADD COLUMN perceptualHash`).
   Rejeu validé empiriquement : **41/41 migrations OK** sur base scratch ; le schéma obtenu passe la suite complète 1293/1293. `migrate deploy` saute les migrations déjà enregistrées par nom → **les bases existantes (dev/test) ne sont pas affectées**.

3. **`4970571` — 5 tests e2e du pont MT5 n'étaient pas auto-contenus** (échecs documentés « pré-existants au HEAD » : `POST /trading-accounts/connect` → 422). Ils dépendaient d'un `apps/api/.env` local portant `ACCOUNTS_MT5_BRIDGE_PROVIDER=enabled`, perdu lors du restore du sandbox (16 oct). **Correctif** : le describe boote **son propre app** avec le gate explicitement activé + sa propre capture mail + `resetAppConfigCache()` (la config mémoïsée avait déjà été chauffée gate-off par l'app partagée). Résultat : **1293/1293** (au lieu de 1288 passés / 5 échoués).

> Conséquence pratique : le script historique `scripts/rebuild-env-2026-10-14.sh` utilisait le contournement `db push` + `migrate resolve` à cause du rejeu cassé. **Ce contournement est obsolète** — un `migrate deploy` from-zéro fonctionne désormais.

---

## 1. Architecture en 60 secondes

```
┌──────────────────────────┐         ┌───────────────────────────────┐
│  apps/web (Next.js 16)   │         │  apps/api (NestJS 11 Fastify) │
│  http://localhost:3000   │         │  http://localhost:4000        │
│                          │         │                               │
│  Mode par défaut : MSW   │         │  Routes métier : /api/v1/...  │
│  (mock backend dans le   │         │  Infrastructure : /health*    │
│  navigateur — ZÉRO       │         │  (root, sans préfixe)         │
│  backend nécessaire)     │         │                               │
│                          │         │  Prisma → PostgreSQL          │
│  Mode LIVE (optionnel) : │─proxy──▶│                               │
│  NEXT_PUBLIC_API_LIVE=   │  /api/v1│  Stockage captures : fs local │
│  true → proxy next → :4000         └───────────────┬───────────────┘
└──────────────────────────┘                         │
                                              ┌──────▼─────────────┐
   mini-services/ocr-service (optionnel)      │ PostgreSQL 17      │
   FastAPI :3004 — reconnaissance             │ EMBARQUÉ (5433)    │
   captures d'écran/PDF                       │ via dev-db.mjs     │
                                              │ data: .localpg/    │
                                              └────────────────────┘
```

- **Monorepo pnpm + Turborepo** : `apps/web`, `apps/api`, `packages/shared` (schémas Zod partagés API↔web).
- **Base de données** : PostgreSQL **embarqué** (binaires portables via `@embedded-postgres`, port **5433**, données dans `apps/api/.localpg/` — gitignored). Docker n'est **pas** requis en local.
- **Auth** : JWT accès court en mémoire + refresh cookie HttpOnly ; vérification email via un mailer dev **qui logue les tokens dans la console API** (aucun SMTP requis).

---

## 2. Redis — verdict détaillé (N-A)

La question « Redis est-il fonctionnel ? » appelle une réponse claire : **cette application n'utilise pas Redis, ni en dev, ni en prod**. Ce n'est donc pas un service à installer ou réparer. Les preuves, vérifiées le 2026-10-17 :

1. **Zéro dépendance** : aucun `redis`, `ioredis` ou `bullmq` dans aucun `package.json` du monorepo (grep exhaustif).
2. **Zéro configuration** : aucune variable `REDIS*` dans `apps/api/.env.example`, `apps/web/.env.example`, ni dans le schéma de validation `apps/api/src/config/env.schema.ts`.
3. **Zéro service** : `docker-compose.yml` ne contient que `db` (PostgreSQL 16) et le profil `full` (conteneur API). Pas de Redis.
4. **Le code le documente** : `apps/api/src/modules/ocr/ocr.module.ts` et `ocr-retention.service.ts` indiquent explicitement « *no BullMQ/Redis in this build* » — la rétention OCR tourne en processus (lazy sweeps), les événements domaine sont en-process (`DomainEventsService`), et le rate limiting est **en mémoire**.

**Conséquence pour l'avenir** : Redis deviendra pertinent **uniquement** lors d'un passage multi-instances (scale-out horizontal). C'est précisément l'objet du risque **R4 ouvert** dans le registre de sécurité : le limiteur de débit actuel est en mémoire (mono-instance). Une montée en charge multi-nœuds nécessitera un store partagé (Redis) + un limiteur distribué — c'est aussi lié à **R3** (verrouillage par compte, MEDIUM/OUVERT, toujours à traiter). Rien de tout cela ne bloque le local ni une première mise en prod mono-instance.

---

## 3. CI/CD — ce qu'il fait, ce qui a été corrigé, la preuve

### 3.1 Contenu de `.github/workflows/ci.yml`

- **Déclencheurs** : `push` sur `main` + toutes les `pull_request`.
- **Job `api`** (ubuntu-latest, Node 24, cache pnpm) : `pnpm install --frozen-lockfile` → `lint` → `typecheck` → `build` → `test` (unit + e2e avec **PostgreSQL embarqué** — aucun conteneur de service nécessaire, la suite auto-gère `cosmoz_test` et refuse toute autre base).
- **Job `web`** : `typecheck` (`@cosmoz/shared` + `web`) → `next build` (garde de régression front complète).
- Les deux jobs sont indépendants et parallèles. Le pnpm vient du champ `packageManager: pnpm@12.4.2` (via `pnpm/action-setup@v4`).

### 3.2 Pourquoi la « preuve par clone frais » est la bonne méthode

Un CI ne voit **jamais** votre `node_modules`, votre `.env`, ni vos artefacts générés. Il reçoit un clone propre du HEAD committé. La simulation a donc consisté à : `git clone` local du HEAD → exécution **dans l'ordre exact** des commandes du CI → vérification des exit codes. C'est la plus fidèle approximation possible du runner GitHub (même OS ubuntu, même Node 24, mêmes commandes).

### 3.3 Résultat final de la simulation (clone frais, HEAD `4970571`)

| Étape CI | Commande simulée | Résultat |
|---|---|---|
| api · Install | `corepack pnpm install --frozen-lockfile` | **exit 0** — « apps/api postinstall: ✔ Generated Prisma Client » |
| api · Lint | `corepack pnpm --filter @cosmoz/api lint` | **exit 0** |
| api · Typecheck | `corepack pnpm --filter @cosmoz/api typecheck` | **exit 0** |
| api · Build | `corepack pnpm --filter @cosmoz/api build` | **exit 0** |
| api · Test | `CI=true corepack pnpm test` (cwd `apps/api`) | **exit 0 — 1293/1293** (89 fichiers) |
| web · Typecheck | `tsc --noEmit` sur `@cosmoz/shared` puis `web` | **exit 0** |
| web · Build | `corepack pnpm --filter web exec next build` | **exit 0** |

Logs bruts conservés dans `scripts/ci-sim/` (`final-*.log`).

### 3.4 Limites documentées (honnêteté)

- Le **premier run réel** sur GitHub reste à faire (aucun remote n'existe encore). Attendu : vert — mêmes commandes, même OS (`ubuntu-latest`), même Node 24. Si rouge : l'onglet *Actions* affichera l'étape exacte, en miroir du tableau ci-dessus.
- Deux tests de concurrence du scheduler (historiquement « flaky », documentés dans le commit Phase 07) **ont passé** lors du run final. S'ils flambent un jour au CI : relancer le job — ce sont des flakes de timing connus, pas des régressions.

---

## 4. Prérequis (votre PC)

| Outil | Version | Notes |
|---|---|---|
| **Node.js** | **24 LTS** (v24.21.0 utilisé pour la validation) | `engines >= 22` déclaré ; 24 = même version que le CI. https://nodejs.org |
| **Corepack** | inclus avec Node | fournit pnpm — pas besoin d'installer pnpm à la main |
| **pnpm** | **12.4.2** (imposé par `packageManager`) | activé via corepack, étape 1 |
| **Git** | toute version récente | pour cloner/pousser |
| Docker | **OPTIONNEL** | seulement pour le chemin B (PostgreSQL en conteneur) ou le profil `full` |
| PostgreSQL | **RIEN À INSTALLER** | binaire portable embarqué (chemin A, recommandé) |
| Redis | **RIEN À INSTALLER** | non utilisé (voir §2) |
| Python | OPTIONNEL (3.11+) | seulement pour le sidecar OCR (§5, étape 10) |

Espace disque : comptez ~1,5 Go (node_modules + binaires PG + build).

**Windows** : toutes les commandes fonctionnent dans PowerShell (`cp` y est un alias de `Copy-Item`). Si `corepack enable` réclame des droits, lancez PowerShell en administrateur une fois.
**macOS/Linux** : bash/zsh directement.

---

## 5. Installation pas à pas — de zéro à l'app qui tourne

### Étape 0 — Récupérer le code

Deux situations :
- **Le code est déjà sur votre PC** (c'est le cas du dossier de travail actuel) : positionnez-vous à la racine du repo.
- **Vous le récupérez depuis GitHub** (après l'avoir poussé, §7) :
  ```bash
  git clone https://github.com/<votre-compte>/<votre-repo>.git
  cd <votre-repo>
  ```

### Étape 1 — Activer pnpm via corepack

```bash
corepack enable
# pnpm@12.4.2 est automatiquement respecté grâce au champ "packageManager".
# Si corepack se plaint de clés de signature (erreur réseau d'intégrité) :
corepack prepare pnpm@12.4.2 --activate
# Vérification :
pnpm --version   # → 12.4.2
```

### Étape 2 — Installer les dépendances (génère aussi le client Prisma)

```bash
pnpm install --frozen-lockfile
```
Durée typique : 1 à 3 min. Vous devez voir en fin d'installation :
`apps/api postinstall: ✔ Generated Prisma Client (v6.19.3)` — c'est le correctif `f08ad68` : sur un clone frais, **le client est généré automatiquement**.

### Étape 3 — Environnement API

```bash
cp apps/api/.env.example apps/api/.env
```

Générez les **4 secrets obligatoires** (commandes valables partout où Node est installé) :
```bash
node -e "console.log('AUTH_JWT_SECRET='+require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('AUTH_MFA_ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('base64'))"
```
Collez chaque valeur dans votre `apps/api/.env` à la place de la ligne vide correspondante. Les valeurs par défaut du template conviennent au local pour tout le reste — notamment :
- `DATABASE_URL=postgresql://cosmoz@127.0.0.1:5433/cosmoz` (base **embarquée**, chemin A) ;
- `CORS_ORIGINS=http://localhost:3000` ;
- `PORT=4000`.

> ⚠️ **Ne commitez jamais ce fichier.** Il est déjà gitignored. Les clés chiffrent des credentials au repos (AES-256-GCM) — les perdre signifie re-connecter les comptes.

### Étape 4 — Environnement Web

```bash
cp apps/web/.env.example apps/web/.env.local
```
Par défaut : `NEXT_PUBLIC_API_MOCKED=true` → le front tourne avec **MSW (mock backend dans le navigateur)**, sans même démarrer l'API. Idéal pour découvrir l'UI.

Pour brancher le **vrai backend** (recommandé une fois l'API démarrée) :
```env
NEXT_PUBLIC_API_LIVE=true
# (optionnel) API_PROXY_TARGET=http://localhost:4000  ← défaut déjà correct
```
En mode LIVE, les requêtes partent vers le **même origine** sous `/api/v1` et Next les proxifie vers l'API — **pas de CORS**, le cookie de refresh reste first-party.

### Étape 5 — Base de données (choisir UN chemin)

**Chemin A — PostgreSQL embarqué (recommandé, zéro Docker) :**
```bash
pnpm api:db:up          # = pnpm --filter @cosmoz/api db:up
pnpm --filter @cosmoz/api db:status   # → DEV: ...5433/cosmoz TEST: ...5433/cosmoz_test
```
- Crée un cluster PostgreSQL 17 dans `apps/api/.localpg/` (trust localhost — usage dev uniquement).
- La première exécution télécharge les binaires portables puis initialise `cosmoz` (dev) et `cosmoz_test` (tests).
- Arrêt : `pnpm --filter @cosmoz/api db:down`.

**Chemin B — Docker (si vous préférez un vrai service) :**
```bash
docker compose up -d db        # PostgreSQL 16 sur le port 5432 (user/pass : cosmoz/cosmoz)
```
Puis dans `apps/api/.env`, changez la connexion :
```env
DATABASE_URL=postgresql://cosmoz:cosmoz@127.0.0.1:5432/cosmoz
```

### Étape 6 — Migrations

```bash
pnpm --filter @cosmoz/api db:deploy    # prisma migrate deploy — sans prompt
```
Les **41 migrations** s'appliquent (rejeu from-zéro réparé et prouvé, cf. §0). La table `Instrument` est déjà peuplée par la migration du trading core.

> `db:migrate` (= `prisma migrate dev`) sert à **créer** de nouvelles migrations pendant le développement. Il peut afficher un avertissement de *drift* à cause de tables legacy présentes en base mais absentes du `schema.prisma` (Academy, Checklist, etc. — modules retirés du code, tables conservées) : c'est un état **documenté et assumé** du repo, pas une erreur chez vous. Pour simplement consommer le schéma, utilisez `db:deploy`.

### Étape 7 — Démarrer l'API (:4000)

```bash
pnpm api:dev            # tsc-watch + restart à chaud
```
Vérification :
```bash
curl http://localhost:4000/health        # infrastructure, sans préfixe
curl http://localhost:4000/api/v1/...    # routes métier (préfixe api + version 1)
```
Les tokens de vérification email (flux register/verify) apparaissent **dans la console de l'API** (mailer dev) — pas de SMTP requis.

Mode production locale (sans watch) :
```bash
pnpm --filter @cosmoz/api build && pnpm --filter @cosmoz/api start
```

### Étape 8 — Démarrer le Web (:3000)

```bash
pnpm --filter web dev
```
Ouvrez http://localhost:3000.

- **Mode MSW** (défaut) : toute l'UI est vivante avec des données mock.
- **Mode LIVE** : `NEXT_PUBLIC_API_LIVE=true` dans `apps/web/.env.local` **puis redémarrez** `next dev` (les `NEXT_PUBLIC_*` sont inlinées au démarrage).

### Étape 9 — Données de démo (optionnel mais recommandé)

Avec **l'API démarrée** (étape 7) :
```bash
node scripts/seed-demo-data.mjs
```
Le script passe par les **vrais endpoints** (register → verify → login → import CSV réel au format MT5) et crée :
- **Utilisateur démo : `trader@cosmoz.app` / `Cosmoz!Demo2026`**
- ~64 trades clôturés sur 6 semaines + positions ouvertes, discipline, analytics.

> **PARTIAL / adaptation à prévoir** : ce script a été écrit pour le sandbox de dev — la constante `LOG` (haut du fichier) pointe un chemin absolu de logs API. Sur votre PC, remplacez-la par `<repo>/scripts/api-run.log` (le mailer dev y logue les tokens) ou lisez le token directement dans la console de l'API. Le seed est idempotent (relancer ne duplique rien — les imports se dédupliquent).

### Étape 10 — Sidecar OCR (optionnel — reconnaissance de captures/PDF)

```bash
cd mini-services/ocr-service
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 3004
```
Puis dans `apps/api/.env` :
```env
OCR_SERVICE_URL=http://127.0.0.1:3004
OCR_SERVICE_TOKEN=<32+ caractères aléatoires — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
```
Redémarrez l'API. **Sans ce sidecar**, tout fonctionne quand même : le moteur mock OCR est actif hors production (§57).

### Étape 11 — Vérifications finales (votre « smoke test » local)

```bash
# 1. Health API
curl -s http://localhost:4000/health

# 2. Suite API complète (PostgreSQL embarqué auto-géré)
pnpm --filter @cosmoz/api test        # attendu : 1293 passed

# 3. Suite web
pnpm --filter web test                # attendu : 98+ passed

# 4. Typecheck + build (les mêmes gardes que le CI)
pnpm --filter @cosmoz/api typecheck
pnpm --filter web exec next build

# 5. Dans le navigateur : http://localhost:3000
#    Mode LIVE : connectez-vous avec trader@cosmoz.app / Cosmoz!Demo2026 (après étape 9)
```

---

## 6. Problèmes fréquents (troubleshooting)

| Symptôme | Cause probable | Remède |
|---|---|---|
| `pnpm: command not found` | corepack non activé | `corepack enable` puis `corepack prepare pnpm@12.4.2 --activate` |
| Corepack : erreur d'intégrité/clés de signature (réseau) | clés npm rotées / proxy d'entreprise | `corepack prepare pnpm@12.4.2 --activate` ; en dernier recours documenté : `COREPACK_INTEGRITY_KEYS=0` (temporaire, ne pas faire une habitude) |
| API : `EnvValidationError ... DATABASE_URL` au boot | `apps/api/.env` absent (le script démarre avec `--env-file-if-exists`) | créer le `.env` (étape 3) |
| API : `Environment variable not found: DATABASE_URL` côté Prisma CLI | même cause | idem |
| `db:up` : port 5433 déjà pris | un autre PostgreSQL local écoute sur 5433 | arrêtez-le, ou changez le port dans `apps/api/scripts/dev-db.mjs` **et** `DATABASE_URL` |
| Cluster `.localpg` corrompu après un crash | arrêt brutal pendant initdb | `pnpm --filter @cosmoz/api db:down` → supprimer `apps/api/.localpg/` → `db:up` → `db:deploy` (données dev perdues, normal) |
| Tests : `P3009 — migrate found failed migrations` | un ancien run a laissé un enregistrement « failed » dans `cosmoz_test` | base de test **jetable par design** : `pnpm --filter @cosmoz/api exec prisma migrate reset --force` avec `DATABASE_URL=postgresql://cosmoz@127.0.0.1:5433/cosmoz_test` |
| `prisma migrate dev` propose un reset / détecte du drift | tables legacy en base, absentes du `schema.prisma` (état documenté du repo) | pour consommer le schéma : `db:deploy` ; `migrate dev` uniquement pour créer de nouvelles migrations |
| Web : tout est « mock » alors que l'API tourne | `NEXT_PUBLIC_API_MOCKED=true` encore actif | passer en `NEXT_PUBLIC_API_LIVE=true` dans `apps/web/.env.local` **et redémarrer `next dev`** |
| Mode LIVE : 401/403 ou CORS en accès direct `NEXT_PUBLIC_API_URL` | origine non allowlistée côté API | ajoutez l'origine dans `CORS_ORIGINS` (virgule-séparé) — ou restez sur le bridge proxy (sans CORS) |
| Port 3000 ou 4000 occupé | autre service | librez le port ou changez `PORT` (API) / `next dev -p 3001` (web) |
| CI GitHub rouge à la 1re exécution | voir l'étape exacte dans l'onglet Actions | comparez avec le tableau §3.3 ; flakes connus : relancer (§3.4) |
| Windows : `corepack enable` échoue (shims) | droits | PowerShell en administrateur une fois |

---

## 7. Publier sur GitHub — et le CI démarre tout seul

```bash
# 1. Créez un repo VIDE sur github.com (sans README/.gitignore — le repo en a déjà).

# 2. Reliez le dépôt local et poussez :
git remote add origin https://github.com/<votre-compte>/<votre-repo>.git
git push -u origin main
```

- Le workflow `ci` se déclenche **immédiatement** (`push` sur `main`), puis à chaque PR.
- Durée attendue : **~8–12 min** (le job `api` est dominé par la suite de tests) ; `web` tourne en parallèle.
- Un badge peut être ajouté au README : `![ci](https://github.com/<votre-compte>/<votre-repo>/actions/workflows/ci.yml/badge.svg)`.
- **Secrets GitHub** : le CI n'en demande **aucun** — les secrets de test sont fixes et codés en dur dans `test/global-setup.ts` (uniquement valables sur `cosmoz_test`, par conception). Rien à configurer pour que le CI passe.

---

## 8. Aperçu production (honnête — à valider sur VOTRE machine)

Ce qui est **prêt** :
- `apps/api/Dockerfile` : image API non-root (durcissement **R1 ✅**), consommée par le profil `full` du compose.
- `docker compose --profile full up` → PostgreSQL + conteneur API (les variables prod y sont pré-remplies : `NODE_ENV=production`, `CORS_ORIGINS=http://localhost:3000` — **à resserrer**).
- Le build web est statique + SSR standard Next.js : déployable sur Vercel/Node (`pnpm --filter web build && pnpm --filter web start`).
- **Garde-fous §57 automatiques** : en `NODE_ENV=production`, les providers mock (`ACCOUNTS_MOCK_PROVIDER`, `OCR_MOCK_ENGINE`) se désactivent par défaut ; `CORS_ORIGINS` est **obligatoire** et `*` est rejeté ; aucune route métier ne tourne sans configuration valide (fail-fast au boot).

Checklist avant une vraie prod (mono-instance) :
1. `DATABASE_URL` réelle + identifiants forts (jamais trust/localhost).
2. `CORS_ORIGINS` = domaine exact du front. `TRUST_PROXY=true` **uniquement** derrière un reverse proxy de confiance (sinon le rate limiter verrait l'IP du proxy).
3. Secrets régénérés et distincts (JWT 48 octets, 3 clés AES 32 octets — jamais partagées entre elles).
4. Sauvegardes PostgreSQL planifiées (le manuel **R2 ✅** existe dans ce repo — procédure restore testée).
5. HTTPS partout ; le refresh cookie est déjà `HttpOnly`/`SameSite`.
6. **Valider `docker build`/`docker run` sur votre PC** — aucun démon Docker dans l'environnement de développement de ce projet, donc **non testé ici** (PARTIAL by design).

Ce qui reste **ouvert** (registre de sécurité, non bloquant pour une prod mono-instance) :
- **R3** (MEDIUM/OUVERT) : verrouillage par compte — limiteur composite (compte+IP) sur login + régressions e2e.
- **R4** : le limiteur est en mémoire → mono-instance. Un scale-out multi-nœuds exigera Redis (limiteur distribué) — c'est le seul scénario où Redis entrera dans cette architecture.

---

## 9. Annexe A — Variables d'environnement API

**Obligatoires (fail-fast au boot si absentes/invalides)** — contrat validé par `apps/api/src/config/env.schema.ts` :

| Variable | Format | Rôle |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | connexion PostgreSQL (embarquée : `postgresql://cosmoz@127.0.0.1:5433/cosmoz`) |
| `AUTH_JWT_SECRET` | ≥ 32 caractères | signature HS256 des access tokens |
| `AUTH_MFA_ENCRYPTION_KEY` | base64 = 32 octets | chiffrement des secrets TOTP au repos |
| `ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY` | base64 = 32 octets | chiffrement des credentials brokers au repos |
| `INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY` | base64 = 32 octets | chiffrement des secrets de webhooks (clé séparée — jamais mutualisée) |

**Principales optionnelles (défauts corrects en local)** :

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | 4000 | écoute API |
| `NODE_ENV` | development | `test` \| `development` \| `production` |
| `CORS_ORIGINS` | `http://localhost:3000` | allowlist stricte (pas de `*`, jamais) |
| `LOG_LEVEL` | info | debug \| info \| warn \| error |
| `WEB_APP_URL` | `http://localhost:3000` | construit les liens email (verify/reset) |
| `RATE_LIMIT_WINDOW_SECONDS` / `RATE_LIMIT_MAX` | 60 / 120 | limiteur global **en mémoire** (R4) |
| `BODY_LIMIT_BYTES` | 9437184 | doit rester > plus grand cap image ×4/3 (invariant validé au boot) |
| `TRADES_SCREENSHOTS_ROOT` | `.data/trades-screenshots` | stockage binaire captures trades |
| `OCR_SERVICE_URL` + `OCR_SERVICE_TOKEN` | unset | sidecar OCR optionnel (token ≥ 32 chars, requis si URL posée) |
| `ACCOUNTS_MOCK_PROVIDER` | enabled hors prod | gate mock §57 |
| `ACCOUNTS_OANDA_PROVIDER` / `ACCOUNTS_DERIV_PROVIDER` / `ACCOUNTS_MT5_BRIDGE_PROVIDER` | disabled | gates providers réels — **jamais** default-on |

Web (`apps/web/.env.local`) : `NEXT_PUBLIC_API_MOCKED` (défaut true) \| `NEXT_PUBLIC_API_LIVE` \| `NEXT_PUBLIC_API_URL` (cross-origin direct, inclure `/api/v1`) \| `API_PROXY_TARGET` (défaut `http://localhost:4000`).

---

## 10. Annexe B — Commandes utiles (cheat sheet)

```bash
# ── Installation ────────────────────────────────────────────────
corepack enable                                     # pnpm via corepack
pnpm install --frozen-lockfile                      # deps + prisma generate (postinstall)

# ── Base de données ─────────────────────────────────────────────
pnpm api:db:up                                      # cluster embarqué (5433)
pnpm --filter @cosmoz/api db:status                 # état du cluster
pnpm --filter @cosmoz/api db:down                   # arrêt
pnpm --filter @cosmoz/api db:deploy                 # migrations (sans prompt)
pnpm --filter @cosmoz/api db:migrate                # créer une migration (dev)

# ── Exécution ───────────────────────────────────────────────────
pnpm api:dev                                        # API :4000 (watch)
pnpm --filter @cosmoz/api build && pnpm --filter @cosmoz/api start   # API prod-like
pnpm --filter web dev                               # Web :3000 (MSW par défaut)

# ── Qualité (miroir exact du CI) ────────────────────────────────
pnpm --filter @cosmoz/api lint
pnpm --filter @cosmoz/api typecheck
pnpm --filter @cosmoz/api build
pnpm --filter @cosmoz/api test                      # 1293 tests, PG embarqué auto-géré
pnpm --filter @cosmoz/shared exec tsc -p tsconfig.json --noEmit
pnpm --filter web exec tsc --noEmit
pnpm --filter web exec next build

# ── Données ─────────────────────────────────────────────────────
node scripts/seed-demo-data.mjs                     # démo complète (API démarrée requise)
node scripts/seed-instruments.mjs                   # catalogue instruments (réparation idempotente)
```

---

## 11. Traçabilité de la vérification du 2026-10-17

| Objet | Référence |
|---|---|
| Correctif postinstall Prisma | commit `f08ad68` (annotation `ci.yml` incluse) |
| Correctifs migrations + tests MT5 auto-contenus | commit `4970571` |
| Logs de simulation CI (clone frais) | `scripts/ci-sim/final-*.log` (install, lint, typecheck, build, test 1293/1293, tc shared/web, next build) |
| Preuve rejeu migrations from-zéro | itérations scratch `scripts/ci-sim/replay-*.log` ; rejeu 41/41 ; diff de convergence vs DB sandbox |
| Classification finale | CI simulé **PASS** (7/7 étapes) · CI GitHub réel **à valider au 1er push** · Redis **N-A** · Docker **à valider sur PC** · seed démo **PARTIAL** (chemin `LOG` à adapter) · sidecar OCR **non exécuté ici** |

**Prochaines étapes naturelles** : pousser sur GitHub (§7) et constater le premier run vert → traiter **R3** (limiteur composite compte+IP + régressions e2e) → implémenter l'onboarding GSAP en attente.
