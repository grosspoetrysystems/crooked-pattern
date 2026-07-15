import { type Server, createServer } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { RULE_OF_TWO_LEXICON } from '../registry.js';
import type { CheckResult } from '../types.js';
import { runWirePass } from '../wire.js';

const HTML = '<html><body><h1>Fixture</h1><p>Plain page.</p></body></html>';

const servers: Server[] = [];

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

async function scanWithCard(card: unknown): Promise<CheckResult[]> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/.well-known/mcp/server-card.json') {
      if (card === undefined) {
        response.writeHead(404);
        response.end('not found');
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(card));
      return;
    }
    if (pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(HTML);
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Could not bind fixture server.');
  const checks = await runWirePass(`http://127.0.0.1:${address.port}`);
  const check = checks.find((entry) => entry.id === 'wire.rule_of_two');
  if (!check) throw new Error('wire.rule_of_two missing from wire pass');
  return checks;
}

function ruleOfTwo(checks: CheckResult[]) {
  const found = checks.find((entry) => entry.id === 'wire.rule_of_two');
  if (!found) throw new Error('wire.rule_of_two missing');
  return found;
}

describe('rule-of-two v0.1 over declared MCP tool schemas', () => {
  it('exports a versioned classifier lexicon from the registry', () => {
    expect(RULE_OF_TWO_LEXICON.version).toBe('0.1');
    expect(
      RULE_OF_TWO_LEXICON.classes.untrusted_content.length
    ).toBeGreaterThan(0);
    expect(RULE_OF_TWO_LEXICON.classes.private_data.length).toBeGreaterThan(0);
    expect(RULE_OF_TWO_LEXICON.classes.side_effects.length).toBeGreaterThan(0);
  });

  it('reports unknown when no MCP tool schemas are discoverable', async () => {
    const check = ruleOfTwo(await scanWithCard(undefined));

    expect(check.result).toBe('unknown');
    expect(check.score).toBe(0);
    expect(check.notes.join(' ')).toMatch(/no .*tool schemas/i);
  });

  it('passes an explicitly empty declared toolset', async () => {
    const check = ruleOfTwo(await scanWithCard({ tools: [] }));

    expect(check.result).toBe('pass');
  });

  it('passes tools whose declared schemas match no risk class', async () => {
    const check = ruleOfTwo(
      await scanWithCard({
        tools: [
          {
            name: 'get_weather',
            description: 'Returns the local forecast.',
            inputSchema: {
              type: 'object',
              properties: { city: { type: 'string' } },
            },
          },
        ],
      })
    );

    expect(check.result).toBe('pass');
  });

  it('fails when a single tool spans untrusted content, private data, and side effects', async () => {
    const check = ruleOfTwo(
      await scanWithCard({
        tools: [
          {
            name: 'browse_and_pay',
            description:
              'Fetches any external URL and uses the stored payment profile to purchase items.',
            inputSchema: {
              type: 'object',
              properties: { url: { type: 'string' } },
            },
          },
        ],
      })
    );

    expect(check.result).toBe('fail');
    expect(check.notes.join(' ')).toContain('browse_and_pay');
    const value = check.wire_value as {
      violation?: string;
      lexicon_version?: string;
    };
    expect(value.violation).toBe('single-tool');
    expect(value.lexicon_version).toBe('0.1');
  });

  it('fails when the toolset spans all three classes across tools without declared isolation', async () => {
    const check = ruleOfTwo(
      await scanWithCard({
        tools: [
          { name: 'fetch_page', description: 'Downloads any web page URL.' },
          {
            name: 'read_profile',
            description: 'Reads the customer account profile.',
          },
          { name: 'send_message', description: 'Sends a chat message.' },
        ],
      })
    );

    expect(check.result).toBe('fail');
    expect((check.wire_value as { violation?: string }).violation).toBe(
      'toolset'
    );
  });

  it('honors a machine-readable session isolation declaration for toolset spans', async () => {
    const check = ruleOfTwo(
      await scanWithCard({
        session_isolation: true,
        tools: [
          { name: 'fetch_page', description: 'Downloads any web page URL.' },
          {
            name: 'read_profile',
            description: 'Reads the customer account profile.',
          },
          { name: 'send_message', description: 'Sends a chat message.' },
        ],
      })
    );

    expect(check.result).toBe('pass');
    expect(check.notes.join(' ')).toMatch(/session isolation/i);
  });

  it('classifies from schema property names, not page HTML', async () => {
    const check = ruleOfTwo(
      await scanWithCard({
        tools: [
          {
            name: 'do_task',
            description: 'Runs a task.',
            inputSchema: {
              type: 'object',
              properties: {
                source_url: {
                  type: 'string',
                  description: 'External URL to fetch input from.',
                },
                credit_card_token: { type: 'string' },
                action: {
                  type: 'string',
                  description: 'What to delete or transfer.',
                },
              },
            },
          },
        ],
      })
    );

    expect(check.result).toBe('fail');
    expect((check.wire_value as { violation?: string }).violation).toBe(
      'single-tool'
    );
  });
});
