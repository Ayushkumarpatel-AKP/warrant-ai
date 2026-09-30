// Turns a finished SafetyReport into a downloadable file: a self-contained HTML
// report (prints to PDF), or a complete plain-text / Markdown log of every run.

import { NextRequest } from "next/server";
import { renderReportHTML, renderReportText } from "@/lib/report";
import type { SafetyReport } from "@/lib/suite";

export const runtime = "nodejs";

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
  const { report, format } = body as { report?: SafetyReport; format?: "html" | "text" };
  if (!report || typeof report !== "object") {
    return Response.json({ error: "report is required." }, { status: 400 });
  }

  try {
    const safe = (report.name || "agent").replace(/[^a-z0-9-_]+/gi, "-");

    if (format === "text") {
      return new Response(renderReportText(report), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="warrant-${safe}.txt"`,
        },
      });
    }

    return new Response(renderReportHTML(report), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="warrant-${safe}.html"`,
      },
    });
  } catch (error) {
    // A half-built report must not turn into a stack trace in the download.
    console.error("[warrant] POST /api/report failed to render:", error);
    return Response.json({ error: "Could not render that report." }, { status: 500 });
  }
}
