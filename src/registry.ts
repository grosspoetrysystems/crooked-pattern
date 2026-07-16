import type {
  Category,
  Confidence,
  ImplementationStatus,
  MaturityGate,
  Mode,
} from './types.js';

interface CheckDefinition {
  id: string;
  title: string;
  category: Category;
  mode: Mode;
  weight: number;
  maturity_gates: MaturityGate[];
  metadata: {
    confidence: Confidence;
    status: ImplementationStatus;
    labels: string[];
  };
  allowed_labels: string[];
}

// Versioned classifier lexicon for the Rule-of-Two v0.1 predicate. Classes
// are assigned to declared MCP tools by word-boundary matches over tool
// name, description, and schema text.
export const RULE_OF_TWO_LEXICON = {
  version: '0.1',
  classes: {
    untrusted_content: [
      'fetch',
      'url',
      'browse',
      'crawl',
      'scrape',
      'download',
      'web page',
      'webpage',
      'search the web',
      'external content',
      'rss',
      'inbound',
      'untrusted',
    ],
    private_data: [
      'account',
      'profile',
      'inbox',
      'payment',
      'customer',
      'token',
      'secret',
      'credential',
      'password',
      'api key',
      'billing',
      'contacts',
      'private',
      'personal data',
    ],
    side_effects: [
      'send',
      'post',
      'create',
      'update',
      'delete',
      'transfer',
      'purchase',
      'pay',
      'execute',
      'submit',
      'publish',
      'upload',
      'webhook',
      'email',
      'message',
      'remove',
      'write',
    ],
  },
} as const;

export type RuleOfTwoClass = keyof typeof RULE_OF_TWO_LEXICON.classes;

const high = metadata('high', 'implemented');
const heuristic = metadata('heuristic', 'partial', ['heuristic']);
const adapterMissing = metadata('unknown', 'adapter_missing', [
  'adapter-missing',
]);
const emerging = metadata('high', 'implemented', ['emerging', 'low-weight']);
const parsedHtml = metadata('high', 'implemented', ['parsed-html']);
const parsedJsonLd = metadata('high', 'implemented', [
  'parsed-html',
  'json-ld',
]);

