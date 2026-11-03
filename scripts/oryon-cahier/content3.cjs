/** Contenu - partie 3 : sections 8 à 10 (architecture proposée, intégrations, phasage). */
module.exports = [

  // ── 8. ARCHITECTURE TECHNIQUE PROPOSÉE ──────────────────────────────────────
  { t: "h1", x: "8. Architecture technique proposée" },
  { t: "p", x: "Tout ce qui suit est explicitement une **proposition** : elle est motivée, mais ne devient une décision qu'après validation du propriétaire. La proposition s'appuie exclusivement sur l'état des lieux vérifié de la section 5 et vise deux qualités : ne rien réécrire qui soit déjà éprouvé (couche de données, contrats, design system), et corriger les lacunes documentées plutôt que les réimporter." },

  { t: "h2", x: "8.1 Bibliothèque graphique - proposition : TradingView Lightweight Charts" },
  { t: "p", x: "La bibliothèque proposée est **TradingView Lightweight Charts** (dépôt GitHub `tradingview/lightweight-charts`, licence Apache-2.0, maintenance active par TradingView). Elle est spécialisée chandeliers et données de marché : rendu canvas dédié OHLC, échelle de temps et de prix outillées, crosshair intégrée, séries chandeliers/ligne/aire/histogramme, empreinte légère. Ses limites sont connues et assumées : elle n'embarque ni outils de dessin, ni indicateurs prêts à l'emploi (les séries d'indicateurs sont calculées puis fournies par le code applicatif), et la branche v5 introduit la notion de panneaux (panes) pour loger des sous-graphiques - point à re-vérifier contre la documentation officielle (annexe A) au moment de l'implémentation, avec version épinglée dans le lockfile." },
  { t: "table", caption: "Tableau 5 - Comparatif des bibliothèques candidates", headers: ["Critère", "TradingView Lightweight Charts (proposée)", "ECharts (déjà dépendance)"], widths: [24, 39, 37], rows: [
    ["Spécialisation OHLC", "Conçue pour les chandeliers : échelles, crosshair, légendes temps de marché", "Série candlestick générique ; ergonomie trading moins outillée (échelle de temps à composer)"],
    ["Empreinte", "Légère (quelques dizaines de Ko gzip), chargée en chunk dédié", "Plus lourde ; déjà présente pour 7 usages hors graphiques de marché"],
    ["Outils de dessin", "Aucun → couche de dessin propriétaire spécifiée (§8.2)", "Aucun intégré non plus pour ce besoin"],
    ["Indicateurs", "Aucun prêt à l'emploi → séries dérivées fournies par le code", "Aucun prêt à l'emploi pour ce besoin"],
    ["Maintenance", "Active, éditeur spécialisé du domaine, documentation officielle complète", "Active, périmètre généraliste très large"],
    ["Intégration au projet", "Une dépendance nouvelle, épinglée ; aucun impact sur les 7 usages ECharts existants", "Zéro dépendance nouvelle, mais adaptation trading à assumer durablement"],
  ]},
  { t: "p", x: "Recommandation : retenir Lightweight Charts pour le graphique de prix d'Oryon. Le critère décisif est la spécialisation OHLC : les primitives de temps de marché (échelle, crosshair, pan/zoom) sont le socle de tout le reste, et les réécrire sur une bibliothèque généraliste coûterait plus que l'ajout d'une dépendance spécialisée. ECharts n'est ni retirée ni réutilisée pour Oryon ; ses sept usages actuels (tableau de bord, analytics, trades) restent inchangés." },

  { t: "h2", x: "8.2 Arborescence de composants proposée" },
  { t: "p", x: "La structure proposée suit les conventions existantes du client web : une page de route, une vue coordinatrice, des composants de domaine sous un dossier dédié, des hooks réutilisables et des utilitaires purs. Aucun composant n'est repris de l'ancienne station : la reconstruction part d'une page vierge, en réutilisant uniquement les hooks de données et les primitives d'interface (shadcn/ui, tokens)." },
  { t: "ul", x: "", items: [
    "**Route et vue** - `app/(app)/oryon/page.tsx` et `oryon-view.tsx` : coquille du module (layout, états de chargement/erreur explicites, en-tête de module standard), alignée sur le pattern des autres vues.",
    "**Graphique** - `chart-container.tsx` : création et mise à jour des séries, application des tokens de thème, ResizeObserver ; `multi-chart-grid.tsx` pour les layouts 1/2/4 (P3).",
    "**Dessin** - `drawing-layer.tsx` (overlay d'interaction : hit-testing, ancres, déplacement), `drawing-toolbar.tsx` (armement des outils), `drawing-list.tsx` (liste d'objets : sélection, verrouillage, masquage, styles).",
    "**Marché** - `symbol-picker.tsx` (recherche), `timeframe-chips.tsx` (7 unités), `feed-status-badge.tsx` (phase du flux + badge SIM).",
    "**Indicateurs** - `indicator-panel.tsx` : liste, ajout/retrait, paramètres éditables (P2).",
    "**Watchlist** - `watchlist-panel.tsx` : symboles suivis et cotations live (P3).",
  ]},
  { t: "p", x: "Les composants vivraient sous `apps/web/src/components/oryon/`, les hooks sous `apps/web/src/hooks/oryon/` (ou `lib/oryon/` si la convention des utilitaires purs le suggère au moment du code), et les chaînes dans `dictionaries/en/oryon.ts`. Les testids suivent la convention existante (`oryon-chart`, `oryon-toolbar`, `oryon-drawing-list`, etc.) et sont figés dès P0 pour que les sondes n'aient jamais à les deviner." },

  { t: "h2", x: "8.3 Hooks et gestion d'état proposés" },
  { t: "p", x: "La couche de données est réutilisée telle quelle : `useCandles` et `useCandlesRange` pour l'historique, `useLiveQuotes`/`useLiveQuote` et `useFeedStatus` pour le flux, `usePrivatePositions` pour les positions en lecture - aucun fork, aucune copie. Trois hooks propriétaires complètent l'ensemble, chacun testable isolément." },
  { t: "ul", x: "", items: [
    "**useTickMerge** - fusion du tick live dans la dernière bougie entre deux refetchs (haut/bas étendus, clôture et volume mis à jour), avec re-synchronisation systématique au refetch (le serveur reste la source de vérité). Remplace la logique qui vivait dans le composant PriceChart supprimé ; testé unitairement.",
    "**useDrawings** - réducteur d'état des dessins : ajout, sélection, déplacement, édition d'ancres, style, verrouillage, masquage, suppression, undo/redo multi-niveaux (≥ 50), avec persistance par symbole débouncée et validation Zod au chargement.",
    "**useIndicators** - configuration des indicateurs et production des séries dérivées par des fonctions pures mémoïsées (recalcul uniquement sur nouvelle bougie close ou changement de configuration).",
  ]},
  { t: "p", x: "Pour l'état d'interface, la proposition est volontairement sobre : hooks React locaux et stockage local pour les préférences du module, React Query pour l'état serveur. Aucune bibliothèque d'état global nouvelle n'est introduite tant qu'aucun besoin de partage inter-modules n'est démontré - le store existant du projet est l'infrastructure de mocks MSW, pas un état applicatif." },

  { t: "h2", x: "8.4 Schémas Zod partagés proposés" },
  { t: "p", x: "Les contrats du module vivraient dans `packages/shared/src/schemas/oryon.ts`, à côté des schémas existants : `drawingTypeSchema` (énumération des 8 types V2), `drawingSchema` (identifiant, type, ancres temps+prix, couleur, épaisseur, style de trait, verrouillé, masqué, texte optionnel), `drawingsFileSchema` (champ `version` à 1, symbole, liste de dessins), `indicatorConfigSchema` et `chartLayoutSchema`. Le champ de version permet les migrations futures sans ambiguïté ; le chargement passe systématiquement par `safeParse`, et toute donnée invalide est abandonnée avec un avertissement, jamais rendue telle quelle (exigence RF-09)." },

  { t: "h2", x: "8.5 Évaluation Shadow DOM" },
  { t: "p", x: "La question a été posée d'isoler l'overlay de dessin dans un Shadow DOM. Les bénéfices attendus sont réels (encapsulation des styles, protection contre les fuites) mais les coûts le sont aussi : re-bridge des événements pointeur à travers la frontière, réinjection des tokens de thème dans le shadow root, et outillage de sonde sensiblement plus complexe (le querySelector doit traverser les racines shadow). La recommandation préliminaire est de **ne pas** utiliser de Shadow DOM en V1 : l'overlay vit dans l'arbre React standard avec des classes préfixées par convention (`oryon-*`), les tokens étant déjà cloisonnés par variables CSS dans l'application. Ce choix sera réévalué uniquement si un conflit de styles réel est constaté - décision à reconfirmer au lancement de P1." },

  { t: "h2", x: "8.6 Backend - rien de bloquant" },
  { t: "p", x: "Aucune évolution backend n'est un prérequis de la V1 : le market-service fournit déjà bougies, cotations et positions, et la lecture broker est branchée. Deux évolutions sont souhaitables mais non bloquantes, à planifier avec l'équipe backend quand le besoin se confirme : une pagination de `/candles` au-delà de 1 000 bougies pour les fenêtres longues, et un catalogue de symboles exposé explicitement (aujourd'hui implicite, porté par la méthode `handles()` de chaque fournisseur)." },

  // ── 9. INTÉGRATIONS ET DÉPENDANCES ──────────────────────────────────────────
  { t: "h1", x: "9. Intégrations et dépendances" },
  { t: "h2", x: "9.1 Service de marché (:3003)" },
  { t: "p", x: "Les contrats du market-service sont verrouillés et décrits en section 5.1 : REST `/prices`, `/candles`, `/health`, socket.io « prices » (750 ms) et « positions » (room privée), authentification par jeton d'accès, fournisseurs Binance (réel) et simulé (étiqueté SIM). Oryon les consomme via la couche `lib/realtime/market.ts` sans évolution du service. La règle d'honnêteté du contrat partagé s'applique intégralement : toute donnée simulée est étiquetée SIM dans l'interface." },
  { t: "h2", x: "9.2 API NestJS" },
  { t: "p", x: "La seule consommation API de la V1 est la lecture broker existante (`useBrokerSession`, GET /broker/session, polling 15 s), déjà conçue comme monitoring en lecture seule avec états NOT_CONFIGURED/ERROR rendus honnêtement. Les orphelins backend du module Session Live (`apps/api/src/modules/session-live`, deep-link nofy `nofy.service.ts:241`) ne sont pas consommés par Oryon ; leur traitement - suppression ou réaffectation - est une passe backend séparée, à arbitrer en section 13 (Q6)." },
  { t: "h2", x: "9.3 MT5 - hors périmètre V1" },
  { t: "p", x: "La synchronisation MT5 est explicitement hors périmètre de la V1 et relève du long terme. Les contrats broker existants (lecture seule) constituent le point d'ancrage naturel d'une future intégration, mais toute évolution vers la synchronisation de compte ou d'exécution fera l'objet d'un avenant au présent document, avec sa propre analyse de risques - en particulier au regard de la contrainte cardinale de lecture seule." },
  { t: "h2", x: "9.4 Dépendances nouvelles" },
  { t: "p", x: "Une seule dépendance nouvelle est prévue : `lightweight-charts`, épinglée exactement dans le lockfile pnpm dès son ajout. Rien d'autre n'est nécessaire : Zod, React Query, Tailwind, shadcn/ui et l'outillage de sondes sont déjà en place. L'impact sur le bundle est maîtrisé par un import dynamique de la bibliothèque (exigence RNF-01), la page Oryon ne la chargeant qu'à la première visite du module." },

  // ── 10. PHASAGE ET JALONS ───────────────────────────────────────────────────
  { t: "h1", x: "10. Phasage et jalons" },
  { t: "p", x: "La réalisation est séquencée en quatre jalons, chacun assorti de critères de sortie objectifs et vérifiables. Un jalon n'est terminé que lorsque tous ses critères sont constatés, avec tsc et ESLint à zéro erreur, un build validé, un commit et une entrée au journal de travail. L'ordre est volontairement du plus risqué au plus confortable : le socle graphique valide d'abord la bibliothèque, le dessin ensuite parce qu'il concentre l'effort propriétaire, les indicateurs enfin parce qu'ils reposent sur le socle." },
  { t: "table", caption: "Tableau 6 - Jalons et critères de sortie", headers: ["Jalon", "Contenu", "Critères de sortie"], widths: [16, 42, 42], rows: [
    ["P0 - Socle graphique", "Route /oryon + navigation + en-tête ; graphique chandeliers thématisé ; symbole + unité de temps ; flux live avec fusion du tick ; statut du flux et badge SIM ; deep-link symbole ; réglages graphique reconnectés", "Sonde P0 verte (structure, états, testids) ; tsc 0 ; ESLint 0 ; build OK ; régressions vertes ; POC bibliothèque concluant (panes v5 confirmés ou contournement décidé)"],
    ["P1 - Dessin V2", "Barre d'outils ; 8 types (7 V1 + VLINE) ; sélection, déplacement, édition d'ancres, styles, verrouillage, masquage ; liste d'objets ; undo/redo ≥ 50 niveaux ; persistance Zod versionnée", "Sonde P1 verte (flux de dessin complet, rechargement persisté, undo/redo) ; tests unitaires géométrie et persistance ; revue lecture seule (RNF-06)"],
    ["P2 - Indicateurs", "Template par défaut volume + RSI(14) ; EMA/SMA, MACD, Bandes de Bollinger, ATR ; sous-panneaux ; paramétrage éditable", "Sonde P2 verte (template par défaut, ajout/retrait, paramètres) ; tests unitaires des calculs contre séries de référence ; recalcul mémoïsé constaté"],
    ["P3 - Confort", "Grille multi-chart 1/2/4 avec crosshair synchronisée en option ; watchlist ; polish responsive, thèmes, accessibilité", "Sonde P3 verte (390 px overflow 0, thème clair, layouts) ; toutes suites vertes ; revue finale lecture seule"],
  ]},
  { t: "p", x: "Chaque jalon se conclut par la même ritournelle de livraison, éprouvée dans le projet : vérifications automatisées, captures d'écran (bureau, mobile 390 px, thème clair), commit, entrée au `worklog.md`. Aucun jalon ne démarre tant que le précédent n'a pas ses critères de sortie constatés - c'est la condition du sequencing risqué d'abord." },
];
