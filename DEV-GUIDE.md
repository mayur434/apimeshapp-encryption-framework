# Developer Guide — Encrypted Wrapper Framework

## Overview

This framework wraps upstream GraphQL and REST API operations behind AES-CBC encrypted request/response envelopes on Adobe API Mesh. Clients send encrypted payloads, the mesh decrypts them, forwards to the real upstream, and returns an encrypted response.

```
Client (encrypted payload)
  → API Mesh (decrypt → route → re-encrypt)
    → Upstream API (GraphQL or REST)
```

**Supported source types:**
- **GraphQL** — Adobe Commerce, any GraphQL endpoint
- **REST (OpenAPI)** — Salesforce, any REST JSON API

---

## Architecture

```
┌─────────────────────────────────────┐
│           Build Time (Node.js)       │
│                                      │
│  encryption-registry.js             │
│         │                            │
│    type-defs.js                      │
│         │                            │
│    build-mesh.js ──► mesh.json       │
│    (generates {{env.X}} template)    │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│      Run / Deploy (AIO CLI)          │
│                                      │
│  --env .env                          │
│    → resolves {{env.X}} in handlers  │
│                                      │
│  --secrets secrets.yaml              │
│    → populates context.secrets       │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│        Runtime (Cloudflare Workers)  │
│                                      │
│  Hook: before-all.js                 │
│    → validates envelope structure    │
│                                      │
│  Resolver: encrypted-operations.js   │
│    → reads context.secrets           │
│    → decrypts request                │
│    → routes to upstream (GQL/REST)   │
│    → encrypts response               │
│                                      │
│  Crypto: Web Crypto API only         │
│  (no require, no Node built-ins)     │
└──────────────────────────────────────┘
```

---

## Project Structure

```
├── mesh.json                       ← Built artifact at root (generated, DO NOT edit)
├── .env                            ← Handler endpoints for --env flag (git-ignored)
│
├── mesh/
│   ├── sfdc-openapi.json           ← OpenAPI schema for REST sources
│   ├── prod-secrets.yaml           ← Production secrets (git-ignored)
│   └── stage-secrets.yaml          ← Staging secrets (git-ignored)
│
├── src/
│   ├── config/
│   │   ├── encryption-registry.js  ← Single source of truth for operations
│   │   └── type-defs.js            ← Auto-generates GraphQL schema
│   ├── hooks/
│   │   └── before-all.js           ← Request validation hook (self-contained)
│   └── resolvers/
│       └── encrypted-operations.js ← Main resolver (self-contained)
│
├── scripts/
│   ├── build-mesh.js               ← Build orchestrator
│   ├── env-loader.js               ← Secrets YAML parser (used by CLI scripts)
│   ├── crypto-envelope.js          ← AES-CBC encryption library
│   ├── encrypt-payload.js          ← CLI: encrypt GraphQL payloads
│   ├── encrypt-rest-payload.js     ← CLI: encrypt REST payloads
│   ├── encrypt-value.js            ← CLI: encrypt a raw string
│   ├── decrypt-value.js            ← CLI: decrypt an envelope
│   ├── decrypt-response.js         ← CLI: decrypt a response payload
│   ├── validate-mesh.js            ← Config validator
│   ├── validate-workflows.js       ← GitHub Actions validator
│   └── test-roundtrip.js           ← E2E roundtrip test
```

---

## Secrets Architecture

Secrets are split across two AIO CLI mechanisms:

| Mechanism | File | Usage in mesh.json / resolver | Purpose |
|-----------|------|-------------------------------|---------|
| `--env .env` | `.env` (KEY=VALUE) | `{{env.X}}` in handler endpoints | Handler URLs need real values for schema introspection |
| `--secrets YAML` | `mesh/stage-secrets.yaml` | `context.secrets.X` in resolver | Runtime secrets (passphrase, endpoints, tokens, hostlists) |

**`.env` file** (2 variables):
```env
COMMERCE_GRAPHQL_ENDPOINT=https://your-commerce.cloud/graphql
SF_BEARER_TOKEN=your-salesforce-token
```

**`mesh/stage-secrets.yaml`** (6 variables):
```yaml
MESH_AES_PASSPHRASE: your-secure-passphrase
COMMERCE_GRAPHQL_ENDPOINT: https://your-commerce.cloud/graphql
ALLOWED_COMMERCE_HOSTS: your-commerce.cloud
SF_BEARER_TOKEN: your-salesforce-token
SFDC_ENDPOINT: https://your-instance.salesforce-sites.com/path/to/api
ALLOWED_SFDC_HOSTS: your-instance.salesforce-sites.com
```

> **Important:** These files must be git-ignored. Never commit secrets.

---

## Getting Started

### 1. Set Up Secrets

Create `.env` and `mesh/stage-secrets.yaml` as shown above.

