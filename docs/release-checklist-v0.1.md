# v0.1.0 Release Checklist

Binding gate for publishing `@grosspoetrysystems/crooked-pattern` and `@grosspoetrysystems/crooked-pattern-mcp` (see `docs/scope-freeze-v0.1.md`). Every item requires linked evidence. Release commit: `5d50958`; tag `v0.1.0`. Published 2026-07-15.

## Quality gates

- [x] `pnpm verify` green on the release commit (check, lint, tests, build, smoke, knip) — `5d50958`; pre-push hook re-ran verify on push (passed).
- [x] `pnpm coverage` green: branches 88.93% (≥86%); vitest thresholds (80% x4) unweakened — `git diff 3caf31b HEAD -- vitest.config.ts` shows only an added `exclude` for worktrees, thresholds block unchanged.
- [x] All wave gates (P1-W1..W3) accepted — `v3-phase1-wave1/2/3-gate-checklist.md` (`eee24eb`, `3aad7db`/`0fc0d2d`, `ea638b5`).
- [x] Deep quality/product evaluation pass completed and merged before publish — `v3-phase1-quality-pass-record.md` (`48ac711`).

## Honesty contract

- [x] Ordinary scan deterministic and offline — no network without `--url`/opt-in flags; per-request timeouts added.
- [x] `unknown` degradation intact — hardened in the quality pass (unreachable origin errors instead of fabricating; SPA rewrites no longer fake passes; `unknown` never fabricated).
- [x] Registry is the single source of truth — `registry.test.ts` enforces every emitted check traces to a definition.

## Positioning invariants

- [x] No AXIS references outside docs/README related-work — `grep -rin axis src/` → none.
- [x] No external taxonomy identifiers in registry schema or scoring — confirmed.
- [x] No pinned AXIS dependency — `grep -in axis package.json pnpm-lock.yaml` → none.

## Packaging

- [x] Names match amended scope freeze: `@grosspoetrysystems/crooked-pattern` (main), `@grosspoetrysystems/crooked-pattern-mcp` (wrapper); both carry `publishConfig.access = public` — `packaging.test.ts` enforces.
- [x] Both packages carry `license` (MIT), `repository`, `homepage`, `bugs`, `description`, `files` — set 2026-07-15.
- [x] `npm pack --dry-run` tarball contents match committed allowlists (`docs/packaging/*.txt`) — test-enforced; dry-run verified for both.
- [x] Bins resolve from a packed install — packed main tarball installed into an isolated dir; `ars --version` → `0.1.0`, `ars --help` runs with deps resolved.
- [x] stdio default + `--transport sse` opt-in verified by round-trip integration tests (<2000ms) — `mcp-transports.test.ts`.

## Release mechanics

- [x] CHANGELOG has a `0.1.0` entry — rewritten as the initial-release entry (`5d50958`).
- [x] Release commit tagged `v0.1.0` — pushed to `origin`.
- [x] npm account authenticated with publish rights — `npm whoami` = `thekidnamedkd`; org `grosspoetrysystems` owner; `npm access list packages @grosspoetrysystems` shows both packages read-write.
- [x] Product-owner sign-off before publish — product owner ran both `npm publish` commands directly, reported success 2026-07-15.

## Post-publish verification

- [x] Both packages resolve — `npm access list packages @grosspoetrysystems` confirms both published; public `npm view` propagating (first-publish under a new org).
- [ ] `npx @grosspoetrysystems/crooked-pattern@0.1.0 --help` and the wrapper stdio handshake from a clean environment — pending public-registry propagation, then verified.
