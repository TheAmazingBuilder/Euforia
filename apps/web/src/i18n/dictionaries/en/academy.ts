import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * EN dictionary — ACADEMY namespace (canonical; FR mirrors it exactly
 * through the `Dictionary` type at fr.ts). Grouped by component concern:
 * view shell, overview dashboard, courses catalog/detail, lesson reader
 * (+ quiz, checkpoint, notes, TOC), lesson-block renderer, exams,
 * flashcards, scenario player, glossary, practice zone (ledger, ink
 * picker, pattern drill, candle lab, structure drill + its hardcoded
 * scenario content), engine drills (SR/position/zone), progress panel
 * (+ milestones), bookmarks and the lesson-figure `visuals`. Values are
 * STATIC strings — components compose dynamic parts themselves (the
 * dict.* pattern). EN values are verbatim the strings the module rendered
 * before migration. Academy API-served CONTENT (lesson bodies, quiz
 * questions/answers, glossary definitions, course/lesson titles,
 * flashcard fronts/backs, drill candles/prompts, recommendation &
 * milestone copy from the mock engine) is DATA, NOT dict material — only
 * UI chrome and content hardcoded in the components is migrated here.
 */
export type AcademyDict = Dictionary["academy"];

export const academyDict = {
  /** Fragments reused across several academy components. */
  shared: {
    // LevelBadge enum labels (academy-shared.tsx) — machine ids stay keys.
    levels: {
      BEGINNER: "Beginner",
      INTERMEDIATE: "Intermediate",
      ADVANCED: "Advanced",
    },
    // ProgressBar default aria-label.
    progressAria: "Progress",
    // "<entity> progress" ProgressBar aria suffix (composed with the title).
    progressSuffix: " progress",
    // Quiz/exam chrome shared by the lesson quiz and the exams.
    true: "True",
    false: "False",
    correct: "correct",
    missed: "missed",
    saving: "Saving…",
    minSuffix: " min",
  },

  // ── View shell (academy-view.tsx) ────────────────────────────────────────
  view: {
    title: "Academy",
    subtitle:
      "Learn → practice → trade → journal → analyze → learn again. The curriculum behind the journal: structured courses, drills, quizzes and a searchable glossary - from market fundamentals to advanced execution.",
    tabs: {
      overview: "Overview",
      courses: "Courses",
      practice: "Practice",
      events: "Events",
      tasky: "Tasky",
      progress: "Progress",
      glossary: "Glossary",
      bookmarks: "Bookmarks",
    },
    // Header chips (streak + overall completion).
    streakTitle: "Consecutive days with learning activity",
    streakUnit: "d",
    streak: "streak",
    overall: "overall",
  },

  // ── Overview dashboard (academy-overview.tsx) ────────────────────────────
  overview: {
    // Continue-learning band.
    continueAria: "Continue learning",
    continueTitle: "Continue learning",
    lessonWord: "lesson",
    continueLesson: "Continue lesson",
    course: "Course",
    curriculumComplete: "The curriculum is complete. Nothing left to continue - respect.",
    keepDrillsSharp: "Keep drills sharp",
    resumeTitle: "Pick up where you left off",
    resume: "Resume",
    // Stat band.
    progressAria: "Your progress",
    progressTitle: "Your progress",
    overallProgress: "Overall progress",
    of: "of",
    lessonsWord: "lessons",
    across: "across",
    coursesWord: "courses",
    streakLabel: "Learning streak",
    days: "days",
    longest: "Longest",
    activeToday: "Active today - the loop continues.",
    noActivityToday: "No activity yet today.",
    coursesCompleted: "Courses completed",
    lessonsCompleted: "Lessons completed",
    quizAverage: "Quiz average",
    drillAccuracy: "Drill accuracy",
    // Weekly plan.
    weeklyAria: "This week's plan",
    weeklyTitle: "This week - lessons · drills · quizzes",
    weekComplete: "weekly plan complete",
    weekOfPrefix: "week of ",
    rowLessons: "Lessons",
    rowDrills: "Drills",
    rowQuizzes: "Quizzes",
    shortOnDrills: "Short on drills? The practice zone is one click away →",
    // Recommendations.
    recommendedAria: "Recommended for you",
    recommendedTitle: "Recommended for you",
    recommendationsEmpty: "Every course completed - the curriculum salutes you. Revisit drills to stay sharp.",
    // Recent activity.
    recentAria: "Recently completed",
    recentTitle: "Recently completed",
    recentEmpty: "Nothing yet - finish your first lesson and it will land here.",
    // Bookmarks strip.
    bookmarksAria: "My bookmarks",
    bookmarksTitle: "My bookmarks",
    viewAll: "View all",
    bookmarksEmpty: "Bookmark lessons and glossary terms with the star button - they will wait here.",
    // Quick destinations.
    quickAria: "Practice and glossary",
    quickTitle: "Keep the loop turning",
    practiceDrills: "Practice drills",
    practiceDrillsDesc: "Pattern identification & the candle lab",
    glossaryCard: "Glossary",
    glossaryCardDesc: "Searchable trading vocabulary",
    // Journal → Academy suggestions.
    journalAria: "From your journal",
    journalTitle: "From your journal",
    journalDesc: "Patterns the Academy noticed in your closed trades - each suggestion links to the track that addresses it.",
    startLesson: "start lesson",
    preferCoursePrefix: "Prefer the full course view? Open ",
    preferCourseSuffix: " →",
    // Category map.
    categoryMapAria: "Explore categories",
    categoryMapTitle: "Explore categories",
    coursesMid: " courses · ",
    lessonsSuffix: " lessons",
    doneSuffix: " · done",
  },

  // ── Courses: catalog, filters, search, course detail (academy-courses.tsx) ──
  courses: {
    // Search field.
    searchPlaceholder: "Search courses, lessons, concepts… (e.g. breakout, drawdown)",
    searchAria: "Search the Academy",
    clearSearch: "Clear search",
    // Filter chips.
    allCategories: "All categories",
    allLevels: "All levels",
    status: {
      ALL: "Any status",
      IN_PROGRESS: "In progress",
      COMPLETED: "Completed",
      NOT_STARTED: "Not started",
    },
    duration: {
      ALL: "Any length",
      SHORT: "Under 60 min",
      MEDIUM: "60–120 min",
      LONG: "120+ min",
    },
    sortLabel: "Sort",
    sortAria: "Sort courses",
    sort: {
      curriculum: "Curriculum order",
      shortest: "Shortest first",
      longest: "Longest first",
      progress: "Most progress",
    },
    // Learning paths.
    pathsAria: "Learning paths",
    pathsTitle: "Learning paths",
    coursesSuffix: " courses",
    // Catalog grid + course cards.
    noMatch: "No course matches these filters.",
    done: "Done",
    quizWord: "quiz",
    quizScorePrefix: "quiz ",
    lessonsSuffix: " lessons",
    // Search results.
    noResultsPrefix: "Nothing found for “",
    noResultsSuffix: "”. Try a broader term - the glossary also matches definitions.",
    matchingCoursesAria: "Matching courses",
    matchingLessonsAria: "Matching lessons",
    matchingGlossaryAria: "Matching glossary terms",
    coursesTitle: "Courses",
    lessonsTitle: "Lessons",
    glossaryTitle: "Glossary",
    // Course detail.
    loadError: "This course could not be loaded.",
    backToCatalog: "Back to catalog",
    allCourses: "All courses",
    completedBadge: "Completed",
    objectivesAria: "Course objectives",
    objectivesTitle: "After this course, you will be able to",
    lessonsAria: "Lessons",
    // Course quiz section.
    quizAria: "Course quiz",
    quizTitle: "Course quiz",
    quizDesc: "Check your understanding - a few questions, graded with explanations. Only your best score is kept.",
    hideQuiz: "Hide quiz",
    takeQuiz: "Take the quiz",
  },

  // ── Lesson reader, quiz, checkpoint, notes, TOC (academy-lesson.tsx) ──────
  lesson: {
    // Nofy "note created" toast (Take notes action).
    nofyToast: "Note created in Nofy.",
    // Table of contents labels (derived from the block document).
    tocObjectives: "Objectives",
    tocCheckpoint: "Quick check",
    tocTable: "Reference table",
    tocChart: "Chart reading",
    tocTakeaways: "Key takeaways",
    tocQuiz: "Course quiz",
    // Reader chrome.
    loadError: "This lesson could not be loaded.",
    back: "Back",
    breadcrumbPrefix: "Lesson ",
    categoryFallback: "Course",
    completedChip: "completed",
    takeNotes: "Take notes",
    takeNotesAria: "Take notes on this lesson in Nofy",
    bookmark: "Bookmark",
    bookmarked: "Bookmarked",
    // Completion + prev/next.
    markComplete: "Mark lesson complete",
    lessonCompleted: "Lesson completed",
    nextLesson: "Next lesson",
    previous: "Previous",
    next: "Next",
    // TOC rail.
    tocAria: "On this page",
    tocTitle: "On this page",
    sectionsOfPrefix: "Sections of ",
    // Mid-lesson checkpoint.
    checkpointAria: "Comprehension checkpoint",
    checkpointTitle: "Quick check - do you have it?",
    checkAnswer: "Check answer",
    // Personal notes.
    notesAria: "Your notes",
    notesTitle: "Your notes",
    savedPrefix: "Saved ",
    autosaves: "Autosaves as you type",
    notesPlaceholder: "What clicked? What do you want to remember before the quiz - or before your next session?",
    notesInputAria: "Lesson notes",
    // Inline quiz teaser.
    quizAvailable: "Course quiz available",
    quizAvailableDesc: "A few questions with explanations - graded server-side, only your best score is kept.",
    startQuiz: "Start quiz",
    backToCourse: "Back to course",
    // Course quiz.
    correctSuffix: " correct",
    passed: "Perfect score - the concept is yours.",
    previousBestPrefix: "Previous best: ",
    previousBestSuffix: ". Only the best score is kept.",
    failedHint: "Review the explanations, then retake - only the best score is kept.",
    retake: "Retake",
    close: "Close",
    quizHeadingSuffix: " - quiz · ",
    answeredSuffix: " answered",
    submitAnswers: "Submit answers",
    gradedServerNote: "Graded on the server - answers never leave the engine ungraded.",
  },

  // ── Lesson block renderer (lesson-blocks.tsx) ────────────────────────────
  blocks: {
    // Callout tone fallback labels (block.title overrides them).
    callout: {
      info: "Note",
      tip: "Tip",
      warn: "Watch out",
      risk: "Risk",
    },
    objectivesAria: "Learning objectives",
    objectivesTitle: "After this lesson, you will be able to",
    takeawaysAria: "Key takeaways",
    takeawaysTitle: "Key takeaways",
    exampleStamp: "Example",
    exampleAriaPrefix: "Example: ",
  },

  // ── Certifications & exams (academy-exams.tsx) ───────────────────────────
  exams: {
    aria: "Certifications",
    title: "Certifications",
    tiersNote: "Bronze ≥50% · Silver ≥70% · Gold ≥90% - best attempt kept",
    poolSuffix: " questions in pool · ",
    attempt: "attempt",
    attemptPlural: "s",
    notCertified: "not certified",
    bestPrefix: "best ",
    close: "Close",
    improve: "Improve",
    takeExam: "Take exam",
    // Exam result.
    notYetCertified: "not yet certified",
    tierSuffix: " tier",
    bestAcrossPrefix: "Best across attempts: ",
    bestAcrossMiddle: "% · ",
    earned: "certification earned.",
    bronzeHint: "50% unlocks Bronze - review the explanations and retake.",
    retakeNewSample: "Retake (new sample)",
    // Exam paper.
    examHeading: "Certification exam · ",
    answeredSuffix: " answered",
    submitExam: "Submit exam",
    gradedServerNote: "Graded on the server - only your best attempt counts.",
  },

  // ── Flashcards — daily review (academy-flashcards.tsx, Flashcards) ───────
  flashcards: {
    aria: "Flashcard review",
    title: "Daily review - flashcards",
    sessionComplete: "session complete",
    dueTodayPrefix: " · ",
    dueTodaySuffix: " due today",
    desc: "Spaced repetition over the glossary and every lesson takeaway - ten cards a day keeps recall honest.",
    deckEmpty: "Nothing due right now - the deck is clear. Come back tomorrow.",
    sessionDonePrefix: "Session complete - ",
    sessionDoneSuffix: " cards graded.",
    sessionDoneDesc: "Cards you marked AGAIN return tomorrow; GOOD and EASY drift further out.",
    showFrontAria: "Show front of card",
    revealAria: "Reveal answer",
    kindTerm: "Term",
    kindTakeaway: "Takeaway",
    freePractice: "free practice",
    answer: "Answer",
    prompt: "Prompt",
    tapToReveal: "Tap to reveal - recall first, then check.",
    grades: {
      AGAIN: "Again",
      GOOD: "Good",
      EASY: "Easy",
    },
    gradesHint: "Grade buttons unlock after you reveal the answer.",
  },

  // ── Scenario player (academy-flashcards.tsx, ScenarioPlayer) ─────────────
  scenario: {
    aria: "Scenario player",
    title: "Scenario player - what would you do?",
    desc: "Step inside a market situation and choose the professional action. Every step gives feedback; every decision is logged.",
    stepsSuffix: " steps",
    alignedSuffix: " aligned with the professional read",
    alignmentNote: "Alignment, not perfection - every step traded the same edge: pattern + context + location + structure + confirmation + risk.",
    backToScenarios: "Back to scenarios",
    stepWord: "step",
    exit: "exit",
    seeResult: "See result",
    nextStep: "Next step",
  },

  // ── Glossary (academy-glossary.tsx) ──────────────────────────────────────
  glossary: {
    searchPlaceholder: "Search the vocabulary - term, definition or related concept…",
    searchAria: "Search the glossary",
    clearSearch: "Clear glossary search",
    termsSuffix: " terms",
    layeredNote: " · layered definitions: simple first, professional second. The letter tile carries the track color the term belongs to.",
    emptyPrefix: "No term matches “",
    emptySuffix: "”. Try a broader word - or the Courses search, which also covers lessons.",
    removeBookmarkPrefix: "Remove bookmark for ",
    bookmarkPrefix: "Bookmark ",
    simple: "Simple",
    professional: "Professional",
    example: "Example",
    related: "Related",
  },

  // ── Practice zone (academy-practice.tsx) ─────────────────────────────────
  practice: {
    // Practice ledger.
    ledgerAria: "Practice ledger",
    ledgerTitle: "Practice ledger",
    lastAttemptsPrefix: "last ",
    lastAttemptsSuffix: " attempts",
    ledgerEmpty: "No attempts yet - your per-drill accuracy will build here as you train.",
    correctTitleSuffix: " correct",
    // Candle ink picker.
    inkLabel: "Candle ink",
    inkAria: "Candle ink palette",
    inkColorsSuffix: " candle colors",
    inkTitleSuffix: " - same patterns, different inks",
    inkPalettes: {
      classic: "Classic",
      inverse: "Inverse",
      ocean: "Ocean",
      violet: "Violet",
      mono: "Mono",
    },
    inkHint: "Same anatomy, different ink - in some markets red means “up”. Read the pattern, not the palette.",
    // Pattern identification drill.
    patternAria: "Identify the pattern",
    patternTitle: "Identify the pattern",
    roundPrefix: "round ",
    patternIntro: "A formation is drawn below. Name it - then read the explanation. ",
    contextPrefix: "Context: ",
    optionsAria: "Pattern options",
    correct: "Correct.",
    notThisOne: "Not this one.",
    nextDrill: "Next drill",
    // Candle Lab.
    labAria: "Candle lab",
    labTitle: "Candle Lab",
    labDesc: "Drag open, high, low and close - watch the candle rebuild and read what it says. The anatomy every pattern assumes.",
    ohlc: {
      open: "Open",
      high: "High",
      low: "Low",
      close: "Close",
    },
    priceSuffix: " price",
    readDirection: "Direction",
    readBody: "Body",
    readUpperWick: "Upper wick",
    readLowerWick: "Lower wick",
    bullDir: "Bullish - close above open",
    bearDir: "Bearish - close below open",
    bodySmall: "Small - balance between sides",
    bodyLarge: "Large - one side dominated",
    bodyMedium: "Medium",
    wickLongHighs: "Long - highs rejected",
    wickLongLows: "Long - lows rejected, buyers stepped in",
    wickNone: "None meaningful",
    wickShort: "Short",
    // Structure reading drill.
    structureAria: "Structure reading drill",
    structureTitle: "Structure reading",
    structureIntro: "Read the diagram, answer, get the reason. Context: ",
    nextScenario: "Next scenario",
    // Hardcoded structure-scenario content (component source → dict).
    scenarios: {
      uptrend: {
        context: "Daily timeframe, no news scheduled.",
        prompt: "What state is this market in?",
        opt1: "Uptrend - repeating HH/HL sequence",
        opt2: "Downtrend",
        opt3: "Range - no directional progression",
        explanation: "Higher highs and higher lows repeating: an uptrend by definition. Trend tactics apply - pullback entries, not fades.",
      },
      bosUp: {
        context: "Within an established uptrend.",
        prompt: "The highlighted event is best labeled…",
        opt1: "BOS - break of structure, continuation",
        opt2: "CHoCH - change of character",
        opt3: "Liquidity sweep",
        explanation: "A decisive close above the prior swing high IN the trend's direction is a break of structure - a continuation event, not a reversal warning.",
      },
      choch: {
        context: "After a long series of HH/HL.",
        prompt: "Price just closed below the last higher low. This event is…",
        opt1: "CHoCH - first warning of a possible reversal",
        opt2: "A confirmed downtrend - go short at market",
        opt3: " meaningless noise",
        explanation: "First counter-trend structural break = change of character. It is a warning, not a confirmed reversal - the MSS (LH then LL) is the confirmation stage.",
      },
      range: {
        context: "Two levels tested repeatedly over weeks.",
        prompt: "The highest-expectation tactics here are…",
        opt1: "Fade the extremes toward the middle",
        opt2: "Chase mid-range breakouts",
        opt3: "Trend-follow the middle",
        explanation: "In ranges, extremes carry the information; mid-range breakouts die. Range tactics and trend tactics are not interchangeable.",
      },
      liquiditySweep: {
        context: "Equal lows, then a quick pierce and sharp reversal.",
        prompt: "What did the pierce below the equal lows most plausibly do?",
        opt1: "Swept resting sell-stops, then reversed",
        opt2: "Confirmed a breakdown",
        opt3: "Nothing - it is a data error",
        explanation: "The observable sequence - pierce beyond obvious lows, fast reversal - is the classic sweep. Trade the reversal sequence with a stop beyond the sweep extreme.",
      },
      doubleTop: {
        context: "Two peaks at the same supply area.",
        prompt: "When is this formation actually complete?",
        opt1: "On the decisive neckline (pullback low) break",
        opt2: "When the second peak prints",
        opt3: "Three candles after the first peak",
        explanation: "Until the neckline breaks, it is only a range. The break is the event; before it, shorting the 'top' is anticipation.",
      },
    },
  },

  // ── Engine drills: SR, position sizing, zones (academy-practice-drills.tsx) ──
  drills: {
    chartAria: "Drill chart",
    roundPrefix: "round ",
    // Support / Resistance.
    srAria: "Support and resistance drill",
    srTitle: "Support / Resistance",
    srDesc: "Read what the level is doing - the reaction tells you which side it serves.",
    nextLevel: "Next level",
    // Position sizing.
    positionAria: "Position sizing drill",
    positionTitle: "Position sizing",
    positionDesc: "Risk arithmetic until it is reflex - the only formula that keeps accounts alive.",
    positionInputAria: "Position size",
    check: "Check",
    withinBudget: "within budget",
    outsideBudget: "outside budget",
    nextScenario: "Next scenario",
    // Supply / Demand zones.
    zoneAria: "Supply and demand drill",
    zoneTitle: "Supply / Demand",
    zoneDesc: "Two bands, one origin of displacement. Find where buyers built their zone.",
    nextChart: "Next chart",
  },

  // ── Progress panel + milestones (academy-progress.tsx) ───────────────────
  progress: {
    overallRing: "overall",
    overall: "Overall",
    overallProgress: "Overall progress",
    lessonsMid: " lessons · ",
    coursesEnd: " courses completed",
    arcsNote: "Each arc is a teaching track - its length is fixed, its fill is your completion.",
    streak: "Streak",
    days: "days",
    longestPrefix: "Longest ",
    lastActivityPrefix: " · last activity ",
    quizzesTaken: "Quizzes taken",
    quizAverage: "Quiz average",
    drillAttempts: "Drill attempts",
    drillAccuracy: "Drill accuracy",
    byCategoryAria: "Progress by category",
    byCategoryTitle: "By category",
    categoryCompletedAria: "Category completed",
    rereadNote: "Completed courses stay open - rereading a lesson after a few live weeks is where it actually clicks.",
    // Milestones.
    milestonesAria: "Milestones",
    milestonesTitle: "Milestones",
    milestonesDesc: "No vanity badges - each milestone is computed from what you have actually done.",
    earnedChip: "earned",
    earnedPrefix: "earned ",
  },

  // ── Bookmarks shelf (academy-bookmarks.tsx) ──────────────────────────────
  bookmarks: {
    emptyTitle: "Nothing bookmarked yet",
    emptyDesc: "Star any lesson from its reader, or any glossary term from the vocabulary - your saved spots line up here.",
    browseCourses: "Browse courses",
    openGlossary: "Open the glossary",
    removeAriaPrefix: "Remove bookmark: ",
    lessonsAria: "Bookmarked lessons",
    lessonsTitle: "Lessons",
    termsAria: "Bookmarked glossary terms",
    termsTitle: "Glossary terms",
    countSuffix: " saved · bookmarks stay on this account only.",
  },

  // ── Lesson figure visuals (visuals.tsx) ──────────────────────────────────
  // aria-labels of the role="img" diagrams and the figure fallback captions.
  // In-SVG geometry annotations (HIGH/OPEN/CLOSE, BOS, neckline…) are part of
  // the diagram registry (the client twin of server-authored block content).
  visuals: {
    candlestickAria: "Candlestick diagram",
    anatomyAria: "Candle anatomy",
    structureAria: "Market structure diagram",
    drawdownAria: "Drawdown diagram",
    riskRewardAria: "Risk/reward diagram",
    anatomyBullCaption: "Bullish candle - close above open. The lower wick marks rejected lows.",
    anatomyBearCaption: "Bearish candle - close below open. The upper wick marks rejected highs.",
    zonesCaption: "Zones, not lines - width is part of the level. Reaction is expected at the band's edge.",
  },

  // ── Events (academy-events.tsx) ─────────────────────────────────────────
  events: {
    title: "Live sessions",
    subtitle: "Workshops, webinars, open Q&A and certification windows - the Academy's live calendar.",
    upcoming: "Upcoming",
    past: "Past sessions",
    replay: "Replay available",
    full: "Full",
    seats: "seats left",
    seatOne: "seat left",
    duration: "min",
    host: "Host",
    register: "Register",
    registered: "Registered",
    unregister: "Leave",
    beginsIn: "Starts",
    today: "Today",
    tomorrow: "Tomorrow",
    emptyUpcoming: "No sessions scheduled - check back soon.",
    emptyPast: "No past sessions yet.",
    registerToast: "Seat reserved - see you there",
    unregisterToast: "Registration cancelled",
    typeLabels: {
      WORKSHOP: "Workshop",
      WEBINAR: "Webinar",
      LIVE_QA: "Live Q&A",
      EXAM: "Exam",
    },
  },

  // ── Tasky (academy-tasky.tsx) ───────────────────────────────────────────
  tasky: {
    title: "Study tasks",
    subtitle: "Your learning backlog, one checklist at a time - small reps, steady streak.",
    focus: "Today's focus",
    upcoming: "Upcoming",
    done: "Completed",
    filterAll: "All",
    filterOpen: "Open",
    filterDone: "Done",
    addPlaceholder: "Add a study task… (e.g. 5 chart reps before London open)",
    addButton: "Add task",
    dueToday: "Due today",
    dueOverdue: "Overdue",
    dueSoon: "Due soon",
    dueLater: "Later",
    noDue: "No deadline",
    xp: "XP",
    streakDays: "day streak",
    totalXp: "XP earned",
    completedOf: "of",
    empty: "Nothing here - add your first task above.",
    kindLabels: {
      LESSON: "Lesson",
      DRILL: "Drill",
      REVIEW: "Review",
      CUSTOM: "Custom",
    },
    priorityLabels: {
      LOW: "Low",
      MEDIUM: "Medium",
      HIGH: "High",
    },
    delete: "Delete task",
    reopen: "Reopen",
    toastAdded: "Task added",
    toastDone: "Task completed - nice",
    toastReopened: "Task reopened",
    toastDeleted: "Task deleted",
  },
} as const;
