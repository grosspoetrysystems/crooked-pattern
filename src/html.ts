interface ParsedHtml {
  anchors: ParsedElement[];
  scripts: ParsedScript[];
  tags: ParsedTag[];
  visibleText: string;
}

interface ParsedElement {
  attrs: HtmlAttributes;
  text: string;
}

interface ParsedScript {
  attrs: HtmlAttributes;
  text: string;
}

interface ParsedTag {
  attrs: HtmlAttributes;
  name: string;
}

type HtmlAttributes = Record<string, string | true>;

const rawTextTags = new Set(['script', 'style']);

export function parseHtmlEvidence(html: string): ParsedHtml {
  const tags: ParsedTag[] = [];
  const scripts: ParsedScript[] = [];
  const anchors: ParsedElement[] = [];
  const visibleText: string[] = [];
  let hiddenTextDepth = 0;
  let index = 0;

  while (index < html.length) {
    const nextTag = html.indexOf('<', index);
    if (nextTag === -1) {
      if (hiddenTextDepth === 0) visibleText.push(html.slice(index));
      break;
    }

    if (nextTag > index && hiddenTextDepth === 0)
      visibleText.push(html.slice(index, nextTag));

    const tagEnd = findTagEnd(html, nextTag + 1);
    if (tagEnd === -1) {
      if (hiddenTextDepth === 0) visibleText.push(html.slice(nextTag));
      break;
    }

    const rawTag = html.slice(nextTag + 1, tagEnd);
    const parsed = parseTag(rawTag);
    if (!parsed) {
      index = tagEnd + 1;
      continue;
    }

    if (parsed.closing) {
      if (rawTextTags.has(parsed.name) && hiddenTextDepth > 0)
        hiddenTextDepth -= 1;
      index = tagEnd + 1;
      continue;
    }

    const tag = { name: parsed.name, attrs: parsed.attrs };
    tags.push(tag);

    if (parsed.name === 'script') {
      const closeStart = findClosingTag(html, 'script', tagEnd + 1);
      const scriptEnd = closeStart ?? tagEnd + 1;
      scripts.push({
        attrs: parsed.attrs,
        text: html.slice(tagEnd + 1, scriptEnd).trim(),
      });
      if (closeStart !== undefined) {
        const closeEnd = findTagEnd(html, closeStart + 1);
        index = closeEnd === -1 ? scriptEnd : closeEnd + 1;
        continue;
      }
    }

    if (parsed.name === 'a') {
      const closeStart = findClosingTag(html, 'a', tagEnd + 1);
      if (closeStart !== undefined)
        anchors.push({
          attrs: parsed.attrs,
          text: extractText(html.slice(tagEnd + 1, closeStart)),
        });
    }

    if (rawTextTags.has(parsed.name) && !parsed.selfClosing)
      hiddenTextDepth += 1;
    index = tagEnd + 1;
  }

  return {
    anchors,
    scripts,
    tags,
    visibleText: normalizeText(visibleText.join(' ')),
  };
}

export function attrValue(
  attrs: HtmlAttributes,
  name: string
): string | undefined {
  const value = attrs[name.toLowerCase()];
  return typeof value === 'string' ? value : undefined;
}

export function hasAttr(attrs: HtmlAttributes, name: string): boolean {
  return attrs[name.toLowerCase()] !== undefined;
}

export function parsedJsonLdBlocks(parsed: ParsedHtml): unknown[] {
  const values: unknown[] = [];
  for (const script of parsed.scripts) {
    if (
      attrValue(script.attrs, 'type')?.toLowerCase() !== 'application/ld+json'
    )
      continue;
    const value = safeJson(script.text);
    if (value !== undefined) values.push(value);
  }
  return values;
}

export function jsonLdScriptCount(parsed: ParsedHtml): number {
  return parsed.scripts.filter(
    (script) =>
      attrValue(script.attrs, 'type')?.toLowerCase() === 'application/ld+json'
  ).length;
}

export function tagsNamed(parsed: ParsedHtml, name: string): ParsedTag[] {
  const normalized = name.toLowerCase();
  return parsed.tags.filter((tag) => tag.name === normalized);
}

function extractText(html: string): string {
  return parseHtmlEvidence(html).visibleText;
}

function findClosingTag(html: string, tagName: string, from: number) {
  const lowerHtml = html.toLowerCase();
  const needle = `</${tagName.toLowerCase()}`;
  const start = lowerHtml.indexOf(needle, from);
  return start === -1 ? undefined : start;
}

function findTagEnd(html: string, from: number) {
  let quote: string | undefined;
  for (let index = from; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return index;
  }
  return -1;
}

function parseTag(rawTag: string) {
  const trimmed = rawTag.trim();
  if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('?'))
    return undefined;

  const closing = trimmed.startsWith('/');
  let index = closing ? 1 : 0;
  while (index < trimmed.length && /\s/.test(trimmed[index])) index += 1;

  const nameStart = index;
  while (index < trimmed.length && isNameChar(trimmed[index])) index += 1;
  const name = trimmed.slice(nameStart, index).toLowerCase();
  if (!name) return undefined;

  return {
    attrs: closing ? {} : parseAttributes(trimmed, index),
    closing,
    name,
    selfClosing: /\/\s*$/.test(trimmed),
  };
}

function parseAttributes(rawTag: string, from: number): HtmlAttributes {
  const attrs: HtmlAttributes = {};
  let index = from;

  while (index < rawTag.length) {
    while (index < rawTag.length && /[\s/]/.test(rawTag[index])) index += 1;
    if (index >= rawTag.length) break;

    const nameStart = index;
    while (index < rawTag.length && isNameChar(rawTag[index])) index += 1;
    const name = rawTag.slice(nameStart, index).toLowerCase();
    if (!name) break;

    while (index < rawTag.length && /\s/.test(rawTag[index])) index += 1;
    if (rawTag[index] !== '=') {
      attrs[name] = true;
      continue;
    }

    index += 1;
    while (index < rawTag.length && /\s/.test(rawTag[index])) index += 1;
    const quote =
      rawTag[index] === '"' || rawTag[index] === "'"
        ? rawTag[index]
        : undefined;
    if (quote) index += 1;
    const valueStart = index;
    if (quote) {
      while (index < rawTag.length && rawTag[index] !== quote) index += 1;
    } else {
      while (index < rawTag.length && !/[\s/>]/.test(rawTag[index])) index += 1;
    }

    attrs[name] = decodeHtmlAttribute(rawTag.slice(valueStart, index));
    if (quote && rawTag[index] === quote) index += 1;
  }

  return attrs;
}

function normalizeText(text: string) {
  return text
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlAttribute(value: string) {
  return normalizeText(value);
}

function isNameChar(char: string | undefined) {
  return Boolean(char && /[A-Za-z0-9:_-]/.test(char));
}

function safeJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
