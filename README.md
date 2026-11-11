# PolicyQuote

A home-insurance quoting app. An Angular 22 frontend (standalone components, signals, zoneless) calls a Node Lambda-style backend, which scores risk with a JSON **knowledge base (KB)**: every point, threshold, band, multiplier and price lives in [`kb/risk-kb.json`](kb/risk-kb.json), and the engine is a generic interpreter of it. Changing a rule is a KB-only change: no code, validated and tested.

## Prerequisites

- Node.js 24 LTS (24.15 or later) and npm.
- Optional: Docker, for the container image.

## Run it (from the repo root)

```powershell
npm --prefix backend install
npm --prefix frontend install
npm --prefix backend start     # terminal 1: API on http://localhost:3000 (restarts when the KB changes)
npm --prefix frontend start    # terminal 2: UI on http://localhost:4200 (proxies /policy and /health to 3000)
```

Then open <http://localhost:4200>.

## The knowledge base

`kb/risk-kb.json` is a first-class file, read at runtime and validated against a Zod schema. [`kb/README.md`](kb/README.md) documents every field and operator. Adding a factor is a KB entry plus a test, for example:

```json
{
  "id": "coastal_postcode",
  "description": "Coastal postcode area — higher storm exposure",
  "condition": { "field": "postcodeArea", "operator": "in", "values": ["TR", "TQ"] },
  "points": 10
}
```

Conditions can combine with `all` / `any` / `not`; `postcodeArea` and `postcodeDistrict` are derived from the postcode so area rules match exactly.

## Tests and KB tools (`cd backend`)

| Command | What it does |
| --- | --- |
| `npm test` | Jest: schemas, operators, scoring (all three bands), handler, linter, impact, flood tools |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run kb:validate` | Schema check, then the linter (overlaps, gaps, dead rules, unreachable bands; `-- --strict` fails on warnings) |
| `npm run kb:impact` | Impact preview: committed KB vs working copy on a 1,000-customer synthetic book (`--markdown` for CI) |
| `npm run kb:suggest-flood` | Turns Environment Agency flood data into a reviewed KB proposal in `kb/proposals/` (see `kb/README.md`) |

Frontend: `npm --prefix frontend test -- --watch=false` (Vitest) and `npm --prefix frontend run build`.

## Example request and response

`POST /policy/quote`

```json
{ "customerName": "Alex Morgan", "age": 22, "propertyType": "Flat", "propertyValue": 250000, "postcode": "m1 1ae", "previousClaims": 0 }
```

```json
{
  "monthlyPremium": 45,
  "annualPremium": 540,
  "riskBand": "ELEVATED",
  "riskScore": 30,
  "riskSummary": "Some of your details raise the risk above our standard range. Factors: Under 25 or over 75 — higher risk profile; Flat — higher shared risk.",
  "coverageDetails": { "propertyType": "Flat", "propertyValue": 250000, "basePremium": 300, "coverageLoadFactor": 1.2, "riskMultiplier": 1.5 },
  "appliedFactors": [
    { "id": "age_young_elderly", "description": "Under 25 or over 75 — higher risk profile", "points": 20 },
    { "id": "property_type_flat", "description": "Flat — higher shared risk", "points": 10 }
  ],
  "kbVersion": "1.1.1"
}
```

Invalid input returns `400 { error: "VALIDATION_ERROR", issues: [{ path, message }] }`; `GET /health` returns `{ status, kbVersion }`.

## Project structure

```text
kb/                     risk-kb.json (the rules), README.md (schema), proposals/ (generated, for review)
backend/src/
  handler.ts            Lambda entry: HTTP shape + validation
  server.ts             local node:http adapter (npm start, Docker)
  validation/           Zod request schema, derived postcode fields
  kb/                   KB schema, loader (read + validate + cache), validate CLI, linter
  engine/               operator registry, recursive condition evaluator, scoring + pricing
  analysis/             synthetic book, impact preview, flood aggregation + suggestions
backend/test/           Jest tests and fixture KBs
frontend/src/app/       quote page, result, risk-band badge, example profiles, QuoteService
data/                   small derived open data (raw downloads in data/raw/ are git-ignored)
.claude/                agent skill and hook
```

## Agent setup (Claude Code)

- [`CLAUDE.md`](CLAUDE.md): project rules (no scoring data in code, no factor-specific logic, no `any`, signals only, tests with every KB change) and a file map.
- [`.claude/skills/add-risk-factor`](.claude/skills/add-risk-factor/SKILL.md): the repeatable "add, change or remove a factor" workflow (KB entry → tests → validate → impact preview).
- [`.claude/settings.json`](.claude/settings.json): a PostToolUse hook runs `kb:validate -- --strict` and the tests after every edit to `kb/risk-kb.json` and feeds failures back to the agent.
- [`AGENT_LOG.md`](AGENT_LOG.md): every step's prompt, output, and what was accepted or rejected.

## Docker

```powershell
docker build -f backend/Dockerfile -t policyquote-api .
docker run --rm -p 3000:3000 policyquote-api
Invoke-RestMethod http://localhost:3000/health
```

Tested with Docker Desktop 29.9.3: the image builds, `/health` and quotes respond, it runs as the non-root `node` user, and the HEALTHCHECK reports healthy. CI (`.github/workflows/ci.yml`) runs typecheck, strict KB validation, tests and the frontend build, and adds the KB impact preview to every pull request.

## Data attribution

Flood proposals use Environment Agency data under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): © Environment Agency copyright and/or database right 2025. All rights reserved. Full attribution (CEH, Ordnance Survey, Royal Mail) in [`kb/README.md`](kb/README.md#data-sources-and-proposals).
