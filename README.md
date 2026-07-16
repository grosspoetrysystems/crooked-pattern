# crooked-pattern

**crooked-pattern** computes the **Agentic Readiness Score (ARS)** — a deterministic, offline-friendly 0–100 score and T0–T5 maturity tier telling you how ready your website and repo are for AI agents, and whether you're exposing an unsafe agent surface.

It is a pre-flight lint for the agentic web: it measures the presence, coherence, and safety posture of agent-facing signals (crawlability, structure, MCP/OpenAPI surfaces, supply-chain hygiene). It does not measure agent task outcomes — behavioral evaluation is a separate discipline. Every result is evidence-backed and diffable; unknown is reported as unknown, never fabricated into a pass or a fail.

## Quick start

```sh
npx @grosspoetrysystems/crooked-pattern scan --url https://your-site.com --out ./ars-out
# ARS final 72/100; readiness 84/100 (6 of 6 categories measured); tier T3 Structured
# Wrote ars-out/ars.json and ars-out/ars-report.md
```

Or install globally — the command is `ars`:

```sh
npm i -g @grosspoetrysystems/crooked-pattern
ars scan --source . --url https://your-site.com --out ./ars-out
ars diff baseline/ars.json ars-out/ars.json
```

Outputs:

- `ars.json` — stable machine artifact: every check with registry-backed mode, weight, score, evidence metadata, maturity-gate membership, and caveats. Validated before writing.
- `ars-report.md` — human-readable report: score summary with the exposure multiplier explained, the blocking gate for your next tier, and prioritized recommendations.

## Use it as a CI gate

Scans are deterministic (same input, same artifact — no noise tolerance needed), so regressions gate cleanly:

```sh
ars scan --url https://your-site.com --out current
ars diff baseline/ars.json current/ars.json --fail-on tier-drop,gate-regression,score-drop
```

`--fail-on` exits non-zero when the named regressions occur; commit `baseline/ars.json` and update it deliberately.

## What it measures

- **Source pass** (`--source <path>`): supply-chain hygiene — lockfile pinning with a parsed dependency inventory (pnpm/npm/yarn/bun), release-age cooldowns, deterministic CI installs, SCA gates, provenance/signing, SBOM presence, slopsquatting flags, non-Node ecosystem presence (python/go/rust/ruby/php/jvm/dotnet), and authored MCP/OpenAPI tool definitions.
- **Wire pass** (`--url <url>`): live signals — robots/sitemap/llms.txt, structured metadata (JSON-LD, Open Graph), content legibility, MCP server cards, OpenAPI/OAuth discovery, AGENTS.md, accessibility semantics, and runtime agent-safety posture. Well-known endpoints only count when their content is plausible for the format — SPA catch-all rewrites don't fabricate passes. An unreachable origin is an operational error, not a scored result.
- **Honesty contract**: the rubric registry is the single source of truth for check identity, weights, and gate membership; unknown evidence stays unknown; heuristic-confidence checks are labeled as such in the artifact and collapsed into an explicit caveat in the report.

For how the score is computed and the standard behind each check — and why, say, `llms.txt` is weighted near zero — see **[docs/methodology.md](docs/methodology.md)**.

### Rule-of-Two posture

`wire.rule_of_two` implements a machine-checkable Rule-of-Two / lethal-trifecta predicate over **declared MCP tool schemas**: each declared tool is classified against a versioned lexicon into untrusted-content ingestion, private-data access, and external side effects; the check fails when a single tool spans all three, or the toolset spans all three with no machine-readable session isolation. It classifies the *declared* surface only — a server controls its own descriptions — so treat it as a screening signal, not a safety verdict. Sites with no MCP tool schemas report `unknown` with no score penalty.

## Maturity gates

The maturity tier is unlocked by explicit gate requirements, not category-score bands. Each gate is a set of requirements over registry check IDs; the tier is the highest consecutive passed gate starting at T1, or `T0 Unassessed` when T1 is not passed. Per-gate outcomes are emitted in `ars.json` under `summary.gates` and rendered in the report, so a blocked tier is traceable to the exact requirement and check IDs that blocked it. Category scores remain as descriptive aggregates feeding the ARS numbers; they no longer determine the tier.

| Gate | Requirement | Kind | Check IDs (any one satisfies) |
|---|---|---|---|
| T1 Crawlable | t1.crawl_discovery | any_pass | wire.robots, wire.sitemap |
| T2 Legible | t2.initial_content | any_pass | wire.initial_html_content |
| T2 Legible | t2.clean_extraction | any_pass | wire.clean_dom, wire.token_cost_page_weight |
| T3 Structured | t3.machine_metadata | any_pass | wire.json_ld, wire.open_graph |
| T3 Structured | t3.document_outline | any_pass | wire.single_h1 |
| T3 Structured | t3.landmarks | any_pass | wire.semantic_landmarks |
| T4 Operable | t4.agent_interface | any_pass | wire.mcp_server_card, wire.openapi_catalog, wire.webmcp, wire.agents_md, source.authored_agent_tools |
| T5 Agent-Native | t5.media_semantics | any_pass | wire.alt_attributes |
| T5 Agent-Native | t5.interaction_semantics | any_pass | wire.labeled_fields, wire.accessibility_probe, wire.aria_resolvable |
| T5 Agent-Native | t5.link_semantics | any_pass | wire.descriptive_links |
| T5 Agent-Native | t5.transport_security | any_pass | wire.https |
| T5 Agent-Native | t5.freshness | any_pass | wire.last_updated, wire.canonical |
| T5 Agent-Native | t5.safety_agreement | no_known_fail | both.mcp_tool_count_agreement |

