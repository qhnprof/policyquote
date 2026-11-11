# Risk knowledge base (`risk-kb.json`)

The knowledge base (KB) holds every scoring and pricing rule. The backend engine is a generic interpreter of this file, so changing a rule means editing this file and nothing else. The backend reads the KB at runtime and validates it against `backend/src/kb/kb.schema.ts`; an invalid KB fails fast with every issue listed (`npm run kb:validate`).

## Top-level fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | integer | Version of this file's *shape*. The backend rejects versions it doesn't support (currently only `1`). |
| `version` | semver string | Version of the *rules*. Returned with every quote as `kbVersion`, so any quote can be traced to the rules that produced it. |
| `basePremium` | number (GBP) | Annual premium before any loading. |
| `coverageLoadFactor` | number | Constant loading applied to every quote. |
| `riskBands` | object | Band name → band. See below. |
| `factors` | array | Risk factors, evaluated in order. See below. |

## Risk bands

```json
"ELEVATED": { "min": 26, "max": 60, "multiplier": 1.5, "summary": "Some of your details raise the risk above our standard range." }
```

- `min` / `max`: inclusive integer bounds. A quote's band is the one where `min ≤ riskScore ≤ max`.
- Bands start at 0 and are contiguous: no gaps, no overlaps. Scores are integer sums, so `0–25` followed by `26–60` covers every score.
- A score above the highest band's `max` falls in the highest band.
- `multiplier`: the band's premium loading.
- `summary`: one plain-English sentence shown to the customer.

**Pricing:** `annualPremium = basePremium × multiplier × coverageLoadFactor`, rounded to 2 dp. `monthlyPremium = annualPremium / 12`, rounded to 2 dp.

## Factors

```json
{
  "id": "property_type_flat",
  "description": "Flat — higher shared risk",
  "condition": { "field": "propertyType", "operator": "eq", "value": "Flat" },
  "points": 10,
  "perOccurrence": false
}
```

| Key | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Unique, snake_case. |
| `description` | yes | Customer-facing; listed in the quote when the factor applies. |
| `condition` | yes | When the factor applies (leaf or combinator, below). |
| `points` | yes | Non-negative integer added to `riskScore`, so every score is ≥ 0 and lands in a band. |
| `perOccurrence` | no | If `true`, points × the numeric value of the condition's field (e.g. 15 per previous claim). Leaf conditions only. |
| `group` | no | snake_case name. Factors in the same group are either/or: exactly one should apply to a given input (e.g. `previous_claims` for "1–2 claims" and "3 or more"). The linter warns when two of them apply at once (overlap) or when a value between covered values is covered by none (gap). |

`riskScore` is the sum of the points of every factor whose condition applies.

### Linting

`npm run kb:validate` checks the schema, then lints the rules by probing them: it builds test values for each request field from the thresholds, values and prefixes the rules use (each threshold and its neighbours), plus the request limits (e.g. age 18–120), and evaluates every factor on every combination with the real engine. It reports:

| Finding | Level | Meaning |
| --- | --- | --- |
| overlap | warning | Two factors of the same `group` apply to the same input. |
| gap | warning | A value no factor in a `group` covers, between values the group does cover. |
| dead rule | warning | A factor that never applies within the request limits (e.g. `age > 130`). |
| unreachable band | warning | A band no probed input reaches. |
| stacking | info | Factor A only ever applies together with factor B, so their points add up (expected for `flat_high_value` + `property_type_flat`). |

