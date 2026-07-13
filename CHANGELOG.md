# Changelog

## Unreleased

- Compute the maturity tier from explicit registry-traceable T1-T5 gates instead of category-score bands, emit per-gate outcomes in `summary.gates`, and surface gate detail in report and diff output. Behavioral change within `ars.v1`: tiers can be lower than the retired band heuristic on partially measured sites; artifacts without `summary.gates` remain valid.
- Validate generated ARS artifacts and `ars diff` inputs before writing or comparing JSON.
- Add parser-backed HTML and JSON-LD evidence for structured wire checks.
- Add a central rubric registry for check metadata, evidence labels, weights, and maturity gate membership.
- Add optional rendered DOM wire evidence for browser-observed text, accessibility summaries, field labels, and layout shift metrics.
- Fix Biome/Ultracite linting to use a local Biome dependency instead of `npx`, removing npm config warnings from the verify gate.
- Scaffold Agentic Readiness Score CLI with deterministic source and wire checks, mode-aware scoring, reconciliation, integration fixtures, and local execution skills.
