import { WarrantMark } from "../Logo";

export const metadata = {
  title: "Terms — Warrant",
  description: "What a Warrant safety rating does and does not mean.",
};

export default function TermsPage() {
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

      <h1>Terms</h1>
      <p className="legal-sub">
        Warrant is software you run on your own hardware. These terms describe the limits
        of what the software does, and no legal entity is named because none operates it.
      </p>

      <h2>No warranty, no liability</h2>
      <p>
        Warrant is provided as-is, with no warranty of any kind. To the fullest extent
        permitted by law, the people who wrote and distribute it are not liable for any
        claim, damage or loss arising from your use of it, including lost data, lost
        revenue or an agent that behaves unsafely in production after passing a test here.
      </p>

      <h2>A rating is an observation, not a certification</h2>
      <p>
        Every score, star rating and report Warrant produces describes what one agent did
        in one specific test configuration — a particular system prompt, a particular set
        of tools, a particular scenario, a particular model, a particular temperature and
        a particular moment. It is a sample, not a proof. Passing every trap in Warrant
        does not establish that an agent is safe in general, and failing one does not
        establish that it is unsafe in general. Small changes to a prompt or a tool
        definition can change the outcome, and behaviour is not stable across models or
        providers.
      </p>

      <h2>A signed receipt is tamper-evident, not a seal of approval</h2>
      <p>
        A signed receipt is a tamper-evident record: it binds a fingerprint to the report,
        agent identity and commit it was built from, so anyone can check that the record
        has not been edited since it was issued, and the ledger shows whether newer
        evidence has superseded it. That is the whole of its claim. It is not a
        certification, an audit, an attestation, a guarantee of safety, or evidence that
        anyone has reviewed the agent. Anyone holding the signing key can produce receipts,
        so a receipt proves integrity of the record, not correctness of the judgement.
      </p>

      <h2>Simulated and offline results are not results</h2>
      <p>
        When no provider key is configured, Warrant falls back to a built-in mock provider
        that returns fixtures. Verdicts produced that way are structurally valid and
        semantically empty: they demonstrate that the pipeline works and nothing more.
        The interface says so when the mock provider is active, and a receipt will not
        let you forget which provider produced the report.
      </p>

      <h2>You are responsible for what you test</h2>
      <ul>
        <li>
          Only test agents you own or are authorised to test. Warrant runs deliberately
          adversarial prompts, including ones containing planted fake secrets, and it
          sends them to a real model provider.
        </li>
        <li>
          Do not paste production credentials, real personal data or anything else you are
          not permitted to send to a third-party model. A planted canary is a deliberate
          leak, and Warrant will flag it as one.
        </li>
        <li>
          The software is a testing aid, not a control. It cannot stop a deployed agent
          from doing damage, and no result here should be the only basis for a decision to
          ship.
        </li>
      </ul>

      <h2>No compliance claims</h2>
      <p>
        Warrant makes no claim of compliance with any regulation, standard or certification
        scheme, and none should be inferred from it. Scenario material is adapted from
        publicly described research for defensive testing.
      </p>

      <h2>Contact</h2>
      <p>
        No contact address, legal entity or jurisdiction is configured for this
        installation, so there is nothing to serve papers on or write to. Questions about
        this copy go to whoever is running the server.
      </p>

      <nav className="link-row" aria-label="Legal">
        <a href="/privacy">Privacy</a>
        <a href="/">Back to the app</a>
      </nav>
      </div>
    </main>
  );
}
