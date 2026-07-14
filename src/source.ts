import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { resolveSupplyChainReport } from './adapters/supply-chain.js';
import type {
  OsvScanReport,
  SemgrepScanReport,
  SocketScanReport,
  SupplyChainInput,
  SupplyChainScanContext,
} from './adapters/supply-chain.js';
import { check } from './checks.js';
import { readLockfileInventory } from './lockfile.js';
import type { CheckResult } from './types.js';

/** @public options for programmatic source scans with supply-chain adapters */
export interface SourcePassOptions {
  supplyChain?: SupplyChainInput;
}

interface PackageManifest {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

interface ToolCatalog {
  tools?: unknown[];
  paths?: Record<string, unknown>;
}

const lockfiles = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
];
const cooldownFiles = [
  '.npmrc',
  '.yarnrc.yml',
  'pnpm-workspace.yaml',
  'bunfig.toml',
  'renovate.json',
  '.github/dependabot.yml',
];

export async function runSourcePass(
  root: string,
  options: SourcePassOptions = {}
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const packageJson = await readJson<PackageManifest>(
    path.join(root, 'package.json')
  );
  const files = await listFiles(root);
  const directDeps = packageJson
    ? Object.keys({
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {}),
      })
    : [];

  results.push(
    check(
      'source.package_manifest',
      'package manifest present',
      'supply_chain_safety',
      'SOURCE_ONLY',
      10,
      packageJson ? 'pass' : 'unknown',
      packageJson ? 100 : 0,
      [
        packageJson
          ? `Found package.json with ${directDeps.length} direct dependencies.`
          : 'No package.json found; non-Node projects are not fully implemented yet.',
      ],
      {
        source_value: packageJson
          ? { direct_dependencies: directDeps.length }
          : undefined,
      }
    )
  );

  const foundLockfiles = lockfiles.filter((name) => files.has(name));
  const inventory = await readLockfileInventory(root, directDeps);
  results.push(
    check(
      'source.lockfile_pinning',
      'lockfile pinning',
      'supply_chain_safety',
      'SOURCE_ONLY',
      18,
      foundLockfiles.length > 0 ? 'pass' : 'fail',
      foundLockfiles.length > 0 ? 100 : 0,
      [
        foundLockfiles.length > 0
          ? `Found ${foundLockfiles.join(', ')}.`
          : 'No supported lockfile found; deterministic installs are not evidenced.',
        ...(inventory?.parsed
          ? [
              `Parsed ${inventory.lockfile} into ${inventory.package_count} packages (${inventory.direct_count} direct, ${inventory.transitive_count} transitive).`,
            ]
          : inventory?.note
            ? [inventory.note]
            : []),
      ],
      {
        source_value: { lockfiles: foundLockfiles, inventory },
        metadata: {
          labels: inventory?.parsed ? ['parsed-lockfile'] : ['file-presence'],
        },
      }
    )
  );

  const cooldown = await detectCooldown(root, files);
  results.push(
    check(
      'source.minimum_release_age',
      'minimum release age / cooldown',
      'supply_chain_safety',
      'SOURCE_ONLY',
      20,
      cooldown.days >= 3 ? 'pass' : cooldown.days >= 1 ? 'partial' : 'fail',
      cooldown.days >= 3 ? 100 : cooldown.days >= 1 ? 50 : 0,
      [cooldown.note],
      { source_value: cooldown }
    )
  );

  const ciFiles = [...files].filter((file) =>
    file.startsWith('.github/workflows/')
  );
  const ciText = await readMany(root, ciFiles);
  const deterministicInstall =
    /\bnpm ci\b|\bpnpm install --frozen-lockfile\b|\byarn install --immutable\b|\bbun install --frozen-lockfile\b/.test(
      ciText
    );
  results.push(
    check(
      'source.deterministic_ci_install',
      'deterministic install in CI',
      'supply_chain_safety',
      'SOURCE_ONLY',
      12,
      deterministicInstall ? 'pass' : ciFiles.length ? 'fail' : 'unknown',
      deterministicInstall ? 100 : 0,
      [
        deterministicInstall
          ? 'CI uses a deterministic install command.'
          : ciFiles.length
            ? 'CI workflows found, but no deterministic install command was detected.'
            : 'No GitHub Actions workflows found.',
      ],
      { source_value: { workflows: ciFiles.length } }
    )
  );

  const sca =
    /\bosv-scanner\b|\bsocket\b|\bsemgrep\b|dependency-review-action/.test(
      ciText
    );
  results.push(
    check(
      'source.sca_gate',
      'SCA gate in CI',
      'supply_chain_safety',
      'SOURCE_ONLY',
      14,
      sca ? 'pass' : ciFiles.length ? 'fail' : 'unknown',
      sca ? 100 : 0,
      [
        sca
          ? 'Detected OSV, Socket, Semgrep, or dependency review usage.'
          : ciFiles.length
            ? 'No SCA gate detected in CI workflows.'
            : 'No CI workflows available to inspect.',
      ]
    )
  );

  const provenance =
    /npm publish --provenance|slsa|sigstore|cosign|npm provenance/i.test(
      ciText
    );
  results.push(
    check(
      'source.provenance_signing',
      'provenance or signing',
      'supply_chain_safety',
      'SOURCE_ONLY',
      12,
      provenance ? 'pass' : 'fail',
      provenance ? 100 : 0,
      [
        provenance
          ? 'Detected provenance/signing terms in CI.'
          : 'No SLSA, Sigstore, cosign, or npm provenance evidence found.',
      ]
    )
  );

  const sbom = [...files].some((file) =>
    /(^|\/)(sbom|bom)\.(json|xml|spdx|cdx)|\.spdx\.json$|\.cdx\.json$/i.test(
      file
    )
  );
  results.push(
    check(
      'source.sbom',
      'SBOM present',
      'supply_chain_safety',
      'SOURCE_ONLY',
      8,
      sbom ? 'pass' : 'fail',
      sbom ? 100 : 0,
      [sbom ? 'Found an SBOM-like artifact.' : 'No SBOM artifact detected.']
    )
  );

  const screenedNames = inventory?.parsed
    ? [...new Set(inventory.packages.map((entry) => entry.name))]
    : directDeps;
  const screenScope = inventory?.parsed
    ? 'lockfile-inventory'
    : 'direct-dependencies';
  const slop = screenedNames.filter((dep) => isSuspiciousName(dep));
  results.push(
    check(
      'source.slopsquatting_static_flags',
      'static slopsquatting flags',
      'supply_chain_safety',
      'SOURCE_ONLY',
      6,
      slop.length ? 'fail' : screenedNames.length ? 'pass' : 'unknown',
      slop.length ? 0 : screenedNames.length ? 100 : 0,
      [
        slop.length
          ? `Suspicious dependency names: ${slop.join(', ')}.`
          : screenedNames.length
            ? `No static dependency-name collision flags found across ${screenedNames.length} ${screenScope === 'lockfile-inventory' ? 'parsed lockfile packages (direct and transitive)' : 'direct dependencies'}.`
            : 'No dependency inventory available.',
      ],
      {
        source_value: {
          flagged: slop,
          screened: screenedNames.length,
          scope: screenScope,
        },
        metadata: {
          labels:
            screenScope === 'lockfile-inventory'
              ? ['heuristic', 'parsed-lockfile']
              : ['heuristic'],
        },
      }
    )
  );

  const scanContext: SupplyChainScanContext = { root, inventory };
  const [osvReport, socketReport, semgrepReport] = await Promise.all([
    resolveSupplyChainReport(scanContext, options.supplyChain?.osv),
    resolveSupplyChainReport(scanContext, options.supplyChain?.socket),
    resolveSupplyChainReport(scanContext, options.supplyChain?.semgrep),
  ]);
  results.push(
    osvCheck(osvReport),
    socketCheck(socketReport),
    semgrepCheck(semgrepReport)
  );

  const authoredToolEvidence = await detectAuthoredTools(root, files);
  results.push(
    check(
      'source.authored_agent_tools',
      'authored MCP/WebMCP definitions',
      'agent_operability',
      'SOURCE_ONLY',
      4,
      authoredToolEvidence.tools.length ? 'pass' : 'unknown',
      authoredToolEvidence.tools.length ? 100 : 0,
      [
        authoredToolEvidence.tools.length
          ? `Parsed authored tools: ${authoredToolEvidence.tools.join(', ')}.`
          : 'No parseable authored MCP/WebMCP/OpenAPI tool definitions found.',
      ],
      { source_value: authoredToolEvidence }
    )
  );

  return results;
}

