# ORYON — PRD & Spécification Technique Complète

**Module : Oryon** — espace de travail de charting professionnel plein écran, inspiré de TradingView, en lecture seule, intégré à Euforia (Cosmoz).

| Champ | Valeur |
|---|---|
| Statut | Spécification — **à implémenter après validation** (aucune implémentation n'a été faite à ce stade) |
| Version | 1.0 — 2026-10-09 |
| Base documentaire | Cahier de charge « EUFORIA — CHARTY COMPLETE PRD AND TECHNICAL SPECIFICATION » (25 sections) + inspection directe du dépôt (faits vérifiés, Annexe A) |
| Destinataire d'implémentation | Agent de développement senior — cette spécification fait autorité ; l'agent ne doit rien inventer au-delà |

> **Note de nommage (décision produit)** : le cahier de charge d'origine intitule le module « Charty » (résidu de template). L'utilisateur a tranché : **le module se nomme Oryon**. Toutes les mentions « Charty » du cahier de charge sont donc lues comme « Oryon » dans ce document. Aucun code, schéma ou route ne doit porter le nom Charty.
>
> **Corrections factuelles au cahier de charge** : deux affirmations de la section « Existing Application Architecture » sont infirmées par le dépôt et corrigées partout dans ce document : (1) **aucun Shadow DOM** n'existe dans l'application (0 occurrence de `attachShadow`, cf. Annexe A) ; (2) le service Python/FastAPI existe (`mini-services/ocr-service`) mais il est **exclusivement OCR** et n'intervient jamais dans le chemin des données de charting. Détails en Annexe B.

---

## 1. Résumé exécutif

Oryon est le successeur du module « Session Live / Charty », supprimé intégralement au commit `3f5ba65` (frontend + backend + mocks + schémas, 54 fichiers). Il reprend l'ambition — une station de charting immersive à la TradingView — avec un périmètre plus rigoureux : moteur de graphes dédié, sous-systèmes de dessin et d'indicateurs de niveau production, visualisation **read-only** des positions MT5 réelles, et persistance fiable.

L'infrastructure de données a survécu à la suppression et est directement réutilisable : le market-service Bun (:3003) fournit bougies REST (`/candles`), flux temps réel socket.io (`prices`) et flux privé de positions (`positions`, actuellement SIM) ; le module Accounts de l'API NestJS expose déjà les endpoints de connectivité trading (`/accounts/{id}/snapshot|positions|orders|sync`) avec chiffrement des identifiants ; les schémas Zod partagés `market`, `instrument`, `broker`, `trading-account`, `eco-event` existent dans `packages/shared`. Ce qui manque est triple : (a) **l'UI complète** (aucun composant Oryon n'existe), (b) **l'intégration MT5 réelle** (le seul provider implémenté est `mock-trading.provider.ts`), (c) **la persistance serveur** des préférences et dessins de charting (l'ancienne version utilisait le localStorage, supprimé avec le module).

Le choix de moteur recommandé est **TradingView Lightweight Charts v5.2.x (licence Apache-2.0)** — cohérent avec les règles du projet (`AGENTS.md` : « Charts: ECharts (analytics) + TradingView Lightweight Charts free version (price charts) »). Ses capacités natives (bougies, multi-panes, échelles, crosshair, price lines, marqueurs) couvrent le rendu ; tout le reste — barre d'outils de dessin, bibliothèque d'indicateurs, overlays de position, persistance — relève d'un développement custom spécifié ci-dessous. Les cahiers des charges externes (provider de données réelle multi-classes d'actifs, pont MT5, source du calendrier économique) sont identifiés comme **décisions ouvertes avec tâches de validation**, jamais présumés résolus.

## 2. Vision produit et objectifs

Oryon doit procurer une expérience de charting professionnelle, dense et immersive, reconnaissable instantanément par un utilisateur habitué à TradingView, sans prétendre en être un clone ni en copier les actifs protégés. L'utilisateur analyse, annote et apprend ; il n'exécute jamais d'ordre depuis Oryon. La fidélité visuelle visée porte sur l'**organisation** (toolbarre haute, rail de dessin gauche, toile centrale dominante, rail utilitaire droit, panneau positions bas), la **densité** et les **patterns d'interaction** (crosshair, zoom/pan, snap sur les prix), pas sur une copie pixel des assets TradingView.

Objectifs mesurables :

1. Un graphe bougies exploitable en moins de 2 s après navigation vers `/oryon` sur le build de production (cible, à mesurer — §17).
2. Chaque outil de dessin affiché est **fonctionnel** : aucun bouton décoratif, aucune commande sans implémentation derrière (règle reprise mot pour mot du cahier de charge §5.3/§8).
3. Les positions affichées proviennent **exclusivement** d'une intégration de compte autorisée et authentifiée ; en mode mock/sans compte, l'UI affiche des états vides honnêtes — jamais de chiffres plaqués.
4. Toute donnée simulée ou retardée est **étiquetée** (`SIM`, « retardé », « périmé ») — affirmer du simulé comme du réel est une « mensonge produit majeur », règle déjà inscrite dans le code (`packages/shared/src/schemas/market.ts`, commentaire `quoteSourceSchema`).
5. Aucune interaction du graphe ne peut soumettre, modifier ou clôturer un ordre — interdits applicatifs **et** architecturaux (aucun endpoint d'exécution n'existe côté backend, cf. §16).

Hors objectifs : exécution d'ordres (interdite, cf. §3), fonctionnalités sociales/communauté TradingView, multi-chart en V1 (P2), copy-trading, alertes d'exécution.

## 3. Périmètre et exclusions

**Inclus (V1 = P0 + P1, cf. §20)** : route dédiée plein écran `/oryon` ; moteur de graphes (bougies par défaut) ; recherche d'instruments ; sélection de timeframe ; navigation prix/temps (pan, zoom, crosshair, reset, retour au dernier prix) ; historique paginé ; rail de dessin gauche avec moteur de dessin complet (création, sélection, déplacement, redimensionnement, style, verrouillage, masquage, duplication, suppression, undo/redo, persistance) ; indicateurs de base (SMA, EMA, Volume, RSI, MACD, Bandes de Bollinger, ATR ; VWAP sous condition de données) ; overlays de positions ouvertes (entrée, SL, TP, direction, volume, P&L latent) ; identification compte/broker ; indicateur de fraîcheur/connexion ; états de chargement/erreur/vide ; persistance des préférences et des dessins ; raccourcis clavier essentiels et accessibilité de base ; notifications applicatives réutilisant l'existant ; calendrier économique en lecture seule si une source est validée.

**Exclus (V1)** : toute exécution d'ordre (achat/vente, ordres en attente, clôture, modification SL/TP via le graphe, glisser-déposer générant une commande) — exclusions **structurelles** (aucun schéma, aucun endpoint, aucun handler MSW ne doivent exister pour l'exécution) ; abonnement à des données de marché payantes sans décision D-1 (§22) ; intégrations broker autres que MT5 (P2) ; multi-chart (P2) ; backtesting ; OCR (concern séparé servi par `mini-services/ocr-service`, jamais appelé par Oryon) ; fonctionnalités communautaires TradingView ; machine learning / LLM (interdits par le cahier de charge §9/§25).

**Frontière données** : les opérations de trading restent sur la plateforme de l'utilisateur (MetaTrader 5). Oryon est un environnement d'analyse, de visualisation et d'apprentissage.

## 4. Personas et parcours utilisateurs

**P1 — Le trader journal (persona principal Euforia)** : trade forex, crypto et indices synthétiques (Deriv Boom/Crash/Volatility — catalogues déjà présents dans les fixtures du dépôt). Ouvre Oryon depuis le dashboard ou la sidebar pour **rejouer sa séance** : retrouver ses positions ouvertes, vérifier où se trouve son SL/TP par rapport à la structure du marché, annoter son plan (retracements, zones). Sortie attendue : une lecture claire de sa situation, éventuellement des dessins sauvegardés pour sa review du soir. Sensibilité : ne supporte pas les données « à moitié vraies » (feed figé affiché comme vivant).

**P2 — L'apprenant Academy** : utilise Oryon comme banc d'entraînement — tracer des figures, mesurer, identifier des niveaux, sans compte connecté. Le graphe doit être **utile sans aucun compte** : recherche d'instrument, timeframes, indicateurs, dessins fonctionnent en autonomie complète (données du market-service, étiquetées SIM quand elles le sont). Sensibilité : tous les outils affichés doivent répondre ; un outil mort détruit la confiance.

**P3 — Le trader multi-comptes** : possède plusieurs comptes MT5 (ex. IC Markets réel + Deriv synthétiques + démo). Oryon doit distinguer explicitement **la source des cotations du graphe** et **le broker détenteur de la position** (ex. graphe Gold via une source externe × position ouverte sur IC Markets MT5) et afficher l'avertissement de compatibilité de source quand elles diffèrent (§12.2).

**Parcours cibles (à couvrir par les tests E2E, §19)** :
- **PC-1 Analyse froide** : ouvrir `/oryon` → chercher « XAUUSD » → TF 15m → ajouter EMA(20) + RSI → tracer un retracement de Fibonacci → rafraîchir la page → tout est restauré (instrument, TF, indicateurs, dessin).
- **PC-2 Relecture de positions** : sélectionner le compte « IC Markets Live » dans le sélecteur → le panneau bas liste les positions → cliquer une position → son overlay s'illumine sur le graphe → les lignes Entry/SL/TP correspondent aux valeurs broker exactes.
- **PC-3 Dégradation honnête** : couper le feed → le badge passe à « périmé/reconnexion » → les positions ne sont plus présentées comme à jour → à la reconnexion, snapshot idempotent sans doublon.
- **PC-4 Garde-fou** : sur tout l'espace Oryon, aucun geste (clic droit sur une position, double-clic, drag de ligne, raccourci) ne produit un ordre ; les menus contextuels n'offrent que des actions d'analyse.

## 5. Exigences fonctionnelles

Convention : FR = exigence fonctionnelle (priorité P0/P1/P2 conformément au §20), NFR = exigence non fonctionnelle. « Existant » = capability déjà présente dans le dépôt (cf. Annexe A) ; « À créer » = capability nouvelle.

