import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readOsvScanReport,
  readSemgrepScanReport,
  readSocketScanReport,
} from '../adapters/supply-chain.js';
import type {
  OsvScanReport,
  SupplyChainScanContext,
} from '../adapters/supply-chain.js';
import { runSourcePass } from '../source.js';

const fixtures = path.resolve(import.meta.dirname, '../../fixtures');
const pnpmProject = path.join(fixtures, 'lockfiles/pnpm-project');
const reports = path.join(fixtures, 'reports');

const adapterCheckIds = [
  'source.osv_vulnerabilities',
  'source.socket_alerts',
  'source.semgrep_findings',
] as const;

function findCheck(
  checks: Awaited<ReturnType<typeof runSourcePass>>,
  id: string
) {
  return checks.find((candidate) => candidate.id === id);
}

describe('supply-chain adapter degradation', () => {
  it('reports unknown with adapter_missing metadata when no adapter or report is provided', async () => {
    const checks = await runSourcePass(pnpmProject);

    for (const id of adapterCheckIds) {
      const emitted = findCheck(checks, id);
      expect(emitted?.result, id).toBe('unknown');
      expect(emitted?.score, id).toBe(0);
      expect(emitted?.metadata?.status, id).toBe('adapter_missing');
      expect(emitted?.metadata?.labels, id).toContain('adapter-missing');
    }
  });
});

describe('supply-chain adapter reports', () => {
  it('passes checks on clean reports with implemented metadata', async () => {
    const checks = await runSourcePass(pnpmProject, {
      supplyChain: {
        osv: {
          report: await readOsvScanReport(path.join(reports, 'osv-clean.json')),
        },
        socket: {
          report: await readSocketScanReport(
            path.join(reports, 'socket-clean.json')
          ),
        },
        semgrep: { report: { tool: 'semgrep', findings: [] } },
      },
    });

    for (const id of adapterCheckIds) {
      const emitted = findCheck(checks, id);
      expect(emitted?.result, id).toBe('pass');
      expect(emitted?.score, id).toBe(100);
      expect(emitted?.metadata?.status, id).toBe('implemented');
      expect(emitted?.metadata?.confidence, id).toBe('high');
    }
  });

  it('fails on critical vulnerabilities and stays partial on warnings', async () => {
    const checks = await runSourcePass(pnpmProject, {
      supplyChain: {
        osv: {
          report: await readOsvScanReport(
            path.join(reports, 'osv-critical.json')
          ),
        },
        semgrep: {
          report: await readSemgrepScanReport(
            path.join(reports, 'semgrep-warnings.json')
          ),
        },
      },
    });

    const osv = findCheck(checks, 'source.osv_vulnerabilities');
    expect(osv?.result).toBe('fail');
    expect(osv?.score).toBe(0);
    expect(osv?.notes.join(' ')).toContain('GHSA-aaaa-bbbb-cccc');

    const semgrep = findCheck(checks, 'source.semgrep_findings');
    expect(semgrep?.result).toBe('partial');

    const socket = findCheck(checks, 'source.socket_alerts');
    expect(socket?.result).toBe('unknown');
    expect(socket?.metadata?.status).toBe('adapter_missing');
  });

  it('invokes adapters with the scan root and parsed lockfile inventory', async () => {
    let seen: SupplyChainScanContext | undefined;
    const adapter = {
      scan(context: SupplyChainScanContext): OsvScanReport {
        seen = context;
        return { tool: 'osv-scanner', vulnerabilities: [] };
      },
    };

    const checks = await runSourcePass(pnpmProject, {
      supplyChain: { osv: { adapter } },
    });

    expect(findCheck(checks, 'source.osv_vulnerabilities')?.result).toBe(
      'pass'
    );
    expect(seen?.root).toBe(pnpmProject);
    expect(seen?.inventory).toMatchObject({ format: 'pnpm', parsed: true });
  });
});

describe('raw scanner output ingestion', () => {
  it('normalizes raw osv-scanner JSON output into the OsvScanReport contract', async () => {
    const report = await readOsvScanReport(path.join(reports, 'osv-raw.json'));

    expect(report.tool).toBe('osv-scanner');
    expect(report.packages_scanned).toBeUndefined();
    expect(report.vulnerabilities).toEqual([
      {
        id: 'GHSA-aaaa-bbbb-cccc',
        package: 'tiny-dep',
        version: '1.0.3',
        severity: 'critical',
      },
      {
        id: 'GHSA-dddd-eeee-ffff',
        package: 'other-dep',
        version: '2.1.0',
        severity: 'moderate',
      },
    ]);
  });

  it('normalizes raw semgrep --json output into the SemgrepScanReport contract', async () => {
    const report = await readSemgrepScanReport(
      path.join(reports, 'semgrep-raw.json')
    );

    expect(report.tool).toBe('semgrep');
    expect(report.findings).toEqual([
      {
        rule_id: 'javascript.lang.security.audit.unsafe-eval',
        path: 'src/index.js',
        severity: 'warning',
      },
      {
        rule_id: 'javascript.express.security.audit.sql-injection',
        path: 'src/server.js',
        severity: 'error',
      },
    ]);
  });

  it('normalizes Socket facts JSON into the SocketScanReport contract', async () => {
    const report = await readSocketScanReport(
      path.join(reports, 'socket-facts.json')
    );

    expect(report.tool).toBe('socket');
    expect(report.alerts).toEqual([
      { package: 'src/index.js', type: 'secret', severity: 'high' },
      { package: 'Dockerfile', type: 'container', severity: 'moderate' },
    ]);
  });

  it('normalizes raw reports deterministically (identical input, identical output)', async () => {
    const [first, second] = await Promise.all([
      readOsvScanReport(path.join(reports, 'osv-raw.json')),
      readOsvScanReport(path.join(reports, 'osv-raw.json')),
    ]);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('feeds raw-ingested reports through the source pass with contract semantics', async () => {
    const checks = await runSourcePass(pnpmProject, {
      supplyChain: {
        osv: {
          report: await readOsvScanReport(path.join(reports, 'osv-raw.json')),
        },
        socket: {
          report: await readSocketScanReport(
            path.join(reports, 'socket-facts.json')
          ),
        },
        semgrep: {
          report: await readSemgrepScanReport(
            path.join(reports, 'semgrep-raw.json')
          ),
        },
      },
    });

    const osv = findCheck(checks, 'source.osv_vulnerabilities');
    expect(osv?.result).toBe('fail');
    expect(osv?.notes.join(' ')).toContain('GHSA-aaaa-bbbb-cccc');

    const socket = findCheck(checks, 'source.socket_alerts');
    expect(socket?.result).toBe('fail');
    expect(socket?.notes.join(' ')).toContain('secret');

    const semgrep = findCheck(checks, 'source.semgrep_findings');
    expect(semgrep?.result).toBe('fail');
  });
});

describe('supply-chain report files', () => {
  it('rejects reports with the wrong tool tag', async () => {
    await expect(
      readOsvScanReport(path.join(reports, 'invalid-report.json'))
    ).rejects.toThrow(/tool/);
  });

  it('rejects unreadable or malformed report files', async () => {
    await expect(
      readSocketScanReport(path.join(reports, 'does-not-exist.json'))
    ).rejects.toThrow();
  });
});
