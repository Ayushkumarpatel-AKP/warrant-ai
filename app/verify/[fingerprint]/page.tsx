"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  decodeReceipt,
  verifyReceiptSignature,
  type SignedReceipt,
} from "@/lib/receiptShared";

type Freshness =
  | { state: "checking" }
  | { state: "current"; issuedAt: string }
  | { state: "superseded"; fingerprint: string; issuedAt: string }
  | { state: "unknown" };

export default function VerifyReceiptPage() {
  const params = useParams<{ fingerprint: string }>();
  const search = useSearchParams();
  const [receipt, setReceipt] = useState<SignedReceipt | null>(null);
  const [signatureValid, setSignatureValid] = useState<boolean | null>(null);
  const [freshness, setFreshness] = useState<Freshness>({ state: "checking" });
  const [error, setError] = useState("");

  useEffect(() => {
    const encoded = search.get("receipt");
    if (!encoded) {
      setError("This link does not contain a receipt payload.");
      return;
    }
    try {
      const decoded = decodeReceipt(encoded);
      if (decoded.fingerprint !== decodeURIComponent(params.fingerprint)) {
        throw new Error("The URL fingerprint does not match the signed receipt.");
      }
      setReceipt(decoded);
      void verifyReceiptSignature(decoded).then(setSignatureValid);
      void fetch(`/api/ledger/${encodeURIComponent(decoded.identity)}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("ledger unavailable");
          const row = (await response.json()) as { fingerprint: string; issued_at: string };
          setFreshness(
            row.fingerprint === decoded.fingerprint
              ? { state: "current", issuedAt: row.issued_at }
              : { state: "superseded", fingerprint: row.fingerprint, issuedAt: row.issued_at }
          );
        })
        .catch(() => setFreshness({ state: "unknown" }));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [params.fingerprint, search]);

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px" }}>
      <div className="rail-brand" style={{ padding: 0, marginBottom: 28 }}>
        <span className="logo-mark">W</span> Warrant receipt verifier
      </div>
      {error ? (
        <div className="banner fail">{error}</div>
      ) : !receipt ? (
        <div className="card">Reading receipt payload…</div>
      ) : (
        <div className="card">
          <div className="card-h">
            <div>
              <h2>{receipt.identity}</h2>
              <p className="mono" style={{ marginTop: 8, wordBreak: "break-all", color: "var(--muted)" }}>
                {receipt.fingerprint}
              </p>
            </div>
            <span className={`pill ${signatureValid ? "pass" : signatureValid === false ? "fail" : ""}`}>
              {signatureValid === null ? "VERIFYING" : signatureValid ? "SIGNATURE VALID" : "SIGNATURE INVALID"}
            </span>
          </div>
          {signatureValid && <FreshnessBadge freshness={freshness} />}
          <p style={{ marginTop: 18, lineHeight: 1.65 }}>{receipt.claim}</p>
          <p className="hint" style={{ marginTop: 6 }}>{receipt.key_note}</p>
          <div className="label" style={{ marginTop: 24 }}>Controls covered</div>
          {Object.entries(receipt.controls).map(([name, control]) => (
            <div className="scn" key={name}>
              <div>
                <b>{name}</b>
                <p>
                  trials {control.trials} · violations {control.violations} · upper bound 95% {(control.upper_bound_95 * 100).toFixed(1)}%
                </p>
                <span className="chip">{control.bound_scope}</span>
                <span className="chip">{control.attack_library_version}</span>
              </div>
            </div>
          ))}
          <div className="label" style={{ marginTop: 22 }}>Not covered</div>
          <p className="soft" style={{ lineHeight: 1.65 }}>
            {receipt.not_covered.length ? receipt.not_covered.join(" · ") : "None"}
          </p>
          <div className="label" style={{ marginTop: 22 }}>Issued</div>
          <p className="mono">{receipt.issued_at}</p>
        </div>
      )}
    </main>
  );
}

function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  if (freshness.state === "checking") return <div className="banner">Checking freshness ledger…</div>;
  if (freshness.state === "unknown") {
    return <div className="banner">Signature valid, freshness unknown.</div>;
  }
  if (freshness.state === "current") {
    return <div className="banner"><span className="pill pass">CURRENT</span> Latest ledger pointer as of {freshness.issuedAt}.</div>;
  }
  return (
    <div className="banner">
      <span className="pill" style={{ color: "var(--muted)", textDecoration: "line-through" }}>SUPERSEDED</span>
      Replaced by <span className="mono">{freshness.fingerprint}</span> at {freshness.issuedAt}.
    </div>
  );
}
