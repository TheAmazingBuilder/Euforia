import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * FR dictionary — ACADEMY namespace. Must mirror en/academy.ts exactly
 * (key structure compile-checked through the Dictionary type at fr.ts).
 * Professionnel, vouvoiement ; vocabulaire pédagogique (« leçon »,
 * « quiz », « fiche », « examen », « progression ») traduit ; les termes
 * trading (« trade », « breakout », « drawdown », « range », « edge »)
 * restent standards — on ne traduit que les mots qui les entourent. Les
 * CONTENUS servis par l'API (corps des leçons, questions de quiz,
 * définitions du glossaire, titres de cours/leçons, fiches, exercices du
 * moteur) sont des DONNÉES et ne font PAS partie du dictionnaire.
 */
export const academyDict = {
  /** Fragments réutilisés par plusieurs composants de l'Académie. */
  shared: {
    // Libellés des énumérations de niveau (academy-shared.tsx).
    levels: {
      BEGINNER: "Débutant",
      INTERMEDIATE: "Intermédiaire",
      ADVANCED: "Avancé",
    },
    // aria-label par défaut de la barre de progression.
    progressAria: "Progression",
    // Suffixe aria « <entité> progression » (composé avec le titre).
    progressSuffix: " — progression",
    // Chrome commun au quiz de leçon et aux examens.
    true: "Vrai",
    false: "Faux",
    correct: "correct",
    missed: "manqué",
    saving: "Enregistrement…",
    minSuffix: " min",
  },

  // ── Coquille de la vue (academy-view.tsx) ────────────────────────────────
  view: {
    title: "Académie",
    subtitle:
      "Apprendre → pratiquer → trader → documenter → analyser → apprendre à nouveau. Le curriculum derrière le journal : cours structurés, exercices, quiz et un glossaire consultable — des fondamentaux du marché à l'exécution avancée.",
    tabs: {
      overview: "Vue d'ensemble",
      courses: "Cours",
      practice: "Entraînement",
      progress: "Progression",
      glossary: "Glossaire",
      bookmarks: "Favoris",
    },
    // Pastilles d'en-tête (série + complétion globale).
    streakTitle: "Jours consécutifs avec une activité d'apprentissage",
    streakUnit: "j",
    streak: "série",
    overall: "global",
  },

  // ── Tableau de bord (academy-overview.tsx) ───────────────────────────────
  overview: {
    // Bande « continuer l'apprentissage ».
    continueAria: "Continuer l'apprentissage",
    continueTitle: "Continuer l'apprentissage",
    lessonWord: "leçon",
    continueLesson: "Continuer la leçon",
    course: "Cours",
    curriculumComplete: "Le curriculum est terminé. Plus rien à reprendre — respect.",
    keepDrillsSharp: "Gardez la main sur les exercices",
    resumeTitle: "Reprenez où vous vous êtes arrêté",
    resume: "Reprendre",
    // Bande de statistiques.
    progressAria: "Votre progression",
    progressTitle: "Votre progression",
    overallProgress: "Progression globale",
    of: "sur",
    lessonsWord: "leçons",
    across: "à travers",
    coursesWord: "cours",
    streakLabel: "Série d'apprentissage",
    days: "jours",
    longest: "Record",
    activeToday: "Actif aujourd'hui — la boucle continue.",
    noActivityToday: "Aucune activité aujourd'hui.",
    coursesCompleted: "Cours terminés",
    lessonsCompleted: "Leçons terminées",
    quizAverage: "Moyenne des quiz",
    drillAccuracy: "Précision des exercices",
    // Plan hebdomadaire.
    weeklyAria: "Le plan de la semaine",
    weeklyTitle: "Cette semaine — leçons · exercices · quiz",
    weekComplete: "plan hebdomadaire terminé",
    weekOfPrefix: "semaine du ",
    rowLessons: "Leçons",
    rowDrills: "Exercices",
    rowQuizzes: "Quiz",
    shortOnDrills: "À court d'exercices ? La zone d'entraînement est à un clic →",
    // Recommandations.
    recommendedAria: "Recommandé pour vous",
    recommendedTitle: "Recommandé pour vous",
    recommendationsEmpty: "Tous les cours sont terminés — le curriculum vous salue. Revoyez les exercices pour rester affûté.",
    // Activité récente.
    recentAria: "Terminé récemment",
    recentTitle: "Terminé récemment",
    recentEmpty: "Rien pour l'instant — terminez votre première leçon et elle apparaîtra ici.",
    // Bande des favoris.
    bookmarksAria: "Mes favoris",
    bookmarksTitle: "Mes favoris",
    viewAll: "Tout afficher",
    bookmarksEmpty: "Ajoutez des leçons et des termes du glossaire aux favoris avec le bouton étoile — ils vous attendront ici.",
    // Destinations rapides.
    quickAria: "Entraînement et glossaire",
    quickTitle: "Gardez la boucle en mouvement",
    practiceDrills: "Exercices pratiques",
    practiceDrillsDesc: "Identification de figures et laboratoire des chandeliers",
    glossaryCard: "Glossaire",
    glossaryCardDesc: "Vocabulaire trading consultable",
    // Suggestions journal → Académie.
    journalAria: "Depuis votre journal",
    journalTitle: "Depuis votre journal",
    journalDesc: "Schémas que l'Académie a remarqués dans vos trades clôturés — chaque suggestion mène au parcours qui la traite.",
    startLesson: "commencer la leçon",
    preferCoursePrefix: "Plutôt la vue complète du cours ? Ouvrir ",
    preferCourseSuffix: " →",
    // Carte des catégories.
    categoryMapAria: "Explorer les catégories",
    categoryMapTitle: "Explorer les catégories",
    coursesMid: " cours · ",
    lessonsSuffix: " leçons",
    doneSuffix: " · terminé",
  },

  // ── Cours : catalogue, filtres, recherche, détail (academy-courses.tsx) ──
  courses: {
    // Champ de recherche.
    searchPlaceholder: "Rechercher cours, leçons, notions… (p. ex. breakout, drawdown)",
    searchAria: "Rechercher dans l'Académie",
    clearSearch: "Effacer la recherche",
    // Filtres.
    allCategories: "Toutes les catégories",
    allLevels: "Tous les niveaux",
    status: {
      ALL: "Tous les statuts",
      IN_PROGRESS: "En cours",
      COMPLETED: "Terminé",
      NOT_STARTED: "Non commencé",
    },
    duration: {
      ALL: "Toutes durées",
      SHORT: "Moins de 60 min",
      MEDIUM: "60–120 min",
      LONG: "120+ min",
    },
    sortLabel: "Trier",
    sortAria: "Trier les cours",
    sort: {
      curriculum: "Ordre du curriculum",
      shortest: "Plus courts d'abord",
      longest: "Plus longs d'abord",
      progress: "Plus avancés",
    },
    // Parcours d'apprentissage.
    pathsAria: "Parcours d'apprentissage",
    pathsTitle: "Parcours d'apprentissage",
    coursesSuffix: " cours",
    // Grille du catalogue + cartes de cours.
    noMatch: "Aucun cours ne correspond à ces filtres.",
    done: "Terminé",
    quizWord: "quiz",
    quizScorePrefix: "quiz ",
    lessonsSuffix: " leçons",
    // Résultats de recherche.
    noResultsPrefix: "Aucun résultat pour « ",
    noResultsSuffix: " ». Essayez un terme plus large — le glossaire couvre aussi les définitions.",
    matchingCoursesAria: "Cours correspondants",
    matchingLessonsAria: "Leçons correspondantes",
    matchingGlossaryAria: "Termes du glossaire correspondants",
    coursesTitle: "Cours",
    lessonsTitle: "Leçons",
    glossaryTitle: "Glossaire",
    // Détail du cours.
    loadError: "Impossible de charger ce cours.",
    backToCatalog: "Retour au catalogue",
    allCourses: "Tous les cours",
    completedBadge: "Terminé",
    objectivesAria: "Objectifs du cours",
    objectivesTitle: "Après ce cours, vous serez capable de",
    lessonsAria: "Leçons",
    // Section quiz du cours.
    quizAria: "Quiz du cours",
    quizTitle: "Quiz du cours",
    quizDesc: "Vérifiez votre compréhension — quelques questions, notées avec explications. Seul votre meilleur score est conservé.",
    hideQuiz: "Masquer le quiz",
    takeQuiz: "Passer le quiz",
  },

  // ── Lecteur de leçon, quiz, point de contrôle, notes, SOMMAIRE (academy-lesson.tsx) ──
  lesson: {
    // Toast « note créée » de Nofy (action Prendre des notes).
    nofyToast: "Note créée dans Nofy.",
    // Libellés du sommaire (dérivés du document de blocs).
    tocObjectives: "Objectifs",
    tocCheckpoint: "Vérification rapide",
    tocTable: "Tableau de référence",
    tocChart: "Lecture de graphique",
    tocTakeaways: "Points clés",
    tocQuiz: "Quiz du cours",
    // Chrome du lecteur.
    loadError: "Impossible de charger cette leçon.",
    back: "Retour",
    breadcrumbPrefix: "Leçon ",
    categoryFallback: "Cours",
    completedChip: "terminée",
    takeNotes: "Prendre des notes",
    takeNotesAria: "Prendre des notes sur cette leçon dans Nofy",
    bookmark: "Favori",
    bookmarked: "Ajouté aux favoris",
    // Complétion + précédent/suivant.
    markComplete: "Marquer la leçon comme terminée",
    lessonCompleted: "Leçon terminée",
    nextLesson: "Leçon suivante",
    previous: "Précédent",
    next: "Suivant",
    // Rail du sommaire.
    tocAria: "Sur cette page",
    tocTitle: "Sur cette page",
    sectionsOfPrefix: "Sections de ",
    // Point de contrôle en cours de leçon.
    checkpointAria: "Point de contrôle de compréhension",
    checkpointTitle: "Vérification rapide — avez-vous bien retenu ?",
    checkAnswer: "Vérifier la réponse",
    // Notes personnelles.
    notesAria: "Vos notes",
    notesTitle: "Vos notes",
    savedPrefix: "Enregistré à ",
    autosaves: "Enregistrement automatique pendant la saisie",
    notesPlaceholder: "Qu'est-ce qui a fait « clic » ? Que voulez-vous retenir avant le quiz — ou avant votre prochaine session ?",
    notesInputAria: "Notes de la leçon",
    // Encart quiz inline.
    quizAvailable: "Quiz du cours disponible",
    quizAvailableDesc: "Quelques questions avec explications — notées côté serveur, seul votre meilleur score est conservé.",
    startQuiz: "Commencer le quiz",
    backToCourse: "Retour au cours",
    // Quiz du cours.
    correctSuffix: " bonnes réponses",
    passed: "Score parfait — le concept est à vous.",
    previousBestPrefix: "Meilleur score précédent : ",
    previousBestSuffix: ". Seul le meilleur score est conservé.",
    failedHint: "Revoyez les explications, puis recommencez — seul le meilleur score est conservé.",
    retake: "Recommencer",
    close: "Fermer",
    quizHeadingSuffix: " — quiz · ",
    answeredSuffix: " répondues",
    submitAnswers: "Envoyer les réponses",
    gradedServerNote: "Noté côté serveur — les réponses ne quittent jamais le moteur sans correction.",
  },

  // ── Rendu des blocs de leçon (lesson-blocks.tsx) ─────────────────────────
  blocks: {
    // Libellés de repli des tons d'encart (block.title les remplace).
    callout: {
      info: "Note",
      tip: "Astuce",
      warn: "Attention",
      risk: "Risque",
    },
    objectivesAria: "Objectifs pédagogiques",
    objectivesTitle: "Après cette leçon, vous serez capable de",
    takeawaysAria: "Points clés",
    takeawaysTitle: "Points clés",
    exampleStamp: "Exemple",
    exampleAriaPrefix: "Exemple : ",
  },

  // ── Certifications & examens (academy-exams.tsx) ─────────────────────────
  exams: {
    aria: "Certifications",
    title: "Certifications",
    tiersNote: "Bronze ≥50 % · Argent ≥70 % · Or ≥90 % — la meilleure tentative est conservée",
    poolSuffix: " questions dans la réserve · ",
    attempt: "tentative",
    attemptPlural: "s",
    notCertified: "non certifié",
    bestPrefix: "meilleur ",
    close: "Fermer",
    improve: "Améliorer",
    takeExam: "Passer l'examen",
    // Résultat de l'examen.
    notYetCertified: "pas encore certifié",
    tierSuffix: " (niveau)",
    bestAcrossPrefix: "Record toutes tentatives : ",
    bestAcrossMiddle: " % · ",
    earned: "certification obtenue.",
    bronzeHint: "50 % débloque le Bronze — revoyez les explications et recommencez.",
    retakeNewSample: "Recommencer (nouvel échantillon)",
    // Sujet d'examen.
    examHeading: "Examen de certification · ",
    answeredSuffix: " répondues",
    submitExam: "Envoyer l'examen",
    gradedServerNote: "Noté côté serveur — seule votre meilleure tentative compte.",
  },

  // ── Fiches — révision quotidienne (academy-flashcards.tsx, Flashcards) ───
  flashcards: {
    aria: "Révision des fiches",
    title: "Révision quotidienne — fiches",
    sessionComplete: "session terminée",
    dueTodayPrefix: " · ",
    dueTodaySuffix: " à réviser aujourd'hui",
    desc: "Répétition espacée sur le glossaire et les points clés de chaque leçon — dix fiches par jour pour garder une mémoire honnête.",
    deckEmpty: "Rien à réviser pour le moment — le paquet est vide. Revenez demain.",
    sessionDonePrefix: "Session terminée — ",
    sessionDoneSuffix: " fiches notées.",
    sessionDoneDesc: "Les fiches marquées « À revoir » reviennent demain ; « Bien » et « Facile » s'espacent davantage.",
    showFrontAria: "Afficher le recto de la fiche",
    revealAria: "Révéler la réponse",
    kindTerm: "Terme",
    kindTakeaway: "Point clé",
    freePractice: "pratique libre",
    answer: "Réponse",
    prompt: "Question",
    tapToReveal: "Touchez pour révéler — rappelez d'abord, vérifiez ensuite.",
    grades: {
      AGAIN: "À revoir",
      GOOD: "Bien",
      EASY: "Facile",
    },
    gradesHint: "Les boutons de notation se débloquent après avoir révélé la réponse.",
  },

  // ── Lecteur de scénarios (academy-flashcards.tsx, ScenarioPlayer) ────────
  scenario: {
    aria: "Lecteur de scénarios",
    title: "Lecteur de scénarios — que feriez-vous ?",
    desc: "Entrez dans une situation de marché et choisissez l'action professionnelle. Chaque étape donne un retour ; chaque décision est consignée.",
    stepsSuffix: " étapes",
    alignedSuffix: " conformes à la lecture professionnelle",
    alignmentNote: "L'alignement, pas la perfection — chaque étape a trade le même edge : figure + contexte + localisation + structure + confirmation + risque.",
    backToScenarios: "Retour aux scénarios",
    stepWord: "étape",
    exit: "quitter",
    seeResult: "Voir le résultat",
    nextStep: "Étape suivante",
  },

  // ── Glossaire (academy-glossary.tsx) ─────────────────────────────────────
  glossary: {
    searchPlaceholder: "Rechercher dans le vocabulaire — terme, définition ou notion liée…",
    searchAria: "Rechercher dans le glossaire",
    clearSearch: "Effacer la recherche du glossaire",
    termsSuffix: " termes",
    layeredNote: " · définitions en couches : simple d'abord, professionnel ensuite. La tuile de lettre porte la couleur du parcours auquel le terme appartient.",
    emptyPrefix: "Aucun terme ne correspond à « ",
    emptySuffix: " ». Essayez un mot plus large — ou la recherche des Cours, qui couvre aussi les leçons.",
    removeBookmarkPrefix: "Retirer le favori : ",
    bookmarkPrefix: "Ajouter aux favoris : ",
    simple: "Simple",
    professional: "Professionnel",
    example: "Exemple",
    related: "Notions liées",
  },

  // ── Zone d'entraînement (academy-practice.tsx) ───────────────────────────
  practice: {
    // Registre d'entraînement.
    ledgerAria: "Registre d'entraînement",
    ledgerTitle: "Registre d'entraînement",
    lastAttemptsPrefix: "dernières ",
    lastAttemptsSuffix: " tentatives",
    ledgerEmpty: "Aucune tentative pour l'instant — votre précision par exercice se construira ici au fil de l'entraînement.",
    correctTitleSuffix: " correctes",
    // Sélecteur d'encre des chandeliers.
    inkLabel: "Encre des chandeliers",
    inkAria: "Palette d'encre des chandeliers",
    inkColorsSuffix: " — couleurs de chandeliers",
    inkTitleSuffix: " — mêmes figures, encres différentes",
    inkPalettes: {
      classic: "Classique",
      inverse: "Inversée",
      ocean: "Océan",
      violet: "Violet",
      mono: "Mono",
    },
    inkHint: "Même anatomie, encre différente — sur certains marchés le rouge signifie « hausse ». Lisez la figure, pas la palette.",
    // Exercice d'identification de figure.
    patternAria: "Identifier la figure",
    patternTitle: "Identifier la figure",
    roundPrefix: "manche ",
    patternIntro: "Une figure est tracée ci-dessous. Nommez-la — puis lisez l'explication. ",
    contextPrefix: "Contexte : ",
    optionsAria: "Options de figure",
    correct: "Correct.",
    notThisOne: "Pas celle-ci.",
    nextDrill: "Exercice suivant",
    // Laboratoire des chandeliers.
    labAria: "Laboratoire des chandeliers",
    labTitle: "Laboratoire des chandeliers",
    labDesc: "Faites glisser l'ouverture, le plus haut, le plus bas et la clôture — regardez le chandelier se reconstruire et lisez ce qu'il dit. L'anatomie que toute figure suppose.",
    ohlc: {
      open: "Ouverture",
      high: "Plus haut",
      low: "Plus bas",
      close: "Clôture",
    },
    priceSuffix: " (prix)",
    readDirection: "Direction",
    readBody: "Corps",
    readUpperWick: "Mèche haute",
    readLowerWick: "Mèche basse",
    bullDir: "Haussier — clôture au-dessus de l'ouverture",
    bearDir: "Baissier — clôture sous l'ouverture",
    bodySmall: "Petit — équilibre entre les deux camps",
    bodyLarge: "Grand — un camp a dominé",
    bodyMedium: "Moyen",
    wickLongHighs: "Longue — les plus hauts rejetés",
    wickLongLows: "Longue — les plus bas rejetés, les acheteurs sont intervenus",
    wickNone: "Rien de significatif",
    wickShort: "Courte",
    // Exercice de lecture de structure.
    structureAria: "Exercice de lecture de structure",
    structureTitle: "Lecture de structure",
    structureIntro: "Lisez le schéma, répondez, obtenez la raison. Contexte : ",
    nextScenario: "Scénario suivant",
    // Contenu des scénarios (codé dans le composant → dictionnaire).
    scenarios: {
      uptrend: {
        context: "Unité de temps journalière, aucune annonce prévue.",
        prompt: "Dans quel état se trouve ce marché ?",
        opt1: "Tendance haussière — succession de HH/HL",
        opt2: "Tendance baissière",
        opt3: "Range — aucune progression directionnelle",
        explanation: "Sommets et creux ascendants qui se répètent : une tendance haussière par définition. Les tactiques de tendance s'appliquent — des entrées sur repli, pas de contre-tendance.",
      },
      bosUp: {
        context: "Au sein d'une tendance haussière établie.",
        prompt: "L'événement mis en évidence se nomme le mieux…",
        opt1: "BOS — rupture de structure, continuation",
        opt2: "CHoCH — changement de caractère",
        opt3: "Balayage de liquidité",
        explanation: "Une clôture décisive au-dessus du plus haut swing précédent DANS le sens de la tendance est une rupture de structure — un événement de continuation, pas un avertissement de retournement.",
      },
      choch: {
        context: "Après une longue série de HH/HL.",
        prompt: "Le prix vient de clôturer sous le dernier creux ascendant. Cet événement est…",
        opt1: "CHoCH — premier avertissement d'un possible retournement",
        opt2: "Une tendance baissière confirmée — vendre au marché",
        opt3: " du simple bruit",
        explanation: "Première rupture structurelle contre-tendance = changement de caractère. C'est un avertissement, pas un retournement confirmé — le MSS (LH puis LL) est l'étape de confirmation.",
      },
      range: {
        context: "Deux niveaux testés à répétition pendant des semaines.",
        prompt: "Les tactiques au meilleur espérance ici sont…",
        opt1: "Fader les extrêmes vers le milieu",
        opt2: "Courir après les cassures au milieu du range",
        opt3: "Suivre la tendance au milieu",
        explanation: "Dans un range, ce sont les extrêmes qui portent l'information ; les cassures au milieu du range meurent. Tactiques de range et tactiques de tendance ne sont pas interchangeables.",
      },
      liquiditySweep: {
        context: "Creux égaux, puis une percée rapide et un retournement vif.",
        prompt: "Que la percée sous les creux égaux a-t-elle très probablement fait ?",
        opt1: "Balayé les stops de vente en place, puis retourné",
        opt2: "Confirmé une cassure",
        opt3: "Rien — c'est une erreur de données",
        explanation: "La séquence observable — percée au-delà de plus bas évidents, retournement rapide — est le balayage classique. Tradez la séquence de retournement avec un stop au-delà de l'extrême du balayage.",
      },
      doubleTop: {
        context: "Deux sommets dans la même zone d'offre.",
        prompt: "Quand cette formation est-elle réellement complète ?",
        opt1: "À la cassure décisive de la ligne de cou (creux de repli)",
        opt2: "Quand le deuxième sommet s'imprime",
        opt3: "Trois chandeliers après le premier sommet",
        explanation: "Tant que la ligne de cou n'est pas cassée, ce n'est qu'un range. La cassure est l'événement ; avant elle, vendre le « sommet » est de l'anticipation.",
      },
    },
  },

  // ── Exercices du moteur : SR, taille de position, zones (academy-practice-drills.tsx) ──
  drills: {
    chartAria: "Graphique d'exercice",
    roundPrefix: "manche ",
    // Support / Résistance.
    srAria: "Exercice support et résistance",
    srTitle: "Support / Résistance",
    srDesc: "Lisez ce que fait le niveau — la réaction vous dit quel côté il sert.",
    nextLevel: "Niveau suivant",
    // Taille de position.
    positionAria: "Exercice de dimensionnement de position",
    positionTitle: "Dimensionnement de position",
    positionDesc: "L'arithmétique du risque jusqu'au réflexe — la seule formule qui garde les comptes en vie.",
    positionInputAria: "Taille de position",
    check: "Vérifier",
    withinBudget: "dans le budget",
    outsideBudget: "hors budget",
    nextScenario: "Scénario suivant",
    // Zones offre / demande.
    zoneAria: "Exercice offre et demande",
    zoneTitle: "Offre / Demande",
    zoneDesc: "Deux bandes, une origine de déplacement. Trouvez où les acheteurs ont construit leur zone.",
    nextChart: "Graphique suivant",
  },

  // ── Panneau de progression + jalons (academy-progress.tsx) ───────────────
  progress: {
    overallRing: "global",
    overall: "Global",
    overallProgress: "Progression globale",
    lessonsMid: " leçons · ",
    coursesEnd: " cours terminés",
    arcsNote: "Chaque arc est un parcours d'enseignement — sa longueur est fixe, son remplissage est votre progression.",
    streak: "Série",
    days: "jours",
    longestPrefix: "Record ",
    lastActivityPrefix: " · dernière activité ",
    quizzesTaken: "Quiz passés",
    quizAverage: "Moyenne des quiz",
    drillAttempts: "Tentatives d'exercices",
    drillAccuracy: "Précision des exercices",
    byCategoryAria: "Progression par catégorie",
    byCategoryTitle: "Par catégorie",
    categoryCompletedAria: "Catégorie terminée",
    rereadNote: "Les cours terminés restent ouverts — relire une leçon après quelques semaines en réel, c'est là que ça devient limpide.",
    // Jalons.
    milestonesAria: "Jalons",
    milestonesTitle: "Jalons",
    milestonesDesc: "Aucun badge de vanité — chaque jalon est calculé à partir de ce que vous avez réellement fait.",
    earnedChip: "obtenu",
    earnedPrefix: "obtenu le ",
  },

  // ── Étagère des favoris (academy-bookmarks.tsx) ──────────────────────────
  bookmarks: {
    emptyTitle: "Rien aux favoris pour l'instant",
    emptyDesc: "Étoilez une leçon depuis son lecteur, ou un terme du glossaire depuis le vocabulaire — vos repères s'aligneront ici.",
    browseCourses: "Parcourir les cours",
    openGlossary: "Ouvrir le glossaire",
    removeAriaPrefix: "Retirer le favori : ",
    lessonsAria: "Leçons favorites",
    lessonsTitle: "Leçons",
    termsAria: "Termes du glossaire favoris",
    termsTitle: "Termes du glossaire",
    countSuffix: " enregistrés · les favoris restent propres à ce compte.",
  },

  // ── Figures des leçons (visuals.tsx) ─────────────────────────────────────
  // aria-labels des diagrammes role="img" et légendes de repli. Les
  // annotations internes aux SVG (HIGH/OPEN/CLOSE, BOS, ligne de cou…)
  // font partie du registre géométrique (contenu servi côté serveur).
  visuals: {
    candlestickAria: "Diagramme en chandeliers",
    anatomyAria: "Anatomie d'un chandelier",
    structureAria: "Diagramme de structure de marché",
    drawdownAria: "Diagramme de drawdown",
    riskRewardAria: "Diagramme risque/rendement",
    anatomyBullCaption: "Chandelier haussier — clôture au-dessus de l'ouverture. La mèche basse marque les plus bas rejetés.",
    anatomyBearCaption: "Chandelier baissier — clôture sous l'ouverture. La mèche haute marque les plus hauts rejetés.",
    zonesCaption: "Des zones, pas des lignes — la largeur fait partie du niveau. La réaction est attendue au bord de la bande.",
  },
} as const satisfies Dictionary["academy"];
