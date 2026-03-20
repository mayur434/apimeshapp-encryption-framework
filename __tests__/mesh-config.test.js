const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MESH_PATH = path.join(ROOT, 'mesh', 'mesh.json');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('mesh-config tests\n');

// ── Mesh config structure ───────────────────────────────────────────────────

test('mesh/mesh.json exists', () => {
  assert.ok(fs.existsSync(MESH_PATH), 'mesh/mesh.json not found');
});

test('mesh/mesh.json is valid JSON', () => {
  const raw = fs.readFileSync(MESH_PATH, 'utf8');
  JSON.parse(raw);
});

test('meshConfig has sources array', () => {
  const mesh = JSON.parse(fs.readFileSync(MESH_PATH, 'utf8'));
  assert.ok(Array.isArray(mesh.meshConfig.sources), 'sources must be an array');
  assert.ok(mesh.meshConfig.sources.length > 0, 'sources must not be empty');
});

test('meshConfig has plugins with hooks', () => {
  const mesh = JSON.parse(fs.readFileSync(MESH_PATH, 'utf8'));
  assert.ok(Array.isArray(mesh.meshConfig.plugins), 'plugins must be an array');
  const hookPlugin = mesh.meshConfig.plugins.find(p => p.hooks);
  assert.ok(hookPlugin, 'must have a hooks plugin');
  assert.ok(hookPlugin.hooks.beforeAll, 'must have a beforeAll hook');
  assert.ok(hookPlugin.hooks.beforeAll.composer, 'beforeAll must have a composer');
});

test('meshConfig has additionalResolvers', () => {
  const mesh = JSON.parse(fs.readFileSync(MESH_PATH, 'utf8'));
  assert.ok(Array.isArray(mesh.meshConfig.additionalResolvers), 'additionalResolvers must be an array');
  assert.ok(mesh.meshConfig.additionalResolvers.length > 0, 'additionalResolvers must not be empty');
});

test('meshConfig has files array', () => {
  const mesh = JSON.parse(fs.readFileSync(MESH_PATH, 'utf8'));
  assert.ok(Array.isArray(mesh.meshConfig.files), 'files must be an array');
});

// ── Secrets files ───────────────────────────────────────────────────────────

const REQUIRED_SECRETS = ['MESH_AES_PASSPHRASE', 'COMMERCE_GRAPHQL_ENDPOINT', 'ALLOWED_COMMERCE_HOSTS'];

for (const env of ['prod', 'stage']) {
  const secretsPath = path.join(ROOT, 'mesh', `${env}-secrets.yaml`);

  test(`mesh/${env}-secrets.yaml exists`, () => {
    assert.ok(fs.existsSync(secretsPath), `${env}-secrets.yaml not found`);
  });

  test(`mesh/${env}-secrets.yaml has required variables`, () => {
    const content = fs.readFileSync(secretsPath, 'utf8');
    for (const key of REQUIRED_SECRETS) {
      assert.ok(content.includes(key), `Missing ${key} in ${env}-secrets.yaml`);
    }
  });
}

// ── Source configuration ────────────────────────────────────────────────────

test('first source has graphql handler with endpoint', () => {
  const mesh = JSON.parse(fs.readFileSync(MESH_PATH, 'utf8'));
  const source = mesh.meshConfig.sources[0];
  assert.ok(source.handler.graphql, 'source must have graphql handler');
  assert.ok(source.handler.graphql.endpoint, 'graphql handler must have endpoint');
});

test('endpoint uses {{PLACEHOLDER}} syntax', () => {
  const mesh = JSON.parse(fs.readFileSync(MESH_PATH, 'utf8'));
  const endpoint = mesh.meshConfig.sources[0].handler.graphql.endpoint;
  assert.ok(
    endpoint.startsWith('https://') || endpoint.match(/\{\{.+\}\}/),
    'endpoint must be a URL or a {{PLACEHOLDER}}'
  );
});

console.log('\nDone.');
