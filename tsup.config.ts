import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/bin/cli.ts" },
  format: "esm",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // The CLI source owns the shebang; adding a tsup banner creates an invalid
  // double-shebang dist/cli.js.
});
