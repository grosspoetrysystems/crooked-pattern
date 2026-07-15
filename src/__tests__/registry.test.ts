import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { check } from '../checks.js';
import { reconcileChecks } from '../reconcile.js';
import { CHECK_REGISTRY } from '../registry.js';
import { runSourcePass } from '../source.js';
import type { CheckResult } from '../types.js';
import { runWirePass } from '../wire.js';

describe('check registry', () => {
  it('is the source of truth for registered check identity metadata', () => {
    const result = check(
      'wire.robots',
      'stale title',
      'trust_freshness',
      'SOURCE_ONLY',
      999,
      'pass',
      100
    );

    expect(result).toMatchObject({
      title: 'robots.txt parses',
      category: 'crawl_access',
      mode: 'WIRE_ONLY',
      weight: 4,
      metadata: {
        confidence: 'high',
        status: 'implemented',
        maturity_gates: ['T1 Crawlable'],
      },
    });
  });

  it('keeps emitted source, wire, and reconciliation checks traceable to registry entries', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html><body><h1>registry fixture</h1></body></html>');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Could not bind fixture server.');

    const checks: CheckResult[] = [
      ...(await runSourcePass(process.cwd())),
      ...(await runWirePass(`http://127.0.0.1:${address.port}`)),
    ];
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    reconcileChecks(checks);

    expect(checks.length).toBeGreaterThan(0);
    for (const emitted of checks) {
      const definition = CHECK_REGISTRY[emitted.id];
      expect(definition, emitted.id).toBeDefined();
      expect(emitted.title).toBe(definition.title);
      expect(emitted.category).toBe(definition.category);
      expect(emitted.mode).toBe(definition.mode);
      expect(emitted.weight).toBe(definition.weight);
      expect(emitted.metadata?.maturity_gates).toEqual(
        definition.maturity_gates
      );
      if (emitted.metadata?.confidence)
        expect(emitted.metadata.confidence).toBeDefined();
      if (emitted.metadata?.status)
        expect(emitted.metadata.status).toBeDefined();
      for (const label of emitted.metadata?.labels ?? [])
        expect(definition.allowed_labels, emitted.id).toContain(label);
    }
  });
});
