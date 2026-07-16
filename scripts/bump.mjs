#!/usr/bin/env node
// Lockstep version bump for the release flow. Bumps both package versions and
// the wrapper's dependency pin in one place, and stubs a CHANGELOG entry, so a
// release never means hand-editing versions across files.
//
//   pnpm bump patch | minor | major | <X.Y.Z>
//
// Then fill in the CHANGELOG bullets, commit, open the dev -> main PR, and tag
// the merge (or dispatch the publish workflow on main). See docs/releasing.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = new URL('../', import.meta.url);
const read = (rel) => fileURLToPath(new URL(rel, repo));

const arg = process.argv[2];
if (!arg) {
  console.error('usage: pnpm bump <patch|minor|major|X.Y.Z>');
  process.exit(1);
}

const mainPath = read('package.json');
const wrapperPath = read('packages/crooked-pattern-mcp/package.json');
const changelogPath = read('CHANGELOG.md');

const main = JSON.parse(readFileSync(mainPath, 'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(main.version);
if (!match) {
  console.error(`Cannot parse current version: ${main.version}`);
  process.exit(1);
}
const [major, minor, patch] = match.slice(1).map(Number);

let next;
if (arg === 'patch') next = `${major}.${minor}.${patch + 1}`;
else if (arg === 'minor') next = `${major}.${minor + 1}.0`;
else if (arg === 'major') next = `${major + 1}.0.0`;
else if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else {
  console.error(`Invalid bump "${arg}" — use patch, minor, major, or X.Y.Z.`);
  process.exit(1);
}

main.version = next;
writeFileSync(mainPath, `${JSON.stringify(main, null, 2)}\n`);

const wrapper = JSON.parse(readFileSync(wrapperPath, 'utf8'));
wrapper.version = next;
wrapper.dependencies['@grosspoetrysystems/crooked-pattern'] = next;
writeFileSync(wrapperPath, `${JSON.stringify(wrapper, null, 2)}\n`);

const date = new Date().toISOString().slice(0, 10);
const changelog = readFileSync(changelogPath, 'utf8');
const anchor = '# Changelog\n\n';
if (!changelog.startsWith(anchor)) {
  console.error('CHANGELOG.md does not start with the expected header.');
  process.exit(1);
}
writeFileSync(
  changelogPath,
  changelog.replace(anchor, `${anchor}## ${next} — ${date}\n\n- \n\n`)
);

console.log(`Bumped both packages to ${next} and stubbed a CHANGELOG entry.`);
console.log('Next: fill in the CHANGELOG bullets, then:');
console.log(`  git commit -am "chore: release v${next}"   # on dev, then PR to main`);
console.log(`  git tag v${next} && git push origin v${next}   # after the PR merges to main`);
