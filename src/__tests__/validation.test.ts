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
