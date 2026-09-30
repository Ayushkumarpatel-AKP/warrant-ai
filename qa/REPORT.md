# QA / integration pass — STATUS report (final)

**Agent 5 (QA).** Target: `C:\Users\Ayush\Downloads\crashtest-AI-main\crashtest-AI-main`
Spec: `master_prompt (2).md` lines 296–317 (the ten checks at lines 298–313).
Date: 2026‑09‑26. Node v22.14.0, Next.js 14.2.5, TypeScript 5.9.

**Verdict: 10 PASS, 0 FAIL, 3 UNVERIFIABLE sub-items (all third‑party‑credential or
network‑flakiness scoped, none a product defect).**

The previous pass's single blocking failure — **check 6, client‑side signature
verification** — is now **fixed and independently re‑verified through the real HTTP
path**. `app/verify/[fingerprint]` now renders a verified signature and no longer
hides the freshness banner.

This run: **HTTP 26/26, unit 46/46, both exit 0**, on a production `next build` +
`next start`.

---

## How to reproduce

```sh
# deterministic server (offline, no LLM quota) — the configuration every
# verdict below was decided on
set PORT=3121 && set LLM_PROVIDER=mock && set GITHUB_WEBHOOK_SECRET=qa-webhook-secret
npm run build && npm start

set QA_WEBHOOK_SECRET=qa-webhook-secret && set QA_OUT=qa-artifacts/final
npm run qa:http  -- http://localhost:3121      # 26/26 pass -> qa-artifacts/final-http.log
set QA_OUT=qa-artifacts/unit
npm run qa:unit  -- http://localhost:3121      # 46/46 pass -> qa-artifacts/final-unit.log
```

### Toolchain gate (re‑verified after the eslint install)

| Command | Result |
|---|---|
| `npm run lint` | **PASS** exit 0 — **0 errors**, 3 pre‑existing warnings (`app/Receipts.tsx:42` exhaustive‑deps, `app/Receipts.tsx:152` + `app/ui.tsx:62` `@next/next/no-img-element`). No interactive ESLint prompt; `.eslintrc.json` → `next/core-web-vitals` is picked up. **This is an improvement over the previous pass, where lint was not runnable.** |
| `npx tsc --noEmit` | **PASS** exit 0, zero diagnostics. |
| `npm run build` | **PASS** exit 0 — `✓ Compiled successfully`, `✓ Generating static pages (12/12)`, 12 routes, lint + typecheck run inside the build. Log: `qa-artifacts/build.log`. |
| `npm run qa:http` / `npm run qa:unit` | **PASS** exit 0 — both scripts still work after `eslint`/`eslint-config-next` were added as devDependencies. |

---

## The ten checks

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 | 9 nav items in order; Receipts tab opens and renders | **PASS** | `C1`, `C1b`, `C10-receipts`, `C10-receipts2` |
| 2 | "Receipts issued" tile: correct count and ⚠ sub‑label logic | **PASS** | `C2a`–`C2d` |
| 3 | `/api/crash` + `/api/suite` NDJSON streaming unregressed | **PASS** | `C3a`, `C3b` (production server, mock provider) |
| 4 | `/api/receipt` signed JSON, ledger advance, supersession on 2nd call | **PASS** | `C4a`–`C4f`, `C4j`, `C4k`, `C4h`, `C4i` |
| 5 | `/api/ledger/[identity]` reachable with **no auth**, returns `{fingerprint, issued_at}` | **PASS** | `C4b`, `C4d`, `C6c`, `C6g` |
| 6 | `/verify/[fingerprint]` loads with no sign‑in, verifies client‑side, degrades | **PASS** | `C6a`, `C6b`, `C6c`–`C6i`, `C6g-ui`, `C6h-ui`, `C4g` |
| 7 | Repeat ×N changes trials/violations; honest `trials:1` at N=1 | **PASS** | `C7a`, `C7a2`, `C7b`, `C7c`–`C7f` |
| 8 | `/api/pr-check` simulated webhook; CONFIRMED→failure / clean→success | **PASS** | `C8a`–`C8p` |
| 9 | Env‑var fallbacks (no `LEDGER_KV_URL` → local `.warrant/ledger.jsonl`) | **PASS** | `C9a`–`C9g` |
| 10 | No existing tab regressed | **PASS** | `C10-*` (9 components SSR‑rendered) |
| — | Live‑LLM `/api/crash` judge round‑trip | **UNVERIFIABLE** | Upstream gateway returned a transport error; coordinator elected to defer live testing. |
| — | Live‑LLM `repeat=3` suite (6 trials) | **UNVERIFIABLE** | Same upstream flakiness; deferred by explicit instruction. |
| — | Live GitHub side effects (comment post, check‑run post, Checks API) | **UNVERIFIABLE** | No `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / installation token available. |

---

## Check 6 — the previously failing check, now PASS

This is the check the coordinator asked me to re‑verify. It passes on all four
clauses of the spec.

### 6a/6b — loads with no sign‑in
```
C6a PASS  /verify/[fingerprint] serves a page with no sign-in gate
          :: HTTP 200 bytes=9750 no-auth redirect=true signin-wording=false
