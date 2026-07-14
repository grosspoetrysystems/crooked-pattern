import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { check } from '../checks.js';
import { diffArtifacts } from '../diff.js';
import { buildArtifact } from '../scoring.js';
import {
  ArtifactValidationError,
  assertArsArtifact,
  readArsArtifact,
  validateArsArtifact,
} from '../validation.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'ars-validation-'));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('ARS artifact validation', () => {
  it('accepts generated artifacts at the output boundary', () => {
    const artifact = validArtifact();

    expect(validateArsArtifact(artifact)).toEqual([]);
    expect(assertArsArtifact(artifact)).toBe(artifact);
  });

  it('rejects unsupported schema versions and malformed check fields', () => {
    const base = validArtifact();
    const artifact = {
      ...base,
      schema_version: 'ars.v2',
      checks: [
        {
          ...base.checks[0],
          result: 'maybe',
          score: 120,
          metadata: {
            confidence: 'certain',
            status: 'implemented',
            labels: ['parsed-html'],
            maturity_gates: ['T6 Autonomous'],
          },
        },
      ],
    };

    expect(validateArsArtifact(artifact)).toEqual(
      expect.arrayContaining([
        'schema_version must be "ars.v1"',
        'checks[0].result has unsupported value "maybe"',
        'checks[0].score must be a finite number between 0 and 100',
        'checks[0].metadata.confidence has unsupported value "certain"',
        'checks[0].metadata.maturity_gates[0] has unsupported value "T6 Autonomous"',
      ])
    );
  });

  it('rejects missing required summary fields', () => {
    const base = validArtifact();
    const artifact = {
      ...base,
      summary: {
        ...base.summary,
        ars_final: undefined,
        categories: {
          crawl_access: { result: 'assessed' },
        },
      },
    };

    expect(validateArsArtifact(artifact)).toEqual(
      expect.arrayContaining([
        'summary.ars_final must be a finite number between 0 and 100',
        'summary.categories.crawl_access.score must be a finite number between 0 and 100',
      ])
    );
  });

  it('accepts artifacts without summary.gates for backward compatibility', async () => {
    const artifact = validArtifact();
    const legacy = {
      ...artifact,
      summary: { ...artifact.summary, gates: undefined },
    };

    expect(validateArsArtifact(legacy)).toEqual([]);

    const beforePath = path.join(tempDir, 'legacy.json');
    const afterPath = path.join(tempDir, 'current.json');
    await writeArtifact(beforePath, legacy);
    await writeArtifact(afterPath, validArtifact());
    await expect(diffArtifacts(beforePath, afterPath)).resolves.toContain(
      '# ARS Diff'
    );
  });

  it('rejects malformed gate outcomes and non-tier gates', () => {
    const base = validArtifact();
    const gates = base.summary.gates ?? [];
    const artifact = {
      ...base,
      summary: {
        ...base.summary,
        gates: [
          { ...gates[0], outcome: 'maybe' },
          { ...gates[1], gate: 'Safety Modifier' },
          ...gates.slice(2),
        ],
      },
    };

    expect(validateArsArtifact(artifact)).toEqual(
      expect.arrayContaining([
        'summary.gates[0].outcome has unsupported value "maybe"',
        'summary.gates[1].gate has unsupported value "Safety Modifier"',
      ])
    );
  });

  it('rejects gate lists that are missing gates or out of order', () => {
    const base = validArtifact();
    const gates = base.summary.gates ?? [];
    const artifact = {
      ...base,
      summary: {
        ...base.summary,
        gates: [...gates.slice(1), gates[0]],
      },
    };

    expect(validateArsArtifact(artifact)).toEqual(
      expect.arrayContaining([
        'summary.gates must list gates T1 Crawlable, T2 Legible, T3 Structured, T4 Operable, T5 Agent-Native in order',
      ])
    );
  });

  it('rejects a tier that disagrees with recorded gate outcomes', () => {
    const base = validArtifact();
    const artifact = {
      ...base,
      summary: { ...base.summary, tier: 'T5 Agent-Native' },
    };

    expect(validateArsArtifact(artifact)).toEqual(
      expect.arrayContaining([
        'summary.tier must match the highest consecutive passed gate (expected "T0 Unassessed")',
      ])
    );
  });

  it('rejects non-object artifacts and malformed top-level fields', () => {
    expect(validateArsArtifact(null)).toEqual(['artifact must be an object']);
    expect(validateArsArtifact([])).toEqual(['artifact must be an object']);

    const base = validArtifact();
    const artifact = {
      ...base,
      generated_at: 'not-a-date',
      input: { source: 7 },
      caveats: 'nope',
    };
    expect(validateArsArtifact(artifact)).toEqual(
      expect.arrayContaining([
        'generated_at must be an ISO date string',
        'input.source must be a string when present',
        'caveats must be an array',
      ])
    );

    expect(validateArsArtifact({ ...base, input: { url: 9 } })).toEqual(
      expect.arrayContaining(['input.url must be a string when present'])
    );
    expect(validateArsArtifact({ ...base, input: {} })).toEqual(
      expect.arrayContaining(['input must include source or url'])
    );

    expect(validateArsArtifact({ ...base, input: 'x', summary: 'y' })).toEqual(
      expect.arrayContaining([
        'input must be an object',
        'summary must be an object',
      ])
    );
  });

  it('rejects malformed category, safety, and summary count fields', () => {
    const base = validArtifact();
    const artifact = {
      ...base,
      summary: {
        ...base.summary,
        exposure_multiplier: 'high',
        measured_categories: -1,
        total_categories: 1.5,
        categories: {
          not_a_category: { result: 'assessed', score: 10 },
          crawl_access: 'nope',
          content_legibility: { result: 'unassessed', score: 10 },
          trust_freshness: { result: 'sometimes' },
        },
        safety: { build_time_supply_chain: 'high' },
      },
    };

    expect(validateArsArtifact(artifact)).toEqual(
      expect.arrayContaining([
        'summary.exposure_multiplier must be a finite number',
        'summary.measured_categories must be a non-negative integer',
        'summary.total_categories must be a non-negative integer',
        'summary.categories.not_a_category is not a known category',
        'summary.categories.crawl_access must be an object',
        'summary.categories.content_legibility.score must be omitted for unassessed categories',
        'summary.categories.trust_freshness.result has unsupported value "sometimes"',
        'summary.safety.build_time_supply_chain must be a finite number between 0 and 100',
        'summary.safety.runtime_agent_interaction must be a finite number between 0 and 100',
      ])
    );

    expect(
      validateArsArtifact({
        ...base,
        summary: { ...base.summary, categories: 'nope', safety: 'nope' },
      })
    ).toEqual(
      expect.arrayContaining([
        'summary.categories must be an object',
        'summary.safety must be an object',
      ])
    );
  });

  it('rejects malformed check shapes, metadata, and reconciliation blocks', () => {
    const base = validArtifact();
    const artifact = {
      ...base,
      checks: [
        'not-a-check',
        {
          id: 1,
          title: 2,
          category: 'nope',
          mode: 'HYBRID',
          weight: 'heavy',
          result: 'pass',
          score: 100,
          deterministic: 'yes',
          notes: [3],
          metadata: 'nope',
          agreement_state: 'confused',
          reconciliation: 'nope',
        },
        {
          ...base.checks[0],
          metadata: { status: 'shipped', labels: 'nope' },
          reconciliation: {
            source_tools: 'nope',
            wire_tools: [],
            delta: 'big',
            undocumented_tools: [],
            missing_live_tools: [],
            severity: 'catastrophic',
          },
        },
      ],
    };

    expect(validateArsArtifact(artifact)).toEqual(
      expect.arrayContaining([
        'checks[0] must be an object',
        'checks[1].id must be a string',
        'checks[1].title must be a string',
        'checks[1].category has unsupported value "nope"',
        'checks[1].mode has unsupported value "HYBRID"',
        'checks[1].weight must be a finite number',
        'checks[1].deterministic must be a boolean',
        'checks[1].notes[0] must be a string',
        'checks[1].metadata must be an object',
        'checks[1].agreement_state has unsupported value "confused"',
        'checks[1].reconciliation must be an object',
        'checks[2].metadata.status has unsupported value "shipped"',
        'checks[2].metadata.labels must be an array',
        'checks[2].reconciliation.source_tools must be an array',
        'checks[2].reconciliation.delta must be a finite number',
        'checks[2].reconciliation.severity has unsupported value "catastrophic"',
      ])
    );

    expect(validateArsArtifact({ ...base, checks: 'nope' })).toEqual(
      expect.arrayContaining(['checks must be an array'])
    );
  });

  it('rejects malformed gate requirement structures', () => {
    const base = validArtifact();
    const gates = base.summary.gates ?? [];
    const artifact = {
      ...base,
      summary: {
        ...base.summary,
        gates: [
          { ...gates[0], requirements: 'nope' },
          {
            ...gates[1],
            requirements: [
              'not-a-requirement',
              {
                id: 1,
                description: 2,
                kind: 'all_pass',
                check_ids: 'nope',
                outcome: 'maybe',
                satisfied_by: 3,
                unknown_check_ids: [4],
              },
            ],
          },
          ...gates.slice(2),
        ],
      },
    };

    expect(validateArsArtifact(artifact)).toEqual(
      expect.arrayContaining([
        'summary.gates[0].requirements must be an array',
        'summary.gates[1].requirements[0] must be an object',
        'summary.gates[1].requirements[1].id must be a string',
        'summary.gates[1].requirements[1].description must be a string',
        'summary.gates[1].requirements[1].kind has unsupported value "all_pass"',
        'summary.gates[1].requirements[1].check_ids must be an array',
        'summary.gates[1].requirements[1].outcome has unsupported value "maybe"',
        'summary.gates[1].requirements[1].satisfied_by must be a string',
        'summary.gates[1].requirements[1].unknown_check_ids[0] must be a string',
      ])
    );

    expect(
      validateArsArtifact({
        ...base,
        summary: { ...base.summary, gates: 'nope' },
      })
    ).toEqual(expect.arrayContaining(['summary.gates must be an array']));

    expect(
      validateArsArtifact({
        ...base,
        summary: { ...base.summary, gates: ['nope', ...gates.slice(1)] },
      })
    ).toEqual(expect.arrayContaining(['summary.gates[0] must be an object']));
  });

  it('labels malformed JSON artifacts before diff code can consume them', async () => {
    const filePath = path.join(tempDir, 'ars.json');
    await writeFile(filePath, '{"schema_version":');

    await expect(readArsArtifact(filePath)).rejects.toThrow(
      ArtifactValidationError
    );
    await expect(readArsArtifact(filePath)).rejects.toThrow(
      'could not parse JSON'
    );
  });

  it('validates diff inputs before comparing scores', async () => {
    const beforePath = path.join(tempDir, 'before.json');
    const afterPath = path.join(tempDir, 'after.json');
    const invalid = validArtifact();
    await writeArtifact(beforePath, validArtifact());
    await writeArtifact(afterPath, {
      ...invalid,
      summary: { ...invalid.summary, tier: 'T9 Invalid' },
    });

    await expect(diffArtifacts(beforePath, afterPath)).rejects.toThrow(
      `Invalid ${afterPath}: summary.tier has unsupported value "T9 Invalid"`
    );
  });

  it('keeps valid diff inputs comparable', async () => {
    const beforePath = path.join(tempDir, 'before.json');
    const afterPath = path.join(tempDir, 'after.json');
    await writeArtifact(beforePath, validArtifact());
    await writeArtifact(afterPath, validArtifact(60));

    await expect(diffArtifacts(beforePath, afterPath)).resolves.toContain(
      '# ARS Diff'
    );
  });
});

async function writeArtifact(filePath: string, artifact: unknown) {
  await writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`);
}

function validArtifact(score = 80) {
  return buildArtifact({ source: '.' }, [
    check(
      'source.authored_agent_tools',
      'authored MCP/WebMCP definitions',
      'agent_operability',
      'SOURCE_ONLY',
      4,
      'pass',
      score
    ),
  ]);
}
