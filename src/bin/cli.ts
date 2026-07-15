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

// process.env.PKG_VERSION is replaced with package.json's version at build
// time (tsup define); the fallback only appears in unbuilt dev runs.
const VERSION = process.env.PKG_VERSION ?? '0.0.0-dev';

program.name('ars').description('Agentic Readiness Score CLI').version(VERSION);

program
  .command('scan')
  .description('Run source and/or wire ARS checks')
  .option('--source <path>', 'source repository path')
  .option('--url <url>', 'live URL for wire checks')
  .option(
    '--rendered',
    'use the optional rendered DOM adapter for wire checks (requires Playwright to be installed separately)'
  )
  .option(
    '--osv-report <file>',
    'OSV evidence: contract JSON or raw `osv-scanner --format json` output'
  )
  .option(
    '--socket-report <file>',
    'Socket evidence: contract JSON or Socket facts JSON'
  )
  .option(
    '--semgrep-report <file>',
    'Semgrep evidence: contract JSON or raw `semgrep --json` output'
  )
  .option('--out <dir>', 'output directory for ars.json and ars-report.md', '.')
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  ars scan --url https://your-site.com --out ./ars-out',
      '  ars scan --source . --out ./ars-out',
      '  ars scan --source . --url https://your-site.com --osv-report osv.json --out ./ars-out',
    ].join('\n')
  )
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
        `ARS final ${artifact.summary.ars_final}/100; readiness ${artifact.summary.ars_readiness}/100 (${artifact.summary.measured_categories} of ${artifact.summary.total_categories} categories measured); tier ${artifact.summary.tier}`
      );
      console.log(`Wrote ${jsonPath} and ${reportPath}`);
    }
  );

const FAIL_ON_CONDITIONS = [
  'score-drop',
  'tier-drop',
  'gate-regression',
] as const;
type FailOnCondition = (typeof FAIL_ON_CONDITIONS)[number];

program
  .command('diff')
  .description('Compare two ars.json artifacts')
  .argument('<before>')
  .argument('<after>')
  .option(
    '--fail-on <conditions>',
    `exit non-zero on regressions (comma-separated): ${FAIL_ON_CONDITIONS.join(', ')}`
  )
  .addHelpText(
    'after',
    [
      '',
      'Examples:',
      '  ars diff baseline/ars.json current/ars.json',
      '  ars diff baseline/ars.json current/ars.json --fail-on tier-drop,gate-regression',
    ].join('\n')
  )
  .action(async (before: string, after: string, opts: { failOn?: string }) => {
    const outcome = await diffArtifacts(before, after);
    console.log(outcome.text);
    if (!opts.failOn) return;
    const conditions = opts.failOn.split(',').map((entry) => entry.trim());
    const unknown = conditions.filter(
      (entry) => !FAIL_ON_CONDITIONS.includes(entry as FailOnCondition)
    );
    if (unknown.length)
      throw new Error(
        `Unknown --fail-on condition(s): ${unknown.join(', ')}. Supported: ${FAIL_ON_CONDITIONS.join(', ')}.`
      );
    const triggered = conditions.filter((condition) => {
      if (condition === 'score-drop') return outcome.regression.score_drop;
      if (condition === 'tier-drop') return outcome.regression.tier_drop;
      return outcome.regression.gate_regression;
    });
    if (triggered.length)
      throw new Error(`Regression detected: ${triggered.join(', ')}.`);
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
