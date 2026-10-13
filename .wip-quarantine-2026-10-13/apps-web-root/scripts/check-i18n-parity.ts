/**
 * i18n key parity checker — EN vs FR root packs.
 * Usage: npx tsx scripts/check-i18n-parity.ts
 * Exits 1 on key mismatch or empty value.
 */
import { en } from "../src/i18n/dictionaries/en";
import { fr } from "../src/i18n/dictionaries/fr";

type Flat = Record<string, string>;

function flat(o: unknown, p = "", out: Flat = {}): Flat {
  for (const k of Object.keys(o as Record<string, unknown>)) {
    const v = (o as Record<string, unknown>)[k];
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flat(v, key, out);
    else out[key] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

const enFlat = flat(en);
const frFlat = flat(fr);

const missingInFr = Object.keys(enFlat).filter((k) => !(k in frFlat));
const missingInEn = Object.keys(frFlat).filter((k) => !(k in enFlat));
const emptyEn = Object.keys(enFlat).filter((k) => !enFlat[k] || !enFlat[k].trim());
const emptyFr = Object.keys(frFlat).filter((k) => !frFlat[k] || !frFlat[k].trim());
const identical = Object.keys(enFlat).filter((k) => k in frFlat && enFlat[k] === frFlat[k]);

console.log(`EN keys: ${Object.keys(enFlat).length} | FR keys: ${Object.keys(frFlat).length}`);
if (missingInFr.length) console.log(`\nMISSING IN FR (${missingInFr.length}):\n  ` + missingInFr.join("\n  "));
if (missingInEn.length) console.log(`\nMISSING IN EN (${missingInEn.length}):\n  ` + missingInEn.join("\n  "));
if (emptyEn.length) console.log(`\nEMPTY EN (${emptyEn.length}):\n  ` + emptyEn.join("\n  "));
if (emptyFr.length) console.log(`\nEMPTY FR (${emptyFr.length}):\n  ` + emptyFr.join("\n  "));
console.log(`\nIdentical EN==FR strings: ${identical.length}`);

const legit = /^(.+\.)?(locale|code|native|symbol|currency|unit|value|unitShort)$/i;
const mono = /^(en|fr)$/i;
const suspicious = identical.filter((k) => {
  const v = enFlat[k];
  if (!legit.test(k) && /[a-z]{3,}/i.test(v) && !mono.test(v)) return true;
  return false;
});
if (suspicious.length)
  console.log(`\nIDENTICAL BUT NOT SELF-REFERENTIAL (${suspicious.length}) — review:\n  ` + suspicious.slice(0, 60).join("\n  "));

const ok = missingInFr.length === 0 && missingInEn.length === 0 && emptyEn.length === 0 && emptyFr.length === 0;
console.log(ok ? "\nPARITY: OK" : "\nPARITY: FAIL");
process.exit(ok ? 0 : 1);
