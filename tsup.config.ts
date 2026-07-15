import { createRequire } from 'node:module';
import { defineConfig } from 'tsup';

const require = createRequire(import.meta.url);
const { version } = require('./package.json') as { version: string };

export default defineConfig({
  entry: { cli: 'src/bin/cli.ts', mcp: 'src/bin/mcp.ts' },
  format: 'esm',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Single source of truth for the version: inject package.json's version at
  // build time so the CLI and MCP server never carry a hand-synced copy.
  define: {
    'process.env.PKG_VERSION': JSON.stringify(version),
  },
  // The CLI source owns the shebang; adding a tsup banner creates an invalid
  // double-shebang dist/cli.js.
});
