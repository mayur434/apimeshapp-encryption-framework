# API Mesh Encryption Framework

A zero-dependency, source-agnostic encryption framework for Adobe API Mesh. Wraps any upstream GraphQL operation (Commerce, OMS, CMS, or third-party) behind AES-CBC encrypted request/response envelopes.

## What it solves

- Wraps sensitive GraphQL mutations/queries behind encrypted wrapper fields.
- Client sends the full GraphQL query + variables inside an encrypted (or plain) payload.
- `beforeAll` hook validates envelope structure before the resolver runs.
- Resolver decrypts the payload, forwards the inner GraphQL request to the upstream source, and encrypts the response.
- Source-agnostic — any GraphQL endpoint can be added by editing a single registry file.
- Zero external crypto dependencies — uses Web Crypto API (mesh runtime) and Node.js `webcrypto` (CLI scripts).

## Architecture

```
Client
  │
  ▼
┌──────────────────────────────────────────────────┐
│  Adobe API Mesh                                  │
│                                                  │
│  beforeAll hook (before-all.js)                  │
│    ├─ Detect wrapper field from GraphQL query     │
│    ├─ Validate envelope format (structural only)  │
│    └─ Enforce requestMode policy                  │
│                                                  │
│  Resolver (encrypted-operations.js)              │
│    ├─ Decrypt payload (if encrypted=true)         │
│    ├─ Extract query + variables from payload      │
│    ├─ Forward to upstream source (from registry)  │
│    ├─ Encrypt response (per responseEncryption)   │
│    └─ Return EncryptedOperationResult             │
└──────────────────────────────────────────────────┘
  │
  ▼
Upstream GraphQL Source (Commerce, OMS, etc.)
```

> **Note:** API Mesh hooks cannot modify the request or response. Adobe recommends custom resolvers for data manipulation. This framework follows that pattern.

## Encryption algorithm

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

Example decoded envelope:

```
128::10000::447090cf3a3ac7a983dce3bc296ba1b3::31b12db2887dc9dcf22bcc7d8d47604f::YGb1OxIrgRViVzrdudQyln...
```

## Project structure

```
├── .github/
│   ├── copilot-instructions.md         # Copilot coding conventions
│   └── workflows/
│       ├── deploy-production.yml       # CI/CD: deploy to production
│       ├── deploy-stage.yml            # CI/CD: deploy to stage
│       └── pr-checks.yml              # CI: lint, validate, test on PRs
├── __tests__/
│   ├── README.md                       # Test documentation
│   └── mesh-config.test.js            # Mesh config validation tests
├── mesh/
│   ├── mesh.json                       # Mesh config template ({{PLACEHOLDER}} syntax)
│   ├── prod-secrets.yaml               # Production secrets (not committed)
│   ├── stage-secrets.yaml              # Stage secrets (not committed)
│   └── schemas/
│       └── ipapi-response.json         # JSON schema for IP API response
├── src/
│   ├── config/
│   │   ├── encryption-registry.js      # Registry — add/remove operations here
│   │   └── type-defs.js                # Auto-generates GraphQL types from registry
│   ├── hooks/
│   │   └── before-all.js               # Request validation hook (inline registry)
│   └── resolvers/
│       └── encrypted-operations.js     # Encrypted resolver (inline crypto + registry)
├── scripts/
│   ├── build-mesh.js                   # Build script → mesh/mesh.json
│   ├── env-loader.js                   # Shared secrets.yaml parser
│   ├── crypto-envelope.js              # Shared crypto module (Node.js webcrypto)
│   ├── encrypt-value.js                # CLI: encrypt a plaintext value
│   ├── decrypt-value.js                # CLI: decrypt an envelope
│   ├── encrypt-payload.js              # CLI: build & encrypt a GraphQL payload
│   ├── validate-mesh.js                # Validate mesh config and secrets
│   └── validate-workflows.js           # Validate GitHub Actions workflows
├── mesh-artifact/                      # Mesh artifact storage
├── meshes/                             # Mesh definitions
├── tempfiles/                          # Temporary files
├── .eslintrc.json                      # ESLint configuration
├── .prettierrc                         # Prettier configuration
├── .gitignore                          # Git ignore rules
├── eslint.config.js                    # ESLint flat config
├── wrangler.toml                       # Wrangler configuration
├── CLAUDE.md                           # AI assistant context
├── README.md                           # This file
├── package.json                        # npm scripts and dependencies
└── package-lock.json                   # Dependency lock file
```

## Quick start

### 1. Configure secrets

```bash
cp mesh/prod-secrets.yaml.example mesh/prod-secrets.yaml
cp mesh/prod-secrets.yaml mesh/stage-secrets.yaml
```

