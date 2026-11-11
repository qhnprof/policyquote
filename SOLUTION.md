# SOLUTION

## Architecture
An Angular 22 standalone app (signals, zoneless) posts to `POST /policy/quote`. The Lambda-style `handler(event, context)` only parses and validates the request (Zod). Scoring is pure: `scoreQuote(input, kb)`. The KB is read at runtime from `kb/risk-kb.json` (or `KB_PATH`), validated and cached per cold start. A `node:http` adapter serves it for `npm start` and Docker, with `GET /health`.

## Knowledge base design
Factors are data; operators are the vocabulary. A condition is a leaf (`field`, `operator`, value) or an `all`/`any`/`not` of conditions, so "Flat AND over £500k" needs no engine change. Operators are a typed map, not a `switch`; a missing implementation fails to compile. The brief's example KB lacked band multipliers, so each band holds its `multiplier` and `summary`; no pricing number lives in code. `perOccurrence` means points × the field's value. The KB is checked at load (unknown fields or operators, duplicate ids, band gaps or overlaps), and every quote returns its `kbVersion`. For a breaking KB change I would bump `schemaVersion`, deploy an engine that reads both shapes, then publish the new KB through AppConfig with validation and a gradual rollout.

## Agent setup
`CLAUDE.md` lists the rules an agent is most likely to break (scoring numbers in code, factor-specific `if`s, `any`, Subjects) plus a file map, so it reads only what a task needs. The `add-risk-factor` skill makes the most common change repeatable: KB entry, test, version bump, validation, impact preview. A hook re-checks the KB after every KB edit, so the agent sees mistakes at once.

## With more time
Declare the request fields in the KB and generate the Zod schema and the form from them, so a factor on a new input is also a KB-only change.
