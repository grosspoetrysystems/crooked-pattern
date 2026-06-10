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
  snapshot(url: string): Promise<RenderedDomSnapshot>;
}

export interface RenderedDomInput {
  snapshot?: RenderedDomSnapshot;
  adapter?: RenderedDomAdapter;
}

export async function resolveRenderedDom(
  url: string,
  input: RenderedDomInput = {}
): Promise<RenderedDomSnapshot | undefined> {
  if (input.snapshot) return input.snapshot;
  if (input.adapter) return input.adapter.snapshot(url);
  return undefined;
}
