---
type: reference
title: ars diff
---
# ars diff

Compare two `ars.json` artifacts.

```sh
ars diff baseline/ars.json current/ars.json
ars diff baseline/ars.json current/ars.json --fail-on tier-drop,gate-regression
```

`--fail-on <conditions>` exits non-zero on the named comma-separated
regressions. Produce the artifacts with [ars scan](scan.md).
