import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderDocs } from '../docs.js';

describe('offline docs path boundaries', () => {
  it('rejects lexical traversal and symlink escapes', async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), 'ars-docs-'));
    const corpus = path.join(scratch, 'site');
    const outside = path.join(scratch, 'outside');
    try {
      await mkdir(corpus);
      await mkdir(outside);
      await writeFile(path.join(outside, 'secret.md'), 'not for the corpus');
      await symlink(outside, path.join(corpus, 'escape'));
      await expect(
        renderDocs({ path: '../../etc/passwd' }, corpus)
      ).rejects.toThrow(/outside the docs corpus/);
      await expect(
        renderDocs({ path: 'escape/secret.md' }, corpus)
      ).rejects.toThrow(/outside the docs corpus/);
    } finally {
      await rm(scratch, { force: true, recursive: true });
    }
  });
});
