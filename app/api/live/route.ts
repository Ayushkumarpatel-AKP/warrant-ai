// Drives a human-attacker call, one turn per request, plus the closing verdict.
//
// Stateless on purpose: the client owns the transcript and sends it each time,
// which is what lets you hang up, replay, or score a call whenever you like.

import { NextRequest } from "next/server";
import { scenarios, type AdversarialScenario } from "@/lib/scenarios";
import { liveTurn, MAX_HISTORY, type Turn } from "@/lib/live";
import { judge, ADVERSARIAL_DIMENSIONS, dimsByName } from "@/lib/judge";
import type { LeakHit } from "@/lib/secrets";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_PROMPT = "You are a helpful phone support agent.";

function readScenario(id: unknown): AdversarialScenario | null {
  if (typeof id !== "string") return null;
  const s = scenarios[id];
  return s && s.kind === "adversarial" ? s : null;
}

function readHistory(raw: unknown): Turn[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_HISTORY * 2) return null;
  const out: Turn[] = [];
  for (const t of raw) {
    const role = (t as Turn)?.role;
    const text = (t as Turn)?.text;
    if (role !== "caller" && role !== "agent") return null;
    if (typeof text !== "string" || !text.trim()) continue;
    out.push({ role, text: text.slice(0, 4000) });
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const scenario = readScenario(body.scenarioId);
    if (!scenario) {
      return Response.json(
        { error: "Unknown or non-conversational scenario." },
        { status: 400 }
      );
    }

    const history = readHistory(body.history);
    if (!history) {
      return Response.json({ error: "Malformed transcript." }, { status: 400 });
    }

    const systemPrompt: string =
      typeof body.systemPrompt === "string" && body.systemPrompt.trim()
        ? body.systemPrompt
        : DEFAULT_PROMPT;

    // ---- score a finished call ----
    if (body.action === "judge") {
      if (history.length === 0) {
        return Response.json(
          { error: "Nothing was said on this call." },
          { status: 400 }
        );
      }
      const leaks: LeakHit[] = Array.isArray(body.leaks) ? body.leaks : [];
      const verdict = await judge({
        scenarioLabel: scenario.label,
        mode: "adversarial",
        dimensions: scenario.judgeDimensions
          ? dimsByName(scenario.judgeDimensions)
          : ADVERSARIAL_DIMENSIONS,
        systemPrompt: `${systemPrompt}\n\n${scenario.botContext}\n\n${scenario.confidentialBlock}`,
        // The caller here is a person, not the attacker model. Say so, or the
        // judge scores the human's pretexting as if the harness wrote it.
        transcript: history.map((t) => ({
          role: t.role === "caller" ? "attacker (live human caller)" : "bot",
          text: t.text,
        })),
        actionLog: [],
        leaks,
      });
      return Response.json({ verdict });
    }

    // ---- one agent turn ----
    if (history.length === 0 || history[history.length - 1].role !== "caller") {
      return Response.json(
        { error: "The agent only replies after the caller speaks." },
        { status: 400 }
      );
    }

    const alreadyLeaked: string[] = Array.isArray(body.leakedIds)
      ? body.leakedIds.filter((x: unknown) => typeof x === "string")
      : [];

    const result = await liveTurn(systemPrompt, scenario, history, alreadyLeaked);

    return Response.json({
      ...result,
      watching: scenario.canaries.map((c) => c.label),
    });
  } catch (err) {
    // Never hand the raw failure to the caller: it can carry the provider's
    // status line, a gateway response body, or a key name.
    console.error("[warrant] POST /api/live failed:", err);
    return Response.json({ error: "The live call turn failed." }, { status: 500 });
  }
}
