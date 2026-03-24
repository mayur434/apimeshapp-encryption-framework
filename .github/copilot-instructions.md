# Copilot Instructions

## Project context

This is an Adobe API Mesh encryption framework. It wraps upstream GraphQL and REST (OpenAPI)
operations behind AES-CBC encrypted request/response envelopes.

## Key conventions

- All secrets are in `mesh/prod-secrets.yaml` and `mesh/stage-secrets.yaml` (YAML `key: value` format).
- Handler endpoints in `.env` (KEY=VALUE format) are for the `--env` flag.
- The mesh config is generated at project root `mesh.json` by `scripts/build-mesh.js` with `{{env.X}}` placeholders for handler endpoints.
- Source files (hook + resolver) are read from disk by the AIO CLI — NOT embedded in mesh.json.
- Embedded files (hook + resolver) must be self-contained — no `require`, `import`, `window`, `eval`, or Node built-ins. The API Mesh linter will reject them.
- Crypto uses Web Crypto API (`crypto.subtle`) in the mesh runtime and Node.js `webcrypto` in CLI scripts.
- The encryption envelope format is `Base64( keySize :: iterationCount :: ivHex :: saltHex :: cipherTextBase64 )`.
- Three inline registries (encryption-registry.js, before-all.js, encrypted-operations.js) must be kept in sync manually.
- Registry entries use secret key references (`endpointKey`, `allowedHostsKey`, `bearerTokenKey`) — the resolver looks up actual values from `context.secrets` at runtime.

## Secrets architecture

- **Handler endpoints** → `{{env.X}}` in mesh.json → resolved by AIO CLI from `--env .env`
- **Resolver secrets** → `context.secrets.X` in resolver → populated by AIO CLI from `--secrets` YAML
- **Build step** → No secrets needed. Just generates mesh.json template + type defs.

## Code style

- No external crypto dependencies.
- Prefer `globalThis.fetch` over `global.fetch`.
- Use `{{env.X}}` for handler endpoint placeholders in mesh.json.
- Use `context.secrets.X` for runtime secrets in the resolver.
- Never access `process.env` at mesh runtime.
