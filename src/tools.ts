interface ToolCatalog {
  tools?: unknown[];
  paths?: Record<string, unknown>;
}

// Shared normalization for authored (source) and live (wire) tool surfaces.
// A JSON document contributes tool names from an explicit `tools` array and/or
// from OpenAPI/Swagger `paths` as `"METHOD /route"`. An RFC 9727 api-catalog
// linkset has neither, so it yields no tools — only real operation lists count.
export function toolsFromJson(text: string): string[] {
  const parsed = safeJson<ToolCatalog>(text);
  const tools = new Set<string>();
  if (Array.isArray(parsed?.tools)) {
    for (const tool of parsed.tools) {
      const name =
        typeof tool === 'string' ? tool : objectStringValue(tool, 'name');
      if (typeof name === 'string' && name.trim()) tools.add(name.trim());
    }
  }
  if (parsed?.paths && typeof parsed.paths === 'object') {
    for (const [route, methods] of Object.entries(parsed.paths)) {
      if (!methods || typeof methods !== 'object') continue;
      for (const method of Object.keys(methods))
        tools.add(`${method.toUpperCase()} ${route}`);
    }
  }
  return [...tools];
}

function objectStringValue(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string' ? record[key] : undefined;
}

function safeJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}