C6b PASS  /verify without ?receipt still serves the shell
          :: HTTP 200
C6f PASS  the public verify URL built by app/Receipts.tsx loads 200 with no
          sign-in and ships the client bundle
          :: HTTP 200 bytes=9981 scripts=8 no-auth (no redirect, no sign-in wording)
```

### 6c — verifies the signature **client‑side**, over real HTTP bytes
`C6g` is the decisive check. It takes the exact URL `app/Receipts.tsx:106` builds,
fetches it over the wire, then re‑reads the payload out of `location.search` and
runs **the page's own code path** (`decodeReceipt` → the `page.tsx:33` fingerprint
cross‑check → `verifyReceiptSignature`), and evaluates the `page.tsx:38‑48` freshness
state machine against the live ledger endpoint:

```
PASS C6g  the verify page's own client pipeline over real HTTP bytes yields
          signatureValid=true, so it renders SIGNATURE VALID and SHOWS the
          freshness banner
 :: GET http://localhost:3121/verify/<fp>?receipt=<1127 chars> -> HTTP 200
    (9750 bytes, no auth redirect). page.tsx:26-37 pipeline on those exact bytes:
    decodeReceipt ok, :33 fingerprint match=true,
    :37 verifyReceiptSignature=true (public_key 44B SPKI).
    :38-48 freshness="current" (ledger=dc88840076f6… receipt=dc88840076f6…).
    :73 therefore renders "SIGNATURE VALID" and :76 no longer hides <FreshnessBadge>
    [wired=true pillTruthy=true bannerGated=true bannerVisible=true]
```

The receipt used is the one the running server actually issued
(`qa-artifacts/final-receipt-1.json`), not a locally built fixture:

```
public_key b64 len = 60      decoded bytes = 44      (Ed25519 SPKI DER)
DER header         = 30-2a-30-05-06-03-2b-65-70-03-21-00  (SEQUENCE, OID 1.3.101.112)
signature bytes    = 64       key_note = "demo key, not KMS"
```

Because the receipt that flows to the browser is 44‑byte SPKI DER — the exact shape
that used to throw `DataError` — a `true` here is direct regression evidence that the
format‑selection fix works on the wire and not just in isolation.

### 6d — the freshness banner is no longer hidden
This was the second half of the original bug: `app/verify/[fingerprint]/page.tsx:76`
gates `<FreshnessBadge>` behind `signatureValid`, so a permanently‑`false`
verification suppressed the CURRENT / SUPERSEDED verdict as well. The gate is now
asserted from the page source and its inputs are all real:

```
PASS C6g-ui the verify page turns a true verification into SIGNATURE VALID and
            un-hides the freshness banner
 :: page.tsx:37 wires verifyReceiptSignature(decoded).then(setSignatureValid)=true
    :73 renders "SIGNATURE VALID" iff truthy=true
    :76 gates <FreshnessBadge> on signatureValid=true
    :107 degrade copy present=true
    :33 rejects a mismatched URL fingerprint=true
    Running that exact pipeline on an encoded receipt: decodeReceipt ok,
    fingerprint match=true, verifyReceiptSignature=true => the page renders the
    pass pill and the banner is NOT hidden.
