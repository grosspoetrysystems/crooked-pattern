import type { CheckResult } from "./types.js";

interface ToolEvidence {
  tools?: string[];
}

export function reconcileChecks(checks: CheckResult[]) {
  const sourceTools = checks.find((check) => check.id === "source.authored_agent_tools");
  const liveCard = checks.find((check) => check.id === "wire.mcp_server_card");
  if (!sourceTools || !liveCard) return;

  const authored = uniqueTools((sourceTools.source_value as ToolEvidence | undefined)?.tools);
  const live = uniqueTools((liveCard.wire_value as ToolEvidence | undefined)?.tools);

  if (authored.length === 0 && live.length === 0) {
    checks.push({
      id: "both.mcp_tool_count_agreement",
      title: "authored vs live MCP tool agreement",
      category: "runtime_agent_safety",
      mode: "BOTH",
      weight: 15,
      result: "unknown",
      score: 0,
      deterministic: true,
      notes: ["No authored or live MCP/WebMCP tools detected; no reconciliation comparison was possible."],
      source_value: { tool_count: 0, tools: [] },
      wire_value: { tool_count: 0, tools: [] },
      agreement_state: "unknown",
      reconciliation: {
        source_tools: [],
        wire_tools: [],
        delta: 0,
        undocumented_tools: [],
        missing_live_tools: [],
        severity: "none",
      },
    });
    return;
  }

  const authoredSet = new Set(authored);
  const liveSet = new Set(live);
  const undocumented = live.filter((tool) => !authoredSet.has(tool));
  const missingLive = authored.filter((tool) => !liveSet.has(tool));
  const delta = live.length - authored.length;
  const agrees = delta === 0 && undocumented.length === 0 && missingLive.length === 0;
  const sev = severity(Math.max(undocumented.length, Math.abs(delta)));

  checks.push({
    id: "both.mcp_tool_count_agreement",
    title: "authored vs live MCP tool agreement",
    category: "runtime_agent_safety",
    mode: "BOTH",
    weight: 15,
    result: agrees ? "pass" : "fail",
    score: agrees ? 100 : scoreForSeverity(sev),
    deterministic: true,
    notes: [
      agrees
        ? `Authored and live tools match exactly (${authored.length}).`
        : `Authored tools: ${authored.length}; live tools: ${live.length}; delta: ${delta}; undocumented live tools: ${undocumented.length}.`,
    ],
    source_value: { tool_count: authored.length, tools: authored },
    wire_value: { tool_count: live.length, tools: live },
    agreement_state: agrees ? "agree" : "disagree",
    reconciliation: {
      source_tools: authored,
      wire_tools: live,
      delta,
      undocumented_tools: undocumented,
      missing_live_tools: missingLive,
      severity: sev,
    },
  });
}

function uniqueTools(tools: string[] | undefined) {
  return [...new Set((tools ?? []).map((tool) => tool.trim()).filter(Boolean))].sort();
}

function severity(deltaMagnitude: number): "none" | "low" | "medium" | "high" {
  if (deltaMagnitude <= 0) return "none";
  if (deltaMagnitude === 1) return "low";
  if (deltaMagnitude <= 3) return "medium";
  return "high";
}

function scoreForSeverity(value: "none" | "low" | "medium" | "high") {
  if (value === "none") return 100;
  if (value === "low") return 70;
  if (value === "medium") return 40;
  return 0;
}
