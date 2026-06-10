# Web (TanStack Start) Surface

## Setup
Use the TanStack Start CLI for initial scaffolding, then layer the substrate:

```bash
pnpm create @tanstack/start <project-name>
cd <project-name>
```

Then install substrate deps and write substrate config files on top.

## Extra deps
```bash
pnpm add zod
```

## Notes
- TanStack Start has its own build system — do NOT override with tsup
- Keep `tsup.config.ts` only if there's a separate library/CLI entry alongside the app
- `vitest.config.ts` thresholds may need adjustment for app code vs library code
- Substrate configs (biome, lefthook, commitlint, knip) layer cleanly on top
