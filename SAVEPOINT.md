# 💾 Savepoint — Cosmoz « Le Registre »

> **Fichier de reprise** : snapshot complet du 2026-10-12, créé avant le restart sandbox de minuit.
> Contient TOUTES les implémentations Oryon du début jusqu'au 12 octobre 2026.

- **Date du savepoint** : 2026-10-12
- **Commit validé** : voir `git log -1` (head principal, contient toolbar v3 + v4, pont éco réel + notifs HIGH, journal de trade complet)
- **Tag git** : `savepoint/2026-10-12` (créé sur ce commit)
- **Bundle git** : `download/oryon-backup-2026-10-12.bundle` (historique git complet, cloneable)
- **Archive tar** : `download/oryon-backup-2026-10-12.tar.gz` (code + historique git + .env, sans `node_modules`)

---

## Comment restaurer

### Option A — le repo existe encore (sandbox préservé)
```bash
cd /home/z/my-project
git stash && git status            # sécuriser le travail en cours
git checkout savepoint/2026-10-12  # ou: git reset --hard savepoint/2026-10-12
pnpm install
```

### Option B — tout a disparu (nouveau sandbox)
```bash
# 1. Depuis le bundle (préféré — historique complet) :
git clone /home/z/my-project/download/oryon-backup-2026-10-12.bundle /home/z/my-project
cd /home/z/my-project && git checkout main

#    …ou depuis l'archive :
tar -xzf /home/z/my-project/download/oryon-backup-2026-10-12.tar.gz -C /home/z/my-project
cd /home/z/my-project

# 2. Dépendances + env
pnpm install
cat .env   # présent dans l'archive ; sinon :
echo "DATABASE_URL=file:/home/z/my-project/db/custom.db" > .env
echo "NEXT_PUBLIC_API_MOCKED=true" > apps/web/.env.local

# 3. Lancer
pnpm --filter web dev   # http://localhost:3000
```

### Option C — upload manuel (le dossier download/ est téléchargeable par l'owner)
Télécharger `download/oryon-backup-2026-10-12.tar.gz` AVANT le restart, puis dans le nouveau sandbox :
upload → extraire → `pnpm install` (voir Option B).

---

## Contenu sauvegardé (au 2026-10-12)

| Domaine | État |
|---|---|
| Journal de trade Cosmoz/Oryon | complet (auth démo, positions, notes, workspace) |
| Graphique TradingView-like | candles, zoom/pan, timeframes, drawing tools v3 (propriétés clic droit, R:R configurable, Brush, Arrow marks) |
| Toolbar v4 | layout parity TradingView (tf en haut, plage d'historique en bas, rail pleine hauteur + flèches hover, dock objets à droite, favoris flottant) |
| Calendrier éco | pont provider réel (ForexFactory) derrière `/eco-events` + notifications d'approche HIGH réutilisant le moteur d'alertes |
| Alertes | moteur existant, réutilisé par le pont éco |
| Base de données | `db/custom.db` (SQLite Prisma) — hors git, sauvegardée séparément si présente |

---

## Pièges connus (déjà rencontrés — ne pas re-apprendre)
| Piège | Parade |
|---|---|
| `node_modules` / `.env.local` perdus après reset sandbox | `pnpm install` + recréer `.env.local` (voir Option B) |
| Port :3000 — stale `next start` → chunks 500 | `lsof -ti:3000 \| xargs kill` PUIS `(cd apps/web && setsid nohup npx next start -p 3000 > /tmp/log 2>&1 < /dev/null &)` |
| EADDRINUSE silencieux au démarrage | toujours tuer le port avant de relancer |
| AUTH-1 : 401 `/api/auth/me` + refresh en nouvelle session | bruit attendu, PAS un bug |
| Playwright `wait_until="networkidle"` ne converge jamais (socket.io) | utiliser `domcontentloaded` + attentes fixes |
| Le portail dev-overlay Next (`nextjs-portal`) vole les clics en E2E | helper `dismiss_dev_overlay()` (voir `scripts/shots_sidebar_sections.py`) |
| `tsc`/`eslint` cassés après restauration | `pnpm --filter web exec tsc --noEmit` et `pnpm --filter web exec eslint . --max-warnings=0` doivent ressortir CLEAN |

---

## Historique des savepoints
- `savepoint/2026-09-29` → commit `4af9dab` (sidebar v2)
- `savepoint/2026-10-12` → head principal (toolbar v4 + pont éco réel) ← **vous êtes ici**
