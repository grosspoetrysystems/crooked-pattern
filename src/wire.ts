import {
  type RenderedDomInput,
  resolveRenderedDom,
} from './adapters/playwright.js';
import { check } from './checks.js';
import {
  attrValue,
  hasAttr,
  jsonLdScriptCount,
  parseHtmlEvidence,
  parsedJsonLdBlocks,
  tagsNamed,
} from './html.js';
import { RULE_OF_TWO_LEXICON, type RuleOfTwoClass } from './registry.js';
import type { CheckResult } from './types.js';

interface Fetched {
  url: string;
  status: number;
  headers: Headers;
  text: string;
}

interface ServerCard {
  tools?: unknown[];
  signature?: unknown;
  integrity?: unknown;
  session_isolation?: unknown;
}

export async function runWirePass(
  inputUrl: string,
  renderedDom: RenderedDomInput = {}
): Promise<CheckResult[]> {
  const url = normalizeUrl(inputUrl);
  const results: CheckResult[] = [];
  const page = await fetchMainPage(url);
  const html = page?.text ?? '';
  const parsedHtml = parseHtmlEvidence(html);
  const rendered = await resolveRenderedDom(url, renderedDom);
  const origin = new URL(url).origin;

  const robots = nonHtml(await fetchText(`${origin}/robots.txt`));
  const sitemapRaw = await fetchText(`${origin}/sitemap.xml`);
  const sitemap =
    sitemapRaw && /<(urlset|sitemapindex)[\s>]/i.test(sitemapRaw.text)
      ? sitemapRaw
      : undefined;
  const llms = await firstFetch([
    `${origin}/.well-known/llms.txt`,
    `${origin}/llms.txt`,
  ]);
  const markdown = await fetchText(url, { Accept: 'text/markdown' });
  const serverCard = await fetchText(
    `${origin}/.well-known/mcp/server-card.json`
  );
  const openapi = jsonObjectWith(
    await firstFetch([
      `${origin}/openapi.json`,
      `${origin}/.well-known/api-catalog`,
      `${origin}/api-catalog.json`,
    ]),
    ['openapi', 'swagger', 'paths', 'linkset']
  );
  const oauth = jsonObjectWith(
    await firstFetch([
      `${origin}/.well-known/oauth-authorization-server`,
      `${origin}/.well-known/openid-configuration`,
    ]),
    ['issuer', 'authorization_endpoint']
  );
  const agents = nonHtml(await fetchText(`${origin}/AGENTS.md`));

  results.push(
    check(
      'wire.robots',
      'robots.txt parses',
      'crawl_access',
      'WIRE_ONLY',
      4,
      robots ? 'pass' : 'fail',
      robots ? 100 : 0,
      [robots ? 'robots.txt is served.' : 'robots.txt was not served.'],
      { wire_value: robots?.status }
    )
  );
  const aiDirectives = robots
    ? /GPTBot|ClaudeBot|Google-Extended|PerplexityBot|CCBot|anthropic-ai/i.test(
        robots.text
      )
    : false;
  results.push(
    check(
      'wire.ai_crawler_directives',
      'AI crawler directives',
      'crawl_access',
      'WIRE_ONLY',
      4,
      robots ? (aiDirectives ? 'pass' : 'partial') : 'unknown',
      aiDirectives ? 100 : robots ? 40 : 0,
      [
        robots
          ? aiDirectives
            ? 'robots.txt includes explicit AI crawler directives.'
            : 'No explicit AI crawler directives found; this may be intentional but is less legible to agents.'
          : 'robots.txt unavailable; AI crawler directives are not assessable.',
      ]
    )
  );
  results.push(
    check(
      'wire.sitemap',
      'sitemap.xml',
      'crawl_access',
      'WIRE_ONLY',
      4,
      sitemap ? 'pass' : 'fail',
      sitemap ? 100 : 0,
      [sitemap ? 'sitemap.xml is served.' : 'sitemap.xml was not found.']
    )
  );
  const llmsText = llms ? parseLlmsTxt(llms.text) : undefined;
  results.push(
    check(
      'wire.llms_txt_present',
      'llms.txt',
      'crawl_access',
      'WIRE_ONLY',
      0.05,
      llmsText?.valid ? 'pass' : llms ? 'partial' : 'unknown',
      llmsText?.valid ? 100 : llms ? 50 : 0,
      [
        llms
          ? `llms.txt found at ${llms.url}; ${llmsText?.note ?? 'malformed.'} Emerging/unproven by major AI providers; weighted low.`
          : 'No llms.txt endpoint found. Emerging/unproven by major AI providers; weighted low.',
      ],
      {
        wire_value: llms ? { url: llms.url, ...llmsText } : undefined,
        metadata: {
          confidence: 'high',
          status: 'implemented',
          labels: ['emerging', 'low-weight'],
        },
      }
    )
  );
  const contentSignals = detectContentSignals(page, robots);
  results.push(
    check(
      'wire.content_signals',
      'Content-Signals / crawler policy headers',
      'crawl_access',
      'WIRE_ONLY',
      0.05,
      contentSignals.length ? 'pass' : 'unknown',
      contentSignals.length ? 100 : 0,
      [
        contentSignals.length
          ? `Detected content/crawler policy signals: ${contentSignals.join(', ')}.`
          : 'No content-signal headers or policy markers detected; emerging signal.',
      ],
      {
        wire_value: { signals: contentSignals },
        metadata: {
          confidence: 'high',
          status: 'implemented',
          labels: ['emerging', 'low-weight'],
        },
      }
    )
  );

  const renderedText = rendered?.text.trim();
  const visibleTextSource = renderedText ? 'rendered' : 'fetch';
  const textLen = (renderedText ?? parsedHtml.visibleText).length;
  const hasTextEvidence = Boolean(renderedText || page);
  results.push(
    check(
      'wire.initial_html_content',
      'primary content in initial HTML',
      'content_legibility',
      'WIRE_ONLY',
      9,
      textLen > 600
        ? 'pass'
        : textLen > 200
          ? 'partial'
          : hasTextEvidence
            ? 'fail'
            : 'unknown',
      textLen > 600 ? 100 : textLen > 200 ? 60 : 0,
      [
        visibleTextSource === 'rendered'
          ? `Rendered visible text length: ${textLen}.`
          : `Initial HTML visible text length: ${textLen}. Fetch-only SSR/CSR detection is heuristic without rendered DOM evidence.`,
      ],
      {
        metadata: {
          confidence: visibleTextSource === 'rendered' ? 'high' : 'heuristic',
          status: visibleTextSource === 'rendered' ? 'implemented' : 'partial',
          labels:
            visibleTextSource === 'rendered'
              ? ['rendered-dom']
              : ['fetch-only'],
        },
      }
    )
  );
  const markdownNegotiation =
    markdown &&
    /markdown|text\/plain/i.test(markdown.headers.get('content-type') ?? '') &&
    markdown.text !== html;
  results.push(
    check(
      'wire.markdown_negotiation',
      'markdown content negotiation',
      'content_legibility',
      'WIRE_ONLY',
      3,
      markdownNegotiation ? 'pass' : 'fail',
      markdownNegotiation ? 100 : 0,
      [
        markdownNegotiation
          ? 'Accept: text/markdown returns a markdown/plain representation.'
          : 'No markdown representation detected. Emerging signal; weighted low.',
      ]
    )
  );
  const pageWeight = Buffer.byteLength(html, 'utf8');
  results.push(
    check(
      'wire.token_cost_page_weight',
      'token-cost/page-weight heuristic',
      'content_legibility',
      'WIRE_ONLY',
      4,
      pageWeight < 250_000 ? 'pass' : pageWeight < 750_000 ? 'partial' : 'fail',
      pageWeight < 250_000 ? 100 : pageWeight < 750_000 ? 50 : 0,
      [`Initial HTML byte size: ${pageWeight}.`]
    )
  );
  const cleanDom = tagsNamed(parsedHtml, 'script').length < 20;
  results.push(
    check(
      'wire.clean_dom',
      'clean DOM heuristic',
      'content_legibility',
      'WIRE_ONLY',
      4,
      cleanDom ? 'pass' : 'partial',
      cleanDom ? 100 : 50,
      [
        cleanDom
          ? 'Script count is modest.'
          : 'High script count may increase extraction cost.',
      ]
    )
  );

  const jsonLdCount = jsonLdScriptCount(parsedHtml);
  const validJsonLd = parsedJsonLdBlocks(parsedHtml);
  results.push(
    check(
      'wire.json_ld',
      'valid JSON-LD',
      'structured_meaning',
      'WIRE_ONLY',
      6,
      jsonLdCount > 0 && jsonLdCount === validJsonLd.length
        ? 'pass'
        : jsonLdCount > 0
          ? 'partial'
          : 'fail',
      jsonLdCount > 0 && jsonLdCount === validJsonLd.length
        ? 100
        : jsonLdCount > 0
          ? 50
          : 0,
      [
        jsonLdCount
          ? `Found ${jsonLdCount} JSON-LD block(s); ${validJsonLd.length} parsed successfully.`
          : 'No JSON-LD found.',
      ],
      {
        wire_value: { blocks: jsonLdCount, valid_blocks: validJsonLd.length },
      }
    )
  );
  const openGraphTags = parsedHtml.tags.filter((tag) =>
    attrValue(tag.attrs, 'property')?.toLowerCase().startsWith('og:')
  );
  results.push(
    check(
      'wire.open_graph',
      'Open Graph metadata',
      'structured_meaning',
      'WIRE_ONLY',
      3,
      openGraphTags.length > 0 ? 'pass' : 'fail',
      openGraphTags.length > 0 ? 100 : 0,
      [
        openGraphTags.length > 0
          ? `Open Graph tags found: ${openGraphTags.length}.`
          : 'No Open Graph tags found.',
      ],
      { wire_value: { tags: openGraphTags.length } }
    )
  );
  const h1Count = tagsNamed(parsedHtml, 'h1').length;
  results.push(
    check(
      'wire.single_h1',
      'single h1',
      'structured_meaning',
      'WIRE_ONLY',
      4,
      h1Count === 1 ? 'pass' : h1Count > 1 ? 'partial' : 'fail',
      h1Count === 1 ? 100 : h1Count > 1 ? 50 : 0,
      [`h1 count: ${h1Count}.`]
    )
  );
  const semanticLandmarkTags = new Set([
    'main',
    'nav',
    'header',
    'footer',
    'article',
    'section',
  ]);
  const landmarkCount = parsedHtml.tags.filter((tag) =>
    semanticLandmarkTags.has(tag.name)
  ).length;
  results.push(
    check(
      'wire.semantic_landmarks',
      'semantic landmarks',
      'structured_meaning',
      'WIRE_ONLY',
      5,
      landmarkCount > 0 ? 'pass' : 'fail',
      landmarkCount > 0 ? 100 : 0,
      [
        landmarkCount > 0
          ? `Semantic landmarks found: ${landmarkCount}.`
          : 'No common semantic landmarks found.',
      ],
      { wire_value: { landmarks: landmarkCount } }
    )
  );

  const parsedServerCard = serverCard
    ? plainObject(safeJson<ServerCard>(serverCard.text))
    : undefined;
  const liveTools = extractToolNames(parsedServerCard);
  const liveToolCount = liveTools.length;
  results.push(
    check(
      'wire.mcp_server_card',
      'MCP Server Card',
      'agent_operability',
      'WIRE_ONLY',
      5,
      parsedServerCard ? 'pass' : 'fail',
      parsedServerCard ? 100 : 0,
      [
        parsedServerCard
          ? 'MCP Server Card is served. Emerging signal; weighted low.'
          : 'No MCP Server Card found. Emerging signal; weighted low.',
      ],
      { wire_value: { live_tool_count: liveToolCount, tools: liveTools } }
    )
  );
  results.push(
    check(
      'wire.openapi_catalog',
      'OpenAPI/API catalog',
      'agent_operability',
      'WIRE_ONLY',
      5,
      openapi ? 'pass' : 'fail',
      openapi ? 100 : 0,
      [
        openapi
          ? `API description found at ${openapi.url}.`
          : 'No OpenAPI/API Catalog endpoint found.',
      ]
    )
  );
  results.push(
    check(
      'wire.oauth_discovery',
      'OAuth discovery',
      'agent_operability',
      'WIRE_ONLY',
      4,
      oauth ? 'pass' : 'fail',
      oauth ? 100 : 0,
      [
        oauth
          ? `OAuth/OIDC discovery found at ${oauth.url}.`
          : 'No OAuth/OIDC discovery endpoint found.',
      ]
    )
  );
  results.push(
    check(
      'wire.agents_md',
      'AGENTS.md',
      'agent_operability',
      'WIRE_ONLY',
      3,
      agents ? 'pass' : 'fail',
      agents ? 100 : 0,
      [agents ? 'AGENTS.md is served.' : 'No AGENTS.md found.']
    )
  );
  results.push(
    check(
      'wire.webmcp',
      'WebMCP registration',
      'agent_operability',
      'WIRE_ONLY',
      3,
      /webmcp|navigator\.mcp|mcp\.register/i.test(html) ? 'pass' : 'fail',
      /webmcp|navigator\.mcp|mcp\.register/i.test(html) ? 100 : 0,
      [
        /webmcp|navigator\.mcp|mcp\.register/i.test(html)
          ? 'Possible WebMCP registration found. Emerging signal; weighted low.'
          : 'No WebMCP registration found. Emerging signal; weighted low.',
      ]
    )
  );

  const images = tagsNamed(parsedHtml, 'img');
  const missingAlt = images.filter((tag) => !hasAttr(tag.attrs, 'alt')).length;
  results.push(
    check(
      'wire.alt_attributes',
      'image alt attributes',
      'navigability_stability',
      'WIRE_ONLY',
      4,
      missingAlt === 0 ? 'pass' : 'partial',
      missingAlt === 0 ? 100 : 50,
      [`Images: ${images.length}; missing alt: ${missingAlt}.`],
      { wire_value: { images: images.length, missing_alt: missingAlt } }
    )
  );
  const renderedFields = rendered
    ? analyzeRenderedFields(rendered.interactive)
    : undefined;
  const inputs = tagsNamed(parsedHtml, 'input');
  const staticUnlabeled = inputs.filter(
    (tag) =>
      !hasAttr(tag.attrs, 'aria-label') &&
      !hasAttr(tag.attrs, 'aria-labelledby') &&
      !hasAttr(tag.attrs, 'id')
  ).length;
  const fieldTotal = renderedFields?.total ?? inputs.length;
  const unlabeled = renderedFields?.unlabeled ?? staticUnlabeled;
  results.push(
    check(
      'wire.labeled_fields',
      'labeled fields heuristic',
      'navigability_stability',
      'WIRE_ONLY',
      5,
      unlabeled === 0 ? 'pass' : 'partial',
      unlabeled === 0 ? 100 : 50,
      [
        renderedFields
          ? `Rendered form fields: ${fieldTotal}; without accessible name: ${unlabeled}.`
          : `Inputs: ${fieldTotal}; potentially unlabeled: ${unlabeled}. Static label detection is heuristic without rendered DOM evidence.`,
      ],
      {
        metadata: {
          confidence: renderedFields ? 'high' : 'heuristic',
          status: renderedFields ? 'implemented' : 'partial',
          labels: renderedFields
            ? ['rendered-dom', 'accessible-name']
            : ['static-html'],
        },
      }
    )
  );
  const accessibility = rendered?.accessibility;
  results.push(
    check(
      'wire.accessibility_probe',
      'rendered accessibility probe',
      'navigability_stability',
      'WIRE_ONLY',
      3,
      accessibility
        ? accessibility.violations === 0
          ? 'pass'
          : accessibility.violations <= 3
            ? 'partial'
            : 'fail'
        : 'unknown',
      accessibility
        ? accessibility.violations === 0
          ? 100
          : accessibility.violations <= 3
            ? 60
            : 0
        : 0,
      [
        accessibility
          ? `Rendered accessibility summary: ${accessibility.violations} violation(s), ${accessibility.incomplete} incomplete, ${accessibility.passes} pass(es).`
          : 'Rendered accessibility adapter evidence was unavailable.',
      ],
      {
        wire_value: accessibility,
        metadata: {
          confidence: accessibility ? 'high' : 'unknown',
          status: accessibility ? 'implemented' : 'adapter_missing',
          labels: accessibility
            ? ['rendered-dom', 'accessibility-summary']
            : ['adapter-missing'],
        },
      }
    )
  );
  const badLinks = parsedHtml.anchors.filter((anchor) =>
    ['click here', 'here', 'more'].includes(anchor.text.toLowerCase())
  ).length;
  results.push(
    check(
      'wire.descriptive_links',
      'descriptive links',
      'navigability_stability',
      'WIRE_ONLY',
      4,
      badLinks === 0 ? 'pass' : 'partial',
      badLinks === 0 ? 100 : 50,
      [`Non-descriptive link labels: ${badLinks}.`],
      { wire_value: { non_descriptive_links: badLinks } }
    )
  );
  const cls = rendered?.metrics?.cumulativeLayoutShift;
  results.push(
    check(
      'wire.cls_probe',
      'CLS probe',
      'navigability_stability',
      'WIRE_ONLY',
      3,
      typeof cls === 'number'
        ? cls <= 0.1
          ? 'pass'
          : cls <= 0.25
            ? 'partial'
            : 'fail'
        : 'unknown',
      typeof cls === 'number' ? (cls <= 0.1 ? 100 : cls <= 0.25 ? 60 : 0) : 0,
      [
        typeof cls === 'number'
          ? `Rendered cumulative layout shift: ${cls}.`
          : 'Rendered layout metric evidence was unavailable.',
      ],
      {
        wire_value:
          typeof cls === 'number'
            ? { cumulative_layout_shift: cls }
            : undefined,
        metadata: {
          confidence: typeof cls === 'number' ? 'high' : 'unknown',
          status: typeof cls === 'number' ? 'implemented' : 'adapter_missing',
          labels:
            typeof cls === 'number'
              ? ['rendered-dom', 'layout-metric']
              : ['adapter-missing'],
        },
      }
    )
  );
  results.push(
    check(
      'wire.aria_resolvable',
      'ARIA-resolvable selectors heuristic',
      'navigability_stability',
      'WIRE_ONLY',
      2,
      hasAriaAttributes(parsedHtml) ? 'pass' : 'partial',
      hasAriaAttributes(parsedHtml) ? 100 : 50,
      [
        hasAriaAttributes(parsedHtml)
          ? 'ARIA attributes present; full resolution requires axe-core adapter.'
          : 'No ARIA attributes found; full axe-core adapter not installed.',
      ]
    )
  );

  results.push(
    check(
      'wire.https',
      'HTTPS',
      'trust_freshness',
      'WIRE_ONLY',
      3,
      url.startsWith('https://') ? 'pass' : 'fail',
      url.startsWith('https://') ? 100 : 0,
      [
        url.startsWith('https://')
          ? 'URL uses HTTPS.'
          : 'URL does not use HTTPS.',
      ]
    )
  );
  results.push(
    check(
      'wire.canonical',
      'canonical URL',
      'trust_freshness',
      'WIRE_ONLY',
      2,
      hasLinkRel(parsedHtml, 'canonical') ? 'pass' : 'fail',
      hasLinkRel(parsedHtml, 'canonical') ? 100 : 0,
      [
        hasLinkRel(parsedHtml, 'canonical')
          ? 'Canonical link found.'
          : 'No canonical link found.',
      ]
    )
  );
  const freshness = hasFreshnessSignal(parsedHtml);
  results.push(
    check(
      'wire.last_updated',
      'freshness signal',
      'trust_freshness',
      'WIRE_ONLY',
      3,
      freshness ? 'pass' : 'fail',
      freshness ? 100 : 0,
      [
        freshness
          ? 'Found date/freshness text or schema.'
          : 'No freshness signal found.',
      ]
    )
  );
  const citations = hasCitationSignal(parsedHtml);
  results.push(
    check(
      'wire.citations',
      'citations/statistics',
      'trust_freshness',
      'WIRE_ONLY',
      2,
      citations ? 'pass' : 'fail',
      citations ? 100 : 0,
      [
        citations
          ? 'Citation-like links or cite tags found.'
          : 'No citation-like evidence found.',
      ]
    )
  );
  const author = hasAuthorSignal(parsedHtml);
  results.push(
    check(
      'wire.author',
      'author/person signal',
      'trust_freshness',
      'WIRE_ONLY',
      2,
      author ? 'pass' : 'fail',
      author ? 100 : 0,
      [
        author
          ? 'Author/person signal found.'
          : 'No author/person signal found.',
      ]
    )
  );

  results.push(ruleOfTwoCheck(parsedServerCard, Boolean(serverCard)));
  results.push(
    check(
      'wire.manifest_pinning',
      'signed/pinned MCP manifests',
      'runtime_agent_safety',
      'WIRE_ONLY',
      20,
      parsedServerCard?.signature || parsedServerCard?.integrity
        ? 'pass'
        : liveToolCount
          ? 'fail'
          : 'unknown',
      parsedServerCard?.signature || parsedServerCard?.integrity ? 100 : 0,
      [
        parsedServerCard?.signature || parsedServerCard?.integrity
          ? 'Server Card includes signature/integrity evidence.'
          : liveToolCount
            ? 'Live tools found without signature/integrity evidence.'
            : 'No live MCP tools found to assess.',
      ]
    )
  );
  const injectionFindings = detectInjectionSurface(html);
  results.push(
    check(
      'wire.indirect_injection_surface',
      'indirect prompt-injection surface',
      'runtime_agent_safety',
      'WIRE_ONLY',
      25,
      injectionFindings.length ? 'fail' : 'pass',
      injectionFindings.length ? 0 : 100,
      injectionFindings.length
        ? injectionFindings.slice(0, 5)
        : ['No hidden text payloads or injection-imperative phrases found.'],
      { wire_value: { findings: injectionFindings.length } }
    )
  );
  const scopes = parsedServerCard
    ? (JSON.stringify(parsedServerCard).match(/scope|permission/gi)?.length ??
      0)
    : 0;
  results.push(
    check(
      'wire.oauth_scope_tightness',
      'OAuth scope tightness',
      'runtime_agent_safety',
      'WIRE_ONLY',
      20,
      scopes > 0 ? 'partial' : liveToolCount ? 'fail' : 'unknown',
      scopes > 0 ? 60 : 0,
      [
        scopes > 0
          ? 'Scope/permission language found; manual review still needed.'
          : liveToolCount
            ? 'Live tools found without evident scope language.'
            : 'No live tools found to assess.',
      ]
    )
  );

  return results;
}

