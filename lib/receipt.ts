// INTERFACE FOR INTEGRATION
// buildReceipt(report, agentIdentity, options?) returns a self-contained Ed25519-signed receipt.
// ReceiptBuildOptions.previousFingerprint links superseded receipts; headSha binds PR receipts.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";
import { scenarios } from "./scenarios";
import { DIMENSION_REGISTRY } from "./judge";
import type { SafetyReport } from "./suite";
import type { Verdict } from "./events";
import {
  RECEIPT_VERSION,
  canonicalJson,
  type AgentIdentity,
  type ReceiptControl,
  type ReceiptPayload,
  type SignedReceipt,
} from "./receiptShared";

export type SingleScorecard = {
  verdict: Verdict;
  scenarioId: string;
  systemPrompt: string;
  createdAt?: string;
};

export type ReceiptBuildOptions = {
  previousFingerprint?: string;
  headSha?: string;
};

type Tally = { trials: number; violations: number };

const ATTACK_LIBRARY_VERSION = `sha256:${createHash("sha256")
  .update(canonicalJson(scenarios))
  .digest("hex")}`;
const ALL_DIMENSIONS = Object.keys(DIMENSION_REGISTRY).sort();
const signingKey = loadSigningKey();

export function buildReceipt(
  report: SafetyReport | SingleScorecard,
  agentIdentity: AgentIdentity | string,
  options: ReceiptBuildOptions = {}
): SignedReceipt {
  const identity = typeof agentIdentity === "string" ? agentIdentity : agentIdentity.name;
  const systemPrompt =
    typeof agentIdentity === "string"
      ? promptFromReport(report)
      : agentIdentity.system_prompt ?? promptFromReport(report);
  const scenarioIds = scenarioIdsFromReport(report);
  const controls = controlsFromReport(report);
  const covered = new Set(Object.keys(controls));
  const fingerprint = `sha256:${createHash("sha256")
    .update(
      canonicalJson({
        identity,
        systemPrompt,
        scenarioIds,
        attack_library_version: ATTACK_LIBRARY_VERSION,
        head_sha: options.headSha ?? null,
      })
    )
    .digest("hex")}`;
  const publicKey = createPublicKey(signingKey.privateKey).export({ type: "spki", format: "der" });
  const payload: ReceiptPayload = {
    version: RECEIPT_VERSION,
    identity,
    fingerprint,
    issued_at: new Date().toISOString(),
    ...(options.previousFingerprint
      ? { previous_fingerprint: options.previousFingerprint, supersedes: options.previousFingerprint }
      : {}),
    ...(options.headSha ? { head_sha: options.headSha } : {}),
    controls,
    not_covered: ALL_DIMENSIONS.filter((dimension) => !covered.has(dimension)),
    claim: "Evidence toward safer behavior under the tested controls; not a certification of security.",
    key_note: signingKey.keyNote,
    public_key: publicKey.toString("base64"),
  };
  const signature = sign(null, Buffer.from(canonicalJson(payload)), signingKey.privateKey).toString("base64");
  return { ...payload, signature };
}

export function attackLibraryVersion(): string {
  return ATTACK_LIBRARY_VERSION;
}

export function upperBound95(violations: number, trials: number): number {
  if (!Number.isInteger(trials) || trials < 1) throw new Error("trials must be a positive integer");
  if (!Number.isInteger(violations) || violations < 0 || violations > trials) {
    throw new Error("violations must be an integer between zero and trials");
  }
  const z = 1.959963984540054;
  const p = violations / trials;
  const denominator = 1 + (z * z) / trials;
  const center = p + (z * z) / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * trials)) / trials);
  return Number(Math.min(1, (center + margin) / denominator).toFixed(6));
}

function controlsFromReport(report: SafetyReport | SingleScorecard): Record<string, ReceiptControl> {
  if ("verdict" in report) {
    return Object.fromEntries(
      report.verdict.dimensions.map((dimension) => [
        dimension.name,
        control(1, dimension.triggered ? 1 : 0, `single scorecard: ${report.scenarioId}`),
      ])
    );
  }
  if (report.tally.length) {
    return Object.fromEntries(
      report.tally.map((tally) => [
        tally.dimension,
        control(tally.trials, tally.violations, "selected scenarios and repeats in this suite"),
      ])
    );
  }
  const observed = new Map<string, Tally>();
  for (const scenario of report.scenarios) {
    for (const dimension of scenario.verdict.dimensions) {
      const tally = observed.get(dimension.name) ?? { trials: 0, violations: 0 };
      tally.trials += 1;
      if (dimension.triggered) tally.violations += 1;
      observed.set(dimension.name, tally);
    }
  }
  return Object.fromEntries(
    Array.from(observed.entries()).map(([name, tally]) => [
      name,
      control(tally.trials, tally.violations, "selected scenarios in this suite"),
    ])
  );
}

function control(trials: number, violations: number, boundScope: string): ReceiptControl {
  return {
    trials,
    violations,
    upper_bound_95: upperBound95(violations, trials),
    attack_library_version: ATTACK_LIBRARY_VERSION,
    bound_scope: boundScope,
  };
}

function scenarioIdsFromReport(report: SafetyReport | SingleScorecard): string[] {
  return "verdict" in report
    ? [report.scenarioId]
    : Array.from(new Set(report.scenarios.map((scenario) => scenario.scenarioId))).sort();
}

function promptFromReport(report: SafetyReport | SingleScorecard): string {
  if ("verdict" in report) return report.systemPrompt;
  return report.scenarios[0]?.systemPrompt ?? "";
}

function loadSigningKey(): { privateKey: KeyObject; keyNote: string } {
  const configured = process.env.RECEIPT_SIGNING_SEED?.trim();
  if (configured) {
    const seed = decodeSeed(configured);
    const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
    return {
      privateKey: createPrivateKey({ key: Buffer.concat([pkcs8Prefix, seed]), format: "der", type: "pkcs8" }),
      keyNote: "configured Ed25519 seed",
    };
  }
  if (process.env.NODE_ENV === "production") {
    // Refuse to start rather than silently rotating. Receipt fingerprints are
    // computed WITHOUT the key, so they stay stable across a restart while every
    // signature made with the previous key becomes unverifiable — a rotation
    // looks indistinguishable from tampering to anyone verifying a receipt.
    throw new Error(
      "RECEIPT_SIGNING_SEED is required in production. Without it a demo key is " +
        "generated per process, so every restart, redeploy, or cold start rotates " +
        "the Ed25519 signing key and all previously issued receipts become " +
        "permanently unverifiable (their fingerprints stay stable, which reads as " +
        "tampering). Set RECEIPT_SIGNING_SEED to a 32-byte hex or base64 seed and " +
        "keep it stable across deploys; store it in a secret manager, not in code."
    );
  }
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  console.warn(
    `[warrant] RECEIPT_SIGNING_SEED is unset; generated demo Ed25519 key ${publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64")}. It will rotate on server restart.`
  );
  return { privateKey, keyNote: "demo key, not KMS" };
}

function decodeSeed(value: string): Buffer {
  const seed = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (seed.length !== 32) throw new Error("RECEIPT_SIGNING_SEED must encode exactly 32 bytes");
  return seed;
}
