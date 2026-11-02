# Contributing to crooked-pattern

crooked-pattern welcomes useful, reviewable work, whether or not a tool helped write it. The rules below are enforced by checks, not by declarations. Everything under [Guidance](#guidance) is advice that no check enforces.

## What's checked

| Rule | Enforced by | Refusal code |
| --- | --- | --- |
| The description has **Change**, **Verification**, and **Risk** sections, each filled in | `validate-metadata` (required check) | `REFUSE_TEMPLATE_INCOMPLETE`, `REFUSE_CHANGE_EMPTY`, `REFUSE_VERIFICATION_EMPTY`, `REFUSE_RISK_UNCHECKED` |
| Every commit carries `Signed-off-by` with its author's email ([DCO](#legal)); merge commits are skipped | `validate-metadata` | `REFUSE_SIGNOFF_MISSING` |
| A bot opens pull requests only from a branch of this repository, which needs write access an administrator grants | `validate-metadata` | `REFUSE_BOT_UNAUTHORIZED` |
| Contributors without write access have at most two open non-draft pull requests (drafts don't count) | `validate-metadata` | `REFUSE_OPEN_PR_LIMIT` |
| Contributors without write access target the default branch | `validate-metadata` | `REFUSE_BASE_BRANCH` |
| Contributors without write access change at most 5,000 lines and 300 files per pull request | `validate-metadata` | `REFUSE_TOO_LARGE` |
| Merging needs the required checks to pass and the reviews your mode requires; nobody can force-push or delete the default branch | Branch protection set by `configure_repository.py` | — |
| Changes to workflows, security, dependencies, release machinery, policy, or agent instructions need the owners in `.github/CODEOWNERS` (contributor and team modes) | Branch protection (code-owner review) | — |
| crooked-pattern reruns its own checks; your report of what you ran is context, not evidence | Project CI | — |

Each refusal says how to fix it. After fixing, push or edit the description to re-run the check.

## Working with us

Use a draft pull request while work is incomplete; the checks above wait until you mark it ready for review. When you've addressed review, push your changes and reply, or press **Re-request review**. Either one hands the pull request back to a maintainer. Labels show whose turn it is: `queue:awaiting-author` is yours, `queue:awaiting-reviewer` is ours. An automated review may comment on your change first; it's advisory and can't approve.

## Guidance

No check enforces these; maintainers may still ask you to follow them.

- Open or reference an accepted issue before starting a feature or public API change, a cross-cutting refactor, a dependency change, security-sensitive work, or a significant build, workflow, release, or policy change. Small fixes and documentation corrections can skip this.
- Solve one coherent problem per pull request. Maintainers may ask you to split unrelated, generated, mechanical, or otherwise unreviewable changes.
- Read the whole diff and be ready to explain and revise it, whoever or whatever wrote it.
- Don't publish raw transcripts that may contain secrets, personal data, or restricted source material.
- Don't post substantive answers as though they were the accountable person's judgment when a tool wrote them.
- Maintainers moderate observable behavior and policy violations, not guesses that writing "looks AI-generated."
- Autonomous agents work through a person's account. That person signs off the agent's pull requests, verifies them, and answers for its issues, reviews, and comments too.

Passing every check does not guarantee acceptance.

## Legal

crooked-pattern uses the [Developer Certificate of Origin 1.1](https://developercertificate.org/). Sign off every commit (`git commit -s`):

```text
Signed-off-by: Your Name <your.email@example.com>
```

The sign-off is the one agreement you make: whoever signs off answers for the change. A project adopting crooked-pattern can use a contributor license agreement (CLA) instead: set the `HELICOPTER_SIGNOFF` repository variable to `off`, replace this section with the CLA's terms, and add the CLA check.

Maintainers also sign their commits (`git commit -S`); outside contributors don't have to.

## Security and conduct

Report vulnerabilities privately as described in `SECURITY.md`. Follow `CODE_OF_CONDUCT.md` in all project spaces.