function osvCheck(report: OsvScanReport | undefined): CheckResult {
  if (!report)
    return adapterMissingCheck(
      'source.osv_vulnerabilities',
      'OSV known vulnerabilities',
      15,
      'No OSV adapter or report provided; ordinary scans do not execute security scanners.'
    );
  const severe = report.vulnerabilities.filter(
    (vuln) => vuln.severity === 'critical' || vuln.severity === 'high'
  );
  const result = report.vulnerabilities.length
    ? severe.length
      ? 'fail'
      : 'partial'
    : 'pass';
  const scanned =
    report.packages_scanned === undefined
      ? ''
      : ` across ${report.packages_scanned} scanned packages`;
  return check(
    'source.osv_vulnerabilities',
    'OSV known vulnerabilities',
    'supply_chain_safety',
    'SOURCE_ONLY',
    15,
    result,
    reportScore(result),
    [
      report.vulnerabilities.length
        ? `OSV report lists ${report.vulnerabilities.length} known vulnerabilities${scanned} (${severe.length} high/critical): ${report.vulnerabilities.map((vuln) => vuln.id).join(', ')}.`
        : `OSV report lists no known vulnerabilities${scanned}.`,
    ],
    {
      source_value: {
        vulnerabilities: report.vulnerabilities.length,
        high_or_critical: severe.length,
        packages_scanned: report.packages_scanned,
      },
      metadata: reportMetadata('osv-report'),
    }
  );
}

