import { describe, expect, it } from "vitest";
import { check } from "../checks.js";
import { reconcileChecks } from "../reconcile.js";
import type { CheckResult } from "../types.js";

function sourceTools(tools: string[]): CheckResult {
  return check("source.authored_agent_tools", "source tools", "agent_operability", "SOURCE_ONLY", 4, tools.length ? "pass" : "unknown", tools.length ? 100 : 0, [], {
    source_value: { tools },
  });
}

function wireTools(tools: string[]): CheckResult {
  return check("wire.mcp_server_card", "wire card", "agent_operability", "WIRE_ONLY", 5, tools.length ? "pass" : "fail", tools.length ? 100 : 0, [], {
    wire_value: { tools, live_tool_count: tools.length },
  });
}

describe("reconcileChecks", () => {
  it("passes when authored and live tools match exactly", () => {
    const checks = [sourceTools(["scan_site"]), wireTools(["scan_site"])];

    reconcileChecks(checks);

    const both = checks.find((check) => check.id === "both.mcp_tool_count_agreement");
    expect(both?.result).toBe("pass");
    expect(both?.agreement_state).toBe("agree");
    expect(both?.reconciliation?.delta).toBe(0);
    expect(both?.reconciliation?.severity).toBe("none");
  });

  it("fails when live exposes undocumented tools", () => {
    const checks = [
      sourceTools(["a", "b", "c"]),
      wireTools(["a", "b", "c", "d", "e", "f", "g"]),
    ];

    reconcileChecks(checks);

    const both = checks.find((check) => check.id === "both.mcp_tool_count_agreement");
    expect(both?.result).toBe("fail");
    expect(both?.agreement_state).toBe("disagree");
    expect(both?.score).toBe(0);
    expect(both?.reconciliation).toMatchObject({
      delta: 4,
      undocumented_tools: ["d", "e", "f", "g"],
      severity: "high",
    });
  });

  it("reports no-tools as unknown rather than agreement", () => {
    const checks = [sourceTools([]), wireTools([])];

    reconcileChecks(checks);

    const both = checks.find((check) => check.id === "both.mcp_tool_count_agreement");
    expect(both?.result).toBe("unknown");
    expect(both?.agreement_state).toBe("unknown");
    expect(both?.reconciliation?.source_tools).toEqual([]);
    expect(both?.reconciliation?.wire_tools).toEqual([]);
  });
});