```

### 6e — degrades to "signature valid, freshness unknown"
```
PASS C6i  when the ledger call fails the page keeps the verified signature and
          degrades to 'Signature valid, freshness unknown.'
 :: a locally signed receipt for qa-verify-orphan-1790414461075 (never posted, so
    the ledger 404s): verifyReceiptSignature=true, freshness state="unknown"
    => page.tsx:48 {state:"unknown"} => page.tsx:107 renders the degrade copy.
    Because true is true, the :76 gate is open, so the degrade banner is actually visible.
PASS C6e  freshness degrades ... (unit suite, same route)
 :: orphan receipt qa-orphan-never-posted is signed; GET /api/ledger/... -> HTTP 404
    => page.tsx:40 throws, :48 sets {state:"unknown"}
```

Note the second clause of that check: pre‑fix the degrade banner was *unreachable*
too (the `:76` gate was closed). It is now reachable.

### The pass state is earned, not unconditional
Two tamper controls, so a green page cannot be an artefact of a verifier that always
says true:

```
PASS C4h  tampering with a signed field makes verification return FALSE
          :: verify(identity rewritten) = false
PASS C4i  tampering with the control tally (violations 1 -> 0) => verify=false
PASS C6h  tampering with the payload the page decodes flips it to SIGNATURE
          INVALID and re-hides the banner
 :: rewriting issued_at on the page's decoded payload:
    verifyReceiptSignature=false (untampered=true) => page.tsx:73 renders
    "SIGNATURE INVALID" and page.tsx:76 suppresses the freshness banner
PASS C6h-ui a tampered payload still yields false, so the pass pill and the banner
            are earned, not unconditional
```

### The underlying crypto, at unit level
```
PASS C4g  client-side Ed25519 verifyReceiptSignature() returns TRUE for a real
          signed receipt
 :: returned true; key_note=demo key, not KMS; public_key=MCowBQYDK2VwAyEA… is 44
    bytes (SPKI DER, published by lib/receipt.ts:70/84). lib/receiptShared.ts:76-85
    picks the import format from the key length (44B => "spki" first, 32B => "raw"
    first) and loops candidates, so both encodings verify.
PASS C4g-diag importKey("raw", spkiDer[44B]) => threw DataError: Ed25519 raw keys
            must be exactly 32-bytes; importKey("raw", spkiDer.subarray(-32))
            => verify=true
PASS C4j  encodeReceipt -> decodeReceipt round-trips canonically identical
PASS C4k  canonicalJson is key-order independent
```

`C4g` was the exact check the previous pass reported as **FAIL**. It now returns
`true`, and the `C4g-diag` control still demonstrates the original root cause in
isolation, so the fix is confirmed rather than papered over.

---

## The other nine checks — evidence

### Check 1 — nav (`C1`, `C1b`, `C10-receipts`, `C10-receipts2`)
```
C1 PASS left rail has exactly 9 nav items in the spec order, Receipts 6th
     (after Full report) :: found 9: [Overview | Threat model | New crash test |
     Voice red-team | Full report | Receipts | Scenarios | Connect agent | Settings]
C1b PASS rail-item buttons=9
C10-receipts2 PASS Receipts renders a CURRENT pill and a SUPERSEDED pill for the
     stale twin :: CURRENT=true SUPERSEDED-by=true bytes=3378
```
Labels are scraped from the server‑rendered `<nav class="rail-nav">` of the real
`app/Dashboard.tsx`, in DOM order, compared element‑by‑element with the spec order.

### Check 2 — metric tiles (`C2a`–`C2d`)
```
C2a PASS metric tile 'Receipts issued' renders with count and the non-warn
     sub-label :: label present=true; empty-ledger value="–"=true;
     sub="signed this session"=true
C2b PASS the other four metric tiles are unregressed :: Agents tested=true
     Failed safety=true Avg rating=true Traps available=true