| ID | Exigence | Priorité | État dans le dépôt | Référence cahier |
|---|---|---|---|---|
| FR-1 | Route dédiée `/oryon` occupant le viewport complet, hors shell (sidebar/topbar absents), avec sortie visible vers l'app | P0 | À créer | §5.1 |
| FR-2 | Recherche d'instruments (nom/symbole) branchée sur `GET /instruments?q=` | P0 | Existant (endpoint + hook `useInstruments`) | §5.3 |
| FR-3 | Sélecteur de timeframes parmi les intervalles réellement servis ; ensemble final = décision D-3 | P0 | Partiel (7 intervalles : 1m,5m,15m,30m,1H,4H,1D) | §6 |
| FR-4 | Graphe bougies par défaut ; barres OHLC, ligne, aire, baseline natifs ; Heikin Ashi par transformation de données | P0 | À créer (moteur LW Charts) | §7 |
| FR-5 | Historique paginé/incremental au scroll gauche, via `from/to` du market-service | P0 | Partiel (`useCandlesRange` existe, plage max 1000) | §10.1 |
| FR-6 | Navigation prix/temps : pan, zoom, crosshair, reset du range, retour au dernier prix, redimensionnement sans corruption d'état | P0 | À créer | §6 |
| FR-7 | Moteur de dessin complet avec persistance serveur (§8) | P0 | À créer (les utils de l'ancien module ont été supprimés) | §8 |
| FR-8 | Outils de dessin cœur V1 : pointeur/crosshair, sélection, déplacement, suppression ; ligne de tendance, horizontale, verticale, ray, canal parallèle ; rectangle, flèche, texte ; Fibonacci retracement + extension | P0 | À créer | §8.1–8.4 |
| FR-9 | Outils d'analyse position long/short **purement analytiques** (jamais d'ordre) | P0 | À créer | §8.4 |
| FR-10 | Indicateurs : SMA, EMA, Volume, RSI, MACD, Bollinger, ATR (+ VWAP si session/volume disponibles) — calculs séparés de l'UI, testés déterministement | P0 | À créer | §9 |
| FR-11 | Overlays de positions : ligne d'entrée + marqueur de direction + volume + lignes SL/TP + P&L latent quand fourni | P0 | À créer (schémas `brokerPositionSchema` existants) | §12.1 |
| FR-12 | Sélecteur de compte connecté avec broker/serveur, statut de connexion, dernière synchro | P0 | Partiel (endpoints Accounts existent ; provider réel manquant) | §11.2 |
| FR-13 | Distinction explicite source de cotation du graphe vs broker de la position, avec états de compatibilité (§12.2) | P0 | À créer (convention `source: real\|sim` déjà posée) | §5.4, §12.2 |
| FR-14 | Étiquetage honnête : `SIM` pour données simulées, badges de fraîcheur, états connexion/reconnexion/hors-ligne | P0 | Partiel (machine à états `lib/realtime/market.ts` existe) | §2, §10.2 |
| FR-15 | Panneau bas compact repliable listant les positions (instrument, direction, volume, entrée, courant, SL, TP, P&L latent, fraîcheur) ; sélection → highlight de l'overlay | P0 | À créer | §14 |
| FR-16 | Persistance : instrument, timeframe, type de graphe, viewport (si faisable), configs d'indicateurs, styles de dessin, visibilité des panneaux, compte préféré | P0 | À créer (serveur ; cf. §13) | §15 |
| FR-17 | Notifications applicatives (problèmes de connexion, erreurs de synchro) réutilisant le système existant (sonner + `/alerts`) — pas de seconde architecture | P0 | Existant | §13 |
| FR-18 | Calendrier économique (heure, devise, importance, titre, source) en lecture seule | P1 | Partiel (schéma `ecoEventSchema` + `GET /eco-events` ; source réelle non validée — D-4) | §13 |
| FR-19 | Outils de dessin étendus : ellipse, rayon horizontal, ligne étendue, mesure prix/temps, canaux de régression, Fibonacci trend-based | P1 | À créer | §8.2–8.4 |
| FR-20 | Multi-sélection d'objets, duplication, presets de style par défaut | P1 | À créer | §8.5–8.6 |
| FR-21 | Heikin Ashi (transformation), baseline | P1 | À créer | §7 |
| FR-22 | Inspection de position enrichie (détail au survol sans masquer le graphe) | P1 | À créer | §12.1 |
| FR-23 | Intégrations broker additionnelles, multi-chart, templates d'analyse étendus | P2 | Hors V1 | §21 P2 |

## 6. Spécification UI et interaction détaillée

### 6.1 Layout général (FR-1)

Oryon occupe **tout le viewport** disponible. La route proposée est `apps/web/src/app/oryon/page.tsx` — **en dehors du route group `(app)`**, donc sans `AppShell` (sidebar 240/72 px, topbar, bottom-nav mobile). Le layout local `apps/web/src/app/oryon/layout.tsx` réutilise uniquement `AuthGate` (mécanisme centralisé des routes protégées, cf. `(app)/layout.tsx:23`) — l'authentification reste obligatoire. Une sortie visible (« ← Euforia ») ramène vers `/` ; le raccourci `Échap` ne quitte PAS le module quand un mode de dessin est actif (il annule d'abord l'outil, cf. §18).

Zones (du haut vers le bas) :

1. **Toolbarre haute** (hauteur ~40–48 px) : identité instrument, recherche, timeframe, type de graphe, indicateurs, mise en page, undo/redo, plein écran, notifications, calendrier, préférences.
2. **Rail de dessin gauche** (largeur ~44 px, expandable) : catégories d'outils §8.
3. **Toile centrale** : le graphe reçoit l'espace maximal ; overlays de positions et dessins superposés.
4. **Rail utilitaire droit** (~240 px, repliable, overlay sans réduire la toile en mode flottant) : notifications, calendrier économique, détail de position contextuel.
5. **Panneau bas** (~180 px, repliable) : positions ouvertes du compte sélectionné.

Comportement responsive : desktop ≥ 1280 px = layout complet ; tablette ≥ 768 px = rail droit en overlay, panneau bas autorisé ; mobile < 768 px = **fallback délibéré** : graphe + toolbarre compacte (identité, TF, type, menu « … »), rails masqués, panneau positions accessible en bottom-sheet. Le fallback mobile est P1 (P0 = desktop + tablette), décision cohérente avec l'usage d'une station d'analyse.

### 6.2 Toolbarre haute (FR-2, FR-3, FR-4)

