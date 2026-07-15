import { type Server, createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RenderedDomSnapshot } from '../adapters/playwright.js';
import { runWirePass } from '../wire.js';

describe('rendered wire evidence', () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html><body><p>static fixture</p></body></html>');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Could not bind fixture server.');
    url = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('uses optional rendered adapter snapshots for text, accessibility, labels, and layout metrics', async () => {
    const seenUrls: string[] = [];
    const checks = await runWirePass(url, {
      adapter: {
        snapshot(snapshotUrl) {
          seenUrls.push(snapshotUrl);
          return renderedSnapshot(snapshotUrl);
        },
      },
    });

    expect(seenUrls).toEqual([url]);
    expect(findCheck(checks, 'wire.initial_html_content')).toMatchObject({
      result: 'pass',
      metadata: { confidence: 'high', labels: ['rendered-dom'] },
    });
    expect(findCheck(checks, 'wire.labeled_fields')).toMatchObject({
      result: 'pass',
      metadata: {
        confidence: 'high',
        labels: ['rendered-dom', 'accessible-name'],
      },
    });
    expect(findCheck(checks, 'wire.accessibility_probe')).toMatchObject({
      result: 'pass',
      wire_value: { violations: 0, incomplete: 1, passes: 12 },
    });
    expect(findCheck(checks, 'wire.cls_probe')).toMatchObject({
      result: 'pass',
      wire_value: { cumulative_layout_shift: 0.07 },
    });
  });

  it('keeps browser-only checks unknown when rendered evidence is absent', async () => {
    const checks = await runWirePass(url);

    expect(findCheck(checks, 'wire.accessibility_probe')).toMatchObject({
      result: 'unknown',
      metadata: { status: 'adapter_missing', labels: ['adapter-missing'] },
    });
    expect(findCheck(checks, 'wire.cls_probe')).toMatchObject({
      result: 'unknown',
      metadata: { status: 'adapter_missing', labels: ['adapter-missing'] },
    });
  });
});

function renderedSnapshot(url: string): RenderedDomSnapshot {
  return {
    url,
    title: 'Rendered Fixture',
    html: '<main><form><input aria-label="Search"></form></main>',
    text: `${'Rendered product content. '.repeat(40)}Search`,
    interactive: [
      {
        tagName: 'input',
        name: 'Search',
        selector: 'input',
        type: 'search',
      },
    ],
    accessibility: {
      violations: 0,
      incomplete: 1,
      passes: 12,
    },
    metrics: {
      cumulativeLayoutShift: 0.07,
      scriptCount: 2,
      transferBytes: 4096,
    },
  };
}

function findCheck(
  checks: Awaited<ReturnType<typeof runWirePass>>,
  id: string
) {
  return checks.find((check) => check.id === id);
}
