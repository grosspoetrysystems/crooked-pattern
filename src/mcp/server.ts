import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runScan } from '../scan.js';

const MCP_SERVER_INFO = { name: 'ars', version: '0.1.0' };

const SCAN_SITE_TOOL_NAME = 'scan_site';

const SCAN_SITE_DESCRIPTION =
  'Run ARS source and/or wire checks and return the score summary plus ars.json and ars-report.md paths.';

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
};

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
      const structured = {
        ars_final: outcome.artifact.summary.ars_final,
        ars_readiness: outcome.artifact.summary.ars_readiness,
        tier: outcome.artifact.summary.tier,
        json_path: outcome.jsonPath,
        report_path: outcome.reportPath,
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
