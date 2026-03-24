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
│  encryption-registry.js ◄── secrets.yaml
│         │                            │
│    type-defs.js                      │
│         │                            │
│    build-mesh.js ──► mesh.json       │
│    (interpolates {{PLACEHOLDER}})    │
│         │                            │
│    mesh-artifact/                    │
│      ├── before-all.js (resolved)    │
│      └── encrypted-operations.js     │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│        Runtime (Cloudflare Workers)  │
│                                      │
│  Hook: before-all.js                 │
│    → validates envelope structure    │
│                                      │
│  Resolver: encrypted-operations.js   │
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
├── mesh/
│   ├── mesh.json              ← Built artifact (DO NOT edit directly)
│   ├── sfdc-openapi.json      ← OpenAPI schema for REST sources
│   ├── prod-secrets.yaml      ← Production secrets (git-ignored)
│   └── stage-secrets.yaml     ← Staging secrets (git-ignored)
│
├── mesh-artifact/             ← Build output (interpolated files)
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
│   ├── build-mesh.js          ← Build orchestrator
│   ├── env-loader.js          ← Secrets YAML parser
│   ├── crypto-envelope.js     ← AES-CBC encryption library
│   ├── encrypt-payload.js     ← CLI: encrypt GraphQL payloads
│   ├── encrypt-rest-payload.js← CLI: encrypt REST payloads
│   ├── encrypt-value.js       ← CLI: encrypt a raw string
│   ├── decrypt-value.js       ← CLI: decrypt an envelope
│   ├── decrypt-response.js    ← CLI: decrypt a response payload
│   └── validate-mesh.js       ← Config validator
```

---

## Getting Started

### 1. Set Up Secrets

Create `mesh/stage-secrets.yaml` (and `mesh/prod-secrets.yaml` for production):

```yaml
# Commerce source
COMMERCE_GRAPHQL_ENDPOINT: https://your-commerce-instance.cloud/graphql
ALLOWED_COMMERCE_HOSTS: your-commerce-instance.cloud

# Encryption
MESH_AES_PASSPHRASE: your-secure-passphrase

# Salesforce REST source (if using)
SF_BEARER_TOKEN: your-salesforce-oauth-token
SFDC_ENDPOINT: https://your-instance.salesforce-sites.com/path/to/api
ALLOWED_SFDC_HOSTS: your-instance.salesforce-sites.com
```

> **Important:** These files must be git-ignored. Never commit secrets.

### 2. Build

```bash
npm run build:mesh
```

This reads the secrets, interpolates all `{{PLACEHOLDER}}` tokens in the resolver and hook files, generates the GraphQL schema, and writes the final `mesh/mesh.json`.

### 3. Validate

```bash
npm run validate
```

Checks that `mesh.json` is valid, all sources are configured, secrets files exist, and all required variables are present.

### 4. Run Locally

```bash
npm run start:mesh -- --port 5001
```

> Port 5000 is typically reserved on macOS (AirPlay). Use 5001 or higher.

### 5. Test

```bash
npm test                         # Unit tests
node tempfiles/test-e2e.js       # End-to-end tests (if available)
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

#### Step 2 — Update the Registry (`src/config/encryption-registry.js`)

```js
const OMS_ENDPOINT = env.OMS_GRAPHQL_ENDPOINT;
const OMS_HOST = env.ALLOWED_OMS_HOSTS;

if (!OMS_ENDPOINT) throw new Error('Missing required env: OMS_GRAPHQL_ENDPOINT');
if (!OMS_HOST) throw new Error('Missing required env: ALLOWED_OMS_HOSTS');

// Add to the exported array:
{
  wrapperField: 'encryptedGetOrderStatus',
  operationType: 'Query',           // or 'Mutation'
  requestMode: 'encrypted',         // 'encrypted' | 'encrypted-only'
  responseEncryption: 'always',      // 'always' | 'never' | 'mirror-request'
  source: {
    endpoint: OMS_ENDPOINT,
    allowedHosts: OMS_HOST
  }
}
```

#### Step 3 — Sync the Resolver Registry (`src/resolvers/encrypted-operations.js`)

Add the placeholder constant and registry entry at the top of the file:

```js
const OMS_ENDPOINT = '{{OMS_GRAPHQL_ENDPOINT}}';
const OMS_HOST = '{{ALLOWED_OMS_HOSTS}}';

// Add to the registry array:
{
  wrapperField: 'encryptedGetOrderStatus',
  operationType: 'Query',
  requestMode: 'encrypted',
  responseEncryption: 'always',
  source: { endpoint: OMS_ENDPOINT, allowedHosts: OMS_HOST }
}
```

