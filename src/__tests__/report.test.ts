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
  it('renders unmeasured safety as unassessed, not 0/100', () => {
    const artifact = buildArtifact({ url: 'https://example.com' }, [
      wireCheck('wire.robots', 'pass', 100),
    ]);
    const report = markdownReport(artifact);

    expect(artifact.summary.safety.build_time_supply_chain).toBeNull();
    expect(report).toContain('Build-time supply-chain safety: **unassessed**');
    expect(report).not.toContain('Build-time supply-chain safety: **0/100**');
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