const FETCH_TIMEOUT_MS = 10_000;

function normalizeUrl(input: string) {
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`Invalid URL ${JSON.stringify(input)}.`);
  }
  const host = parsed.hostname;
  if (!(host.includes('.') || host.includes(':') || host === 'localhost'))
    throw new Error(
      `Invalid URL ${JSON.stringify(input)}: ${JSON.stringify(host)} is not a plausible hostname.`
    );
  return candidate;
}

// The main page distinguishes network-level failure (DNS, refused, timeout)
// from an HTTP response: an unreachable origin is an operational error, not
// evidence, and must never be scored as pass/fail results.
async function fetchMainPage(url: string): Promise<Fetched | undefined> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    return {
      url,
      status: res.status,
      headers: res.headers,
      text: await res.text(),
    };
  } catch (error) {
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`Could not reach ${url}: ${cause}`);
  }
}

async function fetchText(
  url: string,
  headers: Record<string, string> = {}
): Promise<Fetched | undefined> {
  try {
    const res = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    return {
      url,
      status: res.status,
      headers: res.headers,
      text: await res.text(),
    };
  } catch {
    return undefined;
  }
}

// SPA catch-all rewrites answer every path with 200 index.html; a well-known
// endpoint only counts when its body is plausible for the format.
function nonHtml(fetched: Fetched | undefined): Fetched | undefined {
  if (!fetched) return undefined;
  return fetched.text.trimStart().startsWith('<') ? undefined : fetched;
}

