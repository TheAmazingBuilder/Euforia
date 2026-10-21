/**
 * Fix unescaped straight quotes inside single-line string literals of
 * academy-content.ts by converting them to typographic curly quotes.
 * Handles both bare array strings (`"..."`) and keyed strings (`text: "..."`),
 * including already-escaped `\"` sequences (converted for consistency).
 */
const fs = require("fs");

const PATH = "/home/z/my-project/apps/web/src/lib/academy-content.ts";
const lines = fs.readFileSync(PATH, "utf8").split("\n");

const STRING_LINE = /^(\s*(?:[A-Za-z]+:\s+)?)(")(.*)(",?)\s*$/;

let fixed = 0;
const out = lines.map((line) => {
  const m = line.match(STRING_LINE);
  if (!m) return line;
  let inner = m[3].replace(/\\"/g, '"');
  let isOpen = true;
  const converted = inner.replace(/"/g, () => {
    const q = isOpen ? "\u201C" : "\u201D";
    isOpen = !isOpen;
    return q;
  });
  if (converted !== m[3]) fixed += 1;
  return m[1] + '"' + converted + m[4];
});

fs.writeFileSync(PATH, out.join("\n"));
console.log(`Fixed ${fixed} string lines.`);
