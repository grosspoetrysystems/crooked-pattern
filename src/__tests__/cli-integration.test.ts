import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ArsArtifact } from '../types.js';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../..');
const cli = path.join(root, 'dist/cli.js');
const outRoot = path.join(root, '.tempor/test-cli-integration');

interface FixtureServer {
  server: Server;
  url: string;
}

describe('CLI integration pipeline', () => {
  let secure: FixtureServer;
  let insecure: FixtureServer;

  beforeAll(async () => {
    await execFileAsync('pnpm', ['build'], { cwd: root });
    await rm(outRoot, { force: true, recursive: true });
    await mkdir(outRoot, { recursive: true });

    secure = await serveFixture(path.join(root, 'fixtures/secure-site'));
    insecure = await serveFixture(path.join(root, 'fixtures/insecure-site'));
  }, 30_000);

  afterAll(async () => {
    await Promise.all([
      closeServer(secure?.server),
      closeServer(insecure?.server),
    ]);
  });

  it('writes source-only JSON and markdown artifacts with unassessed wire categories', async () => {
    const outDir = path.join(outRoot, 'source');
    await runCli(['scan', '--source', '.', '--out', outDir]);

    const artifact = await readArtifact(outDir);
    expect(artifact.schema_version).toBe('ars.v1');
    expect(artifact.summary.measured_categories).toBeLessThan(
      artifact.summary.total_categories
    );
    expect(artifact.summary.categories.agent_operability?.result).toBe(
      'assessed'
    );
    expect(artifact.summary.categories.crawl_access?.result).toBe('unassessed');

    const report = await readFile(path.join(outDir, 'ars-report.md'), 'utf8');
    expect(report).toContain('Agentic Readiness Score Report');
    expect(report).toContain('categories measured');
  });

  it('scores secure and insecure wire fixtures through the built CLI', async () => {
    const secureOut = path.join(outRoot, 'secure');
    const insecureOut = path.join(outRoot, 'insecure');
    await runCli(['scan', '--url', secure.url, '--out', secureOut]);
    await runCli(['scan', '--url', insecure.url, '--out', insecureOut]);

    const secureArtifact = await readArtifact(secureOut);
    const insecureArtifact = await readArtifact(insecureOut);

    expect(findCheck(secureArtifact, 'wire.llms_txt_present')?.result).toBe(
      'pass'
    );
    expect(
      findCheck(secureArtifact, 'wire.initial_html_content')?.metadata
        ?.confidence
    ).toBe('heuristic');
    expect(secureArtifact.summary.exposure_multiplier).toBe(1);

    const liveTools = findCheck(insecureArtifact, 'wire.mcp_server_card')
      ?.wire_value as
      | { live_tool_count?: number; tools?: string[] }
      | undefined;
    expect(liveTools?.live_tool_count).toBe(3);
    expect(liveTools?.tools).toContain('transfer_payment');
    expect(findCheck(insecureArtifact, 'wire.rule_of_two')?.result).toBe(
      'fail'
    );
    expect(insecureArtifact.summary.exposure_multiplier).toBeLessThan(1);
  }, 30_000);

  it('diffs generated artifacts', async () => {
    const securePath = path.join(outRoot, 'secure/ars.json');
    const insecurePath = path.join(outRoot, 'insecure/ars.json');

    const diff = await runCli(['diff', securePath, insecurePath]);

    expect(diff.stdout).toContain('# ARS Diff');
    expect(diff.stdout).toContain('ARS final:');
    expect(diff.stdout).toContain('Exposure multiplier:');
    expect(diff.stdout).toContain('wire.rule_of_two');
  });
});

function runCli(args: string[]) {
  return execFileAsync('node', [cli, ...args], {
    cwd: root,
    maxBuffer: 1024 * 1024 * 10,
  });
}

async function readArtifact(outDir: string) {
  const raw = await readFile(path.join(outDir, 'ars.json'), 'utf8');
  return JSON.parse(raw) as ArsArtifact;
}

function findCheck(artifact: ArsArtifact, id: string) {
  return artifact.checks.find((check) => check.id === id);
}

async function serveFixture(directory: string): Promise<FixtureServer> {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const safePath = path
      .normalize(decodeURIComponent(requestUrl.pathname))
      .replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(
      directory,
      safePath === '/' ? 'index.html' : safePath
    );

    try {
      const file = await stat(filePath);
      if (!file.isFile()) {
        response.writeHead(404);
        response.end('not found');
        return;
      }

      response.writeHead(200, { 'content-type': contentType(filePath) });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Could not bind fixture server.');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server | undefined) {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function contentType(filePath: string) {
  if (filePath.endsWith('.json')) return 'application/json';
  if (filePath.endsWith('.xml')) return 'application/xml';
  if (filePath.endsWith('.txt')) return 'text/plain';
  if (filePath.endsWith('.md')) return 'text/markdown';
  return 'text/html';
}
