"use client";

import { useEffect } from "react";
import { IcoAlert, IcoCheck } from "./ui";
// The root layout did not render for this failure, so the stylesheet the layout
// would have pulled in has to be requested here or the page below is unstyled.
import "./globals.css";

/* Root error boundary: this one replaces the entire document, so it supplies
   its own <html> and <body>. The theme is pinned to dark because the font and
   theme variables normally come from the layout that just failed. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Warrant root error", error);
  }, [error]);

  return (
    <html lang="en" data-theme="dark">
      <body>
        <main className="shell">
          <div className="card shell-card">
            <span className="ap-ico"><IcoAlert /></span>
            <h1>Warrant could not start</h1>
            <p className="shell-sub">
              {error.message ||
                "A failure in the app shell stopped Warrant from rendering at all."}
            </p>
            <div className="shell-actions">
              <button className="btn primary" onClick={reset}>
                <IcoCheck /> Try again
              </button>
              <a className="btn" href="/">
                Reload Warrant
              </a>
            </div>
            {error.digest && (
              <p className="hint shell-detail">
                Reference for the server log: <span className="mono">{error.digest}</span>
              </p>
            )}
            <p className="hint shell-detail">
              Nothing in this browser was signed in and nothing was stored, so there is no
              account state to restore. If this keeps happening, check the terminal running{" "}
              <span className="mono">npm run dev</span>.
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
