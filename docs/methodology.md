# Methodology — how the Agentic Readiness Score works, and why to trust it

This document explains what crooked-pattern measures, how it turns checks into a number, and — most importantly — how each check is grounded in a real standard. A score is only worth sharing if it is earned; this is where you can see that it is.

## What ARS is, and what it isn't

crooked-pattern is a **deterministic pre-flight lint for the agentic web.** It measures the *presence, coherence, and safety posture of the agent-facing signals* a site and repo expose — not whether an agent will succeed at a task.

- It **is**: reproducible (same input → same artifact, no noise tolerance), offline by default, diffable, CI-gateable.
- It **is not**: a behavioral evaluation (that needs a real agent in the loop), a safety *guarantee*, or a crawl-permission adjudicator. A perfect score is not proof of safety or readiness.

## Two scores, two lenses

crooked-pattern reports two independent headline scores from one engine:

- **Agent-Readiness** — the open score. Can agents discover, read, and operate your site? Six weighted categories over the *wire* pass (a live URL).
- **Agent-Safety** — the deeper score. Is what you expose to agents safe? Supply-chain hygiene (the *source* pass over a repo) plus runtime agent-interface safety (the wire pass's safety checks). Reported separately so a strong site with a risky agent interface can't hide behind a good readiness number, and vice versa.

Unmeasured evidence is reported as `unknown` / `not assessed`, never fabricated as a failure.

## The Agent-Readiness categories

Category weights (sum to 100): content legibility 20, agent operability 20, structured meaning 18, navigability & stability 18, crawl access 12, trust & freshness 12.

- **crawl_access** — can agents find and are they permitted to fetch the site? Grounded in **RFC 9309** (the Robots Exclusion Protocol, IETF Standards Track) and **sitemaps.org**. AI-crawler directives are scored by *direction* (allow vs deny) against the documented vendor tokens (GPTBot, ClaudeBot/Claude-User/Claude-SearchBot, Google-Extended, PerplexityBot, CCBot, …): a site that `Disallow: /`s AI agents scores against readiness, not for it.
- **content_legibility** — is the content actually there for a non-JS crawler? Major AI crawlers largely don't execute JavaScript, so content in the initial HTML is the anchor signal. Token-cost/page-weight and clean-DOM are honest heuristics for extraction cost.
- **structured_meaning** — is meaning machine-readable? **schema.org** / JSON-LD (JSON-LD 1.1 is a W3C Recommendation; Google recommends JSON-LD for structured data), Open Graph (ogp.me), and semantic landmarks (**WCAG 2.2 SC 1.3.1**).
- **agent_operability** — can an agent find and call your interfaces? The *ratified* discovery chain — **RFC 9727** (`.well-known/api-catalog`) → OpenAPI, and **RFC 8414 / RFC 9728** (OAuth discovery) — is weighted above emerging signals (MCP server card, WebMCP, AGENTS.md), which are labeled emerging.
- **navigability_stability** — can an agent operate the page reliably? **WCAG** 1.1.1 (alt text), 2.4.4 (descriptive links), 3.3.2 / 4.1.2 (labeled, name-resolvable controls), plus layout stability (CLS) so elements don't move after an agent snapshots them.
- **trust_freshness** — HTTPS, canonical, and schema.org freshness/author signals.

## The Agent-Safety checks

- **Supply-chain (source pass)** — grounded in **OpenSSF Scorecard** (pinned dependencies, SAST, dependency-update tooling, signed releases), **SLSA** provenance, **npm provenance**, pnpm `minimumReleaseAge` (default 24h — malware is typically yanked within hours), and slopsquatting screening (a real, measured threat: ~20% of LLM-suggested packages in one study referenced hallucinated names).
- **Runtime agent-interface (wire pass)** — the **lethal trifecta** / **Agents Rule of Two** (an agent tool should combine no more than two of: untrusted input, sensitive access, external side effects), indirect prompt-injection surface (**OWASP LLM01:2025**), and OAuth scope tightness (**MCP security best practices**, RFC 9728). Rule-of-Two classifies the *declared* MCP tool schema — a screening signal over self-reported surface, not a verdict.

## How weights are set

The principle: **weight ∝ (how load-bearing the practice is for an agent) × (how ratified and actually-consumed the standard is).** Three tiers:

| Tier | Examples | Weight |
|---|---|---|
| **Ratified & consumed** | RFC 9309 robots, sitemaps.org, RFC 9727 api-catalog, RFC 8414/9728 OAuth, WCAG, schema.org | full |
| **Documented vendor convention** | AI-crawler tokens, Open Graph, AGENTS.md | medium |
| **Emerging / unratified** | llms.txt, Content-Signals, MCP server card, WebMCP, markdown negotiation | near-zero, labeled `emerging` |

The proof that this is honest: **`wire.llms_txt_present` carries a weight of 0.05.** llms.txt is a real proposal, but as of this writing no major AI system consumes it (Google has stated it won't) and publisher adoption is single digits. So it earns a near-zero weight and is labeled emerging — visibly, in the artifact. When a standard graduates (e.g. the IETF `aipref` working group ratifies AI-preference expression), its weight rises. Reading *why* a signal scores low is itself the trust signal.

## Maturity tiers (decoupled from the number)

Independently of the numeric score, sites earn a maturity tier **T1 Crawlable → T5 Agent-Native.** Each tier is a set of requirements over specific registry check IDs; the tier is the highest *consecutive* gate passed. A blocked tier is always traceable to the exact requirement and check IDs that blocked it. Category scores are descriptive aggregates and do not set the tier.

## The honesty contract (the part we lead with)

- **Determinism.** Same input → same artifact. No noise tolerance, so it gates CI cleanly.
- **Unknown is never fail.** Unmeasured evidence is `unknown`. An `any_pass` requirement fails only when every listed check is present *and* known and none satisfies it; a `no_known_fail` requirement vetoes only on known adverse evidence. Missing tooling never fabricates a pass or a fail.
- **The registry is the single source of truth** for every check's identity, weight, and gate membership; heuristic-confidence checks are labeled and collapsed into an explicit caveat in the report.
- **Adapters stay behind explicit extension points.** Playwright, axe-core, OSV, Socket, and Semgrep never run during an ordinary scan; their checks report `unknown` until you supply a report or adapter.

## Roadmap (known and intentionally deferred)

Transparency about what we don't yet check is part of the contract. On the near-term list: structured-data *validity* (required properties per schema.org type, not just presence), page `<title>` / meta-description / `html lang`, heading hierarchy (WCAG 2.4.6) alongside the single-H1 heuristic, and — on the safety side — the Scorecard checks that are statically parseable offline (CI token-permissions, dangerous-workflow, SHA-pinned Actions, dependency-update tooling).
