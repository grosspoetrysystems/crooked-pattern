# Releasing

Publishing is done by CI (`.github/workflows/publish.yml`) via npm **trusted publishing** (OIDC) with **provenance**. There is no npm token stored anywhere, and no interactive 2FA in the release path. The deliberate human gate lives in a required-approval GitHub Environment instead.

## One-time setup

1. **Grant the `workflow` scope** so workflow files can be pushed (GitHub blocks pushing `.github/workflows/*` otherwise):
   ```sh
   gh auth refresh -h github.com -s workflow
   # if git still rejects (keychain cached the old token): gh auth setup-git
   ```

2. **Create the `release` environment** — repo → Settings → Environments → New environment → `release` → add yourself (or the studio account) as a **Required reviewer**. This is the approval gate; without a required reviewer the publish job would not pause.

3. **Configure a trusted publisher for each package** on npmjs.com — for both `@grosspoetrysystems/crooked-pattern` and `@grosspoetrysystems/crooked-pattern-mcp`: package Settings → Trusted Publisher → GitHub Actions →
   - Organization/owner: `grosspoetrysystems`
   - Repository: `crooked-pattern`
   - Workflow filename: `publish.yml`
   - Environment: `release`

   Each package allows exactly one trusted publisher.

## Cutting a release

```sh
# bump the version in package.json + packages/crooked-pattern-mcp/package.json
# (keep them in lockstep; update cli.ts/server.ts/server-card.json versions),
# add a CHANGELOG entry, then:
git commit -am "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin master
git push origin vX.Y.Z          # this triggers publish.yml
```

The workflow: checks out the tag, installs frozen deps, verifies the tag matches the package version, runs `pnpm verify`, then **pauses for approval** at the `release` environment. Approve it (Actions run → "Review deployments") and it publishes both packages with provenance over OIDC.

### Gotcha: the workflow must exist at the tagged commit

GitHub runs the version of `publish.yml` that exists **at the tagged commit**. A tag that points at a commit predating this workflow will not trigger it. If you need to (re)publish an older version, move the tag onto a commit that contains `.github/workflows/publish.yml`:

```sh
git tag -f vX.Y.Z            # move tag to a commit that has the workflow
git push origin vX.Y.Z --force
```

The published npm tarball is unaffected — `files` only ships `dist` + `CHANGELOG.md`, never `.github/`.

## Testing the pipeline safely

The approval gate makes it safe to validate the real publish path with a real version: trigger a tag, watch the run pause, and only approve once you have confirmed verify passed. If the publish step fails (e.g. a misconfigured trusted publisher), nothing is published and the previous version stays live — fix and re-run.
