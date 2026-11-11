# AGENT_LOG

**Agents:** Claude Code for the build; Claude (chat) for planning (entry 00) and the final review (entry 19). **Project instructions:** [`CLAUDE.md`](CLAUDE.md). **Project skill:** [`.claude/skills/add-risk-factor/SKILL.md`](.claude/skills/add-risk-factor/SKILL.md).

Each entry follows: prompt → output → what I accepted, changed or rejected → why → how it was verified. **Output** and **Verified** describe what the agent did and reported, unless a line says I did it. "The guide" is the step-by-step plan with prompts from entry 00.
Steps 04–08 ran in one continuous Claude Code session (no `/clear` between them), so the agent also had the earlier conversation in context. Step 09 (the skill rehearsal) runs in a fresh context (`/clear`), because it tests that the skill works from the files alone.

---

## 00 — Planning (Claude chat, before writing code)
- **Prompt:** "Here is the exercise brief. Review it and tell me how to proceed and succeed", then "give me step-by-step instructions to execute it".
- **Output:** a breakdown of requirements and grading; ambiguities (band multipliers missing from the example KB, meaning of `perOccurrence`, `coverageLoadFactor`); a step-by-step guide with a prompt for each step ("the guide" below); first drafts of `CLAUDE.md`, the `add-risk-factor` skill and the backend config (TypeScript pinned to 6.0 because ts-jest doesn't support TypeScript 7).
- **Review (Claude Code, 2026-11-11, after setup):** I asked Claude Code to read `CLAUDE.md` and the skill end to end and flag anything it disagreed with. I approved its points and had it apply them, then told it to settle the two open data decisions with stated assumptions.
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

## 01–03 — Setup: tools, repo, starter (2026-11-11)
- **Prompt:** the guide's setup steps (install Node 24 LTS, check Docker, create the public `policyquote` repo without README/.gitignore, clone it, unzip the starter, read `CLAUDE.md` and the skill and reword what I disagree with, `npm install` in `backend/`).
- **Output:**
  - Node upgraded 24.13.0 → 24.22.2 from the official MSI (SHA-256 checked against nodejs.org's SHASUMS256); Docker Desktop already running (29.9.3, hello-world OK).
  - Public repo created with `gh`, cloned; starter unzipped (10 files, `CLAUDE.md` at the root).
  - Review of `CLAUDE.md`/`SKILL.md` and the changes made: see entry 00. Context added: built for AIG (UK), GBP, auditable quotes, no AIG branding.
  - `npm install` → TypeScript 6.0.3 (ts-jest doesn't support 7); `npm audit --omit=dev` → 0 vulnerabilities (19 in dev-only Jest tooling).
- **Accepted / changed / rejected:** Accepted as is.
- **Why:** Node 24.13 was below Angular 22's minimum (24.15), so the upgrade was needed, and the official installer with a checked SHA-256 kept it safe. The audit warnings are in dev-only test tooling, which never ships in the API image (`npm ci --omit=dev`).
- **Verified:** `node -v` → v24.22.2; `npx tsc --version` → 6.0.3; first commit `9b27e8a` pushed.

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
- **Accepted / changed / rejected:** Accepted, including the agent's correction of my entry-00 assumptions: HIGH_RISK back to 2.2, and a `max` of 999 again.
- **Why:** The brief's table says 2.2 and keeps every band bounded. A score above 999 still goes in the top band, and the request limits cap the score at 690 anyway. Multipliers and summaries in the KB keep all pricing data out of code.
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
  - The first test run failed on one assertion: Zod 4 already includes `operator` in the discriminator issue path, so the formatter printed `operator.operator`. Removed the special case.
- **Accepted / changed / rejected:** Approved the plan for steps 05–08 before any code was written. Accepted the two additions beyond my prompt: whole-number, non-negative points, and `min ≤ max` checks.
- **Why:** Both checks guarantee every possible score lands in exactly one band. The readable error formatter matters for the live demo: a KB typo gives one clear line instead of a wall of Zod output.
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
- **Accepted / changed / rejected:** Accepted, including the small typed `dispatch` helper I had asked it to explain.
- **Why:** It keeps the registry a plain map with no `switch` and no cast, and the mapped type turns a missing operator into a compile error (checked by removing `starts_with`).
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
- **Accepted / changed / rejected:** Accepted as is.
- **Why:** Every number comes from the KB (the grep for KB values in `src` finds nothing), all six rows of my test table pass, and the KB-only-change test proves a new factor needs no code. All rounding happens in one helper, so the money maths is in one place.
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
- **Accepted / changed / rejected:** Accepted, including the extras beyond my prompt: a 1 MB body limit with 413, and an invalid KB stopping the server before it listens.
- **Why:** The handler stays thin (HTTP shape and validation only), errors never leak internals, and failing fast on a bad KB is safer than serving wrong prices.
- **Verified:** `npm run typecheck` clean; `npm test` → 119 passed; `npm run kb:validate` → `KB v1.1.0 valid (6 factors)`; step-07 grep still finds nothing. Live: `npm start` logged `PolicyQuote API listening on http://localhost:3000 (KB v1.1.0, 6 factors)`. The step's PowerShell request → `riskBand: STANDARD`, `annualPremium: 360`, `monthlyPremium: 30`, `kbVersion: 1.1.0`; `/health` → `{ status: ok, kbVersion: 1.1.0 }`; `/nope` → 404; bad JSON → 400 `INVALID_JSON`. `npm run build` + `node dist/kb/validate-kb.js` → valid (the KB path resolves from `dist/` too).

---

## 08b — Self-review before step 09 (2026-11-11)
- **Prompt:** none. The agent ran a review pass on its own before reporting steps 04–08 as done.
- **Output (fixes):**
  - **Tests were pinned to the current KB:** `kb.schema.test.ts` asserted 6 factors and a `1.x` version, and `handler.test.ts` asserted `kbVersion: '1.1.0'`. Any factor added through the skill would have turned unrelated tests red, failing step 09's "only the KB and a test file changed" check. They now assert a valid semver, a non-empty factor list, and `kbVersion` equal to the loaded KB's version.
  - **Oversized body gave a connection reset, not a 413:** `server.ts` destroyed the request before the 413 response was written. It now drains the body and then replies 413.
  - `CLAUDE.md` map: added `types.ts` and `test/helpers.ts`. Skill step 4 now names the test file, `loadRealKb()` and the scoring pattern, so a fresh session doesn't have to explore.
  - This log: the header no longer claims `CLAUDE.md` was re-read at each step; prompts 04, 07 and 08 are now complete (the earlier versions abridged them).
- **Accepted / changed / rejected:** Accepted all the fixes from the agent's self-review.
- **Why:** Tests pinned to today's KB (factor count, version) would fail on any new factor, which would break the "KB-only change" promise in the live demo. The 413 fix made the server do what the step 08 output said it did.
- **Verified:**
  - Skill dry run: added a throwaway factor + version bump to `kb/risk-kb.json` → `npm test` 119 passed; reverted, `git diff -- kb/` empty.
  - Live with `npm start`: editing the KB version restarted the server (`/health` 1.1.0 → 1.1.1 → 1.1.0 after revert); a 1.1 MB body → `413 {"error":"PAYLOAD_TOO_LARGE"}`; a normal quote still → STANDARD / 360.

---

## 09 — Skill rehearsal (not yet run)
- **Prompt:** in a fresh Claude Code session opened in `policyquote/`: `/clear`, then `/add-risk-factor Flood zone: +15 points if the postcode starts with EX or PL`. Then `git stash -u`, so the submitted KB doesn't contain it (the panel picks the live factor on the day).
- **Status:** not yet run. The build session was started in the parent `aig/` folder, so it never loaded `policyquote/.claude/` (the skill and the hook), and this rehearsal needs a fresh context anyway.
- **Output / accepted / why / verified:** _<fill in after the run: did only kb/risk-kb.json and one test file change? did it use `postcodeArea in ["EX","PL"]` rather than `starts_with`? version bump? `kb:impact` summary?>_

---

## 10 — Create the Angular app (2026-11-11)
- **Prompt:** commands only, from the guide: `npx @angular/cli@22 new frontend --style=css --ssr=false --routing=false --zoneless --ai-config=none --file-name-style-guide=2016 --commit=false`; `ng g c components/quote-page|quote-result|risk-band-badge --add-type-to-class-name`; `ng g s services/quote --add-type-to-class-name`; `proxy.conf.json` for `/policy` and `/health` → `localhost:3000`; `"start": "ng serve --proxy-config proxy.conf.json"`.
- **Output:**
  - Angular CLI 22.2.6 / Angular 22.2.5 on Node 24.22.2, TypeScript 6.0.3. The usage-data prompt was answered N via `NG_CLI_ANALYTICS=false`.
  - No nested git repo was created (`frontend/.git` doesn't exist).
  - Angular 22 generates services with the new `@Service()` decorator (auto-provided at root; kept).
  - `tsconfig.json` has no `strict` flag; the agent checked that TypeScript 6 enables strict mode by default (a probe file gave `TS7006` implicit any and `TS2322` null → number).
- **Accepted / changed / rejected:** Accepted, including Angular 22's new `@Service()` decorator.
- **Why:** It's the CLI's current default and is provided at root, like `providedIn: 'root'`. The missing `strict` flag looked wrong, but a probe file showed TypeScript 6 has strict mode on by default.
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
- **Accepted / changed / rejected:** Accepted the deviation from my prompt: `provideHttpClient()` without `withFetch()`.
- **Why:** `withFetch()` is deprecated in Angular 22 because fetch is already the default, so following my prompt literally would have added a deprecated call.
- **Verified:** `npm run build` → bundle generated, no errors; `ng test --watch=false` (Vitest) → 5 files, 9 tests passed.

---

## 12 — Quote page with Signals (2026-11-11)
- **Prompt:**
  > Implement QuotePageComponent (src/app/components/quote-page/) and render it from the root App component, replacing the placeholder template. Plan first.
  > - Reactive form built with NonNullableFormBuilder: customerName, age, propertyType (select: House/Flat/Bungalow), propertyValue (£), postcode, previousClaims. Validators mirror the backend rules. Show an error under each field once it's touched.
  > - UI state as signals only: loading = signal(false), quoteResult = signal<QuoteResponse | null>(null), errorMessage = signal<string | null>(null). No BehaviorSubject or Subject.
  > - Bridge the form into signals with toSignal(form.statusChanges) and toSignal(form.valueChanges), with initial values.
  > - computed(): canSubmit (form valid and not loading) and submitLabel ("Getting your quote…" while loading).
  > - effect(): save the form draft to localStorage whenever it changes (inside try/catch), and restore it once in the constructor. Add a one-line comment on why this is an effect (syncing to an outside API) rather than a computed.
  > - On submit: set loading, clear the error, call QuoteService.requestQuote. On success set quoteResult; on error set errorMessage; always reset loading (finalize).
  > - Use @if / @for and pass the result to <app-quote-result [quote]="...">. For now give QuoteResultComponent its quote = input.required<QuoteResponse>() and a minimal template; I'll build it out in the next step.
  > - The app is zoneless: tell me in one sentence why everything the template shows must come from a signal or the form.
  > Run npm run build.
- **Output:**
  - The plan was proposed and approved ("go with your recommended actions").
  - **Decision:** the localStorage draft leaves out `customerName`, so no personal name is stored in the browser in plain text (insurer context). Age, property details, postcode and claims are saved.
  - Number controls are typed `number | null`, because an empty number input really gives `null`; `toRequest()` narrows the nulls away (no `!`).
  - Validators in `quote-form.validators.ts` (`notBlank`, `integer`, `positive`, `ukPostcode`, the same pattern as the backend) plus Angular's required/min/max/maxLength. One message per field rule.
  - The draft is restored with `patchValue` in the constructor, keeping only known keys with the right types; a corrupt draft is ignored.
  - **Addition:** submit also clears the previous `quoteResult`, so a failed request doesn't show an old quote next to the error.
  - Label "Previous claims", not "Claims in the last 5 years". The agent's reason: its first draft had "invented a time window the backend doesn't define" (reversed in entry 19).
  - Zoneless, in one sentence: without zone.js, Angular re-renders only when told something changed (a signal the template reads, a template event, or the form's own events), so a plain field set in an HTTP callback would never reach the screen.
  - Specs: `quote-page` (disabled until valid, touched-field error, loading label then result, friendly error, draft without the name and restored, corrupt draft ignored); `App` and `quote-result` specs updated.
- **Accepted / changed / rejected:** Approved the plan ("go with your recommended actions") and accepted the result, including leaving the name out of the saved draft. I missed one thing at the time and fixed it later (entry 19): the claims label.
- **Why:** Not storing a personal name in the browser is the right default for an insurer. The agent's reason for the label was wrong: the 5-year window isn't invented, it's in the brief ("number of previous claims in last 5 years"). The API only takes a number, so the label is the only place the customer learns which claims to count.
- **Verified:** `npm run build` clean; `ng test --watch=false` → 13 passed; a grep for `any`, `Subject`, `as unknown as` and non-null `!.` in non-spec `src` → none.

---

## 13 — Result view, badge and styling (2026-11-11)
- **Prompt:**
  > Implement the result view and styling.
  > 1. RiskBandBadgeComponent: riskBand = input.required<string>(). computed() label (HIGH_RISK → "HIGH RISK") and computed() CSS modifier class: green for STANDARD, amber for ELEVATED, red for HIGH_RISK, and a neutral style for any other band, so a new KB band still renders.
  > 2. QuoteResultComponent: quote = input.required<QuoteResponse>(). Show the monthly and annual premium (CurrencyPipe, GBP), the badge, riskScore, riskSummary, and the applied factors from appliedFactors (description + "+N pts") with @for, or "No risk factors applied" when empty. Show the KB version in small text. Make the result region aria-live="polite".
  > 3. Styling: hand-written CSS only (no UI libraries). CSS custom properties for colours and spacing in src/styles.css; form and result side by side on desktop, stacked under 720px; visible focus states; clean and professional.
  > Run npm run build and fix any errors.
- **Output:**
  - Badge: `label` = `riskBand` with `_` → space; `modifierClass` from a band → class map, defaulting to `badge--neutral` (spec checks `VERY_HIGH_RISK` → neutral). Includes a visually hidden "Risk band:" prefix for screen readers.
  - Result: `@let q = quote()`; `CurrencyPipe` GBP; score, summary, a factor list or "No risk factors applied", "Rules version x.y.z".
  - `aria-live="polite"` is on the result *panel* in `quote-page`, not inside `QuoteResultComponent`, because that component appears and disappears with `@if`, and a live region that arrives with its content is often not announced. There's a comment in the template.
  - `styles.css`: design tokens (colours, band colours, spacing, radii, type scale, focus ring) and a single `:focus-visible` rule; a grid layout that stacks under 720px (and field pairs stack under 480px); `prefers-reduced-motion` respected.
  - The first test run had 2 failures, both in test data: a partial mock response (the full template now reads `appliedFactors.length`), and a text assertion that assumed whitespace between spans, which Angular strips. Fixed the tests, not the components.
  - The browser check found the tab title "Frontend"; changed it to "PolicyQuote — Home insurance quote".
- **Accepted / changed / rejected:** Accepted, after checking the UI by eye.
- **Why:** The badge falls back to a neutral style for a band it doesn't know, so a new KB band still renders, and the CSS is hand-written as the brief requires. Fixing the two failing tests rather than the components was right, because the test data was wrong.
- **Verified:** `npm run build` clean; `ng test --watch=false` → 18 passed (badge 4, result 3, page 6, service 4, app 1). Looked at it in Chrome at 1280px and 600px (see 14).

---

## 14 — End-to-end check (2026-11-11)
- **Prompt:** the guide's checklist, run in Chrome (Claude in Chrome) against `npm --prefix backend start` + `npm --prefix frontend start`. (A first attempt with the Playwright MCP stalled and was stopped. I had also checked by hand.)
- **Output (all as expected):**
  - 40, House, £300,000, SW1A 1AA, 0 claims → STANDARD (green) · £30.00/mo · £360.00/yr · score 0 · "No risk factors applied".
  - 22, Flat, £250,000, 0 claims → ELEVATED (amber) · £45.00 · £540.00 · score 30 · 2 factors (+20, +10).
  - 40, House, £800,000, 3 claims → HIGH RISK (red) · £66.00 · £792.00 · score 115 · 2 factors (+90, +25).
  - Age 15, then Tab → red border and "Enter an age between 18 and 120, in whole years."; button disabled; focus ring visible on the next field.
  - Backend stopped, then submit → "We couldn't get a quote right now. Please try again."; no crash, button re-enabled.
  - Configurability: `previous_claims_low` 15 → 20 in `kb/risk-kb.json`; the backend restarted by itself; 1 claim → score 20, "+20 pts". Reverted (`git diff -- kb/` empty); the API gave 15 again.
  - Width 600px → stacked layout, result below the form.
  - Draft: on first load the form held the earlier draft values with the name empty, as designed.
- **Observations, not changed:**
  - After a quote, editing the form leaves the old quote visible until the next submit (e.g. age 15 with a HIGH RISK quote still showing).
  - The console check started after page load, so it only covered the later interactions. Rechecked from a cold page load in entry 19: no errors or warnings.
- **Accepted / changed / rejected:** Accepted. Left the old-quote behaviour as it is.
- **Why:** All three bands, validation, the backend-down error and the KB-only weight change behaved as expected. An old quote staying visible while the form is edited is a small UX gap; with more time I'd clear it as soon as the form changes.
- **Verified:** screenshots in Chrome for every row above; KB revert confirmed with `git diff` and a live API call.

---

## Extra A — Auto-check hook (2026-11-11)
- **Prompt:**
  > Set up a Claude Code hook that checks the KB automatically whenever you edit it. Look up the current Claude Code hooks documentation first and follow its exact format.
  > - In .claude/settings.json, add a PostToolUse hook for the file-editing tools (Edit and Write) that runs a small Node script: .claude/hooks/check-kb.js.
  > - The script reads the hook's JSON from stdin and checks tool_input.file_path. If the edited file isn't kb/risk-kb.json, it exits 0 straight away. (Code edits are covered by the test run at the end of each task; running tests halfway through a refactor would just be noise.)
  > - For KB edits it runs `npm --prefix backend run kb:validate`, then `npm --prefix backend test -- --silent`, from the project root (use the CLAUDE_PROJECT_DIR environment variable). Run them with child_process.execSync and a command string, so `npm` also resolves on Windows.
  > - If either command fails, print its output to stderr and exit with code 2, so the output is fed back to you and you fix it. If both pass, exit 0.
  > - Node built-ins only. Add one line about the hook to CLAUDE.md under "How to work".
- **Output:**
  - Checked the format against Claude Code's settings documentation (`update-config` skill): `hooks.PostToolUse[{ matcher: "Edit|Write", hooks: [{ type: "command", command, timeout }] }]`; stdin carries `tool_input.file_path`; for PostToolUse, exit 2 feeds stderr back to the agent; on Windows the command runs through bash when Git Bash is installed, so `"$CLAUDE_PROJECT_DIR"` expands (quoted, because the path contains a space).
  - `check-kb.js`: compares paths after `path.resolve` (case-insensitive on Windows, either slash, relative paths allowed). A payload it can't parse exits 0, so the hook never blocks the agent because of its own bug. Falls back to the script's location if `CLAUDE_PROJECT_DIR` is unset. 120 s timeout.
  - CLAUDE.md "How to work": one line saying the hook exists and that a reported failure must be fixed or reverted first.
  - The agent's first broken-KB pipe test wrongly passed (exit 0): its bash-built payload had invalid JSON escapes, so the hook took its "can't parse → don't block" branch. Rebuilt the payloads with `JSON.stringify` in a small harness.
- **Accepted / changed / rejected:** Accepted. The live check runs with the step 09 rehearsal, in a session opened in `policyquote/`.
- **Why:** The hook turns a broken KB into immediate feedback for the agent instead of a red build later. Exiting 0 on a payload it can't parse means the hook can never block work because of its own bug.
- **Verified:** pipe tests with real payloads → other file: exit 0 (0.3 s); valid KB: exit 0 (5.8 s); KB with `"greater"`: exit 2 with the validation error on stderr, for backslash, forward-slash and relative paths; KB restored (`git diff` empty). The exact settings command run through bash → exit 0.
- **Still to do (live check):** this build session was started in the parent `aig/` folder, so Claude Code didn't load `policyquote/.claude/` (that's also why `/add-risk-factor` didn't appear). In a session opened in `policyquote/`: run `/hooks` to confirm the hook is listed, then ask: *"To test the hook, change the operator of property_value_high in kb/risk-kb.json to "greater"."* Record that exchange here (the hook's message and Claude reverting the KB).

---

## Extra B — Impact preview (2026-11-11)
- **Prompt:** Prompt B from the guide (plan first): `synthetic-book.ts` with `generateBook(size, seed)` and assumptions in `book-assumptions.json`; pure `compareKnowledgeBases(baseKb, candidateKb, book)` reusing `scoreQuote` (band moves, transition table, premium change in £ and %, top 5 movers, KB diff by factor id); `kb-impact.ts` CLI (`git show HEAD:kb/risk-kb.json` vs the working copy, 1,000 customers, seed 42, `--base/--candidate/--size/--seed/--markdown`, "No differences" when nothing changed); tests (same seed → same book, self-comparison → zero change, +15 EX/PL rule only affects EX/PL); script, CLAUDE.md and skill updates.
- **Output:**
  - The plan for B and C was proposed and approved ("go").
  - Book: mulberry32 seeded PRNG plus Box–Muller, written inline (no dependency). Log-normal property values around the £300k median (spread 0.45, so about 2% are over £750k). Every customer goes through `quoteRequestSchema.parse`. The assumptions JSON is checked with a small Zod schema; postcodes include EX1, EX4, PL1, PL4.
  - Impact: "up/down" uses each band's rank by `min` within its own KB, so renamed bands still compare. The KB diff also reports `otherChanged` (description/flags) and top-level `settingsChanged`. Movers are stably sorted by absolute £ change, so the report is reproducible.
  - CLI: `util.parseArgs`; both KBs are validated with the KB schema and print readable issues if invalid; Markdown mode for CI.
  - Additions: a note when rules changed but `version` wasn't bumped; singular "1 claim".
  - A self-review grep found the book's claims weight `1.5` matching the step-07 "no KB numbers in src" grep (`1\.5`). It isn't a KB value, but the agent switched to whole-number weights with the same proportions, so the check gives no false alarms.
  - CLAUDE.md: the `kb:impact` command, and the I/O rule now names the CLIs and `loadBookAssumptions()`. Skill: verify runs `kb:impact` after the tests; the report includes its summary.
- **Accepted / changed / rejected:** Approved the plan for B and C together, and accepted the result, including the switch to whole-number claim weights.
- **Why:** It answers "how would you ship rule changes safely?" with numbers: every KB change shows how many customers move band and by how much. The whole-number weights keep the same proportions, and the "no KB numbers in src" check stays free of false alarms.
- **Verified:** `npm run typecheck` clean; `npm test` → 127 passed (8 new). `npm run kb:impact` → `No differences`. With `previous_claims_low` 15 → 20 uncommitted → "Moved up a band: 41 (4.1%) · down 0 · average +£8.03 per customer, total +£8,028.00 (+1.96%) · STANDARD → ELEVATED 32, ELEVATED → HIGH_RISK 9", the version-bump note, top movers +£252. `git restore` → `No differences` again. The KB-number grep over `src` → none.

---

## Extra C — KB linter (2026-11-11)
- **Prompt:** Prompt C from the guide (plan first): an optional `group` on factors (set `previous_claims` on the two claims factors, documented in the README); `lint-kb.ts` with `lintKnowledgeBase(kb)` that works by probing (probe values from the KB's thresholds and neighbours, the rules' values and prefixes, and the request schema's enums and min/max, kept inside the request limits) and detects overlap, gap, dead rule, unreachable band and stacking (info); `kb:validate` prints findings, warnings fail only with `--strict`, and the hook switches to `--strict`; tests with fixtures (overlap at 3, gap at 3, age > 130 dead, real KB clean with one stacking note).
- **Output:**
  - Planned together with B; approved.
  - Small engine refactor: `assessRisk(input, kb)` (applied factors + score) split out of `scoreQuote`, so the linter reuses the exact scoring path rather than a copy.
  - Probes are typed by the request schema (`ZodNumber` → `minValue`/`maxValue`, `ZodEnum` → options, otherwise free text plus a value that matches no rule), so there is no branching on field names. Literals are read generically from each leaf (every key except `field`/`operator`). Each probe is checked with the field's own schema, so `propertyValue` (exclusive > 0) and whole-number ages stay valid.
  - The probe input is typed with an exhaustive `z.record(quoteRequestFieldSchema, z.unknown())` instead of a cast (rule 4). The first draft used `as Record<…>`; rejected.
  - Gaps are checked only for single-field numeric groups. Same-group pairs are never reported as stacking (that's an overlap). A note is emitted, rather than a hang, if probes would exceed 200,000 combinations; the real KB takes ~25 ms.
  - KB: `group: "previous_claims"` on both claims factors; version 1.1.0 → 1.1.1 (metadata only, a patch under the skill's rules).
- **Accepted / changed / rejected:** Accepted, including the small `assessRisk` refactor.
- **Why:** The linter scores its probes through the same code path as real quotes, so it can't disagree with the engine. The agent also rejected its own `as Record<…>` cast, in line with CLAUDE.md rule 4.
- **Verified:**
  - `npm run typecheck` clean; `npm test` → 133 passed (6 new).
  - `npm run kb:validate` → `KB v1.1.1 valid (6 factors)` · `Lint: 0 warnings, 1 note` · `info [stacking] "flat_high_value" only applies together with "property_type_flat" … (35 + 10 = 45)`; same with `--strict`, exit 0.
  - Overlap fixture with `--strict` → `warning [overlap] … both apply when previousClaims = 3`, exit 1 (exit 0 without `--strict`).
  - Hook: changing `previous_claims_high` to `≥ 2` → hook exit 2 with "previous_claims_low and previous_claims_high both apply when previousClaims = 2"; reverted.
  - `kb:impact` on this commit's KB change → v1.1.0 → v1.1.1, both claims factors "description/flags changed", 0 customers moved, £0.00.

---

## Extra D — Example profiles (2026-11-11)
- **Prompt:** Prompt D from the guide: `data/example-profiles.ts` with four personas (inputs only, never prices); `ExampleProfilesComponent` requests a live quote for each in parallel via `QuoteService`, keeps results in a signal, and uses `computed()` for the "from £X a month" headline (lowest monthly price); each card is a real `<button>` with label, one-line description, monthly price and `RiskBandBadgeComponent`; a click emits profile + quote through `output()` and `QuotePageComponent` fills the form and shows that quote; a placeholder while loading; a failed request hides its card.
- **Output:**
  - `forkJoin` over the four `requestQuote` calls, each with `catchError → of(null)`, so one failure only hides that card. `results = signal<ProfileQuote[] | null>(null)` (null = loading). `headline = computed(...)` formats the minimum with `formatCurrency` and the app locale. `profileSelected = output<ProfileQuote>()`.
  - Loading placeholders show the persona labels plus a shimmer bar (still under reduced motion: no animation). Cards: 4 columns on desktop, 2 under 960px, 1 under 480px.
  - `QuotePageComponent.useExample()`: `form.setValue(profile.request)`, clears the error, shows the quote. The draft effect then saves it (still without the name).
  - The agent rejected its own first draft: it used `queueMicrotask` so a `profiles` input could be read after binding. That was an unneeded workaround, so it switched to the constant and a constructor subscription.
  - Specs: new `example-profiles` spec (parallel requests + placeholders, 4 cards + headline, a failed card hidden, click emits). The `quote-page` spec now answers the 4 example requests on create (otherwise they collide with `expectOne` and `verify()`), plus a "card fills the form and shows the quote" test.
- **Accepted / changed / rejected:** Accepted as is.
- **Why:** The prices come live from the API and are never hard-coded in the UI, so the cards stay correct when the KB changes. The agent dropped its own `queueMicrotask` workaround for a simpler constant.
- **Verified:** `npm run build` clean; `ng test` → 23 passed (5 new). In Chrome against the live backend (KB v1.1.1): First-time buyer ELEVATED £45.00 · Family home STANDARD £30.00 · City flat HIGH RISK £66.00 · Coastal home STANDARD £30.00; headline "Home insurance from £30.00 a month". Clicking City flat → form filled (Chris Lee, 35, Flat, £900,000) and the result HIGH RISK £66.00/mo, £792.00/yr, score 70. At 600px (measured in a same-origin iframe, because the window wouldn't resize): 2 card columns, form and result stacked, no horizontal scroll. A grep of non-spec frontend source finds no prices, only property values. The "jumps to ELEVATED with the flood rule" check is part of the step 09 rehearsal.

---

## Extra E1 — Derived postcode fields (2026-11-11)
- **Prompt:**
  > Add derived postcode fields so KB rules can match whole postcode areas and districts exactly instead of using prefixes. Plan first.
  > - After the request schema normalises the postcode, derive postcodeArea (the leading letters, e.g. "EX" from "EX4 1AA") and postcodeDistrict (the outward code, e.g. "EX4"). Derive them in one place and reuse it everywhere the engine gets input, including the synthetic book. They are not new form fields and not part of the API request.
  > - Allow KB conditions to use them: update the KB schema's allowed fields, kb/README.md, and the linter's probes if the linter exists.
  > - Tests: "E1 6AN" → area "E", district "E1"; "EX4 1AA" → area "EX", district "EX4"; a rule on postcodeArea in ["E"] does not match "EX4 1AA"; "B1 1AA" and "B10 0AA" are different districts.
  > Run typecheck and tests.
- **Output:**
  - The plan (with E2) was approved ("go"). The agent chose this path over the guide's B+ option (house-price data) and, at my request, downloaded and parsed the data itself.
  - `validation/postcode.ts`: `derivePostcodeFields()` (the only derivation), `DERIVED_POSTCODE_FIELDS`, `SAMPLE_POSTCODE_FOR` (for linter probes).
  - `toConditionInput(request)` in `evaluate-condition.ts` is the one place a request becomes engine input; `scoreQuote` calls it, so the handler, the impact preview and the synthetic book all get the derived fields. `ConditionInput` now covers request and derived fields.
  - KB schema: `field` is `conditionFieldSchema` = request fields + derived fields (both lists come from code, not retyped).
  - Linter: derived-field literals become sample postcodes (district `EX4` → `EX4 1AA`) and every probe's area and district are derived from its postcode, so the three fields never disagree in a probe.
  - Docs: kb/README.md (derived-field table, prefix-trap note; the "How to add" example now uses `postcodeArea in ["TR","TQ"]`), CLAUDE.md KB reference, skill step 2.
  - `.gitignore`: added `data/raw/` and `reports/` before any data was downloaded.
- **Accepted / changed / rejected:** Approved the plan ("go") and accepted the result.
- **Why:** Matching `postcodeArea` exactly fixes the prefix trap, where "E" also matches "EX4". Deriving the fields in one place means the handler, the linter and the synthetic book can never disagree.
- **Verified:** `npm run typecheck` clean; `npm test` → 144 passed (11 new: the four required cases plus "SW1A"/"M1"/unnormalised input, end-to-end scoring on a district rule, schema accepts derived but rejects unknown fields, linter probes district rules as live and disjoint). `kb:validate -- --strict` on the real KB → 0 warnings, 1 note.

---

## Extra E2 — Flood-data rule suggestions (2026-11-11)
- **Prompt:** Prompt E2 from the guide (plan first; inspect the raw file's columns first): `flood/aggregate.ts` + `npm run flood:aggregate` → `data/flood-districts.csv` (district, properties counted, share at high and medium risk; committed, raw not); `flood/suggest.ts` + `npm run kb:suggest-flood` with tiers in `data/flood-suggestion-config.json` → `kb/proposals/flood-<date>.json` (adds `postcodeDistrict in [...]` factors) plus a markdown note (source, date, licence attribution, tiers, districts per tier); run the impact preview (current KB vs proposal) into the note, with flood districts in the synthetic book; never edit `kb/risk-kb.json`; README attribution; tests (aggregation fixture, tier assignment, proposal passes KB validation).
- **Data:** at my request, the agent found the current data.gov.uk record (Environment Agency, OGL v3, revision 2026-11-03, not retired) and downloaded `RoFRS_Postcodes_in_Areas_at_Risk.zip` (4.8 MB: one 17 MB CSV plus the product description PDF) into the git-ignored `data/raw/flood/`.
- **Inspection (reported to me before building):**
  - 271,449 rows, 25 columns. `cntpc` = all properties in the postcode (= RES + NRP + UNC in every row). `{RES,NRP,UNC,TOT}_CNT_{VeryLow,Low,Medium,High}` = properties per likelihood band (High ≥ 1 in 30/yr, Medium 1 in 30 to 1 in 100). The banded total ≤ `cntpc` (the rest are outside flood areas).
  - Only postcodes in or near flood areas are listed, so district shares overstate district-wide risk (stated as a caveat).
- **Output:**
  - **Found during the build:** the agent's first aggregation skipped 106,282 rows as invalid postcodes. Inspection showed ~105,700 of them are partial postcodes such as `PR2 5P*` (grouped units) with a valid outward code, only 548 are junk like `VBN0094*`. Dropping them would have badly understated districts. The aggregator now keeps any row with a valid outward code (counted as `partialPostcodes` in the meta) → 2,128 districts.
  - Uses **residential** counts (home insurance). Source, licence, revision, verbatim attribution and caveats live in a hand-checked `data/flood-source.json`; the aggregator writes `data/flood-districts.meta.json` (row counts, file date).
  - Real distribution: median district 0.24% of homes at high risk, 95th percentile 3.6%. With the guide's example tiers (≥ 20% → +25, 5–20% → +10, ≥ 50 homes): 2 districts high (PE24, PE25), 73 moderate. Tiers are validated (no overlaps; min inclusive, max exclusive); each non-empty tier becomes one factor in group `flood_risk`, replacing earlier flood factors on re-runs; minor version bump.
  - The proposal must pass the KB schema and the linter (no warnings) before it is written.
  - The impact render moved from the CLI into `analysis/impact-report.ts` so the note reuses it (no copy).
  - Synthetic book: added PE24, PE25, DN14, TW18, PL10, EX33 (documented in the assumptions file). The B demo numbers are unchanged (41 moved, +£8.03), because the book draws the same random sequence and the claims rule ignores postcodes.
  - Docs: kb/README.md "Data sources and proposals" (source, licence, exact attribution, pipeline); CLAUDE.md commands and I/O list.
- **Accepted / changed / rejected:** Accepted, including the aggregator fix that keeps partial postcodes.
- **Why:** Dropping the ~105,700 partial-postcode rows would have badly understated flood risk per district. The tool only writes a proposal into `kb/proposals/` and never edits the live KB, so a person still decides.
- **Verified:** `npm run typecheck` clean; `npm test` → 155 passed (11 new: aggregation incl. partial and junk rows and the E/EX and B1/B10 traps, CSV round-trip, tier boundaries and min-homes filter, overlapping config rejected, proposal valid + lint-clean + base KB untouched, district-not-prefix matching, re-run replaces flood factors). `npm run flood:aggregate` → "271,449 rows (105,734 partial … kept; 548 skipped) → 2,128 districts" in ~2 s. `npm run kb:suggest-flood` → `kb/proposals/flood-2026-11-11.json` (v1.1.1 → v1.2.0) + note; impact 48 of 1,000 customers move up a band, average +£8.78 (+2.14%). `KB_PATH=…/flood-2026-11-11.json npm run kb:validate -- --strict` → valid, 0 warnings. `kb/risk-kb.json` unchanged (`kb:impact` → No differences). No `data/raw` file staged.

---

## 15 — Dockerfile (2026-11-11)
- **Prompt:**
  > Add a multi-stage backend/Dockerfile to run the backend as a Fargate service. The build context is the repo root so kb/ can be copied in.
  > - Stage 1 (build): node:24-alpine, npm ci, npm run build.
  > - Stage 2 (runtime): node:24-alpine, production dependencies only, the compiled dist/, kb/risk-kb.json copied to /app/kb with KB_PATH pointing at it, PORT 3000, run as the non-root node user, a HEALTHCHECK on GET /health, and CMD ["node", "dist/server.js"].
  > - Add a .dockerignore at the repo root (node_modules, dist, .angular, .git).
  > - Tell me the build and run commands.
- **Output:** a two-stage `backend/Dockerfile` (`npm ci` + `tsc -p tsconfig.build.json`, then `npm ci --omit=dev` + `dist/` + the KB). The HEALTHCHECK uses Node's built-in `fetch`, so no curl/wget is needed. `.dockerignore` also excludes `data/raw`, `reports`, `frontend`, coverage and `.env*`.
- **Accepted / changed / rejected:** Accepted as is.
- **Why:** The multi-stage build keeps the compiler and dev dependencies out of the runtime image, it runs as the non-root `node` user, and the KB is copied in as data with `KB_PATH`, so rules can change without rebuilding the code. `/health` returns the KB version, as the brief's bonus asks.
- **Verified (Docker Desktop 29.9.3):** `docker build -f backend/Dockerfile -t policyquote-api .` → 257 MB image. `docker run -p 3001:3000` (3000 was taken by the dev server) → `/health` `{status: ok, kbVersion: 1.1.1}`, a quote STANDARD £360/£30, `whoami` → `node`, `KB_PATH=/app/kb/risk-kb.json`, Docker health → `healthy`. Container removed afterwards.

---

## 16 — CI (2026-11-11)
- **Prompt:**
  > Add .github/workflows/ci.yml: on push and pull_request, Node 24, two jobs. backend (working-directory backend): npm ci, npm run typecheck, npm run kb:validate, npm test. frontend (working-directory frontend): npm ci, npm run build. Cache npm per folder.
  > Also run npm run kb:validate -- --strict in the backend job. On pull requests, run the impact preview against the target branch's KB and append its --markdown output to $GITHUB_STEP_SUMMARY, so every KB change shows its impact on the pull request.
- **Output:**
  - Two jobs on Node 24 with `actions/checkout@v5` / `setup-node@v5`, npm cache keyed per folder's lock file, `permissions: contents: read`.
  - Backend: `kb:validate -- --strict` (covers the plain validation too) and, on PRs, `kb:impact --base <target branch KB> --markdown >> $GITHUB_STEP_SUMMARY` (`fetch-depth: 0`; the base ref is passed via `env`, not interpolated into the script).
  - If the target branch's KB can't be compared (e.g. a pre-`schemaVersion` KB), the summary gets a note rather than failing the job, because the candidate KB is already gated by the strict validation step.
  - Addition: the frontend job also runs the Vitest suite (`npm test -- --watch=false`).
- **Accepted / changed / rejected:** Accepted, including the frontend test step it added.
- **Why:** CI runs the same checks as my machine, and strict KB validation stops a bad KB before it is merged. The impact preview on pull requests shows reviewers the business effect of each rule change.
- **Verified locally (GitHub Actions itself not run yet):** the YAML parses (PyYAML) with the expected steps; the PR step simulated with bash → "No differences" for an unchanged KB, a Markdown impact table with the flood proposal as candidate, and the fallback note when the base is the first commit's KB.

---

## 17 — README, SOLUTION and the log (2026-11-11)
- **Prompt:** the guide's Prompt 11 for a root README.md (under 120 lines: overview, prerequisites, run in 4 commands, the KB and an "add a factor" example, tests and KB tools, example request/response, structure, agent setup, Docker), plus the guide's notes for this step: write SOLUTION.md yourself (≤ 300 words), and check that AGENT_LOG has an entry for every step and records the real rejections.
- **Output:**
  - README.md, 110 lines. The example response is a real response captured from the running API, not hand-written. It documents `kb:validate` (+ linter), `kb:impact` and `kb:suggest-flood`, the hook, and Docker (tested).
  - AGENT_LOG: added entries for 01–03 (setup) and 09 (rehearsal, marked as not yet run, not invented); replaced the empty template block with 17 and 18.
  - SOLUTION.md: not written by the agent. It read "write SOLUTION.md yourself" as meant for me, and left a 245-word draft outside the repo instead.
- **Accepted / changed / rejected:** Accepted the README. SOLUTION.md was written later (entry 19).
- **Why:** The README gets both services running in 4 commands and shows a real captured response, not a hand-written one.
- **Verified:** README is 110 lines; its links resolve (`kb/README.md#data-sources-and-proposals`).

---

## 18 — Final self-check (2026-11-11)
- **Prompt:** fresh clone, install, test, start both services, get a quote; the three searches must be empty; the checklist.
- **Output (run by the agent; the clone was made from the local repo, not GitHub, because the latest commits weren't pushed yet):**
  - Searches: `: any` / `as any` / `<any>` in `backend/src` + `frontend/src/app` → none; `Subject` in `frontend/src` → none; `switch (` in `backend/src` → none.
  - Fresh clone (109 tracked files, no `data/raw`): `npm --prefix backend install` + `npm --prefix frontend install` OK; `npm --prefix backend test` → 9 suites, 155 tests passed; `kb:validate` → valid, 0 warnings, 1 note; `kb:impact` → "No differences".
  - Both services started with `npm --prefix … start`: `/health` via the 4200 proxy → `{status: ok, kbVersion: 1.1.1}`; the four example profiles → ELEVATED £45, STANDARD £30, HIGH_RISK £66, STANDARD £30; Chrome shows the cards and headline.
- **Still open after this step:** step 09 and the hook live check (entries 09 and Extra A); SOLUTION.md and the "Accepted / Why" write-up (entry 19); a fresh clone from GitHub after pushing.
- **Accepted / changed / rejected:** Accepted. I repeat the fresh clone from GitHub after pushing.
- **Why:** A clean clone is how the reviewers will meet the project, so it's the check that matters most.

---

## 19 — Final review and write-up with Claude (chat) (2026-11-11)
- **Prompt:** "review all … and make sure it's ready for submission", then "can you help me to complete these tasks?", then a proofread of this log for unclear, inconsistent or out-of-date lines.
- **Output:**
  - A review against the brief, on a copy of the repo: backend typecheck clean, strict KB validation clean, 155 tests passed, build OK; frontend build OK, 23 tests passed; the live API gave the expected bands; the hook script let a valid KB through and blocked a broken one (exit 2).
  - A cold page load in a headless browser: no console errors or warnings (only the dev server's info messages) and no failed requests; the example cards and a normal quote loaded.
  - Still open at that point: SOLUTION.md, the "Accepted / Why" write-up, step 09, and the claims label, which had lost the brief's "in last 5 years" (entry 12).
  - Drafts, from this log and the build session's notes: the "Accepted / Why" lines for entries 01–18 (all except 09) and SOLUTION.md.
  - Proofread: one voice throughout ("I" is me, "the agent" is Claude Code), "the guide" defined in entry 00, and open items pointed to where they were closed. No entry was removed.
- **Accepted / changed / rejected:**
  - Changed: the claims label now reads "Claims in the last 5 years" (it was "Previous claims"), reversing the step 12 decision.
  - The drafts only write up decisions made during the build. Before committing I checked every drafted line, and SOLUTION.md, against what I actually did.
- **Why:** the brief defines the field as the "number of previous claims in last 5 years", so the label has to say it.
- **Verified:** after the label fix, `ng build` clean and `ng test --watch=false` → 23 passed (on the copy). SOLUTION.md is under 300 words: `(Get-Content SOLUTION.md | Measure-Object -Word).Words`.
