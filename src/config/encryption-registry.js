/**
 * Encryption Registry
 *
 * Each entry defines a single encrypted wrapper operation. Any GraphQL source
 * can be added here — Commerce, OMS, CMS, or any third-party API. The resolver
 * and hook read this file as the single source of truth.
 *
 * Source endpoint and host use secret KEY NAMES (not values). At runtime, the
 * resolver reads the actual values from context.secrets (populated by --secrets flag).
 * This file runs in the Node.js build context (scripts/build-mesh.js) for type generation.
 *
 * Entry fields:
 *   wrapperField       - The GraphQL field name exposed to the client
 *   operationType      - 'Query' or 'Mutation'
 *   requestMode        - 'encrypted' | 'allow-plain-or-encrypted' | 'encrypted-only'
 *   responseEncryption - 'always' | 'never' | 'mirror-request'
 *   source.endpointKey    - context.secrets key for the upstream endpoint
 *   source.allowedHostsKey - context.secrets key for allowed hostnames (SSRF guard)
 *   source.mode           - 'graphql' (default) or 'rest-json'
 *   source.bearerTokenKey  - context.secrets key for bearer token (REST sources)
 */

module.exports = [
  // ─── Adobe Commerce Source ────────────────────────────────────────────────
  {
    wrapperField: 'encryptedCreateCustomer',
    operationType: 'Mutation',
    requestMode: 'encrypted',
    responseEncryption: 'always',
    source: {
      endpointKey: 'COMMERCE_GRAPHQL_ENDPOINT',
      allowedHostsKey: 'ALLOWED_COMMERCE_HOSTS'
    }
  },
  {
    wrapperField: 'encryptedGenerateCustomerToken',
    operationType: 'Mutation',
    requestMode: 'encrypted',
    responseEncryption: 'always',
    source: {
      endpointKey: 'COMMERCE_GRAPHQL_ENDPOINT',
      allowedHostsKey: 'ALLOWED_COMMERCE_HOSTS'
    }
  },
  // ─── Salesforce REST Source ────────────────────────────────────────────────
  {
    wrapperField: 'encryptedCreateLead',
    operationType: 'Mutation',
    requestMode: 'encrypted',
    responseEncryption: 'always',
    source: {
      endpointKey: 'SFDC_ENDPOINT',
      allowedHostsKey: 'ALLOWED_SFDC_HOSTS',
      mode: 'rest-json',
      bearerTokenKey: 'SF_BEARER_TOKEN'
    }
  }

  // ─── Add other sources below ───────────────────────────────────────────────
];
