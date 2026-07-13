import type {
  CheckResult,
  GateOutcome,
  GateRequirementKind,
  GateRequirementOutcome,
  MaturityGateOutcome,
  ScoreSummary,
  TierGate,
} from './types.js';

interface GateRequirementSpec {
  id: string;
  description: string;
  kind: GateRequirementKind;
  check_ids: string[];
}

interface GateSpec {
  gate: TierGate;
  requirements: GateRequirementSpec[];
}

// Ordered T1 -> T5; the tier walk depends on this ordering. Every check id
// must exist in CHECK_REGISTRY and declare the matching gate membership
// ('Safety Modifier' for no_known_fail vetoes) — enforced by gates.test.ts.
export const GATE_CRITERIA: readonly GateSpec[] = [
  {
    gate: 'T1 Crawlable',
    requirements: [
      {
        id: 't1.crawl_discovery',
        description: 'crawlers can discover the site',
        kind: 'any_pass',
        check_ids: ['wire.robots', 'wire.sitemap'],
      },
    ],
  },
  {
    gate: 'T2 Legible',
    requirements: [
      {
        id: 't2.initial_content',
        description: 'meaningful content in initial HTML',
        kind: 'any_pass',
        check_ids: ['wire.initial_html_content'],
      },
      {
        id: 't2.clean_extraction',
        description: 'content extracts cleanly at reasonable cost',
        kind: 'any_pass',
        check_ids: ['wire.clean_dom', 'wire.token_cost_page_weight'],
      },
    ],
  },
  {
    gate: 'T3 Structured',
    requirements: [
      {
        id: 't3.machine_metadata',
        description: 'machine-readable metadata present',
        kind: 'any_pass',
        check_ids: ['wire.json_ld', 'wire.open_graph'],
      },
      {
        id: 't3.document_outline',
        description: 'coherent document outline',
        kind: 'any_pass',
        check_ids: ['wire.single_h1'],
      },
      {
        id: 't3.landmarks',
        description: 'semantic landmarks present',
        kind: 'any_pass',
        check_ids: ['wire.semantic_landmarks'],
      },
    ],
  },
  {
    gate: 'T4 Operable',
    requirements: [
      {
        id: 't4.agent_interface',
        description: 'an agent-consumable interface is exposed',
        kind: 'any_pass',
        check_ids: [
          'wire.mcp_server_card',
          'wire.openapi_catalog',
          'wire.webmcp',
          'wire.agents_md',
          'source.authored_agent_tools',
        ],
      },
    ],
  },
  {
    gate: 'T5 Agent-Native',
    requirements: [
      {
        id: 't5.media_semantics',
        description: 'media carries text alternatives',
        kind: 'any_pass',
        check_ids: ['wire.alt_attributes'],
      },
      {
        id: 't5.interaction_semantics',
        description: 'interactive elements are accessibly named',
        kind: 'any_pass',
        check_ids: [
          'wire.labeled_fields',
          'wire.accessibility_probe',
          'wire.aria_resolvable',
        ],
      },
      {
        id: 't5.link_semantics',
        description: 'links describe their destination',
        kind: 'any_pass',
        check_ids: ['wire.descriptive_links'],
      },
      {
        id: 't5.transport_security',
        description: 'transport is encrypted',
        kind: 'any_pass',
        check_ids: ['wire.https'],
      },
      {
        id: 't5.freshness',
        description: 'freshness and canonical signals present',
        kind: 'any_pass',
        check_ids: ['wire.last_updated', 'wire.canonical'],
      },
      {
        id: 't5.safety_agreement',
        description: 'no known source/wire tool disagreement',
        kind: 'no_known_fail',
        check_ids: ['both.mcp_tool_count_agreement'],
      },
    ],
  },
];

// Echoes the retired category-band threshold so partial evidence keeps the
// same bar it had before gates replaced bands.
const SATISFYING_PARTIAL_SCORE = 60;

export function evaluateGates(checks: CheckResult[]): MaturityGateOutcome[] {
  const byId = new Map(checks.map((check) => [check.id, check]));
  return GATE_CRITERIA.map((spec) => {
    const requirements = spec.requirements.map((requirement) =>
      evaluateRequirement(requirement, byId)
    );
    return {
      gate: spec.gate,
      outcome: gateOutcome(requirements),
      requirements,
    };
  });
}

export function tierFromGates(
  gates: Pick<MaturityGateOutcome, 'gate' | 'outcome'>[]
): ScoreSummary['tier'] {
  let tier: ScoreSummary['tier'] = 'T0 Unassessed';
  for (const spec of GATE_CRITERIA) {
    const outcome = gates.find((gate) => gate.gate === spec.gate)?.outcome;
    if (outcome !== 'pass') break;
    tier = spec.gate;
  }
  return tier;
}

function evaluateRequirement(
  spec: GateRequirementSpec,
  byId: Map<string, CheckResult>
): GateRequirementOutcome {
  const base = {
    id: spec.id,
    description: spec.description,
    kind: spec.kind,
    check_ids: [...spec.check_ids],
  };
  if (spec.kind === 'no_known_fail') {
    // Veto only on known adverse evidence; unknown or absent checks must not
    // fabricate a failure (or a pass of the underlying check).
    const failed = spec.check_ids.some((id) => byId.get(id)?.result === 'fail');
    return { ...base, outcome: failed ? 'fail' : 'pass' };
  }
  const satisfiedBy = spec.check_ids.find((id) => {
    const check = byId.get(id);
    return check !== undefined && satisfies(check);
  });
  if (satisfiedBy)
    return { ...base, outcome: 'pass', satisfied_by: satisfiedBy };
  const unknownIds = spec.check_ids.filter((id) => {
    const check = byId.get(id);
    return check === undefined || check.result === 'unknown';
  });
  if (unknownIds.length)
    return { ...base, outcome: 'unknown', unknown_check_ids: unknownIds };
  return { ...base, outcome: 'fail' };
}

function satisfies(check: CheckResult) {
  return (
    check.result === 'pass' ||
    (check.result === 'partial' && check.score >= SATISFYING_PARTIAL_SCORE)
  );
}

function gateOutcome(requirements: GateRequirementOutcome[]): GateOutcome {
  if (requirements.some((requirement) => requirement.outcome === 'fail'))
    return 'fail';
  if (requirements.some((requirement) => requirement.outcome === 'unknown'))
    return 'unknown';
  return 'pass';
}
