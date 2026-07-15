import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../..');

async function packedFiles(directory: string): Promise<string[]> {
  // --ignore-scripts keeps lifecycle output (lefthook prepare) out of the
  // JSON; hashed tsup chunk names are normalized so the allowlist is stable.
  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--dry-run', '--ignore-scripts', '--json'],
    { cwd: directory }
  );
  const [result] = JSON.parse(stdout) as { files: { path: string }[] }[];
  return result.files
    .map((file) => file.path.replace(/chunk-[A-Z0-9]+\.js/, 'chunk-*.js'))
    .sort();
}

async function allowlist(name: string): Promise<string[]> {
  const text = await readFile(path.join(root, 'docs/packaging', name), 'utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .sort();
}

describe('package tarball allowlists', () => {
  it('crooked-pattern tarball matches the committed allowlist exactly', async () => {
    const files = await packedFiles(root);

    expect(files).toEqual(await allowlist('crooked-pattern.txt'));
    expect(files.some((file) => file.startsWith('fixtures/'))).toBe(false);
    expect(files.some((file) => file.includes('.tempor'))).toBe(false);
    expect(files.some((file) => file.includes('coverage'))).toBe(false);
    expect(files.some((file) => file.includes('__tests__'))).toBe(false);
  }, 30_000);

  it('crooked-pattern-mcp wrapper tarball matches the committed allowlist exactly', async () => {
    const wrapperRoot = path.join(root, 'packages/crooked-pattern-mcp');
    const files = await packedFiles(wrapperRoot);

    expect(files).toEqual(await allowlist('crooked-pattern-mcp.txt'));
  }, 30_000);

  it('declares publish metadata for both packages', async () => {
    const main = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8')
    ) as Record<string, unknown>;
    const wrapper = JSON.parse(
      await readFile(
        path.join(root, 'packages/crooked-pattern-mcp/package.json'),
        'utf8'
      )
    ) as Record<string, unknown>;

    expect(main.name).toBe('@grosspoetrysystems/crooked-pattern');
    expect(main.license).toBe('MIT');
    expect(main.files).toBeDefined();
    // A bin matching the package's unscoped name lets `npx <pkg> <args>`
    // resolve an executable; without it npx errors on a multi-bin package.
    expect((main.bin as Record<string, string>)['crooked-pattern']).toBe(
      'dist/cli.js'
    );
    expect((main.bin as Record<string, string>).ars).toBe('dist/cli.js');
    expect((main.publishConfig as Record<string, string>)?.access).toBe(
      'public'
    );
    expect(wrapper.name).toBe('@grosspoetrysystems/crooked-pattern-mcp');
    expect(wrapper.license).toBe('MIT');
    expect(wrapper.version).toBe(main.version);
    expect(
      (wrapper.dependencies as Record<string, string>)[
        '@grosspoetrysystems/crooked-pattern'
      ]
    ).toBe(main.version);
    expect((wrapper.bin as Record<string, string>)['ars-mcp']).toBeDefined();
    expect((wrapper.publishConfig as Record<string, string>)?.access).toBe(
      'public'
    );
  });

  it('keeps the CLI and MCP server versions in lockstep with package.json', async () => {
    const main = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8')
    ) as { version: string };

    const { stdout } = await execFileAsync(
      process.execPath,
      [path.join(root, 'dist/cli.js'), '--version'],
      { cwd: root }
    );
    expect(stdout.trim()).toBe(main.version);

    const serverSource = await readFile(
      path.join(root, 'src/mcp/server.ts'),
      'utf8'
    );
    expect(serverSource).toContain(`version: '${main.version}'`);
  }, 30_000);
});
