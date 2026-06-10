# Web (Astro) Surface

## Setup
Use the Astro CLI for initial scaffolding, then layer the substrate:

```bash
pnpm create astro <project-name>
cd <project-name>
```

Then install substrate deps and write substrate config files on top.

## Extra deps
```bash
pnpm add zod
```

## Notes
- Astro has its own build system — do NOT override with tsup
- Substrate configs (biome, lefthook, commitlint, knip) layer cleanly on top
- Astro integrations (React, Solid, Svelte) added via `pnpm astro add`
