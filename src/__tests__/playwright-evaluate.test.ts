import { describe, expect, it } from 'vitest';
import {
  readInteractiveElements,
  readPageMetrics,
} from '../adapters/playwright.js';

// page.evaluate serializes only the passed function's source into the browser
// context; any reference to a module-scope helper becomes a ReferenceError at
// runtime on every rendered scan. These guards catch that bug class statically.
const BROWSER_GLOBALS = new Set([
  'document',
  'performance',
  'PerformanceObserver',
  'PerformanceEntry',
  'CSS',
  'HTMLElement',
  'HTMLAnchorElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'Math',
  'Array',
  'Object',
  'undefined',
]);

function freeIdentifierCandidates(source: string): string[] {
  // Identifiers used in call/member-root position that are not declared
  // inside the function body and are not known browser globals.
  const declared = new Set(
    [...source.matchAll(/\b(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)]
      .map((match) => match[1])
      .concat(
        [...source.matchAll(/\(([^)]*)\)\s*(?:=>|\{)/g)].flatMap((match) =>
          match[1]
            .split(',')
            .map((parameter) => parameter.trim().split(/[:=\s]/)[0])
            .filter(Boolean)
        )
      )
  );
  const used = [...source.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]{2,})\s*\(/g)]
    .map((match) => match[1])
    .filter(
      (name) =>
        !BROWSER_GLOBALS.has(name) &&
        !declared.has(name) &&
        !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(name)
    );
  return [...new Set(used)];
}

describe('page.evaluate function self-containment', () => {
  it('readInteractiveElements references no module-scope helpers', () => {
    expect(
      freeIdentifierCandidates(readInteractiveElements.toString())
    ).toEqual([]);
  });

  it('readPageMetrics references no module-scope helpers', () => {
    expect(freeIdentifierCandidates(readPageMetrics.toString())).toEqual([]);
  });

  it('readPageMetrics never fabricates a zero CLS without observer support', () => {
    const source = readPageMetrics.toString();
    expect(source).toContain('PerformanceObserver');
    expect(source).not.toMatch(/getEntriesByType\(\s*['"]layout-shift['"]/);
  });
});
