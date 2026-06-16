#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { createPlaywrightRenderedDomAdapter } from '../adapters/playwright.js';
import { diffArtifacts } from '../diff.js';
import { reconcileChecks } from '../reconcile.js';
import { markdownReport } from '../report.js';
import { buildArtifact } from '../scoring.js';
import { runSourcePass } from '../source.js';
import type { CheckResult } from '../types.js';
import { assertArsArtifact } from '../validation.js';
import { runWirePass } from '../wire.js';

const program = new Command();

program.name('ars').description('Agentic Readiness Score CLI').version('0.1.0');

program
  .command('scan')
  .description('Run source and/or wire ARS checks')
  .option('--source <path>', 'source repository path')
  .option('--url <url>', 'live URL for wire checks')
  .option(
    '--rendered',
    'use an optional Playwright rendered DOM adapter for wire checks'
  )
  .option('--out <dir>', 'output directory', '.')
  .action(
    async (opts: {
      source?: string;
      url?: string;
      rendered?: boolean;
      out: string;
    }) => {
      if (!opts.source && !opts.url)
        throw new Error('Provide --source, --url, or both.');
      const checks: CheckResult[] = [];
      if (opts.source)
        checks.push(...(await runSourcePass(path.resolve(opts.source))));
      if (opts.url)
        checks.push(
          ...(await runWirePass(
            opts.url,
            opts.rendered
              ? { adapter: createPlaywrightRenderedDomAdapter() }
              : undefined
          ))
        );
      reconcileChecks(checks);
      const artifact = buildArtifact(
        { source: opts.source, url: opts.url },
        checks
      );
      assertArsArtifact(artifact, 'generated ARS artifact');
      await mkdir(opts.out, { recursive: true });
      await writeFile(
        path.join(opts.out, 'ars.json'),
        `${JSON.stringify(artifact, null, 2)}\n`
      );
      await writeFile(
        path.join(opts.out, 'ars-report.md'),
        markdownReport(artifact)
      );
      console.log(
        `ARS final ${artifact.summary.ars_final}/100; readiness ${artifact.summary.ars_readiness}/100; tier ${artifact.summary.tier}`
      );
      console.log(
        `Wrote ${path.join(opts.out, 'ars.json')} and ${path.join(opts.out, 'ars-report.md')}`
      );
    }
  );

program
  .command('diff')
  .description('Compare two ars.json artifacts')
  .argument('<before>')
  .argument('<after>')
  .action(async (before: string, after: string) => {
    console.log(await diffArtifacts(before, after));
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
