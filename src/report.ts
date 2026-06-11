import type { ArsArtifact, CheckResult } from './types.js';

export function markdownReport(artifact: ArsArtifact) {
  const s = artifact.summary;
  const findings = artifact.checks
    .filter((check) => check.result === 'fail' || check.result === 'partial')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);
  const disagreements = artifact.checks.filter(
    (check) => check.agreement_state === 'disagree'
  );

  return [
    '# Agentic Readiness Score Report',
    '',
    `Generated: ${artifact.generated_at}`,
    '',
    `- ARS final: **${s.ars_final}/100**`,
    `- ARS readiness: **${s.ars_readiness}/100** (${s.measured_categories} of ${s.total_categories} categories measured)`,
    `- Exposure multiplier: **${s.exposure_multiplier}**`,
    `- Maturity tier: **${s.tier}**`,
    `- Build-time supply-chain safety: **${s.safety.build_time_supply_chain}/100**`,
    `- Runtime agent-interaction safety: **${s.safety.runtime_agent_interaction}/100**`,
    '',
    '## Category Scores',
    '',
    ...Object.entries(s.categories).map(
      ([name, value]) =>
        `- ${label(name)}: ${value.result === 'assessed' ? `${value.score}/100` : 'unassessed'}`
    ),
    '',
    '## Disagreements',
    '',
    disagreements.length
      ? table(disagreements)
      : 'No source/wire disagreements were recorded in this run.',
    '',
    '## Prioritized Recommendations',
    '',
    findings.length
      ? findings
          .map(
            (check) =>
              `- **${check.title}** (${check.id}): ${check.notes.join(' ')}`
          )
          .join('\n')
      : 'No failing or partial deterministic checks.',
    '',
    '## Check Results',
    '',
    table(artifact.checks),
    '',
    '## Caveats',
    '',
    ...artifact.caveats.map((caveat) => `- ${caveat}`),
    ...heuristicChecks(artifact).map(
      (check) =>
        `- ${check.title} is currently marked ${check.metadata?.confidence}/${check.metadata?.status}; treat it as a deterministic heuristic, not definitive proof.`
    ),
    '',
  ].join('\n');
}

function table(checks: CheckResult[]) {
  return [
    '| Check | Result | Score | Mode | Deterministic | Metadata | Notes |',
    '|---|---:|---:|---|---|---|---|',
    ...checks.map(
      (check) =>
        `| ${escapeCell(check.title)} | ${check.result} | ${check.score} | ${check.mode} | ${check.deterministic ? 'yes' : 'no'} | ${escapeCell(formatMetadata(check))} | ${escapeCell(check.notes.join(' '))} |`
    ),
  ].join('\n');
}

function heuristicChecks(artifact: ArsArtifact) {
  return artifact.checks.filter(
    (check) => check.metadata?.confidence === 'heuristic'
  );
}

function formatMetadata(check: CheckResult) {
  const parts: string[] = [];
  if (check.metadata?.confidence)
    parts.push(`confidence=${check.metadata.confidence}`);
  if (check.metadata?.status) parts.push(`status=${check.metadata.status}`);
  if (check.metadata?.labels?.length)
    parts.push(`labels=${check.metadata.labels.join(',')}`);
  if (check.metadata?.maturity_gates?.length)
    parts.push(`gates=${check.metadata.maturity_gates.join(',')}`);
  return parts.join('; ');
}

function label(name: string) {
  return name
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function escapeCell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
