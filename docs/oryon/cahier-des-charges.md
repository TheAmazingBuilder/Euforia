# Cahier des charges — Module Oryon

> Statut : Proposition v1.0 — à valider
> Date : 10 octobre 2026
> Application : Euforia — client web (Next.js)
> Contrainte cardinale : lecture seule

## 1. Résumé exécutif

Le présent cahier des charges définit le module **Oryon**, la future station d'analyse graphique de trading intégrée à l'application web Euforia. Il fait suite à deux décisions arrêtées avec le propriétaire du produit : la reconstruction du module de graphiques sur une base nouvelle sous son nom définitif « Oryon », et le retrait préalable et complet du module Session Live du frontend, exécuté le 9 octobre 2026.

Le document poursuit quatre objectifs : fixer le périmètre et la contrainte cardinale de **lecture seule** ; consigner l'état des lieux technique vérifié dans le dépôt, en particulier les actifs réutilisables éprouvés (couche de données de marché, service de marché :3003, schémas Zod partagés, système de design « Le Registre ») ; proposer une architecture cible, explicitement marquée « proposition » tant qu'elle n'est pas validée ; et séquencer la réalisation en quatre jalons assortis de critères de sortie objectifs, vérifiables par sondes automatisées selon la discipline qualité déjà en vigueur dans le projet.

Trois orientations structurantes sont soumises à validation. Premièrement, la reconstruction réutilise telle quelle la couche de données de marché existante (`useCandles`, `useLiveQuotes`, `useCandlesRange`) et le service de marché Bun :3003, sans fork ni évolution bloquante du backend. Deuxièmement, la bibliothèque de rendu graphique proposée est **TradingView Lightweight Charts**, choisie pour sa spécialisation OHLC, son empreinte légère et sa maintenance active ; ses limites — pas d'outils de dessin intégrés et pas d'indicateurs prêts à l'emploi — sont assumées et couvertes par une couche de dessin propriétaire spécifiée en section 8. Troisièmement, la V1 corrige explicitement les lacunes documentées de l'ancienne implémentation : interactions de dessin incomplètes, undo limité à un niveau sans redo, absence de validation Zod au chargement des données persistées et absence de tests unitaires.

Recommandation : arbitrer les sept questions ouvertes de la section 13, puis lancer le jalon P0 (socle graphique). Aucune évolution backend n'est un prérequis ; la seule dépendance nouvelle prévue est le paquet `lightweight-charts`.

## 2. Contexte et genèse

### 2.1 L'application Euforia et son monorepo

Euforia est un journal de trading professionnel organisé en monorepo : le client web sous `apps/web` (Next.js 16 App Router, React 19, Tailwind CSS 4, TanStack React Query 5), une API NestJS sous `apps/api`, les contrats de données partagés sous `packages/shared` (Zod), et des mini-services Bun dont le **market-service** (port 3003) qui agrège les données de marché. L'identité visuelle est régie par le design world « Le Registre » : trois thèmes (dark-blue « Encre » par défaut, dark « Carbone », light « Papier »), une grammaire de filets fins plutôt que de cartes empilées, un accent cobalt unique et des encres sémantiques profit/perte utilisées avec parcimonie.

La discipline qualité du projet est homogène et vérifiée à chaque livraison : TypeScript strict sans erreur, ESLint sans erreur, build de production validé, dictionnaire de traduction anglais sans chaîne codée en dur, mocks MSW pour les surfaces API, et **sondes** Playwright dédiées par module (structure, interactions, mobile 390 px, thème clair, zéro erreur de page). Toute livraison s'accompagne d'un commit et d'une entrée au journal de travail `worklog.md`.

### 2.2 Genèse : Oryon, Session Live et la décision « nouvelle base »

Le nom « Oryon » désigne le module de graphiques que le produit n'a jamais concrétisé : l'audit forensique d'octobre 2026 a démontré, par recherche dans l'historique Git complet (pickaxe sur `oryon` et `lightweight-charts`), qu'aucun commit correspondant n'existe. La fonctionnalité de graphiques avait été réalisée sous le nom **Session Live** : vingt-trois composants, un graphique pleine largeur en chandeliers, sept outils de dessin, des indicateurs (volume, RSI, MACD, ATR, Bollinger, VWAP), un mode replay et un multi-chart, servis par le market-service :3003.

Le 9 octobre 2026, la décision a été prise de repartir sur une base nouvelle. Le module Session Live a été retiré du frontend le jour même : page, composants, utilitaires d'état graphique (`chart-state`, `drawings`, `indicators`), requêtes API, dictionnaire i18n, handlers MSW et bloc de store associé (244 lignes), soit 29 fichiers supprimés, les références croisées réparées (navigation, topbar, tableau de bord, moteur de notifications, réglages), avec tsc et ESLint à zéro erreur et un build validé (commit `079a8e0`, journalisé dans `b9f52fa`). Le module de journal de session, distinct et toujours consommé par Trades et Trade Review, a été soigneusement conservé.

### 2.3 Pourquoi un cahier des charges avant le code

L'ancienne implémentation, bien que fonctionnelle, portait des lacunes précisément documentées lors de l'audit : les objets de dessin ne pouvaient être ni sélectionnés, ni déplacés, ni édités, ni verrouillés ; l'undo était limité à un niveau sans redo ; les données persistées dans le stockage local n'étaient pas validées au chargement ; les calculs d'indicateurs ne disposaient d'aucun test unitaire. Reconstruire sans spécifier reviendrait à réintroduire ces défauts. Le présent cahier des charges verrouille donc les exigences et les critères d'acceptation **avant** la première ligne de code d'Oryon, et distingue explicitement ce qui est vérifié (état des lieux, section 5) de ce qui est proposé (architecture, section 8).

## 3. Périmètre du projet

### 3.1 Ce que la V1 d'Oryon couvre

La première version d'Oryon couvre la station d'analyse graphique en lecture : un graphique principal en chandeliers alimenté par le flux de marché existant, la sélection du symbole et de l'unité de temps, un jeu complet d'outils de dessin persistés, les indicateurs techniques usuels, une grille multi-chart et une liste de suivi (watchlist). L'intégration à l'application — entrée de navigation, en-tête de module standard, thèmes, dictionnaire i18n, liens profonds — fait partie du périmètre au même titre que le graphique lui-même, conformément aux conventions des autres modules d'Euforia.