function jsonObjectWith(
  fetched: Fetched | undefined,
  keys: string[]
): Fetched | undefined {
  if (!fetched) return undefined;
  const parsed = safeJson<Record<string, unknown>>(fetched.text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return undefined;
  return keys.some((key) => key in parsed) ? fetched : undefined;
}

function plainObject<T>(value: T | undefined): T | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined;
}

async function firstFetch(urls: string[]) {
  for (const url of urls) {
    const res = await fetchText(url);
    if (res) return res;
  }
  return undefined;
}

function safeJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function hasAriaAttributes(parsed: ReturnType<typeof parseHtmlEvidence>) {
  return parsed.tags.some((tag) =>
    Object.keys(tag.attrs).some((name) => name.startsWith('aria-'))
  );
}

function hasLinkRel(parsed: ReturnType<typeof parseHtmlEvidence>, rel: string) {
  return parsed.tags.some(
    (tag) =>
      tag.name === 'link' &&
      attrValue(tag.attrs, 'rel')
        ?.split(/\s+/)
        .some((value) => value.toLowerCase() === rel)
  );
}

function hasFreshnessSignal(parsed: ReturnType<typeof parseHtmlEvidence>) {
  const jsonLdText = JSON.stringify(parsedJsonLdBlocks(parsed));
  return (
    /datePublished|dateModified/i.test(jsonLdText) ||
    /last updated|updated/i.test(parsed.visibleText)
  );
}

