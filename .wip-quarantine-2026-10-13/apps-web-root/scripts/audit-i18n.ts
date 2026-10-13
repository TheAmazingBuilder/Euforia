/**
 * i18n static audit — every dict.<module> referenced in src must exist in the
 * English dictionary, and every dictionary module must be referenced at least
 * once (dead-module detector, spot level).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/z/my-project/apps/web";
const SRC = join(ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(tsx?|ts)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const used = new Set<string>();
for (const f of files) {
  const txt = readFileSync(f, "utf8");
  // Only files that consume the GLOBAL dict (useI18n) — files receiving a
  // local `dict` prop (e.g. RecognitionDict sub-dictionary in import-shared)
  // shadow the name and would produce false first-level hits.
  if (!txt.includes("useI18n")) continue;
  for (const m of txt.matchAll(/(?<![.\w])dict\.([a-zA-Z0-9_]+)/g)) used.add(m[1]);
  // also capture destructured dict module aliases: const X = dict.tasky
  for (const m of txt.matchAll(/(?<![.\w])dict\.([a-zA-Z0-9_]+)[.,;)\s]/g)) used.add(m[1]);
}

// Import the aggregated dictionary through tsx (wrapped — no top-level await).
async function main() {
const mod = await import("../src/i18n/dictionaries/en");
const dict = mod.en;
const dictModules = Object.keys(dict);

const missing = [...used].filter((u) => !dictModules.includes(u)).sort();
const unused = dictModules.filter((d) => !used.has(d)).sort();

console.log(`dict modules defined: ${dictModules.length}`);
console.log(`dict modules referenced: ${used.size}`);
console.log(`MISSING (used but undefined): ${missing.length ? missing.join(", ") : "none"}`);
console.log(`UNUSED (defined but never referenced): ${unused.length ? unused.join(", ") : "none"}`);

// Deep spot-check: for each referenced module, verify a sample of property
// paths used in code actually exist (dict.<mod>.<key>[.<key2>]).
let deepBad = 0;
for (const f of files) {
  const txt = readFileSync(f, "utf8");
  for (const m of txt.matchAll(/(?<![.\w])dict\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/g)) {
    const [, modName, k1, k2] = m;
    const node = (dict as Record<string, unknown>)[modName];
    if (!node || typeof node !== "object") continue;
    const sub = node as Record<string, unknown>;
    if (!(k1 in sub) || typeof sub[k1] !== "object" || sub[k1] === null || !(k2 in (sub[k1] as Record<string, unknown>))) {
      console.log(`DEEP MISS: dict.${modName}.${k1}.${k2}  (${f.replace(SRC + "/", "")})`);
      deepBad += 1;
    }
  }
}
console.log(`deep 3-level paths checked: misses=${deepBad}`);

if (missing.length || deepBad) process.exit(1);
console.log("I18N AUDIT PASS");
}
main().catch((e) => { console.error(e); process.exit(1); });
