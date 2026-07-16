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

## Branch model

Work lands on feature branches → PR into `dev` (CI runs). When `dev` is release-ready, promote it to `main` via a release PR. `main` is the production line and is protected (PR + passing CI required); it only ever holds shipped-or-next code.

## Cutting a release

The version is single-sourced from `package.json` (injected into the CLI and MCP server at build time), so a release bumps **one** number. `pnpm bump` does the lockstep bump across both packages and the wrapper's dependency pin, and stubs a CHANGELOG entry.

```sh
# on dev (or a release branch cut from dev):
pnpm bump patch          # or minor | major | X.Y.Z
# fill in the CHANGELOG bullets it stubbed, then:
git commit -am "chore: release vX.Y.Z"
# open a PR dev -> main and merge it (CI must pass).
```

Then **go to production** one of two ways:

```sh
# A) tag the merge commit on main:
git tag vX.Y.Z && git push origin vX.Y.Z        # triggers publish.yml

# B) or the button: Actions -> publish -> Run workflow -> branch: main
#    (publishes main's current package.json version)
```

The workflow runs in two isolated jobs:

- **build** installs dependencies, checks the tag matches the package version, runs the full `pnpm verify` + `pnpm coverage` gate, and uploads the built `dist/` as an artifact. This job runs all third-party code (dependency install scripts, the build) but has **no** `id-token` — so a compromised build dependency has no publish credential to steal or use.
- **publish** holds the OIDC `id-token` but runs no third-party code: it checks out our own source, pulls in the prebuilt `dist/`, and **pauses for approval** at the `release` environment. Approve it (Actions run → "Review deployments") and it publishes both packages with provenance over OIDC from the prebuilt artifact.

All Actions are pinned to commit SHAs (Dependabot keeps them current), so a moved or compromised action tag cannot change what runs.

### Gotcha: the workflow must exist at the tagged commit

GitHub runs the version of `publish.yml` that exists **at the tagged commit**. A tag that points at a commit predating this workflow will not trigger it. If you need to (re)publish an older version, move the tag onto a commit that contains `.github/workflows/publish.yml`:

```sh
git tag -f vX.Y.Z            # move tag to a commit that has the workflow
git push origin vX.Y.Z --force
```

The published npm tarball is unaffected — `files` only ships `dist` + `CHANGELOG.md`, never `.github/`.

## Testing the pipeline safely

The approval gate makes it safe to validate the real publish path with a real version: trigger a tag, watch the run pause, and only approve once you have confirmed verify passed. If the publish step fails (e.g. a misconfigured trusted publisher), nothing is published and the previous version stays live — fix and re-run.
