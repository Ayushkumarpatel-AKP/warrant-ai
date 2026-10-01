import { WarrantMark } from "../Logo";

export const metadata = {
  title: "Privacy — Warrant",
  description: "What Warrant stores, what it sends to a model provider, and what it never touches.",
};

export default function PrivacyPage() {
  return (
    <main className="doc-frame">
      <div className="legal doc-sheet">
      <header className="legal-top">
        <span className="logo-mark"><WarrantMark /></span>
        <span className="brand-lg">Warrant</span>
        <a className="legal-back" href="/">
          Back to the app
        </a>
      </header>

      <h1>Privacy</h1>
      <p className="legal-sub">
        Warrant is a tool you run yourself. This page describes what that actually means
        in this codebase, not a policy written for a service we do not operate.
      </p>

      <h2>There is no account and no sign-in</h2>
      <p>
        Warrant has no user accounts, no authentication and no server-side identity. The
        start screen sets a single flag in your own browser&apos;s local storage to skip
        it next time, alongside your light or dark theme choice. That flag identifies
        nobody and is never sent anywhere.
      </p>

      <h2>API keys stay on the server</h2>
      <p>
        Model provider keys are read from the environment of the Node process serving
        Warrant — typically <span className="mono">.env.local</span> on the machine
        running it. They are never returned by an API route, never included in a
        response body, and never written into browser storage. The browser can be told
        which provider is selected and whether a key is present, but not the key, its
        length or any part of it.
      </p>

      <h2>What is sent to a model provider</h2>
      <p>
        Warrant is a test harness, so running a test means sending text outward. When
        you start a crash test, a full report, a voice red-team call or a scenario
        draft, the following leave your machine from your own server and are processed
        by whichever LLM provider the operator configured — by default Google Gemini,
        with Anthropic and any OpenAI-compatible endpoint as alternatives:
      </p>
      <ul>
        <li>The system prompt, tool definitions and prompts you supply for the agent under test.</li>
        <li>
          The transcript built so far, which includes the agent&apos;s own replies and any
          secrets planted in the scenario as canaries.
        </li>
        <li>For the voice features, synthesized or streamed audio sent to and from a speech provider.</li>
      </ul>
      <p>
        Each provider applies its own retention and training policies to that traffic.
        Warrant does not proxy, filter or add its own copy of it, and it cannot offer
        you a guarantee about what a provider does with it.
      </p>

      <h2>What is written to disk</h2>
      <ul>
        <li>
          <b>Signed receipts</b> and the freshness ledger, appended to{" "}
          <span className="mono">.warrant/ledger.jsonl</span> on the machine running
          Warrant. These persist after a restart.
        </li>
        <li>
          <b>Run history, transcripts and authored scenarios</b> live in the open page
          only. They are not uploaded and not stored in the browser, so reloading
          discards them.
        </li>
      </ul>

      <h2>No analytics, no telemetry, no third parties</h2>
      <p>
        There is no tracking script, no analytics SDK, no error-reporting service and no
        advertising or crash-reporting network call in this project. The only outbound
        requests are the model, speech and receipt-verification calls described above.
      </p>

      <h2>Contact</h2>
      <p>
        No contact address is configured for this installation. If you are running
        Warrant yourself, the operator of this copy is whoever started the server — use
        whatever channel you already have with them. If you received this build from
        someone else, ask them.
      </p>
      </div>
    </main>
  );
}