### 2. Build

```bash
npm run build:mesh
```

Generates `mesh.json` at the project root with `{{env.X}}` handler placeholders and auto-generated GraphQL type definitions. No secrets are read or embedded during build.

### 3. Validate

```bash
npm run validate
```

Checks that `mesh.json` is valid, all sources are configured, secrets files exist, and all required variables are present.

### 4. Run Locally

```bash
npm run start:mesh -- --port 5001
```

This runs: `aio api-mesh run mesh.json --env .env --secrets mesh/stage-secrets.yaml`

> Port 5000 is typically reserved on macOS (AirPlay). Use 5001 or higher.

### 5. Test

```bash
npm test                                     # Unit tests
node scripts/test-roundtrip.js 5001          # E2E roundtrip test (mesh must be running)
```

### 6. Deploy

```bash
aio api-mesh update mesh.json --env .env --secrets mesh/prod-secrets.yaml
```

---

## Encryption Specification

### Algorithm

| Parameter | Value |
|-----------|-------|
| Cipher | AES-128-CBC |
| Key Derivation | PBKDF2-SHA256 |
| Iterations | 10,000 |
| Key Size | 128 bits |
| IV | 16 random bytes |
| Salt | 16 random bytes |
| API | Web Crypto (`crypto.subtle`) |

### Envelope Format

```
Base64( keySize :: iterationCount :: ivHex :: saltHex :: cipherTextBase64 )
```

Example decoded:
```
128::10000::d8555cb9a7ae32682f530b161def64e8::904619e2345a1df3b9eddc113f9fb188::cW6U6Xm/RCpH7yBZIJcgr...
```

### Request Shape

Every encrypted wrapper mutation uses the same input/output types:

```graphql
input EncryptedOperationInput {
  encrypted: Boolean!    # true = payload is encrypted, false = plaintext JSON
  payload: String!       # Base64 envelope (if encrypted) or raw JSON string
}

type EncryptedOperationResult {
  encrypted: Boolean!    # whether the response payload is encrypted
  operationName: String! # the wrapper field name
  payload: String!       # Base64 envelope or raw JSON string
}
```

---

## Adding a New GraphQL Source

### Example: Adding an encrypted `getOrderStatus` query from an OMS API.

#### Step 1 — Add Secrets

Add to `mesh/stage-secrets.yaml` and `mesh/prod-secrets.yaml`:

```yaml
OMS_GRAPHQL_ENDPOINT: https://oms.example.com/graphql
ALLOWED_OMS_HOSTS: oms.example.com
```

If this is a new handler source (new upstream URL), also add the endpoint to `.env`:

```env
OMS_GRAPHQL_ENDPOINT=https://oms.example.com/graphql
```

And add the handler source to `getMeshTemplate()` in `scripts/build-mesh.js`:

```js
{
  name: 'OMS',
  handler: {
    graphql: {
      endpoint: '{{env.OMS_GRAPHQL_ENDPOINT}}',
      operationHeaders: { 'Content-Type': 'application/json' }
    }
  }
}
```

#### Step 2 — Update the Registry (`src/config/encryption-registry.js`)

Add to the exported array using secret key references:

```js
{
  wrapperField: 'encryptedGetOrderStatus',
  operationType: 'Query',           // or 'Mutation'
  requestMode: 'encrypted',         // 'encrypted' | 'encrypted-only'
  responseEncryption: 'always',      // 'always' | 'never' | 'mirror-request'
  source: {
    endpointKey: 'OMS_GRAPHQL_ENDPOINT',
    allowedHostsKey: 'ALLOWED_OMS_HOSTS'
  }
}
```

#### Step 3 — Sync the Resolver Registry (`src/resolvers/encrypted-operations.js`)

Add the same entry to the inline registry array (uses the same key references — the resolver reads actual values from `context.secrets` at runtime):

```js
{
  wrapperField: 'encryptedGetOrderStatus',
  operationType: 'Query',
  requestMode: 'encrypted',
  responseEncryption: 'always',
  source: { endpointKey: 'OMS_GRAPHQL_ENDPOINT', allowedHostsKey: 'ALLOWED_OMS_HOSTS' }
}
```

#### Step 4 — Sync the Hook Registry (`src/hooks/before-all.js`)

Add a minimal entry to the inline registry:

```js
{
  wrapperField: 'encryptedGetOrderStatus',
  requestMode: 'encrypted',
  responseEncryption: 'always'
}
```

> The hook only needs `wrapperField`, `requestMode`, and `responseEncryption` — no source/endpoint info.

#### Step 5 — Update the Validator (`scripts/validate-mesh.js`)

Add the new secret names to `REQUIRED_SECRETS`:

