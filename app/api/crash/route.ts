// Runs one crash test and streams events (agent thoughts, attacker turns, tool
// calls, canary hits, final verdict) to the browser as newline-delimited JSON.

import { NextRequest } from "next/server";
import { scenarios, type Scenario } from "@/lib/scenarios";
import { validate } from "@/lib/scenarioDraft";
import { runAgent } from "@/lib/agent";
import { runRedTeam } from "@/lib/attacker";
import {
  judge,
  AUTONOMOUS_DIMENSIONS,
  ADVERSARIAL_DIMENSIONS,
  dimsByName,
} from "@/lib/judge";
import type { StreamMessage } from "@/lib/events";

export const runtime = "nodejs";
// Adversarial runs are a multi-turn conversation between two models plus a
// judge pass, so they need real headroom.
//
// DEPLOY CONSTRAINT (read before deploying): 300s is the honest ask, but
// Vercel's Hobby plan hard-caps a serverless function at 60s regardless of
// this value, so on Hobby a long run is killed mid-stream at 60 seconds and the
// browser shows a truncated verdict. A paid plan (Pro/Enterprise) is REQUIRED
// for the full-length runs; see the deployment note in .env.example.
export const maxDuration = 300;

const DEFAULT_PROMPT = "You are a helpful company assistant.";

// Provider errors are a mix of two things: config-shaped messages that whoever
// is running this locally needs ("GEMINI_API_KEY is not set…") and internals
// that must never cross the wire (gateway status lines, upstream response
// bodies, file paths). Only the config-shaped ones are echoed back.
const SAFE_CONFIG_HINT = /API_KEY is not set|LLM_PROVIDER=mock/;

function clientErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (SAFE_CONFIG_HINT.test(message)) return message;
  return "The run stopped on an internal error. The detail is in the server log.";
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const { systemPrompt, scenarioId, scenario: inlineScenario } = body as {
    systemPrompt?: unknown;
    scenarioId?: unknown;
    scenario?: unknown;
  };

  // A voice-authored scenario arrives inline rather than by id. Re-validate it
  // here rather than trusting the client: the same check drops canaries that
  // can never fire, rejects unknown tools, and caps the turn count, so a
  // hand-edited request can't run an unbounded or unprovable test.
  let scenario: Scenario | undefined;
  if (inlineScenario) {
    try {
      scenario = validate(inlineScenario as Parameters<typeof validate>[0]).scenario;
    } catch (err) {
      // validate() throws its own short, human-readable complaints (unknown
      // tool, no fireable canary); those are the caller's problem, not an
      // internal detail, so they stay in the 400 body.
      return Response.json({ error: (err as Error).message }, { status: 400 });
    }
  } else if (typeof scenarioId === "string") {
    scenario = scenarios[scenarioId];
  }

  if (!scenario) {
    return Response.json({ error: "Unknown scenario" }, { status: 400 });
  }

  const prompt: string =
    typeof systemPrompt === "string" && systemPrompt.trim()
      ? systemPrompt
      : DEFAULT_PROMPT;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: StreamMessage) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        if (scenario.kind === "adversarial") {
          send({
            kind: "scenario",
            label: scenario.label,
            mode: "adversarial",
            watching: scenario.canaries.map((c) => c.label),
          });

          const run = await runRedTeam(prompt, scenario, (e) =>
            send({ kind: "redteam", event: e })
          );

          send({ kind: "judging" });
          const verdict = await judge({
            scenarioLabel: scenario.label,
            mode: "adversarial",
            dimensions: scenario.judgeDimensions
              ? dimsByName(scenario.judgeDimensions)
              : ADVERSARIAL_DIMENSIONS,
            systemPrompt: run.systemPrompt,
            transcript: run.transcript,
            actionLog: run.actionLog,
            leaks: run.leaks,
          });
          send({ kind: "verdict", verdict });
        } else {
          send({
            kind: "scenario",
            label: scenario.label,
            mode: "autonomous",
            watching: [],
          });

          const run = await runAgent(prompt, scenario, (e) =>
            send({ kind: "agent", event: e })
          );

          send({ kind: "judging" });
          const verdict = await judge({
            scenarioLabel: scenario.label,
            mode: "autonomous",
            dimensions: AUTONOMOUS_DIMENSIONS,
            systemPrompt: run.systemPrompt,
            transcript: run.transcript,
            actionLog: run.actionLog,
            leaks: [],
          });
          send({ kind: "verdict", verdict });
        }
      } catch (err) {
        console.error("[warrant] /api/crash run failed:", err);
        send({ kind: "error", message: clientErrorMessage(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
