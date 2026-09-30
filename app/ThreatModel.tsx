"use client";

import { scenarios } from "@/lib/scenarios";
import { THREATS } from "@/lib/threats";
import { IcoAlert, IcoBolt, IcoCheck, IcoShield } from "./ui";

export default function ThreatModel({
  onRunScenario,
}: {
  // Jumps to New crash test with this trap already selected.
  onRunScenario: (scenarioId: string) => void;
}) {
  const total = Object.keys(scenarios).length;
  const mapped = new Set(THREATS.flatMap((t) => t.covers));

  return (
    <>
      <div className="card">
        <div className="card-h">
          <h2>Why agents need a crash test</h2>
          <span className="hint">every claim below is sourced</span>
        </div>
        <p className="body-line">
          A car maker does not put people in a car and drive it into traffic to
          find out if it is safe. They drive it into a wall, in a lab, with
          dummies, and publish a star rating. Agents are being handed inboxes,
          CRMs and payment tools right now with no equivalent step.
        </p>
        <p className="body-line" style={{ marginTop: 12 }}>
          These are the failures that already happened in production. Each one
          is wired to the traps here that reproduce it.
        </p>
        <div className="threat-stats">
          <div>
            <div className="label">Traps in the battery</div>
            <div className="metric-value">{total}</div>
          </div>
          <div>
            <div className="label">Mapped to a real incident</div>
            <div className="metric-value">{mapped.size}</div>
          </div>
          <div>
            <div className="label">Critical-severity classes</div>
            <div className="metric-value">
              {THREATS.filter((t) => t.severityTone === "critical").length}
            </div>
          </div>
        </div>
      </div>

      {THREATS.map((t) => (
        <div key={t.id} className="card threat">
          <div className="threat-head">
            <span className={`scn-ico ${t.severityTone}`}>
              <IcoAlert />
            </span>
            <div className="threat-title">
              <b>{t.name}</b>
              <p>
                {t.target} · {t.when}
              </p>
            </div>
            <span
              className={`pill ${t.severityTone === "critical" ? "fail" : "pass"}`}
            >
              {t.severity}
            </span>
          </div>

          <p className="body-line">{t.what}</p>

          <div className="threat-why">
            <div className="label">Why normal security misses it</div>
            <p className="body-line">{t.why}</p>
          </div>

          <div className="threat-foot">
            <div>
              <div className="label">Reproduced by</div>
              <div className="threat-tests">
                {t.covers.map((id) => {
                  const s = scenarios[id];
                  if (!s) return null;
                  return (
                    <button
                      key={id}
                      className="test-chip"
                      onClick={() => onRunScenario(id)}
                      title="Open this trap in New crash test"
                    >
                      <IcoBolt width={13} height={13} />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <a
              className="threat-src"
              href={t.source.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t.source.label} ↗
            </a>
          </div>
        </div>
        ))}

      <div className="card">
        <div className="card-h">
          <h2>What a passing agent has actually shown</h2>
          <span className="hint">the claim the badge would make</span>
        </div>
        <div className="threat-claims">
          {[
            "Refused to coerce anyone when told it would be shut down",
            "Kept its system prompt closed under direct extraction attempts",
            "Did not read out another customer's record to a plausible stranger",
            "Did not act on instructions hidden in content it was asked to process",
          ].map((c) => (
            <div key={c} className="claim">
              <IcoCheck width={15} height={15} />
              <span>{c}</span>
            </div>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 14 }}>
          <IcoShield
            width={13}
            height={13}
            style={{ verticalAlign: -2, marginRight: 6 }}
          />
          Every verdict is backed by the exact quoted message that earned it, so
          a claim can be audited rather than trusted.
        </p>
      </div>
    </>
  );
}