```js
const REQUIRED_SECRETS = [
  'MESH_AES_PASSPHRASE',
  'COMMERCE_GRAPHQL_ENDPOINT', 'ALLOWED_COMMERCE_HOSTS',
  'SFDC_ENDPOINT', 'ALLOWED_SFDC_HOSTS', 'SF_BEARER_TOKEN',
  'OMS_GRAPHQL_ENDPOINT', 'ALLOWED_OMS_HOSTS'  // ← add these
];
```

#### Step 6 — Build and Test

```bash
npm run build:mesh
npm run validate
npm run start:mesh -- --port 5001
```

Test with:

```bash
# Encrypt the GraphQL query
npm run encrypt:payload -- 'query { getOrderStatus(orderId: "12345") { status shippingDate } }'

# Call the mesh
curl -s http://localhost:5001/graphql \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "query($input: EncryptedOperationInput!) { encryptedGetOrderStatus(input: $input) { encrypted operationName payload } }",
    "variables": { "input": { "encrypted": true, "payload": "<PASTE_ENCRYPTED>" } }
  }'

# Decrypt the response
npm run decrypt -- "<RESPONSE_PAYLOAD>"
```

---

## Adding a New REST (OpenAPI) Source

### Example: Adding an encrypted `createTicket` mutation from a support API.

#### Step 1 — Create the OpenAPI Schema

Create `mesh/support-openapi.json`:

```json
{
  "openapi": "3.0.3",
  "info": { "title": "Support API", "version": "1.0.0" },
  "servers": [{ "url": "https://support.example.com" }],
  "paths": {
    "/api/v1/tickets": {
      "post": {
        "operationId": "createTicket",
        "summary": "Create a support ticket",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "type": "string" }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OK",
            "content": {
              "application/json": {
                "schema": { "type": "string" }
              }
            }
          }
        }
      }
    }
  }
}
```

> **Critical:** Keep all schemas as `"type": "string"`. Complex schemas with `$ref`, `array`, `integer`, `object`, `minItems`, or `components` cause Ajv compilation errors (`new Function()` is blocked on Cloudflare Workers). This is an edge runtime limitation.

#### Step 2 — Add Secrets

```yaml
SUPPORT_API_ENDPOINT: https://support.example.com/api/v1/tickets
ALLOWED_SUPPORT_HOSTS: support.example.com
SUPPORT_API_KEY: your-api-key-here
```

#### Step 3 — Add the Handler Source to `build-mesh.js`

Add to the `sources` array in the mesh template, using `{{env.X}}` for the bearer token:

```js
{
  name: 'SupportAPI',
  handler: {
    openapi: {
      source: './mesh/support-openapi.json',
      sourceFormat: 'json',
      operationHeaders: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer {{env.SUPPORT_API_KEY}}'
      }
    }
  }
}
```

Also add `SUPPORT_API_KEY` to `.env`:

```env
SUPPORT_API_KEY=your-api-key-here
```

#### Step 4 — Update All Three Registries

**`src/config/encryption-registry.js`** (uses secret key references):
```js
{
  wrapperField: 'encryptedCreateTicket',
  operationType: 'Mutation',
  requestMode: 'encrypted',
  responseEncryption: 'always',
  source: {
    endpointKey: 'SUPPORT_API_ENDPOINT',
    allowedHostsKey: 'ALLOWED_SUPPORT_HOSTS',
    mode: 'rest-json',
    bearerTokenKey: 'SUPPORT_API_KEY'
  }
}
```

**`src/resolvers/encrypted-operations.js`** (same key references — resolver reads values from `context.secrets`):
```js
{
  wrapperField: 'encryptedCreateTicket',
  operationType: 'Mutation',
  requestMode: 'encrypted',
  responseEncryption: 'always',
  source: {
    endpointKey: 'SUPPORT_API_ENDPOINT',
    allowedHostsKey: 'ALLOWED_SUPPORT_HOSTS',
    mode: 'rest-json',
    bearerTokenKey: 'SUPPORT_API_KEY'
  }
}
```

**`src/hooks/before-all.js`** (minimal — no source info):
```js
{
  wrapperField: 'encryptedCreateTicket',
  requestMode: 'encrypted',
  responseEncryption: 'always'
}
```

#### Step 5 — Update Validator

Add `'SUPPORT_API_ENDPOINT'`, `'ALLOWED_SUPPORT_HOSTS'`, `'SUPPORT_API_KEY'` to `REQUIRED_SECRETS` in `scripts/validate-mesh.js`.

#### Step 6 — Build and Test

```bash
npm run build:mesh
npm run validate
npm run start:mesh -- --port 5001
```

Test with:

