# Oryon — Guide d'installation & de configuration locale (ultra complet)

> **Version** : 1.0 · **Date** : 2026-10-19 · **Commit de référence** : `8b9269c` (post-purge 185 Mo)
> **Public** : owner qui installe et lance Oryon sur son propre PC (Windows / macOS / Linux)
> **Garantie** : ce guide a été rédigé sur le dépôt exact livré ; la batterie de vérification
> (tsc ×3, tests web, tests API, gardes) est exécutée le même jour (voir §9).

---

## Table des matières

1. [Vue d'ensemble & architecture](#1-vue-densemble--architecture)
2. [Prérequis](#2-prérequis)
3. [Récupération du projet](#3-récupération-du-projet)
4. [Installation des dépendances](#4-installation-des-dépendances)
5. [Configuration des variables d'environnement](#5-configuration-des-variables-denvironnement)
6. [Base de données — vide par design](#6-base-de-données--vide-par-design)
7. [Lancement du projet](#7-lancement-du-projet)
8. [Premier accès et création de votre compte](#8-premier-accès-et-création-de-votre-compte)
9. [Vérifier que tout fonctionne](#9-vérifier-que-tout-fonctionne)
10. [Services optionnels (OCR, market data)](#10-services-optionnels-ocr-market-data)
11. [Build de production local](#11-build-de-production-local)
12. [Structure du dépôt](#12-structure-du-dépôt)
13. [Dépannage](#13-dépannage)
14. [Sécurité et bonnes pratiques](#14-sécurité-et-bonnes-pratiques)

---

## 1. Vue d'ensemble & architecture

Oryon (nom de code interne **Cosmoz**) est une plateforme de trading analytics organisée en
**monorepo pnpm + Turborepo**. Trois applications coopèrent : un frontend Next.js, une API
NestJS et des micro-services optionnels (OCR FastAPI, market data sidecar). Le contrat de
données partagé entre frontend et backend vit dans `packages/shared` (schemas Zod) — c'est
la source de vérité unique pour les types, les primitives monétaires (decimal-string, UTC
strict) et les utilitaires de sécurité (assainissement CSV).

| Composant | Stack | Port en dev | Dossier |
|---|---|---|---|
| **Web** (frontend) | Next.js (App Router) + TypeScript + Tailwind + Radix/shadcn + TanStack Query v5 | **3000** | `apps/web` |
| **API** (backend) | NestJS + Prisma ORM + class-validator | **4000** | `apps/api` |
| **Base de données** | PostgreSQL 17 (embarquée en dev, `pnpm api:db:up`) | **5433** | `apps/api/.localpg` (créée au premier lancement) |
| **OCR service** (optionnel) | FastAPI (Python) | **3004** | `mini-services/ocr-service` |
| **Market service** (optionnel) | Bun/Node sidecar | **3003** | `mini-services/market-service` |

**Flux en mode réel** : le navigateur parle au web Next.js (:3000) ; les appels API partent
vers le **même origine** sous `/api/v1`, et `next.config.ts` les proxifie vers l'API
(:4000). Aucun CORS à gérer en local, le cookie de refresh reste first-party. Le mode
« mocks MSW » existe pour les démos mais est **désactivé** dans la configuration livrée
(§5.3) — vous tapez toujours sur la vraie API et votre vraie base.

**Base de données vide par design** : le dépôt ne contient **aucun seed**, aucun jeu de
données fictif, aucun compte de démonstration. Après la migration du schéma, toutes les
tables sont vides et vous remplissez la base avec **vos propres données** via l'interface
(§8).

## 2. Prérequis

| Outil | Version requise | Vérification | Notes |
|---|---|---|---|
| **Node.js** | ≥ 20 (développé/testé sur v24.21.0) | `node -v` | LTS recommandé |
| **pnpm** | **12.4.2** exactement (champ `packageManager`) | `pnpm -v` | via `corepack enable pnpm` ou `npm i -g pnpm@12.4.2` |
| **Git** | toute version récente | `git -v` | pour cloner / historique |
| **PostgreSQL** | 17 — **uniquement pour l'option B** (§6) | — | inutile si vous utilisez la DB embarquée |
| **Python** | 3.11+ — optionnel (OCR) | `python3 --version` | mini-services/ocr-service |
| **Bun** | récent — optionnel (market) | `bun -v` | mini-services/market-service |

> **pnpm via corepack** (recommandé, aucune installation globale) :
> ```bash
> corepack enable
> corepack prepare pnpm@12.4.2 --activate
> pnpm -v   # doit afficher 12.4.2
> ```
> Le lockfile `pnpm-lock.yaml` est **canonique** — `bun.lock` a été retiré du dépôt lors de
> la purge du 2026-10-19. N'utilisez pas npm ni yarn : pnpm garantit l'isolation des
> workspace packages et l'application des `overrides` de sécurité (deepmerge-ts,
> source-map-js, sharp épinglés — audit `pnpm audit --prod` = 0 vulnérabilité).

## 3. Récupération du projet

Deux artefacts de livraison existent ; choisissez-en **un seul**.

### Option A — Tarball « clé en main » (recommandé)

```bash
# Le fichier oryon-full-workspace-FINAL-2026-10-19.tar.gz contient le workspace
# complet (.git inclus, node_modules et caches exclus).
mkdir -p ~/oryon && tar -xzf oryon-full-workspace-FINAL-2026-10-19.tar.gz -C ~/oryon
cd ~/oryon
git log --oneline -1   # doit afficher le commit de référence
```

### Option B — Bundle git (historique complet)

```bash
git clone oryon-git-history-FINAL-2026-10-19.bundle oryon
cd oryon && git checkout main
```

> Le bundle contient l'intégralité de l'historique (300+ commits, tags savepoint). Si vous
> ne voulez pas de l'historique sur votre machine, un clone superficiel depuis le bundle
> réduit la taille : `git clone --depth 1 oryon-git-history-FINAL-2026-10-19.bundle oryon`.

## 4. Installation des dépendances

À la racine du dépôt :

```bash
pnpm install --frozen-lockfile
```

Cette commande unique installe tout : web, api, packages/shared, et génère le client
Prisma (postinstall). Sur une machine neuve, comptez 1 à 3 minutes (stock pnpm local).

Vérification :

```bash
pnpm -v          # 12.4.2
ls node_modules/.bin/turbo   # présent
```

> **Ne lancez PAS** `pnpm install` sans `--frozen-lockfile` si vous voulez reproduire
> exactement l'état validé ; omettez le flag uniquement si vous ajoutez volontairement des
> dépendances.

## 5. Configuration des variables d'environnement

Deux fichiers à créer. Les templates documentés existent : `apps/api/.env.example` et
`apps/web/.env.example`. **Aucun `.env` n'est versionné** (vérifié par la garde
`check-tracked-secrets`, 1528 fichiers scannés) — c'est voulu.

### 5.1 API — `apps/api/.env`

Copiez le template puis renseignez les secrets :

```bash
cp apps/api/.env.example apps/api/.env
```

Variables **obligatoires** (l'API refuse de démarrer sans elles — validation fail-fast
`env.schema.ts`) :

| Variable | Rôle | Comment générer |
|---|---|---|
| `DATABASE_URL` | Connexion PostgreSQL | `postgresql://cosmoz@127.0.0.1:5433/cosmoz` (DB embarquée, trust localhost) |
| `AUTH_JWT_SECRET` | Signature des JWT (accès + refresh) | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `AUTH_MFA_ENCRYPTION_KEY` | AES-256-GCM : secrets TOTP au repos | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY` | AES-256-GCM : secrets webhook | idem (clé **distincte** des autres) |
| `ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY` | AES-256-GCM : credentials brokers | idem (clé **distincte**) |

Variables recommandées en local (valeurs par défaut saines) :

| Variable | Valeur locale | Rôle |
|---|---|---|
| `NODE_ENV` | `development` | Mode courant |
| `PORT` | `4000` | Port d'écoute API |
| `CORS_ORIGINS` | `http://localhost:3000` | Allow-list stricte (pas de `*` — rejeté par le schéma) |
| `LOG_LEVEL` | `debug` en dev | Verbosité des logs |
| `TRUST_PROXY` | `false` | Ne mettre `true` QUE derrière un reverse proxy de confiance |
| `WEB_APP_URL` | `http://localhost:3000` | Base des liens email (vérification, reset) |
| `EMAIL_FROM` | `Cosmoz <no-reply@cosmoz.app>` | Expéditeur des emails transactionnels |

> **Secrets déjà générés pour vous** : le fichier `apps/api/.env` est livré dans le tarball
> avec des secrets CSPRNG frais générés le 2026-10-19 (l'ancien fichier n'a pas survécu au
> redémarrage du sandbox — aucune perte réelle puisque ces secrets ne chiffreront que VOS
> futures données). Vous pouvez les régénérer quand vous voulez avec les commandes du
> tableau ci-dessus.

### 5.2 Rules d'or des secrets

1. Quatre clés = quatre secrets **différents** — ne jamais réutiliser la même valeur.
2. Ne committez jamais ces fichiers (le `.gitignore` les exclut déjà ; la garde CI
   `check-tracked-secrets.mjs` bloque toute régression).
3. En cas de fuite : régénérez la clé, redéployez, et re-saisissez les credentials chiffrés
   concernés (les données chiffrées avec l'ancienne clé deviennent illisibles — par design).

### 5.3 Web — `apps/web/.env.local`

```bash
cp apps/web/.env.example apps/web/.env.local
```

Puis assurez ces deux lignes (c'est la configuration livrée) :

```bash
NEXT_PUBLIC_API_MOCKED=false
API_PROXY_TARGET=http://localhost:4000
```

> ⚠️ `NEXT_PUBLIC_API_MOCKED=false` est **essentiel** : sans lui, le mode développement
> Next.js reste sur le backend MSW simulé (données fictives). Avec `false`, toutes les
> requêtes partent sur votre vraie API via le proxy same-origin — zéro mock, zéro donnée
> fictive. En build de production, le mode réel est de toute façon imposé.

## 6. Base de données — vide par design

### 6.1 Option A (recommandée en local) — PostgreSQL embarquée

Le dépôt embarque un gestionnaire de base de développement :

```bash
pnpm api:db:up        # démarre PostgreSQL 17 embarquée sur 127.0.0.1:5433
pnpm --filter @cosmoz/api db:status   # vérifie l'état
```

- Binaire géré via la dépendance `embedded-postgres` — **aucune installation système**.
- Authentification **trust** sur 127.0.0.1 uniquement (convenience dev — jamais en prod).
- Les données vivent dans `apps/api/.localpg/` (créé au premier `db:up`, hors git).
- `pnpm api:db:down` stoppe l'instance ; `db:status` diagnostique.

Puis appliquez le schéma (42 migrations Prisma) :

```bash
pnpm --filter @cosmoz/api exec prisma migrate deploy
```

### 6.2 Option B — Votre propre PostgreSQL (Docker ou installation système)

```bash
# Exemple Docker
docker run -d --name oryon-pg -e POSTGRES_USER=oryon \
  -e POSTGRES_PASSWORD=change-me -e POSTGRES_DB=cosmoz \
  -p 5433:5432 postgres:17
```

Adaptez ensuite `DATABASE_URL` dans `apps/api/.env` :
`postgresql://oryon:change-me@127.0.0.1:5433/cosmoz`, puis :

```bash
pnpm --filter @cosmoz/api exec prisma migrate deploy
```

### 6.3 Pourquoi la base sera vide — et c'est voulu

- **Aucun fichier de seed n'existe** dans le dépôt (aucune clé `prisma.seed` dans les
  `package.json`, aucun `prisma/seed.ts`). Les 42 migrations créent uniquement la
  **structure** (tables, index, contraintes uniques).
- Les comptes, plans de trading, sessions, journaux… sont créés **par vous**, via
  l'interface (§8) ou les imports.
- Les données de test utilisées pendant le développement vivaient dans `.localpg` (non
  versionné, non livré) et ont été purgées — le tarball ne contient **aucune donnée**.
- Pour repartir de zéro plus tard : `pnpm api:db:down`, supprimez `apps/api/.localpg/`,
  `pnpm api:db:up`, `prisma migrate deploy` — base neuve, schéma propre.

## 7. Lancement du projet

### 7.1 Tout lancer (recommandé)

```bash
pnpm api:db:up        # d'abord la base
pnpm dev              # turbo dev : API :4000 + Web :3000
```

- Web : http://localhost:3000
- API : http://localhost:4000 (routes sous le préfixe `/api/v1`)

### 7.2 Lancer séparément (deux terminaux)

```bash
# Terminal 1 — API
pnpm api:dev          # NestJS en watch mode sur :4000

# Terminal 2 — Web
pnpm --filter @cosmoz/web dev   # Next.js sur :3000
```

> Le premier `next dev` compile à la volée : laissez 10 à 30 secondes avant le premier
> chargement de page.

## 8. Premier accès et création de votre compte

1. Ouvrez **http://localhost:3000** — vous arrivez sur l'écran d'authentification (groupe
   de routes `(auth)`).
2. Cliquez sur **créer un compte** (route `/register`) et remplissez le formulaire :
   email + mot de passe fort. Le mot de passe est haché **Argon2id** (paramètres OWASP) ;
   l'inscription est protégée contre l'énumération d'emails et le rate limiting multi-couches.
3. Selon le flux, un email de vérification est émis. En local sans SMTP configuré, le
   mailer journalise le lien dans la console de l'API (terminal 1) — copiez ce lien dans
   votre navigateur pour valider l'adresse.
4. Connectez-vous. Optionnel mais recommandé : activez la **MFA (TOTP)** depuis les
   réglages de sécurité — les secrets sont chiffrés AES-GCM et les codes de récupération
   sont stockés hachés, à usage unique.
5. La base est vide : tous les modules (accounts, analytics, calendar, discipline,
   journal/review, plans, replay…) démarrent à zéro. Créez d'abord vos **comptes de
   trading** (Connectivité : mock provider activé en dev ; OANDA/Deriv en opt-in
   explicite avec vos propres clés API), puis alimentez les autres modules.

> Aucun compte préexiste, aucun contenu de démonstration n'est injecté. Tout ce que vous
> voyez dans l'app vient de VOS saisies.

## 9. Vérifier que tout fonctionne

### 9.1 Checks rapides

```bash
# API up
curl -s http://localhost:4000/api/v1/health | head -c 200
# Web up (le proxy /api/v1 doit relayer vers l'API)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
# Base up
pnpm --filter @cosmoz/api db:status
```

### 9.2 Batterie de tests complète (état de référence du 2026-10-19)

```bash
pnpm test             # turbo test : web + api
```

Résultats de référence sur la livraison :

| Suite | Résultat | Notes |
|---|---|---|
| Web (vitest) | **223/223** | ~7 s |
| API (vitest, Postgres réel embarqué) | **1350/1351** | 1 flake pré-existant documenté : `oanda recovery sweep` (timeout 30 s, timing scheduler) — non bloquant |
| TypeScript | 0 erreur (`tsc --noEmit` ×3 : web, api, shared) | |
| Garde anti-mocks en prod | PASS | `check-prod-mock-leakage.mjs` |
| Garde anti-secrets trackés | PASS | 1528 fichiers scannés |
| `pnpm audit --prod` | **0 vulnérabilité** | 3 HIGH transitives épinglées via overrides |

## 10. Services optionnels (OCR, market data)

### 10.1 OCR — reconnaissance de captures d'écran (FastAPI)

Sans ce service, le module OCR dégrade proprement (`OCR_UNAVAILABLE`) — l'application
reste 100 % fonctionnelle pour le reste.

```bash
cd mini-services/ocr-service
python3 -m venv .venv && source .venv/bin/activate   # Windows : .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 3004
```

Puis dans `apps/api/.env` :

```bash
OCR_SERVICE_URL=http://127.0.0.1:3004
OCR_SERVICE_TOKEN=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
```

(redémarrez l'API après ajout). Le même token doit être passé au sidecar — consultez
`mini-services/ocr-service/README.md`. Les uploads sont validés par **magic bytes**, les
fichiers vivent hors git (`apps/api/.data/`, purgé à la livraison).

### 10.2 Market data sidecar (Bun, :3003)

Optionnel, utilisé par le calendrier éco/événements de marché :

```bash
cd mini-services/market-service && bun run dev   # ou node selon le service
# puis dans apps/api/.env : MARKET_SERVICE_URL=http://localhost:3003
```

## 11. Build de production local

```bash
pnpm build            # turbo build : next build + nest build
NODE_ENV=production pnpm --filter @cosmoz/api exec node dist/main.js   # exemple
```

Points de vigilance production (validés par l'audit sécurité du 2026-10-19 — rapports
`docs/audits/SECURITY-AUDIT-REPORT-2026-10-19.md` et
`SECURITY-AUDIT-PART2-SECTIONS-2.26-2.40-REPORT.md`) :

- `NODE_ENV=production` **désactive** le mock trading provider et le mock OCR — une vraie
  `OCR_SERVICE_URL` devient requise.
- `CORS_ORIGINS` doit lister vos origines exactes (`*` rejeté au démarrage).
- Les erreurs 5xx sont masquées côté client, aucun stack trace ne fuit ; les headers de
  sécurité (XFO, nosniff, referrer, CSP frame-ancestors) sont posés par le web.
- `TRUST_PROXY=true` uniquement derrière un reverse proxy HTTPS de confiance.

## 12. Structure du dépôt

```
oryon/
├── apps/
│   ├── web/                    # Frontend Next.js (App Router)
│   │   ├── src/app/(auth)/     # login, register, MFA…
│   │   ├── src/app/(app)/      # modules métier (accounts, analytics, calendar…)
│   │   ├── src/lib/            # client API same-origin, export builders
│   │   └── scripts/            # gardes (mock-leakage) et utilitaires
│   └── api/                    # Backend NestJS
│       ├── src/modules/        # 25+ modules métier
│       ├── src/infrastructure/ # health, env, sécurité
│       ├── prisma/             # schema.prisma + 42 migrations (structure seule)
│       └── scripts/dev-db.mjs  # PostgreSQL embarquée (db:up / status)
├── packages/shared/            # Contrats Zod, primitives monétaires, utils CSV
├── mini-services/
│   ├── ocr-service/            # FastAPI — reconnaissance de screenshots
│   └── market-service/         # Sidecar données de marché
├── docs/
│   ├── specs/master/           # Spécifications phases
│   └── audits/                 # 20+ rapports d'audit + CE GUIDE
├── scripts/                    # Scripts de vérification ponctuels (session)
├── docker-compose.yml          # db+api loopback-only (127.0.0.1)
├── pnpm-workspace.yaml         # overrides sécurité (déps épinglées)
└── turbo.json                  # Orchestration dev/build/test
```

## 13. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| L'API démarre pas : erreur env | Variable obligatoire absente | Comparez avec `apps/api/.env.example` ; les 4 clés + `DATABASE_URL` sont requises |
| `ECONNREFUSED 127.0.0.1:5433` | DB embarquée arrêtée | `pnpm api:db:up` puis relancez l'API |
| `P1003` / migrations manquantes | Schéma non appliqué | `pnpm --filter @cosmoz/api exec prisma migrate deploy` |
| Le web affiche des données fictives | `NEXT_PUBLIC_API_MOCKED` non à `false` | Corrigez `apps/web/.env.local`, redémarrez `next dev` |
| `404 /api/v1/...` depuis le web | API arrêtée ou mauvais `API_PROXY_TARGET` | Vérifiez l'API :4000 et `API_PROXY_TARGET=http://localhost:4000` |
| Erreur CORS | Origine non allowlistée | Ajoutez l'origine exacte à `CORS_ORIGINS` (jamais `*`) |
| Port 3000/4000 occupé | Autre service local | Libérez le port ou changez `PORT` (API) et le proxy cible |
| `pnpm: command not found` | pnpm non installé | `corepack enable && corepack prepare pnpm@12.4.2 --activate` |
| Tests API : 1 échec `oanda recovery sweep` | Flake de timing scheduler connu (30 s timeout) | Relancez ; documenté comme non-bloquant dans l'audit |
| Reset complet de la base | Repartir de zéro | `db:down` → supprimez `apps/api/.localpg/` → `db:up` → `migrate deploy` |

## 14. Sécurité et bonnes pratiques

1. **Secrets** : régénérez les 4 clés si vous exposez l'app au-delà de localhost
   (commandes §5.1). Ne les partagez jamais ; ils ne quittent jamais votre machine.
2. **Fichiers `.env`** : exclus du dépôt et de la garde CI. Ne forcez jamais un
   `git add -f apps/api/.env`.
3. **Mots de passe** : Argon2id côté serveur ; n'abaissez jamais les paramètres.
4. **MFA** : activation recommandée immédiatement après votre premier login.
5. **Providers de trading réels** (OANDA/Deriv) : opt-in explicite par variable
   (`ACCOUNTS_OANDA_PROVIDER=enabled`…), clés API chiffrées AES-256-GCM au repos, jamais
   retournées par l'API.
6. **Webhooks entrants** : HMAC + fenêtre anti-replay intégrés ; fournissez vos secrets
   fournisseur via l'interface (chiffrés), pas via des fichiers.
7. **Mises à jour** : `pnpm audit --prod` doit rester à 0 ; les `overrides` de
   `pnpm-workspace.yaml` protègent les déps transitives — mettez-les à jour consciencieusement.
8. **Backups** : `pg_dump` de votre DB + copie de `apps/api/.env` hors machine — c'est
   votre seul état irremplaçable une fois vos données saisies.
