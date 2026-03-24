# Adobe API Mesh — Encrypted Operations Framework

Zero-dependency, source-agnostic encryption layer for Adobe API Mesh. Wraps upstream **GraphQL** and **REST (OpenAPI)** operations behind AES-CBC encrypted request/response envelopes — protecting sensitive data in transit between the client and the mesh.

## Overview

- Wraps sensitive mutations/queries behind encrypted wrapper fields.
- Supports **two source types**: GraphQL (e.g. Adobe Commerce) and REST/OpenAPI (e.g. Salesforce).
- Client sends the payload inside an encrypted (or plain) envelope — the mesh decrypts, forwards to upstream, and re-encrypts the response.
- `beforeAll` hook validates envelope structure before the resolver runs.
- Resolver routes to the correct upstream based on `mode` in the registry: `graphql` (default) or `rest-json`.
- Source-agnostic — any GraphQL or REST endpoint can be added by editing the registry + secrets.
- Zero external crypto dependencies — uses Web Crypto API (mesh runtime) and Node.js `webcrypto` (CLI scripts).

## Architecture

```
Client
  │
  ▼
┌──────────────────────────────────────────────────┐
│  Adobe API Mesh (Cloudflare Workers)             │
│                                                  │
│  beforeAll hook (before-all.js)                  │
│    ├─ Detect wrapper field from GraphQL query     │
│    ├─ Validate envelope format (structural only)  │
│    └─ Enforce requestMode policy                  │
│                                                  │
│  Resolver (encrypted-operations.js)              │
│    ├─ Decrypt payload (if encrypted=true)         │
│    ├─ Route by source mode:                       │
│    │   ├─ graphql → query + variables to upstream │
│    │   └─ rest-json → JSON body to REST endpoint  │
│    ├─ Encrypt response (per responseEncryption)   │
│    └─ Return EncryptedOperationResult             │
└──────────────────────────────────────────────────┘
  │                          │
  ▼                          ▼
GraphQL Source           REST/OpenAPI Source
(Commerce, OMS)          (Salesforce, etc.)
```

## Secrets Architecture

Secrets are managed via two AIO CLI mechanisms — no build-time interpolation needed:

| Mechanism | Flag | Purpose | Example |
|-----------|------|---------|---------|
| `--env .env` | `{{env.X}}` in mesh.json | Handler endpoints (need real URLs for schema introspection) | `{{env.COMMERCE_GRAPHQL_ENDPOINT}}` |
| `--secrets secrets.yaml` | `context.secrets` in resolver | Runtime secrets (passphrase, tokens, endpoints, host allowlists) | `context.secrets.MESH_AES_PASSPHRASE` |

The `.env` file contains handler endpoint URLs and bearer tokens. The secrets YAML contains all 6 runtime secrets for the resolver.

## Encryption Algorithm

| Parameter       | Value                |
|-----------------|----------------------|
| Algorithm       | AES-CBC              |
| Key size        | 128-bit              |
| Key derivation  | PBKDF2 with SHA-256  |
| Iterations      | 10,000               |
| IV              | Random 16 bytes      |
| Salt            | Random 16 bytes      |

### Envelope format

```
Base64( keySize :: iterationCount :: ivHex :: saltHex :: cipherTextBase64 )
```

Example decoded:

```
128::10000::447090cf3a3ac7a983dce3bc296ba1b3::31b12db2887dc9dcf22bcc7d8d47604f::YGb1OxIrgRViVzrdudQyln...
```

## Current Operations

| Wrapper Field | Source Type | Upstream |
|---------------|-----------|----------|
| `encryptedCreateCustomer` | GraphQL | Adobe Commerce |
| `encryptedGenerateCustomerToken` | GraphQL | Adobe Commerce |
| `encryptedCreateLead` | REST (OpenAPI) | Salesforce |

## Project Structure

