# MASTER PROMPT — Warrant: bring build up to full spec

### (Receipts &amp; Freshness Ledger · PR Gate · Repeat ×N)

**Gap being closed:** your current repo matches `1790402445517_PROJECT_GUIDE.md` (the leaner build —
no Receipts tab, no ledger, no PR Gate, no Repeat ×N). The target is
`PROJECT_GUIDE__1_.md` (the fuller spec). Everything below is scoped from a line-by-line diff of the two.

**Orchestrator:** Orca, managing 5 agent sessions in isolated worktrees:


| #   | Tool        | Model                                                                               | Role                                                                       |
| --- | ----------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | CommandCode | **GPT-5.6 Sol**                                                                     | LEADER — Receipts &amp; Freshness Ledger + final Dashboard.tsx integration |
| 2   | CommandCode | **Qwen 3.8 Max** (fall back to 27B only if Max isn't on your plan — check `/model`) | PR Gate (GitHub App)                                                       |
| 3   | CommandCode | **GLM-5.2**                                                                         | Repeat ×N + suite tally                                                    |
| 4   | OpenCode    | **Muse spark 1.3 (free)**                                                           | Docs/copy parity pass                                                      |
| 5   | OpenCode    | **Space Bunny (free)**                                                              | QA / integration test pass (runs last)                                     |


> **On model choice (benchmark-backed, revised):** GPT-5.6 Sol currently posts the highest
> Terminal-Bench 2.1 score among the named options and is the most consistent frontier all-rounder,
> which is why it leads the correctness-critical crypto-signing + integration work. Qwen 3.8 **Max**
> posts the best SWE-bench Pro score of the group (67.7) and the best OSWorld-Verified score, which
> fits the diff-heavy, multi-file PR Gate task — but the smaller "27B" variant is meaningfully
> weaker (SWE-bench Pro 61.7, Terminal-Bench 2.1 73.0), roughly on par with GLM-5.2, so confirm
> which one your CommandCode plan actually gives you before committing it to this role. GLM-5.2 is
> a solid, consistently-benchmarked mid/frontier model (SWE-bench Pro 62.1) — used here for Repeat
> ×N over DeepSeek V4 Flash because DeepSeek V4 Flash's coding benchmarks are still genuinely mixed
> across aggregators (some show it near DeepSeek V4 Pro, others show Pro pulling ahead on harder
> multi-file work), and this task's tally logic feeds directly into later confidence-bound claims,
> so a more settled track record was preferred. Tencent Hy3 has no published benchmark data I could
> find — treat it as an unverified wildcard, good for a free bonus reviewer pass, not first-choice
> for critical-path work. All of this is vendor-reported/early-independent data for very recent
> models and could shift — if a model has worked better for you on this repo before, swap it in.

---

## STEP 0 — Roll call (send this to every open agent FIRST, before any task)

I can't see your local Orca/CommandCode/OpenCode sessions directly, so use this as your head-count
and sanity-check instead of guessing:

```
ROLL CALL — reply with exactly these 4 lines and nothing else:
1. Tool: (CommandCode / OpenCode)
2. Model: (exact name+version currently active)
3. Worktree/branch: (current git branch or worktree path)
4. Status: READY
```

Paste this into every tab. Count the replies — that's your live agent count. Any tab that doesn't
answer within a minute or two is either idle or on the wrong model; fix that before assigning real work.

---

## Ground rules — paste this block into EVERY agent, right after roll call

```
COORDINATION RULES (apply to this whole task):
- You own exactly one feature, in your own git worktree/branch. Do not touch files outside your
  assigned list below except to ADD new files.
- Do NOT edit app/Dashboard.tsx, app/CrashRunner.tsx, or app/SuiteReport.tsx directly unless your
  task explicitly says to — those are shared files. Instead, build your feature as new,
  self-contained files and expose a clean TypeScript interface (exported types + function
  signatures) at the top of your main new file, in a comment block labeled "// INTERFACE FOR
  INTEGRATION". The leader agent wires shared-file edits in at the end.
- Commit messages: `feat(<area>): <what>` e.g. `feat(receipts): add lib/receipt.ts fingerprinting`.
- End every turn with a status block:
  STATUS: <files changed> | <interface exposed, if any> | <blocked on, if anything> | <done? y/n>
- Never invent an API contract for another agent's feature — if you need something from another
  agent's file that doesn't exist yet, stub it with a TODO and the exact shape you expect, and flag
  it in your STATUS line as "blocked on".
```

---

## AGENT 1 (LEADER) — CommandCode — GPT-5.6 Sol

### Feature: Receipts &amp; Freshness Ledger + final integration

```
TASK: Build the Receipts & Freshness Ledger feature for the Warrant app, per spec below, then
integrate the shared-file changes for this feature AND for whatever Agent 3 (Repeat ×N) exposes.

Build these new files:
1. lib/receipt.ts
   - buildReceipt(report: SafetyReport | SingleScorecard, agentIdentity): signed receipt JSON.
   - fingerprint = sha256(agent name + system prompt + scenario-set ids + attack_library_version).
     It must change the moment the agent or trap set changes.
   - Sign with Ed25519. Use RECEIPT_SIGNING_SEED env var if present; otherwise generate a keypair
     at server boot and print it once to server logs (say so honestly in a `key_note` field:
     "demo key, not KMS" — same honesty convention as the mock-provider warning already in lib/llm.ts).
   - Receipt shape includes, per control: {trials, violations, upper_bound_95,
     attack_library_version, bound_scope} — always shown together, never a bare percentage — plus a
     not_covered[] list and a claim line that always reads "Evidence toward…", never "certified" or
     "secure".
   - A single crash-test scorecard (not a full suite) is still receiptable — label it honestly
     with trials:1, don't invent a percentage from one run.

2. lib/ledgerStore.ts
   - Append-only pointer table, one row per agent identity: {identity, fingerprint, issued_at}.
   - Backed by Upstash Redis REST if LEDGER_KV_URL is set; otherwise falls back to a local
     .warrant/ledger.jsonl file (fine for single-instance demo).
   - This is the ONE exception to "no database" in this app — the rest stays client/session state.
   - On every new receipt: look up the previous row for that identity, copy it into
     previous_fingerprint/supersedes on the new receipt, then overwrite the row with the new
     fingerprint. This is what flips an already-issued QR to SUPERSEDED without regenerating it.

3. app/Receipts.tsx (new tab)
   - Receipt card: agent identity + fingerprint (sha256:…), the controls it covers (shown per
     the {trials, violations, upper_bound_95, ...} shape above), not_covered[] list, claim line.
   - QR code generated client-side, encoding a public verify link with the receipt itself in the
     URL (the QR *is* the payload, not a lookup key).
   - Freshness badge: CURRENT (green) or "SUPERSEDED by <newFingerprint>" (grey, struck through).
   - List of every receipt issued this session, newest first, each re-checkable via the same
     verify-page flow a stranger's phone would use.

4. app/verify/[fingerprint]/page.tsx (new, PUBLIC route)
   - Outside the sign-in gate AND outside the Dashboard shell entirely — no auth check.
   - Reads the receipt straight out of the URL.
   - Re-verifies the Ed25519 signature CLIENT-SIDE against the app's published public key.
   - Optionally calls GET /api/ledger/[identity] to check freshness; if that call fails, show
     "signature valid, freshness unknown" — never fail closed just because the ledger is down.

5. app/api/receipt/route.ts — POST, runtime=nodejs, no streaming, maxDuration=30.
   Takes a finished report + agent identity, calls buildReceipt(), updates the ledger row via
   lib/ledgerStore.ts, returns the signed JSON. No GET-by-id endpoint — verifying must never
   depend on this server still being up.

6. app/api/ledger/[identity]/route.ts — GET, PUBLIC, unauthenticated. Returns latest
   fingerprint + issued_at only.

Env vars to add to .env.example / README:
- RECEIPT_SIGNING_SEED (optional Ed25519 seed; without it, signing identity rotates on redeploy)
- LEDGER_KV_URL (optional Upstash Redis REST URL; without it, local .warrant/ledger.jsonl)

--- INTEGRATION PASS (do this part LAST, after your own files above are done) ---
Wait for Agent 3's STATUS line confirming lib/suite.ts now tallies {trials, violations} per
dimension across repeats (Repeat ×N feature) — you need that shape to fill in trials/violations
honestly instead of stubbing them.

Then, and only then, edit the shared files yourself:
- app/Dashboard.tsx:
  - Left rail nav: add "Receipts" as a 9th item (between Full report and Scenarios), matching:
    Overview · Threat model · New crash test · Voice red-team · Full report · Receipts · Scenarios
    · Connect agent · Settings
  - Add a "Receipts issued" metric tile: count of signed receipts this session, with a ⚠
    sub-label if any are SUPERSEDED.
  - Add `ledger` to cross-tab state: every signed receipt issued this session, mirrored from the
    server-side ledger row for its agent identity, so Receipts.tsx can flag SUPERSEDED without
    re-fetching.
  - If a receipt just flipped to SUPERSEDED because of a newer run, the Overview alerts bell
    should pick it up too.
- app/SuiteReport.tsx: add a "🧾 Get signed receipt" button on the grade card → opens the
  Receipts tab with this run's receipt pre-built, QR ready.
- app/CrashRunner.tsx: same "get signed receipt" affordance on a single scorecard.

Do not change anything else in these three files. Expose your own new files' interfaces clearly
so Agent 2 (PR Gate) can import buildReceipt() and the ledger row shape without guessing.
```

---

## AGENT 2 — CommandCode — Qwen 3.8 Max (fallback: 27B)

### Feature: PR Gate (GitHub App)

```
FIRST: run /model and confirm whether you're on Qwen 3.8 Max or the smaller 27B variant — say
which one in your STATUS line. Max is meaningfully stronger on this repo's kind of multi-file
diffing work; if you're on 27B, flag it so the leader knows to double-check your output more
closely during integration.

TASK: Build the PR Gate integration — the "push" integration that runs itself on every PR,
per spec below. This depends on Agent 1's lib/receipt.ts (for fingerprinting) — until Agent 1's
STATUS line confirms that file exists and shows its exported interface, build against a typed
stub you define yourself (comment it "// TEMP STUB, replace once lib/receipt.ts lands") so you're
not blocked.

Build:
1. lib/prGate.ts
   - Diffs the agent's declared contract (tool list + system prompt, or a checked-in warrant.yaml)
     between a PR's base and head → produces new_capabilities: string[] (e.g. detecting that
     `payment.write` just got added).
   - Small capability → scenario map: which of the 31 traps in lib/scenarios.ts actually exercise
     each capability, so the gate runs only the AFFECTED EDGES, not the full battery on every PR.
   - Runs those scenarios through the same runSuite() used by the Full report tab, repeated ×20
     by default (so the confidence bound means something).
   - Folds the result into a receipt fingerprinted to the PR's head SHA, using Agent 1's
     lib/receipt.ts — do not build a second signing path.
   - When a fix lands and the gate re-runs, marks the *previous* fingerprint's receipt SUPERSEDED
     through the same Freshness Ledger (lib/ledgerStore.ts) — so the PR's history shows the exact
     moment a real, replayable fix superseded a real, replayable finding.

2. app/api/pr-check/route.ts — POST, runtime=nodejs, maxDuration=300.
   Receives a GitHub webhook (pull_request: opened/synchronize) OR a manual `warrant check` CLI
   call from a GitHub Action. Verify requests via GITHUB_WEBHOOK_SECRET.
   - Posts (or updates in place, NEVER duplicates) a PR comment in this exact format:
     ```
     Warrant | fingerprint 9f2c…e1 | change-triggered run
     New capability not in contract: payment.write (irreversible)
     Edges affected: 4 of 43. Trials: 20. Time: 1m 40s.

     CONFIRMED confirmed_writes (D003)
     payment.write executed without the required confirmation step.
     Repro: warrant replay --case confirm/0031 --k 20
     Freshness: STALE for D003 until this passes.
     ```
   - Sets commit status via the GitHub Checks API: `failure` while any affected control is
     CONFIRMED, `success` once replay passes clean. This status is the actual thing that blocks
     a merge, not the star rating alone.

3. Connect tab UI (Dashboard.tsx "Connect" section) — DO NOT touch Dashboard.tsx directly.
   Instead build the PR Gate card's JSX as a standalone component file (e.g.
   app/ConnectPRGateCard.tsx) that Agent 1 (leader) will drop in, containing:
   - The three integration cards, ordered by how much each runs without the user asking:
     (a) Claude Code / Cursor (MCP) card — snippet: `claude mcp add warrant --url
         https://warrant.app/mcp`, then `> warrant this agent for coercion and data leaks`.
     (b) CI/CD (SDK) card — Python snippet: `Warrant().run(...)` + `assert result.stars >= 4`.
     (c) PR Gate (GitHub App) card — this is the one that's actually wired up. A connected repo
         shows its real last run; an unconnected account sees the sample above, clearly labeled
         "sample". The check flips red→green in place on the same PR once a fix lands.
   Leave a one-line note in your STATUS block telling Agent 1 exactly which file to import and
   where it slots into Dashboard.tsx's Connect tab.

Env vars to add: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET.
```

---

## AGENT 3 — CommandCode — GLM-5.2

### Feature: Repeat ×N + suite tally

```
TASK: Add the "Repeat each scenario ×N" feature. This is the smallest, most self-contained
feature of the three — no cross-agent dependency, do this one first and report done quickly so
Agent 1 can build on it. Even though the surface area is small, get the counting logic exactly
right: {trials, violations} per dimension feeds directly into Agent 1's receipt confidence-bound
claims later, so precision here matters more than the file count suggests.

1. app/SuiteReport.tsx
   - Add a "Repeat each scenario ×N" selector: options 1 / 5 / 20, default 1. Optional — it only
     matters if the person wants the eventual receipt's confidence bound to mean more than
     "it happened once."

2. lib/suite.ts
   - runSuite() must re-run each SELECTED scenario N times (still fully client-driven, still no
     DB) and tally {trials, violations} per judge dimension across the repeats.
   - This {trials, violations} pair is the ONLY thing a receipt (Agent 1's feature) is allowed to
     put a confidence bound on. At N=1, be honest: report trials:1, never invent a percentage
     from a single run.

Expose the exact TypeScript shape of your tally object at the top of lib/suite.ts under
"// INTERFACE FOR INTEGRATION" — Agent 1 needs this to fill receipts honestly. Report DONE with
that interface as soon as this lands; don't wait for the other agents.
```

---

## AGENT 4 — OpenCode — Muse 1.3 (free)

### Feature: Docs &amp; copy parity pass

```
TASK: This is a documentation/copy job, not a logic job — low risk, can start immediately and run
in parallel with everyone else, but your FINAL pass must happen after Agents 1–3 report DONE.

Your source of truth for exact wording is PROJECT_GUIDE__1_.md (the fuller target spec) — it
already contains the exact hero copy, section text, and tables you need. Your job is to make the
repo's own README / project guide doc match it exactly once the code lands:

- Restore the fuller hero blurb (the "testing layer that runs itself... Claude judge... signed,
  portable receipt... inspection sticker that expires when the car changes" version) instead of
  the shortened one.
- Restore "Two independent truths... plus a third that makes it portable" (Canaries / Judge /
  Receipt), not just two.
- Nav line: 9 items, not 8 (include Receipts, in position after Full report).
- Metrics table: re-add the "Receipts issued" row.
- Cross-tab state list: re-add the `ledger` bullet.
- Section numbering: once Receipts (§8) and the fuller Connect agent section (§10) are back, every
  section after must renumber up by one or two, matching PROJECT_GUIDE__1_.md's §8–§15 exactly.
- File map table: re-add rows for app/Receipts.tsx, app/verify/[fingerprint]/page.tsx,
  lib/receipt.ts, lib/ledgerStore.ts, lib/prGate.ts.
- API surface table: re-add /api/receipt, /api/ledger/[identity], /api/pr-check (nine endpoints
  total, not six).
- Env & configuration table: re-add RECEIPT_SIGNING_SEED, LEDGER_KV_URL, GITHUB_APP_ID,
  GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, with their caveats.
- Closing one-line summary: restore the fuller version (receipts flipping to SUPERSEDED, PR Gate
  paragraph, "inspection sticker that checks itself").

Do a first draft pass now against the target file; do a final verification pass once Agents 1–3
are DONE, diffing your draft against what actually got built (not just what was planned).
```

---

## AGENT 5 — OpenCode — Space Bunny (free)

### Feature: QA / integration pass — runs LAST

```
TASK: Wait until Agents 1, 2, and 3 all report DONE and merged. Then, in a fresh worktree off the
merged branch, verify:

1. Left rail has exactly 9 nav items in the right order; Receipts tab opens and renders.
2. Metric tiles show "Receipts issued" with correct count and ⚠ sub-label logic.
3. /api/crash and /api/suite NDJSON streaming still works unchanged (no regression from the new
   routes/files).
4. /api/receipt returns a signed JSON and updates the ledger row; a second call for the same
   agent identity correctly marks the first receipt SUPERSEDED.
5. /api/ledger/[identity] is reachable with NO auth and returns {fingerprint, issued_at}.
6. app/verify/[fingerprint]/page.tsx loads with no sign-in, verifies signature client-side, and
   degrades to "signature valid, freshness unknown" if the ledger call is made to fail.
7. Repeat ×N actually changes trials/violations counts in the full report; at N=1 it shows
   trials:1 rather than a fabricated percentage.
8. /api/pr-check responds correctly to a simulated webhook payload; commit status logic matches
   CONFIRMED→failure / clean→success.
9. Env-var fallbacks work: no LEDGER_KV_URL → local .warrant/ledger.jsonl gets created; no
   RECEIPT_SIGNING_SEED → a fresh keypair is generated and logged once, with a clear warning.
10. No existing tab (Overview, Threat model, Voice red-team, Scenarios, Settings) regressed.

Write/patch tests where missing rather than only clicking through manually. File a STATUS report
listing every check above as PASS/FAIL with a one-line reason for any FAIL, plus which agent's
work it traces back to.
```

---

## Merge order

1. Agent 3 (Repeat ×N) — smallest, no dependencies, merge first.
2. Agent 1 (Receipts &amp; Ledger) — depends on Agent 3's tally shape for honest receipts.
3. Agent 2 (PR Gate) — depends on Agent 1's receipt/ledger.
4. Agent 1 does the Dashboard.tsx / SuiteReport.tsx / CrashRunner.tsx integration pass.
5. Agent 4 (docs) does its final sync pass.
6. Agent 5 (QA) runs last, against the fully merged branch.

## Definition of done

- All 9 API routes present and matching the method/stream/maxDuration table in
PROJECT\_GUIDE\_\_1\_.md §13.
- All new files in §15's file map exist with the stated role.
- QA agent's report shows all checks PASS.
- Docs agent's final diff against PROJECT\_GUIDE\_\_1\_.md is clean.

