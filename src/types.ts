export type Mode = "SOURCE_ONLY" | "WIRE_ONLY" | "BOTH";
export type Result = "pass" | "fail" | "partial" | "unknown";
export type Category =
  | "crawl_access"
  | "content_legibility"
  | "structured_meaning"
  | "agent_operability"
  | "navigability_stability"
  | "trust_freshness"
  | "supply_chain_safety"
  | "runtime_agent_safety";

export interface CheckResult {
  id: string;
  title: string;
  category: Category;
  mode: Mode;
  weight: number;
  result: Result;
  score: number;
  deterministic: boolean;
  metadata?: {
    confidence?: "high" | "heuristic";
    status?: "implemented" | "partial";
    labels?: string[];
  };
  notes: string[];
  source_value?: unknown;
  wire_value?: unknown;
  agreement_state?: "agree" | "disagree" | "source_only" | "wire_only" | "unknown";
  reconciliation?: {
    source_tools: string[];
    wire_tools: string[];
    delta: number;
    undocumented_tools: string[];
    missing_live_tools: string[];
    severity: "none" | "low" | "medium" | "high";
  };
}

export interface ScanInput {
  source?: string;
  url?: string;
}

export interface CategoryScore {
  result: "assessed" | "unassessed";
  score?: number;
}

export interface ScoreSummary {
  ars_readiness: number;
  ars_final: number;
  exposure_multiplier: number;
  tier: "T0 Unassessed" | "T1 Crawlable" | "T2 Legible" | "T3 Structured" | "T4 Operable" | "T5 Agent-Native";
  categories: Record<string, CategoryScore>;
  measured_categories: number;
  total_categories: number;
  safety: {
    build_time_supply_chain: number;
    runtime_agent_interaction: number;
  };
}

export interface ArsArtifact {
  schema_version: "ars.v1";
  generated_at: string;
  input: ScanInput;
  summary: ScoreSummary;
  checks: CheckResult[];
  caveats: string[];
}
