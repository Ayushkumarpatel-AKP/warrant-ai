// Renders a SafetyReport into a single self-contained HTML document — no
// external assets — so it can be downloaded, emailed, committed as a CI
// artifact, or printed to PDF. Every scenario shows the full story: the system
// prompt the agent was given, the play-by-play transcript of what it did, any
// proven leaks, and the judge's verdict with cited evidence.

import type { SafetyReport, ScenarioReport, ReportTurn } from "./suite";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const GRADE_COLOR: Record<string, string> = {
  A: "#16a34a",
  B: "#65a30d",
  C: "#ca8a04",
  D: "#ea580c",
  F: "#dc2626",
};
const SEV_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
};

function scoreColor(stars: number): string {
  if (stars >= 4) return "#16a34a";
  if (stars >= 3) return "#65a30d";
  if (stars >= 2) return "#ca8a04";
  if (stars >= 1) return "#ea580c";
  return "#dc2626";
}

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
};

function gradeGauge(letter: string, avg: number, color: string): string {
  const size = 132, r = 56, c = size / 2, C = 2 * Math.PI * r;
  const filled = (avg / 5) * C;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#eef1f6" stroke-width="12"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="12"
      stroke-linecap="round" stroke-dasharray="${filled.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>
    <text x="${c}" y="${c - 4}" text-anchor="middle" font-size="42" font-weight="800" fill="${color}">${esc(letter)}</text>
    <text x="${c}" y="${c + 20}" text-anchor="middle" font-size="13" font-weight="600" fill="#64748b">${avg.toFixed(2)} / 5</text>
  </svg>`;
}

function dimBars(dims: SafetyReport["dimensions"]): string {
  if (!dims.length) return "";
  return dims
    .map((d) => {
      const col = scoreColor(d.avgStars);
      return `<div class="bar-row">
        <div class="bar-name">${esc(d.name)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${((d.avgStars / 5) * 100).toFixed(0)}%;background:${col}"></div></div>
        <div class="bar-val">${d.avgStars.toFixed(1)}</div>
        <div class="bar-trig">${
          d.triggeredRate > 0
            ? `<span class="tag danger">${(d.triggeredRate * 100).toFixed(0)}% triggered</span>`
            : `<span class="tag ok">clean</span>`
        }</div>
      </div>`;
    })
    .join("");
}

function renderTurn(t: ReportTurn): string {
  if (t.role === "tool")
    return `<div class="turn tool"><span class="who">→ tool call · ${esc(
      t.tool
    )}</span><pre>${esc(JSON.stringify(t.input))}</pre>${
      t.output
        ? `<div class="tool-out"><span class="who">← returned</span><pre>${esc(
            t.output
          )}</pre></div>`
        : ""
    }</div>`;
  if (t.role === "leak")
    return `<div class="turn leak"><span class="who">⚠ LEAK · ${esc(
      t.label
    )} <em>[${esc(t.severity)}]</em></span><div class="txt">${esc(t.excerpt)}</div></div>`;
  const who =
    t.role === "attacker"
      ? `Attacker${t.tactic ? ` · ${esc(t.tactic)}` : ""}`
      : t.role === "bot"
      ? "Agent under test"
      : "Agent";
  return `<div class="turn ${t.role}"><span class="who">${who}</span><div class="txt">${esc(
    t.text
  )}</div></div>`;
}

function scenarioSection(s: ScenarioReport): string {
  const col = scoreColor(s.verdict.star_rating);
  const leaks = s.verdict.leaks ?? [];
  return `<section class="case" style="border-left-color:${col}">
    <div class="case-head">
      <div>
        <div class="case-title">${esc(s.label)}</div>
        <div class="case-sub"><span class="cat">${esc(s.category)}</span> · ${esc(
    s.dimension
  )} · ${esc(s.mode)} · ${esc(s.description)}</div>
      </div>
      <span class="pill" style="background:${col}1a;color:${col};border:1px solid ${col}55">${
    s.failed ? "FAILED" : "PASSED"
  } · ${s.verdict.star_rating}/5</span>
    </div>

    <div class="verdict-line">${esc(s.verdict.headline)}</div>
    <p class="explain">${esc(s.verdict.explanation)}</p>

    ${
      leaks.length
        ? `<div class="leaks-box"><b>Proven leaks (deterministic):</b>${leaks
            .map(
              (l) =>
                `<div class="leak-item"><span style="color:${
                  SEV_COLOR[l.severity] || "#dc2626"
                }">[${esc(l.severity)}]</span> ${esc(l.label)} — turn ${
                  l.turn + 1
                }: “${esc(l.excerpt)}”</div>`
            )
            .join("")}</div>`
        : ""
    }

    <div class="findings">${s.verdict.dimensions
      .map(
        (d) =>
          `<div class="finding ${d.triggered ? "trig" : "ok"}"><b>${
            d.triggered ? "✕" : "✓"
          } ${esc(d.name)}</b>${
            d.cited_message
              ? `<blockquote>“${esc(d.cited_message)}”</blockquote>`
              : ""
          }<span class="reason">${esc(d.reasoning)}</span></div>`
      )
      .join("")}</div>

    <details class="drop">
      <summary>System prompt the agent was given</summary>
      <pre class="sysprompt">${esc(s.systemPrompt)}</pre>
    </details>

    <details class="drop" open>
      <summary>Transcript — what actually happened (${s.transcript.length} events)</summary>
      <div class="transcript">${
        s.transcript.map(renderTurn).join("") ||
        '<div class="empty">No events recorded.</div>'
      }</div>
    </details>
  </section>`;
}

export function renderReportHTML(report: SafetyReport): string {
  const g = report.overall.letter;
  const color = GRADE_COLOR[g] || "#64748b";
  const nFailed = report.scenarios.filter((s) => s.failed).length;
  const nTrig = report.dimensions.filter((d) => d.triggeredRate > 0).length;

  // Group scenarios by category for a clean table of contents.
  const byCat = new Map<string, ScenarioReport[]>();
  for (const s of report.scenarios) {
    const arr = byCat.get(s.category) ?? [];
    arr.push(s);
    byCat.set(s.category, arr);
  }
  const sections = Array.from(byCat.entries())
    .map(
      ([cat, list]: [string, ScenarioReport[]]) =>
        `<h2 class="cat-h">${esc(cat)} <span class="cat-count">${
          list.filter((s) => s.failed).length
        }/${list.length} failed</span></h2>${list.map(scenarioSection).join("")}`
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Warrant report — ${esc(report.name)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#eef1f6;color:#0f172a;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .page{max-width:900px;margin:32px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(15,23,42,.08)}
  .cover{display:flex;align-items:center;gap:26px;padding:34px 40px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff}
  .cover .gauge{background:#fff;border-radius:50%;padding:6px;flex:none;box-shadow:0 6px 18px rgba(0,0,0,.18)}
  .cover h1{margin:0;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.85}
  .cover .agent{font-size:26px;font-weight:800;margin:2px 0 8px;letter-spacing:-.02em}
  .cover .meta{font-size:12.5px;opacity:.9}
  .verdict-chip{display:inline-block;margin-top:12px;padding:7px 14px;border-radius:999px;font-weight:700;font-size:13px}
  .verdict-chip.pass{background:rgba(220,252,231,.95);color:#166534}
  .verdict-chip.fail{background:rgba(254,226,226,.95);color:#991b1b}
  .body{padding:30px 40px 40px}
  .tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:26px}
  .tile{background:#f8fafc;border:1px solid #eef1f6;border-radius:14px;padding:16px 18px}
  .tile .n{font-size:28px;font-weight:800} .tile .l{font-size:12px;color:#64748b;margin-top:2px}
  h2{font-size:16px;font-weight:800;margin:26px 0 12px}
  .cat-h{border-top:2px solid #eef1f6;padding-top:20px;display:flex;justify-content:space-between;align-items:baseline}
  .cat-count{font-size:12px;font-weight:600;color:#94a3b8}
  .bar-row{display:grid;grid-template-columns:150px 1fr 30px 110px;align-items:center;gap:10px;margin:8px 0}
  .bar-name{font-size:11px;font-weight:700;color:#334155}
  .bar-track{height:9px;background:#eef1f6;border-radius:999px;overflow:hidden}
  .bar-fill{height:100%;border-radius:999px}
  .bar-val{font-size:12px;font-weight:700;text-align:right}
  .tag{font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;white-space:nowrap}
  .tag.danger{background:#fef2f2;color:#dc2626} .tag.ok{background:#f0fdf4;color:#16a34a}
  .case{background:#fff;border:1px solid #eef1f6;border-left:4px solid #ccc;border-radius:12px;padding:16px 18px;margin:12px 0}
  .case-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
  .case-title{font-weight:800;font-size:15px}
  .case-sub{font-size:11.5px;color:#64748b;margin-top:3px}
  .cat{font-weight:700;color:#7c3aed}
  .pill{font-size:11px;font-weight:800;padding:5px 11px;border-radius:999px;white-space:nowrap}
  .verdict-line{font-weight:700;margin-top:12px}
  .explain{color:#475569;font-size:13px;margin:4px 0 10px}
  .findings{display:flex;flex-direction:column;gap:8px;margin-bottom:6px}
  .finding{background:#fafafa;border:1px solid #eef1f6;border-radius:8px;padding:9px 11px;font-size:12.5px}
  .finding.trig b{color:#b91c1c} .finding.ok b{color:#16a34a} .finding .reason{display:block;color:#475569;margin-top:4px}
  .finding blockquote{margin:6px 0;padding:6px 10px;border-left:3px solid #dc2626;background:#fff;color:#7f1d1d;font-style:italic}
  .leaks-box{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;font-size:12px;margin-bottom:10px}
  .leak-item{margin-top:5px;color:#7f1d1d}
  .tool-out{margin-top:6px;border-top:1px dashed #cbd5e1;padding-top:6px}
  .tool-out .who{color:#64748b}
  .drop{margin-top:12px;border-top:1px dashed #eef1f6;padding-top:8px}
  .drop summary{cursor:pointer;font-size:12px;font-weight:700;color:#475569;user-select:none}
  .sysprompt{background:#0f172a;color:#cbd5e1;border-radius:10px;padding:14px;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.6;margin-top:10px;max-height:320px;overflow:auto}
  .transcript{margin-top:10px;display:flex;flex-direction:column;gap:8px}
  .turn{border-radius:10px;padding:9px 12px;font-size:12.5px}
  .turn .who{display:block;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px;color:#64748b}
  .turn .txt{white-space:pre-wrap}
  .turn.attacker{background:#fff7ed;border:1px solid #fed7aa}.turn.attacker .who{color:#c2410c}
  .turn.bot,.turn.agent{background:#f8fafc;border:1px solid #e2e8f0}.turn.bot .who,.turn.agent .who{color:#4f46e5}
  .turn.tool{background:#f1f5f9;border:1px solid #e2e8f0;font-family:ui-monospace,Menlo,monospace}
  .turn.tool pre{margin:2px 0 0;white-space:pre-wrap;font-size:11.5px;color:#334155}
  .turn.leak{background:#fef2f2;border:1px solid #fecaca}.turn.leak .who{color:#b91c1c}
  .turn.leak .txt{color:#7f1d1d;font-style:italic}
  .empty{color:#94a3b8;font-size:12px}
  footer{padding:20px 40px;border-top:1px solid #eef1f6;color:#94a3b8;font-size:12px;text-align:center}
  @media print{body{background:#fff}.page{box-shadow:none;margin:0;border-radius:0}.case,.drop{break-inside:avoid}details{open:true}}
</style></head>
<body><div class="page">
  <div class="cover">
    <div class="gauge">${gradeGauge(g, report.overall.avgStars, color)}</div>
    <div>
      <h1>Warrant · Agent Safety Report</h1>
      <div class="agent">${esc(report.name)}</div>
      <div class="meta">${fmtDate(report.createdAt)} · gate ≥ ${report.threshold.toFixed(
    1
  )}/5 · ${report.scenarios.length} scenarios</div>
      <div class="verdict-chip ${report.overall.passed ? "pass" : "fail"}">${
    report.overall.passed ? "✓ Passed safety gate" : "✕ Failed safety gate"
  }</div>
    </div>
  </div>
  <div class="body">
    <div class="tiles">
      <div class="tile"><div class="n" style="color:${color}">${g}</div><div class="l">Overall grade · ${report.overall.avgStars.toFixed(
    2
  )}/5</div></div>
      <div class="tile"><div class="n" style="color:${
        nFailed ? "#dc2626" : "#16a34a"
      }">${nFailed}/${report.scenarios.length}</div><div class="l">Scenarios failed</div></div>
      <div class="tile"><div class="n" style="color:${
        nTrig ? "#ea580c" : "#16a34a"
      }">${nTrig}</div><div class="l">Harm dimensions triggered</div></div>
    </div>
    <h2>Harm profile</h2>
    ${dimBars(report.dimensions)}
    ${sections}
  </div>
  <footer>Generated by Warrant — pre-deployment safety ratings for AI agents.</footer>
</div></body></html>`;
}

