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
