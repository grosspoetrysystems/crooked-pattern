# Library Surface

## Extra deps
None beyond substrate.

## tsup.config.ts
```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
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
  "types": "dist/index.d.ts",
  "files": ["dist"]
}
```

## Entry file: src/index.ts
```typescript
export {};
```
