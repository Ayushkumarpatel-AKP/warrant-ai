#!/usr/bin/env -S npx tsx
// The Warrant CLI.
//
// Supported invocation (this is what `npm run scan` and package.json's `bin`
// entry use):
//
//     npx tsx cli/warrant.ts <command> [options]
//
// Node built-ins only — no dependency is added for this file.
//
// What this CLI is honest about: `scan` reports the DECLARED contract only. It
// does not run the agent, it does not call a model, and it prints no safety
// score. A real run is dozens of paid model calls inside the web app
// (`npm run dev`, then the Full report tab, or POST /api/suite) — a number
// printed here without a run behind it would be invented.

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentContract } from "../lib/prGate";

const EXIT_OK = 0;
const EXIT_USER = 1; // bad usage, bad path, unparseable config
const EXIT_CONFIG = 2; // the environment is not configured

// A config file is a few hundred bytes. Anything larger is a mistake (or an
// attempt to make this process allocate), and is refused rather than read.
const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const MAX_ENV_BYTES = 256 * 1024;

const GATE_VARS = [
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
] as const;

const USAGE = `warrant — pre-deployment safety testing for AI agents

Usage:
  warrant scan <config.json>         report the declared contract (no run, no score)
  warrant check                      preflight the PR Gate configuration
  warrant replay --case <id>[/<n>]   print the exact request that reproduces one trial
  warrant --help                     this text

Options:
  --config <path>   config file for \`scan\` (default: agent.config.json)
  --case <id>       scenario id, optionally /<trial> — e.g. blackmail/0001
  --k <n>           trials per scenario, 1-20 (default 20)
  --url <origin>    server origin used by \`check\` (default http://localhost:3000)

Config file shape (JSON; warrant.yaml also works):
  {
    "name": "Acme Support Bot",
    "systemPrompt": "You are Acme's support agent...",
    "tools": ["lookup_order", "issue_refund"],
    "capabilities": ["payment.write"]
  }

Exit codes:
  0  success
  1  usage, path or config error
  2  required configuration is missing`;

// Everything is written with process.stdout/stderr and the process ends by
// setting process.exitCode, never process.exit(): on Windows a piped stream is
// asynchronous, and exiting straight after a write truncates the output.
function out(line = ""): void {
  process.stdout.write(line + "\n");
}

function errOut(line: string): void {
  process.stderr.write(line + "\n");
}

class CliExit extends Error {
  code: number;
  constructor(code: number) {
    super("warrant: exit");
    this.code = code;
  }
}

// Thrown rather than process.exit()ed, so it can be used mid-expression
// (`return fail(...)`) without cutting a pending write short. Typed `never` so
// a caller can rely on control flow not continuing.
function fail(message: string, code: number = EXIT_USER): never {
  errOut(`warrant: ${message}`);
  throw new CliExit(code);
}

// ── argument parsing (hand-rolled, no dependency) ───────────────────────────

type Parsed = {
  command: string | null;
  positionals: string[];
  flags: Map<string, string>;
};

function parseArgs(argv: string[]): Parsed {
  const positionals: string[] = [];
  const flags = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help" || arg === "help") {
      flags.set("help", "true");
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      flags.set("version", "true");
      continue;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags.set(arg.slice(2, eq), arg.slice(eq + 1));
        continue;
      }
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags.set(name, "true"); // bare flag
        continue;
      }
      flags.set(name, next);
      i++;
      continue;
    }
    positionals.push(arg);
  }

  return {
    command: positionals.length ? positionals[0] : null,
    positionals: positionals.slice(1),
    flags,
  };
}

function flagInt(args: Parsed, name: string, fallback: number, min: number, max: number): number {
  const raw = args.flags.get(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    return fail(
      `--${name} must be an integer between ${min} and ${max} (got ${JSON.stringify(raw)})`
    );
  }
  return n;
}

// ── guarded file reads ──────────────────────────────────────────────────────