### 3.2 Contrainte cardinale : lecture seule

Oryon est une station d'**analyse**, pas d'exécution. Il est interdit d'y implémenter toute action transactionnelle : passage d'ordre, modification d'ordre, clôture de position, ou toute interaction d'écriture avec un courtier. Cette contrainte s'applique à trois niveaux : l'interface n'offre aucun contrôle d'ordre ; le code frontend n'appelle aucun endpoint d'exécution — la seule lecture broker autorisée est `useBrokerSession` (`GET /broker/session`, interrogé en polling quinze secondes, déjà conçu comme monitoring en lecture seule) ; et la revue de chaque jalon inclut une vérification explicite de cette absence. Toute évolution future vers l'exécution devra faire l'objet d'un avenant au présent document.

### 3.3 Tableau d'inclusion et d'exclusion

Le tableau ci-dessous fixe la frontière du périmètre V1. Toute demande située en colonne « exclu » est renvoyée à la section 13 (questions ouvertes) ou à un avenant, et ne doit pas entrer dans les jalons sans décision explicite du propriétaire du produit.

**Tableau 1 — Périmètre de la version 1**

| Domaine | Inclus en V1 | Exclu (hors périmètre V1) |
|---|---|---|
| Graphique | Chandeliers OHLCV, zoom/pan, crosshair, légende, adaptation aux thèmes | Types exotiques (Renko, Kagi), tick chart |
| Données de marché | market-service :3003 existant (Binance réel, simulé étiqueté SIM), 7 unités de temps | Nouveaux fournisseurs, données tick brutes, données hors ligne |
| Dessin | 7 types V1 + VLINE (extension V2), sélection, déplacement, ancres, verrouillage, masquage, styles, undo/redo multi-niveaux | Outils communautaires, modèles de figures sauvegardés partagés |
| Indicateurs | Volume, RSI, EMA/SMA, MACD, Bandes de Bollinger, ATR | Backtesting, screener multi-symboles, indicateurs personnalisés scriptés |
| Trading | Consultation des positions du compte (lecture, flux privé existant) | Tout passage, modification ou clôture d'ordre |
| Courtiers | Monitoring lecture seule via /broker/session | Synchronisation MT5 (long terme, section 9.3) |
| Application | Navigation, en-tête standard, thèmes, i18n, liens profonds, réglages graphique | Notifications nouvelles, exports d'images |

## 4. Utilisateurs et cas d'usage

### 4.1 Utilisateur principal

L'utilisateur d'Oryon est le trader Euforia authentifié, unique rôle de l'application. Il consulte la station avant une session pour lire la structure du marché, pendant la tenue du journal pour vérifier une hypothèse d'exécution, et après coup pour annoter ce que le marché a fait. Il utilise l'application au bureau sur grand écran (thème sombre) comme en mobilité (390 px, thème clair), et la cohérence des deux expériences est une exigence, pas un supplément.

### 4.2 Cas d'usage nominaux

**UC-1 — Lire la structure du marché.** Le trader ouvre Oryon depuis la navigation : le graphique s'affiche en chandeliers avec le template d'indicateurs par défaut (histogramme de volume et RSI 14 en sous-panneau), la dernière bougie vit au rythme des ticks, et le statut du flux (live, reconnexion, hors ligne, périmé) est affiché honnêtement, badge SIM inclus pour toute donnée simulée.

**UC-2 — Annoter le graphique.** Il arme un outil (ligne horizontale, tendance, rayon, rectangle, texte, mesure, Fibonacci), trace sur le graphique, puis retrouve ses objets dans une liste : il peut les sélectionner, les déplacer, éditer leurs ancres, en changer le style, les verrouiller ou les masquer. Les dessins sont persistés par symbole et retrouvés à la prochaine visite, après validation Zod du stockage local.

**UC-3 — Comparer des unités de temps.** Il bascule le layout en deux ou quatre graphiques pour confronter l'exécution (5 minutes) au contexte (1H, 1D) ; chaque graphique garde son symbole, son unité de temps et ses indicateurs, avec crosshair synchronisée en option.

**UC-4 — Préparer une entrée sans la passer.** Avant un setup, il mesure la distance d'entrée au stop avec l'outil de mesure et repère les extensions avec Fibonacci. Oryon ne propose aucun bouton d'ordre : le transfert vers l'exécution reste un processus externe au module, par conception.

**UC-5 — Surveiller ses positions en lecture.** À côté du graphique, il consulte l'état réel du compte via le flux privé de positions et la session broker en lecture seule — chiffres honnêtes, états non configuré/erreur rendus comme tels, aucune invention de donnée broker.

## 5. État des lieux technique vérifié

Cette section consigne ce qui a été vérifié dans le dépôt au 10 octobre 2026, sur l'état `b9f52fa` (branche `main`, arbre propre). Elle distingue les actifs réutilisables éprouvés, ce qui a été retiré, les lacunes documentées de l'ancienne implémentation, les leçons d'exploitation et les orphelins backend connus. C'est le socle factuel sur lequel repose l'architecture proposée en section 8 : rien n'y est supposé, tout est lu dans le code.

### 5.1 Actifs réutilisables éprouvés

La couche de données de marché est l'actif central : elle a été écrite une fois, durcie par les incidents passés (reconnexions, expirations de jeton, pannes de service) et consommée aujourd'hui par le tableau de bord et le module Monitoring. Oryon la réutilise telle quelle, sans fork : chaque hook ci-dessous a été relu dans le code au 10 octobre 2026 et son comportement est décrit fidèlement.

**Tableau 2 — Actifs réutilisables vérifiés**

