# Authentification locale — guide de dépannage (mode REAL API)

> Contexte : message « You are offline » (shell PWA `/offline.html`) affiché
> après une tentative de connexion en local (`localhost:3000`).

## Diagnostic (code, branche courante)

Le message ne vient PAS d'un problème Internet. Il est servi par le service
worker `apps/web/public/sw.js` quand une **navigation** échoue au niveau
réseau. La chaîne complète :

1. **Mode par défaut** : `src/lib/api/mode.ts` — sans `NEXT_PUBLIC_API_MOCKED`
   défini, `next dev` démarre en mode **MOCKÉ (MSW)**. L'API NestJS locale et
   PostgreSQL ne sont alors jamais interrogés.
2. **Worker composite** : `sw.js` fait `importScripts("/mockServiceWorker.js")`.
   Une fois enregistré (par `src/components/providers/sw-register.tsx`, sur
   TOUTES les pages), il continue d'intercepter les requêtes **même après
   avoir basculé en mode real** — le basculement de mode ne désenregistre pas
   le worker. Tant qu'il n'est pas purgé, le navigateur peut rejouer
   l'ancienne couche MSW/offline.
3. **Navigation post-login** : `login-form.tsx` (`onAuthenticated` →
   `router.replace(returnTo)`) déclenche une navigation. Si elle échoue
   (vieux worker encore actif, server Next en cours de redémarrage…), le
   fallback `sw.js` sert `/offline.html` → le message observé.

## Procédure — passage en mode real API

### 1. Frontend (`apps/web`)

```bash
cp apps/web/.env.example apps/web/.env.local
```

Dans `apps/web/.env.local` :

```
NEXT_PUBLIC_API_MOCKED=false
# API_PROXY_TARGET=http://localhost:4000   (défaut correct, optionnel)
```

Les requêtes partent alors vers `/api/v1/...` same-origin et
`next.config.ts` les proxy vers NestJS (:4000) — ni CORS ni cookies
cross-origin à configurer.

### 2. Backend (`apps/api`)

```bash
cp apps/api/.env.example apps/api/.env
```

Variables **obligatoires** validées au boot (`src/config/env.schema.ts`) :

| Variable | Contrainte | Génération |
|---|---|---|
| `DATABASE_URL` | `postgresql://…` vers `euforia_local_dev` | — |
| `AUTH_JWT_SECRET` | ≥ 32 caractères | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `AUTH_MFA_ENCRYPTION_KEY` | base64, 32 octets exactement | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `ACCOUNTS_CREDENTIALS_ENCRYPTION_KEY` | base64, 32 octets | idem |
| `INTEGRATIONS_WEBHOOK_ENCRYPTION_KEY` | base64, 32 octets | idem |

Puis :

```bash
pnpm --filter @cosmoz/api db:migrate   # déjà fait si euforia_local_dev migrée
pnpm --filter @cosmoz/api dev          # écoute sur :4000 (PORT par défaut)
curl http://localhost:4000/health/ready
```

### 3. ⚠️ Purger le service worker (indispensable)

Le worker MSW+offline reste actif entre les modes. Avant tout test :

- Chrome → DevTools → **Application → Service Workers → Unregister**
- **Application → Storage → Clear site data**
- Hard reload (`Ctrl/Cmd+Shift+R`)

Sans cette étape, une connexion peut continuer à passer par MSW ou retomber
sur `/offline.html`.

### 4. Gate de vérification d'e-mail

Avec la vraie API, un compte créé localement est `PENDING_VERIFICATION` ;
le login renvoie `403 EMAIL_NOT_VERIFIED` (« This email is not verified »)
tant que le lien n'est pas activé (`auth.service.ts` ~l. 233).

Options :
- Récupérer le lien d'e-mail côté API (transport dev/console), ouvrir
  `http://localhost:3000/verify-email?token=…` ;
- ou, pour le confort local uniquement : `AUTH_REQUIRE_EMAIL_VERIFICATION=false`
  dans `apps/api/.env` (le login active alors le compte automatiquement).

## Checklist rapide

- [ ] `apps/web/.env.local` avec `NEXT_PUBLIC_API_MOCKED=false` + **redémarrage de `next dev`**
- [ ] `apps/api/.env` complet, API démarrée, `/health/ready` OK
- [ ] Service workers désenregistrés + site data purgée
- [ ] Compte vérifié (ou gate désactivé en dev)

## Notes / pistes d'amélioration (à discuter)

- En dev, on pourrait sauter l'enregistrement du worker offline quand
  `API_MOCKED=false` (éviter le piège du worker persistant).
- `sw.js` ne met jamais `/offline.html` en cache pour les navigations
  successives après un échec ; un `self.registration.unregister()` implicite
  ou un bouton « Try again » plus robuste (rechargement forcé + purge)
  améliorerait le dépannage local.
