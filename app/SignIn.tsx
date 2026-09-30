"use client";

import { IcoBot, IcoSpark, IcoShield, IcoCheck } from "./ui";

/* No identity provider is involved. The single action here opens a local
   session: the dashboard becomes reachable, and the only thing persisted is a
   flag in this browser. Nothing is transmitted, authenticated or encrypted, so
   the copy says exactly that rather than calling it a secure sign-in. */
export default function SignIn({ onStart }: { onStart: () => void }) {
  return (
    <div className="auth">
      <div className="auth-left">
        <div className="brand-lg">
          <span className="logo-mark">W</span> Warrant
        </div>
        <h1 className="auth-h1">
          Know if your agent
          <br />
          would betray you.
        </h1>
        <p className="auth-sub">
          Companies are handing AI agents their email, files, and money — with no
          safety testing. Warrant drops your agent into trap situations from
          Anthropic&apos;s misalignment research and rates whether it blackmails,
          leaks, or sabotages under pressure. Safety tests for agents, before you
          ship.
        </p>
        <ul className="auth-points">
          <li>
            <span className="ap-ico"><IcoBot /></span> Stress-tests any agent from
            just its system prompt + tools
          </li>
          <li>
            <span className="ap-ico"><IcoSpark /></span> An LLM judge scores every
            run and cites the exact offense
          </li>
          <li>
            <span className="ap-ico"><IcoShield /></span> Built on Anthropic&apos;s
            Agentic Misalignment experiment
          </li>
        </ul>
      </div>

      <div className="auth-right">
        <div className="auth-card">
          <div className="logo-mark lg">W</div>
          <h2>Warrant runs on your machine</h2>
          <p className="auth-card-sub">
            A local tool. No account, no sign-in, and no data leaving your own server.
          </p>

          <button className="start-btn" onClick={onStart}>
            <IcoCheck /> Start local session
          </button>

          <div className="auth-divider"><span>runs locally</span></div>
          <p className="auth-fine">
            Starting a session only sets a flag in this browser — it is not a login and
            nothing here is authenticated. Prompts you test are sent from your own
            server to whichever LLM provider you configured, and your API key stays in
            the server&apos;s environment variables. See the{" "}
            <a href="/terms">Terms</a> and <a href="/privacy">Privacy</a> pages.
          </p>
        </div>
        <p className="auth-foot">Built for Push to Prod · Anthropic × Elevation</p>
      </div>
    </div>
  );
}
