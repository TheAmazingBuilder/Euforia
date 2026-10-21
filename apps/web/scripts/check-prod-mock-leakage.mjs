/**
 * MASTER QA spec §14.10 — automated mock-leakage guard for production.
 *
 * Asserts that a DEFAULT production build (zero env — the deployment
 * mistake the QA audit targets) cannot activate the MSW demo layer:
 *
 *   1. The mode matrix test (src/lib/api/__tests__/mode.spec.ts) is the
 *      executable statement of the contract; this script additionally
 *      inspects the BUILT client output:
 *   2. The composed service worker (/sw.js) must keep its MSW passthrough
 *      semantics (it only intercepts after an explicit client start), and
 *   3. No client chunk may contain an UNCONDITIONAL `worker.start(` call —
 *      the only start site lives behind the API_MOCKED check in
 *      MockProvider (dynamic import, never in the default path).
 *
 * Exit 1 with a finding list when any rule breaks. Reviewable, reversible,
 * and cheap: pure file inspection, no browser.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const findings = [];

// 1. The mode contract test must exist and pin the production default.
const modeTest = path.join(root, "src/lib/api/__tests__/mode.spec.ts");
if (!existsSync(modeTest)) {
  findings.push("missing src/lib/api/__tests__/mode.spec.ts (the §14.9 mode-matrix contract)");
} else {
  const content = readFileSync(modeTest, "utf8");
  if (!content.includes('loadMode(undefined, "production")')) {
    findings.push("mode.spec.ts no longer pins the zero-env PRODUCTION → real-API rule");
  }
}

// 2. The composed service worker must not auto-activate MSW.
const sw = path.join(root, "public/sw.js");
if (!existsSync(sw)) {
  findings.push("missing public/sw.js (PWA + MSW composition)");
} else {
  const content = readFileSync(sw, "utf8");
  if (/worker\s*\.\s*start\s*\(/.test(content) || /MOCK_ACTIVATE/.test(content)) {
    findings.push("public/sw.js appears to activate the MSW worker by itself (must stay passthrough)");
  }
}

// 3. Client chunks: the ONLY permitted worker-start site is behind the mode
//    check in MockProvider (dynamic import of @/mocks/browser). A chunk that
//    calls worker.start outside that module is a leakage.
const mockBrowserModule = "mocks/browser";
const nextDir = path.join(root, ".next");
const chunks = [];

function walk(dir, depth = 0) {
  if (depth > 6) return;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, depth + 1);
    else if (/\.js$/.test(entry)) chunks.push(full);
  }
}

if (existsSync(nextDir)) {
  // static/ chunks — only CLIENT chunks can boot the worker. The MSW
  // library's own code (setupWorker internals) legitimately contains
  // worker.start machinery; the leakage rule targets OUR module boundary:
  // any chunk that imports @/mocks/browser (the app's worker bootstrap)
  // must carry the API_MOCKED guard — the MockProvider is the only
  // permitted start site (lazy, behind the canonical mode check).
  walk(path.join(nextDir, "static"));
  for (const file of chunks) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!content.includes(mockBrowserModule)) continue;
    const hasStart = /worker\s*\.\s*start\s*\(/.test(content);
    const hasGuard = /API_MOCKED|NEXT_PUBLIC_API_MOCKED/.test(content);
    if (hasStart && !hasGuard) {
      findings.push(`client chunk ${path.relative(root, file)} starts the MSW worker without the mode guard`);
    }
    // The app's own bootstrap chunk must guard the start (defense in depth
    // even when bundlers split the modules across chunks).
    if (hasStart && hasGuard && !content.includes("import(") && !content.includes("Promise.resolve().then")) {
      findings.push(
        `client chunk ${path.relative(root, file)} appears to start the MSW worker EAGERLY (expected a lazy import behind the mode check)`,
      );
    }
  }
} else {
  findings.push("no .next build found — run `next build` before this guard");
}

if (findings.length > 0) {
  console.error("MOCK-LEAKAGE GUARD — FAIL:");
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}
console.log("MOCK-LEAKAGE GUARD — PASS (production default cannot activate the demo layer)");
