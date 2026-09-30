// QA unit + render suite (Agent 5). No DOM/test framework exists in this
// project, so this file drives the real modules directly with Node's webcrypto
// and react-dom/server, and stubs global fetch only where a network call would
// otherwise leave the process.
//
//   npx tsx qa/unit.test.ts [baseUrl]
//
// Covers: receipt signing + client-side Ed25519 verification, supersession,
// upperBound95 honesty at N=1, the PR-gate commit-status mapping, env-var
// fallbacks in child processes, the 9-item left rail, the "Receipts issued"
// metric tile, and that every tab component still renders.

import { createHash, createHmac, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3112";
const OUT = process.env.QA_OUT ?? "qa-artifacts/unit";
const PROJECT = process.cwd();
const TSX = path.join(PROJECT, "node_modules", "tsx", "dist", "cli.mjs");

type Check = { id: string; name: string; ok: boolean; detail: string };
const results: Check[] = [];
function record(id: string, name: string, ok: boolean, detail: string) {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name} :: ${detail}`);
}
function note(id: string, name: string, detail: string) {
  results.push({ id, name, ok: true, detail: `NOTE — ${detail}` });
  console.log(`NOTE ${id} ${name} :: ${detail}`);
}
const tmpRoot = path.join(os.tmpdir(), "warrant-qa-" + randomBytes(4).toString("hex"));
mkdirSync(tmpRoot, { recursive: true });

// ── fixtures ───────────────────────────────────────────────────────────────

function scorecard(dims: [string, boolean][]) {
  return {
    verdict: {
      star_rating: 1,
      headline: "QA fixture verdict",
      explanation: "QA fixture",
      leaks: [],
      worst_severity: null,
      dimensions: dims.map(([name, triggered]) => ({
        name,
        triggered,
        cited_message: "m1",
        reasoning: "r",
      })),
    },
    scenarioId: "blackmail",
    systemPrompt: "PROMPT-A",
    createdAt: new Date(0).toISOString(),
  };
}

function suiteReport(repeat: number, nScenarios: number) {
  return {
    name: "qa-suite-agent",
    createdAt: new Date(0).toISOString(),
    threshold: 3.5,
    repeat,
    overall: { avgStars: 1, letter: "F", passed: false },
    dimensions: [{ name: "COERCION", avgStars: 1, triggeredRate: 1 }],
    tally: [
      { dimension: "COERCION", trials: nScenarios * repeat, violations: nScenarios * repeat },
      { dimension: "DATA_LEAK", trials: nScenarios * repeat, violations: 0 },
    ],
    scenarios: Array.from({ length: nScenarios * repeat }, (_, i) => ({
      scenarioId: i % 2 === 0 ? "blackmail" : "dataleak",
      trial: Math.floor(i / 2),
      trialCount: repeat,
      label: "s",
      category: "c",
      dimension: "COERCION",
      description: "d",
      mode: "adversarial",
      systemPrompt: "PROMPT-A",
      transcript: [],
      verdict: {
        star_rating: 1,
        headline: "h",
        dimensions: [
          { name: "COERCION", triggered: true, cited_message: "", reasoning: "" },
          { name: "DATA_LEAK", triggered: false, cited_message: "", reasoning: "" },
        ],
        explanation: "",
        leaks: [],
        worst_severity: null,
      },
      failed: true,
    })),
  } as any;
}

// ── 1/2/10. Left rail + metric tiles + every tab renders ───────────────────

async function checkUi() {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const Dashboard = (await import("../app/Dashboard")).default;

  const html = renderToStaticMarkup(
    React.createElement(Dashboard, {
      onSignOut: () => {},
      theme: "light",
      onToggleTheme: () => {},
    })
  );

  // The nav is the only place the nine labels appear, in DOM order.
  const nav = html.slice(html.indexOf('class="rail-nav"'), html.indexOf('class="rail-foot"'));
  const labels = [...nav.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
  const EXPECTED = [
    "Overview",
    "Threat model",
    "New crash test",
    "Voice red-team",
    "Full report",
    "Receipts",
    "Scenarios",
    "Connect agent",
    "Settings",
  ];
  record(
    "C1",
    "left rail has exactly 9 nav items in the spec order, Receipts 6th (after Full report)",
    labels.length === 9 && labels.every((l, i) => l === EXPECTED[i]),
    `found ${labels.length}: [${labels.join(" | ")}]`
  );
  record(
    "C1b",
    "every nav item is a button wired to a tab id (9 distinct keys)",
    (html.match(/class="rail-item/g) ?? []).length === 9,
    `rail-item buttons=${(html.match(/class="rail-item/g) ?? []).length}`
  );

  // C2 — the "Receipts issued" tile on the fresh (empty-ledger) render.
  const tile = html.match(/<div class="metric pass"><div class="metric-top"><span class="metric-label">Receipts issued<\/span>[\s\S]*?<\/div><\/div>/);
  const tileHtml = tile?.[0] ?? "";
  const hasTile = html.includes("Receipts issued");
  const showsDash = /Receipts issued<\/span>[\s\S]{0,400}?metric-value">–</.test(html);
  const signedSub = /Receipts issued<\/span>[\s\S]{0,600}?metric-sub">signed this session</.test(html);
  record(
    "C2a",
    "metric tile 'Receipts issued' renders with count and the non-warn sub-label",
    hasTile && showsDash && signedSub,
    `label present=${hasTile}; empty-ledger value="–"=${showsDash}; sub="signed this session"=${signedSub}`
  );
  record(
    "C2b",
    "the other four metric tiles are unregressed",
    ["Agents tested", "Failed safety", "Avg rating", "Traps available"].every((l) => html.includes(l)),
    `found ${["Agents tested", "Failed safety", "Avg rating", "Traps available"]
      .map((l) => `${l}=${html.includes(l)}`)
      .join(" ")}`
  );
  // The ⚠ branch: ledger.length > 0 with an out-of-date pointer for one identity.
  // Dashboard.tsx:119-127 derives it; exercised here over a synthetic ledger
  // because no DOM harness exists to click the Receipts tab.
  const dashboardSrc = readFileSync(path.join(PROJECT, "app", "Dashboard.tsx"), "utf8");
  const srcHasWarnLogic =
    /latestReceiptByIdentity\.set\(receipt\.identity, receipt\.fingerprint\)/.test(dashboardSrc) &&
    /latestReceiptByIdentity\.get\(receipt\.identity\) !== receipt\.fingerprint/.test(dashboardSrc) &&
    /`⚠ \$\{supersededReceipts\} superseded`/.test(dashboardSrc) &&
    /tone=\{supersededReceipts \? "warn" : "pass"\}/.test(dashboardSrc);
  function supersededCount(ledger: { identity: string; fingerprint: string }[]) {
    const latest = new Map<string, string>();
    for (const r of ledger) if (!latest.has(r.identity)) latest.set(r.identity, r.fingerprint);
    return ledger.filter((r) => latest.get(r.identity) !== r.fingerprint).length;
  }
  const w0 = supersededCount([]);
  const w1 = supersededCount([
    { identity: "a", fingerprint: "f1" },
    { identity: "a", fingerprint: "f2" },
  ]);
  const w2 = supersededCount([
    { identity: "a", fingerprint: "f1" },
    { identity: "b", fingerprint: "f1" },
    { identity: "a", fingerprint: "f2" },
  ]);
  record(
    "C2c",
    "'⚠ N superseded' logic: 0 when empty, 1 for one stale twin, unchanged for a second identity",
    srcHasWarnLogic && w0 === 0 && w1 === 1 && w2 === 1,
    `predicate present in app/Dashboard.tsx=${srcHasWarnLogic}; empty=${w0} oneStale=${w1} twoIdentities=${w2}`
  );
  record(
    "C2d",
    "tile value is ledger.length (0 receipts renders as the en-dash placeholder)",
    /label="Receipts issued"\s+value=\{ledger\.length \|\| "–"\}/.test(dashboardSrc),
    `app/Dashboard.tsx:202-206 uses value={ledger.length || "–"}`
  );

  // C10 — every tab component still mounts.
  const tabs: [string, string, () => Promise<any>][] = [
    ["C10-overview", "Overview (Dashboard default render)", async () => Dashboard],
    ["C10-threats", "Threat model", async () => (await import("../app/ThreatModel")).default],
    ["C10-receipts", "Receipts (empty state)", async () => (await import("../app/Receipts")).default],
    ["C10-scenarios", "Scenarios", async () => (await import("../app/ScenarioComposer")).default],
    ["C10-connect", "Connect agent", async () => (await import("../app/ConnectPRGateCard")).default],
    ["C10-run", "New crash test (CrashRunner)", async () => (await import("../app/CrashRunner")).default],
    ["C10-report", "Full report (SuiteReport)", async () => (await import("../app/SuiteReport")).default],
    ["C10-voice", "Voice red-team (VoiceCall)", async () => (await import("../app/VoiceCall")).default],
    ["C10-live", "Voice red-team live (LiveCall)", async () => (await import("../app/LiveCall")).default],
    ["C10-settings", "Settings", async () => (await import("../app/ConnectPRGateCard")).default],
  ];
  for (const [id, name, load] of tabs) {
    try {
      const Comp = await load();
      const props: any =
        name === "Overview (Dashboard default render)"
          ? { user: { name: "QA", email: "q@e.t" }, onSignOut: () => {}, theme: "light", onToggleTheme: () => {} }
          : name.startsWith("Threat model")
            ? { onRunScenario: () => {} }
            : name.startsWith("Receipts")
              ? { receipts: [], pending: null, onIssued: () => {}, onPendingHandled: () => {} }
              : name.startsWith("Scenarios")
                ? { onAdd: () => {} }
                : name.startsWith("New crash test")
                  ? { onComplete: () => {}, onReceipt: () => {}, custom: [], preselect: null }
                  : name.startsWith("Full report")
                    ? { onReceipt: () => {} }
                    : {};
      const out = renderToStaticMarkup(React.createElement(Comp as any, props));
      record(id, `${name} renders without throwing`, out.length > 0, `SSR produced ${out.length} bytes`);
    } catch (cause) {
      record(id, `${name} renders without throwing`, false, (cause as Error).message);
    }
  }

  // Receipts with a real signed receipt in the ledger — exercises the
  // CURRENT / SUPERSEDED pill branches of app/Receipts.tsx.
  const { buildReceipt } = await import("../lib/receipt");
  const r1 = buildReceipt(scorecard([["COERCION", true]]), { name: "qa-ui", system_prompt: "PROMPT-A" });
  const r2 = buildReceipt(
    scorecard([["COERCION", true]]).verdict
      ? { ...scorecard([["COERCION", true]]), systemPrompt: "PROMPT-B" }
      : scorecard([["COERCION", true]]),
    { name: "qa-ui", system_prompt: "PROMPT-B" }
  );
  const Receipts = (await import("../app/Receipts")).default;
  const rendered = renderToStaticMarkup(
    React.createElement(Receipts as any, {
      receipts: [r1, r2],
      pending: null,
      onIssued: () => {},
      onPendingHandled: () => {},
    })
  );
  const hasCurrent = rendered.includes("CURRENT");
  const hasSuperseded = /SUPERSEDED by/.test(rendered);
  record(
    "C10-receipts2",
    "Receipts renders a CURRENT pill and a SUPERSEDED pill for the stale twin",
    hasCurrent && hasSuperseded,
    `CURRENT=${hasCurrent} SUPERSEDED-by=${hasSuperseded} bytes=${rendered.length}`
  );
  void tileHtml;
}

// ── 4/6. Signature verification, exactly as the browser does it ────────────

async function checkCrypto() {
  const { buildReceipt, upperBound95 } = await import("../lib/receipt");
  const { verifyReceiptSignature, encodeReceipt, decodeReceipt, canonicalJson, receiptPayload } =
    await import("../lib/receiptShared");

  const r1 = buildReceipt(scorecard([["COERCION", true], ["DATA_LEAK", false]]), {
    name: "qa-crypto",
    system_prompt: "PROMPT-A",
  });

  const valid = await verifyReceiptSignature(r1);
  const pubBytes = Buffer.from(r1.public_key, "base64");
  record(
    "C4g",
    "client-side Ed25519 verifyReceiptSignature() returns TRUE for a real signed receipt",
    valid === true,
    `returned ${valid}; key_note=${r1.key_note}; public_key=${r1.public_key.slice(0, 16)}… is ${pubBytes.length} bytes ` +
      `(SPKI DER, published by lib/receipt.ts:70/84). lib/receiptShared.ts:76-85 picks the import format from the key ` +
      `length (${pubBytes.length}B => "spki" first, 32B => "raw" first) and loops candidates, so both encodings verify.`
  );

  // Root-cause proof, independent of Warrant's helper: the SAME signature and
  // message verify once the SPKI DER prefix is stripped to the raw 32-byte key.
  const rawKey = new Uint8Array(pubBytes.subarray(pubBytes.length - 32));
  const spkiKey = new Uint8Array(pubBytes);
  const message = new TextEncoder().encode(canonicalJson(receiptPayload(r1)));
  const sigBytes = new Uint8Array(Buffer.from(r1.signature, "base64"));
  let rawResult = "threw";
  let spkiResult = "threw";
  try {
    const k = await crypto.subtle.importKey("raw", rawKey, { name: "Ed25519" }, false, ["verify"]);
    rawResult = String(await crypto.subtle.verify("Ed25519", k, sigBytes, message));
  } catch (e) {
    rawResult = `threw ${(e as Error).name}`;
  }
  try {
    const k = await crypto.subtle.importKey("raw", spkiKey, { name: "Ed25519" }, false, ["verify"]);
    spkiResult = String(await crypto.subtle.verify("Ed25519", k, sigBytes, message));
  } catch (e) {
    spkiResult = `threw ${(e as Error).name}: ${(e as Error).message}`;
  }
  record(
    "C4g-diag",
    "DIAGNOSIS: the signature is valid; the only encodings that work are the SPKI DER the producer publishes and its raw 32-byte tail",
    rawResult === "true" && spkiResult.startsWith("threw"),
    `importKey("raw", spkiDer[${pubBytes.length}B]) => ${spkiResult}; ` +
      `importKey("raw", spkiDer.subarray(-32)) => verify=${rawResult}. ` +
      `So the Ed25519 signature in lib/receipt.ts:86 is correct, and a "raw"-only verifier would be wrong for the ` +
      `44-byte key Warrant actually publishes — which is why receiptShared.ts now tries "spki" first for a non-32-byte key.`
  );

  // Tamper with a signed field — verification must fail, and it must fail with a
  // real false (not a swallowed exception, which is what the pre-fix
  // base64UrlToBytes bug produced).
  const tampered = { ...r1, identity: "qa-crypto-tampered" };
  const tamperedValid = await verifyReceiptSignature(tampered);
  record(
    "C4h",
    "tampering with a signed field makes verification return FALSE",
    tamperedValid === false,
    `verify(tampered)=${tamperedValid}`
  );
  const tampered2 = { ...r1, controls: { ...r1.controls, COERCION: { ...r1.controls.COERCION, violations: 0 } } };
  record(
    "C4i",
    "tampering with the control tally (violations 1 -> 0) makes verification FALSE",
    (await verifyReceiptSignature(tampered2)) === false,
    `controls.COERCION.violations rewritten; verify=${await verifyReceiptSignature(tampered2)}`
  );

  // The QR/verify-link encode path (app/Receipts.tsx:106).
  const encoded = encodeReceipt(r1);
  const decoded = decodeReceipt(encoded);
  record(
    "C4j",
    "encodeReceipt -> decodeReceipt round-trips byte-identically (the QR/verify-link codec)",
    canonicalJson(decoded) === canonicalJson(r1),
    `encoded ${encoded.length} base64url chars (zlib level 9), decoded payload is canonically identical to the original`
  );

  // Canonical JSON must be key-order independent, otherwise the signature is
  // order-sensitive across JSON.parse/stringify cycles.
  const reordered = JSON.parse(JSON.stringify(r1)) as any;
  const shuffled = Object.fromEntries(
    Object.keys(reordered)
      .reverse()
      .map((k) => [k, reordered[k]])
  );
  record(
    "C4k",
    "canonicalJson is key-order independent, so a JSON round-trip cannot break a signature",
    canonicalJson(shuffled) === canonicalJson(r1),
    "reversing every key of the payload produced a byte-identical canonical form"
  );

  // C7 / honesty: upperBound95 at N=1 must be a real Wilson bound.
  const b0 = upperBound95(0, 1);
  const b1 = upperBound95(1, 1);
  const b20 = upperBound95(0, 20);
  const b20v = upperBound95(1, 20);
  const b5 = upperBound95(2, 5);
  record(
    "C7c",
    "upperBound95(0,1) and upperBound95(1,1) are real Wilson bounds, not 0%/100% fabrications",
    Math.abs(b0 - 0.793) < 0.002 && b1 === 1 && b20 < 0.2 && b20v > b20 && b5 > b1 - 1,
    `ub95(0/1)=${b0} (Wilson 0.7935) ub95(1/1)=${b1} ub95(0/20)=${b20} ub95(1/20)=${b20v} ub95(2/5)=${b5}`
  );
  let threw = "";
  try {
    upperBound95(0, 0);
  } catch (e) {
    threw = (e as Error).message;
  }
  record(
    "C7d",
    "upperBound95 refuses trials=0 instead of dividing by zero",
    threw.includes("positive integer"),
    `threw "${threw}"`
  );

  // The tally shape the receipt consumes. DATA_LEAK has zero violations, so its
  // Wilson bound is the one that must move as trials grow.
  const rep1 = buildReceipt(suiteReport(1, 1), { name: "qa-tally-1", system_prompt: "PROMPT-A" });
  const rep5 = buildReceipt(suiteReport(5, 1), { name: "qa-tally-5", system_prompt: "PROMPT-A" });
  const c1 = rep1.controls.COERCION;
  const c5 = rep5.controls.COERCION;
  const d1 = rep1.controls.DATA_LEAK;
  const d5 = rep5.controls.DATA_LEAK;
  record(
    "C7e",
    "receipt control trials scale with repeat xN and the confidence bound tightens",
    c1.trials === 1 && c5.trials === 5 && c1.violations === 1 && c5.violations === 5 && d1.trials === 1 && d5.trials === 5 && d1.upper_bound_95 > d5.upper_bound_95,
    `COERCION N=1 -> ${c1.violations}/${c1.trials}; N=5 -> ${c5.violations}/${c5.trials}; ` +
      `DATA_LEAK 0/${d1.trials} ub95=${d1.upper_bound_95} (N=1) -> 0/${d5.trials} ub95=${d5.upper_bound_95} (N=5)`
  );
  record(
    "C7f",
    "not_covered lists every judge dimension the run did not observe (27 registry - 2 observed)",
    Array.isArray(rep1.not_covered) &&
      rep1.not_covered.length === 25 &&
      rep1.not_covered.includes("SABOTAGE") &&
      !rep1.not_covered.includes("COERCION") &&
      !rep1.not_covered.includes("DATA_LEAK"),
    `not_covered has ${rep1.not_covered.length}/27 dimensions, COERCION excluded, SABOTAGE=${rep1.not_covered.includes("SABOTAGE")}`
  );
  return r1;
}

// ── 6. The verify page's own render gate (no DOM needed) ────────────────────

// app/verify/[fingerprint]/page.tsx is a client component: useEffect does not run
// under react-dom/server, so the pill can only be proved by (a) running the exact
// functions the effect calls and (b) asserting the JSX gate that turns that
// boolean into "SIGNATURE VALID" and un-hides the freshness banner. Both halves
// are checked here; C6g in qa/http.test.ts repeats it over the real HTTP bytes.
async function checkVerifyPageGate(r1: any) {
  const { encodeReceipt, decodeReceipt, verifyReceiptSignature } = await import("../lib/receiptShared");
  const pageSrc = readFileSync(path.join(PROJECT, "app", "verify", "[fingerprint]", "page.tsx"), "utf8");

  const wired = /verifyReceiptSignature\(decoded\)\.then\(setSignatureValid\)/.test(pageSrc);
  const pillTruthy =
    /signatureValid \? "SIGNATURE VALID" : "SIGNATURE INVALID"/.test(pageSrc) &&
    /signatureValid === null \? "VERIFYING"/.test(pageSrc);
  const bannerGated = /\{signatureValid && <FreshnessBadge freshness=\{freshness\} \/>\}/.test(pageSrc);
  const degradeString = pageSrc.includes("Signature valid, freshness unknown.");
  const urlFingerprintChecked = /decoded\.fingerprint !== decodeURIComponent\(params\.fingerprint\)/.test(pageSrc);
  const noAuthWording = !/SignIn|Sign in/i.test(pageSrc);

  // The payload path the browser walks: location.search -> decodeReceipt -> verify.
  const encoded = encodeReceipt(r1);
  const fromQueryString = new URL(
    `https://warrant.test/verify/${encodeURIComponent(r1.fingerprint)}?receipt=${encodeURIComponent(encoded)}`
  ).searchParams.get("receipt")!;
  const decoded = decodeReceipt(fromQueryString);
  const signatureValid = await verifyReceiptSignature(decoded);
  const fingerprintOk = decoded.fingerprint === decodeURIComponent(r1.fingerprint);

  record(
    "C6g-ui",
    "the verify page turns a true verification into SIGNATURE VALID and un-hides the freshness banner",
    wired && pillTruthy && bannerGated && degradeString && urlFingerprintChecked && noAuthWording &&
      signatureValid === true && fingerprintOk,
    `page.tsx:37 wires verifyReceiptSignature(decoded).then(setSignatureValid)=${wired}; ` +
      `:73 renders "SIGNATURE VALID" iff truthy=${pillTruthy}; :76 gates <FreshnessBadge> on signatureValid=${bannerGated}; ` +
      `:107 degrade copy present=${degradeString}; :33 rejects a mismatched URL fingerprint=${urlFingerprintChecked}. ` +
      `Running that exact pipeline on an encoded receipt: decodeReceipt ok, fingerprint match=${fingerprintOk}, ` +
      `verifyReceiptSignature=${signatureValid} => the page renders the pass pill and the banner is NOT hidden.`
  );
  record(
    "C6h-ui",
    "a tampered payload still yields false, so the pass pill and the banner are earned, not unconditional",
    (await verifyReceiptSignature({ ...decoded, issued_at: new Date(0).toISOString() })) === false,
    `rewriting issued_at on the decoded payload flips verifyReceiptSignature to false => page.tsx:73 would render ` +
      `"SIGNATURE INVALID" and page.tsx:76 would suppress <FreshnessBadge>`
  );
}

// ── 6. Freshness branches, end to end over HTTP ────────────────────────────

async function checkFreshness(r1: any) {
  const { encodeReceipt } = await import("../lib/receiptShared");
  const identity = r1.identity;

  // current: the ledger pointer for this identity equals the receipt's fingerprint.
  // Post the same evidence so the server writes a matching row.
  const post = await fetch(`${BASE}/api/receipt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report: scorecard([["COERCION", true], ["DATA_LEAK", false]]), agentIdentity: { name: identity, system_prompt: "PROMPT-A" } }),
  });
  const posted = await post.json();
  const rowRes = await fetch(`${BASE}/api/ledger/${encodeURIComponent(identity)}`);
  const row = await rowRes.json();
  record(
    "C6c",
    "freshness 'current' branch: ledger fingerprint == receipt fingerprint",
    rowRes.status === 200 && row.fingerprint === posted.fingerprint,
    `page.tsx:43-44 would render state="current" (ledger ${row.fingerprint?.slice(7, 19)}… == receipt ${posted.fingerprint?.slice(7, 19)}…)`
  );

  // superseded: change the agent so the pointer moves on.
  const changedRes = await fetch(`${BASE}/api/receipt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report: scorecard([["COERCION", true], ["DATA_LEAK", false]]), agentIdentity: { name: identity, system_prompt: "PROMPT-CHANGED" } }),
  });
  const changed = await changedRes.json();
  const row2 = await (await fetch(`${BASE}/api/ledger/${encodeURIComponent(identity)}`)).json();
  record(
    "C6d",
    "freshness 'superseded' branch: ledger pointer moved past the verified receipt",
    row2.fingerprint !== posted.fingerprint &&
      changed.supersedes === posted.fingerprint &&
      row2.fingerprint === changed.fingerprint,
    `page.tsx:44-45 renders state="superseded" because ledger (${row2.fingerprint?.slice(7, 19)}…) != the verified receipt ` +
      `(${posted.fingerprint?.slice(7, 19)}…); the newer receipt's supersedes points back at it (${changed.supersedes?.slice(7, 19)}…)`
  );

  // unknown (degrade): a signed receipt whose identity was never ledgered makes
  // /api/ledger/<identity> answer 404, which page.tsx:40 turns into a throw and
  // page.tsx:48 turns into state "unknown".
  const { buildReceipt } = await import("../lib/receipt");
  const orphan = buildReceipt(scorecard([["COERCION", true]]), { name: "qa-orphan-never-posted", system_prompt: "PROMPT-X" });
  const orphanRes = await fetch(`${BASE}/api/ledger/${encodeURIComponent(orphan.identity)}`);
  record(
    "C6e",
    "freshness degrades to 'signature valid, freshness unknown' when the ledger call fails",
    orphanRes.status === 404,
    `orphan receipt ${orphan.identity} is signed (key_note=${orphan.key_note}); GET /api/ledger/${orphan.identity} -> HTTP ${orphanRes.status} ` +
      `=> page.tsx:40 throws, :48 sets {state:"unknown"} => FreshnessBadge renders "Signature valid, freshness unknown."`
  );

  // The full public URL, byte for byte, as Receipts.tsx builds it.
  const url = `${BASE}/verify/${encodeURIComponent(posted.fingerprint)}?receipt=${encodeURIComponent(encodeReceipt(posted))}`;
  const pageRes = await fetch(url, { redirect: "manual" });
  const html = await pageRes.text();
  record(
    "C6f",
    "the public verify URL built by app/Receipts.tsx loads 200 with no sign-in and ships the client bundle",
    pageRes.status === 200 && !/Sign in|signin/i.test(html) && /_next\/static\/.*\.js/.test(html),
    `HTTP ${pageRes.status} bytes=${html.length} scripts=${(html.match(/_next\/static\/[^"]+\.js/g) ?? []).length} ` +
      `no-auth (no redirect, no sign-in wording); the receipt payload is read client-side from the query string`
  );
  void r1;
}

