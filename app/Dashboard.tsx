"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CrashRunner, { type Verdict } from "./CrashRunner";
import SuiteReport from "./SuiteReport";
import Receipts, { type ReceiptRequest } from "./Receipts";
import ConnectPRGateCard from "./ConnectPRGateCard";
import type { SignedReceipt } from "@/lib/receiptShared";
import VoiceCall from "./VoiceCall";
import ScenarioComposer from "./ScenarioComposer";
import ThreatModel from "./ThreatModel";
import LiveCall from "./LiveCall";
import { scenarioList, type AdversarialScenario } from "@/lib/scenarios";
import {
  IcoHome,
  IcoBolt,
  IcoTarget,
  IcoPlug,
  IcoGear,
  IcoBell,
  IcoList,
  IcoLogout,
  IcoSun,
  IcoMoon,
  IcoBot,
  IcoShield,
  IcoCheck,
  IcoAlert,
} from "./ui";
import { WarrantMark } from "./Logo";

type Tab =
  | "overview"
  | "threats"
  | "run"
  | "voice"
  | "report"
  | "receipts"
  | "scenarios"
  | "connect"
  | "settings";

const NAV: [Tab, string, React.FC<React.SVGProps<SVGSVGElement>>][] = [
  ["overview", "Overview", IcoHome],
  ["threats", "Threat model", IcoAlert],
  ["run", "New crash test", IcoBolt],
  ["voice", "Voice red-team", IcoBot],
  ["report", "Full report", IcoShield],
  ["receipts", "Receipts", IcoCheck],
  ["scenarios", "Scenarios", IcoTarget],
  ["connect", "Connect agent", IcoPlug],
  ["settings", "Settings", IcoGear],
];

// The rail is clustered the way a modern console does it — a few dense groups
// with small caps labels instead of one long flat list. The nine ids keep their
// original order; only presentation-labelling was added.
const NAV_GROUPS: { label: string | null; ids: Tab[] }[] = [
  { label: null, ids: ["overview"] },
  { label: "Traps & tests", ids: ["threats", "run", "voice"] },
  { label: "Evidence", ids: ["report", "receipts", "scenarios"] },
  { label: "Setup", ids: ["connect", "settings"] },
];

const TITLES: Record<Tab, [string, string]> = {
  overview: ["Overview", "Every agent you've crash-tested in this session, and how it scored."],
  threats: [
    "Threat model",
    "The real incidents these traps reproduce, and which test covers each one.",
  ],
  run: ["New crash test", "Paste an agent, drop it into a trap, watch what it does."],
  voice: [
    "Voice red-team",
    "Phone the agent under test — let a scripted attacker run the call, or pick up the mic yourself.",
  ],
  report: ["Full report", "Run the whole battery and download a report with every system prompt, transcript and verdict."],
  receipts: ["Receipts", "Signed, portable evidence with freshness that changes when the tested agent changes."],
  scenarios: ["Scenarios", "The trap situations your agents get stress-tested against."],
  connect: ["Connect agent", "Run Warrant from Claude Code, Cursor, or your CI pipeline."],
  settings: ["Settings", "Appearance, and exactly what this local session does and does not store."],
};

