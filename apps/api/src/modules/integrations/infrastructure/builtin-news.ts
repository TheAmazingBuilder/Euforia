/**
 * Builtin sample-news adapter (Phase 14 §10) - DETERMINISTIC, provider-shaped
 * news for the unlicensed `news-wire` registration. No persistence: the same
 * six development samples are derived on read (stable ids via uuidV5 over the
 * provider key), clearly marked `sample: true` and never redistributed as
 * real content (§10/§29 - the registration stays unconnectable until a
 * licensed provider passes review).
 *
 * Why no table: the audited product renders exactly these samples; the mock
 * prunes them after the 2-day retention window, but a persistence layer for
 * throwaway sample rows would be speculative (§38 - no generic tables for
 * future possibilities). Divergence is documented in the Phase 14 report.
 */

import { uuidV5 } from "../../../shared/ids/uuid-v5";
import type { NewsItem } from "../../../shared/contracts";

/** Namespace for stable derived news ids (module-local, fixed). */
const NEWS_UUID_NAMESPACE = "7c2e9a41-5d3b-4f86-a1c9-2e4b6d8f0a53";

interface SampleNewsSeed {
  readonly key: string;
  readonly headline: string;
  readonly source: string;
  readonly category: NewsItem["category"];
  /** Hours before `now` the item was published (deterministic freshness). */
  readonly hoursAgo: number;
  readonly relatedSymbols: readonly string[];
  readonly relatedCurrencies: readonly string[];
  readonly importance: 1 | 2 | 3;
  readonly url: string;
}

const SAMPLES: readonly SampleNewsSeed[] = [
  {
    key: "news-1",
    headline: "Dollar steadies as traders look past mixed US jobs revisions",
    source: "Cosmoz Sample Wire",
    category: "FOREX",
    hoursAgo: 2,
    relatedSymbols: ["EURUSD", "USDJPY"],
    relatedCurrencies: ["USD"],
    importance: 2,
    url: "https://example.invalid/news/usd-steadies",
  },
  {
    key: "news-2",
    headline: "Gold holds the 2 330 $ pivot ahead of the FOMC minutes",
    source: "Cosmoz Sample Wire",
    category: "GOLD",
    hoursAgo: 5,
    relatedSymbols: ["XAUUSD"],
    relatedCurrencies: ["USD"],
    importance: 2,
    url: "https://example.invalid/news/gold-fomc",
  },
  {
    key: "news-3",
    headline: "Bitcoin ETF inflows resume after two quiet sessions",
    source: "Cosmoz Sample Wire",
    category: "CRYPTO",
    hoursAgo: 8,
    relatedSymbols: ["BTCUSDT"],
    relatedCurrencies: ["USD"],
    importance: 1,
    url: "https://example.invalid/news/btc-etf",
  },
  {
    key: "news-4",
    headline: "ECB speakers signal patience: rate path hinges on Q2 prints",
    source: "Cosmoz Sample Wire",
    category: "CENTRAL_BANKS",
    hoursAgo: 24 + 3,
    relatedSymbols: ["EURUSD", "DE40"],
    relatedCurrencies: ["EUR"],
    importance: 3,
    url: "https://example.invalid/news/ecb-patience",
  },
  {
    key: "news-5",
    headline: "Index futures drift lower as macro calendar thins out",
    source: "Cosmoz Sample Wire",
    category: "INDICES",
    hoursAgo: 24 + 7,
    relatedSymbols: ["US500", "NAS100"],
    relatedCurrencies: ["USD"],
    importance: 1,
    url: "https://example.invalid/news/futures-drift",
  },
  {
    key: "news-6",
    headline: "Oil inventories surprise: energy majors trim hedges",
    source: "Cosmoz Sample Wire",
    category: "MACRO",
    hoursAgo: 48,
    relatedSymbols: ["USOIL"],
    relatedCurrencies: ["USD"],
    importance: 2,
    url: "https://example.invalid/news/oil-inventories",
  },
];

const HOUR_MS = 3_600_000;

/**
 * Derive the sample news feed at `now` - sorted newest-first (overview
 * parity), ids stable per provider key across calls.
 */
export function listSampleNews(providerId: string, now: Date): NewsItem[] {
  return SAMPLES.map((seed, index) => ({
    id: stableNewsId(providerId, seed.key, index),
    providerKey: `${providerId}:${seed.key}`,
    headline: seed.headline,
    source: seed.source,
    category: seed.category,
    publishedAt: new Date(now.getTime() - seed.hoursAgo * HOUR_MS).toISOString(),
    relatedSymbols: [...seed.relatedSymbols],
    relatedCurrencies: [...seed.relatedCurrencies],
    importance: seed.importance,
    url: seed.url,
    sample: true,
  })).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function stableNewsId(providerId: string, key: string, salt: number): string {
  return uuidV5(`${providerId}:${key}:${salt}`, NEWS_UUID_NAMESPACE);
}