C2c PASS '⚠ N superseded' logic: 0 when empty, 1 for one stale twin, unchanged
     for a second identity :: predicate present in app/Dashboard.tsx=true;
     empty=0 oneStale=1 twoIdentities=1
C2d PASS tile value is ledger.length (0 receipts renders as the en-dash placeholder)
     :: app/Dashboard.tsx:202-206 uses value={ledger.length || "–"}
```
Honest scope note (unchanged from the previous pass): the tile's value and its ⚠
branch are driven by React state, and **this project still has no DOM test harness**
(jsdom, happy‑dom, react‑test‑renderer, @testing‑library, Playwright and Puppeteer
all re‑verified absent in `node_modules`). So presence, the en‑dash placeholder and
the non‑warn sub‑label are proven by a real SSR render, and the ⚠ branch is proven
two ways: the real supersession chain exists end to end over HTTP (`C4c`), and the
exact predicate from `app/Dashboard.tsx:119‑127` is asserted present in source and
evaluated over synthetic ledgers. **No browser was driven.**

### Check 3 — NDJSON streaming unregressed (`C3a`, `C3b`)
Production server, mock provider:
```
C3a PASS /api/crash NDJSON stream :: 6 NDJSON events, 2175 bytes,
      ct=application/x-ndjson; charset=utf-8;
      kinds=[scenario,agent,judging,verdict]
C3b PASS /api/suite NDJSON stream (repeat=1) :: 11 NDJSON events, 9804 bytes,
      ct=application/x-ndjson; charset=utf-8; scenario_start=2 scenario_done=2
      report=true totalTrials=1/1
```
The reader parses line‑by‑line and fails on any non‑JSON line, a wrong
`Content-Type`, a last record not terminated with `\n`, or a zero‑event stream. Raw
bytes archived: `qa-artifacts/final-crash.ndjson`.

Live‑LLM partial confirmation before I stopped (coordinator's instruction):
`/api/suite` streamed 12 events, 21 449 bytes, `scenario_start=2 scenario_done=2
report=true` — `C3b` PASS live too. Live `/api/crash` returned
`kinds=[scenario,agent,judging,error] ERROR: Judge did not return a verdict`, i.e. an
upstream gateway transport error, not a streaming‑format regression. Marked
UNVERIFIABLE above.

### Check 4 — receipt signing, ledger advance, supersession (`C4a`–`C4k`)
```
C4a PASS HTTP 200 cache-control=no-store version=warrant.receipt.v1
     sig=PG9tGbwhzERa… pub=MCowBQYDK2Vw… fp=sha256:dc88840076f64…
     controls=COERCION/DATA_LEAK
C4b PASS /api/receipt advances the ledger row :: HTTP 200
     {"fingerprint":"sha256:dc88840076f64230…","issued_at":"2026-09-26T09:21:00.757Z"}
C4c PASS second /api/receipt for same identity marks the first SUPERSEDED
     :: fp1=dc88840076f6… fp2=0f6a823726b3… supersedes=dc88840076f6…
        previous_fingerprint=dc88840076f6…
C4d PASS ledger pointer advanced to the superseding receipt
     :: ledger fp=0f6a823726b3… expected 0f6a823726b3…
C4f PASS /api/receipt rejects a missing report (400)
     :: HTTP 400 {"error":"report and agentIdentity are required"}
```

**Observation, not a spec failure (`C4e-obs`), carried forward for Agent 1.** The
fingerprint is derived only from `identity + systemPrompt + scenarioIds +
attack_library_version + head_sha` (`lib/receipt.ts:59‑69`) — deliberately not from
the supersession chain. So re‑posting a previously seen configuration re‑issues it
with the *same* fingerprint but a different `supersedes`, and the ledger pointer
moves back:
```
C4e-obs PASS fingerprint is stable for identical evidence (dc88840076f6… ==
          dc88840076f6…) so two DISTINCT signed receipts share one fingerprint;
          supersedes=0f6a823726b3… and the ledger pointer moved back to dc88840076f6…
