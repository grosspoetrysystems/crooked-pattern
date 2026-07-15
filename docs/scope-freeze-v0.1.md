# v0.1 Scope Freeze

Product-owner decisions frozen 2026-07-15 (Wave 0, plan `plan_3932ss6giwt0` v3/decomp_v1). Changes to any decision below require an explicit product-owner sign-off and a plan iteration — not a code-review comment.

## D1 — npm package identity

**Amended 2026-07-15 (release gate):** scoped under the studio's npm org so the org is the owner/publisher of record and the studio stands on its own (product-owner aesthetic decision; `thekidnamedkd` is org owner behind the scenes). Original decision below chose unscoped names — superseded by the scoped names.

- Main package: **`@grosspoetrysystems/crooked-pattern`** (scoped; org `grosspoetrysystems` confirmed on npm 2026-07-15, scoped name verified available). The project is called Crooked Pattern; ARS — the Agentic Readiness Score — is the score it produces.
- MCP wrapper package: **`@grosspoetrysystems/crooked-pattern-mcp`** (scoped; verified available 2026-07-15). A thin package that depends on `@grosspoetrysystems/crooked-pattern` and re-exposes the MCP server bin so MCP client configs can use `npx @grosspoetrysystems/crooked-pattern-mcp`.
- Installed command names are unchanged: `ars` (CLI) and `ars-mcp` (MCP stdio server).
- Both packages publish at `0.1.0` with `publishConfig.access = public` (required for scoped public packages).
- Attribution: `author` "Gross Poetry Systems"; MIT license © Gross Poetry Systems; repository/homepage/bugs point at `github.com/grosspoetrysystems/crooked-pattern` (public).
- Superseded original: unscoped `crooked-pattern` / `crooked-pattern-mcp` (bare `ars` was taken; scoped chosen for studio ownership instead).

## D2 — Rule-of-Two v0.1 (measurable definition)

Context: the Rule-of-Two / lethal-trifecta posture check (`wire.rule_of_two`) currently keyword-scans page HTML. That heuristic drifted from the intended meaning. The v0.1 definition operates on **MCP tool schemas**, not page prose.

Capability classes, assigned per declared MCP tool from its name, description, and input/output schema:

- **U — untrusted-content ingestion**: the tool's inputs or documented behavior take content from arbitrary external sources (URLs to fetch, web/search queries, user-supplied documents, inbound messages).
- **P — private-data access**: the tool reads non-public principal data (accounts, profiles, emails, files, tokens, payment or customer records).
- **X — external side effects**: the tool communicates outward or mutates state (send/post/email/webhook, create/update/delete, purchase/transfer).

Machine-checkable predicate (v0.1):

1. For each declared tool `t`, compute `classes(t) ⊆ {U, P, X}` deterministically from the tool's declared name, description, and JSON schema property names/descriptions, using the versioned classifier lexicon shipped in the registry (single source of truth).
2. `rule_of_two_violation(toolset) = ∃t : classes(t) = {U, P, X}` **or** (`∃t₁: U ∈ classes(t₁)` ∧ `∃t₂: P ∈ classes(t₂)` ∧ `∃t₃: X ∈ classes(t₃)` within one declared server with no declared session isolation between them).
3. Check outcome: `pass` iff no violation; `fail` iff a violation is found; `unknown` iff no MCP tool schemas are discoverable (never fabricated from page HTML alone).
4. Evidence must name the offending tool(s) and the matched schema fields per class.

Scope note: v0.1 classifies from static declared schemas only (deterministic, offline). Session-isolation declarations are honored only when explicitly machine-readable; absent that, condition 2's toolset clause applies. Runtime behavioral analysis is out of scope for v0.1.

## D3 — Hosted-MCP transport scope

- `ars-mcp` defaults to **stdio**. Launching with no flags starts a stdio server; this is the only transport exercised by default.
- HTTP/SSE is **opt-in only**, activated by the explicit flag `--transport sse` (with `--port`, default `3339`). No config file, environment variable, or auto-detection may enable a network transport implicitly.
- No hosted/managed service is part of v0.1.

## D4 — Worktree-per-track execution map

| Track | Branch | Worktree path |
|---|---|---|
| T-WAVE-1-EVIDENCE-DEPTH | `swarm/t-wave-1-evidence-depth` | `.worktrees/t-wave-1-evidence-depth` |
| T-WAVE-2-DOCS-ONLY | `swarm/t-wave-2-docs-only` | `.worktrees/t-wave-2-docs-only` |
| T-WAVE-3-SSE-BINDINGS | `swarm/t-wave-3-sse-bindings` | `.worktrees/t-wave-3-sse-bindings` |
| T-LIVE-V0-1-0 | `swarm/t-live-v0-1-0` | `.worktrees/t-live-v0-1-0` |

T-WAVE-0 executed orchestrator-direct on `master` (docs-only decisional wave).

## D5 — v0.1 release checklist

The binding checklist is `docs/release-checklist-v0.1.md`. `npm publish` for either package is prohibited until every item there is checked with linked evidence and the product owner has signed off.

## D6 — Product surface for v0.1

- v0.1 ships **CLI + MCP server** only. The MCP server is the editor/dev-tools integration surface (Claude Code, Cursor, etc.).
- A hosted website with URL-paste scanning is the headline candidate for the next planning horizon (see `v3-phase2-lookahead.md`); a browser extension is deferred without commitment.
- Ordering: the deep code/product quality pass runs **before** the live v0.1.0 publish.
