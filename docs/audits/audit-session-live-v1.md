# Audit de conformité — Session Live V1 (COSMOZ · Le Registre)

**Date** : 26 septembre 2026 · **Périmètre** : commit `47cb98e` (Session Live V1) + fix `3e4d57b` · **Verdict** : CONFORME — 12/15 critères pleinement validés, 3 écarts documentés non bloquants.

---

## 1. Analyse de l'existant

Le save restauré contenait une implémentation complète de Session Live V1 (commit `47cb98e`), organisée en trois couches clairement séparées. Cette architecture n'avait pas besoin d'être recréée : l'audit a consisté à la vérifier point par point contre le cahier des charges, sans introduire d'architecture parallèle.

**Couche présentation — `apps/web/src/components/session/`** : `session-view.tsx` compose la station de trading ; `session-toolbar.tsx` porte le sélecteur de symbole, les timeframes et le badge de connexion ; `price-chart.tsx` rend le graphique temps réel (ECharts) avec les overlays de positions ; `broker-panel.tsx` affiche les métriques du compte ; `symbol-positions.tsx` et `open-trade-card.tsx` listent les positions du symbole courant avec P&L marqué au flux live.

**Couche données navigateur — `src/lib/`** : `realtime/market.ts` gère le WebSocket de prix, expose `STALE_MS = 8_000`, `unrealizedPnl()` et les phases de flux (LIVE/SIM/STALE/RECONNECTING/OFFLINE) ; `api/queries/broker.ts` + `endpoints.ts` consomment l'API broker en lecture seule ; `next.config.ts` rewriter `/broker` vers le mini-service (`localhost:3003`).

**Couche service — `mini-services/market-service/`** : `index.ts` expose `/candles`, `/prices` et `/health` (aucune route de mutation) ; `providers/types.ts` définit le contrat `MarketDataProvider` ; `providers/binance.ts` connecte le WS réel de Binance ; `providers/simulated.ts` fournit un flux simulé honnête (étiqueté SIM) pour forex et synthétiques.

**Contrats et mocks** : `packages/shared/src/schemas/broker.ts` (Zod) ne contient aucun schéma d'exécution — le contrat est read-only par construction ; `src/mocks/handlers/broker.ts` n'est actif que lorsque `NEXT_PUBLIC_API_MOCKED=true`.

## 2. Modifications

L'audit n'a presque rien modifié — c'est le signe que l'existant était sain. Un seul changement de code a été nécessaire, découvert par la vérification E2E mobile :

| Élément | Commit | Détail |
|---|---|---|
| `session-toolbar.tsx` | `3e4d57b` | À 390 px, le prix marqué provoquait un débordement horizontal de 11 px ; le prix prend désormais une ligne complète sous `sm` (`w-full sm:flex-1`). Re-mesuré : `scrollWidth = 390 = innerWidth`. |

Hors code produit, l'environnement de dev a été reconstruit après le reset (réinstallation pnpm 12.4.2 via corepack, recréation de `.env.local` avec `NEXT_PUBLIC_API_MOCKED=true`). Ces opérations relèvent de l'environnement, pas de Session Live. Aucune autre ligne du module session n'a été touchée : l'audit valide, il ne réécrit pas.

## 3. Ajouts

Aucun ajout fonctionnel n'a été fait au produit : zéro nouveau composant, route, provider ou contrat. Cette absence est délibérée — la mission était d'auditer ce que le save contenait déjà, et l'implémentation s'est révélée conforme sur l'essentiel. Les seuls artefacts ajoutés au dépôt sont documentaires : ce rapport d'audit (PDF/CSV/Markdown archivés dans `docs/audits/`), les captures E2E de l'audit (`apps/web/scripts/shots/t16-audit/`, 6 PNG) et l'entrée correspondante du worklog. Le backlog Phase 2 (section 8) est listé mais volontairement non implémenté.

## 4. Architecture finale

```
Binance WS (réel) ──┐
                    ├─→ market-service :3003 ──→ rewrites /broker ──→ lib/realtime/market.ts
SimulatedProvider ──┘   (HTTP /candles /prices      (next.config.ts)      │  WS client de prix
                        /health + WS push ;                              │  STALE_MS 8 s, phases
                        contrat MarketDataProvider)                      ▼
                                                                     Session UI (toolbar badges ·
MSW (dev only, flag env) ──→ /api/broker mocké ──→ components/session  chart ECharts + overlays ·
                                                                    broker panel · positions)
packages/shared/schemas/broker.ts — contrats Zod read-only, partagés par toutes les couches
```

Trois propriétés structurelles méritent d'être soulignées. D'abord, le découplage des providers : le mini-service ne connaît de Binance que ce que le contrat `MarketDataProvider` expose, ce qui rend un futur adaptateur MT5 branchable sans toucher au frontend. Ensuite, la séparation des données : positions et compte viennent exclusivement de l'API broker, le graphique n'est qu'un support de visualisation — la source de vérité reste le broker. Enfin, l'honnêteté des états : un provider simulé s'affiche comme SIM, un compte non configuré s'affiche comme NOT_CONFIGURED, un flux gelé s'affiche comme STALE — l'interface ne ment jamais sur ce qu'elle montre.

## 5. Acceptance criteria validés

