# PolicyQuote: agent instructions

Home-insurance quoting app. An Angular frontend calls a Node Lambda-style backend, which scores risk using a JSON knowledge base (KB).
**The KB is the product.** Business rules live in data. The engine is a generic interpreter of that data.

## Context (assumptions)
- Built as a technical exercise for **AIG**, assumed to be its UK home-insurance business: amounts in GBP (£), UK terms ("Flat", postcode).
- Treat it as insurer-grade: every quote must be reproducible and auditable (return the KB `version` with each quote), and customer-facing text must be plain and factual, with no marketing claims.
- Use no AIG name, logo or branding in the UI unless I supply the assets. Keep the product name "PolicyQuote".

## Map (read only what the task needs)
- `kb/risk-kb.json`: the knowledge base (base premium, coverage load factor, risk bands with multipliers and summaries, factors).
- `kb/README.md`: schema and operator reference. `kb.schema.ts` must match it.
- `backend/src/handler.ts`: Lambda entry `handler(event, context)`. HTTP shape + validation only.
- `backend/src/server.ts`: local HTTP adapter used by `npm start` (also serves `GET /health`).
- `backend/src/types.ts`: `QuoteResult` (the response shape).
- `backend/src/validation/quote-request.schema.ts`: Zod request schema.
- `backend/src/kb/`: `kb.schema.ts` (Zod schema + inferred types), `kb-loader.ts` (read, validate, cache), `validate-kb.ts` (CLI).
- `backend/src/engine/`: `operators.ts` (operator registry), `evaluate-condition.ts` (leaf + all/any/not), `score-quote.ts` (pure scoring + pricing).
- `backend/test/`: Jest tests. `backend/test/helpers.ts`: `loadRealKb()`, `loadFixtureKb(name)`, `restoreRealKb()`. `backend/test/fixtures/`: small KBs used by tests.
- `frontend/src/app/`: Angular standalone app (`models/`, `services/`, `components/`).

## Commands
- Backend (`cd backend`): `npm test` · `npm run typecheck` · `npm run kb:validate` · `npm start` (port 3000, restarts when the KB changes)
- Frontend (`cd frontend`): `npm start` (port 4200, proxies `/policy` to 3000) · `npm run build`

## Hard rules
1. **No scoring data in code.** No points, thresholds, multipliers, band names, factor ids or premium values in `backend/src`. They belong in `kb/risk-kb.json`. (Core requirement: any rule change must be a KB-only change.)
2. **No factor-specific logic.** No `if`/`switch` on factor ids or field names in the engine. A new rule means a new KB entry. A new *kind* of comparison means a new operator in the registry, plus a unit test.
3. **Read the KB at runtime** through `kb-loader.ts`. Never `import` the JSON, because that bakes it into the build. (`resolveJsonModule` is deliberately off, so the compiler rejects such an import; don't turn it back on.)
4. **No `any`**, no `as unknown as`, no non-null `!` to silence the compiler. KB and request types come from Zod via `z.infer`.
5. **Angular:** signals for all UI state (`signal`, `computed`, `effect`). No `BehaviorSubject`/`Subject` for local state. Standalone components only. Use `@if`/`@for`. No UI component libraries; hand-written CSS only.
6. **Backend is deterministic and offline.** No outbound network or LLM calls (serving HTTP in `server.ts` is fine). Don't add runtime dependencies without asking me.
7. **Every KB or engine change ships with a Jest test.** Run `npm run typecheck`, `npm test` and `npm run kb:validate` and show me the output. Never report done while anything is red.

## How to work
- Before engine, schema or cross-layer changes (backend + frontend), propose a short plan and wait for my approval. Routine KB edits that follow the `add-risk-factor` skill (KB entry + its test) don't need one.
- Keep diffs small and focused. Don't refactor code outside the task.
- Engine code is pure (no I/O). I/O lives only in `kb-loader.ts`, `handler.ts` and `server.ts`.
- If a requirement is ambiguous, state your assumption in your reply instead of guessing silently.
- Finish every task with: files changed, commands run with results, and any assumptions.

## KB quick reference
- Factor: `{ id, description, condition, points, perOccurrence? }`. `description` is customer-facing (shown in the UI).
- Condition: a leaf `{ field, operator, value | values | min+max }`, or a combinator `{ all: [...] }`, `{ any: [...] }`, `{ not: {...} }`.
- `perOccurrence: true` means points × the numeric value of the condition's field (leaf conditions only).
- Band: `{ min, max, multiplier, summary }`. Bounds are inclusive integers (scores are integer sums); bands start at 0 with no gaps or overlaps. A score above the top band's `max` goes in the top band (the band with the highest `min`, never chosen by name). `summary` is customer-facing.
- Pricing: `annualPremium = basePremium × band.multiplier × coverageLoadFactor`, rounded to 2 dp; `monthlyPremium = annualPremium / 12`, rounded to 2 dp.
- Top level also has `schemaVersion` (file shape, currently `1`) and `version` (rules, returned as `kbVersion`).
- To add, change or remove a factor, follow the `add-risk-factor` skill.
