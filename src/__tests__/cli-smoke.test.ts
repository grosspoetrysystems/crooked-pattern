import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../..');
const site = path.join(root, 'site');

describe('built CLI', () => {
  it('has exactly one shebang after build', async () => {
    const built = await readFile(path.join(root, 'dist/cli.js'), 'utf8');

    expect(built.startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect([...built.matchAll(/^#!/gm)]).toHaveLength(1);
  }, 30_000);

  it('runs help and a minimal source scan from dist', async () => {
    const help = await execFileAsync('node', ['dist/cli.js', '--help'], {
      cwd: root,
    });
    expect(help.stdout).toContain('scan');
    expect(help.stdout).toContain('diff');

    const outDir = path.join(root, '.tempor/test-cli-smoke');
    await rm(outDir, { force: true, recursive: true });
    await mkdir(outDir, { recursive: true });

    await execFileAsync(
      'node',
      ['dist/cli.js', 'scan', '--source', '.', '--out', outDir],
      { cwd: root }
    );

    await expect(
      readFile(path.join(outDir, 'ars.json'), 'utf8')
    ).resolves.toContain('"schema_version": "ars.v1"');
    await expect(
      readFile(path.join(outDir, 'ars-report.md'), 'utf8')
    ).resolves.toContain('Agentic Readiness Report');
  }, 30_000);

  it('reads the bundled docs corpus from an unrelated cwd', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'ars-docs-smoke-'));
    try {
      const graph = await readFile(path.join(site, 'graph.json'));
      const { stdout: indexText } = await execFileAsync(
        process.execPath,
        [path.join(root, 'dist/cli.js'), 'docs', '--json'],
        { cwd }
      );
      const index = JSON.parse(indexText) as {
        revision: string;
        documents: Array<{ path: string }>;
      };

      expect(index.revision).toBe(
        createHash('sha256').update(graph).digest('hex')
      );
      expect(
        index.documents.map(({ path: documentPath }) => documentPath)
      ).toEqual([
        '/index.md',
        '/scan.md',
        '/diff.md',
        '/methodology.md',
        '/releasing.md',
      ]);

      const { stdout: document } = await execFileAsync(
        process.execPath,
        [path.join(root, 'dist/cli.js'), 'docs', 'scan.md'],
        { cwd }
      );
      expect(document.trimEnd()).toBe(
        (await readFile(path.join(site, 'scan.md'), 'utf8')).trimEnd()
      );
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  }, 30_000);
});
