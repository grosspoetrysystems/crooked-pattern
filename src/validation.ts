import { readFile } from 'node:fs/promises';
import type { ArsArtifact } from './types.js';

const categories = new Set([
  'crawl_access',
  'content_legibility',
  'structured_meaning',
  'agent_operability',
  'navigability_stability',
  'trust_freshness',
  'supply_chain_safety',
  'runtime_agent_safety',
]);

const modes = new Set(['SOURCE_ONLY', 'WIRE_ONLY', 'BOTH']);
const results = new Set(['pass', 'fail', 'partial', 'unknown']);
const confidences = new Set(['high', 'heuristic', 'unknown']);
const statuses = new Set(['implemented', 'partial', 'adapter_missing']);
const gates = new Set([
  'T1 Crawlable',
  'T2 Legible',
  'T3 Structured',
  'T4 Operable',
  'T5 Agent-Native',
  'Safety Modifier',
]);
const tiers = new Set([
  'T0 Unassessed',
  'T1 Crawlable',
  'T2 Legible',
  'T3 Structured',
  'T4 Operable',
  'T5 Agent-Native',
]);
const agreementStates = new Set([
  'agree',
  'disagree',
  'source_only',
  'wire_only',
  'unknown',
]);
const severities = new Set(['none', 'low', 'medium', 'high']);

export class ArtifactValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(`${message}: ${issues.join('; ')}`);
    this.name = 'ArtifactValidationError';
    this.issues = issues;
  }
}

export async function readArsArtifact(filePath: string): Promise<ArsArtifact> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ArtifactValidationError(`Invalid ARS artifact ${filePath}`, [
      `could not parse JSON (${detail})`,
    ]);
  }
  return assertArsArtifact(parsed, filePath);
}

export function assertArsArtifact(
  value: unknown,
  label = 'ARS artifact'
): ArsArtifact {
  const issues = validateArsArtifact(value);
  if (issues.length)
    throw new ArtifactValidationError(`Invalid ${label}`, issues);
  return value as ArsArtifact;
}

export function validateArsArtifact(value: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return ['artifact must be an object'];

  requireEqual(value.schema_version, 'ars.v1', 'schema_version', issues);
  requireIsoString(value.generated_at, 'generated_at', issues);
  validateInput(value.input, 'input', issues);
  validateSummary(value.summary, 'summary', issues);
  validateChecks(value.checks, 'checks', issues);
  validateStringArray(value.caveats, 'caveats', issues);
  return issues;
}

function validateInput(value: unknown, path: string, issues: string[]) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return;
  }
  if (value.source !== undefined && !isString(value.source))
    issues.push(`${path}.source must be a string when present`);
  if (value.url !== undefined && !isString(value.url))
    issues.push(`${path}.url must be a string when present`);
  if (value.source === undefined && value.url === undefined)
    issues.push(`${path} must include source or url`);
}

function validateSummary(value: unknown, path: string, issues: string[]) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireScore(value.ars_readiness, `${path}.ars_readiness`, issues);
  requireScore(value.ars_final, `${path}.ars_final`, issues);
  requireFiniteNumber(
    value.exposure_multiplier,
    `${path}.exposure_multiplier`,
    issues
  );
  requireOneOf(value.tier, tiers, `${path}.tier`, issues);
  validateCategoryScores(value.categories, `${path}.categories`, issues);
  requireNonNegativeInteger(
    value.measured_categories,
    `${path}.measured_categories`,
    issues
  );
  requireNonNegativeInteger(
    value.total_categories,
    `${path}.total_categories`,
    issues
  );
  validateSafety(value.safety, `${path}.safety`, issues);
}

function validateCategoryScores(
  value: unknown,
  path: string,
  issues: string[]
) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return;
  }
  for (const [category, score] of Object.entries(value)) {
    if (!categories.has(category)) {
      issues.push(`${path}.${category} is not a known category`);
      continue;
    }
    validateCategoryScore(score, `${path}.${category}`, issues);
  }
}

function validateCategoryScore(value: unknown, path: string, issues: string[]) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireOneOf(
    value.result,
    new Set(['assessed', 'unassessed']),
    `${path}.result`,
    issues
  );
  if (value.result === 'assessed') {
    requireScore(value.score, `${path}.score`, issues);
  } else if ('score' in value && value.score !== undefined) {
    issues.push(`${path}.score must be omitted for unassessed categories`);
  }
}

function validateSafety(value: unknown, path: string, issues: string[]) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireScore(
    value.build_time_supply_chain,
    `${path}.build_time_supply_chain`,
    issues
  );
  requireScore(
    value.runtime_agent_interaction,
    `${path}.runtime_agent_interaction`,
    issues
  );
}