function statOrNull(path: string) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function readTextFile(target: string, what: string): string {
  const full = resolve(process.cwd(), target);
  const stat = statOrNull(full);
  if (!stat) fail(`no such ${what}: ${full}`);
  if (stat.isDirectory()) fail(`${full} is a directory, not a ${what}.`);
  if (!stat.isFile()) fail(`${full} is not a regular file.`);
  if (stat.size > MAX_CONFIG_BYTES) {
    fail(
      `${full} is ${stat.size} bytes; a ${what} over ${MAX_CONFIG_BYTES} bytes is not a config file`
    );
  }
  try {
    return readFileSync(full, "utf8");
  } catch (cause) {
    return fail(`could not read ${full}: ${(cause as Error).message}`);
  }
}

// Reads KEY=VALUE pairs out of a local env file. Used only as a fallback for
// the three gate variables, and only ever tested for presence — no value from
// here is printed or sent anywhere.
function readEnvFile(name: string): Map<string, string> {
  const found = new Map<string, string>();
  const full = resolve(process.cwd(), name);
  const stat = statOrNull(full);
  if (!stat || !stat.isFile() || stat.size > MAX_ENV_BYTES) return found;

  let text: string;
  try {
    text = readFileSync(full, "utf8");
  } catch {
    return found;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) found.set(match[1], value);
  }
  return found;
}

// ── the real library, loaded on demand ──────────────────────────────────────

type Engine = {
  prGate: typeof import("../lib/prGate");
  scenarios: typeof import("../lib/scenarios")["scenarios"];
  suite: typeof import("../lib/suite");
};

// Lazy and by relative path, so `--help` and `check` never boot the engine:
// lib/receipt.ts (pulled in by lib/prGate.ts) generates a demo signing key at
// import time and refuses to load at all in production without a seed.
async function loadEngine(): Promise<Engine> {
  try {
    const [prGate, scenarioModule, suite] = await Promise.all([
      import("../lib/prGate"),
      import("../lib/scenarios"),
      import("../lib/suite"),
    ]);
    return { prGate, scenarios: scenarioModule.scenarios, suite };
  } catch (cause) {
    return fail(
      `could not load the Warrant library from lib/: ${(cause as Error).message}\n` +
        "        (if NODE_ENV=production is set, unset it — lib/receipt.ts refuses to " +
        "boot without RECEIPT_SIGNING_SEED)",
      EXIT_CONFIG
    );
  }
}

// ── scan ────────────────────────────────────────────────────────────────────

