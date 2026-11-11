# AGENT_LOG

**Agent:** Claude Code. **Project instructions:** [`CLAUDE.md`](CLAUDE.md). **Project skill:** [`.claude/skills/add-risk-factor/SKILL.md`](.claude/skills/add-risk-factor/SKILL.md).

Each entry follows: prompt → output → what I accepted, changed or rejected → why → how I verified it.
Steps 04–08 ran in one continuous Claude Code session (no `/clear` between them), with the agent re-reading `CLAUDE.md` and the files at each step. Step 09 (the skill rehearsal) runs in a fresh context (`/clear`), because it tests that the skill works from the files alone.

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
  > 5. Create kb/README.md documenting: every top-level field; how a band is chosen (inclusive min/max); the factor shape; each leaf operator and the keys it uses […]; the all / any / not combinators; and perOccurrence […]. End with a short "How to add a factor" example using a postcode rule.
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

## 01 — <short title> (<date, time>)
- **Prompt:**
  > _paste the exact prompt_
- **Output:** _files created or changed, plus a 1–3 line summary of the approach_
- **Accepted / changed / rejected:** _what you kept, what you edited by hand, what you told the agent to redo_
- **Why:** _your reasoning: the rule it broke, the bug you spotted, the simpler design you preferred_
- **Verified:** _commands run and their result (e.g. `npm test`: 24 passed)_

<!-- Copy the block above for each step. Write it right after the step while it's fresh. Never invent entries. -->
