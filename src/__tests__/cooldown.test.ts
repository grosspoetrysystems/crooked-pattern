import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runSourcePass } from '../source.js';

const root = path.resolve(import.meta.dirname, '../..');
const scratch = path.join(root, '.tempor/test-cooldown');

async function cooldownCheck(files: Record<string, string>) {
  const dir = path.join(scratch, Math.random().toString(36).slice(2));
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(dir, name), content);
  }
  const checks = await runSourcePass(dir);
  const found = checks.find(
    (candidate) => candidate.id === 'source.minimum_release_age'
  );
  if (!found) throw new Error('source.minimum_release_age missing');
  return found;
}

afterAll(async () => {
  await rm(scratch, { force: true, recursive: true });
});

describe('minimum release age / cooldown detection', () => {
  it('parses a cooldown value with a day-unit suffix without producing NaN', async () => {
    const check = await cooldownCheck({
      'renovate.json': JSON.stringify({ cooldown: '3 days' }),
    });

    expect(check.notes.join(' ')).not.toContain('NaN');
    expect(check.result).toBe('pass');
    expect((check.source_value as { days: number }).days).toBe(3);
  });

  it('parses a bare numeric cooldown', async () => {
    const check = await cooldownCheck({
      'renovate.json': JSON.stringify({ cooldown: 2 }),
    });

    expect(check.result).toBe('partial');
    expect((check.source_value as { days: number }).days).toBe(2);
  });
});
