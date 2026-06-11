import { checkDefinition } from './registry.js';
import type { Category, CheckResult, Mode, Result } from './types.js';

export const READINESS_WEIGHTS: Record<Category, number> = {
  crawl_access: 12,
  content_legibility: 20,
  structured_meaning: 18,
  agent_operability: 20,
  navigability_stability: 18,
  trust_freshness: 12,
  supply_chain_safety: 0,
  runtime_agent_safety: 0,
};

export function check(
  id: string,
  title: string,
  category: Category,
  mode: Mode,
  weight: number,
  result: Result,
  score: number,
  notes: string[] = [],
  extra: Partial<CheckResult> = {}
): CheckResult {
  const definition = checkDefinition(id);
  const metadata = mergeMetadata(definition, extra);
  return {
    id,
    title: definition?.title ?? title,
    category: definition?.category ?? category,
    mode: definition?.mode ?? mode,
    weight: definition?.weight ?? weight,
    result,
    score: clamp(score),
    deterministic: true,
    notes,
    ...extra,
    ...(metadata ? { metadata } : {}),
  };
}

export function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mergeMetadata(
  definition: ReturnType<typeof checkDefinition>,
  extra: Partial<CheckResult>
): CheckResult['metadata'] | undefined {
  const base = definition
    ? {
        ...definition.metadata,
        maturity_gates: definition.maturity_gates,
      }
    : undefined;
  if (!base && !extra.metadata) return undefined;
  return {
    ...base,
    ...extra.metadata,
    labels: extra.metadata?.labels ?? base?.labels,
    maturity_gates:
      extra.metadata?.maturity_gates ?? definition?.maturity_gates,
  };
}
