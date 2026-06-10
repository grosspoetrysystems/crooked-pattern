# ARS Orchestration Hook

Use the `ars` CLI as the deterministic source of truth.

1. Run `ars scan --source <repo>` for source posture.
2. Run `ars scan --url <url>` for wire posture, or include both arguments for reconciliation.
3. Treat LLM-judged checks as non-deterministic and pin the model version in any future artifact fields.
4. For fix work, change the target site, re-run ARS, and include `ars diff before.json after.json`.

Future Phase 3 judgment checks: alt-text quality, answer front-loading, citability, schema-visible-content agreement, and exposed-tool description clarity.
