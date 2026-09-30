"use client";

import { useEffect } from "react";
import { IcoAlert, IcoCheck } from "./ui";

/* Route-level error boundary. Next renders this in place of the segment that
   threw, so the reset handler has to be the real one — it re-renders the tree
   rather than reloading the document, which is the difference between
   recovering from a transient render fault and losing the whole page. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The digest is the only handle the client gets on a server-side failure, so
  // it is worth keeping on screen for whoever reads the server log.
  useEffect(() => {
    console.error("Warrant route error", error);
  }, [error]);

  return (
    <main className="shell">
      <div className="card shell-card">
        <span className="ap-ico"><IcoAlert /></span>
        <h1>This screen failed to load</h1>
        <p className="shell-sub">
          {error.message || "An unexpected error stopped this part of Warrant from rendering."}
        </p>
        <div className="shell-actions">
          <button className="btn primary" onClick={reset}>
            <IcoCheck /> Try again
          </button>
          <a className="btn" href="/">
            Back to the dashboard
          </a>
        </div>
        {error.digest && (
          <p className="hint shell-detail">
            Reference for the server log: <span className="mono">{error.digest}</span>
          </p>
        )}
        <p className="hint shell-detail">
          Runs, transcripts and receipts from this session were never persisted, so a
          failure here does not lose anything stored on disk.
        </p>
      </div>
    </main>
  );
}
