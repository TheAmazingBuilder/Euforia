# 💾 Savepoint — Cosmoz « Le Registre »

> **Fichier de reprise** : snapshot complet du 2026-10-13, créé avant le restart sandbox de minuit.
> Contient TOUTES les implémentations Oryon du début jusqu'au 13 octobre 2026 (Phase 11 incluse).

- **Date du savepoint** : 2026-10-13
- **Commit validé** : voir `git log -1` (Phase 11 web — Trade Planning / Scenarios / Post-Trade Review)
- **Tag git** : `savepoint/2026-10-13` (créé sur ce commit) — précédent : `savepoint/2026-10-12`
- **Bundle git** : `download/oryon-git-2026-10-13.bundle` (historique git COMPLET, cloneable, 219M, vérifié « complete history »)
- **Archive DB** : `download/oryon-localpg-2026-10-13.tar.gz` (data dir Postgres brut, 22M, WAL inclus)
- **Archive extras** : `download/oryon-extras-2026-10-13.tar.gz` (.env ×2, données OCR, worklog, SAVEPOINT)

---

## ⚠️ CHANGEMENT MAJEUR vs savepoint précédent : la base de données

**L'ancien SQLite `db/custom.db` n'existe plus.** Le backend API utilise maintenant un
**PostgreSQL embarqué** (`@embedded-postgres/linux-x64@17.5.0-beta.15`) :

- Data directory : `apps/api/.localpg/data`
- Connexion : `postgresql://cosmoz@127.0.0.1:5433/cosmoz` (voir `apps/api/.env`)
- Schéma Prisma : `apps/api/prisma/schema.prisma` (74K) + 36 migrations `apps/api/prisma/migrations/`
- PID/socket : `apps/api/.localpg/sockets` (port 5433)
- Le data dir est **hors git** (gitignore) → sauvegardé dans `oryon-localpg-2026-10-13.tar.gz`

---

## Comment restaurer

### Option A — le repo existe encore (sandbox préservé)
```bash
cd /home/z/my-project
git stash && git status            # sécuriser le travail en cours
git checkout savepoint/2026-10-13  # ou: git reset --hard savepoint/2026-10-13
pnpm install
```

### Option B — tout a disparu (nouveau sandbox)
```bash
# 1. Restaurer le code depuis le bundle (historique git complet) :
git clone /home/z/my-project/download/oryon-git-2026-10-13.bundle /home/z/my-project
cd /home/z/my-project && git checkout main

# 2. Dépendances (réinstalle @embedded-postgres/linux-x64@17.5.0-beta.15 — binaire pinné par pnpm-lock)
pnpm install

# 3. Extraire les extras (.env, OCR storage, worklog) :
tar -xzf download/oryon-extras-2026-10-13.tar.gz -C /home/z/my-project

# 4. Restaurer la base Postgres :
tar -xzf download/oryon-localpg-2026-10-13.tar.gz -C /home/z/my-project/apps/api/

# 5. Lancer l'API (elle démarre le Postgres embarqué automatiquement) puis le web :
pnpm --filter api dev     # API :4000, PG :5433
pnpm --filter web dev     # web :3000 (dev) ou: next start -p 3000
```

### Option C — upload manuel (le dossier download/ est téléchargeable par l'owner)
Télécharger les 3 fichiers AVANT le restart (bundle + localpg + extras), puis dans le
nouveau sandbox : upload les 3 → suivre l'Option B à partir de l'étape 2.
**Ordre de priorité si manque de temps/bande passante : bundle git d'abord (code),
localpg ensuite (données), extras enfin (.env re-créables à la main).**

### Re-création manuelle des .env (si extras indisponible)
```bash
echo 'DATABASE_URL=file:/home/z/my-project/db/custom.db' > /home/z/my-project/.env
cat > /home/z/my-project/apps/api/.env <<'EOF'
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://cosmoz@127.0.0.1:5433/cosmoz
AUTH_JWT_SECRET=cosmoz-local-dev-jwt-secret-0123456789abcdef0123456789
AUTH_MFA_ENCRYPTION_KEY=h0mEbiEr05Qkg5f8Duz4PrOups2o69gGx+LIEdXAuvU=
ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY=Mck3U8lb0RHzT7eDlBd7hgmE5FpYm0ZOSJB3ZfA4GFo=
INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY=u4xveSMFK0EL4Wp6XsBmPWcimrrG7Tg9KxLFRnGzc1M=
WEB_APP_URL=http://localhost:3000
EOF
```

