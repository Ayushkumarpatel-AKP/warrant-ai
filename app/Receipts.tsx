"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import type { SingleScorecard } from "@/lib/receipt";
import {
  encodeReceipt,
  type AgentIdentity,
  type SignedReceipt,
} from "@/lib/receiptShared";
import type { SafetyReport } from "@/lib/suite";

export type ReceiptRequest = {
  report: SafetyReport | SingleScorecard;
  agentIdentity: AgentIdentity | string;
};

export default function Receipts({
  receipts,
  pending,
  onIssued,
  onPendingHandled,
}: {
  receipts: SignedReceipt[];
  pending?: ReceiptRequest | null;
  onIssued: (receipt: SignedReceipt) => void;
  onPendingHandled?: () => void;
}) {
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState("");
  const handled = useRef<ReceiptRequest | null>(null);
  const latest = useMemo(() => {
    const values = new Map<string, string>();
    for (const receipt of receipts) if (!values.has(receipt.identity)) values.set(receipt.identity, receipt.fingerprint);
    return values;
  }, [receipts]);

  useEffect(() => {
    if (!pending || handled.current === pending) return;
    handled.current = pending;
    void issue(pending);
  }, [pending]);

  async function issue(request: ReceiptRequest) {
    setIssuing(true);
    setError("");
    try {
      const response = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Receipt request failed (${response.status})`);
      onIssued(body as SignedReceipt);
      onPendingHandled?.();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setIssuing(false);
    }
  }

  return (
    <>
      <div className="banner">
        <span className={`conn-dot ${issuing ? "" : "ok"}`} />
        {issuing
          ? "Signing receipt and advancing the freshness ledger…"
          : "Receipts carry their own signed evidence. The ledger only answers whether that evidence is still current."}
      </div>
      {error && <div className="banner fail">{error}</div>}
      {receipts.length === 0 && !issuing ? (
        <div className="card empty-row">Run a crash test or full report, then choose Get signed receipt.</div>
      ) : (
        receipts.map((receipt) => {
          const current = latest.get(receipt.identity) === receipt.fingerprint;
          const supersededBy = current ? null : latest.get(receipt.identity);
          return (
            <ReceiptCard
              key={`${receipt.fingerprint}:${receipt.issued_at}`}
              receipt={receipt}
              current={current}
              supersededBy={supersededBy}
            />
          );
        })
      )}
    </>
  );
}

function ReceiptCard({
  receipt,
  current,
  supersededBy,
}: {
  receipt: SignedReceipt;
  current: boolean;
  supersededBy?: string | null;
}) {
  const [qr, setQr] = useState("");
  const [verifyUrl, setVerifyUrl] = useState("");

  useEffect(() => {
    const url = `${window.location.origin}/verify/${encodeURIComponent(receipt.fingerprint)}?receipt=${encodeURIComponent(
      encodeReceipt(receipt)
    )}`;
    setVerifyUrl(url);
    void QRCode.toDataURL(url, { errorCorrectionLevel: "L", margin: 1, width: 220 }).then(setQr);
  }, [receipt]);

  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h2>{receipt.identity}</h2>
          <div className="mono" style={{ marginTop: 5, color: "var(--muted)", wordBreak: "break-all" }}>
            {receipt.fingerprint}
          </div>
        </div>
        <span
          className={`pill ${current ? "pass" : ""}`}
          style={current ? undefined : { color: "var(--muted)", textDecoration: "line-through" }}
        >
          {current ? "CURRENT" : `SUPERSEDED by ${shortFingerprint(supersededBy)}`}
        </span>
      </div>
      <div className="grid k2">
        <div>
          <div className="label">Controls covered</div>
          {Object.entries(receipt.controls).map(([name, control]) => (
            <div className="scn" key={name} style={{ padding: "9px 0" }}>
              <div>
                <b>{name}</b>
                <p>
                  {control.trials} trials · {control.violations} violations · 95% upper bound {formatBound(control.upper_bound_95)}
                </p>
                <span className="chip">{control.bound_scope}</span>
                <span className="chip">{shortFingerprint(control.attack_library_version)}</span>
              </div>
            </div>
          ))}
          <div className="label" style={{ marginTop: 16 }}>Not covered</div>
          <p className="soft" style={{ fontSize: 13, lineHeight: 1.6 }}>
            {receipt.not_covered.length ? receipt.not_covered.join(" · ") : "None"}
          </p>
          <p style={{ marginTop: 16, lineHeight: 1.6 }}>{receipt.claim}</p>
          <p className="hint" style={{ marginTop: 6 }}>{receipt.key_note}</p>
        </div>
        <div style={{ textAlign: "center" }}>
          {qr && <img src={qr} width={220} height={220} alt={`Verification QR for ${receipt.identity}`} />}
          <div style={{ marginTop: 10 }}>
            <a className="btn primary tiny" href={verifyUrl}>Open public verification</a>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>The QR contains the signed receipt, not a lookup key.</p>
        </div>
      </div>
    </div>
  );
}

function formatBound(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function shortFingerprint(value?: string | null): string {
  if (!value) return "unknown";
  const clean = value.replace(/^sha256:/, "");
  return `${clean.slice(0, 8)}…${clean.slice(-6)}`;
}
