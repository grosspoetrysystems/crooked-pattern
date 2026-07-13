# ARS

Agentic Readiness Score is a CLI scaffold for scoring source and wire signals for agent readiness and unsafe exposure.

```sh
pnpm install
pnpm build
pnpm ars scan --source . --url https://example.com --out out
pnpm ars scan --url https://example.com --rendered --out out
pnpm ars diff before/ars.json after/ars.json
```

Outputs:

- `ars.json`: stable machine artifact with checks, registry-backed modes, weights, scores, evidence metadata, maturity gate membership, and caveats.
- `ars-report.md`: human-readable score report and prioritized recommendations.

The CLI validates generated `ars.json` artifacts before writing them and validates both inputs to `ars diff` before comparing scores, so malformed or unsupported artifacts fail deterministically instead of being treated as partial evidence.

Check identity metadata is centralized in a rubric registry so emitted source, wire, and reconciliation checks trace back to one definition for title, category, mode, weight, implementation status, evidence labels, and maturity gate membership.

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
- A `no_known_fail` requirement vetoes only on a known failing result. Unknown or absent evidence counts as no known adverse evidence, not a fabricated pass of the underlying check; this asymmetry keeps sites without MCP surfaces eligible for T5.
- A gate fails if any requirement fails, is `unknown` if any requirement is unknown, and passes otherwise. All five gates are always evaluated and reported independently of the tier walk.

`summary.gates` is additive within the `ars.v1` schema: artifacts generated before gate outcomes existed still validate, and `ars diff` accepts mixed old/new inputs.

The wire pass uses deterministic HTTP and parser-backed HTML/JSON-LD probes by default. It can also consume an optional rendered DOM snapshot through `RenderedDomAdapter` or the opt-in `--rendered` CLI flag for browser-observed text, interactive element names, accessibility summary counts, and layout metrics. When rendered evidence is unavailable, browser-only checks remain `unknown` or explicitly heuristic rather than fabricated.

Playwright, axe-core, OSV-Scanner, Socket, and Semgrep stay behind explicit extension points so ordinary scans do not require browser or network-dependent security tooling.