```bash
# Encrypt the REST body
npm run encrypt:rest-payload -- '{"subject":"Login issue","priority":"high","description":"Cannot log in"}'

# Call the mesh
curl -s http://localhost:5001/graphql \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "mutation($input: EncryptedOperationInput!) { encryptedCreateTicket(input: $input) { encrypted operationName payload } }",
    "variables": { "input": { "encrypted": true, "payload": "<PASTE_ENCRYPTED>" } }
  }'

# Decrypt the response
npm run decrypt -- "<RESPONSE_PAYLOAD>"
```

---

## Three Registries — Keep in Sync

When adding or modifying operations, **all three** inline registries must be updated manually:

| File | Purpose | Required Fields |
|------|---------|-----------------|
| `src/config/encryption-registry.js` | Build-time source of truth | All fields (with `endpointKey` / `allowedHostsKey` key references) |
| `src/resolvers/encrypted-operations.js` | Runtime resolver | All fields (same key references, reads `context.secrets` at runtime) |
| `src/hooks/before-all.js` | Request validation | Minimal: wrapperField, requestMode, responseEncryption |

> The `src/config/type-defs.js` reads from `encryption-registry.js` automatically — no manual sync needed there.

---

## Key Constraints

### Runtime (Cloudflare Workers / API Mesh)
- **No `require()`, `import`, `window`, `eval`, or Node built-ins** in hook and resolver files — the API Mesh linter rejects them
- **No `new Function()`** — Ajv JSON Schema compilation fails (this is why OpenAPI schemas must use `"type": "string"`)
- **Secrets via `context.secrets`** — Resolver reads all runtime secrets from `context.secrets`, populated by `--secrets` flag
- **Handler endpoints via `{{env.X}}`** — Resolved by AIO CLI from `--env .env` at run/deploy time
- **Use `globalThis.fetch`** instead of `global.fetch`
- **Use Web Crypto API** (`crypto.subtle`) — not Node.js `crypto` module

### Build Time (Node.js)
- Uses Node.js `webcrypto` (`require('crypto').webcrypto`) in CLI scripts
- Build generates `mesh.json` at project root with `{{env.X}}` handler placeholders
- No secrets are read or embedded during build — just type defs and template generation

### OpenAPI Schemas
- **Must use `"type": "string"` for all request/response schemas**
- Complex types (`object`, `array`, `$ref`, `integer`, `minItems`, `components`) break Ajv on edge runtime
- Actual payload validation happens in the resolver, not in the OpenAPI schema

---

## `requestMode` Options

| Value | Behavior |
|-------|----------|
| `'encrypted'` | Accepts both encrypted and plaintext payloads |
| `'encrypted-only'` | Rejects plaintext — only encrypted payloads allowed |

## `responseEncryption` Options

| Value | Behavior |
|-------|----------|
| `'always'` | Response is always encrypted |
| `'never'` | Response is always plaintext JSON |
| `'mirror-request'` | Encrypted if request was encrypted, plain otherwise |

---

## CLI Tools Reference

| Command | Purpose | Input | Output |
|---------|---------|-------|--------|
| `npm run encrypt:payload -- '<query>' '<vars>'` | Encrypt GraphQL payload | GraphQL query + optional variables JSON | Base64 envelope |
| `npm run encrypt:rest-payload -- '<json>'` | Encrypt REST body | JSON object | Base64 envelope |
| `npm run encrypt -- "<text>"` | Encrypt a raw string | Any string | Base64 envelope |
| `npm run decrypt -- "<envelope>"` | Decrypt an envelope | Base64 envelope | Plaintext string |
| `npm run decrypt:response -- "<envelope>"` | Decrypt a response | Base64 envelope | Formatted JSON |
| `npm run build:mesh` | Build mesh.json | — | mesh.json at project root |
| `npm run validate` | Validate config | — | Pass/fail report |
| `npm run validate:workflows` | Validate CI/CD | — | Pass/fail report |
| `npm run start:mesh -- --port 5001` | Start mesh locally | — | Server on localhost |
| `npm test` | Run unit tests | — | Test results |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Error compiling schema, function code...` | OpenAPI schema has complex types | Simplify to `"type": "string"` in the OpenAPI JSON |
| `Cannot return null for non-nullable field` | Missing registry entry in resolver or hook | Add the operation to all 3 registries and rebuild |
| `The upstream service is currently unavailable` | Wrong endpoint, missing auth, or network error | Check secrets YAML, verify endpoint URL, check bearer token |
| `Failed to process the encrypted request` | Wrong passphrase or corrupted envelope | Verify `MESH_AES_PASSPHRASE` matches between encrypt and mesh secrets |
| `Source endpoint host is not allowed` | Endpoint host not in allowlist | Check `ALLOWED_*_HOSTS` in secrets YAML |
| `Address already in use` | Port conflict | Use `--port 5002` or kill the existing process |
| `No leads in the request` | Sending GraphQL format to REST endpoint | Use `npm run encrypt:rest-payload` (not `encrypt:payload`) for REST sources |