function hasCitationSignal(parsed: ReturnType<typeof parseHtmlEvidence>) {
  return parsed.tags.some((tag) => {
    if (tag.name === 'cite') return true;
    const href = attrValue(tag.attrs, 'href');
    return Boolean(
      href && /doi\.org|pubmed|arxiv|wikipedia|\.gov|\.edu/i.test(href)
    );
  });
}

function hasAuthorSignal(parsed: ReturnType<typeof parseHtmlEvidence>) {
  return (
    parsedJsonLdBlocks(parsed).some(hasPersonType) ||
    parsed.tags.some((tag) => {
      if (attrValue(tag.attrs, 'rel')?.toLowerCase() === 'author') return true;
      return attrValue(tag.attrs, 'name')?.toLowerCase() === 'author';
    })
  );
}

function hasPersonType(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasPersonType);
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record['@type'] === 'Person') return true;
  return Object.values(record).some(hasPersonType);
}

function parseLlmsTxt(text: string) {
  const trimmed = text.trim();
  const hasHeading = /^#\s+\S+/m.test(trimmed);
  const hasLinks =
    /\[[^\]]+\]\([^)]+\)/.test(trimmed) || /^https?:\/\//m.test(trimmed);
  const valid = trimmed.length > 0 && (hasHeading || hasLinks);
  return {
    valid,
    has_heading: hasHeading,
    has_links: hasLinks,
    note: valid
      ? 'basic structure is parseable.'
      : 'basic title/link structure was not detected.',
  };
}