```
The ledger keeps telling the truth (pointer == newest issuance) and `/verify` answers
correctly, so I am not calling it a bug — but "the fingerprint identifies the
evidence" is the product's core claim, and a one‑line change to include
`previous_fingerprint` in the digest would make it true. **Owner: Agent 1.**

### Check 5 — public ledger, no auth
```
GET /api/ledger/<identity>   (no cookie, no Authorization, no session)
C4b PASS HTTP 200 {"fingerprint":"sha256:dc88840076f6…","issued_at":"2026-09-26T09:21:00.757Z"}
GET /api/ledger/nobody-here  -> HTTP 404 {"error":"No receipt for this identity"}
C6c PASS freshness 'current': ledger fingerprint == receipt fingerprint
```
`app/api/ledger/[identity]/route.ts` declares no auth and returns exactly
`{fingerprint, issued_at}` plus `Cache-Control: no-store`.

### Check 7 — Repeat ×N (`C7a`, `C7a2`, `C7b`, `C7c`–`C7f`)
```
C7a  PASS repeat=1, 2 scenarios -> report.scenarios.length == 2,
      tally=COERCION:2/2 DATA_LEAK:0/2 DECEPTION:0/2 SABOTAGE:0/2
      INSUBORDINATION:0/2; all trials integer>=1 and violations<=trials=true;
      triggeredRate in [0,1]=true
C7a2 PASS single scenario at N=1 honestly reports trials:1
      :: scenarios=1 repeat=1 tally=COERCION:1/1 DATA_LEAK:0/1 DECEPTION:0/1
      SABOTAGE:0/1 INSUBORDINATION:0/1      <-- literally trials:1, no invented %
C7b  PASS repeat=3, 2 scenarios -> 6 trials, per-dimension trials=[6,6,6,6,6]
      (all %3==0, >1), and tally1 != tally3 => true
C7c  PASS upperBound95(0,1)=0.793451 (Wilson 0.7935) upperBound95(1,1)=1
      upperBound95(0,20)=0.161125 upperBound95(1,20)=0.236131
      upperBound95(2,5)=0.769276
C7d  PASS upperBound95 refuses trials=0 :: threw "trials must be a positive integer"
C7e  PASS COERCION N=1 -> 1/1; N=5 -> 5/5; DATA_LEAK 0/1 ub95=0.793451 (N=1)
      -> 0/5 ub95=0.434482  (the bound tightens as trials grow)
C7f  PASS not_covered has 25/27 dimensions, COERCION excluded, SABOTAGE=true
```
At one observation the receipt publishes `trials: 1` and a real 79.3 % Wilson upper
bound — never a fabricated 0 % or 100 %.

### Check 8 — PR gate (`C8a`–`C8p`)
```
C8a  PASS unsigned POST              -> 401
C8b  PASS correctly signed pull_request webhook -> 501
      "GitHub App is not fully configured (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY,
       installation id)"   <- auth + routing are right; only the App is absent
C8c  PASS wrong HMAC                 -> 401
C8d  PASS X-GitHub-Event: ping       -> 200 {"ok":true,"pong":true}
C8e  PASS CLI dry run, new tool issue_refund -> newCapabilities ["payment.write"],
      edges ["privilege_escalation","scope_creep","unauthorized_action"],
      conclusion "failure", 3 x confirmed_writes:CONFIRMED, commentBody present
C8f  PASS CONFIRMED => conclusion "failure" (confirmedCount=3) and the comment
      says STALE
C8g  PASS clean diff => conclusion "success" (newCapabilities=[], edges=[])
C8h  PASS PR re-run links the previous fingerprint
      (superseded=sha256:64583be4… receipt.supersedes=sha256:64583be4…)
C8i  PASS GET ?repo=acme/qa-gate -> connected=true history=3 last=failure
C8j  PASS GET ?repo=nope -> 400
C8k  PASS GitHub Checks API body, CONFIRMED present:
      {status:completed, conclusion:failure, head_sha:11111111…,
       title:"Warrant gate blocked: 1 confirmed control(s)"}
C8l  PASS GitHub Checks API body, all clean:
      {status:completed, conclusion:success, title:"Warrant gate passed"}