La matrice complète (15 critères, preuves à l'appui) est archivée en CSV (`audit-session-live-v1-matrice.csv`). Synthèse :

| # | Critère | Statut | Preuve clé |
|---|---|---|---|
| AC-01 | Market data temps réel WS | Validé | health `source:"real"`, ticks BTCUSDT observés |
| AC-02 | Chart + 7 timeframes | Validé (réserve) | 7/7 sur ECharts ; TradingView natif = licence |
| AC-03 | Positions read-only, overlay Entry/SL/TP | Validé | overlays informatifs, non déplaçables |
| AC-04 | Account panel + « N/A » honnête | Validé | 6 métriques, « — » si indisponible |
| AC-05 | READ-ONLY absolu (front + back) | Validé | 0 route de mutation, 0 bouton, 0 schéma d'exécution |
| AC-06 | Source de vérité = broker | Validé | positions/compte via API, jamais du chart |
| AC-07 | P&L temps réel WS, updates ciblées | Validé | recalcul par tick, zéro polling |
| AC-08 | Pending orders sans actions | Validé | panneau « view only » |
| AC-09 | Mapping symboles tri-couche | **Partiel** | pas de table internal/broker/chart dédiée |
| AC-10 | États connexion + badge « ● LIVE » | Validé | LIVE/SIM/STALE/RECONNECTING/OFFLINE |
| AC-11 | STALE DATA protection | Validé | kill test → « STALE · 16s » |
| AC-12 | Resync après reconnexion | Validé | relance → resync complet, âge 0 s |
| AC-13 | Isolation par utilisateur | Validé | requêtes scopées session (à re-tester broker réel) |
| AC-14 | Credentials jamais exposés | Validé | scan frontend négatif, relais serveur |
| AC-15 | Providers découplés, pas de mock produit | Validé | contrat provider + flag MSW dev only |

**Verdict : CONFORME.** 12 critères pleinement validés. Trois écarts documentés, tous non bloquants : (1) le rendu graphique utilise ECharts plutôt que TradingView — la licence de cette dernière librairie n'est pas acquise pour ce projet ; (2) le mapping symboles tri-couche (internal/broker/chart, ex. XAUUSD vs XAUUSDm vs GOLD) est incomplet ; (3) le backend broker réel n'est pas encore branché — en démo, le compte s'affiche honnêtement NOT_CONFIGURED et les données de compte viennent des mocks MSW en environnement mocké.

## 6. Tests exécutés

**Statique** : lecture intégrale de 14 fichiers (6 composants session, `realtime/market.ts`, queries/endpoints, `next.config.ts`, mini-service + 2 providers, handlers MSW, schémas partagés) ; greps ciblés négatifs sur les mutations broker et l'exposition de credentials ; échantillon `/candles?symbol=BTCUSDT&interval=1m` répondant `source:"real"`.

**Runtime E2E (desktop 1440)** : badge « ● LIVE » sur BTCUSDT avec ticks Binance réels ; étiquette SIM sur forex/synthétiques ; overlays Entry/SL/TP silencieux ; broker panel honnête, sans aucun bouton d'action ; 7/7 timeframes.

**Test réel de coupure (stale + resync)** : arrêt du process market-service → badge « STALE · 16s » avec « last update 16s ago » (seuil `STALE_MS = 8 s`) → relance du service → resynchronisation complète, badge restauré, âge du flux revenu à 0 s. Captures : `desktop-feed-lost-stale.png`, `desktop-stale-16s.png`.

**Mobile 390 + qualité** : débordement horizontal détecté (11 px) puis corrigé et re-mesuré (`scrollWidth = innerWidth = 390`) ; console navigateur propre (0 erreur) ; `tsc --noEmit` et `eslint --max-warnings=0` verts. 6 captures archivées dans `apps/web/scripts/shots/t16-audit/`.

## 7. Points non vérifiés

Les limites suivantes sont assumées et tracées pour une future campagne de tests :

- **Broker MT5 réel** : non connectable depuis cet environnement ; le comportement avec un compte broker authentique (données compte, positions réelles, marges) reste à valider en conditions réelles.
- **Build de production** : l'audit a porté sur le serveur de dev ; un passage `next build` + mode production (rewrites, variables d'env) n'a pas été exercé.
- **Charge multi-utilisateurs** : le market-service agrège un WS Binance partagé ; sa tenue de charge avec de nombreuses sessions simultanées n'est pas mesurée.
- **Réseau dégradé prolongé** : au-delà du test kill/relance local, les reconnexions longues (latence élevée, coupures intermittentes, incidents côté exchange) ne sont pas simulées.
- **Montée en durée** : stabilité du WS sur de très longues sessions (> 24 h) non observée.
- **Isolation fine avec broker réel** : la séparation par utilisateur est garantie côté API/mock ; elle devra être re-testée une fois les credentials réels par utilisateur branchés.

## 8. Phase 2 (liste, sans implémentation)

Backlog candidat relevé pendant l'audit — listé conformément à la consigne, sans aucune implémentation :

1. **Adaptateur broker réel** (MT5 ou bridge équivalent) implémentant le contrat `MarketDataProvider` côté compte, avec credentials chiffrés par utilisateur et relais serveur uniquement.
2. **Mapping symboles tri-couche** complet (internal / broker / chart, ex. XAUUSD ↔ XAUUSDm ↔ GOLD) avec table de correspondance et UI de résolution.
3. **Persistance des candles historiques** pour un warm-start instantané des graphiques et une résilience aux coupures.
4. **Alertes prix / SL / TP** côté client, alimentées par le flux live existant.
5. **Observabilité du market-service** : métriques (latence, ticks/s, reconnexions), logs structurés, reconnexion résiliente avec backoff.
6. **Chart TradingView Lightweight Charts** si la licence est confirmée, en remplacement éventuel d'ECharts.
7. **Tests de charge WS** (sessions simultanées, plafond de providers) et durcissement production (build, env, supervision).
8. **Comptes multi-brokers** par utilisateur (sélection du compte actif dans la station Session Live).
