# AGENTS

Project operating guidelines live in `.agents/GUIDELINES.md`.

When this repository is loaded, apply those guidelines as the primary project-specific instruction source.

## Skills

Skills are in `.agents/skills/` (native Codex discovery).

- `brownfield-compress`: Investigate a codebase and produce a compression artifact for downstream planning. The Research step.
- `post-council-handoff`: Execution entry-point anchor after plan decomposition. Translates a decomposed Tempor plan into a kickoff-ready frame, then hands off to lifecycle execution.
- `plan-execution-lifecycle`: Execution orchestration for Tempor-generated plans. Kickoff, waves, gates, closeout ceremonies. The Implement step.
- `git-commit-workflow`: Commit discipline, staging, hook remediation. Required by plan-execution-lifecycle.
- `pulse-save`: Save handoff snapshot for the next agent/context window.
- `pulse-resume`: Resume from a previous agent's handoff snapshot.
