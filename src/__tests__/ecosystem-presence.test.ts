import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runSourcePass } from '../source.js';

const fixtures = path.resolve(import.meta.dirname, '../../fixtures');

async function ecosystemCheck(project: string) {
  const checks = await runSourcePass(project);
  const found = checks.find(
    (candidate) => candidate.id === 'source.ecosystem_presence'
  );
  if (!found) throw new Error('source.ecosystem_presence missing');
  return found;
}

describe('non-Node ecosystem presence detection', () => {
  it('reports unknown for Node-only projects with nothing to assess', async () => {
    const check = await ecosystemCheck(
      path.join(fixtures, 'lockfiles/pnpm-project')
    );

    expect(check.result).toBe('unknown');
    expect(check.notes.join(' ')).toMatch(/no non-node ecosystem/i);
  });

  it('passes when every detected ecosystem has pinning evidence', async () => {
    const check = await ecosystemCheck(
      path.join(fixtures, 'ecosystems/rust-pinned')
    );

    expect(check.result).toBe('pass');
    const value = check.source_value as {
      ecosystems: { name: string; manifests: string[]; lockfiles: string[] }[];
    };
    expect(value.ecosystems).toEqual([
      { name: 'rust', manifests: ['Cargo.toml'], lockfiles: ['Cargo.lock'] },
    ]);
  });

  it('is partial when some detected ecosystems lack pinning evidence', async () => {
    const check = await ecosystemCheck(
      path.join(fixtures, 'ecosystems/mixed-pinned-unpinned')
    );

    expect(check.result).toBe('partial');
    expect(check.notes.join(' ')).toContain('go');
    const value = check.source_value as {
      ecosystems: { name: string; lockfiles: string[] }[];
    };
    const go = value.ecosystems.find((entry) => entry.name === 'go');
    expect(go?.lockfiles).toEqual([]);
    const python = value.ecosystems.find((entry) => entry.name === 'python');
    expect(python?.lockfiles).toEqual(['poetry.lock']);
  });

  it('labels the evidence as presence-level, not parsed inventory', async () => {
    const check = await ecosystemCheck(
      path.join(fixtures, 'ecosystems/rust-pinned')
    );

    expect(check.metadata?.labels).toContain('file-presence');
    expect(check.metadata?.status).toBe('partial');
  });
});