| Actif | Localisation vérifiée | Rôle pour Oryon |
|---|---|---|
| Couche temps réel de marché | apps/web/src/lib/realtime/market.ts | useLiveQuotes (instantané global : quotes, connecté, source idle\|socket\|polling, phase connecting\|live\|reconnecting\|offline, transport, lastTickAt, authError), useLiveQuote(symbole), useFeedStatus(), usePrivatePositions (room privée), unrealizedPnl, useCandles (300 bougies, refetch 60 s, keepPreviousData), useCandlesRange (replay, 1 000 max, fenêtre from/to) |
| Machine à états du flux | même fichier | Dégradation socket.io → polling 2 s (grâce 3,5 s), péremption STALE_MS 8 s, auth Bearer + un seul refresh single-flight sur 401, cycle de vie auth (rehandshake sur TOKEN_REFRESHED/AUTHENTICATED, teardown sur SESSION_EXPIRED/LOGGED_OUT), télémétrie (reconnexions, pertes, messages, RTT polling) |
| Service de marché | mini-services/market-service (Bun, :3003) | REST : GET /prices, GET /candles (interval 1m\|5m\|15m\|30m\|1H\|4H\|1D, limite 300 par défaut, plafond 500 simple / 1 000 fenêtré from/to), GET /health public ; socket.io : diffusion « prices » toutes les 750 ms, « positions » en room privée ; fournisseurs BinanceProvider (réel) et SimulatedProvider (étiqueté SIM) ; 401 AUTH_REQUIRED/TOKEN_INVALID/TOKEN_EXPIRED ; garde-fou de production |
| Session broker en lecture | apps/web/src/lib/api/queries/broker.ts | useBrokerSession : GET /broker/session en polling 15 s, monitoring lecture seule (métriques de compte, positions, ordres en attente), états NOT_CONFIGURED/ERROR rendus honnêtement |
| Contrats de données partagés | packages/shared/src/schemas/market.ts | marketIntervalSchema (1m\|5m\|15m\|30m\|1H\|4H\|1D), quoteSourceSchema (real\|sim — « prétendre que des données simulées sont réelles est un mensonge produit majeur »), candleSchema {t,o,h,l,c,v}, candlesResponseSchema {symbol, interval, source, candles} |
| Design system « Le Registre » | apps/web/src/app/globals.css + design-system/euforia.css | Tokens sur 3 thèmes (Encre par défaut, Carbone, Papier) : --background, --surface, --surface-raised, --border, --text-primary, --text-muted, --accent #4E6EE0, --profit #3EBE8C, --loss #E05B5B, --warning, --radius 8px ; discipline : filets fins, un seul accent cobalt, encres sémantiques en parcimonie, pas de glow ni de glass |
| Patterns qualité | apps/web/src (mocks, dictionaries, lib/api, store) | MSW pour les surfaces API avec un store de mocks central (mocks/store.ts), React Query pour l'état serveur, dictionnaire i18n EN assemblé par namespace, sondes Playwright dédiées par module |

Deux précisions importantes complètent ce tableau. D'une part, le schéma `sessionLive` reste présent dans `packages/shared` car l'API backend le consomme toujours : Oryon n'y touche pas et définira ses propres contrats (section 8.4). D'autre part, ECharts reste une dépendance du projet avec sept usages hors graphiques de marché (tableau de bord, analytics, trades) : elle n'est ni retirée ni réutilisée pour Oryon, la proposition de bibliothèque étant traitée en section 8.1.

### 5.2 Ce qui a été retiré

Le retrait du 9 octobre 2026 (commit `079a8e0`, journalisé dans `b9f52fa`) a supprimé 29 fichiers du frontend : la page `/session` et ses 23 composants (analysis-chart, chart-grid, chart-tool-rail, session-live-view, session-replay, session-shell, context-tabs, market-context-panel, private-positions-stream, broker-panel, symbol-picker, session-timer, logbook, mood-strip, ghosts, regret-registry, event-timeline, open-trade-card, price-alert-toaster, symbol-positions, et deux composants morts documentés), le badge SessionLiveBadge, les trois utilitaires d'état graphique (`chart-state.ts`, `drawings.ts`, `indicators.ts`), la couche requêtes `queries/sessionLive.ts`, le dictionnaire `en/session.ts`, les handlers MSW du domaine, le bloc de store (244 lignes), les contrôles de préférences graphiques des réglages devenus orphelins, et douze sondes dédiées. Les références croisées ont été réparées le jour même (navigation, topbar, carte positions du tableau de bord, deep-link nofy redirigé vers /trades, quatre sondes mises à jour), avec tsc et ESLint à zéro erreur et un build validé.

### 5.3 Lacunes documentées de l'ancienne implémentation

L'audit de l'ancienne station avait consigné des lacunes précises, qui deviennent des exigences fermes pour Oryon. Les objets de dessin ne pouvaient être ni sélectionnés, ni déplacés, ni édités ancre par ancre, ni verrouillés, ni masqués : le flux s'arrêtait au tracé. L'annulation était limitée à un seul niveau, sans rétablissement. Les dessins persistés dans le stockage local (clé `cosmoz.session-live.chart.v1`, par symbole) étaient rechargés sans validation Zod. Les calculs d'indicateurs (Wilder RSI, MACD, ATR, Bollinger, VWAP) ne disposaient d'aucun test unitaire. Enfin, l'outil VLINE était absent des sept types V1 (HLINE, TREND, RAY, RECT, TEXT, MEASURE, FIB).

### 5.4 Leçons d'exploitation

Deux leçons d'infrastructure, documentées lors des incidents d'octobre, s'appliquent directement à Oryon. Premièrement, le market-service n'est pas persisté par les redémarrages de sandbox : après chaque restart, il faut relancer `bun install` puis `bun index.ts` dans `mini-services/market-service` — le hook de démarrage `dev.sh` a été corrigé pour cela (commit `b6b2ba6`), et un graphique « vide » après un restart doit d'abord faire suspecter le service, pas le code. Deuxièmement, l'ancien composant AnalysisChart se substituait silencieusement par une carte d'erreur (sans testid) lorsque `useCandles` échouait : les sondes devenaient aveugles et le diagnostic s'allongeait. Oryon exige donc des états d'erreur explicites, testidés et distincts du graphique lui-même (exigence RNF-08).

### 5.5 Orphelins backend connus

Le backend NestJS conserve le module `apps/api/src/modules/session-live` (API `/session-live/*`) et un deep-link nofy pointant vers « /session » (`nofy.service.ts`, ligne 241), désormais sans consommateur frontend. Ils sont hors périmètre de la reconstruction frontend et leur traitement est une décision séparée, à arbitrer en section 13 (Q6) au moment d'une passe backend dédiée. Cette situation n'est pas bloquante : Oryon ne consomme ni l'un ni l'autre.

## 6. Exigences fonctionnelles

Les exigences sont numérotées RF-01 à RF-10, priorisées selon la méthode MoSCoW (Must/Should/Could) et rattachées à un jalon de la section 10. Une exigence « Must » conditionne la sortie de son jalon ; une exigence « Should » y est réalisée si le budget le permet sans dégrader les « Must » ; une exigence « Could » est explicitement soumise à arbitrage en section 13. Chaque exigence est vérifiable par sonde ou test automatisé : un critère non vérifiable n'est pas une exigence.

