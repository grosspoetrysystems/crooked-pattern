# v0.1.0 Release Checklist

Binding gate for publishing `crooked-pattern` and `crooked-pattern-mcp` (see `docs/scope-freeze-v0.1.md`). Every item requires linked evidence (commit ref, CI link, or command output) recorded at the release gate. No item may be waived silently.

## Quality gates

- [ ] `pnpm verify` green on the release commit (check, lint, tests, build, smoke, knip)
- [ ] `pnpm coverage` green: branch coverage ≥ 86%; vitest thresholds (80% lines/functions/branches/statements) unweakened — confirmed via `git diff` on the vitest config coverage block against `3caf31b`
- [ ] All wave gates (P1-W1..W3) accepted with linked gate checklists
- [ ] Deep quality/product evaluation pass completed and improvements merged (product-owner decision: pass runs before publish)

## Honesty contract

- [ ] Ordinary scan runs deterministic and offline (no network access without explicit opt-in flags)
- [ ] `unknown` degradation intact: absent evidence is reported as unknown, never fabricated
- [ ] Registry remains the single source of truth for checks, weights, labels, and gates

## Positioning invariants

- [ ] Repo-wide search shows no AXIS references outside docs/README related-work acknowledgements
- [ ] No external taxonomy identifiers in registry schema or scoring
- [ ] No pinned AXIS dependency in package.json, lockfile, or imports

## Packaging

- [ ] `package.json` names match the scope freeze: `crooked-pattern` (main), `crooked-pattern-mcp` (wrapper)
- [ ] Both packages carry `license`, `repository`, `description`, and `files` (or equivalent) metadata
- [ ] `npm pack --dry-run` tarball contents match the committed allowlist for both packages — no test fixtures, coverage artifacts, lifecycle docs, or worktree metadata
- [ ] `ars --help` and `ars-mcp` bins resolve and run from a packed tarball install (`npm i -g <tarball>` smoke test)
- [ ] stdio default + `--transport sse` opt-in verified by round-trip integration tests (< 2000 ms each)

## Release mechanics

- [ ] CHANGELOG has a v0.1.0 entry referencing all merged changesets
- [ ] Release commit tagged `v0.1.0`
- [ ] npm account authenticated (`npm whoami` succeeds) with publish rights for both names
- [ ] Product-owner sign-off recorded immediately before `npm publish` (publish is irreversible)

## Post-publish verification

- [ ] `npm info crooked-pattern@0.1.0` and `npm info crooked-pattern-mcp@0.1.0` resolve
- [ ] `npx crooked-pattern@0.1.0 --help` and `npx crooked-pattern-mcp@0.1.0` (stdio handshake) work from a clean environment