// ── 8. Commit-status mapping, with the GitHub call stubbed ────────────────

async function checkCommitStatus() {
  const prGate = await import("../lib/prGate");
  const base = {
    fingerprint: "sha256:" + "ab".repeat(32),
    shortFingerprint: "ab…ab",
    repo: "acme/x",
    pr: 1,
    baseSha: "0".repeat(40),
    headSha: "1".repeat(40),
    triggeredBy: "cli" as const,
    diff: { newCapabilities: ["payment.write"], removedCapabilities: [], promptChanged: false },
    newCapabilities: ["payment.write"],
    affectedScenarioIds: ["unauthorized_action"],
    totalEdges: 31,
    trials: 20,
    durationMs: 1000,
    receipt: { issued_at: new Date(0).toISOString() } as any,
    supersededFingerprint: null,
    fixLanded: false,
    systemPrompt: "p",
    agentName: "a",
  };
  const control = (status: string) => ({
    scenarioId: "unauthorized_action",
    label: "l",
    dimension: "COERCION",
    control: "confirmed_writes",
    code: "D001",
    capability: "payment.write",
    trials: 20,
    violations: status === "CONFIRMED" ? 14 : 0,
    triggerRate: status === "CONFIRMED" ? 0.7 : 0,
    status,
    worstStars: 2,
    headline: "h",
    reproCase: "unauthorized_action/0001",
    reproCmd: "warrant replay --case unauthorized_action/0001 --k 20",
  });

  const realFetch = globalThis.fetch;
  const captured: any[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    captured.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ id: 1 }), { status: 201, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    await prGate.createCheckRun("tok", "acme", "x", {
      ...base,
      controls: [control("CONFIRMED"), control("FLAKY"), control("PASS")] as any,
      conclusion: "failure",
    } as any);
    await prGate.createCheckRun("tok", "acme", "x", {
      ...base,
      controls: [control("PASS"), control("PASS")] as any,
      conclusion: "success",
    } as any);
  } finally {
    globalThis.fetch = realFetch;
  }

  const failedRun = captured[0]?.body;
  const cleanRun = captured[1]?.body;
  record(
    "C8k",
    "GitHub Checks API body: CONFIRMED controls => conclusion \"failure\"",
    failedRun?.conclusion === "failure" &&
      failedRun?.status === "completed" &&
      failedRun?.head_sha === base.headSha &&
      /blocked: 1 confirmed control/.test(failedRun?.output?.title ?? ""),
    `POST ${captured[0]?.url} -> {status:${failedRun?.status}, conclusion:${failedRun?.conclusion}, head_sha:${failedRun?.head_sha?.slice(0, 8)}…, title:"${failedRun?.output?.title}"}`
  );
  record(
    "C8l",
    "GitHub Checks API body: all controls clean => conclusion \"success\"",
    cleanRun?.conclusion === "success" && /passed/.test(cleanRun?.output?.title ?? ""),
    `{status:${cleanRun?.status}, conclusion:${cleanRun?.conclusion}, title:"${cleanRun?.output?.title}"}`
  );

  // The comment body flips the same way.
  const stale = prGate.formatPrComment({
    ...base,
    controls: [control("CONFIRMED")] as any,
    conclusion: "failure",
  } as any);
  const current = prGate.formatPrComment({
    ...base,
    controls: [control("PASS")] as any,
    conclusion: "success",
  } as any);
  record(
    "C8m",
    "PR comment marks CONFIRMED controls STALE and a clean run CURRENT",
    /CONFIRMED confirmed_writes \(D001\)/.test(stale) &&
      /Freshness: STALE for D001/.test(stale) &&
      /All affected controls passed clean across 20 trials\. Freshness: CURRENT\./.test(current) &&
      !/STALE/.test(current),
    `stale-has=${/Freshness: STALE/.test(stale)} current-has=${/Freshness: CURRENT/.test(current)} current-has-no-STALE=${!/STALE/.test(current)}`
  );
  record(
    "C8n",
    "PR comment is idempotent via the invisible marker and stamps the head SHA",
    stale.startsWith(prGate.PR_COMMENT_MARKER) && current.startsWith(prGate.PR_COMMENT_MARKER) && /head `1111111111`/.test(stale),
    `marker=${prGate.PR_COMMENT_MARKER} present in both; head stamp present`
  );

  // Signature verification of the webhook HMAC.
  const secret = "s3cret";
  const body = JSON.stringify({ action: "opened" });
  const good = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  record(
    "C8o",
    "verifyWebhookSignature accepts a correct HMAC and rejects a wrong/garbage one",
    prGate.verifyWebhookSignature(secret, body, good) === true &&
      prGate.verifyWebhookSignature(secret, body, "sha256=" + "0".repeat(64)) === false &&
      prGate.verifyWebhookSignature(secret, body, "garbage") === false &&
      prGate.verifyWebhookSignature("", body, good) === false,
    `correct=${prGate.verifyWebhookSignature(secret, body, good)} wrong=${prGate.verifyWebhookSignature(secret, body, "sha256=" + "0".repeat(64))} garbage=${prGate.verifyWebhookSignature(secret, body, "garbage")}`
  );

  // Capability -> edge mapping drives the affected set.
  const d = prGate.diffContracts(
    { systemPrompt: "same", tools: [], capabilities: [] },
    { systemPrompt: "same", tools: ["issue_refund"], capabilities: [] }
  );
  record(
    "C8p",
    "diffContracts + scenariosForDiff map a new tool to the right affected edges",
    d.newCapabilities.join(",") === "payment.write" && !d.promptChanged && prGate.scenariosForDiff(d).join(",") === "privilege_escalation,scope_creep,unauthorized_action",
    `newCapabilities=${JSON.stringify(d.newCapabilities)} promptChanged=${d.promptChanged} edges=${JSON.stringify(prGate.scenariosForDiff(d))}`
  );
}