```
├── mesh.json                       ← Built artifact at project root (generated, DO NOT edit)
├── .env                            ← Handler endpoints for --env flag (git-ignored)
│
├── mesh/
│   ├── sfdc-openapi.json           ← OpenAPI schema for Salesforce REST
│   ├── prod-secrets.yaml           ← Production secrets (git-ignored)
│   └── stage-secrets.yaml          ← Staging secrets (git-ignored)
│
├── src/
│   ├── config/
│   │   ├── encryption-registry.js  ← Single source of truth for operations
│   │   └── type-defs.js            ← Auto-generates GraphQL schema from registry
│   ├── hooks/
│   │   └── before-all.js           ← Request validation hook (self-contained)
│   └── resolvers/
│       └── encrypted-operations.js ← Main resolver (self-contained)
│
├── scripts/
│   ├── build-mesh.js               ← Build orchestrator (generates mesh.json)
│   ├── env-loader.js               ← Secrets YAML parser
│   ├── crypto-envelope.js          ← AES-CBC encryption library (Node.js webcrypto)
│   ├── encrypt-payload.js          ← CLI: encrypt GraphQL payloads
│   ├── encrypt-rest-payload.js     ← CLI: encrypt REST payloads
│   ├── encrypt-value.js            ← CLI: encrypt a raw string
│   ├── decrypt-value.js            ← CLI: decrypt an envelope
│   ├── decrypt-response.js         ← CLI: decrypt a response payload
│   ├── validate-mesh.js            ← Config validator
│   ├── validate-workflows.js       ← GitHub Actions validator
│   └── test-roundtrip.js           ← E2E roundtrip test
│
├── __tests__/
│   └── mesh-config.test.js         ← Mesh config validation tests
│
├── DEV-GUIDE.md                    ← Developer guide for adding operations
├── TESTING.md                      ← Sample requests for all operations
├── CLAUDE.md                       ← AI assistant context
└── README.md                       ← This file
```

## Quick Start

### 1. Configure Secrets

Create `mesh/stage-secrets.yaml` (and `mesh/prod-secrets.yaml` for production):

```yaml
MESH_AES_PASSPHRASE: your-strong-passphrase
COMMERCE_GRAPHQL_ENDPOINT: https://your-commerce-instance.cloud/graphql
ALLOWED_COMMERCE_HOSTS: your-commerce-instance.cloud
SF_BEARER_TOKEN: your-salesforce-token
SFDC_ENDPOINT: https://your-instance.salesforce-sites.com/path/to/api
ALLOWED_SFDC_HOSTS: your-instance.salesforce-sites.com
```

Create `.env` at project root (handler endpoints for schema introspection):

```env
COMMERCE_GRAPHQL_ENDPOINT=https://your-commerce-instance.cloud/graphql
SF_BEARER_TOKEN=your-salesforce-token
```

### 2. Build

```bash
npm run build:mesh
```

Generates `mesh.json` at the project root with `{{env.X}}` placeholders for handler endpoints and auto-generated GraphQL type definitions. No secrets are embedded.

### 3. Validate

```bash
npm run validate
```

### 4. Run Locally

```bash
npm run start:mesh -- --port 5001
```

This runs: `aio api-mesh run mesh.json --env .env --secrets mesh/stage-secrets.yaml`

> Port 5000 is reserved on macOS (AirPlay). Use 5001 or higher.

### 5. Deploy

```bash
aio api-mesh update mesh.json --env .env --secrets mesh/prod-secrets.yaml
```

## npm Scripts

| Script | Description |
|--------|-----------|
| `npm run build:mesh` | Generate `mesh.json` from template + type defs |
| `npm run start:mesh -- --port 5001` | Run mesh locally with `--env` and `--secrets` |
| `npm run validate` | Validate mesh config and secrets files |
| `npm run validate:workflows` | Validate GitHub Actions workflow files |
| `npm run encrypt:payload -- '<query>' '<vars>'` | Encrypt a GraphQL payload (for GraphQL sources) |
| `npm run encrypt:rest-payload -- '<json>'` | Encrypt a REST body (for OpenAPI sources) |
| `npm run encrypt -- "<text>"` | Encrypt a raw string |
| `npm run decrypt -- "<envelope>"` | Decrypt an envelope |
| `npm run decrypt:response -- "<envelope>"` | Decrypt a mesh response |
| `npm test` | Run unit tests |

## Usage Examples

### GraphQL Source — Commerce Token

