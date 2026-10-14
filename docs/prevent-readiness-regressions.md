---
type: guide
title: Prevent agent-readiness regressions in CI
---
# How do I prevent agent-readiness regressions in CI?

Keep a deliberately reviewed `ars.json` baseline, regenerate the same scan with
the same Crooked Pattern version, options, and targets, then run `ars diff` with
the regressions your pipeline should reject. `ars diff` compares artifacts; it
does not run a new scan.

## Prerequisites

You need the [`ars` command](check-agent-readiness.md) at the version you intend
to gate, a checkout from which the source pass can run, and a stable URL if you
are measuring wire signals. Your CI job must preserve a reviewed baseline
artifact and propagate the `ars diff` process status; this guide does not
assume or create a particular CI provider.

## 1. Create and review the initial baseline

From the repository root, generate both passes when you have both targets:

```sh
ars scan \
  --source . \
  --url https://your-site.com \
  --out baseline

# Inspect the human-readable report before committing the machine artifact.
less baseline/ars-report.md
```

Review the score, tier, gate outcomes, caveats, and the checks that produced
unknown evidence. Commit `baseline/ars.json` only after a person agrees that
the URL, source tree, tool version, and observed state are the intended starting
point. `ars-report.md` is useful for review, but `ars diff` reads the JSON
artifact.

For a repository-only baseline, omit `--url`:

```sh
ars scan --source . --out baseline
```

That baseline cannot establish the live site's wire gates; those checks remain
unknown. Prefer the combined baseline when the site is available.

## 2. Keep comparisons reproducible

The current artifact must use the same:

- Crooked Pattern package/binary version;
- `--source` target (normally the same checkout-relative `.`);
- `--url` target (the same full URL, including scheme, host, port, and path);
- optional `--rendered` setting; and
- optional evidence providers and report options such as `--osv-report`,
  `--socket-report`, and `--semgrep-report`.

Regenerate evidence reports for the revision being scanned; do not reuse an
old vulnerability report merely to keep the inputs identical.

Put that exact invocation in the CI configuration you already use; this page
does not assume a particular CI provider or create infrastructure for you. Pin
the package version in that environment rather than allowing an unreviewed tool
upgrade to change the baseline and current artifact at once. Keep the baseline
reviewable and update it as a deliberate change, not as an automatic step after
a failing comparison.

A typical current-run sequence is:

```sh
ars scan \
  --source . \
  --url https://your-site.com \
  --out current

ars diff baseline/ars.json current/ars.json \
  --fail-on score-drop,tier-drop,gate-regression
```

Use the same `--rendered` and evidence-report options as the baseline if you
used them there. The scan writes `current/ars.json` and
`current/ars-report.md`; the final command prints the comparison and exits
non-zero when a requested condition is triggered.

## What each gate condition actually means

The `--fail-on` value is a comma-separated list of exactly these names:

- **`score-drop`** — `after.summary.ars_final` is lower than
  `before.summary.ars_final`. This is the final ARS value, not the separate
  `ars_readiness` field.
- **`tier-drop`** — the after tier is lower in the ordered sequence `T0
  Unassessed`, `T1 Crawlable`, `T2 Legible`, `T3 Structured`, `T4 Operable`,
  `T5 Agent-Native`.
- **`gate-regression`** — a gate that was `pass` in the before artifact is not
  `pass` in the after artifact. That includes a transition to `fail` or
  `unknown` when the gate is present in the after artifact.

The diff output also shows readiness/final-score deltas, the exposure multiplier,
gate changes, category changes, and changed or missing checks. The regression
booleans are based on the definitions above, not on a percentage tolerance.
Artifacts produced by the current schema include `summary.gates`; older
artifacts may not record gates, and the diff reports that absence rather than
inventing gate outcomes.

## Exit behavior

- No `--fail-on` option: `ars diff` prints the comparison and exits normally,
  even when it displays a regression.
- `--fail-on` with a triggered condition: the CLI raises a regression error and
  exits with status **1**.
- An unknown condition name is an error and also exits with status **1**. Use
  only `score-drop`, `tier-drop`, and `gate-regression`.
- Scan or artifact-read errors likewise produce status **1**; they are not a
  readiness pass.

## Limits to interpret before gating

- **Source-only is incomplete for site readiness.** It can measure repository
  and supply-chain evidence, but it cannot measure live robots, content,
  metadata, accessibility, discovery, or runtime interface signals. Unknown
  wire evidence is not a regression by itself, but a source-only baseline can
  leave the tier unassessed.
- **A wire scan observes a live origin.** Deployments, CDN responses,
  redirects, transient availability, and other changes at the URL can alter
  the artifact even when the repository did not change. Keep the target and
  options fixed, and treat a network/rollout change as a reviewable cause
  rather than adding a noise tolerance that hides a real change.
- ARS is a deterministic pre-flight signal for the observed inputs, not a
  measurement of real agent task success, search placement, AI citations, or a
  safety guarantee. Use a separate behavioral evaluation for those questions.

## Next action

Add the scan-and-diff sequence to the CI job you already maintain, pin its
Crooked Pattern version and exact options, and require review of any status-1
comparison. When a regression is intentional, update and review the baseline
artifact in the same change; do not overwrite it blindly. For a failing or
unknown first gate, use [Fix readiness blockers](fix-readiness-blockers.md),
and see [ars diff](diff.md) for the compact reference.