C8m  PASS comment: CONFIRMED => "Freshness: STALE for D001"; clean =>
      "All affected controls passed clean across 20 trials. Freshness: CURRENT."
C8n  PASS comment starts with the invisible <!-- warrant-pr-gate --> marker
C8o  PASS verifyWebhookSignature: correct=true wrong=false garbage=false
C8p  PASS diffContracts + scenariosForDiff: issue_refund -> payment.write ->
      [privilege_escalation, scope_creep, unauthorized_action]
```
`C8k`/`C8l` call the real `createCheckRun()` with `globalThis.fetch` swapped for a
recorder, so the exact JSON body that would be POSTed to
`api.github.com/repos/{owner}/{repo}/check-runs` is captured — the commit‑status
mapping the spec asks about, not a re‑implementation.

**Scope caveat on `C8g` (unchanged):** the clean→success path is reached through a
diff with no new capabilities and no prompt change, which yields zero affected edges
and therefore zero controls. A *non‑degenerate* clean run (affected edges executed,
all PASS) is unreachable here because it needs a judge willing to rate ≥ 3 stars and
the only reachable judge is the deterministic mock, which always rates 2.
`C8k`/`C8l`/`C8m` close that gap by feeding `createCheckRun`/`formatPrComment` a
control set with real affected edges.

### Check 9 — env‑var fallbacks (`C9a`–`C9g`)
All cases run in child processes with a scrubbed environment and a scratch cwd, so
the local‑ledger path is genuinely exercised rather than inherited from the repo's
`.warrant/`.
```
C9a PASS no LEDGER_KV_URL -> .warrant/ledger.jsonl created under the cwd (149 bytes);
     getLatestLedgerRow("child-a") -> {"identity":"child-a","fingerprint":"sha256:4467dc7e…",
     "issued_at":"2026-09-26T09:21:07.789Z"}; first advance returned previous=null
C9b PASS no RECEIPT_SIGNING_SEED -> key_note "demo key, not KMS" and one warning:
     "[warrant] RECEIPT_SIGNING_SEED is unset; generated demo Ed25519 key
      MCowBQYDK2VwAyEALRDrEXKtJQ96kIE6zA5zZJMlulfET1r9NZe5sRdeugo=. It will rotate
      on server restart."   (that child's own signatureValid field printed: true)
C9c PASS two fresh processes -> two different public keys (it really rotates)
C9d PASS 64-hex seed -> key_note "configured Ed25519 seed", identical key across two
     independent processes, no warning
C9e PASS base64 seed accepted; a 2-byte seed dies with
     "Error: RECEIPT_SIGNING_SEED must encode exactly 32 bytes"
C9f PASS LEDGER_KV_URL -> the Upstash REST branch is used; the fake KV server saw
     ["GET warrant:ledger:child-c","SET warrant:ledger:child-c","GET warrant:ledger:child-c"];
     the row round-trips; and the local .warrant/ledger.jsonl is NOT created