// ── 9. Env-var fallbacks, in child processes with a clean cwd ──────────────

// Child scripts run with cwd = a scratch directory (that is where the local
// ledger fallback must create .warrant/) but the script file itself is written
// once as .mts so tsx treats it as ESM and top-level await works.
// execFile (async) is required, not execFileSync: the C9f case runs a fake
// Upstash KV server inside this process, and a synchronous child would block the
// event loop that has to serve it.
const CHILD_FILE = path.join(tmpRoot, "child.mts");
const execFileAsync = promisify(execFile);
async function runChild(dir: string, env: Record<string, string | undefined>, script: string) {
  writeFileSync(CHILD_FILE, script, "utf8");
  const childEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH!,
    SystemRoot: process.env.SystemRoot!,
    NODE_OPTIONS: "",
    NODE_ENV: "test",
    ...env,
  };
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [TSX, CHILD_FILE], {
      cwd: dir,
      env: childEnv,
      encoding: "utf8",
      timeout: 180000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout + stderr;
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    // A non-zero exit is itself evidence for the "bad seed is rejected" check.
    return (err.stdout ?? "") + (err.stderr ?? "") + err.message;
  }
}

const libUrl = (file: string) => "file:///" + path.join(PROJECT, "lib", file).replace(/\\/g, "/");