Edit `mesh/prod-secrets.yaml` (and `mesh/stage-secrets.yaml`) with your values:

```yaml
MESH_AES_PASSPHRASE: your-strong-passphrase
COMMERCE_GRAPHQL_ENDPOINT: https://your-commerce-instance.cloud/graphql
ALLOWED_COMMERCE_HOSTS: your-commerce-instance.cloud
```

### 2. Build

```bash
npm run build:mesh
```

This reads `mesh/prod-secrets.yaml`, interpolates `{{PLACEHOLDER}}` values into the mesh config and embedded source files, and outputs a single self-contained `mesh/mesh.json`.

### 3. Run locally

```bash
npm run start:mesh
```

### 4. Deploy

```bash
aio api-mesh create mesh/mesh.json
# or update an existing mesh:
aio api-mesh update mesh/mesh.json
```

## npm scripts

| Script              | Command                                              | Description                              |
|---------------------|------------------------------------------------------|------------------------------------------|
| `build:mesh`        | `npm run build:mesh`                                 | Build `mesh/mesh.json`                   |
| `start:mesh`        | `npm run start:mesh`                                 | Run mesh locally with `aio api-mesh run` |
| `encrypt`           | `npm run encrypt -- "text"`                          | Encrypt a plaintext string               |
| `decrypt`           | `npm run decrypt -- "envelope"`                      | Decrypt an encrypted envelope            |
| `encrypt:payload`   | `npm run encrypt:payload -- "query" '{"vars":{}}'`   | Build & encrypt a GraphQL payload        |
| `validate`          | `npm run validate`                                   | Validate mesh config and secrets files   |
| `validate:workflows`| `npm run validate:workflows`                         | Validate GitHub Actions workflows        |
| `test`              | `npm test`                                           | Run mesh config tests                    |

## CLI tools

### Encrypt a value

```bash
npm run encrypt -- "Hello, World!"
# Output: MTI4OjoxMDAwMDo6NDQ3MDk...
```

### Decrypt a value

```bash
npm run decrypt -- "MTI4OjoxMDAwMDo6NDQ3MDk..."
# Output: Hello, World!
```

### Build & encrypt a GraphQL payload

```bash
npm run encrypt:payload -- \
  'mutation CreateCustomer($input: CreateCustomerInput!) { createCustomer(input: $input) { customer { email } } }' \
  '{"input":{"firstname":"Jane","lastname":"Doe","email":"jane@example.com","password":"Secret123!"}}'
```

The output is a Base64 envelope ready to use as `input.payload` in a wrapper mutation.

## Adding a new encrypted operation

1. Add an entry to `src/config/encryption-registry.js`:

```js
{
  wrapperField: 'encryptedMyOperation',
  operationType: 'Mutation',        // or 'Query'
  requestMode: 'encrypted',         // or 'allow-plain-or-encrypted'
  responseEncryption: 'always',     // or 'never' or 'mirror-request'
  source: {
    endpoint: env.MY_SOURCE_ENDPOINT,
    allowedHosts: env.MY_SOURCE_HOSTS
  }
}
```

2. Add the same entry (without `source`) to the inline registries in:
   - `src/hooks/before-all.js`
   - `src/resolvers/encrypted-operations.js`

3. Add the new env vars to `mesh/prod-secrets.yaml` and `mesh/stage-secrets.yaml`.

4. Rebuild: `npm run build:mesh`

## Required environment variables

Defined in `mesh/prod-secrets.yaml` and `mesh/stage-secrets.yaml`:

| Variable                     | Description                                    |
|------------------------------|------------------------------------------------|
| `MESH_AES_PASSPHRASE`       | Passphrase for AES-CBC key derivation (PBKDF2) |
| `COMMERCE_GRAPHQL_ENDPOINT`  | Upstream GraphQL endpoint URL                  |
| `ALLOWED_COMMERCE_HOSTS`     | Comma-separated allowed hostnames (SSRF guard) |

## How the build works

1. `scripts/env-loader.js` parses `mesh/prod-secrets.yaml` into a key-value map (shell env takes precedence).
2. `src/config/encryption-registry.js` reads env values via `loadEnv()` and exports the registry array.
3. `src/config/type-defs.js` generates `additionalTypeDefs` from the registry (input/result types + wrapper fields).
4. `scripts/build-mesh.js` reads the embedded template, interpolates `{{PLACEHOLDER}}` tokens in both the config and embedded file contents, injects `additionalTypeDefs`, and writes `mesh/mesh.json`.

The built artifact is fully self-contained — no runtime env access needed. All secrets and endpoints are baked in at build time.
