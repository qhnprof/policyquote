---
name: add-risk-factor
description: Add, change or remove a risk factor in the PolicyQuote knowledge base (kb/risk-kb.json), with a Jest test proving it. Use whenever asked to add a risk rule, change a factor's points, or remove a factor.
---

# Add, change or remove a risk factor

**Goal:** the change is a KB-only change, proven by a test. The engine does not change unless a genuinely new kind of comparison (operator) is needed.

## Steps

1. **Read** `kb/README.md` (schema and operators) and `kb/risk-kb.json`. If the README doesn't exist yet, use the KB quick reference in `CLAUDE.md` instead. Don't open engine files unless step 3 applies.

2. **Translate the request into a KB entry:**
   - `id`: snake_case, unique, descriptive (e.g. `flood_zone_postcode`).
   - `description`: plain English and customer-facing. It is shown in the UI as an applied factor.
   - `condition`: use the existing operators. For rules over several fields, combine leaves with `all` / `any` / `not`.
   - `points`: the integer from the request. Set `perOccurrence: true` only if the request says "per claim" or similar, and only on a leaf condition whose field is numeric.
   - `field` must be an existing request field. If the rule needs data the form doesn't collect, **stop and tell me**: that is a request-schema and form change, not a KB change.

3. **Only if no existing operator can express the rule:** propose the new operator (name and exact semantics) and wait for my OK. Then add it to the KB schema and the operator registry, with table-driven unit tests. Never add factor-specific code.

4. **Prove it with tests** in `backend/test/`. Load the **real** `kb/risk-kb.json` through `kb-loader`, not a fixture: the test must prove the shipped KB. (Fixtures are for engine and operator tests.)
   - a positive case: an input that triggers the factor. Assert it appears in `appliedFactors` with the right points, plus the expected `riskScore` and `riskBand`.
   - a negative case: a similar input that does not trigger it.
   - for a removal: an input that used to trigger the factor no longer lists it in `appliedFactors`, and the score drops accordingly.
   - If existing expectations legitimately change, update them and list which ones changed and why.

5. **Bump the KB `version`**:
   - patch: wording only (`description`), no change to any quote.
   - minor: changed `points` or `condition`, or an added factor.
   - major: a removed factor, or a change to bands, `basePremium` or `coverageLoadFactor`.

6. **Verify** in `backend/`: run `npm run kb:validate`, `npm run typecheck` and `npm test`, and show the output.

7. **Report:** the KB diff, the tests added, the command results, and one example input I can type into the UI to see the factor apply.