// ── Plain-text / Markdown report ─────────────────────────────────────────────
// A complete, verbatim log of every run — every attacker prompt, every agent
// reply, every tool call + result, every leak, and the full verdict reasoning.
// This is the "give me everything, in text" export (works for text AND voice
// scenarios, since voice runs go through the same red-team engine).

function turnText(t: ReportTurn, i: number): string {
  const n = String(i + 1).padStart(2, "0");
  if (t.role === "tool")
    return `  [${n}] TOOL CALL → ${t.tool}\n        input:  ${JSON.stringify(
      t.input
    )}${t.output ? `\n        result: ${t.output.replace(/\n/g, "\n                ")}` : ""}`;
  if (t.role === "leak")
    return `  [${n}] ⚠ LEAK · ${t.label} [${t.severity}]\n        "${t.excerpt}"`;
  const who =
    t.role === "attacker"
      ? `ATTACKER${t.tactic ? ` (${t.tactic})` : ""}`
      : t.role === "bot"
      ? "AGENT UNDER TEST"
      : "AGENT";
  return `  [${n}] ${who}:\n        ${String(t.text).replace(/\n/g, "\n        ")}`;
}

export function renderReportText(report: SafetyReport): string {
  const L: string[] = [];
  const rule = "=".repeat(72);
  L.push(rule);
  L.push(`WARRANT — AGENT SAFETY REPORT (full log)`);
  L.push(`Agent:      ${report.name}`);
  L.push(`Generated:  ${fmtDate(report.createdAt)}`);
  L.push(
    `Overall:    Grade ${report.overall.letter}  (${report.overall.avgStars.toFixed(
      2
    )}/5)  —  ${report.overall.passed ? "PASSED" : "FAILED"} gate ≥ ${report.threshold.toFixed(
      1
    )}`
  );
  L.push(
    `Scenarios:  ${report.scenarios.length} run · ${
      report.scenarios.filter((s) => s.failed).length
    } failed`
  );
  L.push(rule);
  L.push("");
  L.push("HARM PROFILE");
  for (const d of report.dimensions)
    L.push(
      `  ${d.name.padEnd(22)} ${d.avgStars.toFixed(1)}/5   ${
        d.triggeredRate > 0
          ? `${(d.triggeredRate * 100).toFixed(0)}% triggered`
          : "clean"
      }`
    );
  L.push("");

  for (const s of report.scenarios) {
    L.push(rule);
    L.push(
      `SCENARIO: ${s.label}   [${s.failed ? "FAILED" : "PASSED"} · ${
        s.verdict.star_rating
      }/5]`
    );
    L.push(`Category: ${s.category}  |  Mode: ${s.mode}  |  Target: ${s.dimension}`);
    L.push(`${s.description}`);
    L.push(rule);
    L.push("");
    L.push("--- SYSTEM PROMPT GIVEN TO THE AGENT ---");
    L.push(s.systemPrompt);
    L.push("");
    L.push(`--- TRANSCRIPT (${s.transcript.length} events) ---`);
    if (!s.transcript.length) L.push("  (no events recorded)");
    s.transcript.forEach((t, i) => L.push(turnText(t, i)));
    L.push("");
    const leaks = s.verdict.leaks ?? [];
    if (leaks.length) {
      L.push("--- PROVEN LEAKS (deterministic string match) ---");
      for (const l of leaks)
        L.push(`  [${l.severity}] ${l.label} — turn ${l.turn + 1}: "${l.excerpt}"`);
      L.push("");
    }
    L.push("--- VERDICT ---");
    L.push(`  Headline: ${s.verdict.headline}`);
    L.push(`  ${s.verdict.explanation}`);
    for (const d of s.verdict.dimensions) {
      L.push(`  ${d.triggered ? "✕ FAIL" : "✓ pass"}  ${d.name}`);
      if (d.cited_message) L.push(`        cited: "${d.cited_message}"`);
      if (d.reasoning) L.push(`        why:   ${d.reasoning}`);
    }
    L.push("");
  }
  L.push(rule);
  L.push("Generated by Warrant.");
  return L.join("\n");
}
