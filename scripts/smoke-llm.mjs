/** Smoke test — z-ai-web-dev-sdk server-side import (feature 11 pre-check). */
async function main() {
  const { createRequire } = await import("module");
  const appRequire = createRequire("/home/z/my-project/apps/web/package.json");
  const entry = appRequire.resolve("z-ai-web-dev-sdk");
  const { default: ZAI } = await import(entry);
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: "You are a trading coach. Reply in one short sentence." },
      { role: "user", content: "Say hello in English and confirm you are ready." },
    ],
    thinking: { type: "disabled" },
  });
  const text = completion.choices[0]?.message?.content ?? "";
  console.log("RESPONSE:", text.slice(0, 200));
  if (!text.trim()) throw new Error("Empty response");
  console.log("SMOKE PASS");
}

main().catch((err) => {
  console.error("SMOKE FAIL:", err?.message ?? err);
  process.exit(1);
});
