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

- `ars.json`: stable machine artifact with checks, modes, weights, scores, and caveats.
- `ars-report.md`: human-readable score report and prioritized recommendations.

The wire pass uses deterministic HTTP and HTML probes by default. It can also consume an optional rendered DOM snapshot through `RenderedDomAdapter` or the opt-in `--rendered` CLI flag for browser-observed text, interactive element names, accessibility summary counts, and layout metrics. When rendered evidence is unavailable, browser-only checks remain `unknown` or explicitly heuristic rather than fabricated.

Playwright, axe-core, OSV-Scanner, Socket, and Semgrep stay behind explicit extension points so ordinary scans do not require browser or network-dependent security tooling.