---

## Contenu sauvegardé (au 2026-10-13)

| Domaine | État |
|---|---|
| Journal de trade Cosmoz/Oryon | complet (auth démo, positions, notes, workspace) |
| Graphique TradingView-like | candles, zoom/pan, timeframes, drawing tools v3, menu contextuel TV (4 onglets), légende OHLC colorée, presets 7 palettes candles |
| Toolbar v4 | layout parity TradingView (tf en haut, rail pleine hauteur, dock objets, favoris flottant) |
| Outil position | handles TP/SL latéraux (drag target=rr), palette couleur TV 10×7 avec swatches custom + opacité |
| Structure de marché (Phase 9) | BOS/CHoCH pivot→break lines (labels boxés, CHoCH dashed), styles pivot (arrows/dots), toggle break-lines — vérifié 38/38 |
| Sidebar auto-collapse | entrée /oryon → rail icon mode 72px depuis TOUT point d'entrée, restaure la largeur en sortie — probe 11/11 |
| Phase 10 — Journal Integration | annotations chart ↔ trades, snapshot workflow |
| Phase 11 backend | `/oryon/analyses` CRUD (payload immuable, PATCH metadata-only, lien canonical-trade ownership+symbol), `/plans` machine DRAFT→ACTIVE→INVALIDATED/COMPLETED→ARCHIVED, scénarios Primary/Alternative/Invalidation, levels hypothétiques, plan-vs-actual avec nulls honnêtes, idempotence clientRequestId |
| Phase 11 web | Trade Planning / Analysis Scenarios / Post-Trade Review dans le drawer journal |
| Calendrier éco | pont ForexFactory derrière `/eco-events` + notifications HIGH |
| Base de données | **PostgreSQL embarqué** port 5433 (data dir `apps/api/.localpg/data`) — contenu léger au 13/10 : 1 user démo, 2 OryonAnalysis ; le schéma (74K + 36 migrations) est dans git |
| Stockage OCR | 767 screenshots `apps/api/.data/ocr-storage` (12M) — dans l'archive extras |

---

## Pièges connus (déjà rencontrés — ne pas re-apprendre)
| Piège | Parade |
|---|---|
| `DATABASE_URL=file:...` exporté dans le shell écrase `apps/api/.env` pour la CLI Prisma | passer `--url 'postgresql://cosmoz@127.0.0.1:5433/cosmoz'` explicitement (`--url` et `--schema` sont mutuellement exclusifs) |
| `pg_dump`/`psql` absents du package embedded-postgres (seuls initdb/pg_ctl/postgres) | backup = CHECKPOINT via `prisma db execute --url …` PUIS tar du data dir (crash-consistent, WAL rejoué au start) |
| `node_modules` / `.env.local` perdus après reset sandbox | `pnpm install` + extraire `oryon-extras` (voir Option B) |
| Port :3000 — stale `next start` → chunks 500 | `lsof -ti:3000 \| xargs kill` PUIS `(cd apps/web && setsid nohup npx next start -p 3000 > /tmp/log 2>&1 < /dev/null &)` |
| EADDRINUSE silencieux au démarrage | toujours tuer le port avant de relancer |
| AUTH-1 : 401 `/api/auth/me` + refresh en nouvelle session | bruit attendu, PAS un bug |
| Playwright `wait_until="networkidle"` ne converge jamais (socket.io) | utiliser `domcontentloaded` + attentes fixes |
| Le portail dev-overlay Next (`nextjs-portal`) vole les clics en E2E | helper `dismiss_dev_overlay()` (voir `scripts/shots_sidebar_sections.py`) |
| `tsc`/`eslint` cassés après restauration | `pnpm --filter web exec tsc --noEmit` et `pnpm --filter web exec eslint . --max-warnings=0` doivent ressortir CLEAN |

---

## Historique des savepoints
- `savepoint/2026-09-29` → commit `4af9dab` (sidebar v2)
- `savepoint/2026-10-12` → commit `9515b2f` (toolbar v4 + pont éco réel)
- `savepoint/2026-10-13` → head principal (Phase 11 complète) ← **vous êtes ici**