Warnings fail the command only with `--strict` (used by CI and the agent's post-edit hook); info notes never fail it. Probing tests the boundaries the rules mention: a strong check, not a proof.

## Conditions

### Leaf conditions

A leaf compares one request field with fixed values: `{ "field": ..., "operator": ..., <operator keys> }`. Each operator requires exactly its own keys.

`field` must be a request field (`customerName`, `age`, `propertyType`, `propertyValue`, `postcode`, `previousClaims`) or a derived postcode field:

| Derived field | Meaning | `EX4 1AA` | `E1 6AN` |
| --- | --- | --- | --- |
| `postcodeArea` | the leading letters | `EX` | `E` |
| `postcodeDistrict` | the outward code (before the space) | `EX4` | `E1` |

The engine derives them from the normalised postcode (uppercase, single space) in one place (`backend/src/validation/postcode.ts`); they are not form fields or part of the API request. Prefer them to `starts_with` on `postcode` for area rules: a prefix `E` also matches `EX4 1AA`, and `B1` also matches `B10 0AA`, while `postcodeArea in ["E"]` and `postcodeDistrict in ["B1"]` match exactly.

| Operator | Keys | True when |
| --- | --- | --- |
| `eq` | `value` | field equals `value` |
| `neq` | `value` | field does not equal `value` |
| `in` | `values` | field equals any of `values` |
| `not_in` | `values` | field equals none of `values` |
| `gt` | `value` | field > `value` |
| `gte` | `value` | field ≥ `value` |
| `lt` | `value` | field < `value` |
| `lte` | `value` | field ≤ `value` |
| `between` | `min`, `max` | `min` ≤ field ≤ `max` (inclusive) |
| `outside_range` | `min`, `max` | field < `min` or field > `max` |
| `starts_with` | `values` | field starts with any of `values`, ignoring case |

Numeric operators (`gt`, `gte`, `lt`, `lte`, `between`, `outside_range`) are false for non-numeric values; there is no type coercion.

### Combinators

Combine conditions to any depth:

| Shape | True when |
| --- | --- |
| `{ "all": [ ... ] }` | every condition is true |
| `{ "any": [ ... ] }` | at least one condition is true |
| `{ "not": { ... } }` | the condition is false |

Example (`flat_high_value`):

```json
"condition": { "all": [
  { "field": "propertyType", "operator": "eq", "value": "Flat" },
  { "field": "propertyValue", "operator": "gt", "value": 500000 }
] }
```

## How to add a factor

Example: add 10 points for coastal postcodes in Cornwall (TR) and Torbay (TQ).

1. Append to `factors`:

   ```json
   {
     "id": "coastal_postcode",
     "description": "Coastal postcode area — higher storm exposure",
     "condition": { "field": "postcodeArea", "operator": "in", "values": ["TR", "TQ"] },
     "points": 10
   }
   ```

2. Bump `version` (minor for an added factor).
3. Add a Jest test with an input that triggers the factor and one that doesn't.
4. In `backend/`, run `npm run kb:validate`, `npm run typecheck` and `npm test`.

No backend code changes. Only a new *kind* of comparison needs a new operator in the engine.

## Data sources and proposals

Open data is used **offline, at authoring time only**, to propose KB changes. The backend (the Lambda) never reads it.

### Flood risk: Environment Agency, "Risk of Flooding from Rivers and Sea – Postcodes in Areas at Risk"

- Source: [data.gov.uk](https://www.data.gov.uk/dataset/5a98b0a1-2741-4b2f-a51b-5b42f13219f2/risk-of-flooding-from-rivers-and-sea-postcodes-in-areas-at-risk2), revision 2026-11-03, England only. Licence: [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
- Attribution:

  > © Environment Agency copyright and/or database right 2025. All rights reserved.
  > Some features of this map are based on digital spatial data from the Centre for Ecology & Hydrology, © NERC (CEH).
  > © Crown Copyright and Database Rights 2025 OS AC0000807064.
  > This product is produced in part from PAF® and Multiple Residence Data, the copyright in which is owned by Royal Mail Group Limited and/or Royal Mail Group plc. All rights reserved. Licence number AC0000807064

- Pipeline: unzip the download into `data/raw/flood/` (git-ignored) → `npm run flood:aggregate` writes `data/flood-districts.csv` (one row per postcode district: residential properties, share at high and medium risk; committed) → `npm run kb:suggest-flood` applies the tiers in `data/flood-suggestion-config.json` and writes `kb/proposals/flood-<date>.json` plus a note with source, date, attribution, tiers, caveats and the `kb:impact` summary.
- A proposal is never applied automatically: a person reviews it and copies the factors into `risk-kb.json` as a normal change (tests, `kb:validate -- --strict`, `kb:impact`). Source details and caveats live in `data/flood-source.json`.