Gate evaluation preserves the honesty contract:

- A check satisfies a requirement when it passes, or when it is `partial` with a score of at least 60.
- An `any_pass` requirement fails only when every listed check is present with a known result and none satisfies it. If none satisfies but any listed check is `unknown` or absent from the run (for example, wire checks in a source-only scan), the requirement is `unknown` — unmeasured evidence is never fabricated as a failure.
- A `no_known_fail` requirement vetoes only on a known failing result. Unknown or absent evidence counts as no known adverse evidence — the requirement reports as not-vetoed rather than as measured proof; this asymmetry keeps sites without MCP surfaces eligible for T5.
- A gate fails if any requirement fails, is `unknown` if any requirement is unknown, and passes otherwise. All five gates are always evaluated and reported independently of the tier walk.

`summary.gates` is additive within the `ars.v1` schema: artifacts generated before gate outcomes existed still validate, and `ars diff` accepts mixed old/new inputs.

The wire pass uses deterministic HTTP and parser-backed HTML/JSON-LD probes by default. It can also consume an optional rendered DOM snapshot through `RenderedDomAdapter` or the opt-in `--rendered` CLI flag (requires Playwright installed separately) for browser-observed text, interactive element names, accessibility summary counts, and layout metrics. When rendered evidence is unavailable, browser-only checks remain `unknown` or explicitly heuristic rather than fabricated.

Playwright, axe-core, OSV-Scanner, Socket, and Semgrep stay behind explicit extension points so ordinary scans do not require browser or network-dependent security tooling.

## MCP server

The scanner is also an MCP server exposing a `scan_site` tool whose inputs mirror `ars scan` (`source`, `url`, `rendered`, `out`) and whose structured output includes the score summary, the highest-impact recommendations, and the requirements blocking the next tier. Add it to an MCP client via the `@grosspoetrysystems/crooked-pattern-mcp` wrapper package:

```json
{
  "mcpServers": {
    "ars": {
      "command": "npx",
      "args": ["-y", "@grosspoetrysystems/crooked-pattern-mcp"]
    }
  }
}
```

Or with the Claude Code CLI: `claude mcp add ars -- npx -y @grosspoetrysystems/crooked-pattern-mcp`.

Stdio is the only transport enabled by default. A streamable HTTP/SSE binding is opt-in behind an explicit flag and binds loopback:

```sh
ars-mcp --transport sse --port 3339
# announces: ars-mcp listening on http://127.0.0.1:3339/mcp
```

No environment variable or config file can enable the network transport implicitly.

The authored contract in `mcp/server-card.json` is the same contract the runtime serves: a test connects a real MCP client to the server and asserts the card's tools match the live `tools/list` response, and the source/wire reconciliation check (`both.mcp_tool_count_agreement`) is exercised against this surface in both agreeing and diverging configurations. The CLI and the MCP tool wrap one shared scan pipeline, so scores cannot drift between entry points.

## Supply-chain evidence

The source pass parses package manager lockfiles into a dependency inventory instead of only checking for lockfile presence. Supported formats are `pnpm-lock.yaml` (v6/v9), `package-lock.json` / `npm-shrinkwrap.json` (v1-v3), `yarn.lock` (classic and berry), and `bun.lock`; the binary `bun.lockb` is detected but not parsed. Parsing is deterministic and offline. The inventory (package names, versions, direct vs transitive split) is attached to `source.lockfile_pinning` as source evidence, and `source.slopsquatting_static_flags` screens the full parsed inventory — including transitive packages — instead of only direct dependencies. If a lockfile cannot be parsed, checks fall back to the filename-presence heuristic and say so; check IDs never change.

Security scanners are integrated as evidence ingestion, not as executed tools:

- `source.osv_vulnerabilities` consumes an `OsvScanReport` — contract JSON or raw `osv-scanner --format json` output.
- `source.socket_alerts` consumes a `SocketScanReport` — contract JSON or Socket facts JSON.
- `source.semgrep_findings` consumes a `SemgrepScanReport` — contract JSON or raw `semgrep --json` output.

Each contract accepts a pre-generated report file (CLI: `--osv-report`, `--socket-report`, `--semgrep-report`) or a `SupplyChainAdapter` implementation via `runSourcePass(root, { supplyChain })`; adapters receive the scan root and the parsed lockfile inventory. When no report or adapter is provided — the default — these checks stay `unknown` with `adapter_missing` metadata: ordinary scans never run scanners, never require the network, and never fabricate a pass or fail from missing evidence.

## Development

```sh
pnpm install
pnpm build
pnpm ars scan --source . --url https://example.com --out out
pnpm verify   # typecheck, lint, tests, build, smoke, dead-code check
pnpm coverage
```
