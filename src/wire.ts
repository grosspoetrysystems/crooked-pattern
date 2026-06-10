import { check } from "./checks.js";
import { resolveRenderedDom, type RenderedDomInput } from "./adapters/playwright.js";
import type { CheckResult } from "./types.js";

interface Fetched {
  url: string;
  status: number;
  headers: Headers;
  text: string;
}

export async function runWirePass(inputUrl: string, renderedDom: RenderedDomInput = {}): Promise<CheckResult[]> {
  const url = normalizeUrl(inputUrl);
  const results: CheckResult[] = [];
  const page = await fetchText(url);
  const html = page?.text ?? "";
  const rendered = await resolveRenderedDom(url, renderedDom);
  const origin = new URL(url).origin;

  const robots = await fetchText(`${origin}/robots.txt`);
  const sitemap = await fetchText(`${origin}/sitemap.xml`);
  const llms = await firstFetch([`${origin}/.well-known/llms.txt`, `${origin}/llms.txt`]);
  const markdown = await fetchText(url, { Accept: "text/markdown" });
  const serverCard = await fetchText(`${origin}/.well-known/mcp/server-card.json`);
  const openapi = await firstFetch([`${origin}/openapi.json`, `${origin}/.well-known/api-catalog`, `${origin}/api-catalog.json`]);
  const oauth = await firstFetch([`${origin}/.well-known/oauth-authorization-server`, `${origin}/.well-known/openid-configuration`]);
  const agents = await fetchText(`${origin}/AGENTS.md`);

  results.push(check("wire.robots", "robots.txt parses", "crawl_access", "WIRE_ONLY", 4, robots ? "pass" : "fail", robots ? 100 : 0, [robots ? "robots.txt is served." : "robots.txt was not served."], { wire_value: robots?.status }));
  const aiDirectives = robots ? /GPTBot|ClaudeBot|Google-Extended|PerplexityBot|CCBot|anthropic-ai/i.test(robots.text) : false;
  results.push(check("wire.ai_crawler_directives", "AI crawler directives", "crawl_access", "WIRE_ONLY", 4, aiDirectives ? "pass" : "partial", aiDirectives ? 100 : 40, [aiDirectives ? "robots.txt includes explicit AI crawler directives." : "No explicit AI crawler directives found; this may be intentional but is less legible to agents."]));
  results.push(check("wire.sitemap", "sitemap.xml", "crawl_access", "WIRE_ONLY", 4, sitemap ? "pass" : "fail", sitemap ? 100 : 0, [sitemap ? "sitemap.xml is served." : "sitemap.xml was not found."]));
  const llmsText = llms ? parseLlmsTxt(llms.text) : undefined;
  results.push(check("wire.llms_txt_present", "llms.txt", "crawl_access", "WIRE_ONLY", 0.05, llmsText?.valid ? "pass" : llms ? "partial" : "unknown", llmsText?.valid ? 100 : llms ? 50 : 0, [llms ? `llms.txt found at ${llms.url}; ${llmsText?.note ?? "malformed."} Emerging/unproven by major AI providers; weighted low.` : "No llms.txt endpoint found. Emerging/unproven by major AI providers; weighted low."], { wire_value: llms ? { url: llms.url, ...llmsText } : undefined, metadata: { confidence: "high", status: "implemented", labels: ["emerging", "low-weight"] } }));
  const contentSignals = detectContentSignals(page, robots);
  results.push(check("wire.content_signals", "Content-Signals / crawler policy headers", "crawl_access", "WIRE_ONLY", 0.05, contentSignals.length ? "pass" : page || robots ? "unknown" : "unknown", contentSignals.length ? 100 : 0, [contentSignals.length ? `Detected content/crawler policy signals: ${contentSignals.join(", ")}.` : "No content-signal headers or policy markers detected; emerging signal."], { wire_value: { signals: contentSignals }, metadata: { confidence: "high", status: "implemented", labels: ["emerging", "low-weight"] } }));

  const textLen = rendered?.text.length ?? visibleText(html).length;
  results.push(check("wire.initial_html_content", "primary content in initial HTML", "content_legibility", "WIRE_ONLY", 9, textLen > 600 ? "pass" : textLen > 200 ? "partial" : page ? "fail" : "unknown", textLen > 600 ? 100 : textLen > 200 ? 60 : 0, [`Initial HTML visible text length: ${textLen}. Fetch-only SSR/CSR detection is heuristic until the Playwright adapter is implemented.`], { metadata: { confidence: "heuristic", status: "partial", labels: ["fetch-only"] } }));
  const markdownNegotiation = markdown && /markdown|text\/plain/i.test(markdown.headers.get("content-type") ?? "") && markdown.text !== html;
  results.push(check("wire.markdown_negotiation", "markdown content negotiation", "content_legibility", "WIRE_ONLY", 3, markdownNegotiation ? "pass" : "fail", markdownNegotiation ? 100 : 0, [markdownNegotiation ? "Accept: text/markdown returns a markdown/plain representation." : "No markdown representation detected. Emerging signal; weighted low."]));
  const pageWeight = Buffer.byteLength(html, "utf8");
  results.push(check("wire.token_cost_page_weight", "token-cost/page-weight heuristic", "content_legibility", "WIRE_ONLY", 4, pageWeight < 250_000 ? "pass" : pageWeight < 750_000 ? "partial" : "fail", pageWeight < 250_000 ? 100 : pageWeight < 750_000 ? 50 : 0, [`Initial HTML byte size: ${pageWeight}.`]));
  const cleanDom = (html.match(/<script\b/gi)?.length ?? 0) < 20;
  results.push(check("wire.clean_dom", "clean DOM heuristic", "content_legibility", "WIRE_ONLY", 4, cleanDom ? "pass" : "partial", cleanDom ? 100 : 50, [cleanDom ? "Script count is modest." : "High script count may increase extraction cost."]));

  const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  results.push(check("wire.json_ld", "valid JSON-LD", "structured_meaning", "WIRE_ONLY", 6, jsonLd.length && jsonLd.every(canParseJson) ? "pass" : jsonLd.length ? "partial" : "fail", jsonLd.length && jsonLd.every(canParseJson) ? 100 : jsonLd.length ? 50 : 0, [jsonLd.length ? `Found ${jsonLd.length} JSON-LD block(s).` : "No JSON-LD found."]));
  results.push(check("wire.open_graph", "Open Graph metadata", "structured_meaning", "WIRE_ONLY", 3, /property=["']og:/i.test(html) ? "pass" : "fail", /property=["']og:/i.test(html) ? 100 : 0, [/property=["']og:/i.test(html) ? "Open Graph tags found." : "No Open Graph tags found."]));
  const h1Count = html.match(/<h1\b/gi)?.length ?? 0;
  results.push(check("wire.single_h1", "single h1", "structured_meaning", "WIRE_ONLY", 4, h1Count === 1 ? "pass" : h1Count > 1 ? "partial" : "fail", h1Count === 1 ? 100 : h1Count > 1 ? 50 : 0, [`h1 count: ${h1Count}.`]));
  const landmarks = /<(main|nav|header|footer|article|section)\b/i.test(html);
  results.push(check("wire.semantic_landmarks", "semantic landmarks", "structured_meaning", "WIRE_ONLY", 5, landmarks ? "pass" : "fail", landmarks ? 100 : 0, [landmarks ? "Semantic landmarks found." : "No common semantic landmarks found."]));

  const parsedServerCard = serverCard ? safeJson(serverCard.text) : undefined;
  const liveTools = extractToolNames(parsedServerCard);
  const liveToolCount = liveTools.length;
  results.push(check("wire.mcp_server_card", "MCP Server Card", "agent_operability", "WIRE_ONLY", 5, parsedServerCard ? "pass" : "fail", parsedServerCard ? 100 : 0, [parsedServerCard ? "MCP Server Card is served. Emerging signal; weighted low." : "No MCP Server Card found. Emerging signal; weighted low."], { wire_value: { live_tool_count: liveToolCount, tools: liveTools } }));
  results.push(check("wire.openapi_catalog", "OpenAPI/API catalog", "agent_operability", "WIRE_ONLY", 5, openapi ? "pass" : "fail", openapi ? 100 : 0, [openapi ? `API description found at ${openapi.url}.` : "No OpenAPI/API Catalog endpoint found."]));
  results.push(check("wire.oauth_discovery", "OAuth discovery", "agent_operability", "WIRE_ONLY", 4, oauth ? "pass" : "fail", oauth ? 100 : 0, [oauth ? `OAuth/OIDC discovery found at ${oauth.url}.` : "No OAuth/OIDC discovery endpoint found."]));
  results.push(check("wire.agents_md", "AGENTS.md", "agent_operability", "WIRE_ONLY", 3, agents ? "pass" : "fail", agents ? 100 : 0, [agents ? "AGENTS.md is served." : "No AGENTS.md found."]));
  results.push(check("wire.webmcp", "WebMCP registration", "agent_operability", "WIRE_ONLY", 3, /webmcp|navigator\.mcp|mcp\.register/i.test(html) ? "pass" : "fail", /webmcp|navigator\.mcp|mcp\.register/i.test(html) ? 100 : 0, [/webmcp|navigator\.mcp|mcp\.register/i.test(html) ? "Possible WebMCP registration found. Emerging signal; weighted low." : "No WebMCP registration found. Emerging signal; weighted low."]));

  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = images.filter((tag) => !/\salt=/.test(tag)).length;
  results.push(check("wire.alt_attributes", "image alt attributes", "navigability_stability", "WIRE_ONLY", 4, missingAlt === 0 ? "pass" : "partial", missingAlt === 0 ? 100 : 50, [`Images: ${images.length}; missing alt: ${missingAlt}.`]));
  const inputs = html.match(/<input\b[^>]*>/gi) ?? [];
  const unlabeled = inputs.filter((tag) => !/\b(aria-label|aria-labelledby|id)=/i.test(tag)).length;
  results.push(check("wire.labeled_fields", "labeled fields heuristic", "navigability_stability", "WIRE_ONLY", 5, unlabeled === 0 ? "pass" : "partial", unlabeled === 0 ? 100 : 50, [`Inputs: ${inputs.length}; potentially unlabeled: ${unlabeled}. Static label detection is heuristic until axe-core/rendered DOM checks are implemented.`], { metadata: { confidence: "heuristic", status: "partial", labels: ["static-html"] } }));
  const badLinks = (html.match(/<a\b[^>]*>(click here|here|more)<\/a>/gi) ?? []).length;
  results.push(check("wire.descriptive_links", "descriptive links", "navigability_stability", "WIRE_ONLY", 4, badLinks === 0 ? "pass" : "partial", badLinks === 0 ? 100 : 50, [`Non-descriptive link labels: ${badLinks}.`]));
  results.push(check("wire.cls_probe", "CLS probe", "navigability_stability", "WIRE_ONLY", 3, "unknown", 0, ["Headless browser CLS measurement is not installed in this Phase 1 static runtime."]));
  results.push(check("wire.aria_resolvable", "ARIA-resolvable selectors heuristic", "navigability_stability", "WIRE_ONLY", 2, /\baria-/.test(html) ? "pass" : "partial", /\baria-/.test(html) ? 100 : 50, [/\baria-/.test(html) ? "ARIA attributes present; full resolution requires axe-core adapter." : "No ARIA attributes found; full axe-core adapter not installed."]));

  results.push(check("wire.https", "HTTPS", "trust_freshness", "WIRE_ONLY", 3, url.startsWith("https://") ? "pass" : "fail", url.startsWith("https://") ? 100 : 0, [url.startsWith("https://") ? "URL uses HTTPS." : "URL does not use HTTPS."]));
  results.push(check("wire.canonical", "canonical URL", "trust_freshness", "WIRE_ONLY", 2, /rel=["']canonical["']/i.test(html) ? "pass" : "fail", /rel=["']canonical["']/i.test(html) ? 100 : 0, [/rel=["']canonical["']/i.test(html) ? "Canonical link found." : "No canonical link found."]));
  const freshness = /datePublished|dateModified|last updated|updated/i.test(html);
  results.push(check("wire.last_updated", "freshness signal", "trust_freshness", "WIRE_ONLY", 3, freshness ? "pass" : "fail", freshness ? 100 : 0, [freshness ? "Found date/freshness text or schema." : "No freshness signal found."]));
  const citations = /<cite\b|href=["'][^"']*(doi\.org|pubmed|arxiv|wikipedia|\.gov|\.edu)/i.test(html);
  results.push(check("wire.citations", "citations/statistics", "trust_freshness", "WIRE_ONLY", 2, citations ? "pass" : "fail", citations ? 100 : 0, [citations ? "Citation-like links or cite tags found." : "No citation-like evidence found."]));
  const author = /"@(type)"\s*:\s*"Person"|rel=["']author["']|name=["']author["']/i.test(html);
  results.push(check("wire.author", "author/person signal", "trust_freshness", "WIRE_ONLY", 2, author ? "pass" : "fail", author ? 100 : 0, [author ? "Author/person signal found." : "No author/person signal found."]));

  const exfil = /fetch\(|webhook|email|send|postMessage|window\.open/i.test(html) || liveToolCount > 0;
  const privateAccess = /token|secret|account|profile|email|payment|customer/i.test(html);
  const stateChange = /delete|update|create|purchase|transfer|send/i.test(html) || liveToolCount > 0;
  const trifecta = [exfil, privateAccess, stateChange].filter(Boolean).length;
  results.push(check("wire.rule_of_two", "Rule-of-Two / lethal-trifecta posture", "runtime_agent_safety", "WIRE_ONLY", 35, trifecta <= 2 ? "pass" : "fail", trifecta <= 2 ? 100 : 0, [`Detected ${trifecta} of 3 risk classes (untrusted/exfil, sensitive access, state change). HTML keyword detection is heuristic until tool-schema analysis is implemented.`], { wire_value: { exfil, privateAccess, stateChange }, metadata: { confidence: "heuristic", status: "partial", labels: ["html-keywords"] } }));
  results.push(check("wire.manifest_pinning", "signed/pinned MCP manifests", "runtime_agent_safety", "WIRE_ONLY", 20, parsedServerCard?.signature || parsedServerCard?.integrity ? "pass" : liveToolCount ? "fail" : "unknown", parsedServerCard?.signature || parsedServerCard?.integrity ? 100 : 0, [parsedServerCard?.signature || parsedServerCard?.integrity ? "Server Card includes signature/integrity evidence." : liveToolCount ? "Live tools found without signature/integrity evidence." : "No live MCP tools found to assess."]));
  const hiddenInjection = /display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|ignore previous|system prompt|developer message/i.test(html);
  results.push(check("wire.indirect_injection_surface", "indirect prompt-injection surface", "runtime_agent_safety", "WIRE_ONLY", 25, hiddenInjection ? "fail" : "pass", hiddenInjection ? 0 : 100, [hiddenInjection ? "Hidden text or prompt-like instruction patterns detected." : "No obvious hidden prompt-injection patterns found."]));
  const scopes = parsedServerCard ? JSON.stringify(parsedServerCard).match(/scope|permission/gi)?.length ?? 0 : 0;
  results.push(check("wire.oauth_scope_tightness", "OAuth scope tightness", "runtime_agent_safety", "WIRE_ONLY", 20, scopes > 0 ? "partial" : liveToolCount ? "fail" : "unknown", scopes > 0 ? 60 : 0, [scopes > 0 ? "Scope/permission language found; manual review still needed." : liveToolCount ? "Live tools found without evident scope language." : "No live tools found to assess."]));

  return results;
}

function normalizeUrl(input: string) {
  return /^https?:\/\//i.test(input) ? input : `https://${input}`;
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<Fetched | undefined> {
  try {
    const res = await fetch(url, { headers, redirect: "follow" });
    if (!res.ok) return undefined;
    return { url, status: res.status, headers: res.headers, text: await res.text() };
  } catch {
    return undefined;
  }
}

async function firstFetch(urls: string[]) {
  for (const url of urls) {
    const res = await fetchText(url);
    if (res) return res;
  }
  return undefined;
}

function visibleText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canParseJson(text: string) {
  return Boolean(safeJson(text));
}

function safeJson(text: string): any | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseLlmsTxt(text: string) {
  const trimmed = text.trim();
  const hasHeading = /^#\s+\S+/m.test(trimmed);
  const hasLinks = /\[[^\]]+\]\([^)]+\)/.test(trimmed) || /^https?:\/\//m.test(trimmed);
  const valid = trimmed.length > 0 && (hasHeading || hasLinks);
  return {
    valid,
    has_heading: hasHeading,
    has_links: hasLinks,
    note: valid ? "basic structure is parseable." : "basic title/link structure was not detected.",
  };
}

function detectContentSignals(page: Fetched | undefined, robots: Fetched | undefined) {
  const signals = new Set<string>();
  const xRobots = page?.headers.get("x-robots-tag");
  if (xRobots) signals.add(`x-robots-tag=${xRobots}`);
  const permissionsPolicy = page?.headers.get("permissions-policy");
  if (permissionsPolicy && /interest-cohort|browsing-topics/i.test(permissionsPolicy)) signals.add("permissions-policy");
  if (robots && /Content-Signal|ai-policy|tdm-reservation|noai/i.test(robots.text)) signals.add("robots-policy-marker");
  return [...signals].sort();
}

function extractToolNames(parsed: any): string[] {
  if (!Array.isArray(parsed?.tools)) return [];
  const names: string[] = [];
  for (const tool of parsed.tools) {
    const name = typeof tool === "string" ? tool : tool?.name;
    if (typeof name === "string" && name.trim().length > 0) names.push(name.trim());
  }
  return [...new Set(names)].sort();
}
