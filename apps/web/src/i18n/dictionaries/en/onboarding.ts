/**
 * Onboarding dictionary — the first-run experience copy.
 *
 * Voice: precise, confident, factual. Never claims broker execution,
 * never promises returns, never fabricates data. Every number-less
 * promise is a capability that EXISTS in the repository (verified
 * against the sidebar navigation and the API modules).
 */
export const onboardingDict = {
  steps: {
    welcome: "Welcome",
    tour: "Your workspace",
    preferences: "Trading preferences",
    accounts: "Trading accounts",
    personalize: "Personalize",
    ready: "Ready",
  },

  progress: {
    /** aria-live announcement — {current}/{total} + the step title. */
    live: "Step {current} of {total}: {title}",
    label: "Step {current} of {total}",
    resumeLater: "Save and resume later",
    resumeLaterShort: "Save progress",
    resumeToast: "Progress saved — we'll pick up where you left off.",
    back: "Back",
    continue: "Continue",
  },

  welcome: {
    headline: "The trading journal that coaches you",
    body: "Euforia turns every trade into structured insight — document your decisions, measure your discipline, and let your own data guide your next move.",
    getStarted: "Get started",
    skip: "Skip introduction",
    errors: {
      start: "We couldn't start the tour. Nothing was changed — try again.",
      skip: "We couldn't save your choice. Nothing was changed — try again.",
    },
  },

  tour: {
    headline: "One workspace for the full trading loop",
    body: "Journal your trades, watch your discipline, and read your own performance honestly — these modules are ready for you.",
    modules: {
      dashboard: {
        title: "Dashboard",
        description: "Your coaching view — trends, streaks and highlights at a glance.",
      },
      trades: {
        title: "Trades",
        description: "Log and review every position, with screenshots and full context.",
      },
      review: {
        title: "Trade Review",
        description: "Structured post-trade reviews that sharpen your process.",
      },
      accounts: {
        title: "Accounts",
        description: "Manage trading accounts and their display settings.",
      },
      analytics: {
        title: "Analytics",
        description: "Performance breakdowns, behaviour patterns and streak analysis.",
      },
      playbook: {
        title: "Playbook",
        description: "Codify your strategies and grade how well you follow them.",
      },
      academy: {
        title: "Academy",
        description: "Guided tracks to deepen your trading craft.",
      },
      nofy: {
        title: "Nofy",
        description: "Alerts and notifications tuned to your rules.",
      },
    },
    more: "Also on board: Recognition (screenshot import), Calendar, Discipline, Events, Tasky, the Oryon market workspace and the analytical tools.",
  },

  preferences: {
    headline: "Make the numbers yours",
    body: "Display preferences only — they never change a trading account's currency or balances.",
    timezone: {
      label: "Timezone",
      hint: "Used for trading-day boundaries and the calendar.",
    },
    displayCurrency: {
      label: "Display currency",
      hint: "How profit and loss are shown across Euforia.",
    },
    session: {
      label: "Preferred trading session",
      hint: "Pre-selects the session when you plan a trade.",
    },
    sessions: {
      ASIA: "Asia",
      LONDON: "London",
      NEW_YORK: "New York",
      LONDON_NY_OVERLAP: "London / New York overlap",
    },
    save: "Save and continue",
    skip: "Skip for now",
    errors: {
      save: "We couldn't save your preferences. Nothing was changed — try again.",
    },
  },

  accounts: {
    headline: "Connect your trading activity",
    body: "Euforia builds insight from your journal and records. Add a trading account manually, or browse the supported broker integrations — both are available anytime from the navigation.",
    openAccounts: "Set up a trading account",
    openAccountsHint: "Opens Accounts after the tour — create a manual account in a few fields.",
    openIntegrations: "Browse broker integrations",
    openIntegrationsHint: "See which brokers can connect today, and connect when you're ready.",
    continueWithout: "Continue without configuring an account",
  },

  personalize: {
    headline: "Shape your dashboard",
    body: "Pick the analytical emphasis of your default workspace — every widget stays rearrangeable from the dashboard toolbar.",
    layouts: {
      COACH_FIRST: {
        title: "Coach first",
        description: "Insights and guidance up top.",
      },
      RISK_FIRST: {
        title: "Risk first",
        description: "Exposure and limits up top.",
      },
      PERFORMANCE_FIRST: {
        title: "Performance first",
        description: "Results and trends up top.",
      },
    },
    illustrative: "Illustrative preview — not your data",
    current: "Current",
    keepDefault: "Keep the default layout",
    save: "Save and continue",
    errors: {
      save: "We couldn't save your layout. Nothing was changed — try again.",
    },
  },

  ready: {
    headline: "You're ready to trade smarter",
    body: "Your workspace is set. Log your first trade or explore the dashboard — your data stays yours.",
    open: "Open my dashboard",
    completing: "Saving your setup…",
    errors: {
      complete: "We couldn't save your progress. Your setup is NOT marked as done — try again.",
    },
  },

  errorNotice: {
    title: "Setup status unavailable",
    body: "We couldn't verify whether the first-run tour applies to your account. Nothing has been changed — you can retry.",
    retry: "Retry",
    dismiss: "Dismiss",
  },
} as const;