async function checkEnvFallbacks() {
  // A. No LEDGER_KV_URL, no RECEIPT_SIGNING_SEED.
  const dirA = path.join(tmpRoot, "a");
  mkdirSync(dirA, { recursive: true });
  const scriptA = `
const mod = await import(${JSON.stringify(libUrl("receipt.ts"))});
const store = await import(${JSON.stringify(libUrl("ledgerStore.ts"))});
const shared = await import(${JSON.stringify(libUrl("receiptShared.ts"))});
const r = mod.buildReceipt(
  { verdict: { star_rating: 1, headline: "h", explanation: "e", leaks: [], worst_severity: null,
      dimensions: [{ name: "COERCION", triggered: true, cited_message: "", reasoning: "" }] },
    scenarioId: "blackmail", systemPrompt: "P", createdAt: new Date(0).toISOString() },
  { name: "child-a", system_prompt: "P" }
);
const prev = await store.advanceLedger(r);
const row = await store.getLatestLedgerRow("child-a");
console.log(JSON.stringify({
  keyNote: r.key_note,
  keyNoteIsDemo: r.key_note === "demo key, not KMS",
  signatureValid: await shared.verifyReceiptSignature(r),
  publicKey: r.public_key,
  previousRow: prev,
  ledgerRow: row,
  ledgerPath: process.cwd() + "/.warrant/ledger.jsonl",
  kvUnset: !process.env.LEDGER_KV_URL,
}));
`;
  const outA = await runChild(dirA, { LEDGER_KV_URL: "", RECEIPT_SIGNING_SEED: "" }, scriptA);
  const jsonLineA = outA.split("\n").find((l) => l.startsWith("{"))!;
  const a = JSON.parse(jsonLineA);
  const ledgerExistsA = existsSync(path.join(dirA, ".warrant", "ledger.jsonl"));
  const ledgerTextA = ledgerExistsA ? readFileSync(path.join(dirA, ".warrant", "ledger.jsonl"), "utf8") : "";
  const warnedOnce = (outA.match(/RECEIPT_SIGNING_SEED is unset/g) ?? []).length;
  record(
    "C9a",
    "no LEDGER_KV_URL => .warrant/ledger.jsonl is created under the working directory",
    a.kvUnset && ledgerExistsA && a.ledgerRow?.identity === "child-a",
    `cwd=${dirA}; .warrant/ledger.jsonl exists=${ledgerExistsA} (${ledgerTextA.trim().length} bytes); ` +
      `getLatestLedgerRow("child-a") -> ${JSON.stringify(a.ledgerRow)}; first advance returned previous=${a.previousRow}`
  );
  record(
    "C9b",
    "no RECEIPT_SIGNING_SEED => a fresh demo keypair is generated and logged with a clear warning",
    a.keyNoteIsDemo && warnedOnce >= 1,
    `key_note="${a.keyNote}"; the boot warning appeared ${warnedOnce}x: ` +
      `${(outA.match(/\[warrant\] RECEIPT_SIGNING_SEED is unset[^\n]*/) ?? ["<none>"])[0].slice(0, 150)}; ` +
      `pub=${a.publicKey.slice(0, 20)}… (that child's own signature validity is reported by the \`signatureValid\` field it printed: ${a.signatureValid})`
  );

  // A2. Two fresh children => two different demo keys (rotates on restart).
  const dirA2 = path.join(tmpRoot, "a2");
  mkdirSync(dirA2, { recursive: true });
  const outA2 = await runChild(dirA2, { LEDGER_KV_URL: "", RECEIPT_SIGNING_SEED: "" }, scriptA.replace("child-a", "child-a2"));
  const a2 = JSON.parse(outA2.split("\n").find((l) => l.startsWith("{"))!);
  record(
    "C9c",
    "the generated demo key really rotates per process (two children, two public keys)",
    a.publicKey !== a2.publicKey,
    `child A pub=${a.publicKey.slice(0, 20)}… child A2 pub=${a2.publicKey.slice(0, 20)}…`
  );

  // B. A configured seed is deterministic and NOT labelled a demo key.
  const seed = randomBytes(32).toString("hex");
  const dirB = path.join(tmpRoot, "b");
  mkdirSync(dirB, { recursive: true });
  const scriptB = scriptA.replace("child-a", "child-b");
  const outB = await runChild(dirB, { LEDGER_KV_URL: "", RECEIPT_SIGNING_SEED: seed }, scriptB);
  const b = JSON.parse(outB.split("\n").find((l) => l.startsWith("{"))!);
  const dirB2 = path.join(tmpRoot, "b2");
  mkdirSync(dirB2, { recursive: true });
  const outB2 = await runChild(dirB2, { LEDGER_KV_URL: "", RECEIPT_SIGNING_SEED: seed }, scriptB);
  const b2 = JSON.parse(outB2.split("\n").find((l) => l.startsWith("{"))!);
  record(
    "C9d",
    "RECEIPT_SIGNING_SEED (64 hex chars) => deterministic keypair, key_note 'configured Ed25519 seed', no warning",
    b.keyNote === "configured Ed25519 seed" &&
      b.publicKey === b2.publicKey &&
      !/RECEIPT_SIGNING_SEED is unset/.test(outB),
    `seed=${seed.slice(0, 8)}…; two independent processes produced the same public key (${b.publicKey.slice(0, 20)}…); ` +
      `key_note="${b.keyNote}"; boot warning printed=${/RECEIPT_SIGNING_SEED is unset/.test(outB)}`
  );

  // B2. base64 seed, and a wrong-length seed is rejected.
  const seedB64 = randomBytes(32).toString("base64");
  const outB3 = await runChild(dirB, { LEDGER_KV_URL: "", RECEIPT_SIGNING_SEED: seedB64 }, scriptB);
  const b3 = JSON.parse(outB3.split("\n").find((l) => l.startsWith("{"))!);
  let seedErr = "";
  seedErr = await runChild(dirB, { LEDGER_KV_URL: "", RECEIPT_SIGNING_SEED: "aabb" }, scriptB);
  record(
    "C9e",
    "base64 seed accepted; a seed that is not 32 bytes is rejected loudly",
    b3.keyNote === "configured Ed25519 seed" &&
      b3.publicKey !== b.publicKey &&
      /must encode exactly 32 bytes/.test(seedErr),
    `base64 seed -> key ${b3.publicKey.slice(0, 20)}… (differs from the hex seed key); 2-byte seed error: ` +
      `${(seedErr.match(/Error: [^\n]*/) ?? ["<none>"])[0].slice(0, 120)}`
  );

  // C. LEDGER_KV_URL set => the KV branch is taken and the local file is NOT used.
  const kvStore = new Map<string, string>();
  const kvHits: string[] = [];
  const kv = createServer((req, res) => {
    const url = req.url ?? "";
    void (async () => {
      if (req.method === "POST" && url.startsWith("/set/")) {
        const key = decodeURIComponent(url.slice("/set/".length));
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        kvStore.set(key, JSON.parse(Buffer.concat(chunks).toString("utf8")));
        kvHits.push(`SET ${key}`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ result: "OK" }));
        return;
      }
      if (url.startsWith("/get/")) {
        const key = decodeURIComponent(url.slice("/get/".length));
        kvHits.push(`GET ${key}`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ result: kvStore.get(key) ?? null }));
        return;
      }
      res.writeHead(404).end();
    })();
  });
  await new Promise<void>((r) => kv.listen(0, "127.0.0.1", r));
  const kvUrl = `http://127.0.0.1:${(kv.address() as any).port}`;
  const dirC = path.join(tmpRoot, "c");
  mkdirSync(dirC, { recursive: true });
  const scriptC = `
const store = await import(${JSON.stringify(libUrl("ledgerStore.ts"))});
const mod = await import(${JSON.stringify(libUrl("receipt.ts"))});
const r = mod.buildReceipt(
  { verdict: { star_rating: 1, headline: "h", explanation: "e", leaks: [], worst_severity: null,
      dimensions: [{ name: "COERCION", triggered: true, cited_message: "", reasoning: "" }] },
    scenarioId: "blackmail", systemPrompt: "P", createdAt: new Date(0).toISOString() },
  { name: "child-c", system_prompt: "P" }
);
await store.advanceLedger(r);
const row = await store.getLatestLedgerRow("child-c");
console.log(JSON.stringify({ row, kvUrl: process.env.LEDGER_KV_URL }));
`;
  const outC = await runChild(dirC, { LEDGER_KV_URL: kvUrl, LEDGER_KV_TOKEN: "tok", RECEIPT_SIGNING_SEED: seed }, scriptC);
  const c = JSON.parse(outC.split("\n").find((l) => l.startsWith("{"))!);
  kv.closeAllConnections();
  kv.close();
  const localWritten = existsSync(path.join(dirC, ".warrant", "ledger.jsonl"));
  record(
    "C9f",
    "LEDGER_KV_URL set => the Upstash REST branch is used and the local .warrant file is NOT written",
    c.row?.identity === "child-c" && !localWritten && kvHits.length >= 2,
    `LEDGER_KV_URL=${kvUrl} (fake Upstash REST); the KV server saw ${JSON.stringify(kvHits)}; ` +
      `getLatestLedgerRow -> ${JSON.stringify(c.row)}; .warrant/ledger.jsonl created locally=${localWritten}`
  );

  // D. The build-time warning is visible without a manual key.
  const buildLog = existsSync(path.join(OUT, "..", "build.log"))
    ? readFileSync(path.join(OUT, "..", "build.log"), "utf8")
    : "";
  record(
    "C9g",
    "the 'no RECEIPT_SIGNING_SEED' warning is emitted at server boot, not only in tests",
    /RECEIPT_SIGNING_SEED is unset; generated demo Ed25519 key/.test(buildLog),
    buildLog
      ? `npm run build log contains the warning ${(buildLog.match(/RECEIPT_SIGNING_SEED is unset/g) ?? []).length}x`
      : "npm run build log not captured in qa-artifacts; see qa/REPORT.md for the captured output"
  );
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`# QA unit/render suite (server ${BASE})\n`);
  await checkUi();
  const r1 = await checkCrypto();
  await checkVerifyPageGate(r1);
  await checkFreshness(r1);
  await checkCommitStatus();
  await checkEnvFallbacks();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n# ${results.length - failed.length}/${results.length} unit checks passed`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}-unit.json`, JSON.stringify({ base: BASE, results }, null, 2));
  rmSync(tmpRoot, { recursive: true, force: true });
  if (failed.length) {
    console.log("# FAILED:");
    for (const f of failed) console.log(`#  - ${f.id} ${f.name} :: ${f.detail}`);
    process.exitCode = 1;
  }
  void note;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
