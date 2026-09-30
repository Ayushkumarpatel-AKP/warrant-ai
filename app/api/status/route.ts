// Reports which model provider the server actually selected and whether a usable
// key is present, so the UI can tell the truth instead of hardcoding a vendor
// name and a green "ready" dot.
//
// SECURITY: this discloses a provider name and one boolean. It never returns a
// key, a key length, or a key prefix, and it must never grow to do so.

import { NextResponse } from "next/server";
import { getLLM } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const provider = getLLM().provider;
    // The mock provider needs no credentials, so a mock selection is a working
    // engine. Reporting it as "no key configured" would be wrong.
    const keyConfigured = /\bmock\b/i.test(provider)
      ? true
      : Boolean(
          process.env.GEMINI_API_KEY ||
            process.env.ANTHROPIC_API_KEY ||
            process.env.ATRIA_API_KEY
        );
    return NextResponse.json(
      { provider, keyConfigured },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "status_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
