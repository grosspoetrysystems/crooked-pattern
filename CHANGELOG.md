# Changelog

## 0.1.2 — 2026-07-16

- Normalize `bin` paths (`dist/cli.js` instead of `./dist/cli.js`) to stop npm's publish-time "auto-corrected" warning. No behavior change — the commands are unchanged.
- Publish the `@grosspoetrysystems/crooked-pattern-mcp` wrapper at version parity with the main package (a partial CI publish had left it at 0.1.0).
- Release workflow: publish steps are now idempotent (an already-published version is skipped), so a partial-failure re-run completes the release instead of erroring.

## 0.1.1 — 2026-07-15

- Add a `crooked-pattern` bin alias (alongside `ars`) so `npx @grosspoetrysystems/crooked-pattern scan …` resolves an executable. Without it, npx cannot pick a bin on a multi-bin scoped package and errors with "could not determine executable to run"; the documented quickstart now works as written. `ars` remains the primary command; `ars-mcp` is unchanged.

## 0.1.0 — 2026-07-15

Initial public release, published as `@grosspoetrysystems/crooked-pattern` (CLI, command `ars`) and `@grosspoetrysystems/crooked-pattern-mcp` (MCP server, command `ars-mcp`).

**Scoring engine.** Deterministic, offline-by-default Agentic Readiness Score (0–100) and T0–T5 maturity tier. A rubric registry is the single source of truth for check identity, weights, evidence labels, and maturity-gate membership; the tier is unlocked by explicit gate requirements traceable to registry check IDs, not category-score bands. The honesty contract holds throughout: absent evidence reports as `unknown` and is never fabricated into a pass or fail. Emitted `ars.json` artifacts are validated before writing and are diffable.

**Source pass.** Lockfile parsing into a direct/transitive dependency inventory (pnpm/npm/yarn/bun; `bun.lockb` detected but not parsed), release-age cooldowns, deterministic CI installs, SCA gates, provenance/signing, SBOM presence, slopsquatting flags across the full inventory, non-Node ecosystem presence detection (python/go/rust/ruby/php/jvm/dotnet), and authored MCP/OpenAPI tool detection. Security scanners are integrated as evidence ingestion, not executed tools: `source.osv_vulnerabilities`, `source.socket_alerts`, and `source.semgrep_findings` accept contract JSON or raw scanner output (`osv-scanner --format json`, `semgrep --json`, Socket facts JSON); absent adapters stay `unknown`.

**Wire pass.** Robots/sitemap/llms.txt, structured metadata (JSON-LD, Open Graph), content legibility, MCP server cards, OpenAPI/OAuth discovery, AGENTS.md, and accessibility semantics — with optional rendered-DOM evidence via an opt-in Playwright adapter. Well-known endpoints only count when their content is plausible for the format (SPA catch-all rewrites do not fabricate passes); an unreachable origin is an operational error, not a scored result. `wire.rule_of_two` implements a machine-checkable Rule-of-Two / lethal-trifecta predicate over declared MCP tool schemas using a versioned classifier lexicon (screening signal over the declared surface, not a safety verdict).

**Interfaces.** A CLI (`ars scan`, `ars diff`) and an MCP server exposing `scan_site` (structured output includes the score summary, top recommendations, and the requirements blocking the next tier) share one scan pipeline, so scores cannot drift between entry points. The MCP server speaks stdio by default; an HTTP/SSE transport is opt-in behind `--transport sse` (`--port`, default 3339, loopback bind) and is never enabled implicitly. `ars diff` supports `--fail-on score-drop,tier-drop,gate-regression` for CI regression gating against a committed baseline.

**Reports.** The markdown report explains the exposure multiplier inline, names the gate blocking the next tier, renders unmeasured safety as `unassessed` and unknown checks as `–`, and collapses heuristic-confidence caveats into one line.
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
