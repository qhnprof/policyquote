# AGENT_LOG

**Agent:** Claude Code. **Project instructions:** [`CLAUDE.md`](CLAUDE.md). **Project skill:** [`.claude/skills/add-risk-factor/SKILL.md`](.claude/skills/add-risk-factor/SKILL.md).

Each entry follows: prompt → output → what I accepted, changed or rejected → why → how I verified it.
Steps 04–08 ran in one continuous Claude Code session (no `/clear` between them), so the agent also had the earlier conversation in context. Step 09 (the skill rehearsal) runs in a fresh context (`/clear`), because it tests that the skill works from the files alone.

---

## 00 — Planning (Claude chat, before writing code)
- **Prompt:** "Here is the exercise brief. Review it and tell me how to proceed and succeed", then "give me step-by-step instructions to execute it".
- **Output:** a breakdown of requirements and grading; ambiguities (band multipliers missing from the example KB, meaning of `perOccurrence`, `coverageLoadFactor`); a step plan; first drafts of `CLAUDE.md`, the `add-risk-factor` skill and the backend config (TypeScript pinned to 6.0 because ts-jest doesn't support TypeScript 7).
- **Review (Claude Code, 2026-11-11):** I asked Claude Code to read `CLAUDE.md` and the skill end to end and flag anything it disagreed with. I approved its points and had it apply them, then told it to settle the two open data decisions with stated assumptions.
- **What I changed:**
  - `CLAUDE.md`: the plan-first rule now covers engine, schema and cross-layer changes, not "more than one file"; rule 3 notes that `resolveJsonModule` is off; rule 6 says "no *outbound* network"; the map no longer claims a missing `kb/README.md` exists; added a Context section (built for AIG UK: GBP, auditable quotes, no AIG branding) plus the band shape and pricing formula in the KB reference.
  - `backend/tsconfig.json`: removed `resolveJsonModule`.
  - `add-risk-factor` skill: README fallback; `perOccurrence` only on numeric leaves; tests use the real KB, not fixtures; a removal test case; version-bump rules for every kind of change (patch/minor/major).
  - `kb/risk-kb.json` (**assumptions**): band multipliers 1.0 / 1.5 / 2.0 with customer-facing summaries; `HIGH_RISK` made open-ended (no `max`). Premium = `basePremium × coverageLoadFactor × multiplier`. `version` stays 1.0.0 because nothing has shipped yet.
- **Why:**
  - Plan-first: "more than one file" meant every KB change (KB + test) waited for a plan, so approvals would become rubber stamps.
  - `resolveJsonModule`: the old config allowed exactly the JSON import rule 3 forbids. The compiler now enforces the rule instead of prose.
  - Multipliers: the docs said bands had multipliers the KB didn't contain, which invites the agent to invent values in code.
  - Open-ended top band: `previous_claims_high` is unbounded (30 × claims), so 34+ claims scored above `HIGH_RISK`'s max of 999 and matched no band.
- **Verified:** in `backend/`: `npm install` OK; `npx tsc --version` → `Version 6.0.3`; `tsx` and `jest` (30.5.2) run on Node 24.22.2; `npm audit --omit=dev` → 0 vulnerabilities (19 low/moderate, all in dev-only Jest tooling, left as is). A script checked that every score 0–5000 lands in exactly one band.

---

## 04 — Shape the knowledge base (2026-11-11)
- **Prompt:**
  > Read @CLAUDE.md and @kb/risk-kb.json (the example KB from the exercise brief). In this step, only edit the KB and write its documentation. No code.
  > 1. Add "schemaVersion": 1 next to "version".
  > 2. The brief's band table has multipliers (STANDARD 1.0, ELEVATED 1.5, HIGH_RISK 2.2) that the example KB is missing. Add "multiplier" to each band, plus a one-sentence plain-English "summary" per band for the customer-facing risk summary.
  > 3. Add a compound factor "flat_high_value": Flat AND propertyValue > 500000 gives 35 points, written as { "all": [ <leaf>, <leaf> ] }.
  > 4. Keep the existing five factors exactly as they are.
  > 5. Create kb/README.md documenting: every top-level field; how a band is chosen (inclusive min/max); the factor shape; each leaf operator and the keys it uses: eq, neq (value), in, not_in (values), gt, gte, lt, lte (value), between, outside_range (min, max; between is inclusive, outside_range means below min or above max), starts_with (values, case-insensitive prefix); the all / any / not combinators; and perOccurrence (points × the numeric value of the condition's field, leaf conditions only). End with a short "How to add a factor" example using a postcode rule.
- **Output:**
  - `kb/risk-kb.json`: `schemaVersion: 1`; `version` 1.0.0 → 1.1.0 (added factor); multipliers 1.0 / 1.5 / 2.2 with one-sentence summaries that don't repeat the numbers; `flat_high_value` appended; the five original factors unchanged.
  - New `kb/README.md`; `CLAUDE.md` KB quick reference updated to match.
  - **Corrects entry 00:** HIGH_RISK is 2.2 (the brief), not the assumed 2.0. `HIGH_RISK.max: 999` is restored, because the brief keeps every band bounded and the engine puts any higher score in the top band. The request schema caps `previousClaims` at 20, so the maximum possible score is 690 anyway.
  - The KB changed without a test in this step (the prompt said "no code"); the KB tests arrive in steps 5 and 7.
- **Accepted / changed / rejected:** _<fill in>_
- **Why:** _<fill in>_
- **Verified:** a throwaway Node script checked `schemaVersion` = 1, every band has `multiplier` and `summary`, 6 factors, and all six rows of the step-7 table (scores 0/25/30/60/45/115, premiums 360/360/540/540/540/792) → 6 PASS.

---

## 05 — Request schema, KB schema and loader (2026-11-11)
- **Prompt:**
  > Implement the request and KB contracts. Plan first; wait for my approval before writing code.
  > 1. backend/src/validation/quote-request.schema.ts: Zod schema for the request: customerName: trimmed string, 1–100 chars; age: integer 18–120; propertyType: "House" | "Flat" | "Bungalow"; propertyValue: positive number, max 50,000,000; postcode: UK format, normalised to uppercase with a single space ("ex4 1aa" → "EX4 1AA"); previousClaims: integer 0–20. Export the inferred QuoteRequest type and the tuple of field names.
  > 2. backend/src/kb/kb.schema.ts: Zod schema matching kb/risk-kb.json and kb/README.md. Leaf conditions are a discriminated union on "operator", so each operator requires exactly its keys. Conditions are recursive (all / any / not). "field" must be one of the request field names (derive it from the request schema, don't retype the list). Cross-checks with superRefine: unique factor ids; bands start at 0 with no gaps or overlaps; perOccurrence only on leaf conditions; schemaVersion must be a supported version (only 1 for now). Export inferred types: KnowledgeBase, Factor, Condition, LeafCondition, RiskBand.
  > 3. backend/src/kb/kb-loader.ts: loadKnowledgeBase() reads the file at process.env.KB_PATH (default: ../kb/risk-kb.json relative to the backend folder), validates it, caches it per process like a Lambda cold start, and throws an error listing every validation issue. Also export resetKnowledgeBaseCache() for tests.
  > 4. backend/src/kb/validate-kb.ts: CLI for `npm run kb:validate`. Print "KB v<version> valid (<n> factors)" or the issues, and exit with code 1 on failure.
  > 5. Tests (test/kb.schema.test.ts, test/quote-request.schema.test.ts): the real KB passes; KBs in test/fixtures/ with a duplicate id, an unknown operator, an unknown field, overlapping bands and perOccurrence on a compound condition each fail with a clear message; postcode normalisation; out-of-range age is rejected.
  > Then run npm run typecheck, npm test and npm run kb:validate.
- **Output:**
  - Plan for steps 05–08 proposed and approved ("go") before any code was written.
  - A spike first proved the toolchain (ts-jest on TS 6.0.3) and that Zod 4 getter recursion infers `Condition` with no hand-written type. It also showed that a bad operator produced an opaque "Invalid input" union error listing every branch.
  - Fix: `formatKbIssues` picks the relevant `conditionSchema` branch from the input's key (`operator` / `all` / `any` / `not`) and descends into it; the leaf union has a custom "Unknown operator … Expected one of …" message. One defect gives one readable line.
  - `quote-request.schema.ts` (the field-name tuple is derived with `.keyof()`), `kb.schema.ts`, `kb-loader.ts` (path resolved from `__dirname`, so it works from `src/` and `dist/`), `validate-kb.ts`, 6 fixtures, `test/helpers.ts`, 2 test files.
  - Beyond the prompt: `points` must be a non-negative integer (so every score is ≥ 0 and falls in a band), and band `min ≤ max` / `between` `min ≤ max` checks (README updated).
  - The first test run failed on one assertion: Zod 4 already includes `operator` in the discriminator issue path, so my formatter printed `operator.operator`. Removed the special case.
- **Accepted / changed / rejected:** _<fill in>_
- **Why:** _<fill in>_
- **Verified:** `npm run typecheck` clean; `npm test` → 37 passed; `npm run kb:validate` → `KB v1.1.0 valid (6 factors)`. Fail-fast check: changed `"gt"` → `"greater"` in the real KB → `factors[4].condition.operator: Unknown operator "greater". Expected one of: eq, neq, …`, exit code 1; reverted, `git diff -- kb/` empty, valid again.

---

## 06 — Operators and condition evaluator (2026-11-11)
- **Prompt:**
  > Implement the generic condition evaluator. Plan first.
  > 1. backend/src/engine/operators.ts: an operator registry, meaning an object that maps every operator name in the KB schema to a pure predicate (actualValue, condition) => boolean. eq, neq, in, not_in, gt, gte, lt, lte, between (inclusive), outside_range (below min or above max), starts_with (case-insensitive prefix match against any of values). Numeric operators return false for non-numbers; no type coercion. Type the registry so adding an operator to the schema without implementing it is a compile error (a mapped type over the operator union), and so each implementation gets its own condition shape. No switch statement and no `any`. If TypeScript can't correlate the union at the call site, use one small typed dispatch helper and explain it to me.
  > 2. backend/src/engine/evaluate-condition.ts: evaluateCondition(condition, input). It is recursive: all → every, any → some, not → negate, leaf → read input[field] and call the registry.
  > 3. test/operators.test.ts: table-driven tests (it.each) for every operator, including edge values (between at exactly min and max, outside_range at exactly 25 and 75, starts_with with lowercase input), plus nested all/any/not.
  > Run npm run typecheck and npm test.
- **Output:**
  - `operators.ts`: `OperatorRegistry = { [K in OperatorName]: (actual: unknown, c: LeafFor<K>) => boolean }`. Eleven one-line predicates; numeric ones go through `isNumber` (finite numbers only, so `"40"` and `NaN` are false).
  - Dispatch helper: `dispatch<K>(operator: K, condition: LeafFor<K>, actual)`. With the operator as a type parameter, `operators[operator]` is `OperatorPredicate<K>`, so TypeScript can match it to the condition. Called directly with the `LeafCondition` union, it can't, and rejects the call. No cast, no switch.
  - `evaluate-condition.ts`: three `in` narrowings (`all` / `any` / `not`) and then the leaf. Input is typed `Readonly<Record<QuoteRequestField, unknown>>`, which a `QuoteRequest` satisfies.
  - `test/operators.test.ts`: 31 operator rows, 8 no-coercion rows, a registry-covers-schema check, and 9 leaf/combinator cases including two nested three levels deep.
- **Accepted / changed / rejected:** _<fill in>_
- **Why:** _<fill in>_
- **Verified:** `npm run typecheck` clean; `npm test` → 86 passed. Removing `starts_with` from the registry → `TS2741: Property 'starts_with' is missing … in type 'OperatorRegistry'`; restored, clean. A grep for `switch` / `any` in `src/engine` finds only comments.

---

## 07 — Scoring and pricing (2026-11-11)
- **Prompt:**
  > Implement pure scoring and pricing in backend/src/engine/score-quote.ts. Plan first.
  > scoreQuote(input: QuoteRequest, kb: KnowledgeBase): QuoteResult — for each factor in KB order: if its condition applies, points = factor.points, or factor.points × the numeric value of the condition's field when perOccurrence is true (throw if that value isn't a number). Collect appliedFactors as { id, description, points }. riskScore = sum of applied points. Band = the KB band where min ≤ score ≤ max; a score above the top band's max goes in the top band. annualPremium = basePremium × band multiplier × coverageLoadFactor, rounded to 2 dp. monthlyPremium = annualPremium / 12, rounded to 2 dp. Do all rounding in one helper. riskSummary = the band's KB summary plus the applied factor descriptions, or "No additional risk factors." when none apply. No sentences about specific factors in code. coverageDetails = { propertyType, propertyValue, basePremium, coverageLoadFactor, riskMultiplier }. Define QuoteResult in backend/src/types.ts. No KB numbers, band names or factor ids may appear in this file.
  > Tests in test/score-quote.test.ts, using the real KB and postcode "SW1A 1AA":
  > | case | age | type | value | claims | score | band | annual | monthly |
  > | standard | 40 | House | 300000 | 0 | 0 | STANDARD | 360 | 30 |
  > | standard boundary | 40 | House | 800000 | 0 | 25 | STANDARD | 360 | 30 |
  > | elevated | 22 | Flat | 250000 | 0 | 30 | ELEVATED | 540 | 45 |
  > | elevated boundary | 22 | Flat | 250000 | 2 | 60 | ELEVATED | 540 | 45 |
  > | compound | 40 | Flat | 600000 | 0 | 45 | ELEVATED | 540 | 45 |
  > | high risk | 40 | House | 800000 | 3 | 115 | HIGH_RISK | 792 | 66 |
  > Also: band resolution tests for scores 25, 26, 60 and 61; a "KB-only change" test: load test/fixtures/kb-with-extra-factor.json (the real KB plus one extra factor) and show the new factor applies with no code change.
  > Run npm run typecheck and npm test.
- **Output:**
  - `types.ts` (`QuoteResult`, `AppliedFactor`, `CoverageDetails`).
  - `score-quote.ts`: `scoreQuote`, `resolveBand` (exported for the band tests; overflow goes to the band with the highest `min`, never chosen by name), `roundToPence` (the only rounding; `Number.EPSILON` so 1.005 → 1.01).
  - Risk summary format: `<band summary> Factors: <description>; <description>.`, or `<band summary> No additional risk factors.`
  - Fixture `kb-with-extra-factor.json`: the real KB + `coastal_postcode` (TR/TQ, 10 points), version 1.2.0. Deliberately not the EX/PL flood rule, which is saved for step 09.
  - Extra tests: applied-factor order and per-occurrence points, the compound factor's negative cases, summary text, coverage details, overflow (score 1000), negative score throws, non-numeric perOccurrence throws, rounding.
  - A grep for band names found one in a doc comment in `types.ts`; reworded it.
- **Accepted / changed / rejected:** _<fill in>_
- **Why:** _<fill in>_
- **Verified:** `npm run typecheck` clean; `npm test` → 111 passed (all six table rows); `npm run kb:validate` → `KB v1.1.0 valid (6 factors)`. `git grep --untracked -nwE "1\.5|2\.2|300|750000|500000" -- src` → nothing found (`--untracked` because the new files weren't committed yet; a plain `git grep` would have passed without searching them). A grep for band names and factor ids in `src` → nothing found after the comment fix.

---

## 08 — Lambda handler and local server (2026-11-11)
- **Prompt:**
  > Implement backend/src/handler.ts and backend/src/server.ts. Plan first.
  > handler.ts: export async function handler(event, context). Type the parameters as the subset we use: Pick<APIGatewayProxyEvent, 'httpMethod' | 'headers' | 'body'> and Pick<Context, 'awsRequestId'> (from @types/aws-lambda). A real Lambda event still fits, and tests and the local server can build one without casts. OPTIONS → 204. Any method other than POST → 405. Invalid JSON → 400 { error: "INVALID_JSON" }. Zod failure → 400 { error: "VALIDATION_ERROR", issues: [{ path, message }] }. Success → 200 with the QuoteResult as JSON. Unexpected error → 500 { error: "INTERNAL_ERROR", requestId }, logged with console.error. Never put a stack trace in the response. Every response has a JSON content-type and CORS headers. Get the KB from loadKnowledgeBase(), which is cached.
  > server.ts: a small node:http adapter (no Express). PORT from env, default 3000. GET /health → { status: "ok", kbVersion }. POST or OPTIONS /policy/quote → build the event, call handler, write statusCode, headers and body. Anything else → 404. On start, log the port and the KB version.
  > test/handler.test.ts: 200 happy path (check the response shape), 400 validation error, 400 invalid JSON, 405 for GET.
  > Run npm run typecheck and npm test.
- **Output:**
  - `handler.ts`: one `respond()` helper adds the JSON + CORS headers to every response; the 405 also sends `Allow: POST, OPTIONS`. A missing body (`null`) counts as invalid JSON.
  - `server.ts`: repeated Node headers (`string[]`) are joined into one string, not cast. 1 MB body limit → 413. Server-level errors → 500 with a request id. Invalid `PORT` → error. It loads the KB before listening, so an invalid KB stops the server, and `tsx watch` restarts it once the KB is fixed. `createAppServer()` is exported; it only listens when run directly.
  - `test/handler.test.ts`: the 4 required cases plus an OPTIONS 204, `null`/empty bodies, and a 500 using an invalid fixture KB, asserting no stack trace or KB detail leaks into the body.
- **Accepted / changed / rejected:** _<fill in>_
- **Why:** _<fill in>_
- **Verified:** `npm run typecheck` clean; `npm test` → 119 passed; `npm run kb:validate` → `KB v1.1.0 valid (6 factors)`; step-07 grep still finds nothing. Live: `npm start` logged `PolicyQuote API listening on http://localhost:3000 (KB v1.1.0, 6 factors)`. The step's PowerShell request → `riskBand: STANDARD`, `annualPremium: 360`, `monthlyPremium: 30`, `kbVersion: 1.1.0`; `/health` → `{ status: ok, kbVersion: 1.1.0 }`; `/nope` → 404; bad JSON → 400 `INVALID_JSON`. `npm run build` + `node dist/kb/validate-kb.js` → valid (the KB path resolves from `dist/` too).

---

## 08b — Self-review before step 09 (2026-11-11)
- **Prompt:** none. The agent ran a review pass on its own before reporting steps 04–08 as done.
- **Output (fixes):**
  - **Tests were pinned to the current KB:** `kb.schema.test.ts` asserted 6 factors and a `1.x` version, and `handler.test.ts` asserted `kbVersion: '1.1.0'`. Any factor added through the skill would have turned unrelated tests red, failing step 09's "only the KB and a test file changed" check. They now assert a valid semver, a non-empty factor list, and `kbVersion` equal to the loaded KB's version.
  - **Oversized body gave a connection reset, not a 413:** `server.ts` destroyed the request before the 413 response was written. It now drains the body and then replies 413.
  - `CLAUDE.md` map: added `types.ts` and `test/helpers.ts`. Skill step 4 now names the test file, `loadRealKb()` and the scoring pattern, so a fresh session doesn't have to explore.
  - This log: the header no longer claims `CLAUDE.md` was re-read at each step; prompts 04, 07 and 08 are now complete (the earlier versions abridged them).
- **Accepted / changed / rejected:** _<fill in>_
- **Why:** _<fill in>_
- **Verified:**
  - Skill dry run: added a throwaway factor + version bump to `kb/risk-kb.json` → `npm test` 119 passed; reverted, `git diff -- kb/` empty.
  - Live with `npm start`: editing the KB version restarted the server (`/health` 1.1.0 → 1.1.1 → 1.1.0 after revert); a 1.1 MB body → `413 {"error":"PAYLOAD_TOO_LARGE"}`; a normal quote still → STANDARD / 360.

---

## 10 — Create the Angular app (2026-11-11)
- **Prompt:** commands only, from the guide: `npx @angular/cli@22 new frontend --style=css --ssr=false --routing=false --zoneless --ai-config=none --file-name-style-guide=2016 --commit=false`; `ng g c components/quote-page|quote-result|risk-band-badge --add-type-to-class-name`; `ng g s services/quote --add-type-to-class-name`; `proxy.conf.json` for `/policy` and `/health` → `localhost:3000`; `"start": "ng serve --proxy-config proxy.conf.json"`.
- **Output:**
  - Angular CLI 22.2.6 / Angular 22.2.5 on Node 24.22.2, TypeScript 6.0.3. The usage-data prompt was answered N via `NG_CLI_ANALYTICS=false`.
  - No nested git repo was created (`frontend/.git` doesn't exist).
  - Angular 22 generates services with the new `@Service()` decorator (auto-provided at root; kept).
  - `tsconfig.json` has no `strict` flag; I checked that TypeScript 6 enables strict mode by default (a probe file gave `TS7006` implicit any and `TS2322` null → number).
- **Accepted / changed / rejected:** _<fill in>_
- **Why:** _<fill in>_
- **Verified:** `npm start` → `Local: http://localhost:4200/`; GET returned 200 with the placeholder page (`<title>Frontend</title>`); server stopped.

---

## 11 — Models and QuoteService (2026-11-11)
- **Prompt:**
  > Frontend step. Read backend/src/types.ts and backend/src/validation/quote-request.schema.ts first.
  > 1. frontend/src/app/models/quote.models.ts: QuoteRequest, QuoteResponse, AppliedFactor and CoverageDetails interfaces that match the backend exactly. riskBand is a string because bands come from the KB.
  > 2. frontend/src/app/services/quote.service.ts (QuoteService): inject HttpClient; requestQuote(request): Observable<QuoteResponse> posts to /policy/quote (relative URL, the dev server proxies it). Map HTTP errors to a readable message: for 400 VALIDATION_ERROR, join the issue messages; for anything else, "We couldn't get a quote right now. Please try again."
  > 3. Register provideHttpClient(withFetch()) in src/app/app.config.ts.
  > No `any`. Run npm run build.
- **Output:**
  - `quote.models.ts`: the four interfaces, plus `PROPERTY_TYPES` (for the form's select) and `ValidationErrorResponse`.
  - `quote.service.ts`: `requestQuote` turns any HTTP error into a `QuoteRequestError` whose message is safe to show; `toReadableMessage` checks the 400 body with a type guard (no `any`, no cast) and joins the messages with `; `.
  - **Deviation:** `provideHttpClient()` without `withFetch()`. In Angular 22, `withFetch` is `@deprecated` ("not required anymore. `FetchBackend` is the default"), so the app still uses fetch; there's a comment in `app.config.ts`.
  - Rewrote the generated `quote.service.spec.ts`, which would have failed without an HttpClient provider: POST + body, 400 validation → joined messages, other 400 → generic, 500 → generic.
- **Accepted / changed / rejected:** _<fill in>_
- **Why:** _<fill in>_
- **Verified:** `npm run build` → bundle generated, no errors; `ng test --watch=false` (Vitest) → 5 files, 9 tests passed.

---

## 01 — <short title> (<date, time>)
- **Prompt:**
  > _paste the exact prompt_
- **Output:** _files created or changed, plus a 1–3 line summary of the approach_
- **Accepted / changed / rejected:** _what you kept, what you edited by hand, what you told the agent to redo_
- **Why:** _your reasoning: the rule it broke, the bug you spotted, the simpler design you preferred_
- **Verified:** _commands run and their result (e.g. `npm test`: 24 passed)_

<!-- Copy the block above for each step. Write it right after the step while it's fresh. Never invent entries. -->
