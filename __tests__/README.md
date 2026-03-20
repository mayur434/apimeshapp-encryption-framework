# Tests

## Running tests

```bash
npm test
```

## Test file: mesh-config.test.js

Validates:

- `mesh/mesh.json` is valid JSON and has required `meshConfig` structure
- Sources, hooks, resolvers, and files arrays are present
- Secrets YAML files exist and contain required variables
- `validate-mesh.js` script passes all checks
- Encryption envelope format round-trip (encrypt → decrypt)
- Hook detection and validation for registered wrapper fields
- Resolver registration for all registry entries
