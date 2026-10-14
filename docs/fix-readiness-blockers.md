---
type: guide
title: Fix readiness blockers
---
# Why is my site stuck at T0/T1 and what should I fix first?

Run a wire scan (and a combined source+wire scan when the repository is
available), then fix the **first non-passing maturity gate** in
`summary.gates`. Crooked Pattern walks gates in order from T1 to T5: a later
gate can be reported independently, but the tier stops at the first gate whose
outcome is not `pass`.

```sh
# Site-only diagnosis
ars scan --url https://your-site.com --out ./ars-out

# Prefer this when you also own the repository and its authored tool definitions
ars scan --source . --url https://your-site.com --out ./ars-out

# Print the exact gate and requirement objects from the machine artifact
node -e 'const {summary}=require("./ars-out/ars.json"); console.log(JSON.stringify(summary.gates,null,2))'
```

## Prerequisites

Install [Crooked Pattern](check-agent-readiness.md) so the `ars` command is
available. The URL must be reachable for wire checks; pass `--source <path>`
only when that directory exists. The scan writes `ars.json` and
`ars-report.md` under `--out`.

## What the report is telling you

Current artifacts contain `summary.gates`, an array of objects shaped by the
artifact schema:

```text
summary.gates[]
  gate
  outcome                 pass | fail | unknown
  requirements[]
    id
    description
    kind                   any_pass | no_known_fail
    outcome                pass | fail | unknown
    check_ids[]
    satisfied_by?          present when an any_pass requirement passes
    unknown_check_ids?     present when evidence is unknown or absent
```

The report renders the same information under **Maturity Gates**, and puts a
line such as `Blocking gate: ... — unmet requirements: ...` near the top. That
line names the first gate whose outcome is not `pass` and the requirement IDs
that are not passing. Use those IDs, rather than the numeric score alone, to
choose the next fix.

The **Prioritized Recommendations** section is narrower: it takes checks whose
result is `fail` or `partial`, sorts them by registry weight (highest first),
and shows at most ten, formatted with each check's title, registry ID, and
notes. An `unknown` check is intentionally not listed as a failure. If the
blocking requirement is unknown, supply the missing evidence or run the pass
that can observe it instead of changing the site based on a guessed failure.

## How a gate becomes pass, unknown, or fail

For an `any_pass` requirement, one listed check is enough when its result is
`pass`, or when its result is `partial` **and its score is at least 60**. If no
check satisfies it and any listed check is unknown or absent, the requirement is
`unknown`. It is `fail` only when every listed check is present, known, and none
satisfies it.

For a `no_known_fail` requirement, a known failing listed check vetoes the
requirement. Unknown or absent evidence does not prove safety, but it does not
fabricate a failure either; it is treated as not-vetoed. A gate is `fail` if any
requirement fails, `unknown` if none fails but at least one is unknown, and
`pass` otherwise.

Therefore:

- **T0 Unassessed** usually means T1 could not be established. A source-only
  run has no wire evidence, so the T1 crawl-discovery requirement is unknown;
  it is not evidence that the site failed.
- **T1 Crawlable** means T1 passed but the T2 requirement immediately after it
  did not pass. Inspect the T2 requirement outcome before working on T3 or a
  high-level score.
- A `fail` points to known observed evidence to remediate. An `unknown` points
  first to an incomplete scan, unavailable adapter, or missing mode/target.

The complete gate and registry mapping is in
[README — Maturity gates](https://github.com/grosspoetrysystems/crooked-pattern/blob/main/README.md#maturity-gates).
The rationale and honesty contract are in [Methodology](methodology.md).

## Fix the first blocker using its real check IDs

After locating the first non-passing requirement, use its `check_ids` and the
notes for the corresponding check in `ars-report.md` or `ars.json`.

- **T1 `t1.crawl_discovery`:** inspect `wire.robots` and `wire.sitemap`.
  Make at least one of those crawl-discovery signals parseable and appropriate
  for the site, then rerun the wire scan. Do not treat `wire.llms_txt_present`
  as a substitute for this requirement; it is a separate, emerging signal.
- **T2 `t2.initial_content`:** inspect `wire.initial_html_content`. Put the
  meaningful page content in the initial HTML available to the HTTP probe,
  rather than relying only on client-side rendering. Then inspect
  `t2.clean_extraction`, which uses `wire.clean_dom` or
  `wire.token_cost_page_weight`.
- **T3 `t3.machine_metadata`:** inspect `wire.json_ld` and
  `wire.open_graph`; `t3.document_outline` uses `wire.single_h1`; and
  `t3.landmarks` uses `wire.semantic_landmarks`. Correct the specific failed
  or partial signal rather than adding every format blindly.
- **T4 `t4.agent_interface`:** inspect the IDs actually present in your run:
  `wire.mcp_server_card`, `wire.openapi_catalog`, `wire.webmcp`,
  `wire.agents_md`, or `source.authored_agent_tools`. This gate is about an
  agent-consumable interface; a source-only run can measure the authored-tools
  check but cannot establish the preceding wire gates.
- **T5:** continue only after T1–T4 pass. The remaining requirements use
  `wire.alt_attributes`, one of `wire.labeled_fields`,
  `wire.accessibility_probe`, or `wire.aria_resolvable`,
  `wire.descriptive_links`, `wire.https`, one of `wire.last_updated` or
  `wire.canonical`, and the `no_known_fail` check
  `both.mcp_tool_count_agreement`.

A partial check below 60 does not satisfy an `any_pass` requirement. A partial
check at 60 or above does, even though the report still surfaces it as a
partial finding for review.

## Rerun and confirm the next step

After the targeted change, rerun with the same target and options:

```sh
ars scan --source . --url https://your-site.com --out ./ars-out
node -e 'const {summary}=require("./ars-out/ars.json"); console.log(summary.tier); console.log(JSON.stringify(summary.gates,null,2))'
```

Confirm that the first blocker changes to `pass` and that the tier advances only
when every preceding gate is also `pass`. Then review the report's top
recommendations and, if this is a deliberate baseline change, compare the
artifacts with:

```sh
ars diff baseline/ars.json ars-out/ars.json
```

ARS checks technical agent-facing signals; clearing a gate is not proof that an
agent can complete a real task, that an answer engine will cite the site, or
that the surface is safe in every context. Add a separate behavioral and
security evaluation for those claims.
