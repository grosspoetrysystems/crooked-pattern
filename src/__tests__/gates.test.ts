import { describe, expect, it } from 'vitest';
import { check } from '../checks.js';
import { GATE_CRITERIA, evaluateGates, tierFromGates } from '../gates.js';
import { CHECK_REGISTRY } from '../registry.js';
import type { CheckResult, Result } from '../types.js';

function wire(id: string, result: Result, score: number): CheckResult {
  return check(id, id, 'crawl_access', 'WIRE_ONLY', 1, result, score);
}

function allGatePasses(): CheckResult[] {
  return [
    wire('wire.robots', 'pass', 100),
    wire('wire.initial_html_content', 'pass', 100),
    wire('wire.clean_dom', 'pass', 100),
    wire('wire.json_ld', 'pass', 100),
    wire('wire.single_h1', 'pass', 100),
    wire('wire.semantic_landmarks', 'pass', 100),
    wire('wire.agents_md', 'pass', 100),
    wire('wire.alt_attributes', 'pass', 100),
    wire('wire.labeled_fields', 'pass', 100),
    wire('wire.descriptive_links', 'pass', 100),
    wire('wire.https', 'pass', 100),
    wire('wire.last_updated', 'pass', 100),
  ];
}

function gate(gates: ReturnType<typeof evaluateGates>, name: string) {
  const found = gates.find((entry) => entry.gate === name);
  if (!found) throw new Error(`missing gate ${name}`);
  return found;
}

describe('evaluateGates', () => {
  it('passes every gate and reaches T5 when one check per requirement passes', () => {
    const gates = evaluateGates(allGatePasses());

    expect(gates).toHaveLength(5);
    for (const entry of gates) expect(entry.outcome).toBe('pass');
    expect(tierFromGates(gates)).toBe('T5 Agent-Native');
  });

  it('records which check satisfied an any_pass requirement', () => {
    const gates = evaluateGates(allGatePasses());
    const t1 = gate(gates, 'T1 Crawlable');

    expect(t1.requirements[0]?.satisfied_by).toBe('wire.robots');
  });

  it('stops the tier walk at a failed gate but still evaluates later gates', () => {
    const checks = allGatePasses()
      .filter(
        (entry) =>
          ![
            'wire.json_ld',
            'wire.single_h1',
            'wire.semantic_landmarks',
          ].includes(entry.id)
      )
      .concat([
        wire('wire.json_ld', 'fail', 0),
        wire('wire.open_graph', 'fail', 0),
        wire('wire.single_h1', 'fail', 0),
        wire('wire.semantic_landmarks', 'fail', 0),
      ]);
    const gates = evaluateGates(checks);

    expect(gate(gates, 'T3 Structured').outcome).toBe('fail');
    expect(gate(gates, 'T4 Operable').outcome).toBe('pass');
    expect(tierFromGates(gates)).toBe('T2 Legible');
  });

  it('reports every gate unknown and tier T0 for an empty run', () => {
    const gates = evaluateGates([]);

    for (const entry of gates) expect(entry.outcome).toBe('unknown');
    expect(tierFromGates(gates)).toBe('T0 Unassessed');
  });

  it('treats fail plus unknown members as unknown, not fail', () => {
    const gates = evaluateGates([
      wire('wire.robots', 'fail', 0),
      // wire.sitemap absent from the run
    ]);

    const requirement = gate(gates, 'T1 Crawlable').requirements[0];
    expect(requirement?.outcome).toBe('unknown');
    expect(requirement?.unknown_check_ids).toEqual(['wire.sitemap']);
  });

  it('fails an any_pass requirement only when every member is present and known', () => {
    const gates = evaluateGates([
      wire('wire.robots', 'fail', 0),
      wire('wire.sitemap', 'fail', 0),
    ]);

    expect(gate(gates, 'T1 Crawlable').outcome).toBe('fail');
  });

  it('treats explicit unknown results as unmeasured evidence', () => {
    const gates = evaluateGates([
      wire('wire.robots', 'unknown', 0),
      wire('wire.sitemap', 'fail', 0),
    ]);

    expect(gate(gates, 'T1 Crawlable').outcome).toBe('unknown');
  });

  it('accepts partial results at score 60 and rejects 59', () => {
    const at60 = evaluateGates([wire('wire.robots', 'partial', 60)]);
    const at59 = evaluateGates([
      wire('wire.robots', 'partial', 59),
      wire('wire.sitemap', 'fail', 0),
    ]);

    expect(gate(at60, 'T1 Crawlable').outcome).toBe('pass');
    expect(gate(at59, 'T1 Crawlable').outcome).toBe('fail');
  });

  it('vetoes T5 on a known safety disagreement failure', () => {
    const checks = allGatePasses().concat([
      check(
        'both.mcp_tool_count_agreement',
        'tool count agreement',
        'runtime_agent_safety',
        'BOTH',
        1,
        'fail',
        0
      ),
    ]);
    const gates = evaluateGates(checks);

    expect(gate(gates, 'T5 Agent-Native').outcome).toBe('fail');
    expect(tierFromGates(gates)).toBe('T4 Operable');
  });

  it('treats unknown or absent veto evidence as no known adverse evidence', () => {
    const absent = evaluateGates(allGatePasses());
    const unknown = evaluateGates(
      allGatePasses().concat([
        check(
          'both.mcp_tool_count_agreement',
          'tool count agreement',
          'runtime_agent_safety',
          'BOTH',
          1,
          'unknown',
          0
        ),
      ])
    );

    expect(gate(absent, 'T5 Agent-Native').outcome).toBe('pass');
    expect(gate(unknown, 'T5 Agent-Native').outcome).toBe('pass');
  });
});

describe('tierFromGates', () => {
  it('requires consecutive passes from T1', () => {
    const gates = evaluateGates(allGatePasses()).map((entry) =>
      entry.gate === 'T1 Crawlable'
        ? { ...entry, outcome: 'unknown' as const }
        : entry
    );

    expect(tierFromGates(gates)).toBe('T0 Unassessed');
  });
});

describe('GATE_CRITERIA traceability', () => {
  it('references only registry checks that declare matching gate membership', () => {
    for (const spec of GATE_CRITERIA) {
      for (const requirement of spec.requirements) {
        for (const id of requirement.check_ids) {
          const definition = CHECK_REGISTRY[id];
          expect(definition, `missing registry check ${id}`).toBeDefined();
          const expectedGate =
            requirement.kind === 'no_known_fail'
              ? 'Safety Modifier'
              : spec.gate;
          expect(
            definition?.maturity_gates,
            `${id} must list ${expectedGate}`
          ).toContain(expectedGate);
        }
      }
    }
  });

  it('lists the five tier gates in ascending order', () => {
    expect(GATE_CRITERIA.map((spec) => spec.gate)).toEqual([
      'T1 Crawlable',
      'T2 Legible',
      'T3 Structured',
      'T4 Operable',
      'T5 Agent-Native',
    ]);
  });
});
