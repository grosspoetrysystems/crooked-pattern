import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPlaywrightRenderedDomAdapter } from './adapters/playwright.js';
import type { SupplyChainInput } from './adapters/supply-chain.js';
import { reconcileChecks } from './reconcile.js';
import { markdownReport } from './report.js';
import { buildArtifact } from './scoring.js';
import { runSourcePass } from './source.js';
import type { ArsArtifact, CheckResult } from './types.js';
import { assertArsArtifact } from './validation.js';
import { runWirePass } from './wire.js';

/** @public shared scan request consumed by both the CLI and the MCP tool */
export interface ScanRequest {
  source?: string;
  url?: string;
  rendered?: boolean;
  supplyChain?: SupplyChainInput;
  out: string;
}

/** @public returned by runScan for CLI, MCP, and programmatic callers */
export interface ScanOutcome {
  artifact: ArsArtifact;
  jsonPath: string;
  reportPath: string;
}

// Single scan pipeline behind every entry point, so CLI and MCP results
// cannot drift.
export async function runScan(request: ScanRequest): Promise<ScanOutcome> {
  if (!request.source && !request.url)
    throw new Error('Provide a source path, a url, or both.');
  const checks: CheckResult[] = [];
  if (request.source) {
    const sourceRoot = path.resolve(request.source);
    const info = await stat(sourceRoot).catch(() => undefined);
    if (!info?.isDirectory())
      throw new Error(
        `Source path ${JSON.stringify(request.source)} does not exist or is not a directory.`
      );
    checks.push(
      ...(await runSourcePass(sourceRoot, {
        supplyChain: request.supplyChain,
      }))
    );
  }
  if (request.url)
    checks.push(
      ...(await runWirePass(
        request.url,
        request.rendered
          ? { adapter: createPlaywrightRenderedDomAdapter() }
          : undefined
      ))
    );
  reconcileChecks(checks);
  const artifact = buildArtifact(
    { source: request.source, url: request.url },
    checks
  );
  assertArsArtifact(artifact, 'generated ARS artifact');
  await mkdir(request.out, { recursive: true });
  const jsonPath = path.join(request.out, 'ars.json');
  const reportPath = path.join(request.out, 'ars-report.md');
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`);
  await writeFile(reportPath, markdownReport(artifact));
  return { artifact, jsonPath, reportPath };
}
