import { randomUUID } from 'node:crypto';
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createArsMcpServer } from './server.js';

interface McpHttpOptions {
  port: number;
  host?: string;
}

interface McpHttpHandle {
  url: string;
  close(): Promise<void>;
}

const ENDPOINT = '/mcp';

// Opt-in streamable HTTP/SSE binding (scope freeze D3): only reachable when
// the operator passes --transport sse; stdio stays the no-flag default and
// nothing here is activated implicitly. Binds loopback unless told otherwise.
export async function serveMcpOverHttp(
  options: McpHttpOptions
): Promise<McpHttpHandle> {
  const host = options.host ?? '127.0.0.1';
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const server = createServer((request, response) => {
    handleMcpRequest(request, response, sessions).catch((error) => {
      if (!response.headersSent) response.writeHead(500);
      response.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32_603,
            message: error instanceof Error ? error.message : String(error),
          },
          id: null,
        })
      );
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, host, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Could not determine MCP HTTP listen address.');

  return {
    url: `http://${host}:${address.port}${ENDPOINT}`,
    close: () => closeAll(server, sessions),
  };
}

async function handleMcpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, StreamableHTTPServerTransport>
): Promise<void> {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname !== ENDPOINT) {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
    return;
  }

  const sessionId = request.headers['mcp-session-id'];
  const existing =
    typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;
  if (existing) {
    await existing.handleRequest(request, response);
    return;
  }

  if (request.method !== 'POST') {
    response.writeHead(400, { 'content-type': 'text/plain' });
    response.end('missing or unknown mcp-session-id');
    return;
  }

  // New session: the first POST (initialize) creates a dedicated transport.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, transport);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };
  await createArsMcpServer().connect(transport);
  await transport.handleRequest(request, response);
}

async function closeAll(
  server: Server,
  sessions: Map<string, StreamableHTTPServerTransport>
): Promise<void> {
  await Promise.all([...sessions.values()].map((session) => session.close()));
  sessions.clear();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
