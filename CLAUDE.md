# CLAUDE.md

## Project

Adobe API Mesh encryption framework — wraps upstream GraphQL operations behind AES-CBC encrypted envelopes.

## Build

```bash
npm run build:mesh     # Build mesh/mesh.json from template + secrets
npm run start:mesh     # Run mesh locally
npm test               # Run tests
```

## Key files

- `mesh/mesh.json` — Mesh config template with `{{PLACEHOLDER}}` syntax
- `mesh/prod-secrets.yaml` / `mesh/stage-secrets.yaml` — Per-environment secrets (YAML `key: value`)
- `src/config/encryption-registry.js` — Registry of encrypted wrapper operations
- `src/hooks/before-all.js` — Request validation hook (self-contained, no imports)
- `src/resolvers/encrypted-operations.js` — Encrypted resolver (self-contained, no imports)
- `scripts/build-mesh.js` — Build script that interpolates {{PLACEHOLDER}} tokens
- `scripts/env-loader.js` — Shared secrets.yaml parser

## Constraints

- Embedded files (hook + resolver) must be self-contained — no `require`, `import`, `window`, `eval`, or Node built-ins
- Uses Web Crypto API (`crypto.subtle`) in mesh runtime, Node.js `webcrypto` in scripts
- Three inline registries must be kept in sync: encryption-registry.js, before-all.js, encrypted-operations.js
- Prefer `globalThis.fetch` over `global.fetch`
- Never access `process.env` or `context.secrets` at mesh runtime