function detectContentSignals(
  page: Fetched | undefined,
  robots: Fetched | undefined
) {
  const signals = new Set<string>();
  const xRobots = page?.headers.get('x-robots-tag');
  if (xRobots) signals.add(`x-robots-tag=${xRobots}`);
  const permissionsPolicy = page?.headers.get('permissions-policy');
  if (
    permissionsPolicy &&
    /interest-cohort|browsing-topics/i.test(permissionsPolicy)
  )
    signals.add('permissions-policy');
  if (
    robots &&
    /Content-Signal|ai-policy|tdm-reservation|noai/i.test(robots.text)
  )
    signals.add('robots-policy-marker');
  return [...signals].sort();
}

function analyzeRenderedFields(
  interactive: Array<{
    role?: string;
    name?: string;
    tagName: string;
    type?: string;
    disabled?: boolean;
  }>
) {
  const fields = interactive.filter((element) => {
    if (element.disabled) return false;
    if (['input', 'select', 'textarea'].includes(element.tagName)) {
      return !['hidden', 'submit', 'button', 'reset'].includes(
        element.type ?? ''
      );
    }
    return [
      'checkbox',
      'combobox',
      'listbox',
      'radio',
      'searchbox',
      'slider',
      'spinbutton',
      'switch',
      'textbox',
    ].includes(element.role ?? '');
  });
  return {
    total: fields.length,
    unlabeled: fields.filter((element) => !element.name?.trim()).length,
  };
}

