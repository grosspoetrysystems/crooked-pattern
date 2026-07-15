import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runScan } from '../scan.js';
import type { ArsArtifact, MaturityGateOutcome } from '../types.js';

// Version is injected from package.json at build time (tsup define); the
// fallback only appears in unbuilt dev/test runs.
const MCP_SERVER_INFO = {
  name: 'ars',
  version: process.env.PKG_VERSION ?? '0.0.0-dev',
};

const SCAN_SITE_TOOL_NAME = 'scan_site';

const SCAN_SITE_DESCRIPTION =
  'Compute the Agentic Readiness Score (ARS, 0-100 plus a T0-T5 maturity tier) for a repo and/or live site. Requires at least one of `source` (local path; supply-chain and authored-tool checks) or `url` (live wire checks: crawlability, structure, MCP surface, safety posture). Writes ars.json and ars-report.md into `out` (relative to the server process) and returns the score summary, the highest-impact recommendations, and the requirements blocking the next maturity tier.';

const scanSiteInputShape = {
  source: z.string().optional().describe('source repository path'),
  url: z.string().optional().describe('live URL for wire checks'),
  rendered: z
    .boolean()
    .optional()
    .describe(
      'use the optional Playwright rendered DOM adapter for wire checks'
    ),
  out: z
    .string()
    .optional()
    .describe('output directory for ars.json and ars-report.md (default ".")'),
};

const scanSiteOutputShape = {
  ars_final: z.number(),
  ars_readiness: z.number(),
  tier: z.string(),
  json_path: z.string(),
  report_path: z.string(),
  top_recommendations: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        result: z.string(),
        weight: z.number(),
        note: z.string(),
      })
    )
    .describe('highest-weight failing or partial checks, most impactful first'),
  gate_blockers: z
    .object({
      gate: z.string(),
      requirements: z.array(
        z.object({
          id: z.string(),
          outcome: z.string(),
          check_ids: z.array(z.string()),
        })
      ),
    })
    .optional()
    .describe(
      'first maturity gate not yet passed and its unmet requirements; absent when every gate passes'
    ),
};

function topRecommendations(artifact: ArsArtifact) {
  return artifact.checks
    .filter((check) => check.result === 'fail' || check.result === 'partial')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((check) => ({
      id: check.id,
      title: check.title,
      result: check.result,
      weight: check.weight,
      note: check.notes.join(' '),
    }));
}

function gateBlockers(gates: MaturityGateOutcome[] | undefined) {
  const blocking = gates?.find((gate) => gate.outcome !== 'pass');
  if (!blocking) return undefined;
  return {
    gate: blocking.gate,
    requirements: blocking.requirements
      .filter((requirement) => requirement.outcome !== 'pass')
      .map((requirement) => ({
        id: requirement.id,
        outcome: requirement.outcome,
        check_ids:
          requirement.outcome === 'unknown'
            ? (requirement.unknown_check_ids ?? requirement.check_ids)
            : requirement.check_ids,
      })),
  };
}

export function createArsMcpServer(): McpServer {
  const server = new McpServer(MCP_SERVER_INFO);
  server.registerTool(
    SCAN_SITE_TOOL_NAME,
    {
      title: 'Scan site',
      description: SCAN_SITE_DESCRIPTION,
      inputSchema: scanSiteInputShape,
      outputSchema: scanSiteOutputShape,
    },
    async ({ source, url, rendered, out }) => {
      const outcome = await runScan({
        source,
        url,
        rendered,
        out: out ?? '.',
      });
      const blockers = gateBlockers(outcome.artifact.summary.gates);
      const structured = {
        ars_final: outcome.artifact.summary.ars_final,
        ars_readiness: outcome.artifact.summary.ars_readiness,
        tier: outcome.artifact.summary.tier,
        json_path: outcome.jsonPath,
        report_path: outcome.reportPath,
        top_recommendations: topRecommendations(outcome.artifact),
        ...(blockers ? { gate_blockers: blockers } : {}),
      };
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(structured, null, 2) },
        ],
        structuredContent: structured,
      };
    }
  );
  return server;
}
