import { readFile } from 'node:fs/promises';
import type { LockfileInventory } from '../lockfile.js';

export interface SupplyChainScanContext {
  root: string;
  inventory?: LockfileInventory;
}

/** @public part of the adapter output contract for external implementations */
export type OsvSeverity = 'low' | 'moderate' | 'high' | 'critical' | 'unknown';

export interface OsvVulnerability {
  id: string;
  package: string;
  version?: string;
  severity?: OsvSeverity;
}

export interface OsvScanReport {
  tool: 'osv-scanner';
  packages_scanned?: number;
  vulnerabilities: OsvVulnerability[];
}

/** @public part of the adapter output contract for external implementations */
export type SocketSeverity = 'low' | 'moderate' | 'high' | 'critical';

export interface SocketAlert {
  package: string;
  type: string;
  severity: SocketSeverity;
}

export interface SocketScanReport {
  tool: 'socket';
  alerts: SocketAlert[];
}

/** @public part of the adapter output contract for external implementations */
export type SemgrepSeverity = 'info' | 'warning' | 'error';

export interface SemgrepFinding {
  rule_id: string;
  path?: string;
  severity: SemgrepSeverity;
}

export interface SemgrepScanReport {
  tool: 'semgrep';
  findings: SemgrepFinding[];
}

/** @public extension point implemented by external scanner adapters */
export interface SupplyChainAdapter<Report> {
  scan(context: SupplyChainScanContext): Promise<Report> | Report;
}

export interface SupplyChainToolInput<Report> {
  report?: Report;
  adapter?: SupplyChainAdapter<Report>;
}

export interface SupplyChainInput {
  osv?: SupplyChainToolInput<OsvScanReport>;
  socket?: SupplyChainToolInput<SocketScanReport>;
  semgrep?: SupplyChainToolInput<SemgrepScanReport>;
}

export function resolveSupplyChainReport<Report>(
  context: SupplyChainScanContext,
  input?: SupplyChainToolInput<Report>
): Promise<Report> | Report | undefined {
  if (input?.report) return input.report;
  if (input?.adapter) return input.adapter.scan(context);
  return undefined;
}

export function readOsvScanReport(filePath: string): Promise<OsvScanReport> {
  return readReportFile<OsvScanReport>(
    filePath,
    'osv-scanner',
    'vulnerabilities'
  );
}

export function readSocketScanReport(
  filePath: string
): Promise<SocketScanReport> {
  return readReportFile<SocketScanReport>(filePath, 'socket', 'alerts');
}

export function readSemgrepScanReport(
  filePath: string
): Promise<SemgrepScanReport> {
  return readReportFile<SemgrepScanReport>(filePath, 'semgrep', 'findings');
}

// Reports are normalized contract JSON, not raw scanner output; ingesting a
// pre-generated file keeps ordinary scans deterministic and offline.
async function readReportFile<Report>(
  filePath: string,
  tool: string,
  itemsField: string
): Promise<Report> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not read supply-chain report ${filePath}: ${detail}`
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(`Supply-chain report ${filePath} must be a JSON object.`);
  const record = parsed as Record<string, unknown>;
  if (record.tool !== tool)
    throw new Error(
      `Supply-chain report ${filePath} has tool ${JSON.stringify(record.tool)}; expected "${tool}".`
    );
  if (!Array.isArray(record[itemsField]))
    throw new Error(
      `Supply-chain report ${filePath} must include a ${JSON.stringify(itemsField)} array.`
    );
  return parsed as Report;
}
