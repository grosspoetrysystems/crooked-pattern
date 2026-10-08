---
type: reference
title: ars scan
---
# ars scan

Run source and/or wire ARS checks.

```sh
ars scan --url https://your-site.com --out ./ars-out
ars scan --source . --out ./ars-out
ars scan --source . --url https://your-site.com --osv-report osv.json --out ./ars-out
```

| Option | Meaning |
|---|---|
| `--source <path>` | source repository path |
| `--url <url>` | live URL for wire checks |
| `--rendered` | use the optional rendered DOM adapter for wire checks (requires Playwright to be installed separately) |
| `--osv-report <file>` | OSV evidence: contract JSON or raw `osv-scanner --format json` output |
| `--socket-report <file>` | Socket evidence: contract JSON or Socket facts JSON |
| `--semgrep-report <file>` | Semgrep evidence: contract JSON or raw `semgrep --json` output |
| `--out <dir>` | output directory for `ars.json` and `ars-report.md` (default `.`) |

Writes `ars.json` and `ars-report.md`. How each check is scored is in
[Methodology](methodology.md); to gate CI on a regression, see [ars diff](diff.md).