function pad(label: string): string {
  return label.padEnd(16, " ");
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

async function commandScan(args: Parsed): Promise<number> {
  const target = args.positionals[0] ?? args.flags.get("config") ?? "agent.config.json";
  const raw = readTextFile(target, "config file");
  if (!raw.trim()) {
    return fail(`${resolve(process.cwd(), target)} is empty; there is no contract to report.`);
  }

  const { prGate, scenarios, suite } = await loadEngine();

  // The same parser the PR Gate uses, so this report and the gate can never
  // disagree about what a contract says.
  let contract: AgentContract;
  try {
    contract = prGate.parseContractSource(raw);
  } catch (cause) {
    return fail(`${target} is not a parseable contract: ${(cause as Error).message}`);
  }

  const isJson = raw.trim().startsWith("{");
  let declaredName = "";
  if (isJson) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      if (typeof obj.name === "string") declaredName = obj.name.trim();
    } catch {
      // parseContractSource already reported the syntax error above.
    }
  }

  const capabilities = prGate.contractCapabilities(contract);
  const irreversible = capabilities.filter((c) => prGate.isIrreversible(c));
  const unknownTools = contract.tools.filter((t) => !prGate.TOOL_CAPABILITIES[t]);
  const unmapped = capabilities.filter((c) => !prGate.CAPABILITY_SCENARIOS[c]);
  const prompt = contract.systemPrompt.trim();
  const words = prompt ? prompt.split(/\s+/).length : 0;

  // The edges the gate would run if every capability above were new: a real
  // call into the gate's own mapper, and a statement about the attack library
  // rather than about the agent.
  const capabilityEdges = prGate.scenariosForDiff({
    newCapabilities: capabilities,
    removedCapabilities: [],
    promptChanged: false,
  });
  const promptEdges = prGate.scenariosForDiff({
    newCapabilities: [],
    removedCapabilities: [],
    promptChanged: true,
  });

  out("Warrant contract scan");
  out(`  ${pad("file")}${target} (${isJson ? "JSON" : "line/YAML"})`);
  out(
    `  ${pad("agent name")}${
      declaredName || "(not declared — reports are labelled 'Untitled agent')"
    }`
  );
  out(
    `  ${pad("system prompt")}${
      prompt
        ? `${plural(prompt.length, "character", "characters")}, ~${plural(words, "word", "words")}`
        : "NOT DECLARED — the agent would run on Warrant's built-in default prompt"
    }`
  );
  out(
    `  ${pad("tools")}${
      contract.tools.length
        ? contract.tools.join(", ")
        : "none declared (adversarial scenarios then run with no tools)"
    }`
  );
  out(`  ${pad("capabilities")}${capabilities.length ? capabilities.join(", ") : "none"}`);
  out(
    `  ${pad("irreversible")}${
      irreversible.length
        ? `${irreversible.join(", ")} (mutate state; the gate flags these in PR comments)`
        : "none"
    }`
  );
  out(
    `  ${pad("unknown tools")}${
      unknownTools.length
        ? `${unknownTools.join(", ")} — declared but not in the capability map, so no capability is inferred`
        : "none"
    }`
  );
  out(
    `  ${pad("scenario set")}${plural(capabilityEdges.length, "edge", "edges")} of ${plural(
      prGate.totalEdges(),
      "scenario",
      "scenarios"
    )} exercise these capabilities`
  );
  for (const id of capabilityEdges) {
    const scenario = scenarios[id];
    out(`      ${id.padEnd(24)} ${scenario ? scenario.label : "(unknown scenario)"}`);
  }
  if (unmapped.length) {
    out(`  ${pad("unmapped caps")}${unmapped.join(", ")} — no scenario targets these`);
  }
  out(
    `  ${pad("prompt change")}a system-prompt edit alone re-runs ${plural(
      promptEdges.length,
      "edge",
      "edges"
    )}: ${promptEdges.join(", ")}`
  );
  out(
    `  ${pad("engine caps")}POST /api/suite accepts repeat 1-${suite.MAX_REPEAT} and at most ` +
      `${suite.MAX_SCENARIOS} scenario ids per request`
  );
  out();
  out("  This is a DECLARATION report. No model was called, no transcript exists, and");
  out("  there is deliberately no safety score: a score printed without a run behind it");
  out("  would be invented. For a real result:");
  out("      npm run dev      # then the Full report tab, or POST /api/suite");
  out();

  if (!prompt && !contract.tools.length && !capabilities.length) {
    return fail(
      "the contract declares nothing at all (no systemPrompt, no tools, no capabilities)"
    );
  }
  return EXIT_OK;
}

// ── check ───────────────────────────────────────────────────────────────────

function commandCheck(args: Parsed): number {
  const origin = (args.flags.get("url") ?? "http://localhost:3000").replace(/\/+$/, "");

  const env = new Map<string, string>();
  for (const key of GATE_VARS) {
    const value = process.env[key];
    if (value && value.trim()) env.set(key, value.trim());
  }
  // A local checkout keeps these in .env.local. Next loads that file for the
  // app, a bare `npx tsx` does not, so fall back to it for the presence check.
  for (const file of [".env.local", ".env"]) {
    const fromFile = readEnvFile(file);
    for (const key of GATE_VARS) {
      const value = fromFile.get(key);
      if (value && !env.has(key)) env.set(key, value);
    }
  }

  out("warrant check — PR Gate preflight");
  out();
  out("  The gate does not run in this process. It runs inside the Warrant server, at");
  out("  POST /api/pr-check: it diffs the declared contract between a PR's base and");
  out("  head, runs only the affected edges through the same engine as the Full report");
  out("  tab, signs a receipt, then posts the PR comment and the check-run that blocks");
  out("  the merge.");
  out();
  out("  Required configuration:");
  for (const key of GATE_VARS) {
    out(`    ${key.padEnd(24)}${env.has(key) ? "set" : "MISSING"}`);
  }
  out();
  out("  GITHUB_WEBHOOK_SECRET is the shared secret: the webhook verifies");
  out("  X-Hub-Signature-256 with it, and a manual call authenticates with it as");
  out("  X-Warrant-Token. GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY are what let the");
  out("  server mint a GitHub App installation token and post to GitHub; with only the");
  out("  secret set, the gate still runs and returns the result as JSON (dry run).");
  out();

  const missing = GATE_VARS.filter((key) => !env.has(key));
  if (missing.length) {
    errOut(`warrant: missing required configuration: ${missing.join(", ")}`);
    errOut(
      "         Set them in .env.local (see .env.example) or in the environment the server runs in."
    );
    return EXIT_CONFIG;
  }

  out("  Ready. Start the app (npm run dev), then trigger the gate:");
  out(`    curl -X POST ${origin}/api/pr-check \\`);
  out(`      -H "content-type: application/json" \\`);
  out(`      -H "x-warrant-token: $GITHUB_WEBHOOK_SECRET" \\`);
  out(`      -d '{"source":"cli","repo":"owner/name","pr":123,"headSha":"<head sha>"}'`);
  out();
  return EXIT_OK;
}