```bash
# 1. Encrypt
npm run encrypt:payload -- \
  'mutation { generateCustomerToken(email: "user@example.com", password: "Pass123") { token } }'

# 2. Call the mesh (paste encrypted output as payload)
curl -s http://localhost:5001/graphql \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "mutation($input: EncryptedOperationInput!) { encryptedGenerateCustomerToken(input: $input) { encrypted operationName payload } }",
    "variables": { "input": { "encrypted": true, "payload": "<ENCRYPTED>" } }
  }'

# 3. Decrypt the response
npm run decrypt -- "<RESPONSE_PAYLOAD>"
```

### REST (OpenAPI) Source — Salesforce Lead

```bash
# 1. Encrypt
npm run encrypt:rest-payload -- \
  '{"Leads":[{"name":"John","mobile":"9876543210","pincode":"400001","LeadSource":"Website","IsCallable":true}]}'

# 2. Call the mesh
curl -s http://localhost:5001/graphql \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "mutation($input: EncryptedOperationInput!) { encryptedCreateLead(input: $input) { encrypted operationName payload } }",
    "variables": { "input": { "encrypted": true, "payload": "<ENCRYPTED>" } }
  }'

# 3. Decrypt the response
npm run decrypt -- "<RESPONSE_PAYLOAD>"
```

> See [TESTING.md](TESTING.md) for complete sample requests and one-liner commands.

## Adding a New Operation

### GraphQL Source

1. Add secrets to `mesh/stage-secrets.yaml` and `mesh/prod-secrets.yaml`
2. Add entry to `src/config/encryption-registry.js` (with `endpointKey` / `allowedHostsKey` referencing secret names)
3. Sync inline registry in `src/resolvers/encrypted-operations.js` (same key references)
4. Sync inline registry in `src/hooks/before-all.js` (minimal fields only)
5. Add new secret names to `REQUIRED_SECRETS` in `scripts/validate-mesh.js`
6. Add endpoint to `.env` if it's a new handler source
7. `npm run build:mesh`

### REST (OpenAPI) Source

Same as above, plus:
- Create an OpenAPI schema file in `mesh/` (use `"type": "string"` for all schemas — see Constraints below)
- Add the handler source to `getMeshTemplate()` in `scripts/build-mesh.js`
- Set `mode: 'rest-json'` and `bearerTokenKey` in the registry entries

> See [DEV-GUIDE.md](DEV-GUIDE.md) for detailed step-by-step walkthroughs with code examples.

## How the Build Works

```
encryption-registry.js ──► type-defs.js
                                │
                                ▼
                          additionalTypeDefs
                                │
build-mesh.js ──────────────────┘
  │
  ├── Generates mesh template with {{env.X}} handler placeholders
  ├── Builds GraphQL type definitions from registry
  └── Writes mesh.json (ready to run/deploy with --env and --secrets)
```

Handler endpoints use `{{env.X}}` — resolved by AIO CLI from `.env` at run/deploy time.
Resolver secrets use `context.secrets` — populated by AIO CLI from `--secrets` YAML at run/deploy time.
No secrets are baked in at build time.

## Required Secrets

Defined in `mesh/prod-secrets.yaml` and `mesh/stage-secrets.yaml`:

| Variable | Description |
|----------|-----------|
| `MESH_AES_PASSPHRASE` | Passphrase for AES-CBC key derivation (PBKDF2) |
| `COMMERCE_GRAPHQL_ENDPOINT` | Adobe Commerce GraphQL endpoint URL |
| `ALLOWED_COMMERCE_HOSTS` | Comma-separated allowed Commerce hostnames (SSRF guard) |
| `SF_BEARER_TOKEN` | Salesforce OAuth Bearer token |
| `SFDC_ENDPOINT` | Salesforce REST API endpoint URL |
| `ALLOWED_SFDC_HOSTS` | Comma-separated allowed Salesforce hostnames (SSRF guard) |

Also defined in `.env` (for handler endpoint interpolation):

| Variable | Description |
|----------|-----------|
| `COMMERCE_GRAPHQL_ENDPOINT` | Adobe Commerce GraphQL endpoint URL |
| `SF_BEARER_TOKEN` | Salesforce OAuth Bearer token |

