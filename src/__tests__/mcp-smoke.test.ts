import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const outDir = path.join(root, '.tempor/test-mcp-smoke');

describe('built MCP server (dist/mcp.js)', () => {
  let client: Client;

  beforeAll(async () => {
    await rm(outDir, { force: true, recursive: true });
    client = new Client({ name: 'ars-smoke-client', version: '0.0.0' });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [path.join(root, 'dist/mcp.js')],
        cwd: root,
      })
    );
  }, 30_000);

  afterAll(async () => {
    await client.close();
  });

  it('completes the handshake and lists scan_site', async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(['scan_site']);
  });

  it('reports the package.json version (single-sourced at build)', async () => {
    const { version } = JSON.parse(
      await readFile(path.join(root, 'package.json'), 'utf8')
    ) as { version: string };
    expect(client.getServerVersion()?.version).toBe(version);
  });

  it('executes scan_site end-to-end over stdio', async () => {
    const result = await client.callTool({
      name: 'scan_site',
      arguments: {
        source: 'fixtures/lockfiles/pnpm-project',
        out: outDir,
      },
    });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { tier: string };
    expect(structured.tier).toBe('T0 Unassessed');
  }, 30_000);
});
