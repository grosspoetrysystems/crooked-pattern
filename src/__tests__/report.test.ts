import { describe, expect, it } from 'vitest';
import { check } from '../checks.js';
import { markdownReport } from '../report.js';
import { buildArtifact } from '../scoring.js';
import type { CheckResult } from '../types.js';

function wireCheck(
  id: string,
  result: CheckResult['result'],
  score: number,
  extra: Partial<CheckResult> = {}
): CheckResult {
  return check(
    id,
    id,
    'crawl_access',
    'WIRE_ONLY',
    1,
    result,
    score,
    [],
    extra
  );
}

const exposedCard = wireCheck('wire.mcp_server_card', 'pass', 100, {
  wire_value: { live_tool_count: 2, tools: ['a', 'b'] },
});

describe('markdown report honesty presentation', () => {
  it('presents two scores and renders unmeasured Agent-Safety as not assessed, not 0/100', () => {
    const artifact = buildArtifact({ url: 'https://example.com' }, [
      wireCheck('wire.robots', 'pass', 100),
    ]);
    const report = markdownReport(artifact);

    // Two named headline scores.
    expect(report).toContain('## Agent-Readiness');
    expect(report).toContain('## Agent-Safety — the deeper score');
    // No safety evidence measured → not assessed, never a fabricated 0/100.
    expect(artifact.summary.agent_safety).toBeNull();
    expect(report).toContain('Not assessed');
    expect(report).not.toContain('Agent-Safety score: **0/100**');
  });

  it('renders the Agent-Safety score with components when safety is measured', () => {
    const artifact = buildArtifact({ url: 'https://example.com' }, [
      wireCheck('wire.robots', 'pass', 100),
      check(
        'runtime',
        'runtime',
        'runtime_agent_safety',
        'WIRE_ONLY',
        1,
        'pass',
        80
      ),
    ]);
    const report = markdownReport(artifact);

    expect(artifact.summary.agent_safety).toBe(80);
    expect(report).toMatch(
      /\*\*80\/100\*\* — combined supply-chain and agent-interface/
    );
    expect(report).toMatch(/Runtime agent-interaction: 80\/100/);
  });

  it('explains the exposure multiplier when a penalty applies', () => {
    const artifact = buildArtifact({ url: 'https://example.com' }, [
      wireCheck('wire.robots', 'pass', 100),
      exposedCard,
      wireCheck('wire.indirect_injection_surface', 'fail', 0),
    ]);
    const report = markdownReport(artifact);

    expect(artifact.summary.exposure_multiplier).toBeLessThan(1);
    expect(report).toMatch(
      /because the site exposes a live agent interface while measured runtime agent-interaction safety/i
    );
  });

  it('notes when no exposure penalty applies', () => {
    const artifact = buildArtifact({ url: 'https://example.com' }, [
      wireCheck('wire.robots', 'pass', 100),
    ]);
    const report = markdownReport(artifact);

    expect(artifact.summary.exposure_multiplier).toBe(1);
    expect(report).toMatch(/no unsafe-exposure penalty/i);
  });

  it('renders unknown check scores as a dash, not 0', () => {
    const artifact = buildArtifact({ url: 'https://example.com' }, [
      wireCheck('wire.rule_of_two', 'unknown', 0),
    ]);
    const report = markdownReport(artifact);

    expect(report).toMatch(/\| unknown \| – \|/);
  });

  it('calls out the blocking gate with its unmet requirements', () => {
    const artifact = buildArtifact({ url: 'https://example.com' }, [
      wireCheck('wire.robots', 'fail', 0),
      wireCheck('wire.sitemap', 'fail', 0),
    ]);
    const report = markdownReport(artifact);

    expect(report).toMatch(/blocking gate.*T1 Crawlable/i);
    expect(report).toContain('t1.crawl_discovery');
  });

  it('collapses heuristic-confidence caveats into a single line', () => {
    const artifact = buildArtifact({ url: 'https://example.com' }, [
      wireCheck('wire.clean_dom', 'pass', 100),
      wireCheck('wire.token_cost_page_weight', 'pass', 100),
    ]);
    const report = markdownReport(artifact);

    const caveatLines = report
      .split('\n')
      .filter((line) => line.includes('deterministic heuristic'));
    expect(caveatLines).toHaveLength(1);
    expect(caveatLines[0]).toContain('clean DOM heuristic');
    expect(caveatLines[0]).toContain('token-cost/page-weight heuristic');
  });
});
