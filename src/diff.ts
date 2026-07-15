import { readArsArtifact } from './validation.js';

/** @public regression signals for CI gating via `ars diff --fail-on` */
export interface DiffRegression {
  score_drop: boolean;
  tier_drop: boolean;
  gate_regression: boolean;
}

interface DiffOutcome {
  text: string;
  regression: DiffRegression;
}

const TIER_ORDER = [
  'T0 Unassessed',
  'T1 Crawlable',
  'T2 Legible',
  'T3 Structured',
  'T4 Operable',
  'T5 Agent-Native',
];

export async function diffArtifacts(
  beforePath: string,
  afterPath: string
): Promise<DiffOutcome> {
  const before = await readArsArtifact(beforePath);
  const after = await readArsArtifact(afterPath);
  const lines = [
    '# ARS Diff',
    '',
    `- Before: ${beforePath}`,
    `- After: ${afterPath}`,
    '',
    `- ARS final: ${before.summary.ars_final} -> ${after.summary.ars_final} (${delta(after.summary.ars_final - before.summary.ars_final)})`,
    `- ARS readiness: ${before.summary.ars_readiness} -> ${after.summary.ars_readiness} (${delta(after.summary.ars_readiness - before.summary.ars_readiness)})`,
    `- Exposure multiplier: ${before.summary.exposure_multiplier} -> ${after.summary.exposure_multiplier}`,
    `- Maturity tier: ${before.summary.tier} -> ${after.summary.tier}`,
    '',
    '## Maturity Gates',
    '',
    ...gateLines(before.summary.gates, after.summary.gates),
    '',
    '## Categories',
    '',
  ];
  for (const [category, afterScore] of Object.entries(
    after.summary.categories
  )) {
    const beforeScore = before.summary.categories[category];
    const beforeValue = categoryScore(beforeScore);
    const afterValue = categoryScore(afterScore);
    lines.push(
      `- ${category}: ${formatCategory(beforeScore)} -> ${formatCategory(afterScore)} (${delta(afterValue - beforeValue)})`
    );
  }
  lines.push('', '## Checks', '');
  const beforeChecks = new Map(before.checks.map((check) => [check.id, check]));
  const afterIds = new Set(after.checks.map((check) => check.id));
  const checkLines: string[] = [];
  for (const check of after.checks) {
    const old = beforeChecks.get(check.id);
    if (!old || old.score !== check.score || old.result !== check.result) {
      checkLines.push(
        `- ${check.id}: ${old?.result ?? 'missing'} ${old?.score ?? 0} -> ${check.result} ${check.score} (${delta(check.score - (old?.score ?? 0))})`
      );
    }
  }
  for (const check of before.checks) {
    if (!afterIds.has(check.id)) {
      checkLines.push(
        `- ${check.id}: ${check.result} ${check.score} -> missing (check absent from the after artifact)`
      );
    }
  }
  lines.push(...(checkLines.length ? checkLines : ['No check changes.']));

  const beforeGateOutcomes = new Map(
    (before.summary.gates ?? []).map((gate) => [gate.gate, gate.outcome])
  );
  const gateRegression = (after.summary.gates ?? []).some(
    (gate) =>
      beforeGateOutcomes.get(gate.gate) === 'pass' && gate.outcome !== 'pass'
  );
  return {
    text: lines.join('\n'),
    regression: {
      score_drop: after.summary.ars_final < before.summary.ars_final,
      tier_drop:
        TIER_ORDER.indexOf(after.summary.tier) <
        TIER_ORDER.indexOf(before.summary.tier),
      gate_regression: gateRegression,
    },
  };
}

function gateLines(
  before: { gate: string; outcome: string }[] | undefined,
  after: { gate: string; outcome: string }[] | undefined
) {
  const missing = [...(before ? [] : ['before']), ...(after ? [] : ['after'])];
  if (missing.length)
    return missing.map(
      (side) => `- Maturity gates: not recorded in ${side} artifact`
    );
  const beforeOutcomes = new Map(
    (before ?? []).map((gate) => [gate.gate, gate.outcome])
  );
  const changed = (after ?? []).filter(
    (gate) => beforeOutcomes.get(gate.gate) !== gate.outcome
  );
  if (!changed.length) return ['No gate outcome changes.'];
  return changed.map(
    (gate) =>
      `- ${gate.gate}: ${beforeOutcomes.get(gate.gate) ?? 'missing'} -> ${gate.outcome}`
  );
}

function categoryScore(
  value: { result: 'assessed' | 'unassessed'; score?: number } | undefined
) {
  return value?.result === 'assessed' ? (value.score ?? 0) : 0;
}

function formatCategory(
  value: { result: 'assessed' | 'unassessed'; score?: number } | undefined
) {
  return value?.result === 'assessed' ? String(value.score ?? 0) : 'unassessed';
}

function delta(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}
