const fs = require('fs');
const path = require('path');

const { buildAdditionalTypeDefs } = require('../src/config/type-defs');

const rootDir = path.join(__dirname, '..');
const outputPath = path.join(rootDir, 'mesh.json');

/**
 * Mesh config template.
 *
 * Handler endpoints use {{env.X}} — interpolated by the AIO CLI at run/deploy
 * time from the --env file. Resolver secrets are accessed via context.secrets
 * (populated by the --secrets flag). No build-time secret interpolation needed.
 *
 * Source files are NOT embedded — the CLI reads them from disk using the
 * referenced paths in additionalResolvers and plugins.hooks.
 *
 * Usage:
 *   npm run build:mesh                     # Generate mesh/mesh.json
 *   aio api-mesh run mesh/mesh.json --env .env --secrets mesh/stage-secrets.yaml
 */
function getMeshTemplate() {
  return {
    meshConfig: {
      sources: [
        {
          name: 'AdobeCommerce',
          handler: {
            graphql: {
              endpoint: '{{env.COMMERCE_GRAPHQL_ENDPOINT}}',
              operationHeaders: {
                'Content-Type': 'application/json'
              }
            }
          }
        },
        {
          name: 'SalesforceLeadAPI',
          handler: {
            openapi: {
              source: './mesh/sfdc-openapi.json',
              sourceFormat: 'json',
              operationHeaders: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer {{env.SF_BEARER_TOKEN}}'
              }
            }
          }
        }
      ],
      plugins: [
        {
          hooks: {
            beforeAll: {
              composer: './src/hooks/before-all.js#beforeAll',
              blocking: true
            }
          }
        }
      ],
      additionalTypeDefs: '',
      additionalResolvers: [
        './src/resolvers/encrypted-operations.js'
      ]
    }
  };
}

function main() {
  var mesh = getMeshTemplate();
  mesh.meshConfig.additionalTypeDefs = buildAdditionalTypeDefs();

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(mesh, null, 2));
  console.log('Wrote ' + outputPath);
}

main();
