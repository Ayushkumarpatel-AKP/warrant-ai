// Turns a spoken problem statement into a runnable scenario draft.

import { NextRequest } from "next/server";
import { draftScenario } from "@/lib/scenarioDraft";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { transcript } = await req.json();

    if (typeof transcript !== "string" || transcript.trim().length < 15) {
      return Response.json(
        {
          error:
            "Describe the scenario in a sentence or two — who the bot is, what secret it holds, and who is trying to get it.",
        },
        { status: 400 }
      );
    }
    if (transcript.length > 4000) {
      return Response.json({ error: "That description is too long." }, { status: 413 });
    }

    const draft = await draftScenario(transcript);
    return Response.json(draft);
  } catch (err) {
    // The drafter's failures are provider failures, so the raw message can
    // include an upstream status line or response body. Log it and report
    // generically.
    console.error("[warrant] POST /api/scenario/draft failed:", err);
    return Response.json(
      { error: "Could not draft a scenario from that description." },
      { status: 500 }
    );
  }
}