Contrôles P0 : recherche d'instrument (⌘K / Ctrl+K ouvre la palette de recherche — la `CommandPalette` existante du shell n'est PAS disponible hors shell, Oryon embarque la sienne, branchée sur `useInstruments`) ; nom + symbole canonique ; badge source de cotation (`RÉEL`/`SIM`, couleur distincte) ; sélecteur de timeframe (segments) ; sélecteur de type de graphe (icônes bougie/barre/ligne/aire) ; menu indicateurs (recherche + liste, §9) ; undo/redo dessins ; bascule plein écran (Fullscreen API, dégradation gracieuse) ; notifications (compteur `sonner`/`/alerts`) ; préférences du graphe ; gestion des objets dessinés (liste des dessins de l'instrument, visibilité/verrouillage/suppression en masse).

Contrôles **explicitement absents en V1** (le cahier de charge §5.3 interdit les contrôles sans implémentation) : alertes de prix (l'infrastructure `/alerts` existe mais sa sémantique de déclenchement côté graphe n'est pas spécifiée — P2), layouts multi-graphes (P2), capture/partage d'image (P2), caméra, replay.

### 6.3 Identité d'instrument (FR-13)

Chaque graphe affiche : nom d'affichage (`Gold`), symbole canonique (`XAUUSD`, schéma `instrumentSchema`), classe d'actif, devise de cotation, et **badge de la source de cotation**. Le sélecteur de compte affiche séparément : broker, serveur (`server` de `NormalizedAccountInfo`), numéro de compte, type (démo/réel si fourni). Règle absolue : la source des cotations du graphe et le broker du compte sélectionné sont **deux identités distinctes, affichées côte à côte mais jamais fusionnées**. Si une position overlay provient d'un broker dont les prix ne sont pas directement comparables à la source du graphe, l'overlay porte un marqueur de divergence (§12.2) — jamais d'équivalence de prix silencieuse.

### 6.4 Timeframes (FR-3)

Ensemble actuel servi par le market-service : `1m, 5m, 15m, 30m, 1H, 4H, 1D` (`marketIntervalSchema`). Le cahier de charge liste jusqu'à 11 intervalles (3m, 2H, 1W, 1M manquants). Proposition : étendre `marketIntervalSchema` + providers (Binance supporte nativement `3m/2h/1w/1M` ; le provider SIM doit générer les buckets manquants) — **travail backend Marqué À CRÉER, décision D-3**. En attendant, le sélecteur n'affiche QUE les intervalles servis (aucun bouton mort). Interactions requises : pan horizontal, zoom (molette/pinch), crosshair, interaction échelle prix (auto-fit + scale manuel), échelle temps, reset du range visible, bouton « aller au dernier prix », navigation dans l'historique (pagination §10.1), redimensionnement sans perte d'état (ResizeObserver, cf. pattern `echart.tsx:94`), conservation du timeframe au changement d'instrument quand l'intervalle existe pour ce provider.

États obligatoires du graphe : chargement initial (squelette + spinner discret), historique vide (message « pas de données pour cet instrument/intervalle »), intervalle indisponible (désactivé avec tooltip), requête échouée (bannière inline « données de marché indisponibles » + bouton réessayer — mapping de l'erreur 502 structurée du market-service), feed périmé (> `STALE_MS` = 8 s, badge « périmé », pattern existant `useFeedStatus`).

### 6.5 Types de graphiques (FR-4, FR-21)

| Type | Support | Mécanisme | Priorité |
|---|---|---|---|
| Bougies | Natif LW Charts | `CandlestickSeries` | P0 (défaut) |
| Barres OHLC | Natif | `BarSeries` | P0 |
| Ligne | Natif | `LineSeries` (close) | P0 |
| Aire | Natif | `AreaSeries` | P0 |
| Baseline | Natif | `BaselineSeries` | P1 |
| Heikin Ashi | Transformation | recalcul OHLC → `CandlestickSeries` | P1 |

Règles de changement de type : l'instrument, le timeframe et le viewport sont conservés ; les overlays de positions restent ancrés aux **prix broker réels** — sur Heikin Ashi (série transformée), une ligne d'entrée ne doit jamais être repositionnée sur la bougie transformée : les prix réels et les prix transformés coexistent visuellement distingués (étiquette « prix réel »), le cahier de charge §7 l'exige formellement.

### 6.6 Design visuel

Référence d'organisation : TradingView ; **tokens Euforia obligatoires** (règles `AGENTS.md`) : couleurs 100 % sémantiques via variables CSS (`bg-surface`, `text-muted`, `text-profit`…) sous `[data-theme]` (thèmes dark-blue | dark | light — Oryon doit rendre correctement sur les 3, test de bascule au DoD) ; chiffres en JetBrains Mono (`font-mono`, chiffres tabulaires) ; titres Space Grotesk, UI Inter ; vert/rouge réservés à la sémantique P&L ; pas d'assets TradingView importés, pas de branding copié ; icônes `lucide-react` ; densité élevée mais aérée (séparateurs subtils `border-border`) ; états selected/active/hover/focus/disabled définis pour chaque contrôle. Un segment de theme dédié au canvas de graphe est défini dans `docs/specs/design-tokens.md` (lecture de token via `getThemeToken()`, pattern existant des charts Analytics).

## 7. Évaluation de la bibliothèque de charting

### 7.1 Candidat retenu : TradingView Lightweight Charts v5.2.x

- **Références officielles** : dépôt https://github.com/tradingview/lightweight-charts ; documentation https://tradingview.github.io/lightweight-charts/ ; notes de version https://tradingview.github.io/lightweight-charts/docs/release-notes ; page produit https://www.tradingview.com/lightweight-charts/ (vérifiées le 2026-10-09 ; dernière release : **v5.2.1**).
- **Licence** : Apache-2.0 (fichier LICENSE du dépôt) — usage commercial autorisé avec conservation des notices ; **aucune redevance**. Aucune attribution runtime imposée (on la mentionnera néanmoins dans les crédits du module).
- **Cohérence projet** : `AGENTS.md` liste déjà « TradingView Lightweight Charts free version (price charts) » comme stack charting — le choix est **sanctionné par les règles du dépôt**. Écosystème : `echarts` 6.1.0 reste le moteur des graphes Analytics (equity, heatmaps) ; Oryon ne le remplace pas là.

### 7.2 Capacités natives vs custom (vérité documentée)

| Capacité | Nativement LW Charts ? | Verdict |
|---|---|---|
| Bougies, barres, ligne, aire, baseline, histogramme | Oui (séries de base) | Natif |
| Multi-panes (RSI/MACD sous le prix) | Oui (API panes, introduite v5.0) | Natif |
| Échelles prix/temps, log, autoscale, crosshair | Oui | Natif |
| Marqueurs sur séries (entry/SL/TP) | Oui (plugin `createSeriesMarkers`, v5) | Natif |
| Lignes de prix horizontales (`createPriceLine`) | Oui | Natif |
| Mise à jour incrémentale sans re-render (`series.update()`) | Oui | Natif |
| Zoom/pan, range visible, `timeScale().timeToCoordinate()` / `priceToCoordinate()` | Oui | Natif |
| **Outils de dessin** (trendlines, Fibonacci, rectangles…) | **Non** | Custom (§8) — overlay + conversions coordonnées |
| **Indicateurs calculés** (SMA/EMA/RSI/MACD/BB/ATR) | **Non** (aucune bibliothèque d'indicateurs embarquée) | Custom (§9) |
| Heikin Ashi | Non (transformation de données à notre charge) | Custom-léger |
| Alertes, screener, calendrier, widgets sociaux | Non (monde Advanced Charts/SaaS) | Hors périmètre / P2 |
| Comparaison de symboles, multi-graphes | Non | P2 |

**Ce que LW Charts n'est PAS** : l'interface TradingView complète. Le cahier de charge §4.1 l'exige : ne pas prétendre reproduire les capacités propriétaires ; toute capacité incertaine est marquée « à valider » avec une tâche (T-VAL-* en §22/§24).

### 7.3 Intégration Next.js / React

LW Charts est une bibliothèque **client-only** (canvas, mesures DOM) : import dynamique dans un composant `"use client"`, création du graphe dans `useEffect`, destruction dans le cleanup (`chart.remove()`), resize via `ResizeObserver`, re-création au changement de thème (pattern éprouvé du dépôt : `components/charts/echart.tsx:82-103`). Règle de performance structurante : **aucun state React par tick** — les ticks alimentent `series.update()` par référence impérative ; React ne rend que la chrome UI (toolbarres, panneaux). Souscription `chart.subscribeCrosshairMove` etc. toujours détachée au cleanup (critère d'acceptation ACC-12).

### 7.4 Abstraction moteur (FR sans sur-ingénierie)

Une frontière unique et concrète, pas un framework : `components/oryon/engine/chart-engine.ts` encapsule la création/destroy du graphe, la conversion temps↔x et prix↔y, l'upsert de séries (prix, indicateurs, volume), les price lines et marqueurs de positions, et expose un bus d'événements minime (`crosshair`, `visibleRangeChange`, `click`). Le domaine (dessins, indicateurs, positions) dépend de cette interface, jamais de `lightweight-charts` directement — un remplacement éventuel du moteur ne touche qu'un fichier boundary. Limites assumées : l'abstraction couvre les besoins **réels** de Oryon (pas de couche générique speculative — cahier de charge §4.3).

## 8. Spécification du sous-système de dessin

Priorité déclarée du cahier de charge §8 : le rail de dessin est un composant **de plus haute priorité** ; tout outil affiché a un modèle d'interaction et une persistance définis. Interdiction formelle de recréer une colonne d'icônes décorative.

### 8.1 Catalogue d'outils

**Sélection/curseur (P0)** : pointeur (sélection/déplacement), crosshair (aucune sélection), sélection d'objet, suppression (`Suppr`), verrouiller/déverrouiller, masquer/afficher, menu contextuel d'objet (style, dupliquer, verrouiller, supprimer). Multi-sélection (Shift+clic + rectangle de sélection) : P1.

**Lignes et canaux (P0)** : ligne de tendance (2 ancres), ligne horizontale (1 ancre prix, s'étend sur tout le graphe), ligne verticale (1 ancre temps), ray (2 ancres, extension infinie côté 2), ligne étendue (P1), canal parallèle (3 clics : 2 pour la base, 1 pour l'offset — P0), canal de régression (P2).

**Fibonacci (P0)** : retracement (2 ancres, niveaux 0/0.236/0.382/0.5/0.618/0.786/1, niveaux éditables, étiquettes prix par niveau) ; extension (P1, 3 ancres) ; trend-based (P2). Comportement zoom/pan : le rendu des niveaux suit les coordonnées temps/prix (recalcul à chaque `visibleRangeChange`), les étiquettes restent lisibles à tout zoom.

**Formes et annotations (P0 sauf mention)** : rectangle (2 ancres), flèche (variante de la trendline avec tête), texte (1 ancre + édition inline), mesure prix/temps (drag, affiche Δprix en pips selon `pipSize` de l'instrument + Δtemps + ratio, P1), position long / position short **analytiques** (3 ancres : entrée, stop, objectif ; calcule risque/rendement localement ; uniquement des objets locaux, jamais une commande — le cahier de charge §8.4/§12.3 l'autorise sous cette réserve). Ellipse et forme libre : P2.

### 8.2 Modèle d'interaction unifié

Chaque outil implémente la même machine à états — le cahier de charge §8.7 interdit N composants isolés avec N logiques dupliquées :

```
idle ──(activation outil)──► armed ──(clic 1)──► anchoring ──(clics suivants / drag)──► creating
creating ──(double-clic / Échap / dernier ancre)──► idle (objet sélectionné)
sélectionné : drag ancre = resize ; drag corps = move ; double-clic = édition style
```

Opérations garanties sur tout objet (§8.5 du cahier) : création, placement d'ancres, sélection, déplacement, redimensionnement, stylage (couleur/épaisseur/style de ligne/remplissage/opacité/texte), duplication, verrouillage, masquage, suppression, undo/redo (pile de 50 pas, partagée avec les indicateurs), persistance et restauration après navigation ou rafraîchissement. `Échap` annule l'outil en cours puis désélectionne ; `Suppr` supprime la sélection (objets verrouillés exemptés).

### 8.3 Ancrage coordonnées — pas de pixels

Chaque ancre est stockée en **coordonnées de marché** : `{time: number (UTCTimestamp ms), price: number}`. La conversion écran se fait à chaque frame de rendu via le moteur (`timeToCoordinate`/`priceToCoordinate`). Conséquences garanties (cahier de charge §8.5) : zoom/pan/changement de timeframe/rechargement d'historique laissent les dessins attachés à leurs coordonnées (ACC-4). Cas dégradés : ancre au-delà de l'historique chargé (rendu hors-range, re-attaché à l'arrivée des données), instrument sans données (liste des dessins consultable, canvas masqué), timeframe où le bucket contient l'ancre (rattachement au bucket le plus proche **sans réécriture** de l'ancre stockée). Ancres flottantes interdites.

### 8.4 Rendu — overlay canvas dédié

Un `<canvas>` superposé (pointer-events conditionnels) rend tous les objets dessinés, au-dessus du canvas LW Charts et sous les tooltips. Raisons : LW Charts ne fournit pas d'outils de dessin ; un overlay unique évite N canvases et permet le hit-testing centralisé. Boucle de rendu : redraw sur `visibleRangeChange`/`crosshairMove`/`resize`/mutation du store (requestAnimationFrame coalescé — jamais de redraw par frame quand rien ne bouge). Hit-testing : distance point-segment pour les lignes, contenance pour les rectangles/formes, tolérance écran de 6 px, priorité à l'objet le plus récent. Le curseur reflète le mode (`default`/`crosshair`/`move`/`nwse-resize`).

### 8.5 Architecture du store

```
components/oryon/drawings/
  drawing-store.ts      # état du livre de dessins (par instrument), immutable + useSyncExternalStore
  drawing-engine.ts     # rendu overlay + hit-testing (dépend chart-engine pour les conversions)
  tools/tool-*.ts       # 1 fichier par outil : géométrie + ancres + rendu + hit-test propres
  types.ts              # DrawingObject union (discriminée par `kind`), styles, niveaux Fibonacci
```

Store immutable avec sélecteurs fins (les mutations passent par des commandes, ce qui implémente undo/redo gratuitement). Les outils ajoutent leurs définitions à un registre (le rail de dessin lit le registre — ajouter un outil futur = 1 fichier + 1 entrée de registre, sans toucher au rail). Conformité AGENTS.md : styles via tokens (`getThemeToken()`), aucun hex codé en dur ; stockage des valeurs de style comme noms de tokens + valeurs numériques (épaisseur, opacité).

### 8.6 Persistance des dessins (FR-7, FR-16)

Serveur, par utilisateur × instrument (contrat en §15, schéma Zod `oryonDrawingSchema` partagé). Sérialisation : `{version, instrumentId, objects[]}` — chaque objet : `{id, kind, anchors[], style, locked, hidden, createdAt, updatedAt}`. Versionnement de schéma dès le jour 1 (`version: 1`) + règles de migration (le backend refuse une version inconnue avec erreur structurée plutôt que de corrompre). Résolution de conflit : sauvegarde par dernier-écrit avec détection de concurrence optimiste (`updatedAt` attendu) ; en cas de conflit, l'UI propose « recharger » ou « écraser » — jamais de fusion silencieuse. Limitation assumée : pas d'édition collaborative, pas d'historique de versions des dessins en V1. La persistance doit être **implémentée et testée** pour être annoncée dans l'UI (cahier de charge §15) ; sinon, l'UI affiche explicitement « dessins locaux non sauvegardés » (mode mock sans backend).

## 9. Spécification du sous-système d'indicateurs

### 9.1 Périmètre et implémentations

Calculs en TypeScript pur, **séparés de l'UI** (cahier de charge §9), dans `apps/web/src/lib/oryon/indicators/` — fonctions pures `(candles, params) => points`, sans dépendance au moteur ni à React. Bibliothèque externe non imposée ; si une lib est choisie (ex. `technicalindicators`), elle respecte la règle « FROZEN stack » (validation utilisateur requise avant ajout). Implémentations P0 :

| Indicateur | Paramètres (défaut) | Rendu | Pane |
|---|---|---|---|
| SMA | période (20) | overlay LineSeries sur le prix | principal |
| EMA | période (20) | overlay LineSeries | principal |
| Volume | — | histogramme (couleurs haussier/baissier tokens) | pane dédié ou axe caché sous le prix |
| RSI | 14, surbends 30/70 | LineSeries + lignes 30/70 | pane dédié (LW v5 panes) |
| MACD | 12/26/9 | histogramme + 2 lignes | pane dédié |
| Bollinger | 20, 2σ | 3 LineSeries + aire optionnelle | principal |
| ATR | 14 | LineSeries | pane dédié |
| VWAP | session | LineSeries | principal — **conditionnel** : nécessite volume + bornes de session fiables par classe d'actifs ; si indisponible pour la classe, l'indicateur est absent du menu (jamais un VWAP faux) |

Aucun ML/LLM dans les indicateurs (interdit cahier de charge §9/§25).

### 9.2 Contrats par indicateur

Chaque implémentation définit : entrées (série close/HLC/volume), paramètres validés par Zod (période ≥ 2 ≤ 500…), valeurs de retour alignées sur les buckets d'entrée, comportement en historique insuffisant (retour `null` pour les N-1 premiers points, jamais d'extrapolation), valeurs manquantes (candle incomplète → point non rendu, pas de trou trompeur), frontières de session (VWAP), et mise à jour sur tick (recalcul incrémental du dernier point uniquement ; recalcul complet au changement de timeframe/instrument). Configuration : menu d'ajout (recherche), panneau de réglages (paramètres + style), visibilité toggle, suppression ; compatibilité timeframe : les paramètres sont conservés, les valeurs recalculées. Persistance des configs : liste ordonnée `{kind, params, style, pane}` par instrument ou global (décision par défaut : **global** + override par instrument P2, §13).

### 9.3 Tests financiers (obligatoires)

Valeurs attendues déterministes sur fixtures figées (séries synthétiques + séries réelles réduites) : cas limites historique insuffisant, valeurs manquantes, nombres décimaux (aucun float sur les affichages — formatage via helpers partagés), stability sur re-run. Chaque indicateur a sa suite ; un indicateur sans tests ne passe pas la définition de « fait » (§19, §21 ACC-13).

## 10. Architecture des données de marché

Principe du cahier de charge §10 : les données de marché sont un concern **séparé** de la synchronisation de compte broker. Aucun provider n'est présumé sélectionné au-delà de ce qui existe.

### 10.1 Historique (partiellement existant)

Contrat existant (vérifié, `packages/shared/src/schemas/market.ts` + `mini-services/market-service/index.ts`) : `GET /candles?symbol=&interval=&limit=&from=&to=` authentifié Bearer, réponse `{symbol, interval, source: real|sim, candles: [{t,o,h,l,c,v}]}` ; plafond 500 bougies (1000 en requête bornée `from/to`) ; erreur 502 structurée « market data provider unavailable ». Exigences Oryon sur cette base :

- **Métadonnées d'instrument** : existantes via `GET /instruments` (`instrumentSchema` : pipSize, digits, contractSize, assetClass) — Oryon les consomme pour le formatage des prix et le calcul pip.
- **Pagination incrémentale** : au scroll gauche, requêtes `from/to` en fenêtres (ex. 500 bougies) avec déduplication par `t` et fusion triée côté client ; hook proposé `useCandlesBackfill` (extension de `useCandlesRange`, `lib/realtime/market.ts:534`). La limite 1000/fenêtre est un paramètre à réévaluer (T-VAL-1).
- **Fuseaux** : interne UTC (`t` = ms epoch, ouverture de bucket) ; affichage en fuseau utilisateur via les helpers existants (règle AGENTS.md « Timestamps are UTC internally »).
- **Bougies manquantes** : rendues comme gaps (pas de bougie inventée) ; la continuation de séance reste du ressort du provider.
- **Validation** : la réponse est validée par `candlesResponseSchema` avant usage (schéma déjà exporté par `@cosmoz/shared`).
- **Erreurs/rate limits** : 401 (refresh single-flight existant), 502 (bannière inline + retry), 429 (backoff expo côté client, aucune boucle serrée).

### 10.2 Temps réel (existant — réutiliser tel quel)

Infrastructure vérifiée (`lib/realtime/market.ts`) : socket.io authentifié (handshake avec l'access token, re-vérification serveur à chaque `subscribe`), snapshot initial à la connexion, broadcast `prices` toutes les 750 ms, dégradation automatique socket → polling 2 s, machine à états `phase: connecting|live|reconnecting|offline` + `transport`, staleness client (`STALE_MS` = 8 s), teardown complet sur fin de session. Oryon consomme `useLiveQuotes`/`useLiveQuote` et **crée un deuxième abonnement au même socket existant, jamais un second socket**. Fusion tick→dernière bougie : côté client, `series.update()` sur le bucket courant (pattern de l'ancien PriceChart, réimplémenté proprement). Règle d'honnêteté (cahier de charge §10.2, déjà inscrite dans le code) : une cote n'est étiquetée « live » que si la source garantit le comportement annoncé ; sinon badge `SIM`/`retardé`. Gestion des souscriptions : les composants s'abonnent/désabonnent via les hooks (refcount du store) ; cleanup au unmount vérifié par test (ACC-12).

### 10.3 Abstraction provider (existante côté service)

Le market-service impose déjà le contrat `MarketDataProvider` (`providers/types.ts`) avec routage par symbole (`handles()`), source étiquetée (`real`/`sim`), et `candles()`. Oryon ne duplique **pas** cette abstraction côté client : le frontend ne connaît que le contrat HTTP/WS + le champ `source`. Mapping symbole↔provider explicite côté service (proposition §15 : endpoint `/symbols` listant les symboles disponibles par provider pour alimenter la recherche).

### 10.4 Sélection de provider — tâches ouvertes (D-1, T-VAL-2)

Couverture actuelle vérifiée : crypto **réel** (Binance public), forex/indices synthétiques **SIM** (marche étiquetée). Le cahier de charge exige de traiter la sélection d'un provider multi-classes d'actifs (XAUUSD, forex, indices CFD réel) comme une décision explicite avec comparaison : instruments requis, couverture historique/temps réel, latence, compatibilité des cotations broker, disponibilité géographique, coût et licence (redistribution interdite chez plusieurs vendeurs), rate limits, complexité d'intégration. Interdits : scraper tradingview.com ou ses API internes ; présumer qu'un provider est gratuit sans vérification. Cette décision (D-1) bloque uniquement le « prix réel hors crypto » — le module fonctionne de bout en bout avec la couverture actuelle.

## 11. Intégration broker et comptes

### 11.1 Priorité d'intégration

**MetaTrader 5 = cible primaire** (cahier de charge §11). Multi-brokers MT5 supportés dans la limite des mécanismes de connexion. TradingView reste une référence d'interface, jamais une source de positions. Le dépôt contient déjà la séparation fondatrice (vérifiée, `packages/shared/src/schemas/trading-account.ts`) : identité applicative ≠ identité de compte trading ≠ identifiants de connexion ≠ snapshot du compte ; statut de **connexion** et statut de **synchronisation** jamais fusionnés ; permissions V1 = `READ_*` uniquement.

### 11.2 État réel du dépôt (important — ne pas survendre)

- Existe : `apps/api/src/modules/accounts/` complet — controller (`/accounts/providers`, `/accounts/{id}`, `/accounts/{id}/snapshot|positions|orders|deals|connection/test|connection|sync`, cf. `lib/api/endpoints.ts:35-43`), `provider-registry.service.ts`, `credentials-encryption.service.ts`, `trading-sync.service.ts`, rate limiter, repository.
- **N'existe pas** : tout provider réel — le seul adapter implémenté est `mock-trading.provider.ts`. `provider.types.ts` documente explicitement que « les providers orientés session (ex. pont MT5) étendront l'interface avec des sémantiques de session explicites quand une intégration réelle l'exigera — documenté, pas spéculatif ».
- Le flux WS privé `positions` du market-service est un **livre SIMULÉ** déterministe par utilisateur (`index.ts:194-321`, source étiquetée `"sim"`) — aucune passerelle broker réelle.

Conséquence : l'intégration MT5 réelle est un **chantier backend dédié** (D-2, §22/§24 étape 11), avec mécanisme à valider (pont terminal local hébergé par l'utilisateur, service tiers autorisé type MetaApi, ou API broker directe) — aucune API cloud MT5 publique universelle ne peut être présumée. Contraintes non négociables : **aucun identifiant broker exposé dans le navigateur** (stockage chiffré serveur via `credentials-encryption.service`, patterns existants) ; vérification de propriété du compte côté serveur ; erreurs d'authentification/permission affichées de façon structurée et sans secret.

### 11.3 Exigences frontend sur les comptes

Sélecteur de compte (toolbarre ou panneau bas) : liste des comptes connectés (`useTradingAccounts` existant), statut de connexion (`tradingConnectionStatusSchema`), dernière synchro réussie (`lastSyncAt`), type démo/réel si fourni, broker + serveur. États à couvrir : aucun compte connecté (état vide avec CTA vers `/accounts`), compte injoignable (badge ERROR + raison sans secret), positions périmées (badge « périmé » + horodatage), plusieurs comptes détenant le même instrument (le sélecteur de compte désambiguïse ; les overlays portent l'identifiant de compte). L'abstraction de représentation compte/position est **déjà écrite** (`brokerPositionSchema`, §11.3 du cahier : identifiants, broker/plateforme, serveur, type, état de connexion, mapping d'instrument, direction, volume, entrée, SL, TP, prix courant, P&L latent + devise, timestamp) — Oryon la consomme sans en inventer des champs.

## 12. Visualisation des positions (cœur V1)

### 12.1 Overlays (FR-11, FR-15)

Pour chaque position compatible du compte sélectionné, le graphe rend : ligne de prix d'entrée (`createPriceLine`, couleur par direction — tokens sémantiques), marqueur de direction (flèche BUY/SELL via `createSeriesMarkers`), étiquette volume + identifiant court de compte, ligne SL (si présente — couleur warning), ligne TP (si présente), P&L latent si `unrealizedPnl` non nul (formaté mono, devise du compte). Positions multiples sur le même instrument : distinguées par décalage d'étiquette + identifiant ; le survol met en évidence l'ensemble des lignes de la position ; le clic sélectionne (synchronisation panneau bas ↔ graphe). Les valeurs affichées sont **toujours celles du broker** (`entryPrice`, `stopLoss`, `takeProfit` — decimal strings du schéma), jamais recalculées depuis la cote du graphe. Positions pending (`brokerOrderSchema`) : affichables en lecture seule (P1).

### 12.2 Compatibilité de source de cotation (FR-13)

États définis et rendus explicitement :

| État | Condition | Rendu |
|---|---|---|
| `SAME_SOURCE` | la cote du graphe provient du même broker/source vérifiée | overlay normal |
| `COMPATIBLE` | sources différentes mais instruments comparables (même sous-jacent, écarts de spread attendus) | overlay + badge « source différente » au survol |
| `MISMATCH` | sous-jacent/devise non comparables | overlay + bandeau d'avertissement persistant, PAS de surlignage d'équivalence de prix |
| `NO_DATA` | position sans prix courant (`currentPrice: null` — gap de feed) | « N/A » affiché, jamais de deviné (commentaire schéma broker.ts) |
| `STALE` | feed périmé (> STALE_MS) | badge « périmé » global + gel de l'affichage du P&L avec horodatage |

La logique de compatibilité est une fonction pure testée (`lib/oryon/position-compat.ts`, proposé) : entrées = {source du graphe, broker de la position, mapping d'instrument} ; sortie = état + raison affichable.

### 12.3 Read-only strict (FR + interdits structurels)

Interdits explicites (cahier de charge §12.3, repris intégralement) : soumission d'ordres achat/vente, création d'ordres marché/en attente, clôture de position, modification de SL/TP via interaction graphe, ajustement de volume déclenchant un ordre, tout drag générant une commande, toute action d'exécution cachée ou indirecte. **Déplacer un dessin ne modifie jamais une position broker.** Application en profondeur : (1) aucun endpoint d'exécution dans l'API (interdiction de schéma — déjà respectée par `schemas/broker.ts` : « Phase 2 (execution) must add its own guarded contracts instead of widening these ») ; (2) aucun handler MSW d'exécution ; (3) aucun bouton/menu contextuel d'exécution dans l'UI ; (4) le panneau bas n'a **aucun** bouton d'action de trading ; (5) le backend reste l'autorité (les restrictions frontend seules sont insuffisantes — cahier de charge §12.3/§17). Test de garde dédié : balayage statique + E2E (ACC-10, T-RO-*).

## 13. Modèle de persistance

### 13.1 Séparation des trois catégories

Le cahier de charge §15 impose de séparer : **(a) préférences utilisateur** (instrument, timeframe, type de graphe, viewport si faisable, configs d'indicateurs, visibilité des panneaux, compte préféré, apparence du graphe) ; **(b) dessins analytiques** (propriété de l'utilisateur, contexte = instrument) ; **(c) données de trading broker** (positions/ordres — jamais stockées par Oryon, toujours lues de la source broker). **Aucune credential broker dans le stockage navigateur** (interdit §15/§17 ; le dépôt chiffre déjà côté serveur).

### 13.2 Emplacements canoniques (proposés, sur l'existant)

| Donnée | Emplacement | Mécanisme existant à réutiliser |
|---|---|---|
| Préférences de graphe | Serveur, domaine `oryon` | `PATCH /me/preferences/{domain}` — endpoint générique déjà présent (`endpoints.ts:22`, hook `preferences.ts`) ; handler MSW à étendre |
| Dessins | Serveur, module Oryon | Nouveaux endpoints `/oryon/drawings` (§15) — le pattern repository/service NestJS existe dans chaque module |
| Configs d'indicateurs | Serveur, domaine `oryon-indicators` | Même mécanique que préférences |
| Viewport courant | Client (mémoire + restauration best-effort au montage) | non contractuel |
| Session/auth | Existant | `token-store` en mémoire + cookie `cosmoz_rt` HttpOnly — Oryon ne crée **aucun** second gestionnaire de token (règle déjà codée dans `lib/realtime/market.ts:29`) |

Le localStorage n'est PAS la source canonique (l'ancien module y stockait `cosmoz.session-live.chart.v1` — ce choix est abandonné avec le module) ; en mode mock, ce sont les handlers MSW qui implémentent le contrat serveur, exactement comme les autres domaines. Dessins rattachés à l'utilisateur authentifié (isolation serveur, §16). Versionnement et migrations : champ `version` obligatoire, refus structuré des versions inconnues, migration documentée avant tout changement de forme (ACC-5 couvre la restauration post-refresh).

## 14. Architecture frontend proposée

> Tous les chemins ci-dessous sont **proposés** (conventions du dépôt : composants `components/{domain}/`, hooks `lib/hooks/use-*.ts` ou modules dédiés, schémas partagés dans `packages/shared/src/schemas/`, i18n `src/i18n/dictionaries/en/oryon.ts`).

```
apps/web/src/
  app/oryon/
    layout.tsx                    # AuthGate seul (hors AppShell) — FR-1
    page.tsx                      # route /oryon, rendu client du workspace
  components/oryon/
    oryon-workspace.tsx           # orchestration layout 5 zones + état global du module
    toolbar/oryon-toolbar.tsx     # toolbarre haute (recherche, TF, types, indicateurs, undo/redo…)
    toolbar/instrument-search.tsx # palette ⌘K branchée sur useInstruments
    drawing/oryon-drawing-rail.tsx# rail gauche (lit le registre d'outils)
    drawings/                     # moteur de dessin (§8.5) : store, engine, tools/, types
    canvas/oryon-chart-panel.tsx  # toile centrale : moteur + overlays positions + dessins
    canvas/position-overlays.tsx  # rendu positions (price lines + marqueurs + labels)
    canvas/indicator-panes.tsx    # gestion des panes d'indicateurs
    right/oryon-utility-rail.tsx  # rail droit : notifications, calendrier, détail position
    bottom/oryon-positions-panel.tsx # panneau bas (§12/§14)
    engine/chart-engine.ts        # frontière LW Charts (§7.4) + events
  lib/oryon/
    indicators/                   # calculs purs (§9) : sma, ema, rsi, macd, bollinger, atr, vwap
    position-compat.ts            # états de compatibilité de source (§12.2)
    use-oryon-workspace.ts        # état du module (store useSyncExternalStore, pattern maison)
    oryon-commands.ts             # pile undo/redo partagée dessins+indicateurs
  i18n/dictionaries/en/oryon.ts   # namespace de copy du module
packages/shared/src/
  schemas/oryon.ts                # contrats dessins + préférences + workspace (§15)
apps/api/src/modules/oryon/       # module NestJS persistance (§15)
apps/web/src/mocks/handlers/oryon.ts  # handlers MSW du module (mock mode par défaut)
```

Découplage React : le workspace lit l'état via des sélecteurs ; **aucun composant ne re-render sur un tick** (les ticks vont au moteur, §7.3) ; les stores maison suivent le pattern `useSyncExternalStore` déjà employé dans `lib/realtime/market.ts`. Server Components par défaut partout où il n'y a pas d'interaction (règle AGENTS.md) ; la page porte un `"use client"` unique au sommet du workspace (canvas + interactivité omniprésente). Navigation : entrée sidebar **proposée** dans la section Trading de `NAV_SECTIONS` (`lib/navigation.ts:186`) + raccourci depuis le dashboard — à restaurer à l'image de l'ancienne entrée Charty supprimée.

## 15. Contrats backend proposés

Convention : schémas Zod dans `packages/shared` (source de vérité unique client+API+mocks — pattern `endpoints.ts` « the mocked backend can never drift »). Distinction explicite **existant / à créer** pour chaque contrat (cahier de charge §16).

### 15.1 Contrats existants (réutilisation, aucune recréation)

| Contrat | État | Preuve |
|---|---|---|
| `GET /instruments?q=` — recherche d'instruments | Existant | `endpoints.ts:26`, `catalogs.ts:20` |
| `GET /candles` (market-service) — historique | Existant | `next.config.ts:31`, `market-service/index.ts:90` |
| WS `prices` (market-service) — temps réel | Existant | `market-service/index.ts:326`, `lib/realtime/market.ts:304` |
| WS `positions` (room `user:<id>`) — positions privées | Existant (SIM uniquement) | `market-service/index.ts:315` |
| `GET /accounts` + endpoints connectivité (`/accounts/{id}/snapshot\|positions\|orders\|sync`) | Existant (provider mock) | `endpoints.ts:31-43`, `apps/api/src/modules/accounts/` |
| `PATCH /me/preferences/{domain}` — préférences | Existant (générique) | `endpoints.ts:22` |
| `GET /alerts`, `GET /eco-events` — notifications, calendrier | Existant (données mock) | `endpoints.ts:85-87` |

### 15.2 Contrats à créer (proposés)

Tous authentifiés (Bearer access token), validés Zod, isolés par utilisateur (`userId` du token, jamais du body), rate-limités raisonnablement (pattern `accounts-rate-limiter.service.ts`).

1. **`GET /oryon/workspace`** — état persisté du workspace (préférences + configs indicateurs consolidées). Réponse : `oryonWorkspaceSchema {instrument?, interval?, chartType?, indicators: IndicatorConfig[], panels: PanelVisibility, preferredAccountId?}`. Alternative assumée : réutiliser `PATCH /me/preferences/oryon` (préféré si le domaine preferences accepte un payload libre — à vérifier à l'implémentation, T-VAL-3).
2. **`GET /oryon/drawings?instrument=`** — liste des dessins de l'instrument. Réponse : `oryonDrawingBookSchema {version: 1, instrumentId, objects: oryonDrawingObject[], updatedAt}`.
3. **`PUT /oryon/drawings?instrument=`** — sauvegarde complète du livre (last-write-wins + concurrence optimiste sur `updatedAt` : renvoyer 409 structuré si conflit). Requête : le livre complet validé. Choix documenté : sauvegarde **du livre entier** (simple, atomique, adapté au volume — quelques centaines d'objets max) plutôt que delta par objet ; à réviser si les volumes le justifient (P2).
4. **`GET /symbols`** (market-service) — catalogue des symboles servibles par provider (`{symbol, source, intervals[]}`) pour désambiguïser la recherche et prévenir les 404 de provider.
5. **WS (optionnel, P2)** — push des mises à jour de dessins multi-onglets : hors V1 (rafraîchissement à la navigation suffit).
6. **MT5 réel (D-2)** — étendre le provider Accounts avec sémantiques de session (pont terminal) : le contrat normalisé reste `Normalized*` (`provider.types.ts`) ; **aucun** contrat d'exécution, jamais.

Mécanismes de transport : REST pour tout le CRUD (cohérent avec l'app) ; WS existant pour les flux temps réel ; pas de SSE (aucun usage existant, aucun besoin justifié). Chaque endpoint spécifie : but, schémas requête/réponse (Zod), règles de validation (bornes, tailles max — ex. livre ≤ 512 Ko), cas d'erreur structurés (`VALIDATION_ERROR`, `CONFLICT`, `PAYLOAD_TOO_LARGE`), frontières d'autorisation (propriétaire uniquement), rate limits (GET 60/min, PUT 30/min — alignés sur les patterns du module accounts).

## 16. Sécurité et application du read-only

### 16.1 Authentification et autorisation

- **Accès authentifié obligatoire** : `/oryon` est couvert par `AuthGate` (mécanisme centralisé existant — « one gate for every authenticated module », `(app)/layout.tsx:21-24`) ; aucune page Oryon n'implémente sa propre vérification.
- **Isolation par utilisateur** : les dessins et préférences sont scopés par le `userId` du access token, résolu côté serveur uniquement ; toute requête filtrée par propriétaire au niveau repository (patterns NestJS existants). Le WS market-service joint déjà chaque socket vérifié à sa room `user:<id>` et les événements privés ne sont émis **que** dans cette room, jamais sur canaux nommés par le client (`market-service/index.ts:151-163` — vérifié).
- **Autorisation des dessins/préférences** : lecture/écriture du livre de dessins limitée au propriétaire ; aucun endpoint par `userId` passé en clair.
- **Vérification de propriété des comptes** : la liste des comptes affichables provient du backend (comptes rattachés à l'utilisateur) ; le frontend ne peut pas demander les positions d'un compte étranger (403 structuré).
- **Expiration de session** : le flux 401 → single-flight refresh → retry unique existe (`lib/api/client.ts:141-167`) ; en cas d'échec, `SESSION_EXPIRED` déclenche le teardown complet du feed et la remise à zéro des positions côté client (déjà implémenté dans `teardownFeed()`) — Oryon hérite de ce comportement sans le réimplémenter.

### 16.2 Protection des identifiants et secrets

- Aucun identifiant broker n'apparaît dans le navigateur (§11.2) ; le stockage reste serveur chiffré (`credentials-encryption.service.ts`).
- Aucun token/secret dans les logs frontend : le commentaire du client API fait déjà règle (« Never log the token — attach silently, forget immediately », `client.ts:106`) ; la télémétrie (`recordApiTelemetry`) journalise méthode/chemin/statut/durée — pas de corps, pas de credential.
- Erreurs WS auth structurées (`AUTH_REQUIRED|TOKEN_INVALID|TOKEN_EXPIRED`) affichées sans détail technique.

### 16.3 Validation et prévention de l'exécution accidentelle

- **Validation d'entrée** systématique par Zod côté API (schémas partagés) et côté client avant envoi ; bornes dures (taille du livre de dessins, nombre d'objets ≤ 500, profondeur des ancres).
- **Read-only global** (cahier de charge §17 : « across the entire system, not merely by hiding controls ») : absence structurelle de contrats d'exécution (aucun schéma Zod, aucun endpoint, aucun handler MSW — cf. §12.3) ; interface de provider sans méthode d'ordre (« READ-ONLY BY CONSTRUCTION », `provider.types.ts`) ; revue de garde par balayage statique dans les tests (T-RO-1).
- **WebSocket authorization** : handshake authentifié + re-vérification à chaque `subscribe` (déjà en place côté market-service) ; un token révoqué ne peut pas garder un flux silencieux.
- **Cross-user leakage** : interdit par construction (rooms serveur, filtres repository) ; test négatif dédié (T-SEC-3 : l'utilisateur A ne reçoit jamais les positions/ dessins de B).

## 17. Performance et réactivité

Cibles proposées (à **mesurer** avant de devenir des engagements — cahier de charge §18 « Label them as targets until measured ») ; environnement de mesure = build production `pnpm build` servi par `next start`, device desktop moyen :

| NFR | Cible | Méthode de validation |
|---|---|---|
| NFR-1 Rendu initial du graphe (instrument par défaut) | ≤ 1,5 s jusqu'à première bougie peinte | trace Playwright, chrono jusqu'à `requestAnimationFrame` post-`series.setData` |
| NFR-2 Changement d'instrument | ≤ 800 ms (données en cache) / ≤ 1,5 s (réseau chaud) | idem |
| NFR-3 Changement de timeframe | ≤ 500 ms en cache, sans perte d'état des indicateurs | idem |
| NFR-4 Charge historique | 3 000 bougies paginées fluides ; backfill en arrière-plan sans blocage d'interaction | test scroll, `long task` API |
| NFR-5 Flux de ticks | 0 re-render React par tick ; `series.update()` < 2 ms ; CPU < 5 % en veille du feed | profiling React DevTools + Performance |
| NFR-6 Dessins | 300 objets : hit-test < 5 ms, redraw coalescé rAF, pas de frame > 16 ms lors d'un pan | test automatisé avec fixtures |
| NFR-7 Mémoire | pas de croissance monotone sur session 30 min (fuites = souscriptions non détachées) | heap snapshots avant/après changements d'instrument répétés |
| NFR-8 Onglet arrière-plan | feed coalescé (les ticks arrivent mais pas de travail visuel) ; reprise propre au focus | test visibilité API |
| NFR-9 Cleanup | tout unmount/instrument change détruit séries, price lines, marqueurs, listeners | test lifecycle + ACC-12 |

Mécanismes imposés : ticks → référence impérative du moteur (§7.3) ; stores `useSyncExternalStore` avec sélecteurs fins (jamais de contexte géant re-rendu) ; `React.memo` sur les cellules du panneau positions ; virtualisation si la liste dépasse 50 lignes ; `ResizeObserver` unique ; agrégation des redraws dessin en rAF (§8.4). Dégradation : sur viewport < 768 px ou `navigator.hardwareConcurrency` ≤ 4, limiter l'historique initial à 300 bougies et désactiver les animations d'overlay — comportement documenté, pas un degrade silencieux.

## 18. Accessibilité et interaction clavier

Le canvas de graphe reste graphique — le cahier de charge §19 n'exige pas l'accessibilité screen-reader complète des opérations de dessin, mais impose alternatives et documentation des limites :

- **Navigation clavier** : la toolbarre, le rail d'outils, le panneau positions et le rail droit sont intégralement navigables (Tab/Shift+Tab, flèches dans les listes) ; focus visible systématique (tokens de focus existants) ; piège de focus dans les palettes (recherche, réglages indicateur) avec retour au déclencheur à la fermeture.
- **Raccourcis** (modale d'aide « ? », pattern `use-shortcuts-overlay.ts` existant) : `/` ou ⌘K recherche instrument ; `1..9` timeframes ; `Échap` annuler outil → désélectionner → fermer palette (ordre fixe) ; `Suppr` supprimer objet ; `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` undo/redo ; `V` pointeur, `Alt+T` trendline, `Alt+H` horizontale, `Alt+F` Fibonacci, `Alt+R` rectangle ; `F` aller au dernier prix ; `B` bascule panneau bas.
- **Étiquettes** : tout bouton à icône porte `aria-label` (rail d'outils, toolbarre) ; les listes d'objets dessinés sont des listes natives accessibles.
- **Alternative non-couleur** : direction des positions codée par forme (flèche + lettre B/S) en plus de la couleur ; SL/TP distingués par libellé, pas seulement par teinte ; P&L latent avec signe explicite (+/−).
- **Annonces** : les changements de statut de feed (live→périmé) et les erreurs de synchro sont annoncés via `role="status"` (region polite) — jamais un toast seul.
- **Limites documentées** (à inscrire dans l'aide du module) : les manipulations de dessin au canvas ne sont pas pilotables au screen-reader ; l'alternative fournie est la liste d'objets (sélection, renommage, suppression) et le panneau de réglages par formulaire.

## 19. Stratégie de test

### 19.1 État des lieux et outillage (vérifié)

Le dépôt dispose : (a) **vitest** côté `apps/api` uniquement (`"test": "vitest run"`) ; (b) **aucun runner unitaire côté `apps/web` et `packages/shared`** — la qualité y est assurée par `tsc --noEmit` strict, ESLint, le build, et des **probes Playwright** maison (`apps/web/scripts/probe-*.js`, ex. `probe-regression.js` avec login + smoke de routes) ; (c) MSW v2 comme backend mock par défaut. Conséquence : la stratégie Oryon s'appuie sur les deux patterns et **propose** l'ajout de vitest web/shared — décision D-5 (la règle AGENTS.md « Stack FROZEN » exige l'approbation utilisateur pour tout ajout de dépendance).

### 19.2 Pyramide appliquée à Oryon

| Niveau | Cible | Outil | Exemples |
|---|---|---|---|
| Unitaires purs | Indicateurs (§9.3), `position-compat`, sérialisation dessins, conversions d'intervalles | vitest web/shared (D-5) | RSI(14) sur fixture figée = valeurs attendues ; historique insuffisant → null ; livre de dessins roundtrip JSON |
| Unitaires React | stores (`drawing-store`, `use-oryon-workspace`), machines à états d'outils | vitest + testing-library (si D-5) | undo/redo 50 pas ; verrouillage bloque suppression |
| Intégration API | module `oryon` NestJS : autorisation, validation, 409 conflit, versions de schéma | vitest api (existant) | B essaye PUT sur le livre de A → 403 ; version 99 → erreur structurée |
| Contrats mock | handlers MSW oryon = miroir du contrat Zod | vitest web/shared | drift impossible (pattern « never drift ») |
| E2E / smoke | parcours PC-1…PC-4 (§4) + régression 12 routes | probes Playwright maison (pattern existant) | dessin → refresh → restauré ; aucun geste ne déclenche d'ordre |
| Garde read-only | balayage statique du code Oryon | script probe dédié | aucun import d'endpoint d'ordre, aucun handler POST de trading, `provider.types` inchangé |

### 19.3 Règles de données et de non-régression

- **Fixtures déterministes** uniquement (`mocks/fixtures/`) — jamais de compte trading réel, jamais d'exécution (cahier de charge §20). Le provider mock existant et le livre SIM du market-service fournissent les positions de test étiquetées `sim`.
- Chaque exigence FR/NFR référence ses tests (matrice §23) ; « fait » = implémenté + testé + lint/tsc/build verts (DoD AGENTS.md : `pnpm build` zéro erreur TS, lint propre, 3 thèmes rendus, responsive desktop+390 px, aucun TODO).
- Tests de thème : bascule dark-blue/dark/light sur `/oryon` (lecture tokens canvas via `getThemeToken()`).
- Test de resize : 1280→768→390 sans corruption d'état (FR-6).
- Performance : sondes NFR-1…NFR-3 en probe Playwright chronométrée (cibles §17, re-mesurées à chaque milestone).

## 20. Feuille de route priorisée

### P0 — Fondation obligatoire (V1 minimale crédible)

Route `/oryon` hors shell + AuthGate ; layout 5 zones ; moteur LW Charts (bougies) ; recherche instrument (existante) ; timeframes servis ; navigation prix/temps ; historique + fusion ticks ; toolbarre (contrôles P0 §6.2) ; rail de dessin + moteur de dessin (machine à états, ancrage temps/prix, overlay canvas) ; outils cœur (trendline, horizontale, verticale, ray, canal, rectangle, flèche, texte, Fibonacci retracement) ; indicateurs SMA/EMA/Volume/RSI/MACD/BB/ATR ; overlays de positions (entry/SL/TP/direction/volume/P&L) ; sélecteur de compte + identification broker/source ; états de compatibilité de source ; règles read-only (UI + contrats) ; badges connexion/fraîcheur ; états loading/empty/error ; persistance préférences + dessins (serveur ou MSW) ; tests essentiels + accessibilité de base.

### P1 — Polissage de la V1 (le cahier de charge exige P0+P1 pour la release initiale)

Bibliothèque de dessin étendue (extension, ligne étendue, mesure, Fibonacci extension, multi-sélection, duplication, presets) ; Heikin Ashi + baseline ; inspection de position enrichie ; menus contextuels complets ; personnalisation d'apparence du graphe ; préférences de layout (rails, hauteur panneau) ; VWAP si D-6 ok ; calendrier économique branché (D-4) ; optimisations perf mesurées ; fallback mobile complet ; raccourcis avancés.

### P2 — Expansion future

Intégrations broker additionnelles ; multi-chart ; canaux de régression, trend-based Fibonacci, formes libres ; alertes de prix gráfiques ; partage/export de vue ; templates d'analyse ; push multi-onglets des dessins. **L'exécution d'ordres reste interdite en P2** (cahier de charge §21 : « Do not add order execution to future scope unless the product requirements are explicitly changed »).

Bloqueurs documentés si un P0 ne peut être livré : voir décisions D-1 à D-6 (§22) — chaque bloqueur porte conséquence et décision requise, conformément au cahier de charge §21.

## 21. Critères d'acceptation

Chaque critère est mesurable ; les ACC-x tracent vers les tests (§23) :

1. **ACC-1** `/oryon` s'ouvre en workspace dédié, sans sidebar/topbar, occupant le viewport ; sortie visible fonctionnelle.
2. **ACC-2** Instrument/TF/type changent sans perte d'état non lié (indicateurs conservés au changement d'instrument, viewport conservé au changement de type).
3. **ACC-3** Chaque outil affiché au rail crée un objet manipulable (test : aucun bouton du rail sans handler).
4. **ACC-4** Un dessin ancré reste à ses coordonnées après zoom, pan, changement de TF et rechargement d'historique (Δ écran = 0 px au retour au range).
5. **ACC-5** Dessins + préférences restaurés après refresh (persistance configurée) ; en mode mock, restaurés via MSW.
6. **ACC-6** Les positions n'apparaissent que fournies par une intégration autorisée ; sans compte → état vide honnête, sans chiffre inventé.
7. **ACC-7** Les overlays affichent les valeurs broker exactes (entry/SL/TP = `brokerPositionSchema`, comparaison de chaînes).
8. **ACC-8** Source de cotation du graphe et broker du compte toujours distingués ; un mismatch déclenche l'avertissement de §12.2.
9. **ACC-9** Feed figé → badge « périmé » ≤ STALE_MS ; les positions ne sont plus présentées comme à jour.
10. **ACC-10** Aucune interaction du module ne soumet/modifie/clôture un ordre : E2E exhaustif des gestes + balayage statique des contrats (aucun endpoint d'exécution n'existe).
11. **ACC-11** Déconnexion/perte de compte : pas de positions périmées présentées comme courantes (teardown vérifié).
12. **ACC-12** Changements d'instrument/unmount : séries, price lines, marqueurs, listeners, timers détruits (heap stable, pas de warning socket).
13. **ACC-13** Chaque indicateur passe ses tests déterministes (valeurs attendues, cas limites).
14. **ACC-14** Toolbarre/panneaux navigables au clavier, focus visible, Échap ordonné, labels présents.
15. **ACC-15** `tsc --noEmit` (shared, web, api) + ESLint + `pnpm build` verts ; 3 thèmes rendus ; probes de régression vertes.

## 22. Risques techniques et décisions non résolues

### 22.1 Risques (classement Critical / High / Medium / Low)

| ID | Risque | Classe | Impact | Atténuation |
|---|---|---|---|---|
| R-1 | Aucun provider de prix réel hors crypto (forex/or/indices CFD en SIM) — la promesse « prix réel » ne tient que pour Binance crypto | **High** | Cœur de la valeur perçue | D-1 (sélection provider) ; en attendant, étiquetage `SIM` honnête + module pleinement fonctionnel sur la couverture actuelle |
| R-2 | MT5 réel absent (provider mock uniquement) — les positions affichées en V1 dev seront SIM | **High** | Cœur V1 (§12) | D-2 (pont MT5) ; UI d'états vides honnêtes ; contrats déjà prêts pour brancher un provider réel |
| R-3 | Le moteur de dessin custom est le plus gros chantier frontend (hit-testing, undo/redo, persistance, edge cases) | High | Budget/qualité | Machine à états unifiée + registre d'outils (§8) ; P0 réduit à 9 outils cœur ; tests géométrie |
| R-4 | Dérive de périmètre UI (boutons décoratifs, promesses TradingView irréalistes) | High | Crédibilité produit | Règle « aucun contrôle sans implémentation » au DoD + ACC-3 + revue par balayage |
| R-5 | Régression du read-only (un geste ou un endpoint futur introduit une exécution) | **Critical** | Sécurité financière utilisateur | Interdiction structurelle (aucun schéma/endpoint/handler), balayage statique T-RO-1, backend = autorité |
| R-6 | Fuites mémoire/perf (souscriptions canvas/WS non nettoyées, re-render par tick) | Medium | Degrade progressive | NFR-5/7/9, tests lifecycle ACC-12, pattern moteur impératif |
| R-7 | Extension des timeframes (D-3) touche un contrat partagé (`marketIntervalSchema`) consommé ailleurs | Medium | Effet de bord | Extension additive (aucune valeur retirée) + tsc sur les 3 apps + vérification des consommateurs existants |
| R-8 | Conflits de concurrence sur les dessins (multi-onglets) | Medium | Perte de données | 409 optimiste + choix « recharger/écraser » (§8.6) |
| R-9 | LW Charts évolue (breaking changes v5→v6) | Low | Maintenance | Frontière moteur unique (§7.4) + version épinglée |
| R-10 | Vitest web/shared ajouté sans approbation (Stack FROZEN) | Low | Conformité projet | D-5 explicitée, décision utilisateur avant chantier tests |

### 22.2 Décisions ouvertes (à trancher avant ou pendant l'implémentation)

| ID | Décision | Options | Recommandation | Bloque |
|---|---|---|---|---|
| D-1 | Provider de données de marché réel multi-classes | (a) rester Binance-crypto + SIM, (b) provider historique/temps réel payant (ex. Dukascopy, Twelve Data, Polygon…), (c) agrégateur | (a) pour la V1, évaluer (b) ensuite avec la grille §10.4 | Prix réel hors crypto (P1) |
| D-2 | Mécanisme d'intégration MT5 | (a) pont terminal local de l'utilisateur (EA/bridge → service), (b) service cloud tiers autorisé (ex. MetaApi), (c) API directe du broker | à valider par preuve de faisabilité (T-VAL-4) — aucune option présumée | Positions réelles (§12 en prod) |
| D-3 | Étendre `marketIntervalSchema` à 3m/2H/1W/1M | (a) oui (Binance natif + SIM à générer), (b) rester à 7 intervalles en V1 | (a) en P1, extension additive | FR-3 complet |
| D-4 | Source du calendrier économique réel | (a) rester mock `/eco-events`, (b) provider (ex. Trading Economics, Finnhub, FMP) | (a) V1 ; (b) évaluée comme D-1 | FR-18 |
| D-5 | Ajouter vitest (+ testing-library) aux apps web/shared | (a) oui, (b) rester sur probes Playwright uniquement | (a) — les calculs financiers exigent des tests unitaires deterministes | §9.3, §19 |
| D-6 | VWAP en V1 | (a) oui si sessions/volume fiables par classe, (b) différer | (b) sauf besoin validé | FR-10 (VWAP) |
| T-VAL-1 | Plafond de pagination (`limit`/`from`-`to`) suffisant pour le backfill au scroll | mesurer en charge réelle | — | FR-5 |
| T-VAL-3 | Le domaine preferences accepte-t-il un payload libre `oryon` ? | vérifier le handler/service existant | sinon → module oryon dédié | FR-16 |
| T-VAL-5 | Comportement LW Charts vérifié sur : thousands separators, timezone custom de l'axe temps, responsive sous 500 px | POC 1 jour au début de l'implémentation | — | §6, §18 |

## 23. Matrice de traçabilité exigences → tests

| Exigence | Tests de vérification | Critère d'échec |
|---|---|---|
| FR-1 | E2E PC-1 ; probe layout (viewport sans shell) | sidebar visible ou défilement parasite |
| FR-2 | E2E recherche → sélection ; test contrat MSW | aucune sélection ou symbole 404 sans message |
| FR-3 | E2E sélecteur TF ; test intervalles servis | bouton TF mort affiché |
| FR-4 | E2E changement de type ; ACC-2 | perte d'indicateurs au changement |
| FR-5 | Perf NFR-4 ; test backfill dédupliqué | doublons de bougies, trou non demandé |
| FR-6 | E2E pan/zoom/reset ; resize 1280→390 | état corrompu, crosshair figé |
| FR-7/FR-8 | Unitaires store+outils ; E2E PC-1 ; ACC-3/4/5 | dessin déplacé après zoom ; perte au refresh |
| FR-9 | E2E outil position (analyse seule) + balayage T-RO | tout effet réseau émis |
| FR-10 | Unitaires indicateurs (§9.3) ; ACC-13 | valeur fausse sur fixture |
| FR-11/FR-15 | E2E PC-2 ; ACC-6/7 | SL/TP ≠ valeurs broker |
| FR-12 | E2E sélecteur compte ; états ERROR/empty | état inventé sans backend |
| FR-13 | Unitaires `position-compat` ; ACC-8 | mismatch sans avertissement |
| FR-14 | E2E PC-3 ; ACC-9 | SIM affiché sans badge ; feed figé non signalé |
| FR-16 | E2E ACC-5 ; test 409 conflit | perte au refresh ; conflit silencieux |
| FR-17 | E2E notification déconnexion | silence sur erreur de synchro |
| FR-18 | E2E rail calendrier (mock) | données sans source affichées comme réelles |
| FR-17bis read-only | T-RO-1 statique + PC-4 + ACC-10 | un seul geste exécutable |
| NFR-1…3 | probes chronométrées | cible dépassée 2 runs consécutifs |
| NFR-5/7/9 | profiling + heap snapshots | re-render par tick ; croissance mémoire |
| ACC-14 | tests accessibilité + parcours clavier | focus invisible, Échap cassé |
| ACC-15 | CI/tâches locales : tsc, eslint, build, probes | toute erreur |

## 24. Plan d'implémentation ordonné (17 étapes)

Dépendances explicites ; « ⛓ D-x » = étape dépendante d'une décision externe (peut être contournée sans bloquer le reste) :

| # | Étape | Dépend de | Parallélisable avec |
|---|---|---|---|
| 1 | Décisions d'architecture finales : validation POC LW Charts v5 (T-VAL-5), arbitrage D-5, choix persistance (T-VAL-3) | — | 2 |
| 2 | Intégration moteur : `chart-engine.ts` + `oryon-chart-panel` + thème canvas tokens | 1 | 3 |
| 3 | Workspace plein écran : route, layout AuthGate, layout 5 zones, sortie, fondations visuelles | — | 2 |
| 4 | Recherche instrument + sélecteur TF + toolbarre (contrôles P0, palette ⌘K) | 3 | 2 |
| 5 | Historique : `useCandlesBackfill`, fusion ticks, validation Zod, états loading/error | 2 | 4 |
| 6 | Navigation viewport : pan/zoom/reset/dernier prix, resize sans corruption | 2, 5 | 7 |
| 7 | Contrats backend : `schemas/oryon.ts`, module NestJS `/oryon/*`, handlers MSW miroir | 1 | 4-6 |
| 8 | Moteur de dessin : store, machine à états, overlay canvas, hit-testing, undo/redo | 2, 6 | 9 |
| 9 | Outils cœur : trendline, horizontale, verticale, ray, canal, rectangle, flèche, texte, Fibonacci retracement | 8 | 10 |
| 10 | Framework d'indicateurs + SMA/EMA/Volume (overlay) | 5, 7 | 8-9 |
| 11 | RSI/MACD/BB/ATR en panes (LW v5) ; ⛓ D-6 VWAP | 10 | 12 |
| 12 | Overlays de positions : price lines + marqueurs + étiquettes, sélection sync panneau bas | 5 | 8-11 |
| 13 | Sync MT5 : ⛓ D-2 pont/provider réel + états de connexion/synchro + compatibilité source (§12.2) | 12 | — |
| 14 | Read-only enforcement complet + garde statique T-RO-1 + états dégradation honnêtes | 12 | 13 |
| 15 | Persistance préférences + dessins (serveur + MSW) + conflits 409 | 7, 9 | 13-14 |
| 16 | Notifications (réutilisation) + calendrier (⛓ D-4) + responsive/accessibilité | 3 | 15 |
| 17 | Perf (NFR §17) + tests complets (§19) + probes régression + vérification DoD (3 thèmes, build, lint) | tout | — |

Chemins critiques : 1 → 2 → 6 → 8 → 9 → 15 (dessins+persistance) et 5 → 12 → 13 → 14 (positions). Les étapes 2-6, 8-11 et 15 peuvent avancer **sans** les décisions externes D-1/D-2/D-4 : le module est livrable de bout en bout en mode mock/SIM, les intégrations réelles se branchent ensuite sans refonte (c'est le rôle des frontières existantes : `MarketDataProvider`, provider Accounts, schémas partagés).

## Annexe A — Faits vérifiés sur le dépôt (base documentaire de la spécification)

Inspection directe du 2026-10-09, HEAD `7213035`, arbre propre, tag de rollback `pre-charty-removal`. Cette annexe tient lieu de rapport d'audit frontend condensé (le cahier de charge exige le dépôt réel comme référence primaire) ; elle distingue faits (avec preuve) et propositions (§14/§15).

### A.1 État et suppression de l'ancien module

- **L'ancien Charty/Session Live est supprimé intégralement** : commit `3f5ba65` « remove Session Live / Charty module entirely (frontend + backend) » — 54 fichiers : route `/session`, 32 composants (`components/charty/`, `components/session/` dont `analysis-chart.tsx` 1 056 lignes), modules API `session-live` + `session` + `broker.controller.ts`, schéma partagé `sessionLive`, queries/mocks/i18n/utils (`drawings`, `indicators`, `chart-state`), scripts de vérification dédiés. **Aucune référence « Charty » active ne subsiste** (navigation, topbar, dashboard re-câblés dans le même commit).
- Le dépôt a été vérifié vert à la suppression : tsc 0 erreur (shared/web/api), eslint 0, build prod OK, 12/12 routes smoke, tag `pre-charty-removal` pour rollback.

### A.2 Infrastructure de données existante (réutilisable par Oryon)

- **market-service** (`mini-services/market-service/index.ts`, Bun, :3003) : REST `/prices`, `/candles` (auth Bearer, plafond 500 / 1000 borné, 502 structuré), `/health` public ; socket.io avec auth au handshake + room `user:<id>` ; broadcast `prices` 750 ms ; **flux privé `positions` SIMULÉ** par utilisateur (source `"sim"`, snapshot idempotent, index.ts:194-321) ; garde de production refusant le secret mock (index.ts:34).
- **Providers de données** : `BinanceProvider` (crypto réel) + `SimulatedProvider` (forex/synthétiques SIM) derrière le contrat `MarketDataProvider` (`providers/types.ts`).
- **Proxys Next** (`apps/web/next.config.ts:27-41`) : `/api/v1/*` → NestJS :4000 (même origine, cookie refresh first-party), `/prices`, `/candles`, `/health`, `/socket.io` → :3003.
- **Client API** (`lib/api/client.ts`) : wrapper fetch typé unique, `ApiError`, 401 → single-flight refresh + 1 retry, télémétrie sans secret ; `endpoints.ts` = source canonique des chemins (partagée client + MSW) ; `mode.ts` : mock par défaut (`NEXT_PUBLIC_API_MOCKED`/`NEXT_PUBLIC_API_LIVE`).
- **Auth** (`lib/auth/`) : access token en mémoire (`token-store`), refresh via cookie HttpOnly `cosmoz_rt` (`refresh.ts`), bus d'événements (`auth-events.ts`) pilotant le cycle de vie du feed WS.
- **Temps réel** (`lib/realtime/market.ts`) : `useLiveQuotes` (phase connecting/live/reconnecting/offline ; transport socket/polling/none ; `STALE_MS` = 8 s), `usePrivatePositions`, `useCandles` (300, refetch 60 s), `useCandlesRange` (1 000 borné), helper `unrealizedPnl`, binding au bus d'auth (rehandshake sur TOKEN_REFRESHED, teardown sur SESSION_EXPIRED/LOGGED_OUT).
- **Module Accounts (API NestJS, apps/api/src/modules/accounts/)** : endpoints `/accounts/providers`, `/accounts/{id}`, `/accounts/{id}/snapshot|positions|orders|deals|connection/test|connection|sync` ; `provider-registry.service.ts`, `credentials-encryption.service.ts`, `trading-sync.service.ts`, rate limiter ; **seul provider implémenté : `mock-trading.provider.ts`** ; interface provider « READ-ONLY BY CONSTRUCTION », sémantiques de session MT5 explicitement réservées (« documented, not speculative », `provider.types.ts`).
- **Schémas partagés** (`packages/shared/src/schemas/`) : `market.ts` (`candleSchema`, `candlesResponseSchema`, `marketIntervalSchema` = 1m|5m|15m|30m|1H|4H|1D, `quoteSourceSchema` = real|sim), `instrument.ts` (symbol, pipSize, digits, contractSize…), `broker.ts` (positions/ordres/snapshot/stream — READ-ONLY, aucun contrat d'exécution), `trading-account.ts` (connectivité Phase 3 : connexion ≠ synchronisation, permissions READ_*), `eco-event.ts`, `alert.ts`.
- **Recherche d'instruments** : `GET /instruments?q=` (`endpoints.ts:26`) + `useInstruments` (`queries/catalogs.ts:20`).
- **Calendrier/notifications** : `GET /eco-events`, `GET /alerts` (`endpoints.ts:85-87`) — données actuellement mock.
- **ECharts** (`components/charts/echart.tsx`) : pont React + `createChartInstance` (cycle de vie hors React, setOption merge par tick) + `bindChartGroup` (sync multi-graphes) — conservé pour Analytics/Trades/Dashboard.

### A.3 Shell, styles, conventions

- Layout authentifié : `(app)/layout.tsx` = `AuthGate > AppShell > DensitySync` ; AppShell = sidebar fixe 240↔72 px, topbar sticky, bottom-nav mobile (`components/layout/app-shell.tsx:33-50`).
- Navigation : `lib/navigation.ts` — `SIDEBAR_ITEMS` (18 entrées, Accounts autonome en tête) + `NAV_SECTIONS` (Trading/Insights/Academy/Tools/System) ; **l'entrée Charty n'existe plus**.
- Règles de style (`AGENTS.md`, applicables à Oryon) : tokens sémantiques uniquement (3 thèmes `[data-theme]` dark-blue/dark/light), zéro hex en dur, JetBrains Mono pour tout chiffre, pas de float sur l'argent (decimal strings + helpers partagés), composants Server par défaut, hooks API uniquement, MSW jamais connu des composants, « Charts: ECharts (analytics) + TradingView Lightweight Charts free version (price charts) », « Specs live in docs/ ».
- i18n : `src/i18n/` (provider + `dictionaries/en.ts` agrégant des namespaces) — l'UI de l'app est en anglais ; Oryon suit la même mécanique (`oryon.ts` proposé).
- Tests : vitest **api uniquement** ; web/shared = tsc strict + eslint + build + probes Playwright (`scripts/probe-regression.js`).
- Dépendances pertinentes (`apps/web/package.json`) : next 16.3.5, react 19.2.8, @tanstack/react-query 5.103, socket.io-client 4.8.3, echarts 6.1.0, zod 3.25, tailwindcss 4, msw 2.15 (dev), sonner, next-themes, lucide-react. **lightweight-charts n'est pas encore installée** (à ajouter lors de l'implémentation, avec approbation « Stack FROZEN »).

### A.4 Vérifications ponctuelles demandées par le cahier de charge

- **Shadow DOM** : `rg attachShadow` sur l'ensemble des sources = **0 résultat** → l'affirmation « Shadow DOM where applicable » du cahier de charge ne correspond à rien d'existant ; aucune décision d'architecture n'en dépend (cf. Annexe B).
- **FastAPI/OCR** : le service Python existe (`mini-services/ocr-service/`, requirements.txt, tests pytest) mais **aucun lien avec le charting** ; le chemin des données de marché est market-service (Bun) → Next → navigateur.
- **Lightweight Charts** (sources officielles vérifiées le 2026-10-09) : dernière version **v5.2.1** ; licence **Apache-2.0** ; v5.0 = API panes multi-panes + système de plugins + API de séries unifiée (migration v4 documentée par TradingView) ; les marqueurs passent par le plugin `createSeriesMarkers`. Réfs : github.com/tradingview/lightweight-charts, tradingview.github.io/lightweight-charts (docs + release notes), tradingview.com/lightweight-charts.

## Annexe B — Corrections apportées au cahier de charge d'origine

| # | Affirmation du cahier de charge | Fait vérifié | Décision de spécification |
|---|---|---|---|
| B-1 | Le module s'appelle « Charty » | Décision utilisateur explicite : **Oryon** | Nommage Oryon partout (route `/oryon`, composants `oryon-*`, module API `oryon`) ; aucune trace « Charty » dans le nouveau code |
| B-2 | « Tailwind CSS, and Shadow DOM where applicable » | Aucun Shadow DOM dans le code (0 `attachShadow`) | Aucune architecture Shadow DOM ; overlays via canvas/DOM réguliers + React ; la question « G » du cahier d'audit (impacts Shadow DOM) est close faute de sujet |
| B-3 | « Microservices: FastAPI, primarily used for OCR » | Exact mais périphérique : `mini-services/ocr-service` (Python) | FastAPI jamais dans le chemin des données de charting (exigence §3 respectée) — le service de marché est Bun :3003 |
| B-4 | « The previous Charty implementation is being removed or has already been removed » | **Déjà supprimée** au commit `3f5ba65` (frontend+backend+mocks), rollback taggé | Spécification écrite pour un terrain vierge ; aucune réutilisation de l'ancien code UI (utils supprimés volontairement) |
| B-5 | Stack « Next.js » (version non précisée) | Next **16.3.5** + React 19 + App Router + Turborepo | Conventions Server/Client Components et route groups respectées (§14) |
| B-6 | Timeframes candidats jusqu'à 1M | Contrat actuel limité à 7 intervalles | FR-3 : sélecteur limité aux intervalles servis ; extension = décision D-3 (backend) |
| B-7 | « Use the frontend audit report » (pré-requis) | L'audit a été réalisé par inspection directe du dépôt à cette occasion (Annexe A, avec chemins et lignes) | Faits séparés des propositions ; rien d'inventé |

