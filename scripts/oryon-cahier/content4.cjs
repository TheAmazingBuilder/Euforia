/** Contenu - partie 4 : sections 11 à 14 (acceptation, risques, questions ouvertes, annexes). */
module.exports = [

  // ── 11. CRITÈRES D'ACCEPTATION ET VÉRIFICATION ──────────────────────────────
  { t: "h1", x: "11. Critères d'acceptation et vérification" },
  { t: "p", x: "La vérification suit la discipline déjà en vigueur dans le projet : une sonde Playwright dédiée au module, les suites de régression existantes re-passées à chaque jalon, et une definition of done explicite. La sonde `verify-oryon.js` couvrira progressivement les jalons : structure et testids (P0), flux de dessin complet avec rechargement persisté et undo/redo (P1), indicateurs avec template par défaut et valeurs contre séries de référence (P2), layouts, watchlist, mobile 390 px, thème clair (P3). Cible indicative : au moins 30 vérifications à la fin de P3, avec zéro erreur de page et zéro réponse HTTP ≥ 400 inattendue." },
  { t: "ol", ref: "list-verif", items: [
    "**Préparer l'infrastructure** - après tout redémarrage de sandbox : `bun install` puis `bun index.ts` dans `mini-services/market-service`, service :3003 vivant (leçon de la section 5.4).",
    "**Construire et servir** - build de production validé, serveur démarré, stamp de build vérifié en bas à gauche de la preview.",
    "**Exécuter la sonde du jalon** - verify-oryon au niveau du jalon courant, toutes vérifications vertes, captures bureau / mobile 390 px / thème clair produites.",
    "**Passer les régressions** - suites du projet re-passées au vert (chiffres en vigueur au 10 octobre 2026 : recognition 51/51, tools 37/37, events 48/48, tasky 33/33, shell 10/10, profile 59/59, rebrand 17/17).",
    "**Revue lecture seule (RNF-06)** - recherche statique du diff : aucune référence à un endpoint d'ordre, aucune UI de passage, modification ou clôture.",
    "**Clôturer** - tsc 0, ESLint 0 erreur, commit, entrée au `worklog.md` avec les preuves chiffrées.",
  ]},
  { t: "p", x: "Les critères de performance sont mesurés par la sonde et non à l'œil : absence de long task supérieure à 150 ms pendant zoom, pan et dessin (RNF-01), débordement horizontal mesuré à 0 px en 390 px (RNF-02), et chargement de la bibliothèque graphique dans un chunk séparé constaté dans la sortie de build. Ces mesures font partie des critères de sortie des jalons, pas d'un supplément facultatif." },

  // ── 12. RISQUES ET MITIGATIONS ──────────────────────────────────────────────
  { t: "h1", x: "12. Risques et mitigations" },
  { t: "p", x: "Les risques sont évalués en probabilité et impact, avec une mitigation explicite pour chacun. Aucun d'entre eux n'est une découverte : ils proviennent soit des limites documentées de la bibliothèque proposée, soit des leçons d'exploitation du projet (section 5.4), soit de l'audit de l'ancienne implémentation." },
  { t: "table", caption: "Tableau 7 - Registre des risques", headers: ["Risque", "Prob.", "Impact", "Mitigation"], widths: [40, 10, 10, 40], rows: [
    ["Lightweight Charts n'est pas clé en main : ni dessin, ni indicateurs intégrés", "Certaine", "Moyen", "Limite connue et assumée dès ce document ; couche de dessin propriétaire spécifiée (§8.2) ; jalon P1 dimensionné en conséquence"],
    ["API v5 (panes, séries) à confirmer à l'implémentation", "Moyenne", "Faible", "Version épinglée au lockfile ; documentation officielle en annexe A ; POC en tête de P0 avec décision documentée"],
    ["Divergence entre la bougie fusionnée au tick et le refetch de 60 s", "Moyenne", "Moyen", "Le refetch ré-synchronise systématiquement (le serveur reste la source de vérité) ; useTickMerge testé unitairement (cas haut/bas/volume/re-tracé)"],
    ["Erreurs de flux silencieuses rendant les sondes aveugles (leçon V1)", "Moyenne", "Élevé", "RNF-08 : états testidés explicites, télémétrie exposée, sonde qui asserte les états d'erreur au lieu du contenu"],
    ["Dérive de périmètre (replay, alertes, tentatives d'ordre)", "Moyenne", "Élevé", "RF-10 en Could soumis à arbitrage (§13) ; contrainte lecture seule vérifiée par revue de diff à chaque jalon (RNF-06)"],
    ["Dessins décalés lors des changements d'unité de temps ou de zoom", "Élevée", "Moyen", "Ancrage systématique dans le domaine temps+prix ; cas limites couverts par tests (changement d'UT, rechargement, données manquantes aux bornes)"],
    ["Performance dégradée en multi-chart 4×", "Moyenne", "Moyen", "Instanciation séparée par graphique, import dynamique, budget long tasks vérifié par la sonde à P3"],
    ["Market-service mort après un redémarrage de sandbox (diagnostic erroné)", "Élevée", "Faible", "dev.sh corrigé (bun install au démarrage) ; réflexe documenté §5.4 et rappelé en tête du protocole de vérification (§11)"],
  ]},

  // ── 13. QUESTIONS OUVERTES À ARBITRER ───────────────────────────────────────
  { t: "h1", x: "13. Questions ouvertes à arbitrer" },
  { t: "p", x: "Sept questions restent ouvertes et relèvent de l'arbitrage du propriétaire du produit. Pour chacune, les options et une recommandation argumentée sont proposées ; la recommandation est un point de départ, pas une décision. Tant qu'une question n'est pas arbitrée, elle ne bloque pas le jalon P0 sauf mention contraire." },
  { t: "table", caption: "Tableau 8 - Questions ouvertes et recommandations", headers: ["N°", "Question", "Options", "Recommandation"], widths: [7, 30, 33, 30], rows: [
    ["Q1", "Route et nom technique du module", "/oryon, ou un autre chemin", "/oryon - cohérent avec le nom définitif « Oryon » et les conventions du routeur existant"],
    ["Q2", "Replay d'une fenêtre passée en V1 ?", "Reporter (COULD) ; inclure au P3", "Reporter - useCandlesRange existe déjà, le besoin est réel mais non critique pour l'analyse ; réévalué après P2"],
    ["Q3", "Watchlist en V1 ?", "P3 (SHOULD) ; reporter", "P3 - la couche de données (useLiveQuotes) est déjà là ; la valeur utilisateur est immédiate et l'effort modéré"],
    ["Q4", "Position de l'entrée dans la section TRADING", "Après Trades ; en fin de section", "Après Trades - Oryon est un outil d'analyse de marché, compagnon naturel du journal d'exécution"],
    ["Q5", "Gestion de l'état d'interface", "Hooks locaux + stockage local ; bibliothèque d'état globale", "Hooks locaux + stockage local - aucun besoin de partage inter-modules démontré ; réévaluer si un besoin réel apparaît"],
    ["Q6", "Orphelins backend Session Live (API /session-live/*, deep-link nofy)", "Suppression à une passe backend dédiée ; conservation documentée", "Suppression à la passe backend dédiée - code mort connu, aucun consommateur frontend depuis le retrait du 9 octobre"],
    ["Q7", "Migration des anciens dessins (clé cosmoz.session-live.chart.v1)", "Pas de migration, clé nouvelle ; migration avec validation Zod", "Pas de migration - données non validées, format ancien, valeur incertaine ; la clé `euforia.oryon.drawings.v1` repart propre"],
  ]},

  // ── 14. ANNEXES ─────────────────────────────────────────────────────────────
  { t: "h1", x: "14. Annexes" },
  { t: "h2", x: "14.1 Références officielles" },
  { t: "p", x: "Les références ci-dessous sont les sources officielles des bibliothèques et outils mentionnés ; elles ont été consultées lors de la préparation du présent document et devront être re-vérifiées au moment de l'implémentation, en particulier pour la branche v5 de Lightweight Charts (panes, options de séries) et pour la version exacte à épingler." },
  { t: "ul", x: "", items: [
    "**TradingView Lightweight Charts** - documentation officielle : https://tradingview.github.io/lightweight-charts/ ; dépôt GitHub (licence Apache-2.0) : https://github.com/tradingview/lightweight-charts",
    "**ECharts** - documentation officielle : https://echarts.apache.org/ (usage actuel du projet : 7 fichiers, inchangés)",
    "**socket.io** - documentation client v4 : https://socket.io/docs/v4/ (transport de la couche temps réel)",
    "**TanStack React Query** - documentation : https://tanstack.com/query/latest (état serveur)",
    "**Zod** - documentation : https://zod.dev (contrats partagés et validation du stockage local)",
  ]},
  { t: "h2", x: "14.2 Glossaire" },
  { t: "table", caption: "Tableau 9 - Glossaire", headers: ["Terme", "Définition dans le présent document"], widths: [24, 76], rows: [
    ["OHLCV", "Ouverture, plus haut, plus bas, clôture, volume d'une bougie - structure du contrat Candle partagé"],
    ["Unité de temps (interval)", "Granularité des bougies ; les 7 valeurs du contrat MarketInterval : 1m, 5m, 15m, 30m, 1H, 4H, 1D"],
    ["Phase de flux", "État de la couche temps réel : connecting, live, reconnecting, offline ; la péremption (8 s sans tick) rend le flux visuellement STALE"],
    ["SIM", "Étiquette obligatoire de toute donnée simulée - règle produit : présenter du simulé comme du réel est un mensonge interdit"],
    ["Overlay de dessin", "Couche d'interaction superposée au graphique pour les outils de dessin (hit-testing, ancres, déplacement), distincte du rendu des bougies"],
    ["Panneau (pane)", "Sous-graphique vertical (volume, RSI) ; la branche v5 de Lightweight Charts introduit cette notion - à confirmer à l'implémentation"],
    ["MoSCoW", "Priorisation Must / Should / Could / Won't utilisée dans le registre des exigences (section 6)"],
    ["Sonde", "Script Playwright de vérification automatisée dédié à un module, produisant des vérifications chiffrées et des captures"],
    ["MSW", "Mock Service Worker - infrastructure de mocks des surfaces API, avec store de mocks central (mocks/store.ts)"],
    ["Zod", "Bibliothèque de validation de schémas, partagée entre frontend, API et mini-services (packages/shared)"],
  ]},
  { t: "h2", x: "14.3 Traçabilité des faits" },
  { t: "p", x: "Les faits techniques du présent document ont été vérifiés dans le dépôt le 10 octobre 2026, sur l'état `b9f52fa` (branche `main`, arbre propre) : hooks et constantes de `apps/web/src/lib/realtime/market.ts`, surface du `mini-services/market-service` (`index.ts` et fournisseurs), `useBrokerSession` (`apps/web/src/lib/api/queries/broker.ts`), contrats `packages/shared/src/schemas/market.ts`, design tokens `apps/web/src/app/globals.css`, dépendances `apps/web/package.json` et navigation `apps/web/src/lib/navigation.ts`. Le retrait du module Session Live est documenté par le commit `079a8e0` et son entrée de journal `b9f52fa` du 9 octobre 2026 (29 fichiers, tsc 0, ESLint 0, build OK). L'audit forensique antérieur, mené le même jour, avait établi qu'aucun code « Oryon » n'avait jamais été commité. Les chiffres de sondes cités (51/51, 37/37, 48/48, 33/33, 10/10, 59/59, 17/17) sont ceux en vigueur au 10 octobre 2026, journalisés dans `worklog.md`." },
];
