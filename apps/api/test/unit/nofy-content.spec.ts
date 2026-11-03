/**
 * Unit - Nofy content domain (Phase 12). Pure functions: text projections,
 * block normalization (ref display strip), content security (unsafe image
 * protocol rejection), versioning policy and name normalization.
 */
import { describe, expect, it } from "vitest";

import {
  countOpenTodos,
  countWords,
  excerptOf,
  isSafeImageSrc,
  nameKeyOf,
  newBlockId,
  normalizeBlocks,
  normalizeTagName,
  parseStoredBlocks,
  searchSnippet,
  textOfBlocks,
} from "../../src/modules/nofy/domain/nofy-content";
import { applyRetention, shouldSnapshot, VERSION_CAP } from "../../src/modules/nofy/domain/nofy-versioning";
import type { NofyBlock } from "../../src/shared/contracts";

const block = (partial: Partial<NofyBlock> & { type: NofyBlock["type"] }): NofyBlock => ({
  id: "b1",
  text: "",
  ...partial,
});

describe("text projections", () => {
  it("projects text-bearing blocks, table rows and image captions", () => {
    const blocks = [
      block({ type: "h2", text: "  Session behaviour  " }),
      block({ type: "paragraph", text: "Gold sweeps the Asian range." }),
      block({ type: "divider" }), // not text-bearing
      block({ type: "table", rows: [["Condition", "Result"], ["Clean range", "Valid"]] }),
      block({ type: "image", src: "data:image/png;base64,xxx", caption: "London sweep" }),
    ];
    const text = textOfBlocks(blocks);
    expect(text).toContain("Session behaviour");
    expect(text).toContain("Gold sweeps the Asian range.");
    expect(text).toContain("Condition - Result");
    expect(text).toContain("London sweep");
  });

  it("counts words and open todos", () => {
    const blocks = [
      block({ type: "paragraph", text: "one two three" }),
      block({ type: "todo", text: "open action", checked: false }),
      block({ type: "todo", text: "done action", checked: true }),
    ];
    expect(countWords(blocks)).toBe(7); // 3 + 2 + 2
    expect(countOpenTodos(blocks)).toBe(1);
  });

  it("builds a bounded excerpt (~180 chars) with visible separators", () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const excerpt = excerptOf([block({ type: "paragraph", text: long })]);
    expect(excerpt.length).toBeLessThanOrEqual(180);
    expect(excerpt.endsWith("…")).toBe(true);

    const short = excerptOf([
      block({ type: "paragraph", text: "first line" }),
      block({ type: "paragraph", text: "second line" }),
    ]);
    expect(short).toBe("first line · second line");
  });

  it("centers search snippets on the first text hit and pads with ellipses", () => {
    const blocks = [block({ type: "paragraph", text: "The sweep is bait. The reclaim is the setup - wait for it, every time." })];
    const snippet = searchSnippet(blocks, "reclaim");
    expect(snippet).toContain("reclaim");
    expect(snippet.startsWith("…")).toBe(false);

    // No text hit → the excerpt is the snippet (title/tag matches).
    const fallback = searchSnippet(blocks, "gold");
    expect(fallback).toBe(excerptOf(blocks));
  });
});

describe("block normalization (storage projection)", () => {
  it("strips client-supplied ref display fields - pointers only (kind + id)", () => {
    const [normalized] = normalizeBlocks([
      {
        id: "b1",
        type: "ref",
        text: "",
        ref: { kind: "TRADE", id: "t-1", label: "Client label", meta: "stale", href: "/stale" },
      },
    ]);
    expect(normalized?.ref).toEqual({ kind: "TRADE", id: "t-1" });
  });

  it("keeps checked/tone/media payloads and defaults text to empty", () => {
    const [todo, image] = normalizeBlocks([
      { id: "b1", type: "todo", text: "Action", checked: true },
      { id: "b2", type: "image", text: "", src: "https://cdn.example.com/x.png", alt: "chart", caption: "cap" },
    ]);
    expect(todo?.checked).toBe(true);
    expect(image?.src).toBe("https://cdn.example.com/x.png");
    expect(image?.caption).toBe("cap");
  });

  it("parses stored blocks defensively and drops unknown shapes", () => {
    const stored: unknown = [
      { id: "b1", type: "paragraph", text: "ok" },
      { type: "paragraph", text: "no id" }, // dropped
      { id: "b3" }, // dropped (no type)
      "garbage", // dropped
      { id: "b2", type: "ref", text: "", ref: { kind: "NOTE", id: "n-1", label: "x" } },
    ];
    const parsed = parseStoredBlocks(stored);
    expect(parsed.map((block) => block.id)).toEqual(["b1", "b2"]);
    expect(parsed[1]?.ref).toEqual({ kind: "NOTE", id: "n-1" });

    expect(parseStoredBlocks(null)).toEqual([]);
    expect(parseStoredBlocks("nope")).toEqual([]);
  });

  it("mints unique block ids", () => {
    expect(newBlockId()).not.toBe(newBlockId());
  });
});

describe("content security - image source protocol gate", () => {
  it("accepts https/http and base64 data images", () => {
    expect(isSafeImageSrc(undefined)).toBe(true);
    expect(isSafeImageSrc("https://cdn.example.com/chart.png")).toBe(true);
    expect(isSafeImageSrc("http://localhost:9000/x.jpg")).toBe(true);
    expect(isSafeImageSrc("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isSafeImageSrc("data:image/webp;base64,UklGRg==")).toBe(true);
  });

  it("rejects unsafe protocols before storage (§11)", () => {
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
    expect(isSafeImageSrc("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeImageSrc("vbscript:msgbox")).toBe(false);
    expect(isSafeImageSrc("file:///etc/passwd")).toBe(false);
    expect(isSafeImageSrc("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false); // non-base64
  });
});

describe("organization name normalization", () => {
  it("builds a case-insensitive uniqueness key", () => {
    expect(nameKeyOf("  Strategies ")).toBe("strategies");
    expect(nameKeyOf("STRATEGIES")).toBe("strategies");
  });

  it("normalizes tag names: trim + leading hash strip", () => {
    expect(normalizeTagName("  #XAUUSD ")).toBe("XAUUSD");
    expect(normalizeTagName("#XAUUSD")).toBe("XAUUSD");
    expect(normalizeTagName("Risk Management")).toBe("Risk Management");
  });
});

describe("versioning policy", () => {
  it("snapshots the first mutation, then throttles within the interval", () => {
    const now = new Date("2026-03-05T10:00:00.000Z");
    expect(shouldSnapshot(null, now)).toBe(true);
    expect(shouldSnapshot(new Date("2026-03-05T09:59:00.000Z"), now)).toBe(false); // 60s < 3min
    expect(shouldSnapshot(new Date("2026-03-05T09:57:01.000Z"), now)).toBe(false); // 179s
    expect(shouldSnapshot(new Date("2026-03-05T09:57:00.000Z"), now)).toBe(true); // 180s ≥ 3min
  });

  it("caps the retention list (newest-first, oldest dropped)", () => {
    expect(applyRetention(VERSION_CAP)).toBe(VERSION_CAP);
    expect(applyRetention(VERSION_CAP + 5)).toBe(VERSION_CAP);
    expect(VERSION_CAP).toBe(12);
  });
});