function socketCheck(report: SocketScanReport | undefined): CheckResult {
  if (!report)
    return adapterMissingCheck(
      'source.socket_alerts',
      'Socket supply-chain alerts',
      10,
      'No Socket adapter or report provided; ordinary scans do not execute security scanners.'
    );
  const severe = report.alerts.filter(
    (alert) => alert.severity === 'critical' || alert.severity === 'high'
  );
  const result = report.alerts.length
    ? severe.length
      ? 'fail'
      : 'partial'
    : 'pass';
  return check(
    'source.socket_alerts',
    'Socket supply-chain alerts',
    'supply_chain_safety',
    'SOURCE_ONLY',
    10,
    result,
    reportScore(result),
    [
      report.alerts.length
        ? `Socket report lists ${report.alerts.length} alerts (${severe.length} high/critical): ${report.alerts.map((alert) => `${alert.package}:${alert.type}`).join(', ')}.`
        : 'Socket report lists no supply-chain alerts.',
    ],
    {
      source_value: {
        alerts: report.alerts.length,
        high_or_critical: severe.length,
      },
      metadata: reportMetadata('socket-report'),
    }
  );
}

function semgrepCheck(report: SemgrepScanReport | undefined): CheckResult {
  if (!report)
    return adapterMissingCheck(
      'source.semgrep_findings',
      'Semgrep static analysis findings',
      10,
      'No Semgrep adapter or report provided; ordinary scans do not execute security scanners.'
    );
  const errors = report.findings.filter(
    (finding) => finding.severity === 'error'
  );
  const result = report.findings.length
    ? errors.length
      ? 'fail'
      : 'partial'
    : 'pass';
  return check(
    'source.semgrep_findings',
    'Semgrep static analysis findings',
    'supply_chain_safety',
    'SOURCE_ONLY',
    10,
    result,
    reportScore(result),
    [
      report.findings.length
        ? `Semgrep report lists ${report.findings.length} findings (${errors.length} error severity): ${report.findings.map((finding) => finding.rule_id).join(', ')}.`
        : 'Semgrep report lists no findings.',
    ],
    {
      source_value: {
        findings: report.findings.length,
        errors: errors.length,
      },
      metadata: reportMetadata('semgrep-report'),
    }
  );
}

function adapterMissingCheck(
  id: string,
  title: string,
  weight: number,
  note: string
): CheckResult {
  return check(
    id,
    title,
    'supply_chain_safety',
    'SOURCE_ONLY',
    weight,
    'unknown',
    0,
    [note]
  );
}

function reportScore(result: 'pass' | 'fail' | 'partial') {
  return result === 'pass' ? 100 : result === 'partial' ? 40 : 0;
}

function reportMetadata(label: string) {
  return {
    confidence: 'high' as const,
    status: 'implemented' as const,
    labels: [label],
  };
}

async function listFiles(root: string, dir = ''): Promise<Set<string>> {
  const out = new Set<string>();
  const abs = path.join(root, dir);
  for (const entry of await readdir(abs)) {
    if (
      [
        'node_modules',
        '.git',
        'dist',
        'coverage',
        '.tempor',
        '.pnpm-store',
        'fixtures',
      ].includes(entry)
    )
      continue;
    const rel = path.join(dir, entry);
    const info = await stat(path.join(root, rel));
    if (info.isDirectory()) {
      for (const nested of await listFiles(root, rel)) out.add(nested);
    } else {
      out.add(rel);
    }
  }
  return out;
}

