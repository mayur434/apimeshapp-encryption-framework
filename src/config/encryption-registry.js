/**
 * Encryption Registry
 *
 * Each entry defines a single encrypted wrapper operation. Any GraphQL source
 * can be added here — Commerce, OMS, CMS, or any third-party API. The resolver
 * and hook read this file as the single source of truth.
 *
 * Source endpoint and host are read from mesh/*-secrets.yaml via the shared env-loader.
 * This file runs only in the Node.js build context (scripts/build-mesh.js).
 *
 * Entry fields:
 *   wrapperField       - The GraphQL field name exposed to the client
 *   operationType      - 'Query' or 'Mutation'
 *   operationName      - The real operation name on the upstream source
 *   requestMode        - 'allow-plain-or-encrypted' | 'encrypted-only'
 *   responseEncryption - 'always' | 'never' | 'mirror-request'
 *   source.endpoint    - The upstream GraphQL endpoint for this operation
 *   source.allowedHosts - Comma-separated list of allowed hostnames (SSRF guard)
 *   sourceDocument     - The upstream GraphQL query/mutation string
 *   responsePath       - Array path to extract from the upstream response data
 */

const { loadEnv } = require('../../scripts/env-loader');
const env = loadEnv();

const COMMERCE_ENDPOINT = env.COMMERCE_GRAPHQL_ENDPOINT;
const COMMERCE_HOST = env.ALLOWED_COMMERCE_HOSTS;

if (!COMMERCE_ENDPOINT) throw new Error('Missing required env: COMMERCE_GRAPHQL_ENDPOINT');
if (!COMMERCE_HOST) throw new Error('Missing required env: ALLOWED_COMMERCE_HOSTS');

module.exports = [
  // ─── Adobe Commerce Source ────────────────────────────────────────────────
  // Each entry maps a wrapper field to an upstream source.
  // The actual GraphQL query and variables are provided by the client
  // inside the encrypted (or plain) payload — no hardcoded query here.
  {
    wrapperField: 'encryptedCreateCustomer',
    operationType: 'Mutation',
    requestMode: 'encrypted',
    responseEncryption: 'always',
    source: {
      endpoint: COMMERCE_ENDPOINT,
      allowedHosts: COMMERCE_HOST
    }
  },
  {
    wrapperField: 'encryptedGenerateCustomerToken',
    operationType: 'Mutation',
    requestMode: 'encrypted',
    responseEncryption: 'always',
    source: {
      endpoint: COMMERCE_ENDPOINT,
      allowedHosts: COMMERCE_HOST
    }
  }

  // ─── Add other sources below ───────────────────────────────────────────────
  // Example: OMS source
  // {
  //   wrapperField: 'encryptedOmsOperation',
  //   operationType: 'Mutation',
  //   requestMode: 'encrypted-only',
  //   responseEncryption: 'always',
  //   source: {
  //     endpoint: 'https://oms.example.com/graphql',
  //     allowedHosts: 'oms.example.com'
  //   }
  // }
];
