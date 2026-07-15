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

// Reports are ingested from pre-generated files (either normalized contract
// JSON or raw scanner output), keeping ordinary scans deterministic and
// offline: the scanner itself never runs during a scan.
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
  if (record.tool === tool) {
    if (!Array.isArray(record[itemsField]))
      throw new Error(
        `Supply-chain report ${filePath} must include a ${JSON.stringify(itemsField)} array.`
      );
    return parsed as Report;
  }
  const normalized = normalizeRawReport(tool, record);
  if (normalized) return normalized as Report;
  throw new Error(
    `Supply-chain report ${filePath} has tool ${JSON.stringify(record.tool)}; expected "${tool}" contract JSON or recognizable raw ${tool} output.`
  );
}

function normalizeRawReport(tool: string, record: Record<string, unknown>) {
  if (tool === 'osv-scanner') return normalizeRawOsv(record);
  if (tool === 'semgrep') return normalizeRawSemgrep(record);
  if (tool === 'socket') return normalizeRawSocket(record);
  return undefined;
}

// Raw `osv-scanner --format json` output: results[].packages[] with
// package{name,version}, vulnerabilities[]{id}, groups[]{ids,max_severity}.
function normalizeRawOsv(
  record: Record<string, unknown>
): OsvScanReport | undefined {
  if (!Array.isArray(record.results)) return undefined;
  const vulnerabilities: OsvVulnerability[] = [];
  for (const result of record.results) {
    const packages = fieldArray(result, 'packages');
    for (const entry of packages) {
      const pkg = fieldRecord(entry, 'package');
      const name = stringField(pkg, 'name');
      if (!name) continue;
      const version = stringField(pkg, 'version');
      const groups = fieldArray(entry, 'groups');
      for (const vuln of fieldArray(entry, 'vulnerabilities')) {
        const id = stringField(asRecord(vuln), 'id');
        if (!id) continue;
        vulnerabilities.push({
          id,
          package: name,
          ...(version ? { version } : {}),
          severity: osvSeverity(asRecord(vuln), groups),
        });
      }
    }
  }
  return { tool: 'osv-scanner', vulnerabilities };
}

function osvSeverity(
  vuln: Record<string, unknown> | undefined,
  groups: unknown[]
): OsvSeverity {
  const database = fieldRecord(vuln, 'database_specific');
  const declared = stringField(database, 'severity')?.toLowerCase();
  if (declared === 'medium' || declared === 'moderate') return 'moderate';
  if (declared === 'low' || declared === 'high' || declared === 'critical')
    return declared;
  const id = stringField(vuln, 'id');
  for (const group of groups) {
    const ids = fieldArray(asRecord(group), 'ids');
    if (!id || !ids.includes(id)) continue;
    const score = Number(stringField(asRecord(group), 'max_severity'));
    if (Number.isFinite(score)) return cvssSeverity(score);
  }
  return 'unknown';
}

function cvssSeverity(score: number): OsvSeverity {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'moderate';
  if (score > 0) return 'low';
  return 'unknown';
}

// Raw `semgrep --json` output: results[]{check_id, path, extra{severity}}.
function normalizeRawSemgrep(
  record: Record<string, unknown>
): SemgrepScanReport | undefined {
  if (!Array.isArray(record.results)) return undefined;
  const findings: SemgrepFinding[] = [];
  for (const result of record.results) {
    const ruleId = stringField(asRecord(result), 'check_id');
    if (!ruleId) return undefined;
    const path = stringField(asRecord(result), 'path');
    const extra = fieldRecord(asRecord(result), 'extra');
    findings.push({
      rule_id: ruleId,
      ...(path ? { path } : {}),
      severity: semgrepSeverity(stringField(extra, 'severity')),
    });
  }
  return { tool: 'semgrep', findings };
}

function semgrepSeverity(value: string | undefined): SemgrepSeverity {
  const severity = value?.toLowerCase();
  if (severity === 'error' || severity === 'info') return severity;
  // Semgrep emits ERROR/WARNING/INFO; treat anything unrecognized as a
  // warning rather than inventing an error or suppressing the finding.
  return 'warning';
}

// Socket facts JSON (socket-basics): components[]{name, alerts[]{type,severity}}.
function normalizeRawSocket(
  record: Record<string, unknown>
): SocketScanReport | undefined {
  if (!Array.isArray(record.components)) return undefined;
  const alerts: SocketAlert[] = [];
  for (const component of record.components) {
    const name = stringField(asRecord(component), 'name');
    for (const alert of fieldArray(asRecord(component), 'alerts')) {
      const type = stringField(asRecord(alert), 'type');
      if (!type) continue;
      alerts.push({
        package: name ?? 'unknown-component',
        type,
        severity: socketSeverity(stringField(asRecord(alert), 'severity')),
      });
    }
  }
  return { tool: 'socket', alerts };
}

function socketSeverity(value: string | undefined): SocketSeverity {
  const severity = value?.toLowerCase();
  if (severity === 'medium' || severity === 'moderate') return 'moderate';
  if (severity === 'high' || severity === 'critical') return severity;
  return 'low';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function fieldRecord(
  value: Record<string, unknown> | unknown,
  key: string
): Record<string, unknown> | undefined {
  return asRecord(asRecord(value)?.[key]);
}

function fieldArray(value: unknown, key: string): unknown[] {
  const field = asRecord(value)?.[key];
  return Array.isArray(field) ? field : [];
}

function stringField(
  record: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}
