import { readArsArtifact } from './validation.js';

export async function diffArtifacts(beforePath: string, afterPath: string) {
  const before = await readArsArtifact(beforePath);
  const after = await readArsArtifact(afterPath);
  const lines = [
    '# ARS Diff',
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
  for (const check of after.checks) {
    const old = beforeChecks.get(check.id);
    if (!old || old.score !== check.score || old.result !== check.result) {
      lines.push(
        `- ${check.id}: ${old?.result ?? 'missing'} ${old?.score ?? 0} -> ${check.result} ${check.score} (${delta(check.score - (old?.score ?? 0))})`
      );
    }
  }
  return lines.join('\n');
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
