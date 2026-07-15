#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { serveMcpOverHttp } from '../mcp/http.js';
import { createArsMcpServer } from '../mcp/server.js';

interface McpBinOptions {
  transport: 'stdio' | 'sse';
  port: number;
}

const DEFAULT_SSE_PORT = 3339;

function parseArgs(argv: string[]): McpBinOptions {
  const options: McpBinOptions = { transport: 'stdio', port: DEFAULT_SSE_PORT };
  const queue = [...argv];
  while (queue.length > 0) {
    const arg = queue.shift();
    if (arg === '--transport') {
      const value = queue.shift();
      if (value !== 'stdio' && value !== 'sse')
        throw new Error(
          `Unknown transport ${JSON.stringify(value)}; expected "stdio" (default) or "sse".`
        );
      options.transport = value;
    } else if (arg === '--port') {
      const raw = queue.shift();
      const value = Number(raw);
      if (!raw || !Number.isInteger(value) || value < 0 || value > 65_535)
        throw new Error(`Invalid --port value ${JSON.stringify(raw)}.`);
      options.port = value;
    } else {
      throw new Error(
        `Unknown argument ${JSON.stringify(arg)}. Usage: ars-mcp [--transport stdio|sse] [--port <n>]`
      );
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.transport === 'sse') {
    const handle = await serveMcpOverHttp({ port: options.port });
    // stdout is free in HTTP mode; announce the endpoint for operators/tests.
    console.log(`ars-mcp listening on ${handle.url}`);
    return;
  }
  await createArsMcpServer().connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
