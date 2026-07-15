import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readLockfileInventory } from '../lockfile.js';
import type { LockfileInventory } from '../lockfile.js';
import { runSourcePass } from '../source.js';

const fixtures = path.resolve(import.meta.dirname, '../../fixtures/lockfiles');

function pkg(inventory: LockfileInventory | undefined, name: string) {
  return inventory?.packages.find((candidate) => candidate.name === name);
}

describe('readLockfileInventory', () => {
  it('produces byte-identical inventories for identical lockfile input across runs', async () => {
    const projects = [
      'pnpm-project',
      'npm-project',
      'yarn-project',
      'bun-project',
    ];
    for (const project of projects) {
      const root = path.join(fixtures, project);
      const runs = await Promise.all([
        readLockfileInventory(root, ['tiny-dep', 'dev-tool']),
        readLockfileInventory(root, ['tiny-dep', 'dev-tool']),
        readLockfileInventory(root, ['tiny-dep', 'dev-tool']),
      ]);
      expect(JSON.stringify(runs[1]), project).toBe(JSON.stringify(runs[0]));
      expect(JSON.stringify(runs[2]), project).toBe(JSON.stringify(runs[0]));
    }
  });

  it('parses a pnpm v9 lockfile into direct and transitive packages', async () => {
    const inventory = await readLockfileInventory(
      path.join(fixtures, 'pnpm-project'),
      ['tiny-dep', 'dev-tool']
    );

    expect(inventory).toMatchObject({
      lockfile: 'pnpm-lock.yaml',
      format: 'pnpm',
      parsed: true,
      package_count: 4,
      direct_count: 2,
      transitive_count: 2,
    });
    expect(pkg(inventory, 'tiny-dep')).toMatchObject({
      version: '1.0.3',
      direct: true,
    });
    expect(pkg(inventory, 'dev-tool')).toMatchObject({
      version: '2.1.0',
      direct: true,
    });
    expect(pkg(inventory, 'peer-lib')).toMatchObject({
      version: '3.0.0',
      direct: false,
    });
    expect(pkg(inventory, '@scope/util')).toMatchObject({
      version: '0.2.1',
      direct: false,
    });
  });

  it('parses an npm v3 lockfile including nested node_modules entries', async () => {
    const inventory = await readLockfileInventory(
      path.join(fixtures, 'npm-project'),
      ['tiny-dep']
    );

    expect(inventory).toMatchObject({
      lockfile: 'package-lock.json',
      format: 'npm',
      parsed: true,
      package_count: 3,
      direct_count: 1,
      transitive_count: 2,
    });
    expect(pkg(inventory, 'tiny-dep')).toMatchObject({
      version: '1.0.3',
      direct: true,
    });
    expect(pkg(inventory, 'expresss')).toMatchObject({
      version: '4.0.1',
      direct: false,
    });
    expect(pkg(inventory, '@scope/util')).toMatchObject({
      version: '0.2.1',
      direct: false,
    });
  });

  it('parses a classic yarn lockfile and dedupes multi-selector entries', async () => {
    const inventory = await readLockfileInventory(
      path.join(fixtures, 'yarn-project'),
      ['tiny-dep']
    );

    expect(inventory).toMatchObject({
      lockfile: 'yarn.lock',
      format: 'yarn',
      parsed: true,
      package_count: 3,
      direct_count: 1,
      transitive_count: 2,
    });
    expect(pkg(inventory, 'tiny-dep')).toMatchObject({
      version: '1.0.3',
      direct: true,
    });
    expect(pkg(inventory, 'nested-util')).toMatchObject({ version: '0.1.2' });
    expect(pkg(inventory, '@scope/util')).toMatchObject({ version: '0.2.1' });
  });

  it('parses a yarn berry lockfile and skips workspace/metadata entries', async () => {
    const inventory = await readLockfileInventory(
      path.join(fixtures, 'yarn-berry-project'),
      ['tiny-dep']
    );

    expect(inventory).toMatchObject({
      lockfile: 'yarn.lock',
      format: 'yarn',
      parsed: true,
      package_count: 2,
      direct_count: 1,
      transitive_count: 1,
    });
    expect(pkg(inventory, 'tiny-dep')).toMatchObject({
      version: '1.0.3',
      direct: true,
    });
    expect(pkg(inventory, '@scope/util')).toMatchObject({ version: '0.2.1' });
    expect(pkg(inventory, 'yarn-berry-project')).toBeUndefined();
  });

  it('parses a bun text lockfile', async () => {
    const inventory = await readLockfileInventory(
      path.join(fixtures, 'bun-project'),
      ['tiny-dep']
    );

    expect(inventory).toMatchObject({
      lockfile: 'bun.lock',
      format: 'bun',
      parsed: true,
      package_count: 2,
      direct_count: 1,
      transitive_count: 1,
    });
    expect(pkg(inventory, 'tiny-dep')).toMatchObject({
      version: '1.0.3',
      direct: true,
    });
    expect(pkg(inventory, '@scope/util')).toMatchObject({ version: '0.2.1' });
  });

  it('degrades honestly when a lockfile cannot be parsed', async () => {
    const inventory = await readLockfileInventory(
      path.join(fixtures, 'broken-project'),
      ['tiny-dep']
    );

    expect(inventory).toMatchObject({
      lockfile: 'pnpm-lock.yaml',
      format: 'pnpm',
      parsed: false,
      package_count: 0,
      direct_count: 0,
      transitive_count: 0,
    });
    expect(inventory?.packages).toEqual([]);
    expect(inventory?.note).toBeTruthy();
  });

  it('returns undefined when no supported lockfile exists', async () => {
    const inventory = await readLockfileInventory(
      path.resolve(fixtures, '../secure-site'),
      []
    );

    expect(inventory).toBeUndefined();
  });
});

describe('runSourcePass lockfile evidence', () => {
  it('attaches the parsed inventory to lockfile pinning evidence', async () => {
    const checks = await runSourcePass(path.join(fixtures, 'pnpm-project'));
    const pinning = checks.find(
      (candidate) => candidate.id === 'source.lockfile_pinning'
    );

    expect(pinning?.result).toBe('pass');
    expect(pinning?.metadata?.labels).toContain('parsed-lockfile');
    const value = pinning?.source_value as {
      lockfiles: string[];
      inventory?: LockfileInventory;
    };
    expect(value.lockfiles).toEqual(['pnpm-lock.yaml']);
    expect(value.inventory).toMatchObject({
      format: 'pnpm',
      parsed: true,
      package_count: 4,
    });
  });

  it('screens transitive packages for slopsquatting when the inventory parses', async () => {
    const checks = await runSourcePass(path.join(fixtures, 'npm-project'));
    const slop = checks.find(
      (candidate) => candidate.id === 'source.slopsquatting_static_flags'
    );

    expect(slop?.result).toBe('fail');
    const value = slop?.source_value as { flagged: string[] };
    expect(value.flagged).toContain('expresss');
  });

  it('falls back to filename presence when the lockfile cannot be parsed', async () => {
    const checks = await runSourcePass(path.join(fixtures, 'broken-project'));
    const pinning = checks.find(
      (candidate) => candidate.id === 'source.lockfile_pinning'
    );

    expect(pinning?.result).toBe('pass');
    expect(pinning?.metadata?.labels).toContain('file-presence');
    const value = pinning?.source_value as {
      lockfiles: string[];
      inventory?: LockfileInventory;
    };
    expect(value.inventory?.parsed).toBe(false);
  });
});
