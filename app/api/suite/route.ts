// Runs a batch of scenarios and streams progress (per-scenario start, each
// transcript turn, judging, verdict) as newline-delimited JSON, then the final
// graded report with the full per-scenario logs.
//
// This route is intentionally unauthenticated — Warrant is a local,
// single-user tool, and a leak test needs no account. What it does NOT do is
// trust the request: the two request-supplied multipliers on spend (`repeat` and
// the scenario selection) are clamped HERE, at the API boundary, so a single
// POST can never become an unbounded number of billable model calls.

import { NextRequest } from "next/server";
import {
  runSuite,
  MAX_REPEAT,
  MAX_SCENARIOS,
  type CrashConfig,
  type SafetyReport,
} from "@/lib/suite";
import { scenarios as ALL_SCENARIOS } from "@/lib/scenarios";

export const runtime = "nodejs";
// DEPLOY CONSTRAINT (read before deploying): a suite is dozens of sequential
// paid model calls, so 300s is the honest ask. Vercel's Hobby plan hard-caps a
// serverless function at 60s regardless of this value, so on Hobby the stream
// is killed mid-report at 60 seconds. A paid plan (Pro/Enterprise) is REQUIRED
// to run a full leak test; see the deployment note in .env.example.
export const maxDuration = 300;

// The system prompt is an input to EVERY trial, so an oversized prompt
// multiplies the bill exactly like `repeat` does. Generous for a real agent
// prompt; small enough that the endpoint cannot be used as free storage.
const MAX_PROMPT_CHARS = 20_000;

// Provider errors are a mix of two things: config-shaped messages that whoever
// is running this locally needs ("GEMINI_API_KEY is not set…") and internals
// that must never cross the wire (gateway status lines, upstream response
// bodies, file paths). Only the config-shaped ones are echoed back; everything
// else is logged server-side and reported generically.
const SAFE_CONFIG_HINT = /API_KEY is not set|LLM_PROVIDER=mock/;

function clientErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (SAFE_CONFIG_HINT.test(message)) return message;
  return "The run stopped on an internal error. The detail is in the server log.";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type ClampResult = { config: CrashConfig } | { error: string };

// Validates the shape of the request and clamps everything that costs money.
// Rejects the obviously malformed with 400; clamps the merely excessive
// (repeat, scenario count) instead of failing, so a stale UI value degrades to
// the cap rather than to an error.
function readConfig(body: unknown): ClampResult {
  if (!isRecord(body)) return { error: "Request body must be a JSON object." };
  const raw = body.config;
  if (!isRecord(raw)) return { error: "config is required and must be a JSON object." };

  if (raw.systemPrompt !== undefined && typeof raw.systemPrompt !== "string") {
    return { error: "config.systemPrompt must be a string." };
  }
  const systemPrompt = typeof raw.systemPrompt === "string" ? raw.systemPrompt : "";
  if (systemPrompt.length > MAX_PROMPT_CHARS) {
    return {
      error: `config.systemPrompt is too long (${systemPrompt.length} characters, max ${MAX_PROMPT_CHARS}).`,
    };
  }

  let name: string | undefined;
  if (raw.name !== undefined && raw.name !== null) {
    if (typeof raw.name !== "string") return { error: "config.name must be a string." };
    name = raw.name.slice(0, 200);
  }

  let threshold: number | undefined;
  if (raw.threshold !== undefined && raw.threshold !== null) {
    const n = Number(raw.threshold);
    if (!Number.isFinite(n) || n < 0 || n > 5) {
      return { error: "config.threshold must be a number between 0 and 5." };
    }
    threshold = n;
  }

  // The direct cost multiplier. Coerced to an integer inside [1, MAX_REPEAT]:
  // 0 / negatives / fractions / 1e9 all land on a sane value, never on a
  // billable surprise.
  let repeat = 1;
  if (raw.repeat !== undefined && raw.repeat !== null) {
    const n = Number(raw.repeat);
    if (!Number.isFinite(n)) return { error: "config.repeat must be a number." };
    repeat = Math.min(MAX_REPEAT, Math.max(1, Math.floor(n)));
  }

  // The other multiplier. An absent or empty selection means "every scenario in
  // the library", which runSuite() also caps at MAX_SCENARIOS, so the default
  // path is bounded too.
  let scenarioIds: string[] | undefined;
  if (raw.scenarioIds !== undefined && raw.scenarioIds !== null) {
    if (!Array.isArray(raw.scenarioIds) || raw.scenarioIds.some((id) => typeof id !== "string")) {
      return { error: "config.scenarioIds must be an array of scenario id strings." };
    }
    const requested = Array.from(
      new Set((raw.scenarioIds as string[]).map((id) => id.trim()).filter(Boolean))
    );
    const capped = requested.slice(0, MAX_SCENARIOS);
    if (requested.length > capped.length) {
      console.warn(
        `[warrant] /api/suite: capped scenarioIds from ${requested.length} to ${MAX_SCENARIOS}`
      );
    }
    const known = capped.filter((id) => ALL_SCENARIOS[id]);
    const unknown = capped.filter((id) => !ALL_SCENARIOS[id]);
    if (unknown.length) {
      console.warn(`[warrant] /api/suite: unknown scenario ids ignored: ${unknown.join(", ")}`);
    }
    if (capped.length && !known.length) {
      return {
        error:
          "None of the requested scenarioIds exist in this build of the attack library.",
      };
    }
    scenarioIds = known;
  }

  const config: CrashConfig = { systemPrompt, repeat };
  if (name !== undefined) config.name = name;
  if (threshold !== undefined) config.threshold = threshold;
  if (scenarioIds !== undefined) config.scenarioIds = scenarioIds;
  return { config };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = readConfig(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const config = parsed.config;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const partial = await runSuite(config, (p) => send({ ...p }));
        const report: SafetyReport = {
          ...partial,
          createdAt: new Date().toISOString(),
        };
        send({ kind: "report", report });
      } catch (err) {
        console.error("[warrant] /api/suite run failed:", err);
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
