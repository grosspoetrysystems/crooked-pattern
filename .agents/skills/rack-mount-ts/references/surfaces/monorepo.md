# Monorepo Surface

## Extra deps
```bash
pnpm add -D turbo
```

## pnpm-workspace.yaml
```yaml
packages:
  - "packages/*"
```

## turbo.json
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "typecheck": {},
    "test": {},
    "lint": {},
    "gate": {
      "dependsOn": ["typecheck", "lint", "test", "build"]
    }
  }
}
```

## Directory structure
```
packages/
pnpm-workspace.yaml
turbo.json
package.json
tsconfig.json (base, extended by packages)
biome.jsonc
lefthook.yml
commitlint.config.js
```

## tsconfig.json (base)
Use `references` for package-level type checking:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "composite": true
  }
}
```

Each package extends this and sets its own `rootDir`, `outDir`.

## Scripts (root)
```json
{
  "scripts": {
    "build": "turbo build",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "lint": "ultracite check",
    "gate": "turbo gate"
  }
}
```

## Notes
- Do NOT install surface deps at root — each package gets its own
- Use `rack-mount` again inside each package to set up its surface
- Lefthook and commitlint live at root only
- Biome config at root, packages inherit
