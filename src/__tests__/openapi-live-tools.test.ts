import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reconcileChecks } from '../reconcile.js';
import { runSourcePass } from '../source.js';
import type { CheckResult } from '../types.js';
import { runWirePass } from '../wire.js';

const authoredDocument = {
  openapi: '3.0.0',
  paths: {
    '/catalogue.json': { get: {} },
    '/llms.txt': { get: {} },
  },
};
const oneOperationDocument = {
  openapi: '3.0.0',
  paths: {
    '/catalogue.json': { get: {} },
  },
};
const extraOperationDocument = {
  openapi: '3.0.0',
  paths: {
    '/catalogue.json': { get: {} },
    '/llms.txt': { get: {} },
    '/extra.json': { post: {} },
  },
};

let server: Server;
let port: number;
let sourceRoot: string;
let liveDocument: object = authoredDocument;

beforeAll(async () => {
  sourceRoot = await mkdtemp(
    path.join(os.tmpdir(), 'crooked-pattern-openapi-')
  );
  await writeFile(
    path.join(sourceRoot, 'openapi.json'),
    JSON.stringify(authoredDocument)
  );

  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html><body><h1>OpenAPI fixture</h1></body></html>');
      return;
    }
    if (pathname === '/openapi.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(liveDocument));
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Could not bind OpenAPI fixture server.');
  port = address.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await rm(sourceRoot, { recursive: true, force: true });
});

describe('OpenAPI operations in live-tool reconciliation', () => {
  it('passes when authored and live OpenAPI operations match without an MCP card', async () => {
    liveDocument = authoredDocument;
    const checks = await scan();
    const agreement = findCheck(checks, 'both.mcp_tool_count_agreement');
    const openapi = findCheck(checks, 'wire.openapi_catalog');

    expect(agreement?.result).toBe('pass');
    expect(agreement?.reconciliation?.wire_tools).toEqual([
      'GET /catalogue.json',
      'GET /llms.txt',
    ]);
    expect(agreement?.notes.join(' ')).toContain('OpenAPI operations (2)');
    expect((openapi?.wire_value as { tools: string[] }).tools).toEqual([
      'GET /catalogue.json',
      'GET /llms.txt',
    ]);
    expect(findCheck(checks, 'wire.rule_of_two')?.result).toBe('unknown');
    expect(findCheck(checks, 'wire.manifest_pinning')?.result).toBe('unknown');
    expect(findCheck(checks, 'wire.oauth_scope_tightness')?.result).toBe(
      'unknown'
    );
  });

  it('fails when a live OpenAPI operation is missing from authored source', async () => {
    liveDocument = extraOperationDocument;
    const checks = await scan();
    const agreement = findCheck(checks, 'both.mcp_tool_count_agreement');

    expect(agreement?.result).toBe('fail');
    expect(agreement?.reconciliation?.undocumented_tools).toEqual([
      'POST /extra.json',
    ]);
  });

  it('fails when an authored OpenAPI operation is missing from the live document', async () => {
    liveDocument = oneOperationDocument;
    const checks = await scan();
    const agreement = findCheck(checks, 'both.mcp_tool_count_agreement');

    expect(agreement?.result).toBe('fail');
    expect(agreement?.reconciliation?.missing_live_tools).toEqual([
      'GET /llms.txt',
    ]);
  });
});

async function scan() {
  const checks: CheckResult[] = [
    ...(await runSourcePass(sourceRoot)),
    ...(await runWirePass(`http://127.0.0.1:${port}`)),
  ];
  reconcileChecks(checks);
  return checks;
}

function findCheck(checks: CheckResult[], id: string) {
  return checks.find((candidate) => candidate.id === id);
}
