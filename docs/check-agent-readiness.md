---
type: guide
title: Check whether a site and repo are ready for AI agents
---
# How do I check whether a website and repository are ready for AI agents?

Run Crooked Pattern's `ars scan`. It produces an Agentic Readiness Score (ARS)
and a T0–T5 maturity tier from the agent-facing signals of your site, plus
repository and agent-interface safety findings. The two output artifacts
distinguish measured evidence from checks that were not assessed.

```sh
# Repository only (supply-chain hygiene — the "source" pass)
ars scan --source . --out ./ars-out

# Live site only (robots/sitemap, metadata, interfaces — the "wire" pass)
ars scan --url https://your-site.com --out ./ars-out

# Both in one run (recommended)
ars scan --source . --url https://your-site.com --out ./ars-out
```

Install it first with `npm i -g @grosspoetrysystems/crooked-pattern` (the command
is `ars`), or run without a global install via:
`npx @grosspoetrysystems/crooked-pattern scan --url https://your-site.com --out ./ars-out`.

## Prerequisites

- Node.js 20 or later with `npm`/`npx`.
- A repository path for the source pass, a reachable URL for the wire pass, or
  both. You must pass at least one of `--source` / `--url`; the scan errors
  otherwise.
- No browser or security scanner is required for the ordinary probes. The source
  pass is offline by default; the wire pass necessarily fetches the URL you
  provide. Playwright and OSV/Socket/Semgrep evidence are explicit extensions.

## Source vs wire: two passes, one engine

- **Source pass (`--source <path>`)** inspects a repository: lockfile pinning
  with a parsed dependency inventory, release-age cooldowns, CI install
  determinism, SCA/provenance/SBOM signals, slopsquatting flags, and any
  authored MCP/OpenAPI tool definitions.
- **Wire pass (`--url <url>`)** inspects a live origin: robots/sitemap/llms.txt,
  structured metadata (JSON-LD, Open Graph), content legibility, MCP/OpenAPI
  discovery, `AGENTS.md`, accessibility semantics, and runtime agent-safety
  posture.

Run both together to observe the repository and deployed site. Source evidence
can contribute authored-tool checks as well as supply-chain findings; wire
evidence covers the live site's signals. Optional adapters may still be unassessed.

## The two artifacts you get

Both are written to `--out` (default the current directory):

- **`ars.json`** — the stable machine artifact. Every check with its
  registry-backed mode, weight, score, evidence metadata, maturity-gate
  membership, and caveats. This is what you commit as a CI baseline and feed to
  `ars diff`.
- **`ars-report.md`** — the human-readable report. Score summary, the blocking
  gate for your next tier, and prioritized recommendations.

## Reading the result

The CLI prints the readiness score, tier, measured-category count, safety score,
and the paths of the two output artifacts.

- **Agent-Readiness** is the open score: can agents discover, read, and operate
  the site? It is `ars_final` out of 100, with the maturity tier and how many
  of the readiness categories were measured.
  Check the measured-category count alongside the score: a source-only run can
  score highly on limited evidence while its site maturity remains T0 Unassessed.
- **Agent-Safety** is the deeper score: is what you expose safe? It combines the
  source pass's supply-chain hygiene with the wire pass's runtime
  agent-interaction checks. It reads `not assessed` when neither was measured —
  scan a repo or a site with an agent interface to compute it.

Open `ars-report.md` for the category breakdown, the exposure-multiplier
explanation, the per-gate outcomes, and the prioritized recommendations.

## Unknown stays unknown

Unmeasured evidence is reported as `unknown` / `not assessed`, never fabricated
into a pass or a fail. A source-only scan leaves wire evidence unmeasured and
vice versa; checks whose optional tooling you did not supply (Playwright, OSV,
Socket, Semgrep) report unavailable evidence explicitly.
That honesty is deliberate: the maturity tier can report a requirement as
`unknown` rather than inventing a failure.

## What "readiness" measures — and what it does not

ARS measures the **presence, coherence, and safety posture of agent-facing
signals**. The wire pass observes the deployed origin and can measure runtime
agent-interface safety, but those are readiness signals — it is not a runtime
measurement of what an agent actually does:

- It does **not** run an agent against your site, so it does not measure task
  success, tool-call outcomes, or behavioral quality — that is a separate
  discipline.
- It does **not** predict search ranking, AI-answer citations, or traffic. A
  good ARS says your signals are present and coherent for agents to consume; it
  makes no promise about impressions or placement.
- The default wire pass uses deterministic HTTP and parser-backed probes.
  Browser-observed evidence (rendered text, interactive element names,
  accessibility counts) is available only when you opt in with `--rendered`
  (requires Playwright installed separately); without it, browser-only checks
  stay `unknown` or explicitly heuristic, rather than claiming a browser measurement.

## Next action

Run the combined scan above, open `ars-report.md`, and start at its **blocking
gate** line — it names the exact requirement standing between you and your next
tier. To understand how each check is scored and why, see
[Methodology](methodology.md); for every scan flag see [ars scan](scan.md). Once
you have a clean baseline, gate CI on regressions with
[Prevent agent-readiness regressions in CI](prevent-readiness-regressions.md).
