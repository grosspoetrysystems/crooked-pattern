import { READINESS_WEIGHTS, clamp } from './checks.js';
import { evaluateGates, tierFromGates } from './gates.js';
import type {
  ArsArtifact,
  CategoryScore,
  CheckResult,
  ScanInput,
  ScoreSummary,
} from './types.js';

const readinessCategories = Object.entries(READINESS_WEIGHTS)
  .filter(([, weight]) => weight > 0)
  .map(([category]) => category);

export function buildArtifact(
  input: ScanInput,
  checks: CheckResult[]
): ArsArtifact {
  const summary = score(checks);
  return {
    schema_version: 'ars.v1',
    generated_at: new Date().toISOString(),
    input,
    summary,
    checks,
    caveats: [
      'ARS measures readiness signals, not guaranteed agent task success.',
      'Automated accessibility and safety checks catch only a fraction of real issues; a perfect score is not proof of safety or readiness.',
      'llms.txt and WebMCP-style signals are emerging/unproven by major AI providers and are weighted low.',
      'Unknown checks indicate probes that could not run or evidence that was unavailable; they are not fabricated as failures.',
      'Maturity tiers are unlocked by explicit gate requirements, not category-score bands; a gate whose evidence is unmeasured is reported as unknown, never as pass or fail.',
    ],
  };
}

export function score(checks: CheckResult[]): ScoreSummary {
  const categories: Record<string, CategoryScore> = {};
  let weightedReadiness = 0;
  let measuredWeight = 0;
  for (const category of readinessCategories) {
    const catChecks = checks.filter((check) => check.category === category);
    const avg = weightedAverage(catChecks);
    const categoryWeight =
      READINESS_WEIGHTS[category as keyof typeof READINESS_WEIGHTS];
    if (avg === null) {
      categories[category] = { result: 'unassessed' };
      continue;
    }
    categories[category] = { result: 'assessed', score: avg };
    measuredWeight += categoryWeight;
    weightedReadiness += avg * categoryWeight;
  }
  const readiness = measuredWeight > 0 ? weightedReadiness / measuredWeight : 0;
  const measuredCategories = Object.values(categories).filter(
    (category) => category.result === 'assessed'
  ).length;

  const buildSafety = weightedAverage(
    checks.filter((check) => check.category === 'supply_chain_safety')
  );
  const runtimeChecks = checks.filter(
    (check) => check.category === 'runtime_agent_safety'
  );
  const runtimeSafety = weightedAverage(runtimeChecks);
  const insecureExposure =
    runtimeSafety === null || !hasActualExposure(checks)
      ? 0
      : (100 - runtimeSafety) / 100;
  const exposureMultiplier = clampDecimal(
    Math.max(0.55, 1 - insecureExposure * 0.45)
  );
  const final = readiness * exposureMultiplier;
  const gates = evaluateGates(checks);

  return {
    ars_readiness: clamp(readiness),
    ars_final: clamp(final),
    exposure_multiplier: exposureMultiplier,
    tier: tierFromGates(gates),
    gates,
    categories,
    measured_categories: measuredCategories,
    total_categories: readinessCategories.length,
    safety: {
      build_time_supply_chain: buildSafety,
      runtime_agent_interaction: runtimeSafety,
    },
  };
}

function hasActualExposure(checks: CheckResult[]) {
  return checks.some((check) => {
    if (check.id === 'wire.mcp_server_card') {
      const value = check.wire_value as
        | { live_tool_count?: number; tools?: string[] }
        | undefined;
      return (
        (value?.live_tool_count ?? 0) > 0 || (value?.tools?.length ?? 0) > 0
      );
    }
    if (
      check.id === 'wire.openapi_catalog' ||
      check.id === 'wire.oauth_discovery'
    ) {
      return check.result === 'pass';
    }
    if (check.id === 'both.mcp_tool_count_agreement') {
      return (check.reconciliation?.wire_tools.length ?? 0) > 0;
    }
    return false;
  });
}

function weightedAverage(checks: CheckResult[]) {
  const known = checks.filter((check) => check.result !== 'unknown');
  if (!known.length) return null;
  const totalWeight = known.reduce((sum, check) => sum + check.weight, 0);
  if (!totalWeight) return null;
  return clamp(
    known.reduce((sum, check) => sum + check.score * check.weight, 0) /
      totalWeight
  );
}

function clampDecimal(value: number) {
  return Math.round(value * 1000) / 1000;
}
