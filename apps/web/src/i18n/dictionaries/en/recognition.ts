import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * EN dictionary — IMPORT & RECOGNITION namespace (canonical; FR mirrors it
 * when the French pack returns). Grouped by screen concern. Values are
 * STATIC strings — components compose dynamic parts themselves (the dict.*
 * pattern, no {var} templates).
 *
 * Terminology contract (spec §18/§37): confidence is "Recognition
 * confidence" — never accuracy/guarantee. The engine DRAFTS, the user
 * CONFIRMS (§21): confirm copy never implies the machine was right.
 */

export type RecognitionDict = Dictionary["recognition"];

/** Field key → dict label (composition stays in components). */
export function recognitionFieldLabel(S: RecognitionDict, field: string): string {
  const map: Record<string, string> = {
    symbol: S.result.fields.symbol,
    direction: S.result.fields.direction,
    volume: S.result.fields.volume,
    entryPrice: S.result.fields.entryPrice,
    exitPrice: S.result.fields.exitPrice,
    stopLoss: S.result.fields.stopLoss,
    takeProfit: S.result.fields.takeProfit,
    profit: S.result.fields.profit,
    openTime: S.result.fields.openTime,
    closeTime: S.result.fields.closeTime,
  };
  return map[field] ?? field;
}

export const recognitionDict = {
  nav: {
    title: "Import & Recognition",
  },

  tabs: {
    overview: "Overview",
    history: "History",
  },

  overview: {
    subtitle: "Turn any trading screenshot into a verified journal entry — the engine drafts, you confirm.",
    uploadCta: "Upload screenshot",
    heroTitle: "Import your trading screenshot",
    heroBody:
      "Euforia reads the trade information directly from the image — symbol, prices, volume, result — then hands it to you for review. Nothing enters the journal until you confirm it.",
    heroPlatforms: "Supports MT5 · TradingView · cTrader",
    privacy: "Your screenshot is processed securely and is only visible to you.",
    stats: {
      analyzed: "Screenshots analyzed",
      confirmed: "Confirmed imports",
      review: "Awaiting review",
      failed: "Failed",
    },
    recentTitle: "Recent imports",
    openHistory: "Open history",
    recentEmpty: "No imports yet — your first screenshot starts above.",
  },

  uploader: {
    dropTitle: "Drag your screenshot here",
    dropSubtitle: "or click to browse — PNG, JPG or WEBP, up to 6 MB",
    dragging: "Drop to import",
    rejected: "This file can't be imported",
    browse: "Choose a file",
    replace: "Replace",
    remove: "Remove",
    previewLabel: "Screenshot preview",
    openFull: "Open full preview",
    fileName: "File",
    dimensions: "Dimensions",
    format: "Format",
    size: "Size",
    errEmpty: "This image file is empty.",
    errType: "This image format isn't supported — use PNG, JPG or WEBP.",
    errSize: "This file is too large — screenshots must stay under 6 MB.",
    errRead: "We couldn't read this file — try re-exporting the screenshot.",
  },

  settings: {
    title: "Recognition settings",
    subtitle: "What should the engine look for?",
    platform: "Detected platform",
    platformHint: "The engine detects the platform from the screenshot layout.",
    platformAuto: "Auto detect",
    platformMt5: "MetaTrader 5",
    platformTradingview: "TradingView",
    platformCtrader: "cTrader",
    platformOther: "Other",
    profile: "Recognition mode",
    profileHint: "V1 reads MT5-style trade summary lines.",
    profileTrade: "Trade details",
    profileAccount: "Account / position — coming soon",
    profileChart: "Chart analysis — coming soon",
    profileTradeHint: "Symbol, direction, volume, prices, SL/TP, result and times.",
    start: "Start recognition",
    changeImage: "Back to the screenshot",
  },

  progress: {
    title: "Analyzing your screenshot",
    subtitle: "This usually takes a few seconds. You can safely leave this page.",
    cancel: "Cancel analysis",
    steps: {
      uploading: "Uploading the screenshot",
      preprocessing: "Preparing the image",
      ocr: "Reading the screenshot",
      classification: "Detecting the platform",
      extraction: "Recognizing trade fields",
      normalization: "Building the trade draft",
      done: "Recognition complete",
    },
    done: "Done",
    elapsed: "Elapsed",
    cancelled: "Analysis cancelled — the screenshot was discarded.",
  },

  result: {
    title: "Recognition result",
    subtitle: "Every value carries its recognition confidence — review before confirming.",
    screenshot: "Original screenshot",
    detectedTitle: "Detected trade",
    detectedEmpty: "No trade was detected",
    fields: {
      symbol: "Symbol",
      direction: "Direction",
      volume: "Volume",
      entryPrice: "Entry price",
      exitPrice: "Exit price",
      stopLoss: "Stop loss",
      takeProfit: "Take profit",
      profit: "P&L",
      openTime: "Open time",
      closeTime: "Close time",
    },
    confidence: "Recognition confidence",
    bands: {
      HIGH: "High confidence",
      MEDIUM: "Medium confidence",
      LOW: "Low confidence",
      UNKNOWN: "Not recognized",
    },
    states: {
      edit: "Edit",
      save: "Save",
      cancel: "Cancel",
      notFound: "Not found",
      uncertain: "Please verify",
      missing: "Not detected — enter it manually",
      raw: "As read",
      viewSource: "View source",
      viewSourceSoon: "Source highlighting arrives with the OCR engine",
    },
    directionBuy: "BUY",
    directionSell: "SELL",
    editHint: "Corrected values become the authoritative record when you confirm.",
    nextReview: "Review trade draft",
    retry: "Try again",
    newImport: "Import another screenshot",
    engineLine: "Engine",
    durationLine: "Processing time",
    seconds: "s",
  },

  warnings: {
    title: "Review recommended",
    multipleTrades: "Multiple trades may be present — V1 imports one at a time.",
    incomplete: "The screenshot appears incomplete.",
    lowConfidence: "Low confidence on {field}.",
  },

  draft: {
    title: "Review trade",
    subtitle: "One last look before this enters the journal — sections mirror the trade form.",
    sections: {
      basic: "Basic information",
      execution: "Execution",
      risk: "Risk management",
      result: "Result",
      timing: "Timing",
    },
    riskReward: "Risk / reward",
    riskRewardCalc: "Computed from entry, stop and target.",
    currency: "Currency",
    platform: "Platform",
    notDetected: "Not detected",
    backToResult: "Back to the fields",
    confirmAndImport: "Confirm & import",
    confirmHint: "Your corrections become the authoritative record.",
  },

  success: {
    title: "Import confirmed",
    body: "The reviewed values are now the authoritative record of this recognition.",
    viewTrades: "Open the journal",
    importAnother: "Import another screenshot",
    toast: "Recognition confirmed — the reviewed values are saved.",
  },

  history: {
    title: "Recognition history",
    subtitle: "Every screenshot you imported, with its outcome.",
    columns: {
      screenshot: "Screenshot",
      platform: "Platform",
      trades: "Detected trade",
      status: "Status",
      confidence: "Confidence",
      created: "Created",
      actions: "Actions",
    },
    oneTrade: "1 trade",
    noTrade: "—",
    filters: {
      all: "All",
      review: "Needs review",
      confirmed: "Confirmed",
      failed: "Failed",
    },
    open: "Open",
    details: {
      title: "Recognition details",
      created: "Created",
      duration: "Processing time",
      engine: "Engine",
      classification: "Detected platform",
      warnings: "Warnings",
      noWarnings: "No warnings",
      fields: "Extracted fields",
      corrections: "Your corrections",
      confirmedAt: "Confirmed",
      failure: "Failure",
      back: "Back to history",
    },
    empty: {
      all: "No imports yet — upload your first screenshot from the overview.",
      review: "Nothing is waiting for review.",
      confirmed: "No confirmed imports yet.",
      failed: "No failed recognitions — good.",
    },
    delete: "Delete",
    deleted: "Recognition deleted.",
  },

  statuses: {
    QUEUED: "Queued",
    PROCESSING: "Processing",
    REVIEW_REQUIRED: "Needs review",
    CONFIRMED: "Confirmed",
    FAILED: "Failed",
  },

  errors: {
    upload: "We couldn't upload this file.",
    unsupported: "This image format isn't supported.",
    recognitionFailed: "We couldn't recognize enough information from this screenshot.",
    partial: "Some trade information was detected, but several fields require review.",
    network: "Connection lost — check your network and try again.",
    server: "Recognition service temporarily unavailable — try again in a moment.",
    notFound: "This recognition no longer exists.",
  },
} as const;