async function detectAuthoredTools(root: string, files: Set<string>) {
  const evidence: { tools: string[]; sources: string[] } = {
    tools: [],
    sources: [],
  };
  for (const file of files) {
    if (!isToolDefinitionCandidate(file)) continue;
    const text = await readFileSafe(path.join(root, file));
    if (!text) continue;
    const tools = file.endsWith('.json')
      ? toolsFromJson(text)
      : toolsFromCode(text);
    if (tools.length) {
      evidence.tools.push(...tools);
      evidence.sources.push(file);
    }
  }
  evidence.tools = [...new Set(evidence.tools)].sort();
  evidence.sources = [...new Set(evidence.sources)].sort();
  return evidence;
}

function isToolDefinitionCandidate(file: string) {
  return /(^|\/)(mcp|webmcp|server-card|openapi|api-catalog|tools?)[^/]*\.(json|ts|tsx|js|mjs|cjs)$/i.test(
    file
  );
}

async function readFileSafe(file: string) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return '';
  }
}

function toolsFromJson(text: string) {
  const parsed = safeJson<ToolCatalog>(text);
  const tools = new Set<string>();
  if (Array.isArray(parsed?.tools)) {
    for (const tool of parsed.tools) {
      const name =
        typeof tool === 'string' ? tool : objectStringValue(tool, 'name');
      if (typeof name === 'string' && name.trim()) tools.add(name.trim());
    }
  }
  if (parsed?.paths && typeof parsed.paths === 'object') {
    for (const [route, methods] of Object.entries(parsed.paths)) {
      if (!methods || typeof methods !== 'object') continue;
      for (const method of Object.keys(methods))
        tools.add(`${method.toUpperCase()} ${route}`);
    }
  }
  return [...tools];
}

function objectStringValue(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string' ? record[key] : undefined;
}

function toolsFromCode(text: string) {
  const tools = new Set<string>();
  const patterns = [
    /registerTool\s*\(\s*["'`]([^"'`]+)["'`]/g,
    /register\s*\(\s*["'`]([^"'`]+)["'`]/g,
    /tool\s*\(\s*["'`]([^"'`]+)["'`]/g,
    /\bname\s*:\s*["'`]([^"'`]+)["'`]/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) tools.add(match[1].trim());
  }
  return [...tools];
}

function safeJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

async function readMany(root: string, files: string[]) {
  const chunks = await Promise.all(
    files.map(async (file) => {
      try {
        return await readFile(path.join(root, file), 'utf8');
      } catch {
        return '';
      }
    })
  );
  return chunks.join('\n');
}

async function detectCooldown(root: string, files: Set<string>) {
  const relevant = cooldownFiles.filter((file) => files.has(file));
  const text = await readMany(root, relevant);
  const patterns = [
    /(minimumReleaseAge)\s*:\s*(\d+)/i,
    /minimum-release-age\s*=\s*(\d+)/i,
    /npmMinimalAgeGate\s*:\s*(\d+)/i,
    /cooldown\s*:\s*["']?(\d+)\s*(days?|d)?/i,
    /minimum_release_age\s*=\s*(\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const rawValue = Number(match[2] ?? match[1]);
      const days =
        match[1] === 'minimumReleaseAge' ? rawValue / 1440 : rawValue;
      return {
        days,
        files: relevant,
        note: `Detected dependency cooldown/minimum-release-age of ${formatDays(days)} day(s).`,
      };
    }
  }
  return {
    days: 0,
    files: relevant,
    note: relevant.length
      ? 'Cooldown config files inspected, but no supported minimum-age value was detected.'
      : 'No cooldown/minimum-release-age config found.',
  };
}

function formatDays(days: number) {
  return Number.isInteger(days) ? String(days) : days.toFixed(2);
}

function isSuspiciousName(dep: string) {
  const popular = [
    'react',
    'express',
    'lodash',
    'axios',
    'commander',
    'typescript',
    'next',
    'vite',
  ];
  const normalized = dep.replace(/^@[^/]+\//, '').toLowerCase();
  return popular.some(
    (name) => normalized !== name && distance(normalized, name) === 1
  );
}

function distance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}