> **Critical:** Use `{{PLACEHOLDER}}` syntax — these are replaced at build time. Never use `process.env` or `context.secrets` in runtime files.

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

#### Step 3 — Add the Source to `build-mesh.js`

Add to the `sources` array in the mesh template:

```js
{
  name: 'SupportAPI',
  handler: {
    openapi: {
      source: './support-openapi.json',
      sourceFormat: 'json',
      operationHeaders: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer {{SUPPORT_API_KEY}}'
      }
    }
  }
}
```

#### Step 4 — Update All Three Registries

**`src/config/encryption-registry.js`:**
```js
const SUPPORT_ENDPOINT = env.SUPPORT_API_ENDPOINT;
const SUPPORT_HOST = env.ALLOWED_SUPPORT_HOSTS;

// In the exported array:
{
  wrapperField: 'encryptedCreateTicket',
  operationType: 'Mutation',
  requestMode: 'encrypted',
  responseEncryption: 'always',
  source: {
    endpoint: SUPPORT_ENDPOINT,
    allowedHosts: SUPPORT_HOST,
    mode: 'rest-json'       // ← Required for REST sources
  }
}
```

**`src/resolvers/encrypted-operations.js`:**
```js
const SUPPORT_ENDPOINT = '{{SUPPORT_API_ENDPOINT}}';
const SUPPORT_HOST = '{{ALLOWED_SUPPORT_HOSTS}}';
const SUPPORT_API_KEY = '{{SUPPORT_API_KEY}}';

// In the registry array:
{
  wrapperField: 'encryptedCreateTicket',
  operationType: 'Mutation',
  requestMode: 'encrypted',
  responseEncryption: 'always',
  source: {
    endpoint: SUPPORT_ENDPOINT,
    allowedHosts: SUPPORT_HOST,
    mode: 'rest-json',
    bearerToken: SUPPORT_API_KEY   // ← injected at build time
  }
}
```

**`src/hooks/before-all.js`:**
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
| `src/config/encryption-registry.js` | Build-time source of truth | All fields (wrapperField, operationType, requestMode, responseEncryption, source) |
| `src/resolvers/encrypted-operations.js` | Runtime resolver | All fields + `{{PLACEHOLDER}}` constants |
| `src/hooks/before-all.js` | Request validation | Minimal: wrapperField, requestMode, responseEncryption |

> The `src/config/type-defs.js` reads from `encryption-registry.js` automatically — no manual sync needed there.

---

## Key Constraints

### Runtime (Cloudflare Workers / API Mesh)
- **No `require()`, `import`, `window`, `eval`, or Node built-ins** in hook and resolver files — the API Mesh linter rejects them
- **No `new Function()`** — Ajv JSON Schema compilation fails (this is why OpenAPI schemas must use `"type": "string"`)
- **No `process.env` or `context.secrets`** — all configuration is injected at build time via `{{PLACEHOLDER}}`
- **Use `globalThis.fetch`** instead of `global.fetch`
- **Use Web Crypto API** (`crypto.subtle`) — not Node.js `crypto` module

### Build Time (Node.js)
- Uses Node.js `webcrypto` (`require('crypto').webcrypto`) in CLI scripts
- `{{PLACEHOLDER}}` tokens in source files are replaced by `scripts/build-mesh.js`
- Built artifacts go to `mesh-artifact/` and `mesh/mesh.json`

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
| `npm run build:mesh` | Build mesh.json | — | mesh/mesh.json + mesh-artifact/ |
| `npm run validate` | Validate config | — | Pass/fail report |
| `npm run start:mesh` | Start mesh locally | — | Server on localhost |
| `npm test` | Run unit tests | — | Test results |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Error compiling schema, function code...` | OpenAPI schema has complex types | Simplify to `"type": "string"` in the OpenAPI JSON |
| `Cannot return null for non-nullable field` | Missing registry entry in resolver or hook | Add the operation to all 3 registries and rebuild |
| `The upstream service is currently unavailable` | Wrong endpoint, missing auth, or network error | Check secrets YAML, verify endpoint URL, check bearer token |
| `Failed to process the encrypted request` | Wrong passphrase or corrupted envelope | Verify `MESH_AES_PASSPHRASE` matches between encrypt and mesh |
| `Unresolved placeholder {{...}}` | Missing secret in YAML file | Add the key to `mesh/stage-secrets.yaml` |
| `Address already in use` | Port conflict | Use `--port 5002` or kill the existing process |
| `No leads in the request` | Sending GraphQL format to REST endpoint | Use `npm run encrypt:rest-payload` (not `encrypt:payload`) for REST sources |
