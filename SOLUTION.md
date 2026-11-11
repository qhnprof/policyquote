# SOLUTION

<!-- Max 300 words in total. Write it yourself, about what you actually built. Delete these comments.
     Check the count in PowerShell: (Get-Content SOLUTION.md | Measure-Object -Word).Words -->

## Architecture (~80 words)
<!-- Angular standalone + signals → POST /policy/quote → Lambda-style handler (validation, HTTP shape)
     → pure scoreQuote(input, kb). KB read at runtime from kb/risk-kb.json, validated with Zod, cached
     per cold start. Local node:http adapter for npm start, reused by the Docker image (/health). -->

## Knowledge base design (~110 words)
<!-- Factors = data, operators = vocabulary. Recursive conditions (all/any/not) give compound rules
     without engine changes. Band multipliers + summaries moved into the KB (the brief's example left
     them out, and hardcoding them would break the "no scoring values in code" rule). Fail-fast KB validation
     (unknown operator/field, overlapping bands, duplicate ids). perOccurrence = points × field value.
     version + schemaVersion returned in the response for auditability. -->

## Agent setup (~70 words)
<!-- CLAUDE.md encodes the invariants an agent is most likely to break (hardcoding, any, switch,
     BehaviorSubject) plus a file map so it reads only what it needs. The add-risk-factor skill makes
     the most common change repeatable: KB entry → test → validate. Fresh context per step. Name one
     piece of agent output you rejected and why. -->

## With more time (~40 words)
<!-- Pick ONE, e.g.: KB served from AWS AppConfig with schema validation + canary rollout and the
     kbVersion stored on every quote; or smoother pricing (premium currently jumps only at band
     boundaries); or generating the request schema/form from KB-declared inputs. -->
