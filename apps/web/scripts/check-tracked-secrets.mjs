#!/usr/bin/env node
/**
 * Tracked-secrets guard (security-audit 2026-10-19, checklist §2.8/§2.20).
 *
 * Scans every GIT-TRACKED file (working tree - history is out of scope, see
 * the audit report: the one historical token lives in commit 81b1d49 and is
 * documented for squash/filter before any public push) for high-confidence
 * secret patterns. Zero dependencies: git ls-files + read + regex.
 *
 * CI semantics: run from anywhere inside the repo; exits 1 on ANY finding
 * so the pipeline fails closed. This guard COMPLEMENTS the mock-leakage
 * guard (which stops mock data, not credentials) - CI runs both.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim());

/** [label, pattern] - high-confidence only; a false positive trains people to ignore the guard. */
const PATTERNS = [
  ["JWT bearer (eyJ…)", /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ["PEM private key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----/],
  ["AWS access key id", /AKIA[0-9A-Z]{16}/],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{36,}/],
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["Slack token", /xox[baprs]-[0-9A-Za-z-]{10,}/],
  ["Stripe live secret", /sk_live_[0-9A-Za-z]{16,}/],
  ["Generic bearer assignment", /(?:authorization|api[_-]?key|secret|token)["'\s:=]{1,4}["']?(?:Bearer\s+)[A-Za-z0-9._-]{20,}/i],
];

/** Files that legitimately contain the word shapes but no secrets. */
const ALLOWLIST = [
  /(?:^|\/)\.env\.example$/, // placeholders are empty by contract
  /package-lock\.json$|pnpm-lock\.yaml$|bun\.lock$/,
];

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  .split("\0")
  .filter(Boolean);

const findings = [];
for (const rel of tracked) {
  if (ALLOWLIST.some((re) => re.test(rel))) continue;
  let content;
  try {
    content = readFileSync(join(REPO_ROOT, rel), "utf8");
  } catch {
    continue; // binary or unreadable - git binary detection already filtered most
  }
  for (const [label, pattern] of PATTERNS) {
    const match = content.match(pattern);
    if (match) findings.push({ file: rel, label, snippet: match[0].slice(0, 48) });
  }
}

if (findings.length > 0) {
  console.error("TRACKED-SECRETS GUARD - FAIL");
  for (const f of findings) {
    console.error(`  [${f.label}] ${f.file} → ${f.snippet.replace(/(.{24}).*/, "$1…")}`);
  }
  console.error("Remove the secret from the working tree, rotate the credential, and (for history) squash/filter before any public push.");
  process.exit(1);
}
console.log(`TRACKED-SECRETS GUARD - PASS (${tracked.length} tracked files scanned, ${PATTERNS.length} patterns)`);
