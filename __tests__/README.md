# Tests

## Running Tests

```bash
npm test
```

## Test File: mesh-config.test.js

Validates the mesh configuration and encryption framework:

- `mesh/mesh.json` is valid JSON with required `meshConfig` structure
- Sources array contains both GraphQL (AdobeCommerce) and OpenAPI (SalesforceLeadAPI) sources
- Hooks and resolvers are configured and referenced files exist
- Secrets YAML files (`mesh/prod-secrets.yaml`, `mesh/stage-secrets.yaml`) exist and contain all required variables:
  - `MESH_AES_PASSPHRASE`, `COMMERCE_GRAPHQL_ENDPOINT`, `ALLOWED_COMMERCE_HOSTS`
  - `SFDC_ENDPOINT`, `ALLOWED_SFDC_HOSTS`, `SF_BEARER_TOKEN`
- Encryption envelope format round-trip (encrypt → decrypt)
- Hook detection and validation for all registered wrapper fields
- Resolver registration for all registry entries

## End-to-End Tests

Run the full end-to-end test suite (requires mesh running on port 5002):

```bash
node tempfiles/test-e2e.js
```

Tests all three operations:
1. `encryptedCreateLead` — REST/Salesforce (encrypt body → call mesh → decrypt response)
2. `encryptedGenerateCustomerToken` — GraphQL/Commerce
3. `encryptedCreateCustomer` — GraphQL/Commerce

## Related

- [TESTING.md](../TESTING.md) — Sample requests and cURL commands for manual testing
- [README.md](../README.md) — Project overview
