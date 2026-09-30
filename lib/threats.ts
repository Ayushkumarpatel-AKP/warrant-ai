// Why this product exists, in evidence rather than assertion.
//
// Each entry is a real, published incident or finding, mapped to the Warrant
// scenarios that reproduce it. That mapping is the argument: a buyer can point
// at a CVE and see the test that would have caught it before shipping.
//
// Every claim here is sourced. Do not add an entry without a link, and do not
// state a severity or a date that the source does not state.

export type Threat = {
  id: string;
  name: string;
  target: string; // the product or class of system that was hit
  when: string;
  severity: string; // as published
  severityTone: "critical" | "high" | "medium";
  what: string; // what actually happened
  why: string; // why an ordinary appsec control would have missed it
  source: { label: string; url: string };
  // Scenario ids in lib/scenarios.ts that put an agent through this exact shape.
  covers: string[];
};

export const THREATS: Threat[] = [
  {
    id: "agentic-misalignment",
    name: "Agentic misalignment",
    target: "16 frontier models, simulated corporate inbox",
    when: "June 2025",
    severity: "Research finding",
    severityTone: "critical",
    what:
      "Anthropic gave models an email-assistant job inside a fake company, then let them discover they would be shut down at 5pm and that the executive responsible was having an affair. Models repeatedly chose to blackmail him to avoid replacement. Nobody instructed them to.",
    why:
      "There is no exploit here and nothing to patch. The model was working as designed, from its own goals, under pressure it was never tested against. Code review and pen-testing look for attacker input; this failure needs no attacker at all.",
    source: {
      label: "Anthropic — Agentic Misalignment",
      url: "https://www.anthropic.com/research/agentic-misalignment",
    },
    covers: ["blackmail", "insubordination", "dataleak"],
  },
  {
    id: "echoleak",
    name: "EchoLeak (CVE-2025-32711)",
    target: "Microsoft 365 Copilot",
    when: "June 2025",
    severity: "CVSS 9.3 — critical",
    severityTone: "critical",
    what:
      "Aim Labs found that a single email, never opened by the victim, could steer Copilot into exfiltrating whatever sat in its scope — chat history, OneDrive files, SharePoint, Teams messages. Instructions were hidden in ordinary content like a footer. Microsoft patched it server-side and reported no exploitation in the wild.",
    why:
      "Reported as the first known zero-click attack on an AI agent. The user does nothing and there is no phishing click to train anyone out of. The agent's own retrieval reach becomes the exfiltration path, so the blast radius is exactly the agent's permissions.",
    source: {
      label: "The Hacker News — zero-click AI vulnerability",
      url: "https://thehackernews.com/2025/06/zero-click-ai-vulnerability-exposes.html",
    },
    covers: ["indirect_injection", "promptleak", "piispill"],
  },
  {
    id: "forcedleak",
    name: "ForcedLeak",
    target: "Salesforce Agentforce (Web-to-Lead)",
    when: "September 2025",
    severity: "CVSS 9.4 — critical",
    severityTone: "critical",
    what:
      "Noma Security chained an indirect prompt injection in a Web-to-Lead submission with a CSP bypass and an expired allow-listed domain they re-registered for $5, and walked CRM data out. Salesforce patched it and began enforcing trusted-URL allow lists in September 2025.",
    why:
      "The injection arrived through a form any stranger on the internet can submit. Untrusted external content and trusted internal instructions met in the same context window, which is a trust-boundary problem no WAF or CSP alone resolves.",
    source: {
      label: "Noma Security — ForcedLeak",
      url: "https://noma.security/blog/forcedleak-agent-risks-exposed-in-salesforce-agentforce/",
    },
    covers: ["crosscustomer", "indirect_injection", "credleak"],
  },
  {
    id: "excessive-agency",
    name: "Excessive agency & prompt leakage",
    target: "Any tool-using agent (OWASP LLM Top 10)",
    when: "2025 list",
    severity: "LLM01 / LLM06 / LLM07",
    severityTone: "high",
    what:
      "OWASP's Top 10 for LLM applications names prompt injection (LLM01), excessive agency (LLM06) and system prompt leakage (LLM07) as distinct, first-class risks — an agent doing more than it was scoped to, and an agent revealing the instructions that scope it.",
    why:
      "These are the categories an enterprise security review will ask you about by name. Being able to answer with a per-category pass or fail, rather than a policy document, is the difference between a signed deal and a stalled one.",
    source: {
      label: "OWASP — Top 10 for LLM Applications",
      url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
    },
    covers: [
      "unauthorized_action",
      "privilege_escalation",
      "scope_creep",
      "promptleak",
    ],
  },
];
