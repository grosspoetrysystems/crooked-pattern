export type Mode = 'SOURCE_ONLY' | 'WIRE_ONLY' | 'BOTH';
export type Result = 'pass' | 'fail' | 'partial' | 'unknown';
export type Confidence = 'high' | 'heuristic' | 'unknown';
export type ImplementationStatus =
  | 'implemented'
  | 'partial'
  | 'adapter_missing';
export type MaturityGate =
  | 'T1 Crawlable'
  | 'T2 Legible'
  | 'T3 Structured'
  | 'T4 Operable'
  | 'T5 Agent-Native'
  | 'Safety Modifier';
export type TierGate = Exclude<MaturityGate, 'Safety Modifier'>;
export type GateOutcome = 'pass' | 'fail' | 'unknown';
export type GateRequirementKind = 'any_pass' | 'no_known_fail';

export interface GateRequirementOutcome {
  id: string;
  description: string;
  kind: GateRequirementKind;
  check_ids: string[];
  outcome: GateOutcome;
  satisfied_by?: string;
  unknown_check_ids?: string[];
}

export interface MaturityGateOutcome {
  gate: TierGate;
  outcome: GateOutcome;
  requirements: GateRequirementOutcome[];
}
export type Category =
  | 'crawl_access'
  | 'content_legibility'
  | 'structured_meaning'
  | 'agent_operability'
  | 'navigability_stability'
  | 'trust_freshness'
  | 'supply_chain_safety'
  | 'runtime_agent_safety';

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
    confidence?: Confidence;
    status?: ImplementationStatus;
    labels?: string[];
    maturity_gates?: MaturityGate[];
  };
  notes: string[];
  source_value?: unknown;
  wire_value?: unknown;
  agreement_state?:
    | 'agree'
    | 'disagree'
    | 'source_only'
    | 'wire_only'
    | 'unknown';
  reconciliation?: {
    source_tools: string[];
    wire_tools: string[];
    delta: number;
    undocumented_tools: string[];
    missing_live_tools: string[];
    severity: 'none' | 'low' | 'medium' | 'high';
  };
}

export interface ScanInput {
  source?: string;
  url?: string;
}

export interface CategoryScore {
  result: 'assessed' | 'unassessed';
  score?: number;
}

export interface ScoreSummary {
  ars_readiness: number;
  ars_final: number;
  exposure_multiplier: number;
  tier:
    | 'T0 Unassessed'
    | 'T1 Crawlable'
    | 'T2 Legible'
    | 'T3 Structured'
    | 'T4 Operable'
    | 'T5 Agent-Native';
  // Optional so artifacts generated before gate outcomes existed still parse.
  gates?: MaturityGateOutcome[];
  categories: Record<string, CategoryScore>;
  measured_categories: number;
  total_categories: number;
  safety: {
    build_time_supply_chain: number;
    runtime_agent_interaction: number;
  };
}

export interface ArsArtifact {
  schema_version: 'ars.v1';
  generated_at: string;
  input: ScanInput;
  summary: ScoreSummary;
  checks: CheckResult[];
  caveats: string[];
}
