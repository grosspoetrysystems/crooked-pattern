---
name: rack-mount-ts
description: >
  Use when the user wants to set up or retrofit a TypeScript or Node.js
  project with a production-grade dev stack. "set up a project",
  "init a repo", "add linting and testing", "modernize this tooling",
  "scaffold a TS project", "scaffold a Node project",
  "what tooling should I use for TypeScript".
metadata:
  version: "1.0"
  author: whomst
license: MIT
---

# Rack Mount TS

Production-grade TypeScript project substrate. You bring the idea, this skill racks it in.

## When to use
- New TypeScript project
- Retrofitting an existing project with missing tooling
- Upgrading a dev stack to current practices

## When NOT to use
- Non-TypeScript projects
- Go projects: use `rack-mount-go`
- User explicitly wants a different stack

## The substrate (non-negotiable)

Every project gets all of these. Config templates are in `references/`.

| Layer | Tool |
|-------|------|
| Package manager | pnpm |
| Language | TypeScript (strict, ES2022, ESM) |
| Build | tsup |
| Dev runner | tsx |
| Lint/format | Biome via ultracite |
| Test | Vitest + v8 coverage |
| Git hooks | Lefthook |
| Commits | Commitlint (conventional, single-line) |
| Unused code | Knip |

## Surfaces (recommended, not required)

The substrate is the product. Surfaces are opinionated starting points for common project types — use them, adapt them, or ignore them entirely. Presets are in `references/surfaces/`.

| Surface | Reference |
|---------|-----------|
| Library | `surfaces/library.md` |
| CLI | `surfaces/cli.md` |
| Agent | `surfaces/agent.md` |
| API | `surfaces/api.md` |
| Web (TanStack) | `surfaces/web-tanstack.md` |
| Web (Astro) | `surfaces/web-astro.md` |
| Monorepo | `surfaces/monorepo.md` |

## Instructions

1. Ask: what are you building? (surface menu above)
2. If greenfield: `git init` (lefthook's `prepare` script fails without a git repo, so do this before installing deps)
3. Install substrate deps (`references/` has the config files — copy and adapt)
4. Install surface deps (the chosen surface reference has the specifics)
5. If retrofitting: merge with what exists, don't replace. Remove conflicting tools (ESLint/Prettier → ultracite, Husky → lefthook)
6. Initialize lefthook, create entry file if greenfield, commit

Read the reference files for specifics. Don't memorize — the references have current versions and exact configs.

## Companion skill

For AI/inference architecture (model adapters, schema contracts, workflow patterns), see `/cable-run`.
For Go projects, use the sibling `rack-mount-go` skill.
