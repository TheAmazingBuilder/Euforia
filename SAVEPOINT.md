# 💾 Savepoint — Cosmoz « Le Registre »

> **Fichier de reprise** : cet état a été validé par l'owner (« j'adore c'est parfait »).
> En cas de dérive du projet, revenir ici AVANT toute autre manipulation.

- **Date du savepoint** : 2026-09-29
- **Commit validé** : `4af9dab` — *feat: sidebar v2 — owner's sections, discreet sign-out, real brand*
- **Tag git** : `savepoint/2026-09-29` (créé sur ce commit)
- **Archive tar** : `/home/z/my-project/download/cosmoz-backup-2026-09-29.tar.gz` (code + historique git, sans `node_modules`)

---

## Comment restaurer

### Option A — le commit existe encore (cas le plus courant)
```bash
cd /home/z/my-project
git stash && git status            # sécuriser le travail en cours
git checkout savepoint/2026-09-29  # ou: git reset --hard savepoint/2026-09-29
pnpm install                       # node_modules si le sandbox a été réinitialisé
```

### Option B — tout a disparu (nouveau sandbox)
```bash
# 1. Extraire l'archive dans le projet
tar -xzf /chemin/vers/cosmoz-backup-2026-09-29.tar.gz -C /home/z/my-project
cd /home/z/my-project
pnpm install
# 2. Recréer apps/web/.env.local s'il manque :
echo "NEXT_PUBLIC_API_MOCKED=true" > apps/web/.env.local
pnpm --filter web dev              # http://localhost:3000
```

### Pièges connus (déjà rencontrés — ne pas re-apprendre)
| Piège | Parade |
|---|---|
| `node_modules` / `.env.local` perdus après reset sandbox | `pnpm install` + recréer `.env.local` (voir Option B) |
| Playwright `wait_until="networkidle"` ne converge jamais (websocket socket.io) | utiliser `domcontentloaded` + attentes fixes |
| Le portail dev-overlay Next (`nextjs-portal`) vole les clics en E2E | helper `dismiss_dev_overlay()` (voir `scripts/shots_sidebar_sections.py`) |
| `tsc`/`eslint` cassés après restauration | `pnpm --filter web exec tsc --noEmit` et `pnpm --filter web exec eslint . --max-warnings=0` doivent ressortir CLEAN |

---

## État fonctionnel validé à cette date

**Design system** « Le Registre » — tokens uniquement (pas de hex), encres émeraude/carmin/ocre,
`data-theme` (dark-blue/dark/light), honest-at-zero, 1 commit par feature.

**Sidebar (v2, sections owner)** : Overview (Dashboard + ghost « Setup seen, not taken ») ·
Trading (Session Live, Trades, Trade Review, Analytics, Playbook) · News (Calendar) ·
Insights (Reports, Risk) · Growth (Academy, Discipline) · System (Integrations, Settings).
Sign-out discret en bas du rail. Coach et Goals retirés du rail (pages toujours résolues).

**Modules vivants** : Dashboard (constellation equity, KPIs), Session Live (chart pleine largeur,
données réelles Binance via socket.io port 3003, READ-ONLY), Trades (CRUD, filtres URL, import CSV,
tags, notes, screenshots, judgment gate → reveal), Analytics Atlas (sections), Playbook,
Calendar éco, Discipline, Academy (courses/quiz/glossaire/bookmarks/practice/progress),
Reports (weekly report serveur), Risk Command Center (4 garde-fous + posture + events),
Portfolios, Settings, Security, Monitoring, Community, Help, Backups.

**Marque** : logo app = favicon (constellation 3 étoiles) partout, y compris exports PDF.

**Données** : API 100 % mockée MSW 2.15 (`NEXT_PUBLIC_API_MOCKED=true`), TanStack Query 5,
couche partagée typée `@cosmoz/shared` (zod). La couche données Integration Hub
(schemas/fixtures/handlers/queries, t49) est en place — **le prochain gros chantier est
l'Integration Hub UI** (MASTER IMPLEMENTATION PROMPT, 33 sections).

**Qualité à ce commit** : `tsc --noEmit` CLEAN · `eslint --max-warnings=0` CLEAN ·
E2E sweep console 21 routes = 0 erreur, overflow-390 false, captures dans `apps/web/scripts/shots/`.
