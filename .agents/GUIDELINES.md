# Project Guidelines

This repository follows the local execution skills in `.agents/skills/` for planning, wave gates, commits, and handoff saves.

## Verification

- Use `pnpm verify` as the full local gate.
- Keep deterministic ARS checks honest: unknown or unavailable evidence should stay `unknown` or `unassessed`, not be fabricated.
- Keep browser-rendered, accessibility, SCA, and MCP runtime integrations behind explicit extension points until implemented.

## Execution

- Use `.tempor/` for local planning and ceremony artifacts; it is intentionally not committed.
- At phase or wave seams, run `plan-execution-lifecycle` with `git-commit-workflow`, then refresh `.tempor/PULSE_CHECK.md` with `pulse-save`.
