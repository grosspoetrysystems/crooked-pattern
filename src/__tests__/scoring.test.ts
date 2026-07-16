import { describe, expect, it } from 'vitest';
import { check } from '../checks.js';
import { buildArtifact, score } from '../scoring.js';
import type { CheckResult } from '../types.js';

// Registry-backed IDs so category coverage and gate requirements are both
// exercised: every readiness category is measured and every T1-T5 gate has a
// satisfiable member when value passes.
const readinessCheckIds = [
  'wire.robots',
  'wire.initial_html_content',
  'wire.clean_dom',
  'wire.json_ld',
  'wire.single_h1',
  'wire.semantic_landmarks',
  'wire.agents_md',
  'wire.alt_attributes',
  'wire.labeled_fields',
  'wire.descriptive_links',
  'wire.https',
  'wire.last_updated',
];

function readinessChecks(value: number): CheckResult[] {
  return readinessCheckIds.map((id) =>
    check(id, id, 'crawl_access', 'WIRE_ONLY', 1, 'pass', value)
  );
}

describe('score', () => {
  it('keeps secure exposure unpenalized', () => {
    const summary = score([
      ...readinessChecks(100),
      check(
        'runtime',
        'runtime',
        'runtime_agent_safety',
        'WIRE_ONLY',
        1,
        'pass',
        100
      ),
    ]);

    expect(summary.ars_readiness).toBe(100);
    expect(summary.ars_final).toBe(100);
    expect(summary.exposure_multiplier).toBe(1);
    expect(summary.tier).toBe('T5 Agent-Native');
    expect(summary.gates).toHaveLength(5);
    expect(summary.gates?.every((gate) => gate.outcome === 'pass')).toBe(true);
    expect(summary.measured_categories).toBe(6);
    expect(summary.total_categories).toBe(6);
  });

  it('reports T0 with unknown gates when no gate-member checks are present', () => {
    const summary = score([
      check('crawl', 'crawl', 'crawl_access', 'WIRE_ONLY', 1, 'pass', 100),
    ]);

    expect(summary.tier).toBe('T0 Unassessed');
    expect(summary.gates).toHaveLength(5);
    expect(summary.gates?.every((gate) => gate.outcome === 'unknown')).toBe(
      true
    );
  });

  it('caps insecure exposure with the multiplier while preserving readiness', () => {
    const summary = score([
      ...readinessChecks(100),
      check(
        'wire.mcp_server_card',
        'MCP Server Card',
        'agent_operability',
        'WIRE_ONLY',
        1,
        'pass',
        100,
        [],
        {
          wire_value: { live_tool_count: 1, tools: ['send_email'] },
        }
      ),
      check(
        'runtime',
        'runtime',
        'runtime_agent_safety',
        'WIRE_ONLY',
        1,
        'fail',
        0
      ),
    ]);

    expect(summary.ars_readiness).toBe(100);
    expect(summary.ars_final).toBe(55);
    expect(summary.exposure_multiplier).toBe(0.55);
  });

  it('does not apply exposure penalty without actual tools, API, or OAuth exposure', () => {
    const summary = score([
      ...readinessChecks(100),
      check(
        'runtime',
        'runtime',
        'runtime_agent_safety',
        'WIRE_ONLY',
        1,
        'fail',
        0
      ),
    ]);

    expect(summary.ars_readiness).toBe(100);
    expect(summary.ars_final).toBe(100);
    expect(summary.exposure_multiplier).toBe(1);
  });

  it('computes a combined Agent-Safety score from supply-chain and runtime safety', () => {
    const summary = score([
      ...readinessChecks(100),
      check(
        'source.lockfile_pinning',
        'lockfile',
        'supply_chain_safety',
        'SOURCE_ONLY',
        1,
        'pass',
        80
      ),
      check(
        'runtime',
        'runtime',
        'runtime_agent_safety',
        'WIRE_ONLY',
        1,
        'pass',
        60
      ),
    ]);

    expect(summary.safety.build_time_supply_chain).toBe(80);
    expect(summary.safety.runtime_agent_interaction).toBe(60);
    // Agent-Safety is the deeper score, independent of the readiness number.
    expect(summary.agent_safety).toBe(70);
  });

  it('reports Agent-Safety from whichever safety lens is present', () => {
    const sourceOnly = score([
      check(
        'source.lockfile_pinning',
        'lockfile',
        'supply_chain_safety',
        'SOURCE_ONLY',
        1,
        'pass',
        90
      ),
    ]);
    expect(sourceOnly.agent_safety).toBe(90);
  });

  it('leaves Agent-Safety null when no safety evidence was measured', () => {
    const summary = score(readinessChecks(100));
    expect(summary.agent_safety).toBeNull();
  });

  it('excludes all-unknown readiness categories from the denominator', () => {
    const summary = score([
      check('crawl', 'crawl', 'crawl_access', 'WIRE_ONLY', 12, 'pass', 50),
      check(
        'content',
        'content',
        'content_legibility',
        'WIRE_ONLY',
        20,
        'unknown',
        0
      ),
      check(
        'structured',
        'structured',
        'structured_meaning',
        'WIRE_ONLY',
        18,
        'unknown',
        0
      ),
    ]);

    expect(summary.ars_readiness).toBe(50);
    expect(summary.ars_final).toBe(50);
    expect(summary.measured_categories).toBe(1);
    expect(summary.total_categories).toBe(6);
    expect(summary.categories.crawl_access).toEqual({
      result: 'assessed',
      score: 50,
    });
    expect(summary.categories.content_legibility).toEqual({
      result: 'unassessed',
    });
  });
});

describe('buildArtifact', () => {
  it('emits schema metadata and caveats', () => {
    const artifact = buildArtifact({ source: '.' }, readinessChecks(80));

    expect(artifact.schema_version).toBe('ars.v1');
    expect(artifact.input.source).toBe('.');
    expect(
      artifact.caveats.some((caveat) => caveat.includes('perfect score'))
    ).toBe(true);
  });
});
