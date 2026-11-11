# AGENT_LOG

**Agent:** Claude Code. **Project instructions:** [`CLAUDE.md`](CLAUDE.md). **Project skill:** [`.claude/skills/add-risk-factor/SKILL.md`](.claude/skills/add-risk-factor/SKILL.md).

Each entry follows: prompt → output → what I accepted, changed or rejected → why → how I verified it.
I started a fresh context (`/clear`) at the beginning of each step, so the agent worked from `CLAUDE.md` and the files rather than old chat history.

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

## 01 — <short title> (<date, time>)
- **Prompt:**
  > _paste the exact prompt_
- **Output:** _files created or changed, plus a 1–3 line summary of the approach_
- **Accepted / changed / rejected:** _what you kept, what you edited by hand, what you told the agent to redo_
- **Why:** _your reasoning: the rule it broke, the bug you spotted, the simpler design you preferred_
- **Verified:** _commands run and their result (e.g. `npm test`: 24 passed)_

<!-- Copy the block above for each step. Write it right after the step while it's fresh. Never invent entries. -->