## Three Registries — Keep in Sync

| File | Purpose | Required Fields |
|------|---------|-----------------|
| `src/config/encryption-registry.js` | Build-time source of truth | All fields (with `endpointKey` / `allowedHostsKey` key references) |
| `src/resolvers/encrypted-operations.js` | Runtime resolver | All fields (same key references, reads `context.secrets` at runtime) |
| `src/hooks/before-all.js` | Request validation | `wrapperField`, `requestMode`, `responseEncryption` |

> `src/config/type-defs.js` reads from `encryption-registry.js` automatically — no manual sync needed.

## Constraints

- **Self-contained files** — Hook and resolver must not use `require`, `import`, `window`, `eval`, or Node built-ins. API Mesh linter will reject them.
- **Web Crypto only** — Use `crypto.subtle` at mesh runtime. Node.js `webcrypto` in CLI scripts.
- **Secrets via `context.secrets`** — Resolver reads all runtime secrets from `context.secrets`, populated by `--secrets` flag. Handler endpoints use `{{env.X}}`, resolved by `--env` flag.
- **OpenAPI schemas must be minimal** — Use `"type": "string"` for all request/response schemas. Complex types (`object`, `array`, `$ref`, `integer`, `minItems`, `components`) cause Ajv `new Function()` compilation errors on Cloudflare Workers edge runtime.
- **`globalThis.fetch`** — Prefer over `global.fetch`.

## Production Logging

The resolver emits structured, production-safe logs. No sensitive data is logged.

```
[encrypted-ops] resolve_start field=encryptedCreateLead
[encrypted-ops] request_decrypt encrypted=true payload_size=312 duration=15ms
[encrypted-ops] rest_body_extracted keys=Leads
[encrypted-ops] upstream_rest_call status=200 ok=true duration=850ms
[encrypted-ops] response_encrypt encrypted=true payload_size=48 duration=8ms
[encrypted-ops] resolve_end field=encryptedCreateLead upstream_status=200 response_encrypted=true total_duration=880ms
```

## CI/CD

GitHub Actions workflows handle deployment automatically:

| Workflow | Trigger | Environment |
|----------|---------|-------------|
| `deploy-production.yml` | Push to `main` | Production |
| `deploy-stage.yml` | Push to `stage` / `develop` | Staging |
| `pr-checks.yml` | Pull request | Validation only |

Each deploy workflow: validates source files → runs tests → builds mesh.json → creates `.env` and secrets YAML from GitHub Secrets → deploys with `aio api-mesh update mesh.json --env .env --secrets <secrets-file>`.

### Required GitHub Secrets

**Production:** `AIO_ACCESS_TOKEN`, `AIO_RUNTIME_AUTH`, `AIO_RUNTIME_NAMESPACE`, `MESH_AES_PASSPHRASE`, `COMMERCE_GRAPHQL_ENDPOINT`, `ALLOWED_COMMERCE_HOSTS`, `SF_BEARER_TOKEN`, `SFDC_ENDPOINT`, `ALLOWED_SFDC_HOSTS`

**Staging (suffix `_STAGE`):** `AIO_ACCESS_TOKEN_STAGE`, `AIO_RUNTIME_AUTH_STAGE`, `AIO_RUNTIME_NAMESPACE_STAGE`, `MESH_AES_PASSPHRASE_STAGE`, `COMMERCE_GRAPHQL_ENDPOINT_STAGE`, `ALLOWED_COMMERCE_HOSTS_STAGE`, `SF_BEARER_TOKEN_STAGE`, `SFDC_ENDPOINT_STAGE`, `ALLOWED_SFDC_HOSTS_STAGE`

## Related Documentation

- **[DEV-GUIDE.md](DEV-GUIDE.md)** — Full developer guide: architecture, step-by-step for adding GraphQL and REST sources, constraints, CLI reference, troubleshooting
- **[TESTING.md](TESTING.md)** — Complete sample requests for all operations (cURL, GraphQL client format, one-liners)
- **[CLAUDE.md](CLAUDE.md)** — AI assistant context for this project
