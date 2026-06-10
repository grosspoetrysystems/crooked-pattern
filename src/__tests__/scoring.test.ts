import { describe, expect, it } from "vitest";
import { check } from "../checks.js";
import { buildArtifact, score } from "../scoring.js";
import type { CheckResult } from "../types.js";

function readinessChecks(value: number): CheckResult[] {
  return [
    check("crawl", "crawl", "crawl_access", "WIRE_ONLY", 1, "pass", value),
    check("content", "content", "content_legibility", "WIRE_ONLY", 1, "pass", value),
    check("structured", "structured", "structured_meaning", "WIRE_ONLY", 1, "pass", value),
    check("operable", "operable", "agent_operability", "WIRE_ONLY", 1, "pass", value),
    check("nav", "nav", "navigability_stability", "WIRE_ONLY", 1, "pass", value),
    check("trust", "trust", "trust_freshness", "WIRE_ONLY", 1, "pass", value),
  ];
}

describe("score", () => {
  it("keeps secure exposure unpenalized", () => {
    const summary = score([
      ...readinessChecks(100),
      check("runtime", "runtime", "runtime_agent_safety", "WIRE_ONLY", 1, "pass", 100),
    ]);

    expect(summary.ars_readiness).toBe(100);
    expect(summary.ars_final).toBe(100);
    expect(summary.exposure_multiplier).toBe(1);
    expect(summary.tier).toBe("T5 Agent-Native");
    expect(summary.measured_categories).toBe(6);
    expect(summary.total_categories).toBe(6);
  });

  it("caps insecure exposure with the multiplier while preserving readiness", () => {
    const summary = score([
      ...readinessChecks(100),
      check("wire.mcp_server_card", "MCP Server Card", "agent_operability", "WIRE_ONLY", 1, "pass", 100, [], {
        wire_value: { live_tool_count: 1, tools: ["send_email"] },
      }),
      check("runtime", "runtime", "runtime_agent_safety", "WIRE_ONLY", 1, "fail", 0),
    ]);

    expect(summary.ars_readiness).toBe(100);
    expect(summary.ars_final).toBe(55);
    expect(summary.exposure_multiplier).toBe(0.55);
  });

  it("does not apply exposure penalty without actual tools, API, or OAuth exposure", () => {
    const summary = score([
      ...readinessChecks(100),
      check("runtime", "runtime", "runtime_agent_safety", "WIRE_ONLY", 1, "fail", 0),
    ]);

    expect(summary.ars_readiness).toBe(100);
    expect(summary.ars_final).toBe(100);
    expect(summary.exposure_multiplier).toBe(1);
  });

  it("excludes all-unknown readiness categories from the denominator", () => {
    const summary = score([
      check("crawl", "crawl", "crawl_access", "WIRE_ONLY", 12, "pass", 50),
      check("content", "content", "content_legibility", "WIRE_ONLY", 20, "unknown", 0),
      check("structured", "structured", "structured_meaning", "WIRE_ONLY", 18, "unknown", 0),
    ]);

    expect(summary.ars_readiness).toBe(50);
    expect(summary.ars_final).toBe(50);
    expect(summary.measured_categories).toBe(1);
    expect(summary.total_categories).toBe(6);
    expect(summary.categories.crawl_access).toEqual({ result: "assessed", score: 50 });
    expect(summary.categories.content_legibility).toEqual({ result: "unassessed" });
  });
});

describe("buildArtifact", () => {
  it("emits schema metadata and caveats", () => {
    const artifact = buildArtifact({ source: "." }, readinessChecks(80));

    expect(artifact.schema_version).toBe("ars.v1");
    expect(artifact.input.source).toBe(".");
    expect(artifact.caveats.some((caveat) => caveat.includes("perfect score"))).toBe(true);
  });
});
