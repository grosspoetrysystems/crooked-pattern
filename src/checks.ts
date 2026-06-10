import type { Category, CheckResult, Mode, Result } from "./types.js";

export const READINESS_WEIGHTS: Record<Category, number> = {
  crawl_access: 12,
  content_legibility: 20,
  structured_meaning: 18,
  agent_operability: 20,
  navigability_stability: 18,
  trust_freshness: 12,
  supply_chain_safety: 0,
  runtime_agent_safety: 0
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
  return {
    id,
    title,
    category,
    mode,
    weight,
    result,
    score: clamp(score),
    deterministic: true,
    notes,
    ...extra
  };
}

export function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
