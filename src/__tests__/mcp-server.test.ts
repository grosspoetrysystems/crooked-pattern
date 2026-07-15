import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { check } from '../checks.js';
import { createArsMcpServer } from '../mcp/server.js';
import { reconcileChecks } from '../reconcile.js';
import { runSourcePass } from '../source.js';
import type { CheckResult } from '../types.js';

const root = path.resolve(import.meta.dirname, '../..');
const outRoot = path.join(root, '.tempor/test-mcp-server');

interface AuthoredCard {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: { properties: Record<string, unknown> };
  }>;
}

describe('ars MCP server', () => {
  let client: Client;

  beforeAll(async () => {
    await rm(outRoot, { force: true, recursive: true });
    client = new Client({ name: 'ars-test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      client.connect(clientTransport),
      createArsMcpServer().connect(serverTransport),
    ]);
  });

  afterAll(async () => {
    await client.close();
  });

  it('serves tools consistent with the authored server card', async () => {
    const card = JSON.parse(
      await readFile(path.join(root, 'mcp/server-card.json'), 'utf8')
    ) as AuthoredCard;
    const live = await client.listTools();

    expect(live.tools.map((tool) => tool.name).sort()).toEqual(
      card.tools.map((tool) => tool.name).sort()
    );
    for (const authored of card.tools) {
      const runtime = live.tools.find((tool) => tool.name === authored.name);
      expect(runtime, authored.name).toBeDefined();
      expect(runtime?.description).toBe(authored.description);
      const runtimeProperties = Object.keys(
        (runtime?.inputSchema as { properties?: Record<string, unknown> })
          .properties ?? {}
      ).sort();
      expect(runtimeProperties).toEqual(
        Object.keys(authored.inputSchema.properties).sort()
      );
    }
  });

  it('runs scan_site against a fixture source and returns structured results', async () => {
    const outDir = path.join(outRoot, 'fixture-scan');
    const result = await client.callTool({
      name: 'scan_site',
      arguments: {
        source: path.join(root, 'fixtures/lockfiles/pnpm-project'),
        out: outDir,
      },
    });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as {
      ars_final: number;
      ars_readiness: number;
      tier: string;
      json_path: string;
      report_path: string;
    };
    expect(structured.ars_final).toBeGreaterThanOrEqual(0);
    expect(structured.tier).toBeDefined();
    await expect(readFile(structured.json_path, 'utf8')).resolves.toContain(
      '"schema_version": "ars.v1"'
    );
    await expect(readFile(structured.report_path, 'utf8')).resolves.toContain(
      'Agentic Readiness Score Report'
    );
  });

  it('surfaces top recommendations and tier blockers for LLM callers', async () => {
    const outDir = path.join(outRoot, 'recommendations-scan');
    const result = await client.callTool({
      name: 'scan_site',
      arguments: {
        source: path.join(root, 'fixtures/lockfiles/pnpm-project'),
        out: outDir,
      },
    });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as {
      top_recommendations: {
        id: string;
        title: string;
        result: string;
        weight: number;
        note: string;
      }[];
      gate_blockers?: {
        gate: string;
        requirements: { id: string; outcome: string; check_ids: string[] }[];
      };
    };

    expect(structured.top_recommendations.length).toBeGreaterThan(0);
    expect(structured.top_recommendations.length).toBeLessThanOrEqual(3);
    const [first] = structured.top_recommendations;
    expect(first.id).toMatch(/^source\./);
    expect(['fail', 'partial']).toContain(first.result);
    expect(first.note.length).toBeGreaterThan(0);
    const weights = structured.top_recommendations.map((rec) => rec.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);

    // Source-only scan: T1 evidence is unmeasured, so the tier-blocking gate
    // is T1 with unknown (not fabricated fail) requirements.
    expect(structured.gate_blockers?.gate).toBe('T1 Crawlable');
    expect(structured.gate_blockers?.requirements[0]?.outcome).toBe('unknown');
    expect(
      structured.gate_blockers?.requirements[0]?.check_ids.length
    ).toBeGreaterThan(0);
  });

  it('returns a tool error when neither source nor url is provided', async () => {
    const result = await client.callTool({
      name: 'scan_site',
      arguments: {},
    });

    expect(result.isError).toBe(true);
  });

  it('reconciles authored card tools against the live MCP surface', async () => {
    const sourceChecks = await runSourcePass(root);
    const authored = sourceChecks.find(
      (candidate) => candidate.id === 'source.authored_agent_tools'
    );
    expect((authored?.source_value as { tools: string[] }).tools).toContain(
      'scan_site'
    );

    const live = await client.listTools();
    const liveNames = live.tools.map((tool) => tool.name);

    const agreeing: CheckResult[] = [
      structuredClone(authored) as CheckResult,
      liveCardCheck(liveNames),
    ];
    reconcileChecks(agreeing);
    const agree = agreeing.find(
      (candidate) => candidate.id === 'both.mcp_tool_count_agreement'
    );
    expect(agree?.result).toBe('pass');
    expect(agree?.agreement_state).toBe('agree');

    const diverging: CheckResult[] = [
      structuredClone(authored) as CheckResult,
      liveCardCheck([...liveNames, 'phantom_tool']),
    ];
    reconcileChecks(diverging);
    const disagree = diverging.find(
      (candidate) => candidate.id === 'both.mcp_tool_count_agreement'
    );
    expect(disagree?.result).toBe('fail');
    expect(disagree?.reconciliation?.undocumented_tools).toEqual([
      'phantom_tool',
    ]);
  });
});

function liveCardCheck(tools: string[]): CheckResult {
  return check(
    'wire.mcp_server_card',
    'MCP Server Card',
    'agent_operability',
    'WIRE_ONLY',
    5,
    'pass',
    100,
    [],
    { wire_value: { tools, live_tool_count: tools.length } }
  );
}
