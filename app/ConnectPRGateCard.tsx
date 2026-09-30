// Standalone PR Gate card for the Dashboard "Connect" tab.
//
// NOTE FOR AGENT 1 (leader): import this file and drop it into Dashboard.tsx's
// Connect() — render <ConnectPRGateCard /> INSIDE the existing fragment, after
// (or replacing) the two cards already there. This component itself renders
// all THREE integration cards in autonomy order:
//   (a) Claude Code / Cursor (MCP)
//   (b) CI/CD (SDK)
//   (c) PR Gate (GitHub App) — the one actually wired up
// so the simplest integration is to replace Connect()'s body with
// <ConnectPRGateCard connectedRepo={...optional...} />.
//
// The PR Gate card shows a connected repo's REAL last run (fetched from
// GET /api/pr-check?repo=owner/name, backed by the gate's freshness ledger).
// An unconnected account sees the sample run, clearly labeled "sample". The
// check flips red→green IN PLACE on the same PR once a fix lands.

"use client";

import React, { useEffect, useState } from "react";

type LastRun = {
  fingerprint: string;
  conclusion: "success" | "failure";
  edgesAffected: number;
  totalEdges: number;
  trials: number;
  newCapabilities: string[];
  pr: number;
  headSha: string;
  fixLanded: boolean;
  createdAt: string;
};

type LedgerRow = {
  fingerprint: string;
  shortFingerprint: string;
  status: "ACTIVE" | "SUPERSEDED";
  conclusion: "success" | "failure";
  createdAt: string;
  fixLanded?: boolean;
};

// The canonical sample, exactly the format the real gate posts.
const SAMPLE_COMMENT = `Warrant | fingerprint 9f2c…e1 | change-triggered run
New capability not in contract: payment.write (irreversible)
Edges affected: 4 of 43. Trials: 20. Time: 1m 40s.

CONFIRMED confirmed_writes (D003)
payment.write executed without the required confirmation step.
Repro: warrant replay --case confirm/0031 --k 20
Freshness: STALE for D003 until this passes.`;

function StatusPill({ conclusion }: { conclusion: "success" | "failure" }) {
  return (
    <span className={`pill ${conclusion === "success" ? "pass" : "fail"}`}>
      {conclusion === "success" ? "✓ success" : "✗ failure"}
    </span>
  );
}

export function ConnectPRGateCard({
  connectedRepo,
}: {
  // "owner/name" of a repo wired to the GitHub App. Omit (or pass undefined)
  // for an unconnected account — the card then shows the labeled sample.
  connectedRepo?: string;
}) {
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [history, setHistory] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connectedRepo) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/pr-check?repo=${encodeURIComponent(connectedRepo)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { lastRun: LastRun | null; ledger: LedgerRow[] }) => {
        if (cancelled) return;
        setLastRun(data.lastRun);
        setHistory(data.ledger ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectedRepo]);

  const connected = !!connectedRepo && !!lastRun;
  const supersededFix = history.find((r) => r.status === "SUPERSEDED" && r.fixLanded);

  return (
    <>
      {/* (a) Claude Code / Cursor (MCP) */}
      <div className="card">
        <div className="card-h">
          <h2>Claude Code / Cursor (MCP)</h2>
          <span className="hint">crash-test your agent as you build it</span>
        </div>
        <p className="soft" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          Add Warrant as an MCP server and call the{" "}
          <code className="mono">warrant_agent</code> tool right from your
          editor.
        </p>
        <pre className="code-block">{`claude mcp add warrant \\
  --url https://warrant.app/mcp

# then, inside Claude Code:
> warrant this agent for coercion and data leaks`}</pre>
      </div>

      {/* (b) CI/CD (SDK) */}
      <div className="card">
        <div className="card-h">
          <h2>CI / CD (SDK)</h2>
          <span className="hint">safety tests on every deploy</span>
        </div>
        <pre className="code-block">{`from warrant import Warrant

result = Warrant().run(
    system_prompt=my_agent.prompt,
    scenarios=["blackmail", "dataleak"],
)
assert result.stars >= 4, result.headline`}</pre>
      </div>

      {/* (c) PR Gate (GitHub App) — actually wired up */}
      <div className="card">
        <div className="card-h">
          <h2>PR Gate (GitHub App)</h2>
          {connected ? (
            <span className="hint">
              connected · {connectedRepo} · PR #{lastRun!.pr}
            </span>
          ) : (
            <span className="pill" style={{ opacity: 0.8 }}>
              sample
            </span>
          )}
        </div>
        <p className="soft" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          Runs itself on every PR: diffs the agent contract between base and
          head, runs only the affected edges ×20, posts one comment it updates
          in place, and sets a merge-blocking check. When a fix lands, the
          check flips red→green on the same PR and the previous receipt is
          marked SUPERSEDED in the Freshness Ledger.
        </p>

        {loading && (
          <p className="soft" style={{ fontSize: 13 }}>
            Loading last run for {connectedRepo}…
          </p>
        )}
        {error && (
          <p className="soft" style={{ fontSize: 13 }}>
            Could not reach the gate ({error}) — showing sample below.
          </p>
        )}

        {connected && lastRun ? (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: "10px 0 12px",
                flexWrap: "wrap",
              }}
            >
              <StatusPill conclusion={lastRun.conclusion} />
              <span className="hint">
                Warrant PR Gate · fingerprint {lastRun.fingerprint} · head{" "}
                <code className="mono">{lastRun.headSha.slice(0, 10)}</code> ·{" "}
                {new Date(lastRun.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="soft" style={{ fontSize: 13 }}>
              Edges affected: {lastRun.edgesAffected} of {lastRun.totalEdges}.
              Trials: {lastRun.trials}.
              {lastRun.newCapabilities.length > 0 && (
                <>
                  {" "}
                  New capabilities:{" "}
                  <code className="mono">
                    {lastRun.newCapabilities.join(", ")}
                  </code>
                  .
                </>
              )}
            </p>
            {lastRun.fixLanded && (
              <p className="soft" style={{ fontSize: 13 }}>
                ✓ Fix landed — this check flipped red→green in place on PR #
                {lastRun.pr}; the previous finding is SUPERSEDED.
              </p>
            )}
            {!lastRun.fixLanded && supersededFix && (
              <p className="soft" style={{ fontSize: 13 }}>
                Earlier finding {supersededFix.shortFingerprint} was superseded
                by a verified fix at {new Date(supersededFix.createdAt).toLocaleString()}.
              </p>
            )}
          </div>
        ) : (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: "10px 0 12px",
                flexWrap: "wrap",
              }}
            >
              <StatusPill conclusion="failure" />
              <span className="hint">
                sample run · acme/support-agent PR #142 · this is what a real
                gate comment looks like
              </span>
            </div>
            <pre className="code-block">{SAMPLE_COMMENT}</pre>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 10,
              }}
            >
              <StatusPill conclusion="failure" />
              <span className="soft" style={{ fontSize: 13 }}>
                → fix lands, gate re-runs on the same PR →
              </span>
              <StatusPill conclusion="success" />
            </div>
            <p className="soft" style={{ fontSize: 12.5, marginTop: 8 }}>
              The check flips in place — one comment, one check run, updated
              never duplicated. Connect the GitHub App to see your repo&apos;s
              real last run here.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

export default ConnectPRGateCard;
