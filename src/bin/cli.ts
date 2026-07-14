#!/usr/bin/env node
import { Command } from 'commander';
import {
  readOsvScanReport,
  readSemgrepScanReport,
  readSocketScanReport,
} from '../adapters/supply-chain.js';
import type { SupplyChainInput } from '../adapters/supply-chain.js';
import { diffArtifacts } from '../diff.js';
import { runScan } from '../scan.js';

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
  .option(
    '--osv-report <file>',
    'normalized OSV scan report JSON consumed as source evidence'
  )
  .option(
    '--socket-report <file>',
    'normalized Socket scan report JSON consumed as source evidence'
  )
  .option(
    '--semgrep-report <file>',
    'normalized Semgrep scan report JSON consumed as source evidence'
  )
  .option('--out <dir>', 'output directory', '.')
  .action(
    async (opts: {
      source?: string;
      url?: string;
      rendered?: boolean;
      osvReport?: string;
      socketReport?: string;
      semgrepReport?: string;
      out: string;
    }) => {
      if (!opts.source && !opts.url)
        throw new Error('Provide --source, --url, or both.');
      const supplyChain = await loadSupplyChainInput(opts);
      if (supplyChain && !opts.source)
        throw new Error('Supply-chain report flags require --source.');
      const { artifact, jsonPath, reportPath } = await runScan({
        source: opts.source,
        url: opts.url,
        rendered: opts.rendered,
        supplyChain,
        out: opts.out,
      });
      console.log(
        `ARS final ${artifact.summary.ars_final}/100; readiness ${artifact.summary.ars_readiness}/100; tier ${artifact.summary.tier}`
      );
      console.log(`Wrote ${jsonPath} and ${reportPath}`);
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

async function loadSupplyChainInput(opts: {
  osvReport?: string;
  socketReport?: string;
  semgrepReport?: string;
}): Promise<SupplyChainInput | undefined> {
  const [osv, socket, semgrep] = await Promise.all([
    opts.osvReport ? readOsvScanReport(opts.osvReport) : undefined,
    opts.socketReport ? readSocketScanReport(opts.socketReport) : undefined,
    opts.semgrepReport ? readSemgrepScanReport(opts.semgrepReport) : undefined,
  ]);
  if (!(osv || socket || semgrep)) return undefined;
  return {
    ...(osv ? { osv: { report: osv } } : {}),
    ...(socket ? { socket: { report: socket } } : {}),
    ...(semgrep ? { semgrep: { report: semgrep } } : {}),
  };
}

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