export const CHECK_REGISTRY = defineRegistry([
  definition(
    'source.package_manifest',
    'package manifest present',
    'supply_chain_safety',
    'SOURCE_ONLY',
    10,
    ['Safety Modifier'],
    high
  ),
  definition(
    'source.lockfile_pinning',
    'lockfile pinning',
    'supply_chain_safety',
    'SOURCE_ONLY',
    18,
    ['Safety Modifier'],
    high,
    ['parsed-lockfile', 'file-presence']
  ),
  definition(
    'source.minimum_release_age',
    'minimum release age / cooldown',
    'supply_chain_safety',
    'SOURCE_ONLY',
    20,
    ['Safety Modifier'],
    high
  ),
  definition(
    'source.deterministic_ci_install',
    'deterministic install in CI',
    'supply_chain_safety',
    'SOURCE_ONLY',
    12,
    ['Safety Modifier'],
    high
  ),
  definition(
    'source.sca_gate',
    'SCA gate in CI',
    'supply_chain_safety',
    'SOURCE_ONLY',
    14,
    ['Safety Modifier'],
    high
  ),
  definition(
    'source.provenance_signing',
    'provenance or signing',
    'supply_chain_safety',
    'SOURCE_ONLY',
    12,
    ['Safety Modifier'],
    high
  ),
  definition(
    'source.sbom',
    'SBOM present',
    'supply_chain_safety',
    'SOURCE_ONLY',
    8,
    ['Safety Modifier'],
    high
  ),
  definition(
    'source.slopsquatting_static_flags',
    'static slopsquatting flags',
    'supply_chain_safety',
    'SOURCE_ONLY',
    6,
    ['Safety Modifier'],
    heuristic,
    ['parsed-lockfile']
  ),
  definition(
    'source.ecosystem_presence',
    'non-Node ecosystem presence',
    'supply_chain_safety',
    'SOURCE_ONLY',
    8,
    ['Safety Modifier'],
    metadata('high', 'partial', ['file-presence'])
  ),
  definition(
    'source.osv_vulnerabilities',
    'OSV known vulnerabilities',
    'supply_chain_safety',
    'SOURCE_ONLY',
    15,
    ['Safety Modifier'],
    adapterMissing,
    ['osv-report']
  ),
  definition(
    'source.socket_alerts',
    'Socket supply-chain alerts',
    'supply_chain_safety',
    'SOURCE_ONLY',
    10,
    ['Safety Modifier'],
    adapterMissing,
    ['socket-report']
  ),
  definition(
    'source.semgrep_findings',
    'Semgrep static analysis findings',
    'supply_chain_safety',
    'SOURCE_ONLY',
    10,
    ['Safety Modifier'],
    adapterMissing,
    ['semgrep-report']
  ),
  definition(
    'source.authored_agent_tools',
    'authored MCP/WebMCP definitions',
    'agent_operability',
    'SOURCE_ONLY',
    4,
    ['T4 Operable'],
    high
  ),

  definition(
    'wire.robots',
    'robots.txt parses',
    'crawl_access',
    'WIRE_ONLY',
    4,
    ['T1 Crawlable'],
    high
  ),
  definition(
    'wire.ai_crawler_directives',
    'AI crawler directives',
    'crawl_access',
    'WIRE_ONLY',
    4,
    ['T1 Crawlable'],
    high
  ),
  definition(
    'wire.sitemap',
    'sitemap.xml',
    'crawl_access',
    'WIRE_ONLY',
    4,
    ['T1 Crawlable'],
    high
  ),
  definition(
    'wire.llms_txt_present',
    'llms.txt',
    'crawl_access',
    'WIRE_ONLY',
    0.05,
    ['T1 Crawlable'],
    emerging
  ),
  definition(
    'wire.content_signals',
    'Content-Signals / crawler policy headers',
    'crawl_access',
    'WIRE_ONLY',
    0.05,
    ['T1 Crawlable'],
    emerging
  ),

  definition(
    'wire.initial_html_content',
    'primary content in initial HTML',
    'content_legibility',
    'WIRE_ONLY',
    9,
    ['T2 Legible'],
    heuristic,
    ['fetch-only', 'rendered-dom']
  ),
  definition(
    'wire.markdown_negotiation',
    'markdown content negotiation',
    'content_legibility',
    'WIRE_ONLY',
    3,
    ['T2 Legible'],
    emerging
  ),
  definition(
    'wire.token_cost_page_weight',
    'token-cost/page-weight heuristic',
    'content_legibility',
    'WIRE_ONLY',
    4,
    ['T2 Legible'],
    heuristic
  ),
  definition(
    'wire.clean_dom',
    'clean DOM heuristic',
    'content_legibility',
    'WIRE_ONLY',
    4,
    ['T2 Legible'],
    heuristic
  ),

  definition(
    'wire.json_ld',
    'valid JSON-LD',
    'structured_meaning',
    'WIRE_ONLY',
    6,
    ['T3 Structured'],
    parsedJsonLd
  ),
  definition(
    'wire.open_graph',
    'Open Graph metadata',
    'structured_meaning',
    'WIRE_ONLY',
    3,
    ['T3 Structured'],
    parsedHtml
  ),
  definition(
    'wire.single_h1',
    'single h1',
    'structured_meaning',
    'WIRE_ONLY',
    4,
    ['T3 Structured'],
    parsedHtml
  ),
  definition(
    'wire.semantic_landmarks',
    'semantic landmarks',
    'structured_meaning',
    'WIRE_ONLY',
    5,
    ['T3 Structured'],
    parsedHtml
  ),

  definition(
    'wire.mcp_server_card',
    'MCP Server Card',
    'agent_operability',
    'WIRE_ONLY',
    5,
    ['T4 Operable'],
    emerging
  ),
  definition(
    'wire.openapi_catalog',
    'OpenAPI/API catalog',
    'agent_operability',
    'WIRE_ONLY',
    5,
    ['T4 Operable'],
    high
  ),
  definition(
    'wire.oauth_discovery',
    'OAuth discovery',
    'agent_operability',
    'WIRE_ONLY',
    4,
    ['T4 Operable'],
    high
  ),
  definition(
    'wire.agents_md',
    'AGENTS.md',
    'agent_operability',
    'WIRE_ONLY',
    3,
    ['T4 Operable'],
    high
  ),
  definition(
    'wire.webmcp',
    'WebMCP registration',
    'agent_operability',
    'WIRE_ONLY',
    3,
    ['T4 Operable'],
    emerging
  ),

  definition(
    'wire.alt_attributes',
    'image alt attributes',
    'navigability_stability',
    'WIRE_ONLY',
    4,
    ['T5 Agent-Native'],
    parsedHtml
  ),
  definition(
    'wire.labeled_fields',
    'labeled fields heuristic',
    'navigability_stability',
    'WIRE_ONLY',
    5,
    ['T5 Agent-Native'],
    heuristic,
    ['static-html', 'rendered-dom', 'accessible-name']
  ),
  definition(
    'wire.accessibility_probe',
    'rendered accessibility probe',
    'navigability_stability',
    'WIRE_ONLY',
    3,
    ['T5 Agent-Native'],
    adapterMissing,
    ['rendered-dom', 'accessibility-summary']
  ),
  definition(
    'wire.descriptive_links',
    'descriptive links',
    'navigability_stability',
    'WIRE_ONLY',
    4,
    ['T5 Agent-Native'],
    parsedHtml
  ),
  definition(
    'wire.cls_probe',
    'CLS probe',
    'navigability_stability',
    'WIRE_ONLY',
    3,
    ['T5 Agent-Native'],
    adapterMissing,
    ['rendered-dom', 'layout-metric']
  ),
  definition(
    'wire.aria_resolvable',
    'ARIA-resolvable selectors heuristic',
    'navigability_stability',
    'WIRE_ONLY',
    2,
    ['T5 Agent-Native'],
    heuristic
  ),

  definition(
    'wire.https',
    'HTTPS',
    'trust_freshness',
    'WIRE_ONLY',
    3,
    ['T5 Agent-Native'],
    high
  ),
  definition(
    'wire.canonical',
    'canonical URL',
    'trust_freshness',
    'WIRE_ONLY',
    2,
    ['T5 Agent-Native'],
    parsedHtml
  ),
  definition(
    'wire.last_updated',
    'freshness signal',
    'trust_freshness',
    'WIRE_ONLY',
    3,
    ['T5 Agent-Native'],
    parsedJsonLd
  ),
  definition(
    'wire.citations',
    'citations/statistics',
    'trust_freshness',
    'WIRE_ONLY',
    2,
    ['T5 Agent-Native'],
    parsedHtml
  ),
  definition(
    'wire.author',
    'author/person signal',
    'trust_freshness',
    'WIRE_ONLY',
    2,
    ['T5 Agent-Native'],
    parsedJsonLd
  ),

  definition(
    'wire.rule_of_two',
    'Rule-of-Two / lethal-trifecta posture',
    'runtime_agent_safety',
    'WIRE_ONLY',
    35,
    ['Safety Modifier'],
    metadata('high', 'implemented', ['tool-schema', 'lexicon-v0.1'])
  ),
  definition(
    'wire.manifest_pinning',
    'signed/pinned MCP manifests',
    'runtime_agent_safety',
    'WIRE_ONLY',
    20,
    ['Safety Modifier'],
    high
  ),
  definition(
    'wire.indirect_injection_surface',
    'indirect prompt-injection surface',
    'runtime_agent_safety',
    'WIRE_ONLY',
    25,
    ['Safety Modifier'],
    heuristic
  ),
  definition(
    'wire.oauth_scope_tightness',
    'OAuth scope tightness',
    'runtime_agent_safety',
    'WIRE_ONLY',
    20,
    ['Safety Modifier'],
    high
  ),

  definition(
    'both.mcp_tool_count_agreement',
    'authored vs live MCP tool agreement',
    'runtime_agent_safety',
    'BOTH',
    15,
    ['Safety Modifier'],
    high
  ),
]);

export function checkDefinition(id: string) {
  return CHECK_REGISTRY[id];
}

function defineRegistry(definitions: CheckDefinition[]) {
  return Object.fromEntries(
    definitions.map((definition) => [definition.id, definition])
  ) as Record<string, CheckDefinition>;
}

function definition(
  id: string,
  title: string,
  category: Category,
  mode: Mode,
  weight: number,
  maturity_gates: MaturityGate[],
  metadata: CheckDefinition['metadata'],
  extraLabels: string[] = []
): CheckDefinition {
  return {
    id,
    title,
    category,
    mode,
    weight,
    maturity_gates,
    metadata,
    allowed_labels: [...new Set([...metadata.labels, ...extraLabels])].sort(),
  };
}

function metadata(
  confidence: Confidence,
  status: ImplementationStatus,
  labels: string[] = []
) {
  return { confidence, status, labels };
}