**Tableau 3 — Registre des exigences fonctionnelles**

| ID | Exigence | Priorité | Jalon |
|---|---|---|---|
| RF-01 | Graphique principal en chandeliers OHLCV : zoom, pan, crosshair, légende, adaptation aux trois thèmes | Must | P0 |
| RF-02 | Sélection du symbole et de l'unité de temps (7 unités du contrat MarketInterval), recherche rapide | Must | P0 |
| RF-03 | Flux temps réel : fusion du tick dans la dernière bougie entre refetchs, badge SIM/réel, statut du flux visible | Must | P0 |
| RF-04 | Outils de dessin V2 : 7 types V1 + VLINE, sélection, déplacement, édition d'ancres, styles, verrouillage, masquage, liste d'objets, undo/redo multi-niveaux | Must | P1 |
| RF-05 | Indicateurs : volume, RSI(14) en sous-panneau par défaut, EMA/SMA, MACD, Bandes de Bollinger, ATR ; calculs purs testés | Must | P2 |
| RF-06 | Grille multi-chart : layouts 1/2/4, crosshair synchronisée en option, template par graphique | Should | P3 |
| RF-07 | Watchlist : symboles suivis avec cotations live, clic → graphique | Should | P3 |
| RF-08 | Intégration application : route /oryon, entrée de navigation section TRADING, en-tête de module standard, deep-link symbole, réglages graphique reconnectés | Must | P0 |
| RF-09 | Persistance et reprise : dessins par symbole dans le stockage local, clé versionnée nouvelle, validation Zod au chargement, données invalides abandonnées proprement | Must | P1 |
| RF-10 | Replay d'une fenêtre passée (useCandlesRange existe déjà) | Could | §13 Q2 |

### 6.1 Développement des exigences P0

**RF-01 — Graphique principal.** Le graphique rend des chandeliers OHLCV depuis `useCandles`, avec zoom et panoramique à la souris comme au doigt, une crosshair qui suit le pointeur avec légende OHLC du survol, et une adaptation complète aux tokens des trois thèmes (aucune couleur codée en dur). Le composant reste responsif à son conteneur (ResizeObserver) et le rendu est fluide sur le volume nominal de 300 bougies.

**RF-02 — Symbole et unité de temps.** Le sélecteur de symbole propose les instruments servis par les fournisseurs du market-service (catalogue Binance réel, catalogue simulé étiqueté SIM) avec recherche; les unités de temps sont strictement celles du contrat partagé (1m, 5m, 15m, 30m, 1H, 4H, 1D). Le changement de symbole ou d'unité conserve les préférences de layout et recharge les dessins du symbole.

**RF-03 — Flux temps réel et statut honnête.** Entre les refetchs de `useCandles` (60 s), le tick live fusionne dans la dernière bougie (haut/bas étendus, clôture mise à jour, volume incrémenté). Cette fusion existait dans l'ancien composant PriceChart, supprimé avec le module : elle doit être réimplémentée dans un hook dédié et testé. Le badge de source (SIM pour toute donnée simulée — règle produit non négociable) et le statut du flux (live, reconnexion, hors ligne, périmé) sont rendus visiblement avec des testids stables.

**RF-08 — Intégration à l'application.** Oryon vit sous la route `/oryon`, avec une entrée dans la section TRADING de la navigation (aux côtés de /trades, /journal, /playbook), l'en-tête de module standard (titre, description, breadcrumb via `getNavItem`), un deep-link symbole exploitable par le moteur de notifications, et la reconnexion des contrôles de préférences graphiques dans les réglages (retirés avec Session Live, à réintroduire pour Oryon).

### 6.2 Développement des exigences P1

**RF-04 — Outils de dessin V2.** La V2 reprend les sept types V1 (HLINE, TREND, RAY, RECT, TEXT, MEASURE, FIB) et ajoute VLINE en extension. Chaque objet est ancré dans le domaine temps+prix (il suit le zoom et le pan), et supporte : la sélection au clic, le déplacement (objet entier ou ancre par ancre), l'édition des ancres, le changement de style (couleur, épaisseur, style de trait), le verrouillage, le masquage et la suppression. L'undo/redo couvre au minimum 50 niveaux sur toutes les opérations. Une liste d'objets permet de retrouver, sélectionner et éditer chaque dessin sans le survoler.

**RF-09 — Persistance et reprise.** Les dessins sont persistés par symbole dans le stockage local sous une clé versionnée nouvelle (proposition : `euforia.oryon.drawings.v1`) — l'ancienne clé `cosmoz.session-live.chart.v1` n'est pas réutilisée et ses données non validées ne sont pas migrées (arbitrage §13 Q7). Au chargement, chaque enregistrement passe par `safeParse` Zod ; toute donnée invalide est abandonnée proprement avec un avertissement console, jamais rendue telle quelle.

### 6.3 Développement des exigences P2 et P3

**RF-05 — Indicateurs.** Le template par défaut reprend la convention éprouvée de l'ancienne station : histogramme de volume + RSI(14) en sous-panneau, visibles dès la première visite. Les indicateurs supplémentaires (EMA/SMA paramétrables, MACD, Bandes de Bollinger, ATR) sont ajoutés ou retirés depuis un panneau, avec paramètres éditables. Les calculs sont des fonctions pures, testées unitairement contre des séries de référence, et mémoïsées pour ne pas recalculer au tick.

**RF-06/RF-07 — Confort P3.** La grille multi-chart propose les layouts 1/2/4 déjà éprouvés, chaque graphique gardant son symbole, son unité et son template, avec crosshair synchronisée en option. La watchlist liste les symboles suivis avec leurs cotations live issues de `useLiveQuotes` ; un clic bascule le graphique principal sur le symbole.

## 7. Exigences non fonctionnelles

Les exigences non fonctionnelles sont assorties d'un critère de vérification objectif : chacune doit pouvoir être constatée par une sonde automatisée, un test unitaire ou une mesure reproductible, dans la continuité de la discipline du projet (tsc 0, ESLint 0 erreur, build OK, sondes dédiées, régressions vertes).

**Tableau 4 — Registre des exigences non fonctionnelles**

