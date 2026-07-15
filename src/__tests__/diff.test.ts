import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { check } from '../checks.js';
import { diffArtifacts } from '../diff.js';
import { buildArtifact } from '../scoring.js';

const root = path.resolve(import.meta.dirname, '../..');
const outDir = path.join(root, '.tempor/test-diff');

function robotsCheck(result: 'pass' | 'fail') {
  return check(
    'wire.robots',
    'robots.txt parses',
    'crawl_access',
    'WIRE_ONLY',
    4,
    result,
    result === 'pass' ? 100 : 0,
    ['fixture']
  );
}

function sitemapCheck() {
  return check(
    'wire.sitemap',
    'sitemap.xml',
    'crawl_access',
    'WIRE_ONLY',
    4,
    'pass',
    100,
    ['fixture']
  );
}

async function writeArtifact(name: string, checks: ReturnType<typeof check>[]) {
  const artifact = buildArtifact({ url: 'https://example.com' }, checks);
  const filePath = path.join(outDir, `${name}.json`);
  await writeFile(filePath, JSON.stringify(artifact, null, 2));
  return filePath;
}

describe('diffArtifacts', () => {
  beforeAll(async () => {
    await rm(outDir, { force: true, recursive: true });
    await mkdir(outDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(outDir, { force: true, recursive: true });
  });

  it('reports checks that disappear between artifacts instead of dropping them silently', async () => {
    const before = await writeArtifact('before', [
      robotsCheck('pass'),
      sitemapCheck(),
    ]);
    const after = await writeArtifact('after', [robotsCheck('fail')]);

    const { text } = await diffArtifacts(before, after);

    expect(text).toContain('wire.robots: pass 100 -> fail 0');
    expect(text).toContain('wire.sitemap');
    expect(text).toMatch(/wire\.sitemap: pass 100 -> (missing|removed)/);
  });

  it('labels both artifacts and says so when nothing changed', async () => {
    const before = await writeArtifact('same-a', [robotsCheck('pass')]);
    const after = await writeArtifact('same-b', [robotsCheck('pass')]);

    const { text, regression } = await diffArtifacts(before, after);

    expect(text).toContain(before);
    expect(text).toContain(after);
    expect(text).toContain('No check changes.');
    expect(regression.score_drop).toBe(false);
    expect(regression.tier_drop).toBe(false);
    expect(regression.gate_regression).toBe(false);
  });

  it('flags score, tier, and gate regressions for CI gating', async () => {
    const before = await writeArtifact('reg-before', [
      robotsCheck('pass'),
      sitemapCheck(),
    ]);
    const after = await writeArtifact('reg-after', [
      robotsCheck('fail'),
      check(
        'wire.sitemap',
        'sitemap.xml',
        'crawl_access',
        'WIRE_ONLY',
        4,
        'fail',
        0,
        ['fixture']
      ),
    ]);

    const { regression } = await diffArtifacts(before, after);

    expect(regression.score_drop).toBe(true);
    expect(regression.tier_drop).toBe(true);
    expect(regression.gate_regression).toBe(true);
  });
});
