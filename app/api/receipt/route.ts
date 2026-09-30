import { NextRequest, NextResponse } from "next/server";
import { advanceLedger, getLatestLedgerRow } from "@/lib/ledgerStore";
import { buildReceipt, type ReceiptBuildOptions, type SingleScorecard } from "@/lib/receipt";
import type { AgentIdentity } from "@/lib/receiptShared";
import type { SafetyReport } from "@/lib/suite";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      report?: SafetyReport | SingleScorecard;
      agentIdentity?: AgentIdentity | string;
      headSha?: string;
    };
    if (!body.report || !body.agentIdentity) {
      return NextResponse.json({ error: "report and agentIdentity are required" }, { status: 400 });
    }
    const identity = typeof body.agentIdentity === "string" ? body.agentIdentity : body.agentIdentity.name;
    if (!identity.trim()) return NextResponse.json({ error: "agent identity is required" }, { status: 400 });
    const previous = await getLatestLedgerRow(identity);
    const baseOptions: ReceiptBuildOptions = { headSha: body.headSha };
    let receipt = buildReceipt(body.report, body.agentIdentity, baseOptions);
    if (previous && previous.fingerprint !== receipt.fingerprint) {
      receipt = buildReceipt(body.report, body.agentIdentity, {
        ...baseOptions,
        previousFingerprint: previous.fingerprint,
      });
    }
    await advanceLedger(receipt);
    return NextResponse.json(receipt, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // The raw failure can carry the Redis status line, a signing-seed error or
    // a local file path. It goes to the server log; the client gets a sentence
    // it can act on and nothing else.
    console.error("[warrant] POST /api/receipt failed:", error);
    return NextResponse.json(
      { error: "Could not issue the receipt. Check the server log for the detail." },
      { status: 500 }
    );
  }
}
