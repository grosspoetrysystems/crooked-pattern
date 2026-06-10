export interface RenderedDomSnapshot {
  url: string;
  title?: string;
  html: string;
  text: string;
  interactive: RenderedInteractiveElement[];
  accessibility?: RenderedAccessibilitySummary;
  metrics?: RenderedPageMetrics;
}

interface RenderedInteractiveElement {
  role?: string;
  name?: string;
  selector?: string;
  tagName: string;
  href?: string;
  type?: string;
  disabled?: boolean;
}

interface RenderedAccessibilitySummary {
  violations: number;
  incomplete: number;
  passes: number;
}

interface RenderedPageMetrics {
  cumulativeLayoutShift?: number;
  scriptCount?: number;
  transferBytes?: number;
}

export interface RenderedDomAdapter {
  snapshot(url: string): Promise<RenderedDomSnapshot> | RenderedDomSnapshot;
}

export interface RenderedDomInput {
  snapshot?: RenderedDomSnapshot;
  adapter?: RenderedDomAdapter;
}

interface PlaywrightRenderedDomAdapterOptions {
  browserName?: 'chromium' | 'firefox' | 'webkit';
  timeoutMs?: number;
  waitUntil?: 'domcontentloaded' | 'load' | 'networkidle';
  includeAccessibility?: boolean;
}

export function resolveRenderedDom(
  url: string,
  input: RenderedDomInput = {}
): Promise<RenderedDomSnapshot> | RenderedDomSnapshot | undefined {
  if (input.snapshot) return input.snapshot;
  if (input.adapter) return input.adapter.snapshot(url);
  return undefined;
}

export function createPlaywrightRenderedDomAdapter(
  options: PlaywrightRenderedDomAdapterOptions = {}
): RenderedDomAdapter {
  return {
    snapshot: (url) => renderWithPlaywright(url, options),
  };
}

interface PlaywrightModule {
  chromium?: BrowserType;
  firefox?: BrowserType;
  webkit?: BrowserType;
}

interface BrowserType {
  launch(options: { headless: boolean }): Promise<Browser>;
}

interface Browser {
  newPage(options: {
    viewport: { width: number; height: number };
  }): Promise<Page>;
  close(): Promise<void>;
}

interface Page {
  goto(
    url: string,
    options: {
      waitUntil: NonNullable<PlaywrightRenderedDomAdapterOptions['waitUntil']>;
      timeout: number;
    }
  ): Promise<unknown>;
  title(): Promise<string>;
  content(): Promise<string>;
  evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>;
}

async function renderWithPlaywright(
  url: string,
  options: PlaywrightRenderedDomAdapterOptions
): Promise<RenderedDomSnapshot> {
  const playwright = await optionalImportPlaywright();
  const browserType = playwright[options.browserName ?? 'chromium'];
  if (!browserType)
    throw new Error('Requested Playwright browser is unavailable.');

  const browser = await browserType.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    await page.goto(url, {
      waitUntil: options.waitUntil ?? 'networkidle',
      timeout: options.timeoutMs ?? 15_000,
    });

    const [title, html, text, interactive, metrics, accessibility] =
      await Promise.all([
        page.title(),
        page.content(),
        page.evaluate(() => document.body?.innerText ?? ''),
        page.evaluate(readInteractiveElements),
        page.evaluate(readPageMetrics),
        options.includeAccessibility
          ? page.evaluate(readAccessibilitySummary)
          : Promise.resolve(undefined),
      ]);

    return { url, title, html, text, interactive, metrics, accessibility };
  } finally {
    await browser.close();
  }
}

async function optionalImportPlaywright(): Promise<PlaywrightModule> {
  try {
    const runtimeImport = new Function(
      'specifier',
      'return import(specifier)'
    ) as (specifier: string) => Promise<unknown>;
    return (await runtimeImport('playwright')) as PlaywrightModule;
  } catch (error) {
    throw new Error(
      'Playwright is not installed. Install it and pass createPlaywrightRenderedDomAdapter() explicitly to enable rendered evidence.',
      { cause: error }
    );
  }
}

function readInteractiveElements(): RenderedInteractiveElement[] {
  const selector = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[role]',
    '[tabindex]',
  ].join(',');
  return [...document.querySelectorAll<HTMLElement>(selector)].map(
    (element) => ({
      role: element.getAttribute('role') ?? undefined,
      name:
        element.getAttribute('aria-label') ??
        element.textContent?.replace(/\s+/g, ' ').trim() ??
        undefined,
      selector: cssSelector(element),
      tagName: element.tagName.toLowerCase(),
      href: element instanceof HTMLAnchorElement ? element.href : undefined,
      type: element instanceof HTMLInputElement ? element.type : undefined,
      disabled:
        element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
          ? element.disabled
          : undefined,
    })
  );
}

function readPageMetrics(): RenderedPageMetrics {
  const layoutEntries = performance.getEntriesByType('layout-shift') as Array<
    PerformanceEntry & { hadRecentInput?: boolean; value?: number }
  >;
  const resourceEntries = performance.getEntriesByType('resource') as Array<
    PerformanceEntry & { transferSize?: number }
  >;
  const cumulativeLayoutShift = layoutEntries
    .filter((entry) => !entry.hadRecentInput)
    .reduce((sum, entry) => sum + (entry.value ?? 0), 0);
  return {
    cumulativeLayoutShift,
    scriptCount: document.scripts.length,
    transferBytes: Math.round(
      resourceEntries.reduce((sum, entry) => sum + (entry.transferSize ?? 0), 0)
    ),
  };
}

async function readAccessibilitySummary(): Promise<
  RenderedAccessibilitySummary | undefined
> {
  const axe = (globalThis as { axe?: { run?: () => Promise<AxeResult> } }).axe;
  if (!axe?.run) return undefined;
  const result = await axe.run();
  return {
    violations: result.violations?.length ?? 0,
    incomplete: result.incomplete?.length ?? 0,
    passes: result.passes?.length ?? 0,
  };
}

interface AxeResult {
  violations?: unknown[];
  incomplete?: unknown[];
  passes?: unknown[];
}

function cssSelector(element: HTMLElement) {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const tag = element.tagName.toLowerCase();
  const name = element.getAttribute('name');
  if (name) return `${tag}[name="${CSS.escape(name)}"]`;
  return tag;
}
