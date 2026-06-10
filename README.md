# ARS

Agentic Readiness Score is a Phase 1 CLI scaffold for scoring source and wire signals for agent readiness and unsafe exposure.

```sh
pnpm install
pnpm build
pnpm ars scan --source . --url https://example.com --out out
pnpm ars diff before/ars.json after/ars.json
```

Outputs:

- `ars.json`: stable machine artifact with checks, modes, weights, scores, and caveats.
- `ars-report.md`: human-readable score report and prioritized recommendations.

The current wire pass uses deterministic HTTP and HTML probes. Playwright, axe-core, OSV-Scanner, Socket, and Semgrep are represented as explicit extension points or unknown checks rather than fabricated results.
