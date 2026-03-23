const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./env-loader');

const env = loadEnv();

const { buildAdditionalTypeDefs } = require('../src/config/type-defs');

const rootDir = path.join(__dirname, '..');
const outputPath = path.join(rootDir, 'mesh', 'mesh.json');

const embeddedFiles = [
  'src/hooks/before-all.js',
  'src/resolvers/encrypted-operations.js'
];

/**
 * Mesh config template.
 * {{PLACEHOLDER}} tokens are resolved at build time from mesh/*-secrets.yaml.
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
          name: 'sfdc',
          handler: {
            openapi: {
              source: 'sfdc-openapi.json',
              operationHeaders: {
                Authorization: '{context.headers.authorization}',
                'Content-Type': 'application/json'
              }
            }
          },
          transforms: [
            {
              rename: {
                renames: [
                  {
                    from: {
                      type: 'Mutation',
                      field: 'post_CallCenterLead_services_apexrest_bstcreatelead'
                    },
                    to: {
                      type: 'Mutation',
                      field: 'WebToLeadIntegration'
                    }
                  },
                  {
                    from: {
                      type: 'mutationInput_post_CallCenterLead_services_apexrest_bstcreatelead_input_oneOf_0_Input'
                    },
                    to: {
                      type: 'WebToLeadInput'
                    }
                  }
                ]
              }
            }
          ]
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
      ],
      files: []
    }
  };
}

/**
 * Replace {{VAR_NAME}} placeholders in content with values from the env map.
 * Unresolved placeholders are left as-is (build will warn).
 */
function interpolate(content, env) {
  return content.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    if (env[key] !== undefined) return env[key];
    console.warn(`[build-mesh] Warning: placeholder {{env.${key}}} has no value — check mesh/prod-secrets.yaml`);
    return match;
  });
}

function main() {
  // Build mesh from template, interpolating placeholders
  const rawTemplate = JSON.stringify(getMeshTemplate());
  const mesh = JSON.parse(interpolate(rawTemplate, env));
  mesh.meshConfig.additionalTypeDefs = buildAdditionalTypeDefs();

  // Write interpolated embedded files to mesh-artifact/ so the mesh runtime
  // always reads resolved values (source files contain {{PLACEHOLDER}} tokens).
  const artifactDir = path.join(rootDir, 'mesh-artifact');
  mesh.meshConfig.files = embeddedFiles.map((relativePath) => {
    const rawContent = fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
    const content = interpolate(rawContent, env);

    const artifactFilePath = path.join(artifactDir, relativePath);
    fs.mkdirSync(path.dirname(artifactFilePath), { recursive: true });
    fs.writeFileSync(artifactFilePath, content);
    console.log(`  Wrote ${artifactFilePath}`);

    return { path: `./mesh-artifact/${relativePath}`, content };
  });

  // Point mesh config paths to the resolved files in mesh-artifact/
  mesh.meshConfig.plugins[0].hooks.beforeAll.composer = './mesh-artifact/src/hooks/before-all.js#beforeAll';
  mesh.meshConfig.additionalResolvers = ['./mesh-artifact/src/resolvers/encrypted-operations.js'];

  fs.writeFileSync(outputPath, JSON.stringify(mesh, null, 2));
  console.log(`Wrote ${outputPath}`);
}

main();