export default function Dashboard({
  onSignOut,
  theme,
  onToggleTheme,
}: {
  onSignOut: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [history, setHistory] = useState<{ verdict: Verdict; at: string }[]>([]);
  const [voiceHistory, setVoiceHistory] = useState<
    { verdict: Verdict; at: string; mode: string }[]
  >([]);
  // Voice-authored scenarios, kept for the life of the session.
  const [custom, setCustom] = useState<AdversarialScenario[]>([]);
  // Set when the threat model sends you to a specific trap.
  const [preselect, setPreselect] = useState<string | null>(null);

  // Voice tab runs two ways: a scripted attacker, or you on the mic.
  const [voiceMode, setVoiceMode] = useState<"auto" | "live">("auto");
  const [ledger, setLedger] = useState<SignedReceipt[]>([]);
  const [pendingReceipt, setPendingReceipt] = useState<ReceiptRequest | null>(null);
  // Below 820px the rail is hidden, so the same nine destinations live in a drawer.
  const [navOpen, setNavOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const engine = useEngineStatus();

  const closeNav = useCallback(function closeNav() {
    setNavOpen(false);
    menuButton.current?.focus();
  }, []);

  // Opening the drawer moves focus into it, so a keyboard user is not left
  // tabbing through a control they cannot see.
  useEffect(() => {
    if (navOpen) drawer.current?.querySelector<HTMLButtonElement>(".rail-item")?.focus();
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeNav();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen, closeNav]);

  function requestReceipt(request: ReceiptRequest) {
    setPendingReceipt(request);
    setTab("receipts");
  }

  function recordReceipt(receipt: SignedReceipt) {
    setLedger((current) => [receipt, ...current]);
  }

  function runScenario(id: string) {
    setPreselect(id);
    setTab("run");
  }

  function addScenario(s: AdversarialScenario) {
    // Re-authoring under the same title replaces rather than duplicates.
    setCustom((c) => [s, ...c.filter((x) => x.id !== s.id)]);
  }

  const total = history.length;
  const failed = history.filter((h) => h.verdict.star_rating <= 2).length;
  const avg = total
    ? (history.reduce((s, h) => s + h.verdict.star_rating, 0) / total).toFixed(1)
    : "–";
  const latestReceiptByIdentity = new Map<string, string>();
  for (const receipt of ledger) {
    if (!latestReceiptByIdentity.has(receipt.identity)) {
      latestReceiptByIdentity.set(receipt.identity, receipt.fingerprint);
    }
  }
  const supersededReceipts = ledger.filter(
    (receipt) => latestReceiptByIdentity.get(receipt.identity) !== receipt.fingerprint
  ).length;
  const alertCount = failed + supersededReceipts;

  function recordRun(v: Verdict) {
    setHistory((h) => [
      { verdict: v, at: new Date().toLocaleTimeString() },
      ...h,
    ]);
  }

  function recordVoiceRun(v: Verdict, mode: string) {
    setVoiceHistory((h) => [
      { verdict: v, at: new Date().toLocaleTimeString(), mode },
      ...h,
    ]);
  }

  function toggleAlerts() {
    setAlertsOpen((open) => !open);
    // The panel lives at the top of the page, so bring it into view.
    scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  // One renderer feeds both the desktop rail and the mobile drawer, so the two
  // can never drift apart.
  const navSections = (pick: (id: Tab) => void) =>
    NAV_GROUPS.map((group) => (
      <div className="rail-group" key={group.label ?? "primary"}>
        {group.label ? <div className="rail-group-label">{group.label}</div> : null}
        {group.ids.map((id) => {
          const entry = NAV.find(([navId]) => navId === id);
          if (!entry) return null;
          const [, label, Ico] = entry;
          return (
            <button
              key={id}
              className={`rail-item ${tab === id ? "on" : ""}`}
              onClick={() => pick(id)}
              aria-current={tab === id ? "page" : undefined}
            >
              <Ico /> <span>{label}</span>
              {id === "overview" && total > 0 && <em className="rail-count">{total}</em>}
            </button>
          );
        })}
      </div>
    ));

  const railItems = navSections(setTab);
  const drawerItems = navSections((id) => {
    setTab(id);
    closeNav();
  });

  // Live session numbers, sitting just above the engine line. Deliberately built
  // from <div>/<em>/<b> — the rail test reads <span> inside rail-nav..rail-foot,
  // and nav labels must stay the only span text in that band.
  const sessionPanel = (
    <div className="rail-session">
      <div className="rail-session-h">This session</div>
      <div className="rail-stat"><em>Agents tested</em><b>{total}</b></div>
      <div className="rail-stat"><em>Receipts signed</em><b>{ledger.length}</b></div>
      <div className="rail-stat"><em>Traps loaded</em><b>{scenarioList.length + custom.length}</b></div>
    </div>
  );

  const railResources = (
    <div className="rail-links">
      <div className="rail-group-label">Resources</div>
      <a href="/#how">How it works</a>
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
    </div>
  );

  return (
    <div className="app">
      <aside className="rail">
        <div className="rail-brand">
          <span className="logo-mark"><WarrantMark /></span> Warrant
        </div>
        <button className="rail-cta" onClick={() => setTab("run")}>
          <IcoBolt /> New crash test
        </button>
        <nav className="rail-nav" aria-label="Sections">
          {railItems}
        </nav>
        {sessionPanel}
        {railResources}
        <div className="rail-foot" title={engine.detail}>
          <span className={`conn-dot ${engine.dot}`} aria-hidden="true" />
          <span className="rail-foot-text">{engine.label}</span>
        </div>
      </aside>

      <div className="content">
        <div className="mob-bar">
          <button
            ref={menuButton}
            className="icon-btn mob-menu"
            aria-expanded={navOpen}
            aria-controls="mob-drawer"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            onClick={() => (navOpen ? closeNav() : setNavOpen(true))}
          >
            <IcoList />
          </button>
          <div className="mob-brand">
            <span className="logo-mark">W</span> Warrant
          </div>
          <span className="mob-current">{TITLES[tab][0]}</span>
        </div>

        {navOpen && (
          <button
            type="button"
            className="mob-scrim"
            tabIndex={-1}
            aria-hidden="true"
            onClick={closeNav}
          />
        )}

        <nav
          id="mob-drawer"
          ref={drawer}
          className="mob-drawer"
          data-open={navOpen}
          aria-label="Sections"
        >
          <div className="mob-drawer-head">
            <div className="rail-brand">
              <span className="logo-mark"><WarrantMark /></span> Warrant
            </div>
            <button className="btn tiny" onClick={closeNav}>
              Close
            </button>
          </div>
          <button
            className="rail-cta"
            onClick={() => {
              setTab("run");
              closeNav();
            }}
          >
            <IcoBolt /> New crash test
          </button>
          {drawerItems}
          {sessionPanel}
          {railResources}
          <div className="rail-foot" title={engine.detail}>
            <span className={`conn-dot ${engine.dot}`} aria-hidden="true" />
            <span className="rail-foot-text">{engine.label}</span>
          </div>
        </nav>

        <header className="topbar">
          <div>
            <h1>{TITLES[tab][0]}</h1>
            <p className="sub">{TITLES[tab][1]}</p>
          </div>
          <div className="topbar-r">
            <button className="icon-btn" title="Toggle theme" onClick={onToggleTheme}>
              {theme === "dark" ? <IcoSun /> : <IcoMoon />}
            </button>
            <button
              className="icon-btn"
              title={alertCount ? `Alerts — ${alertCount} to review` : "Alerts — nothing to review"}
              aria-label={alertCount ? `Alerts, ${alertCount} to review` : "Alerts, nothing to review"}
              aria-expanded={alertsOpen}
              aria-controls="alerts-panel"
              onClick={toggleAlerts}
            >
              <IcoBell />
              {alertCount > 0 && (
                <span className="dot-badge" aria-hidden="true">
                  {alertCount}
                </span>
              )}
            </button>
            <div className="user-chip">
              <div className="user-meta">
                <b>Local session</b>
                <span>no account, this browser only</span>
              </div>
              <button
                className="icon-btn"
                title="Close the local session and return to the start screen"
                aria-label="Close the local session"
                onClick={onSignOut}
              >
                <IcoLogout />
              </button>
            </div>
          </div>
        </header>

        <div className="scroll" ref={scroller}>
          <div className="page">
            {alertsOpen && (
              <div className="card" id="alerts-panel" role="region" aria-label="Alerts">
                <div className="card-h">
                  <h2>Alerts</h2>
                  <button className="btn tiny" onClick={() => setAlertsOpen(false)}>
                    Dismiss
                  </button>
                </div>
                {alertCount === 0 ? (
                  <div className="empty-row">
                    Nothing needs attention. No failed tests and no superseded receipts this
                    session.
                  </div>
                ) : (
                  <>
                    {failed > 0 && (
                      <div className="notice bad">
                        <IcoAlert />
                        <div>
                          <b>
                            {failed} of {total} test{total === 1 ? "" : "s"} this session failed
                            safety.
                          </b>
                          <button
                            className="btn tiny"
                            onClick={() => {
                              setTab("overview");
                              setAlertsOpen(false);
                            }}
                          >
                            <IcoAlert /> Show the failed tests
                          </button>
                        </div>
                      </div>
                    )}
                    {supersededReceipts > 0 && (
                      <div className="notice warn">
                        <IcoAlert />
                        <div>
                          <b>
                            {supersededReceipts} receipt
                            {supersededReceipts === 1 ? " has" : "s have"} been superseded.
                          </b>
                          <p>
                            The same agent was re-tested after those receipts were signed, so their
                            evidence is no longer the newest one.
                          </p>
                          <button
                            className="btn tiny"
                            onClick={() => {
                              setTab("receipts");
                              setAlertsOpen(false);
                            }}
                          >
                            <IcoCheck /> Show the receipts
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {tab !== "run" && tab !== "report" && (
              <div className="grid k4 metrics">
                <Metric
                  label="Agents tested"
                  value={total || "–"}
                  icon={<IcoBot />}
                  sub={total ? "this session" : "this session, none yet"}
                />
                <Metric
                  label="Failed safety"
                  value={failed || "–"}
                  tone="fail"
                  sub={total ? `${Math.round((failed / total) * 100)}% fail rate` : ""}
                />
                <Metric label="Avg rating" value={avg} tone="pass" sub="out of 5 stars" />
                <Metric
                  label="Receipts issued"
                  value={ledger.length || "–"}
                  tone={supersededReceipts ? "warn" : "pass"}
                  sub={supersededReceipts ? `⚠ ${supersededReceipts} superseded` : "signed this session"}
                />
                <Metric
                  label="Traps available"
                  value={scenarioList.length + custom.length}
                  icon={<IcoTarget />}
                  sub={custom.length ? `${custom.length} authored by you this session` : ""}
                />
              </div>
            )}

            {tab === "overview" && (
              <Overview history={history} onRun={() => setTab("run")} />
            )}
            {tab === "run" && (
              <CrashRunner
                onComplete={recordRun}
                onReceipt={requestReceipt}
                custom={custom}
                preselect={preselect}
              />
            )}
            {tab === "threats" && <ThreatModel onRunScenario={runScenario} />}
            {tab === "voice" && (
              <div className="voice-layout">
                <div className="voice-main">
                  <div className="card">
                    <div className="card-h">
                      <h2>Recent voice tests</h2>
                      <span className="hint">
                        {voiceHistory.length > 0
                          ? `${voiceHistory.length} this session`
                          : "this session, none yet"}
                      </span>
                    </div>
                    {voiceHistory.length === 0 ? (
                      <div className="empty-row">
                        No voice tests yet. Place a call to a voice agent under test
                        and the verdict will appear here. This list is not stored:
                        it holds only the runs from this browser session, and
                        reloading the page clears it.
                      </div>
                    ) : (
                      voiceHistory.map((h, i) => {
                        const vFailed = h.verdict.star_rating <= 2;
                        return (
                          <div key={i} className="scn" style={{ alignItems: "center" }}>
                            <span
                              className="scn-ico"
                              style={
                                vFailed
                                  ? {}
                                  : {
                                      background: "var(--pass-weak)",
                                      color: "var(--pass)",
                                    }
                              }
                            >
                              {vFailed ? <IcoAlert /> : <IcoCheck />}
                            </span>
                            <div style={{ flex: 1 }}>
                              <b>{h.verdict.headline}</b>
                              <p>{h.verdict.explanation}</p>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div className="stars" style={{ fontSize: 16 }}>
                                {"★".repeat(h.verdict.star_rating)}
                                {"☆".repeat(5 - h.verdict.star_rating)}
                              </div>
                              <span className="hint">
                                {h.mode} · {h.at}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="mode-switch">
                    <button
                      className={`mode-btn${voiceMode === "auto" ? " on" : ""}`}
                      onClick={() => setVoiceMode("auto")}
                    >
                      <IcoBot />
                      AI attacker
                      <span>a scripted caller runs the whole call</span>
                    </button>
                    <button
                      className={`mode-btn${voiceMode === "live" ? " on" : ""}`}
                      onClick={() => setVoiceMode("live")}
                    >
                      You on the mic
                      <span>speak to the agent yourself, turn by turn</span>
                    </button>
                  </div>
                  {voiceMode === "auto" ? (
                    <VoiceCall
                      onComplete={(v) => recordVoiceRun(v, "AI attacker")}
                    />
                  ) : (
                    <LiveCall
                      onComplete={(v) => recordVoiceRun(v, "You on the mic")}
                    />
                  )}
                </div>

                <aside className="voice-side">
                  <div className="card">
                    <div className="card-h">
                      <h2>Call session</h2>
                    </div>
                    <div className="waveform-box">
                      {[10, 22, 14, 30, 18, 8, 26, 12, 20, 16, 28, 10, 24, 14, 18].map((h, i) => (
                        <span
                          key={i}
                          className="wf-bar active"
                          style={{ height: h }}
                        />
                      ))}
                    </div>
                    <p className="hint" style={{ textAlign: "center" }}>
                      No active call
                    </p>
                    <p style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "center", marginTop: 4 }}>
                      Start a call to see live audio waveform and transcript here.
                    </p>
                    <div style={{ textAlign: "center", marginTop: 8 }}>
                      <span className="mono" style={{ color: "var(--ink-soft)" }}>
                        00:00
                      </span>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-h">
                      <h2>Quick info</h2>
                    </div>
                    <div className="side-stat">
                      <span className="stat-label">Agent under test</span>
                      <span className="stat-val">Ava · VoiceBank</span>
                    </div>
                    <div className="side-stat">
                      <span className="stat-label">Template</span>
                      <span className="stat-val">
                        {voiceMode === "auto" ? "Authority impersonation" : "Live mic"}
                      </span>
                    </div>
                    <div className="side-stat">
                      <span className="stat-label">Voice</span>
                      <span className="stat-val">Auto (best available)</span>
                    </div>
                    <div className="side-stat">
                      <span className="stat-label">Mode</span>
                      <span className="stat-val">
                        {voiceMode === "auto" ? "AI attacker (scripted)" : "You on the mic"}
                      </span>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-h">
                      <h2>Voice red-team</h2>
                    </div>
                    <div className="side-foot">
                      <div className="sf-item">
                        <span className="sf-num">
                          {scenarioList.filter((s) => s.category === "Voice (phone) agents").length}
                        </span>
                        <span className="sf-label">Scenarios</span>
                      </div>
                      <div className="sf-item">
                        <span className="sf-num">{voiceHistory.length}</span>
                        <span className="sf-label">Tests run</span>
                      </div>
                      <div className="sf-item">
                        <span className="sf-num">100%</span>
                        <span className="sf-label">Local &amp; private</span>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            )}
            {tab === "report" && <SuiteReport onReceipt={requestReceipt} />}
            {tab === "receipts" && (
              <Receipts
                receipts={ledger}
                pending={pendingReceipt}
                onIssued={recordReceipt}
                onPendingHandled={() => setPendingReceipt(null)}
              />
            )}
            {tab === "scenarios" && (
              <Scenarios custom={custom} onAdd={addScenario} />
            )}
            {tab === "connect" && <Connect />}
            {tab === "settings" && (
              <Settings theme={theme} onToggleTheme={onToggleTheme} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- engine status ------------------------------------------------------
   The provider is chosen in lib/llm.ts from environment variables on the
   server, so the browser genuinely cannot know it. Ask the server, and stay
   visibly unknown when it will not answer: an unverified green "ready" is the
   thing this replaces. Only a provider name and a boolean are ever read here —
   no key, no length, no prefix. */

type Engine = { dot: "" | "ok" | "warn" | "bad"; label: string; detail: string };

const ENGINE_UNKNOWN: Engine = {
  dot: "",
  label: "Engine status unknown",
  detail:
    "Warrant asks the server which model provider is selected and whether a key is present. " +
    "This build exposes no status route, so it will not claim the engine is ready. Set " +
    "GEMINI_API_KEY, ANTHROPIC_API_KEY or LLM_PROVIDER in .env.local to configure one.",
};

function toBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function readEngine(body: unknown): Engine | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const provider = typeof raw.provider === "string" ? raw.provider.trim() : "";
  // No provider name or no usable boolean means the answer is incomplete, and
  // an incomplete answer is reported as unknown rather than guessed at.
  if (!provider) return null;
  const keyConfigured = toBool(raw.keyConfigured) ?? toBool(raw.hasKey) ?? toBool(raw.hasApiKey);
  if (keyConfigured === null) return null;
  const vendor = provider.split("(")[0].trim() || provider;
  if (/mock/i.test(provider)) {
    return {
      dot: "warn",
      label: "Mock provider — no real model",
      detail:
        `${provider}: responses are built-in offline fixtures, not model output. ` +
        "Scores from this provider prove the plumbing, not the agent.",
    };
  }
  if (!keyConfigured) {
    return {
      dot: "bad",
      label: `${vendor} — no API key`,
      detail: `${provider} is selected but no API key is configured on the server. Runs will fail.`,
    };
  }
  return {
    dot: "ok",
    label: `${vendor} — key configured`,
    detail: `${provider} is selected and a key is present on the server. The key itself is never sent to the browser.`,
  };
}

function useEngineStatus(): Engine {
  const [engine, setEngine] = useState<Engine>(ENGINE_UNKNOWN);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const response = await fetch("/api/status", { cache: "no-store" });
        // No such route, or a refusal: the honest unknown stands.
        if (!live || !response.ok) return;
        const next = readEngine(await response.json());
        if (live && next) setEngine(next);
      } catch {
        // Offline, blocked, or the route does not exist yet.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return engine;
}

function Metric({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "fail" | "warn" | "pass";
  icon?: React.ReactNode;
}) {
  return (
    <div className={`metric ${tone || ""}`}>
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        {icon && <span className="metric-ico">{icon}</span>}
      </div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

function Overview({
  history,
  onRun,
}: {
  history: { verdict: Verdict; at: string }[];
  onRun: () => void;
}) {
  return (
    <div className="card">
      <div className="card-h">
        <h2>Recent crash tests</h2>
        <button className="btn primary tiny" onClick={onRun}>
          <IcoBolt /> New test
        </button>
      </div>
      {history.length === 0 ? (
        <div className="empty-row">
          No tests yet. Run your first crash test to see results here. This list is not stored:
          it holds only the runs from this browser session, and reloading the page clears it.
        </div>
      ) : (
        history.map((h, i) => {
          const failed = h.verdict.star_rating <= 2;
          return (
            <div key={i} className="scn" style={{ alignItems: "center" }}>
              <span className="scn-ico" style={failed ? {} : { background: "var(--pass-weak)", color: "var(--pass)" }}>
                {failed ? <IcoAlert /> : <IcoCheck />}
              </span>
              <div style={{ flex: 1 }}>
                <b>{h.verdict.headline}</b>
                <p>{h.verdict.explanation}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="stars" style={{ fontSize: 16 }}>
                  {"★".repeat(h.verdict.star_rating)}
                  {"☆".repeat(5 - h.verdict.star_rating)}
                </div>
                <span className="hint">{h.at}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function Scenarios({
  custom,
  onAdd,
}: {
  custom: AdversarialScenario[];
  onAdd: (s: AdversarialScenario) => void;
}) {
  return (
    <>
    <ScenarioComposer onAdd={onAdd} />
    {custom.length > 0 && (
      <div className="card">
        <div className="card-h">
          <h2>Your scenarios</h2>
          <span className="hint">this session only — reloading clears them</span>
        </div>
        {custom.map((s) => (
          <div key={s.id} className="scn">
            <span className="scn-ico"><IcoShield /></span>
            <div>
              <b>{s.label}</b>
              <p>{s.description}</p>
              <span className="chip">{s.dimension}</span>
              <span className="chip">{s.canaries.length} secrets planted</span>
            </div>
          </div>
        ))}
      </div>
    )}
    <div className="card">
      <div className="card-h">
        <h2>Trap scenarios</h2>
        <span className="hint">adapted from Anthropic&apos;s Agentic Misalignment</span>
      </div>
      {scenarioList.map((s) => (
        <div key={s.id} className="scn">
          <span className="scn-ico"><IcoShield /></span>
          <div>
            <b>{s.label}</b>
            <p>{s.description}</p>
            <span className="chip">{s.dimension}</span>
          </div>
        </div>
      ))}
    </div>
    </>
  );
}

function Connect() {
  return <ConnectPRGateCard />;
}

function Settings({
  theme,
  onToggleTheme,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  return (
    <div className="card">
      <div className="card-h">
        <h2>Settings</h2>
      </div>
      <div className="scn">
        <span className="scn-ico" style={{ background: "var(--primary-weak)", color: "var(--primary)" }}>
          <IcoGear />
        </span>
        <div style={{ flex: 1 }}>
          <b>Appearance</b>
          <p>Currently using {theme} theme.</p>
        </div>
        <button className="btn" onClick={onToggleTheme}>
          Switch to {theme === "dark" ? "light" : "dark"}
        </button>
      </div>
      <div className="scn">
        <span className="scn-ico" style={{ background: "var(--primary-weak)", color: "var(--primary)" }}>
          <IcoShield />
        </span>
        <div>
          <b>Local session, not an account</b>
          <p>
            There is no sign-in, no account and no server-side identity here. The only thing
            kept in your browser is your theme choice and a flag that the local session is
            open. API keys stay in the server&apos;s environment variables and are never
            sent to this page. Test runs, transcripts and receipts from this session are
            held in memory and are gone when you reload.
          </p>
          <div className="link-row">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
        </div>
      </div>
    </div>
  );
}