| ID | Exigence | Critère de vérification |
|---|---|---|
| RNF-01 | Performance : interactions fluides à 300-500 bougies avec 2 indicateurs actifs ; overlay de dessin sans re-render du graphique ; import dynamique de la bibliothèque graphique | Sonde : absence de long task > 150 ms pendant zoom/pan/dessin ; bundle du graphique chargé en chunk séparé |
| RNF-02 | Responsive : 390 px sans débordement horizontal, barre d'outils qui se replie proprement, graphique ≈ pleine largeur | Sonde mobile 390 px : overflow mesuré = 0 px |
| RNF-03 | Thèmes : les trois thèmes du Registre via tokens uniquement ; thème clair « Papier » de qualité égale | Sonde thème clair + revue visuelle ; aucune valeur de couleur hors tokens dans les composants Oryon |
| RNF-04 | i18n : dictionnaire EN dédié (dictionaries/en/oryon.ts), aucune chaîne codée en dur | ESLint + revue : zéro littéral utilisateur hors dictionnaire |
| RNF-05 | Accessibilité : aria-labels sur tous les outils, focus visible, navigation clavier de la barre d'outils | Sonde : tabulation complète de la barre d'outils, aria présents |
| RNF-06 | Sécurité lecture seule : aucune UI d'ordre, aucun appel d'endpoint d'exécution | Revue de diff par jalon + recherche statique : zéro référence à un endpoint d'ordre dans le code Oryon |
| RNF-07 | Qualité : tsc 0 erreur, ESLint 0 erreur, tests unitaires (indicateurs, géométrie, persistance), régressions existantes vertes | Suites : tsc/eslint/tests + suites de régression du projet re-passées au vert |
| RNF-08 | Fiabilité du flux : états live/reconnexion/hors ligne/périmé rendus explicitement, testids stables, télémétrie exposée au Monitoring | Sonde : états rendus avec testids dédiés ; jamais de substitution silencieuse par une carte d'erreur (leçon V1) |

Deux de ces exigences méritent d'être soulignées. RNF-06 est la traduction vérifiable de la contrainte cardinale de la section 3.2 : à chaque jalon, la revue inclut une recherche statique explicite (aucune référence à un endpoint de passage, modification ou clôture d'ordre dans le code du module), en plus de l'absence d'UI d'ordre. RNF-08 capitalise la leçon d'exploitation de la section 5.4 : un graphique en erreur doit afficher un état d'erreur distinct, testidé et explicite — jamais se substituer silencieusement au composant, au point de rendre les sondes aveugles.

## 8. Architecture technique proposée

Tout ce qui suit est explicitement une **proposition** : elle est motivée, mais ne devient une décision qu'après validation du propriétaire. La proposition s'appuie exclusivement sur l'état des lieux vérifié de la section 5 et vise deux qualités : ne rien réécrire qui soit déjà éprouvé (couche de données, contrats, design system), et corriger les lacunes documentées plutôt que les réimporter.

### 8.1 Bibliothèque graphique — proposition : TradingView Lightweight Charts

