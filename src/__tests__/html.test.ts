import { describe, expect, it } from 'vitest';
import {
  attrValue,
  hasAttr,
  jsonLdScriptCount,
  parseHtmlEvidence,
  parsedJsonLdBlocks,
  tagsNamed,
} from '../html.js';

describe('HTML evidence parser', () => {
  it('extracts tags, attributes, visible text, anchors, and JSON-LD blocks', () => {
    const parsed = parseHtmlEvidence(`
      <html>
        <head>
          <link rel="canonical" href="https://example.com">
          <meta property="og:title" content="Example">
          <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"Person","name":"Ada"}
          </script>
          <script>window.secret = "hidden";</script>
        </head>
        <body>
          <main><h1>Example</h1><a href="https://doi.org/10.1">Paper</a></main>
          <img src="/hero.png" alt="Hero">
          <input aria-label="Search">
        </body>
      </html>
    `);

    expect(parsed.visibleText).toContain('Example Paper');
    expect(parsed.visibleText).not.toContain('window.secret');
    expect(tagsNamed(parsed, 'h1')).toHaveLength(1);
    expect(jsonLdScriptCount(parsed)).toBe(1);
    expect(parsedJsonLdBlocks(parsed)).toHaveLength(1);
    expect(parsed.anchors).toEqual([
      { attrs: { href: 'https://doi.org/10.1' }, text: 'Paper' },
    ]);
    expect(
      parsed.tags.some(
        (tag) =>
          tag.name === 'meta' && attrValue(tag.attrs, 'property') === 'og:title'
      )
    ).toBe(true);
    expect(hasAttr(tagsNamed(parsed, 'img')[0]?.attrs ?? {}, 'alt')).toBe(true);
  });

  it('preserves malformed JSON-LD as a parsed script with no JSON value', () => {
    const parsed = parseHtmlEvidence(
      '<script type="application/ld+json">{"@type":</script>'
    );

    expect(jsonLdScriptCount(parsed)).toBe(1);
    expect(parsedJsonLdBlocks(parsed)).toEqual([]);
  });
});