C9g PASS the same warning is emitted by `npm run build` at server boot (4 occurrences)
```

### Check 10 — no tab regressed (`C10-*`)
Every tab component server‑rendered from the real module with real props; none throws.

| Component | SSR bytes |
|---|---|
| `Dashboard` (Overview default) | 5988 |
| `ThreatModel` | 12708 |
| `Receipts` (empty) | 262 |
| `ScenarioComposer` (Scenarios) | 878 |
| `ConnectPRGateCard` (Connect agent) | 2432 |
| `CrashRunner` (New crash test) | 3224 |
| `SuiteReport` (Full report) | 5286 |
| `VoiceCall` (Voice red‑team / AI attacker) | 1147 |
| `LiveCall` (Voice red‑team / you on the mic) | 3570 |
| `Receipts` (two receipts, one stale) | 3378 — both `CURRENT` and `SUPERSEDED by` |

The four other metric tiles are all still present in the Overview render (`C2b`).

---

## Environment notes (not product defects)

1. **Host memory was the one real obstacle, and it is resolved.** This box has only
   5.86 GB of physical RAM. On the first attempt Windows commit charge sat at
   23.4/24.4 GB (96 %, eight idle `opencode` worker processes), so `next build` was
   OOM‑killed in `Generating static pages` and `next dev` was OOM‑killed compiling
   `/api/crash`. After the coordinator closed the settled dispatches, commit charge
   dropped to 14.7/18.3 GB and the build completed normally. The one intervention
   that mattered was `NODE_OPTIONS="--max-old-space-size=640 --max-semi-space-size=4"`,
   which keeps each of Next's 4 static workers from ballooning
   (`qa-artifacts/build-nolint.log` is the first, narrower attempt; the canonical
   `qa-artifacts/build.log` is a full `npm run build` with lint inside it, exit 0).
   **Worth knowing for anyone re‑running the gate on this host.**
2. **The upstream LLM gateway is still slow and unreliable from this host**, as in
   the previous pass. Live `/api/suite` streaming passed; live `/api/crash` failed
   with `Judge did not return a verdict` (a transport error from
   `api.atria-asi.ai`, which otherwise answers fine). Live `repeat=3` was not
   attempted. The coordinator elected to defer live testing and run it at the end, so
   the two live items are UNVERIFIABLE rather than FAIL. Every structural assertion
   was therefore decided against a second server started with `LLM_PROVIDER=mock`,
   which is deterministic, offline (~0.2 s/run) and reaches the CONFIRMED→failure
   path because its judge always rates 2 stars.
3. **No test framework exists** in the project and I did not add one. `qa/` uses
   `tsx` (already a devDependency) and hand‑rolled assertions plus `react-dom/server`
   for the UI. Adding jsdom/vitest would be a larger change than this pass warranted
   and would touch dependencies other agents depend on.
4. **No browser was driven.** Checks 1, 2, 6 and 10 are proven by server‑side
   rendering, real HTTP and source‑level gate assertions, not by clicking. The
   interactive‑only residue is called out inline (mainly the ⚠ tile branch). For
   check 6 the mitigation is that every step of the page's client pipeline is
   executed against real bytes and the remaining link — the `signatureValid ?` JSX
   conditional — is asserted directly against the component source.
5. **Live GitHub side effects are UNVERIFIABLE**: no `GITHUB_APP_ID` /
   `GITHUB_APP_PRIVATE_KEY` / installation token, so the comment post, the check‑run
   post and the Checks API response are not exercised. `C8b` proves the request is
   correctly authenticated and routed to the App branch before that point.

## Open items routed back to owners

| Item | Owner | Severity |
|---|---|---|
| Fingerprint is not derived from the supersession chain, so two distinct signed receipts can share one fingerprint (`lib/receipt.ts:59‑69`; observed as `C4e-obs`) | Agent 1 (Receipts & Ledger) | Observation — ledger and `/verify` remain truthful, so not a spec failure. Worth a conscious decision. |
| 3 lint warnings: `app/Receipts.tsx:42` (missing `issue` dep), `app/Receipts.tsx:152` and `app/ui.tsx:62` (`<img>` vs `next/image`) | Agent 1 / project scaffolding | Cosmetic; lint exits 0. |
| Live LLM + live GitHub verification, deferred by the coordinator to a final pass | — | UNVERIFIABLE here, by instruction. |

## Files I changed this pass

- `qa/http.test.ts` — **added** `checkVerifyClientPipeline` with `C6g` (real‑HTTP
  check‑6 pipeline), `C6h` (tamper control) and `C6i` (degrade path); added
  `readFileSync`/`path` imports.
- `qa/unit.test.ts` — **added** `checkVerifyPageGate` with `C6g-ui` / `C6h-ui`
  (server‑free proof of the page's render gate); **reworded** the now‑stale detail
  strings on `C4g`, `C4g-diag` and `C9b` so the run log no longer asserts a bug that
  is fixed. **No assertion was weakened or removed.**
- `qa-artifacts/**` — regenerated logs and captured responses.
- `qa-artifacts/sigcheck.ts` — the coordinator's scratch verification file, **deleted**
  at their request.
- **No file under `app/` or `lib/` was modified.** No commits (this is not a git repo).
