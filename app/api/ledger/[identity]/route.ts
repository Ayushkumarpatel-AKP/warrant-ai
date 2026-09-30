import { NextRequest, NextResponse } from "next/server";
import { getLatestLedgerRow } from "@/lib/ledgerStore";

export const runtime = "nodejs";

// An agent identity is a human label ("Acme Support Bot") or the PR-gate form
// ("pr-gate:owner/name#12"), so ordinary punctuation is expected and allowed.
// What is not allowed is a control character or an absurd length: this value is
// echoed into a ledger key and into log lines.
const IDENTITY_MAX = 256;
const IDENTITY_RE = /^[^\p{Cc}]+$/u;

export async function GET(_req: NextRequest, { params }: { params: { identity: string } }) {
  // Next.js has ALREADY percent-decoded params.identity, so decoding it a
  // second time here threw URIError on any value containing a stray '%' and
  // surfaced as a 500. Use the value as given and validate it instead.
  const identity = params.identity;
  if (typeof identity !== "string" || !IDENTITY_RE.test(identity) || identity.length > IDENTITY_MAX) {
    return NextResponse.json({ error: "Malformed agent identity." }, { status: 400 });
  }

  try {
    const row = await getLatestLedgerRow(identity);
    if (!row) return NextResponse.json({ error: "No receipt for this identity" }, { status: 404 });
    return NextResponse.json(
      { fingerprint: row.fingerprint, issued_at: row.issued_at },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    // A ledger outage must not answer with the Upstash URL, its status code or
    // the local ledger path.
    console.error(`[warrant] GET /api/ledger failed for ${JSON.stringify(identity)}:`, error);
    return NextResponse.json(
      { error: "The receipt ledger is unavailable." },
      { status: 503 }
    );
  }
}