La bibliothèque proposée est **TradingView Lightweight Charts** (dépôt GitHub `tradingview/lightweight-charts`, licence Apache-2.0, maintenance active par TradingView). Elle est spécialisée chandeliers et données de marché : rendu canvas dédié OHLC, échelle de temps et de prix outillées, crosshair intégrée, séries chandeliers/ligne/aire/histogramme, empreinte légère. Ses limites sont connues et assumées : elle n'embarque ni outils de dessin, ni indicateurs prêts à l'emploi (les séries d'indicateurs sont calculées puis fournies par le code applicatif), et la branche v5 introduit la notion de panneaux (panes) pour loger des sous-graphiques — point à re-vérifier contre la documentation officielle (annexe A) au moment de l'implémentation, avec version épinglée dans le lockfile.

**Tableau 5 — Comparatif des bibliothèques candidates**

| Critère | TradingView Lightweight Charts (proposée) | ECharts (déjà dépendance) |
|---|---|---|
| Spécialisation OHLC | Conçue pour les chandeliers : échelles, crosshair, légendes temps de marché | Série candlestick générique ; ergonomie trading moins outillée (échelle de temps à composer) |
| Empreinte | Légère (quelques dizaines de Ko gzip), chargée en chunk dédié | Plus lourde ; déjà présente pour 7 usages hors graphiques de marché |
| Outils de dessin | Aucun → couche de dessin propriétaire spécifiée (§8.2) | Aucun intégré non plus pour ce besoin |
| Indicateurs | Aucun prêt à l'emploi → séries dérivées fournies par le code | Aucun prêt à l'emploi pour ce besoin |
| Maintenance | Active, éditeur spécialisé du domaine, documentation officielle complète | Active, périmètre généraliste très large |
| Intégration au projet | Une dépendance nouvelle, épinglée ; aucun impact sur les 7 usages ECharts existants | Zéro dépendance nouvelle, mais adaptation trading à assumer durablement |

Recommandation : retenir Lightweight Charts pour le graphique de prix d'Oryon. Le critère décisif est la spécialisation OHLC : les primitives de temps de marché (échelle, crosshair, pan/zoom) sont le socle de tout le reste, et les réécrire sur une bibliothèque généraliste coûterait plus que l'ajout d'une dépendance spécialisée. ECharts n'est ni retirée ni réutilisée pour Oryon ; ses sept usages actuels (tableau de bord, analytics, trades) restent inchangés.

### 8.2 Arborescence de composants proposée

La structure proposée suit les conventions existantes du client web : une page de route, une vue coordinatrice, des composants de domaine sous un dossier dédié, des hooks réutilisables et des utilitaires purs. Aucun composant n'est repris de l'ancienne station : la reconstruction part d'une page vierge, en réutilisant uniquement les hooks de données et les primitives d'interface (shadcn/ui, tokens).

- **Route et vue** — `app/(app)/oryon/page.tsx` et `oryon-view.tsx` : coquille du module (layout, états de chargement/erreur explicites, en-tête de module standard), alignée sur le pattern des autres vues.
- **Graphique** — `chart-container.tsx` : création et mise à jour des séries, application des tokens de thème, ResizeObserver ; `multi-chart-grid.tsx` pour les layouts 1/2/4 (P3).
- **Dessin** — `drawing-layer.tsx` (overlay d'interaction : hit-testing, ancres, déplacement), `drawing-toolbar.tsx` (armement des outils), `drawing-list.tsx` (liste d'objets : sélection, verrouillage, masquage, styles).
- **Marché** — `symbol-picker.tsx` (recherche), `timeframe-chips.tsx` (7 unités), `feed-status-badge.tsx` (phase du flux + badge SIM).
- **Indicateurs** — `indicator-panel.tsx` : liste, ajout/retrait, paramètres éditables (P2).
- **Watchlist** — `watchlist-panel.tsx` : symboles suivis et cotations live (P3).

Les composants vivraient sous `apps/web/src/components/oryon/`, les hooks sous `apps/web/src/hooks/oryon/` (ou `lib/oryon/` si la convention des utilitaires purs le suggère au moment du code), et les chaînes dans `dictionaries/en/oryon.ts`. Les testids suivent la convention existante (`oryon-chart`, `oryon-toolbar`, `oryon-drawing-list`, etc.) et sont figés dès P0 pour que les sondes n'aient jamais à les deviner.

### 8.3 Hooks et gestion d'état proposés

La couche de données est réutilisée telle quelle : `useCandles` et `useCandlesRange` pour l'historique, `useLiveQuotes`/`useLiveQuote` et `useFeedStatus` pour le flux, `usePrivatePositions` pour les positions en lecture — aucun fork, aucune copie. Trois hooks propriétaires complètent l'ensemble, chacun testable isolément.

- **useTickMerge** — fusion du tick live dans la dernière bougie entre deux refetchs (haut/bas étendus, clôture et volume mis à jour), avec re-synchronisation systématique au refetch (le serveur reste la source de vérité). Remplace la logique qui vivait dans le composant PriceChart supprimé ; testé unitairement.
- **useDrawings** — réducteur d'état des dessins : ajout, sélection, déplacement, édition d'ancres, style, verrouillage, masquage, suppression, undo/redo multi-niveaux (≥ 50), avec persistance par symbole débouncée et validation Zod au chargement.
- **useIndicators** — configuration des indicateurs et production des séries dérivées par des fonctions pures mémoïsées (recalcul uniquement sur nouvelle bougie close ou changement de configuration).

Pour l'état d'interface, la proposition est volontairement sobre : hooks React locaux et stockage local pour les préférences du module, React Query pour l'état serveur. Aucune bibliothèque d'état global nouvelle n'est introduite tant qu'aucun besoin de partage inter-modules n'est démontré — le store existant du projet est l'infrastructure de mocks MSW, pas un état applicatif.

### 8.4 Schémas Zod partagés proposés

Les contrats du module vivraient dans `packages/shared/src/schemas/oryon.ts`, à côté des schémas existants : `drawingTypeSchema` (énumération des 8 types V2), `drawingSchema` (identifiant, type, ancres temps+prix, couleur, épaisseur, style de trait, verrouillé, masqué, texte optionnel), `drawingsFileSchema` (champ `version` à 1, symbole, liste de dessins), `indicatorConfigSchema` et `chartLayoutSchema`. Le champ de version permet les migrations futures sans ambiguïté ; le chargement passe systématiquement par `safeParse`, et toute donnée invalide est abandonnée avec un avertissement, jamais rendue telle quelle (exigence RF-09).

### 8.5 Évaluation Shadow DOM

La question a été posée d'isoler l'overlay de dessin dans un Shadow DOM. Les bénéfices attendus sont réels (encapsulation des styles, protection contre les fuites) mais les coûts le sont aussi : re-bridge des événements pointeur à travers la frontière, réinjection des tokens de thème dans le shadow root, et outillage de sonde sensiblement plus complexe (le querySelector doit traverser les racines shadow). La recommandation préliminaire est de **ne pas** utiliser de Shadow DOM en V1 : l'overlay vit dans l'arbre React standard avec des classes préfixées par convention (`oryon-*`), les tokens étant déjà cloisonnés par variables CSS dans l'application. Ce choix sera réévalué uniquement si un conflit de styles réel est constaté — décision à reconfirmer au lancement de P1.

### 8.6 Backend — rien de bloquant

Aucune évolution backend n'est un prérequis de la V1 : le market-service fournit déjà bougies, cotations et positions, et la lecture broker est branchée. Deux évolutions sont souhaitables mais non bloquantes, à planifier avec l'équipe backend quand le besoin se confirme : une pagination de `/candles` au-delà de 1 000 bougies pour les fenêtres longues, et un catalogue de symboles exposé explicitement (aujourd'hui implicite, porté par la méthode `handles()` de chaque fournisseur).

## 9. Intégrations et dépendances

### 9.1 Service de marché (:3003)

Les contrats du market-service sont verrouillés et décrits en section 5.1 : REST `/prices`, `/candles`, `/health`, socket.io « prices » (750 ms) et « positions » (room privée), authentification par jeton d'accès, fournisseurs Binance (réel) et simulé (étiqueté SIM). Oryon les consomme via la couche `lib/realtime/market.ts` sans évolution du service. La règle d'honnêteté du contrat partagé s'applique intégralement : toute donnée simulée est étiquetée SIM dans l'interface.

### 9.2 API NestJS

La seule consommation API de la V1 est la lecture broker existante (`useBrokerSession`, GET /broker/session, polling 15 s), déjà conçue comme monitoring en lecture seule avec états NOT_CONFIGURED/ERROR rendus honnêtement. Les orphelins backend du module Session Live (`apps/api/src/modules/session-live`, deep-link nofy `nofy.service.ts:241`) ne sont pas consommés par Oryon ; leur traitement — suppression ou réaffectation — est une passe backend séparée, à arbitrer en section 13 (Q6).

### 9.3 MT5 — hors périmètre V1

La synchronisation MT5 est explicitement hors périmètre de la V1 et relève du long terme. Les contrats broker existants (lecture seule) constituent le point d'ancrage naturel d'une future intégration, mais toute évolution vers la synchronisation de compte ou d'exécution fera l'objet d'un avenant au présent document, avec sa propre analyse de risques — en particulier au regard de la contrainte cardinale de lecture seule.

### 9.4 Dépendances nouvelles

Une seule dépendance nouvelle est prévue : `lightweight-charts`, épinglée exactement dans le lockfile pnpm dès son ajout. Rien d'autre n'est nécessaire : Zod, React Query, Tailwind, shadcn/ui et l'outillage de sondes sont déjà en place. L'impact sur le bundle est maîtrisé par un import dynamique de la bibliothèque (exigence RNF-01), la page Oryon ne la chargeant qu'à la première visite du module.

## 10. Phasage et jalons

La réalisation est séquencée en quatre jalons, chacun assorti de critères de sortie objectifs et vérifiables. Un jalon n'est terminé que lorsque tous ses critères sont constatés, avec tsc et ESLint à zéro erreur, un build validé, un commit et une entrée au journal de travail. L'ordre est volontairement du plus risqué au plus confortable : le socle graphique valide d'abord la bibliothèque, le dessin ensuite parce qu'il concentre l'effort propriétaire, les indicateurs enfin parce qu'ils reposent sur le socle.

**Tableau 6 — Jalons et critères de sortie**

| Jalon | Contenu | Critères de sortie |
|---|---|---|
| P0 — Socle graphique | Route /oryon + navigation + en-tête ; graphique chandeliers thématisé ; symbole + unité de temps ; flux live avec fusion du tick ; statut du flux et badge SIM ; deep-link symbole ; réglages graphique reconnectés | Sonde P0 verte (structure, états, testids) ; tsc 0 ; ESLint 0 ; build OK ; régressions vertes ; POC bibliothèque concluant (panes v5 confirmés ou contournement décidé) |
| P1 — Dessin V2 | Barre d'outils ; 8 types (7 V1 + VLINE) ; sélection, déplacement, édition d'ancres, styles, verrouillage, masquage ; liste d'objets ; undo/redo ≥ 50 niveaux ; persistance Zod versionnée | Sonde P1 verte (flux de dessin complet, rechargement persisté, undo/redo) ; tests unitaires géométrie et persistance ; revue lecture seule (RNF-06) |
| P2 — Indicateurs | Template par défaut volume + RSI(14) ; EMA/SMA, MACD, Bandes de Bollinger, ATR ; sous-panneaux ; paramétrage éditable | Sonde P2 verte (template par défaut, ajout/retrait, paramètres) ; tests unitaires des calculs contre séries de référence ; recalcul mémoïsé constaté |
| P3 — Confort | Grille multi-chart 1/2/4 avec crosshair synchronisée en option ; watchlist ; polish responsive, thèmes, accessibilité | Sonde P3 verte (390 px overflow 0, thème clair, layouts) ; toutes suites vertes ; revue finale lecture seule |

Chaque jalon se conclut par la même ritournelle de livraison, éprouvée dans le projet : vérifications automatisées, captures d'écran (bureau, mobile 390 px, thème clair), commit, entrée au `worklog.md`. Aucun jalon ne démarre tant que le précédent n'a pas ses critères de sortie constatés — c'est la condition du sequencing risqué d'abord.

## 11. Critères d'acceptation et vérification

La vérification suit la discipline déjà en vigueur dans le projet : une sonde Playwright dédiée au module, les suites de régression existantes re-passées à chaque jalon, et une definition of done explicite. La sonde `verify-oryon.js` couvrira progressivement les jalons : structure et testids (P0), flux de dessin complet avec rechargement persisté et undo/redo (P1), indicateurs avec template par défaut et valeurs contre séries de référence (P2), layouts, watchlist, mobile 390 px, thème clair (P3). Cible indicative : au moins 30 vérifications à la fin de P3, avec zéro erreur de page et zéro réponse HTTP ≥ 400 inattendue.

1. **Préparer l'infrastructure** — après tout redémarrage de sandbox : `bun install` puis `bun index.ts` dans `mini-services/market-service`, service :3003 vivant (leçon de la section 5.4).
2. **Construire et servir** — build de production validé, serveur démarré, stamp de build vérifié en bas à gauche de la preview.
3. **Exécuter la sonde du jalon** — verify-oryon au niveau du jalon courant, toutes vérifications vertes, captures bureau / mobile 390 px / thème clair produites.
4. **Passer les régressions** — suites du projet re-passées au vert (chiffres en vigueur au 10 octobre 2026 : recognition 51/51, tools 37/37, events 48/48, tasky 33/33, shell 10/10, profile 59/59, rebrand 17/17).
5. **Revue lecture seule (RNF-06)** — recherche statique du diff : aucune référence à un endpoint d'ordre, aucune UI de passage, modification ou clôture.
6. **Clôturer** — tsc 0, ESLint 0 erreur, commit, entrée au `worklog.md` avec les preuves chiffrées.

Les critères de performance sont mesurés par la sonde et non à l'œil : absence de long task supérieure à 150 ms pendant zoom, pan et dessin (RNF-01), débordement horizontal mesuré à 0 px en 390 px (RNF-02), et chargement de la bibliothèque graphique dans un chunk séparé constaté dans la sortie de build. Ces mesures font partie des critères de sortie des jalons, pas d'un supplément facultatif.

## 12. Risques et mitigations

Les risques sont évalués en probabilité et impact, avec une mitigation explicite pour chacun. Aucun d'entre eux n'est une découverte : ils proviennent soit des limites documentées de la bibliothèque proposée, soit des leçons d'exploitation du projet (section 5.4), soit de l'audit de l'ancienne implémentation.

**Tableau 7 — Registre des risques**

| Risque | Prob. | Impact | Mitigation |
|---|---|---|---|
| Lightweight Charts n'est pas clé en main : ni dessin, ni indicateurs intégrés | Certaine | Moyen | Limite connue et assumée dès ce document ; couche de dessin propriétaire spécifiée (§8.2) ; jalon P1 dimensionné en conséquence |
| API v5 (panes, séries) à confirmer à l'implémentation | Moyenne | Faible | Version épinglée au lockfile ; documentation officielle en annexe A ; POC en tête de P0 avec décision documentée |
| Divergence entre la bougie fusionnée au tick et le refetch de 60 s | Moyenne | Moyen | Le refetch ré-synchronise systématiquement (le serveur reste la source de vérité) ; useTickMerge testé unitairement (cas haut/bas/volume/re-tracé) |
| Erreurs de flux silencieuses rendant les sondes aveugles (leçon V1) | Moyenne | Élevé | RNF-08 : états testidés explicites, télémétrie exposée, sonde qui asserte les états d'erreur au lieu du contenu |
| Dérive de périmètre (replay, alertes, tentatives d'ordre) | Moyenne | Élevé | RF-10 en Could soumis à arbitrage (§13) ; contrainte lecture seule vérifiée par revue de diff à chaque jalon (RNF-06) |
| Dessins décalés lors des changements d'unité de temps ou de zoom | Élevée | Moyen | Ancrage systématique dans le domaine temps+prix ; cas limites couverts par tests (changement d'UT, rechargement, données manquantes aux bornes) |
| Performance dégradée en multi-chart 4× | Moyenne | Moyen | Instanciation séparée par graphique, import dynamique, budget long tasks vérifié par la sonde à P3 |
| Market-service mort après un redémarrage de sandbox (diagnostic erroné) | Élevée | Faible | dev.sh corrigé (bun install au démarrage) ; réflexe documenté §5.4 et rappelé en tête du protocole de vérification (§11) |

## 13. Questions ouvertes à arbitrer

Sept questions restent ouvertes et relèvent de l'arbitrage du propriétaire du produit. Pour chacune, les options et une recommandation argumentée sont proposées ; la recommandation est un point de départ, pas une décision. Tant qu'une question n'est pas arbitrée, elle ne bloque pas le jalon P0 sauf mention contraire.

**Tableau 8 — Questions ouvertes et recommandations**

| N° | Question | Options | Recommandation |
|---|---|---|---|
| Q1 | Route et nom technique du module | /oryon, ou un autre chemin | /oryon — cohérent avec le nom définitif « Oryon » et les conventions du routeur existant |
| Q2 | Replay d'une fenêtre passée en V1 ? | Reporter (COULD) ; inclure au P3 | Reporter — useCandlesRange existe déjà, le besoin est réel mais non critique pour l'analyse ; réévalué après P2 |
| Q3 | Watchlist en V1 ? | P3 (SHOULD) ; reporter | P3 — la couche de données (useLiveQuotes) est déjà là ; la valeur utilisateur est immédiate et l'effort modéré |
| Q4 | Position de l'entrée dans la section TRADING | Après Trades ; en fin de section | Après Trades — Oryon est un outil d'analyse de marché, compagnon naturel du journal d'exécution |
| Q5 | Gestion de l'état d'interface | Hooks locaux + stockage local ; bibliothèque d'état globale | Hooks locaux + stockage local — aucun besoin de partage inter-modules démontré ; réévaluer si un besoin réel apparaît |
| Q6 | Orphelins backend Session Live (API /session-live/*, deep-link nofy) | Suppression à une passe backend dédiée ; conservation documentée | Suppression à la passe backend dédiée — code mort connu, aucun consommateur frontend depuis le retrait du 9 octobre |
| Q7 | Migration des anciens dessins (clé cosmoz.session-live.chart.v1) | Pas de migration, clé nouvelle ; migration avec validation Zod | Pas de migration — données non validées, format ancien, valeur incertaine ; la clé `euforia.oryon.drawings.v1` repart propre |

## 14. Annexes

### 14.1 Références officielles

Les références ci-dessous sont les sources officielles des bibliothèques et outils mentionnés ; elles ont été consultées lors de la préparation du présent document et devront être re-vérifiées au moment de l'implémentation, en particulier pour la branche v5 de Lightweight Charts (panes, options de séries) et pour la version exacte à épingler.

- **TradingView Lightweight Charts** — documentation officielle : https://tradingview.github.io/lightweight-charts/ ; dépôt GitHub (licence Apache-2.0) : https://github.com/tradingview/lightweight-charts
- **ECharts** — documentation officielle : https://echarts.apache.org/ (usage actuel du projet : 7 fichiers, inchangés)
- **socket.io** — documentation client v4 : https://socket.io/docs/v4/ (transport de la couche temps réel)
- **TanStack React Query** — documentation : https://tanstack.com/query/latest (état serveur)
- **Zod** — documentation : https://zod.dev (contrats partagés et validation du stockage local)

### 14.2 Glossaire

**Tableau 9 — Glossaire**

| Terme | Définition dans le présent document |
|---|---|
| OHLCV | Ouverture, plus haut, plus bas, clôture, volume d'une bougie — structure du contrat Candle partagé |
| Unité de temps (interval) | Granularité des bougies ; les 7 valeurs du contrat MarketInterval : 1m, 5m, 15m, 30m, 1H, 4H, 1D |
| Phase de flux | État de la couche temps réel : connecting, live, reconnecting, offline ; la péremption (8 s sans tick) rend le flux visuellement STALE |
| SIM | Étiquette obligatoire de toute donnée simulée — règle produit : présenter du simulé comme du réel est un mensonge interdit |
| Overlay de dessin | Couche d'interaction superposée au graphique pour les outils de dessin (hit-testing, ancres, déplacement), distincte du rendu des bougies |
| Panneau (pane) | Sous-graphique vertical (volume, RSI) ; la branche v5 de Lightweight Charts introduit cette notion — à confirmer à l'implémentation |
| MoSCoW | Priorisation Must / Should / Could / Won't utilisée dans le registre des exigences (section 6) |
| Sonde | Script Playwright de vérification automatisée dédié à un module, produisant des vérifications chiffrées et des captures |
| MSW | Mock Service Worker — infrastructure de mocks des surfaces API, avec store de mocks central (mocks/store.ts) |
| Zod | Bibliothèque de validation de schémas, partagée entre frontend, API et mini-services (packages/shared) |

### 14.3 Traçabilité des faits

Les faits techniques du présent document ont été vérifiés dans le dépôt le 10 octobre 2026, sur l'état `b9f52fa` (branche `main`, arbre propre) : hooks et constantes de `apps/web/src/lib/realtime/market.ts`, surface du `mini-services/market-service` (`index.ts` et fournisseurs), `useBrokerSession` (`apps/web/src/lib/api/queries/broker.ts`), contrats `packages/shared/src/schemas/market.ts`, design tokens `apps/web/src/app/globals.css`, dépendances `apps/web/package.json` et navigation `apps/web/src/lib/navigation.ts`. Le retrait du module Session Live est documenté par le commit `079a8e0` et son entrée de journal `b9f52fa` du 9 octobre 2026 (29 fichiers, tsc 0, ESLint 0, build OK). L'audit forensique antérieur, mené le même jour, avait établi qu'aucun code « Oryon » n'avait jamais été commité. Les chiffres de sondes cités (51/51, 37/37, 48/48, 33/33, 10/10, 59/59, 17/17) sont ceux en vigueur au 10 octobre 2026, journalisés dans `worklog.md`.
