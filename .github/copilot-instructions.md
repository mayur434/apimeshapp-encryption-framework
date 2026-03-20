# Copilot Instructions

## Project context

This is an Adobe API Mesh encryption framework. It wraps upstream GraphQL operations
behind AES-CBC encrypted request/response envelopes.

## Key conventions

- All secrets are in `mesh/prod-secrets.yaml` and `mesh/stage-secrets.yaml` (YAML `key: value` format).
- The mesh config template lives at `mesh/mesh.json` with `{{PLACEHOLDER}}` syntax for build-time interpolation.
- Embedded files (hook + resolver) must be self-contained — no `require`, `import`, `window`, `eval`, or Node built-ins. The API Mesh linter will reject them.
- Crypto uses Web Crypto API (`crypto.subtle`) in the mesh runtime and Node.js `webcrypto` in CLI scripts.
- The encryption envelope format is `Base64( keySize :: iterationCount :: ivHex :: saltHex :: cipherTextBase64 )`.
- Three inline registries (encryption-registry.js, before-all.js, encrypted-operations.js) must be kept in sync manually.

## Code style

- No external crypto dependencies.
- Prefer `globalThis.fetch` over `global.fetch`.
- Use `{{PLACEHOLDER}}` for build-time secrets injection — never access `process.env` or `context.secrets` at mesh runtime.
