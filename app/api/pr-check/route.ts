// POST — the PR Gate endpoint. Two callers:
//
//   1. GitHub webhook (pull_request: opened / synchronize), verified with
//      GITHUB_WEBHOOK_SECRET via X-Hub-Signature-256. Requires GITHUB_APP_ID
//      and GITHUB_APP_PRIVATE_KEY to mint an installation token, fetch the
//      declared contract at base/head, post the idempotent PR comment, and set
//      the Checks API status (the thing that actually blocks the merge).
//
//   2. A manual `warrant check` CLI call from a GitHub Action. Authenticated
//      either with the same X-Hub-Signature-256 HMAC over the body, or an
//      X-Warrant-Token header equal to GITHUB_WEBHOOK_SECRET (constant-time
//      compare). When the App env vars are present it performs the same GitHub
//      side effects; without them it runs the gate and returns the result as
//      JSON (dry run).
//
// GET ?repo=owner/name — returns the last recorded gate run + freshness ledger
// rows for that repo, so the standalone Connect card can show a connected
// repo's real last run.

import { NextRequest, NextResponse } from "next/server";
import {
  EMPTY_CONTRACT,
  fetchContractAtRef,
  formatPrComment,
  getLastRunResult,
  getRunHistory,
  getInstallationToken,
  createAppJwt,
  createCheckRun,
  recordLastRun,
  runGateCheck,
  safeEqual,
  upsertPrComment,
  verifyWebhookSignature,
  type AgentContract,
  type GateRunResult,
} from "@/lib/prGate";

export const runtime = "nodejs";
export const maxDuration = 300;

type PullRequestWebhook = {
  action?: string;
  installation?: { id?: number };
  repository?: { full_name?: string };
  pull_request?: {
    number?: number;
    head?: { sha?: string };
    base?: { sha?: string };
  };
};

type CliCheckPayload = {
  source?: "cli" | "manual";
  repo?: string; // "owner/name"
  pr?: number;
  headSha?: string;
  baseSha?: string;
  agentName?: string;
  systemPrompt?: string;
  trials?: number;
  contract?: AgentContract; // head contract, inline
  baseContract?: AgentContract; // base contract, inline
};

export async function GET(req: NextRequest) {
  const repo = req.nextUrl.searchParams.get("repo");
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return NextResponse.json(
      { error: "missing or malformed ?repo=owner/name" },
      { status: 400 }
    );
  }
  const last = getLastRunResult(repo);
  return NextResponse.json({
    repo,
    connected: !!last,
    lastRun: last
      ? {
          fingerprint: last.shortFingerprint,
          conclusion: last.conclusion,
          edgesAffected: last.affectedScenarioIds.length,
          totalEdges: last.totalEdges,
          trials: last.trials,
          newCapabilities: last.newCapabilities,
          pr: last.pr,
          headSha: last.headSha,
          fixLanded: last.fixLanded,
          createdAt: last.receipt.issued_at,
        }
      : null,
    ledger: getRunHistory(repo),
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  if (!secret) {
    return NextResponse.json(
      { error: "GITHUB_WEBHOOK_SECRET is not configured on this server" },
      { status: 500 }
    );
  }

  const rawBody = await req.text();
  const githubEvent = req.headers.get("x-github-event");
  const signature = req.headers.get("x-hub-signature-256");
  const cliToken = req.headers.get("x-warrant-token");

  // ── Auth ──────────────────────────────────────────────────────────────
  const signatureOk = verifyWebhookSignature(secret, rawBody, signature);
  const tokenOk = !!cliToken && safeEqual(cliToken, secret);
  if (!signatureOk && !tokenOk) {
    return NextResponse.json(
      { error: "invalid or missing request signature" },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "body is not valid JSON" }, { status: 400 });
  }

  if (githubEvent) {
    return handleWebhook(githubEvent, payload as PullRequestWebhook);
  }
  return handleCli(payload as CliCheckPayload, signatureOk);
}

// ── Webhook path ────────────────────────────────────────────────────────────