// Deterministic injection-surface heuristic. Two signals, both with quoted
// evidence: (1) inline-hidden elements that carry a text payload — ordinary
// utility CSS in a stylesheet does not match; (2) injection-imperative
// phrases. Bare `display:none` or small font sizes never fail on their own.
const HIDDEN_TEXT_PATTERN =
  /style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?![.\d]))[^"']*["'][^>]*>\s*([^<]{12,})/gi;
const INJECTION_PHRASE_PATTERN =
  /(?:ignore|disregard)\s+(?:all\s+)?previous\s+(?:instructions|messages|prompts)/gi;

function detectInjectionSurface(html: string): string[] {
  const findings: string[] = [];
  for (const match of html.matchAll(HIDDEN_TEXT_PATTERN)) {
    findings.push(`Hidden-styled text payload: "${snippet(match[1])}"`);
  }
  for (const match of html.matchAll(INJECTION_PHRASE_PATTERN)) {
    const start = Math.max(0, (match.index ?? 0) - 20);
    const context = html.slice(start, (match.index ?? 0) + match[0].length);
    findings.push(`Injection-imperative phrase: "${snippet(context)}"`);
  }
  return findings;
}

function snippet(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > 80 ? `${collapsed.slice(0, 77)}...` : collapsed;
}

type RuleOfTwoClasses = Partial<Record<RuleOfTwoClass, string[]>>;

interface ToolClassification {
  tool: string;
  classes: RuleOfTwoClass[];
  matched_terms: RuleOfTwoClasses;
}

// Rule-of-Two v0.1: a machine-checkable predicate over declared MCP tool
// schemas. Page HTML plays no part; absent tool schemas yield unknown, never
// a fabricated pass/fail.
function ruleOfTwoCheck(
  card: ServerCard | undefined,
  cardServed: boolean
): CheckResult {
  const declaredTools = Array.isArray(card?.tools) ? card.tools : undefined;
  if (!declaredTools) {
    return check(
      'wire.rule_of_two',
      'Rule-of-Two / lethal-trifecta posture',
      'runtime_agent_safety',
      'WIRE_ONLY',
      35,
      'unknown',
      0,
      [
        cardServed
          ? 'An MCP server card is served but declares no tools array; Rule-of-Two posture over declared tool schemas is not assessable.'
          : 'No MCP server card discoverable, so no tool schemas exist to assess. This is expected for sites without an MCP surface and does not penalize the score.',
      ],
      { wire_value: { lexicon_version: RULE_OF_TWO_LEXICON.version } }
    );
  }

  const classifications = declaredTools
    .map((tool) => classifyDeclaredTool(tool))
    .filter((entry): entry is ToolClassification => entry !== undefined);
  const singleViolators = classifications.filter(
    (entry) => entry.classes.length === 3
  );
  const union = new Set(classifications.flatMap((entry) => entry.classes));
  const sessionIsolation = card?.session_isolation === true;
  const toolsetSpan = union.size === 3 && !sessionIsolation;
  const violation = singleViolators.length
    ? 'single-tool'
    : toolsetSpan
      ? 'toolset'
      : null;

  const notes = ruleOfTwoNotes(
    classifications,
    singleViolators,
    violation,
    sessionIsolation,
    union
  );
  return check(
    'wire.rule_of_two',
    'Rule-of-Two / lethal-trifecta posture',
    'runtime_agent_safety',
    'WIRE_ONLY',
    35,
    violation ? 'fail' : 'pass',
    violation ? 0 : 100,
    notes,
    {
      wire_value: {
        lexicon_version: RULE_OF_TWO_LEXICON.version,
        tool_classes: classifications,
        violation,
        session_isolation: sessionIsolation,
      },
    }
  );
}

function ruleOfTwoNotes(
  classifications: ToolClassification[],
  singleViolators: ToolClassification[],
  violation: 'single-tool' | 'toolset' | null,
  sessionIsolation: boolean,
  union: Set<RuleOfTwoClass>
): string[] {
  if (!classifications.length)
    return ['Declared toolset is empty; no capability combination possible.'];
  if (violation === 'single-tool')
    return singleViolators.map(
      (entry) =>
        `Tool ${entry.tool} spans all three risk classes: ${describeMatches(entry.matched_terms)}.`
    );
  if (violation === 'toolset')
    return [
      `Declared toolset collectively spans untrusted content, private data, and side effects with no machine-readable session isolation: ${classifications
        .filter((entry) => entry.classes.length > 0)
        .map((entry) => `${entry.tool} (${entry.classes.join(', ')})`)
        .join('; ')}.`,
    ];
  if (union.size === 3 && sessionIsolation)
    return [
      'Toolset spans all three risk classes, but the server card declares session isolation; no single session combines them.',
    ];
  return [
    `No Rule-of-Two violation: ${classifications.length} declared tool(s) span ${union.size} of 3 risk classes.`,
  ];
}

function describeMatches(matched: RuleOfTwoClasses): string {
  return Object.entries(matched)
    .map(([riskClass, terms]) => `${riskClass} (${terms.join(', ')})`)
    .join(', ');
}

function classifyDeclaredTool(tool: unknown): ToolClassification | undefined {
  const name =
    typeof tool === 'string' ? tool : objectStringValue(tool, 'name');
  if (typeof name !== 'string' || !name.trim()) return undefined;
  const corpus = normalizeIdentifierText(
    [
      name,
      objectStringValue(tool, 'description') ?? '',
      ...schemaText(tool),
    ].join(' ')
  );
  const matched: RuleOfTwoClasses = {};
  const classes: RuleOfTwoClass[] = [];
  for (const [riskClass, terms] of Object.entries(
    RULE_OF_TWO_LEXICON.classes
  ) as [RuleOfTwoClass, readonly string[]][]) {
    const hits = terms.filter((term) =>
      new RegExp(`\\b${escapeRegExp(term)}\\b`).test(corpus)
    );
    if (hits.length) {
      matched[riskClass] = hits;
      classes.push(riskClass);
    }
  }
  return { tool: name.trim(), classes, matched_terms: matched };
}

// Collect property names and description strings from declared JSON schemas
// (inputSchema/outputSchema/parameters), bounded to a small depth.
function schemaText(tool: unknown, depth = 0): string[] {
  if (depth > 6 || !tool || typeof tool !== 'object') return [];
  const record = tool as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ['inputSchema', 'outputSchema', 'parameters']) {
    out.push(...schemaNodeText(record[key], depth + 1));
  }
  return out;
}

function schemaNodeText(node: unknown, depth: number): string[] {
  if (depth > 6 || !node || typeof node !== 'object') return [];
  const record = node as Record<string, unknown>;
  const out: string[] = [];
  if (typeof record.description === 'string') out.push(record.description);
  const properties = record.properties;
  if (properties && typeof properties === 'object') {
    for (const [key, value] of Object.entries(properties)) {
      out.push(key, ...schemaNodeText(value, depth + 1));
    }
  }
  if (record.items) out.push(...schemaNodeText(record.items, depth + 1));
  return out;
}

function normalizeIdentifierText(text: string): string {
  return text.toLowerCase().replace(/[_\-./]+/g, ' ');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractToolNames(parsed: ServerCard | undefined): string[] {
  if (!Array.isArray(parsed?.tools)) return [];
  const names: string[] = [];
  for (const tool of parsed.tools) {
    const name =
      typeof tool === 'string' ? tool : objectStringValue(tool, 'name');
    if (typeof name === 'string' && name.trim().length > 0)
      names.push(name.trim());
  }
  return [...new Set(names)].sort();
}

function objectStringValue(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string' ? record[key] : undefined;
}
