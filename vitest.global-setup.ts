import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Build dist/ once for the whole run: per-file `pnpm build` calls from CLI
// test suites race in tsup's clean step when vitest workers run in parallel.
export default async function buildDistOnce() {
  await execFileAsync('pnpm', ['build'], {
    cwd: path.resolve(import.meta.dirname),
  });
}
