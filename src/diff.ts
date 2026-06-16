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