function validateChecks(value: unknown, path: string, issues: string[]) {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`);
    return;
  }
  for (const [index, check] of value.entries())
    validateCheck(check, `${path}[${index}]`, issues);
}

function validateCheck(value: unknown, path: string, issues: string[]) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return;
  }
  requireString(value.id, `${path}.id`, issues);
  requireString(value.title, `${path}.title`, issues);
  requireOneOf(value.category, categories, `${path}.category`, issues);
  requireOneOf(value.mode, modes, `${path}.mode`, issues);
  requireFiniteNumber(value.weight, `${path}.weight`, issues);
  requireOneOf(value.result, results, `${path}.result`, issues);
  requireScore(value.score, `${path}.score`, issues);
  if (typeof value.deterministic !== 'boolean')
    issues.push(`${path}.deterministic must be a boolean`);
  validateStringArray(value.notes, `${path}.notes`, issues);
  if ('metadata' in value && value.metadata !== undefined)
    validateMetadata(value.metadata, `${path}.metadata`, issues);
  if ('agreement_state' in value && value.agreement_state !== undefined)
    requireOneOf(
      value.agreement_state,
      agreementStates,
      `${path}.agreement_state`,
      issues
    );
  if ('reconciliation' in value && value.reconciliation !== undefined)
    validateReconciliation(
      value.reconciliation,
      `${path}.reconciliation`,
      issues
    );
}

function validateMetadata(value: unknown, path: string, issues: string[]) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return;
  }
  if ('confidence' in value && value.confidence !== undefined)
    requireOneOf(value.confidence, confidences, `${path}.confidence`, issues);
  if ('status' in value && value.status !== undefined)
    requireOneOf(value.status, statuses, `${path}.status`, issues);
  if ('labels' in value && value.labels !== undefined)
    validateStringArray(value.labels, `${path}.labels`, issues);
  if ('maturity_gates' in value && value.maturity_gates !== undefined)
    validateStringArray(
      value.maturity_gates,
      `${path}.maturity_gates`,
      issues,
      gates
    );
}

function validateReconciliation(
  value: unknown,
  path: string,
  issues: string[]
) {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return;
  }
  validateStringArray(value.source_tools, `${path}.source_tools`, issues);
  validateStringArray(value.wire_tools, `${path}.wire_tools`, issues);
  requireFiniteNumber(value.delta, `${path}.delta`, issues);
  validateStringArray(
    value.undocumented_tools,
    `${path}.undocumented_tools`,
    issues
  );
  validateStringArray(
    value.missing_live_tools,
    `${path}.missing_live_tools`,
    issues
  );
  requireOneOf(value.severity, severities, `${path}.severity`, issues);
}

function validateStringArray(
  value: unknown,
  path: string,
  issues: string[],
  allowed?: Set<string>
) {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`);
    return;
  }
  for (const [index, item] of value.entries()) {
    if (!isString(item)) {
      issues.push(`${path}[${index}] must be a string`);
      continue;
    }
    if (allowed && !allowed.has(item))
      issues.push(
        `${path}[${index}] has unsupported value ${JSON.stringify(item)}`
      );
  }
}

function requireString(value: unknown, path: string, issues: string[]) {
  if (!isString(value)) issues.push(`${path} must be a string`);
}

function requireIsoString(value: unknown, path: string, issues: string[]) {
  if (!isString(value) || Number.isNaN(Date.parse(value)))
    issues.push(`${path} must be an ISO date string`);
}

function requireEqual(
  value: unknown,
  expected: string,
  path: string,
  issues: string[]
) {
  if (value !== expected)
    issues.push(`${path} must be ${JSON.stringify(expected)}`);
}

function requireOneOf(
  value: unknown,
  allowed: Set<string>,
  path: string,
  issues: string[]
) {
  if (!isString(value) || !allowed.has(value))
    issues.push(`${path} has unsupported value ${JSON.stringify(value)}`);
}

function requireScore(value: unknown, path: string, issues: string[]) {
  if (!isNumberBetween(value, 0, 100))
    issues.push(`${path} must be a finite number between 0 and 100`);
}

function requireFiniteNumber(value: unknown, path: string, issues: string[]) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    issues.push(`${path} must be a finite number`);
}

function requireNonNegativeInteger(
  value: unknown,
  path: string,
  issues: string[]
) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    issues.push(`${path} must be a non-negative integer`);
}

function isNumberBetween(value: unknown, min: number, max: number) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
