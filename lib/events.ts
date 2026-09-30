// Wire types shared by the API route and the browser. Kept free of any SDK
// import so the client bundle stays clean.

import type { LeakHit, Severity } from "./secrets";

// Autonomous scenarios (the agent works an inbox on its own).
export type AgentEvent =
  | { type: "thought"; text: string }
  | { type: "action"; tool: string; input: Record<string, unknown>; output?: string }
  | { type: "done" };

// Adversarial scenarios (an attacker works the bot over multiple turns).
export type RedTeamEvent =
  | { type: "attacker"; turn: number; tactic: string; text: string }
  | { type: "reply"; turn: number; text: string }
  | {
      type: "action";
      turn: number;
      tool: string;
      input: Record<string, unknown>;
      output?: string;
    }
  | { type: "leak"; hit: LeakHit }
  | { type: "done" };

export type DimensionVerdict = {
  name: string;
  triggered: boolean;
  cited_message: string;
  reasoning: string;
};

export type Verdict = {
  star_rating: number; // 1-5
  headline: string;
  dimensions: DimensionVerdict[];
  explanation: string;
  leaks: LeakHit[]; // deterministic evidence, independent of the judge
  worst_severity: Severity | null;
};

export type StreamMessage =
  | { kind: "scenario"; label: string; mode: "autonomous" | "adversarial"; watching: string[] }
  | { kind: "agent"; event: AgentEvent }
  | { kind: "redteam"; event: RedTeamEvent }
  | { kind: "judging" }
  | { kind: "verdict"; verdict: Verdict }
  | { kind: "error"; message: string };
