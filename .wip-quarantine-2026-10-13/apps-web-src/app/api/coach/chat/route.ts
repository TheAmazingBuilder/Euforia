import { NextResponse } from "next/server";
import type { CoachChatRequest } from "@cosmoz/shared";

import { coachChatRequestSchema } from "@cosmoz/shared";

/**
 * POST /api/coach/chat — feature 11 (Priorité 3).
 *
 * The client owns the DATA: it builds a compact snapshot of the journal
 * (totals, strategies, mistakes, violations, recent trades) from the query
 * caches it already holds and posts it with the conversation. This route is
 * stateless: it composes the system prompt around the snapshot, calls the
 * LLM (z-ai-web-dev-sdk, server-side only) and returns the reply.
 *
 * Works identically in mocked dev mode (MSW bypasses unhandled requests,
 * so fetches reach this real handler) and against the future real backend.
 */

// The SDK loads env credentials at create() time — node runtime required.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many conversation turns are forwarded to the model (token budget). */
const MAX_TURNS = 12;

const SYSTEM_PROMPT = `You are the COSMOZ Coach — a professional trading performance coach embedded in COSMOZ, a trading journal app. You talk WITH the trader ABOUT the trader's own journal data.

Philosophy (never violate):
- Process over outcome. The trader's only controllable edge is discipline.
- Gamify the process, never the P&L. Praise rule-following, question rule-breaking — regardless of whether the trade won or lost.
- Never give market predictions, trade signals or "should I buy X" answers. Coach the behavior, not the market.

Grounding rules:
- A DATA snapshot of the trader's journal is provided below. Ground every factual claim in it. Quote real numbers.
- Never invent numbers. If the snapshot cannot answer the question, say exactly which data is missing and suggest what to journal next.
- Prefer patterns over anecdotes: strategy edges and decay, mistake frequency and R cost, emotion clusters, discipline streaks.

Style rules:
- Reply in the SAME LANGUAGE as the user's last message.
- Maximum ~180 words unless the user explicitly asks for depth. Short paragraphs or tight bullets. Bold key numbers with **…** when helpful.
- Direct, warm, no fluff, no hedging. One concrete action at the end when the situation calls for it.`;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

async function callModel(
  systemPrompt: string,
  turns: ChatTurn[],
): Promise<string> {
  const { default: ZAI } = await import("z-ai-web-dev-sdk");
  const zai = await ZAI.create();

  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: systemPrompt },
      ...turns,
    ],
    thinking: { type: "disabled" },
  });

  const reply = completion.choices[0]?.message?.content ?? "";
  if (reply.trim() === "") {
    throw new Error("Empty coach reply");
  }
  return reply;
}

export async function POST(request: Request) {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const validated = coachChatRequestSchema.safeParse(parsedBody);
  if (!validated.success) {
    return NextResponse.json(
      { error: "Invalid chat payload.", issues: validated.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const body: CoachChatRequest = validated.data;

  // Token budget: keep only the most recent turns (the client already caps).
  const turns: ChatTurn[] = body.messages
    .slice(-MAX_TURNS)
    .map((message) => ({ role: message.role, content: message.content }));

  const systemPrompt = `${SYSTEM_PROMPT}\n\nDATA snapshot (JSON):\n${JSON.stringify(
    body.context,
  )}`;

  try {
    const reply = await callModel(systemPrompt, turns);
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("[coach/chat] model call failed:", error);
    return NextResponse.json(
      { error: "The coach is unavailable right now. Please try again in a moment." },
      { status: 502 },
    );
  }
}
