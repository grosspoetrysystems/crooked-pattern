# Agent Surface

## Extra deps
```bash
pnpm add ai @ai-sdk/openai @modelcontextprotocol/sdk zod
```

## tsup.config.ts
```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: true,
});
```

## package.json additions
```json
{
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts"
}
```

## Directory structure
```
src/
  index.ts
  agent.ts
  tools/
```

## Entry file: src/index.ts
```typescript
export { createAgent } from "./agent.js";
```

## Starter: src/agent.ts
```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function createAgent() {
  const result = await generateText({
    model: openai("gpt-4o-mini"),
    prompt: "ready",
  });
  return result.text;
}
```

## Notes
- Vercel AI SDK provides the unified LLM interface
- MCP SDK for tool/resource server integration
- Zod for structured I/O validation
- Add `@ai-sdk/anthropic`, `@ai-sdk/google` etc. as needed for multi-provider