// ── replay ──────────────────────────────────────────────────────────────────

async function commandReplay(args: Parsed): Promise<number> {
  const rawCase = args.flags.get("case") ?? args.positionals[0];
  if (!rawCase) {
    return fail("replay needs --case <scenarioId>[/<trial>], e.g. --case blackmail/0001");
  }

  const { scenarios, suite } = await loadEngine();

  const [scenarioId, trialRaw] = rawCase.split("/");
  const scenario = scenarios[scenarioId];
  if (!scenario) {
    return fail(
      `unknown scenario ${JSON.stringify(scenarioId)} — run \`warrant scan <config>\` to see the scenario set`
    );
  }

  const k = flagInt(args, "k", suite.MAX_REPEAT, 1, suite.MAX_REPEAT);
  const trial = trialRaw === undefined ? 1 : Number(trialRaw);
  if (!Number.isInteger(trial) || trial < 1 || trial > k) {
    return fail(`trial must be an integer between 1 and --k (${k}), got ${JSON.stringify(trialRaw)}`);
  }

  const body = {
    config: {
      systemPrompt: "<the system prompt under test>",
      scenarioIds: [scenarioId],
      repeat: k,
    },
  };

  out(`Reproduction case ${rawCase}`);
  out(`  ${pad("scenario")}${scenario.label} [${scenario.kind}]`);
  out(`  ${pad("dimension")}${scenario.dimension}`);
  out(`  ${pad("traps")}${scenario.description}`);
  out(`  ${pad("trial")}${trial} of ${k}`);
  out();
  out("  Nothing was executed here — a reproduction costs real model calls, so the run");
  out("  belongs in the app. Start it (npm run dev) and POST this body:");
  out();
  out(JSON.stringify(body, null, 2));
  out();
  out(
    `  The server clamps repeat to 1-${suite.MAX_REPEAT} and the selection to ` +
      `${suite.MAX_SCENARIOS} scenarios, so this request is already inside the limits.`
  );
  out();
  return EXIT_OK;
}

// ── entry point ─────────────────────────────────────────────────────────────

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  if (args.command === null) {
    if (args.flags.has("help") || args.flags.has("version")) {
      out(USAGE);
      return EXIT_OK;
    }
    errOut(USAGE);
    errOut("");
    errOut("warrant: no command given.");
    return EXIT_USER;
  }

  if (args.flags.has("help")) {
    out(USAGE);
    return EXIT_OK;
  }

  switch (args.command) {
    case "scan":
      return commandScan(args);
    case "check":
      return commandCheck(args);
    case "replay":
      return commandReplay(args);
    default:
      errOut(`warrant: unknown command ${JSON.stringify(args.command)}.`);
      errOut(USAGE);
      return EXIT_USER;
  }
}

// Never a raw stack trace: a CLI that dumps one is a CLI nobody can act on.
main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((cause: unknown) => {
    if (cause instanceof CliExit) {
      process.exitCode = cause.code;
      return;
    }
    errOut(`warrant: unexpected failure: ${cause instanceof Error ? cause.message : String(cause)}`);
    process.exitCode = EXIT_USER;
  });
