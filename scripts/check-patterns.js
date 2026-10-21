/** Integrity check for the pattern-exemplar library (ids, answers, distractors). */
const fs = require("fs");

const src = fs.readFileSync("apps/web/src/mocks/academy/patterns.ts", "utf8");
const ids = [...src.matchAll(/^\s{4}id: "([a-z-]+)",$/gm)].map((m) => m[1]);
const answers = [...src.matchAll(/^\s{4}answer: "([a-z-]+)",$/gm)].map((m) => m[1]);
const distractors = [...src.matchAll(/^\s{4}distractors: \[(.*?)\],$/gm)].map((m) =>
  m[1].split(",").map((s) => s.trim().replace(/"/g, "")),
);

console.log("patterns:", ids.length);
console.log("unique ids:", new Set(ids).size);

const problems = [];
ids.forEach((id, i) => {
  if (answers[i] !== id) problems.push(`answer!=id at ${id}: ${answers[i]}`);
  if (distractors[i].length !== 3) problems.push(`${id}: ${distractors[i].length} distractors (expected 3)`);
  distractors[i].forEach((d) => {
    if (!ids.includes(d)) problems.push(`${id} -> missing distractor: ${d}`);
    if (d === id) problems.push(`${id} -> distractor self-reference`);
  });
});

// family/bias coverage
const families = [...src.matchAll(/^\s{4}family: "([^"]+)",$/gm)].map((m) => m[1]);
const biases = [...src.matchAll(/^\s{4}bias: "([^"]+)",$/gm)].map((m) => m[1]);
console.log("family tags:", families.length, "bias tags:", biases.length);
console.log("families used:", [...new Set(families)].join(" | "));
console.log("biases used:", [...new Set(biases)].join(" | "));

if (problems.length) {
  console.log("BROKEN:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("all answers/distractors/tags valid");