async function handleWebhook(
  event: string,
  payload: PullRequestWebhook
): Promise<NextResponse> {
  if (event === "ping") {
    return NextResponse.json({ ok: true, pong: true });
  }
  if (event !== "pull_request") {
    return NextResponse.json({ ok: true, ignored: `event ${event}` });
  }
  const action = payload.action;
  if (action !== "opened" && action !== "synchronize" && action !== "reopened") {
    return NextResponse.json({ ok: true, ignored: `action ${action}` });
  }

  const appId = process.env.GITHUB_APP_ID;
  const appKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = payload.installation?.id;
  const repo = payload.repository?.full_name;
  const pr = payload.pull_request?.number;
  const headSha = payload.pull_request?.head?.sha;
  const baseSha = payload.pull_request?.base?.sha;

  if (!appId || !appKey || !installationId) {
    return NextResponse.json(
      {
        error:
          "GitHub App is not fully configured (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, installation id)",
      },
      { status: 501 }
    );
  }
  if (!repo || !pr || !headSha || !baseSha) {
    return NextResponse.json(
      { error: "pull_request payload missing repository/pull_request fields" },
      { status: 400 }
    );
  }

  const [owner, name] = repo.split("/");
  let result: GateRunResult;
  let comment: { action: string; url: string };
  try {
    const jwt = createAppJwt(appId, appKey);
    const token = await getInstallationToken(installationId, jwt);

    // Diff the DECLARED contract between base and head. A missing contract on
    // one side counts as the empty contract, so every head capability is new.
    const [baseFound, headFound] = await Promise.all([
      fetchContractAtRef(token, owner, name, baseSha),
      fetchContractAtRef(token, owner, name, headSha),
    ]);
    const baseContract = baseFound?.contract ?? EMPTY_CONTRACT;
    const headContract = headFound?.contract ?? EMPTY_CONTRACT;

    result = await runGateCheck({
      repo,
      pr,
      baseSha,
      headSha,
      baseContract,
      headContract,
      systemPrompt: headContract.systemPrompt || undefined,
      agentName: `${repo} PR #${pr}`,
      triggeredBy: "webhook",
    });
    recordLastRun(result);

    comment = await upsertPrComment(
      token,
      owner,
      name,
      pr,
      formatPrComment(result)
    );
    await createCheckRun(token, owner, name, result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    fingerprint: result.shortFingerprint,
    conclusion: result.conclusion,
    comment,
    fixLanded: result.fixLanded,
    superseded: result.supersededFingerprint,
  });
}

// ── Manual CLI path (`warrant check` from a GitHub Action) ─────────────────

async function handleCli(
  payload: CliCheckPayload,
  signatureOk: boolean
): Promise<NextResponse> {
  const repo = payload.repo;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return NextResponse.json(
      { error: "cli payload requires repo as owner/name" },
      { status: 400 }
    );
  }
  const pr = payload.pr;
  const headSha = payload.headSha;
  if (!pr || !headSha) {
    return NextResponse.json(
      { error: "cli payload requires pr and headSha" },
      { status: 400 }
    );
  }
  const baseSha = payload.baseSha ?? "";
  const [owner, name] = repo.split("/");

  const appId = process.env.GITHUB_APP_ID;
  const appKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const canPost = !!(appId && appKey);

  let token: string | null = null;
  let baseContract = payload.baseContract ?? EMPTY_CONTRACT;
  let headContract = payload.contract ?? EMPTY_CONTRACT;

  if (canPost) {
    try {
      const jwt = createAppJwt(appId!, appKey!);
      // The CLI caller supplies the installation id via payload or we cannot
      // mint a token; require it explicitly rather than guessing.
      const installationId = (payload as { installationId?: number })
        .installationId;
      if (!installationId) {
        return NextResponse.json(
          { error: "installationId is required for GitHub side effects" },
          { status: 400 }
        );
      }
      token = await getInstallationToken(installationId, jwt);
      // Inline contracts win; otherwise pull the checked-in ones per ref.
      if (!payload.baseContract && baseSha) {
        const found = await fetchContractAtRef(token, owner, name, baseSha);
        if (found) baseContract = found.contract;
      }
      if (!payload.contract) {
        const found = await fetchContractAtRef(token, owner, name, headSha);
        if (found) headContract = found.contract;
      }
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 502 }
      );
    }
  }

  const result = await runGateCheck({
    repo,
    pr,
    baseSha,
    headSha,
    baseContract,
    headContract,
    systemPrompt: payload.systemPrompt,
    agentName: payload.agentName ?? `${repo} PR #${pr}`,
    trials: payload.trials,
    triggeredBy: "cli",
  });
  recordLastRun(result);

  let comment: { action: string; url: string } | null = null;
  if (token) {
    try {
      comment = await upsertPrComment(
        token,
        owner,
        name,
        pr,
        formatPrComment(result)
      );
      await createCheckRun(token, owner, name, result);
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    postedToGitHub: !!comment,
    verifiedBy: signatureOk ? "signature" : "token",
    fingerprint: result.shortFingerprint,
    fullFingerprint: result.fingerprint,
    conclusion: result.conclusion,
    comment,
    commentBody: comment ? undefined : formatPrComment(result),
    fixLanded: result.fixLanded,
    superseded: result.supersededFingerprint,
    result: {
      newCapabilities: result.newCapabilities,
      affectedScenarioIds: result.affectedScenarioIds,
      totalEdges: result.totalEdges,
      trials: result.trials,
      durationMs: result.durationMs,
      controls: result.controls,
      receipt: result.receipt,
    },
  });
}
