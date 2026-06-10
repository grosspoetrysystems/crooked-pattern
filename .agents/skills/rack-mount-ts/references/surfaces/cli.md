# CLI Surface

## Extra deps
```bash
pnpm add ink @inkjs/ui commander
pnpm add -D @types/ink
```

## tsup.config.ts
```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/bin/cli.ts" },
  format: "esm",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
});
```

## package.json additions
```json
{
  "type": "module",
  "bin": {
    "<project-name>": "dist/cli.js"
  }
}
```

## Directory structure
```
src/
  bin/
    cli.ts
  commands/
```

## Entry file: src/bin/cli.ts
```typescript
import { program } from "commander";

program
  .name("<project-name>")
  .version("0.1.0")
  .description("<description>")
  .action(() => {
    console.log("ready");
  });

program.parse();
```

## Scripts override
```json
{
  "dev": "tsx src/bin/cli.ts"
}
```
