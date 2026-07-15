import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runSourcePass } from '../source.js';

const root = path.resolve(import.meta.dirname, '../..');
const scratch = path.join(root, '.tempor/test-source-hardening');

async function freshDir(name: string) {
  const dir = path.join(scratch, name);
  await rm(dir, { force: true, recursive: true });
  await mkdir(dir, { recursive: true });
  return dir;
}

function findCheck(
  checks: Awaited<ReturnType<typeof runSourcePass>>,
  id: string
) {
  return checks.find((candidate) => candidate.id === id);
}

afterAll(async () => {
  await rm(scratch, { force: true, recursive: true });
});

describe('source pass hardening', () => {
  it('survives dangling symlinks instead of aborting the scan', async () => {
    const dir = await freshDir('dangling-symlink');
    await writeFile(path.join(dir, 'package.json'), '{"name":"x"}');
    await symlink(
      path.join(dir, 'does-not-exist'),
      path.join(dir, 'broken-link')
    );

    const checks = await runSourcePass(dir);

    expect(findCheck(checks, 'source.package_manifest')?.result).toBe('pass');
  });

  it('does not recurse forever on symlink cycles', async () => {
    const dir = await freshDir('symlink-cycle');
    await writeFile(path.join(dir, 'package.json'), '{"name":"x"}');
    await mkdir(path.join(dir, 'nested'));
    await symlink(dir, path.join(dir, 'nested/loop'));

    const checks = await runSourcePass(dir);

    expect(findCheck(checks, 'source.package_manifest')?.result).toBe('pass');
  }, 15_000);

  it('reports provenance as unknown when no CI workflows exist to inspect', async () => {
    const dir = await freshDir('no-ci');
    await writeFile(path.join(dir, 'package.json'), '{"name":"x"}');

    const checks = await runSourcePass(dir);
    const provenance = findCheck(checks, 'source.provenance_signing');

    expect(provenance?.result).toBe('unknown');
    expect(provenance?.notes.join(' ')).toMatch(/no ci workflows/i);
  });

  it('does not count UI component naming as authored agent tools', async () => {
    const dir = await freshDir('ui-components');
    await writeFile(path.join(dir, 'package.json'), '{"name":"x"}');
    await writeFile(
      path.join(dir, 'tooltip.tsx'),
      'export const Tooltip = () => null;\nconst config = { name: "close-button" };\n'
    );
    await writeFile(
      path.join(dir, 'toolbar.ts'),
      'register("toolbar-item");\n'
    );

    const checks = await runSourcePass(dir);
    const authored = findCheck(checks, 'source.authored_agent_tools');

    expect(authored?.result).toBe('unknown');
    expect((authored?.source_value as { tools: string[] }).tools).toEqual([]);
  });

  it('still detects genuine MCP tool registrations', async () => {
    const dir = await freshDir('real-mcp');
    await writeFile(path.join(dir, 'package.json'), '{"name":"x"}');
    await writeFile(
      path.join(dir, 'mcp-server.ts'),
      "server.registerTool('scan_site', {}, async () => ({}));\n"
    );

    const checks = await runSourcePass(dir);
    const authored = findCheck(checks, 'source.authored_agent_tools');

    expect((authored?.source_value as { tools: string[] }).tools).toContain(
      'scan_site'
    );
  });
});
