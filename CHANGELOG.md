# Changelog

## Unreleased

- Add a Related Work section to the README acknowledging Netlify's AXIS as an independent related effort, and align README naming with the `crooked-pattern` package (CLI command stays `ars`, MCP bin stays `ars-mcp`).
- Rename the package to `crooked-pattern` (the score stays ARS; bins stay `ars`/`ars-mcp`) and freeze v0.1 launch scope in `docs/scope-freeze-v0.1.md`: npm identity (`crooked-pattern` + planned `crooked-pattern-mcp` wrapper), a machine-checkable Rule-of-Two v0.1 definition over MCP tool schemas, stdio-default/SSE-opt-in transport scope, and the binding `docs/release-checklist-v0.1.md`.
- Raise test coverage above all configured thresholds (branch coverage 71% → 86%) with wire-check branch tests against a signal-rich fixture server and validation error-path tests; thresholds unchanged.
- Package the scanner as an MCP stdio server (`ars-mcp`) exposing `scan_site` via the official MCP TypeScript SDK; `mcp/server-card.json` is now the real authored contract, kept consistent with the runtime by tests, and source/wire reconciliation is exercised against the live surface. CLI and MCP share one scan pipeline.
- Add OSV, Socket, and Semgrep adapter output contracts behind explicit extension points with CLI report ingestion; absent adapters keep the new supply-chain checks `unknown` with `adapter_missing` metadata instead of fabricating results.
- Fix a CLI test flake by building `dist/` once per vitest run in a global setup instead of racing parallel `pnpm build` calls from separate test suites.
- Parse pnpm, npm, yarn, and bun lockfiles into a direct/transitive dependency inventory as source evidence, strengthening lockfile pinning and slopsquatting checks; unparseable lockfiles fall back honestly to filename presence.
- Compute the maturity tier from explicit registry-traceable T1-T5 gates instead of category-score bands, emit per-gate outcomes in `summary.gates`, and surface gate detail in report and diff output. Behavioral change within `ars.v1`: tiers can be lower than the retired band heuristic on partially measured sites; artifacts without `summary.gates` remain valid.
- Validate generated ARS artifacts and `ars diff` inputs before writing or comparing JSON.
- Add parser-backed HTML and JSON-LD evidence for structured wire checks.
- Add a central rubric registry for check metadata, evidence labels, weights, and maturity gate membership.
- Add optional rendered DOM wire evidence for browser-observed text, accessibility summaries, field labels, and layout shift metrics.
- Fix Biome/Ultracite linting to use a local Biome dependency instead of `npx`, removing npm config warnings from the verify gate.
- Scaffold Agentic Readiness Score CLI with deterministic source and wire checks, mode-aware scoring, reconciliation, integration fixtures, and local execution skills.
