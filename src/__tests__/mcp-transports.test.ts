import { type ChildProcess, spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const mcpBin = path.join(root, 'dist/mcp.js');
const outDir = path.join(root, '.tempor/test-mcp-transports');

const ROUND_TRIP_BUDGET_MS = 2000;

const cleanups: (() => Promise<void>)[] = [];

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  await rm(outDir, { force: true, recursive: true });
});

async function roundTrip(client: Client, out: string) {
  const started = performance.now();
  const tools = await client.listTools();
  const result = await client.callTool({
    name: 'scan_site',
    arguments: { source: 'fixtures/lockfiles/pnpm-project', out },
  });
  const elapsed = performance.now() - started;
  return { tools, result, elapsed };
}

describe('MCP transport bindings', () => {
  it('defaults to stdio when launched without flags and round-trips a tool call', async () => {
    const client = new Client({ name: 'transport-test', version: '0.0.0' });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [mcpBin],
        cwd: root,
      })
    );
    cleanups.push(() => client.close());

    const { tools, result, elapsed } = await roundTrip(
      client,
      path.join(outDir, 'stdio')
    );

    expect(tools.tools.map((tool) => tool.name)).toEqual(['scan_site']);
    expect(result.isError).toBeFalsy();
    expect(elapsed).toBeLessThan(ROUND_TRIP_BUDGET_MS);
  }, 30_000);

  it('serves streamable HTTP/SSE only behind the explicit --transport sse flag and round-trips a tool call', async () => {
    const child = spawn(
      process.execPath,
      [mcpBin, '--transport', 'sse', '--port', '0'],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    cleanups.push(
      () =>
        new Promise<void>((resolve) => {
          child.once('exit', () => resolve());
          child.kill();
        })
    );

    const url = await listeningUrl(child);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

    const client = new Client({ name: 'transport-test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
    cleanups.push(() => client.close());

    const { tools, result, elapsed } = await roundTrip(
      client,
      path.join(outDir, 'sse')
    );

    expect(tools.tools.map((tool) => tool.name)).toEqual(['scan_site']);
    expect(result.isError).toBeFalsy();
    expect(elapsed).toBeLessThan(ROUND_TRIP_BUDGET_MS);
  }, 30_000);

  it('rejects unknown transports with a non-zero exit', async () => {
    const child = spawn(
      process.execPath,
      [mcpBin, '--transport', 'carrier-pigeon'],
      { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] }
    );
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const code = await new Promise<number | null>((resolve) => {
      child.once('exit', (exitCode) => resolve(exitCode));
    });

    expect(code).not.toBe(0);
    expect(stderr).toContain('transport');
  }, 15_000);
});

function listeningUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(
      () => reject(new Error(`No listening URL announced. Output: ${buffer}`)),
      10_000
    );
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/(http:\/\/[^\s]+\/mcp)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
