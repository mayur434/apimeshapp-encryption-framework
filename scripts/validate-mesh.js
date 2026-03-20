#!/usr/bin/env node

/**
 * Validate mesh configuration files.
 *
 * Checks:
 *   - mesh/mesh.json exists and is valid JSON
 *   - meshConfig has required top-level keys
 *   - Sources have graphql handlers with endpoints
 *   - Hooks and resolvers are configured
 *   - Secrets YAML files exist and contain required variables
 *   - Referenced files exist on disk
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MESH_PATH = path.join(ROOT, 'mesh', 'mesh.json');
const REQUIRED_SECRETS = ['MESH_AES_PASSPHRASE', 'COMMERCE_GRAPHQL_ENDPOINT', 'ALLOWED_COMMERCE_HOSTS'];
const SECRET_FILES = ['mesh/prod-secrets.yaml', 'mesh/stage-secrets.yaml'];

let errors = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
    errors++;
  }
}

console.log('Mesh config validation\n');

// ── mesh.json ───────────────────────────────────────────────────────────────

check('mesh/mesh.json exists', () => {
  if (!fs.existsSync(MESH_PATH)) throw new Error('File not found: mesh/mesh.json');
});

let mesh;
check('mesh/mesh.json is valid JSON', () => {
  mesh = JSON.parse(fs.readFileSync(MESH_PATH, 'utf8'));
});

if (mesh) {
  check('meshConfig.sources is a non-empty array', () => {
    if (!Array.isArray(mesh.meshConfig.sources) || mesh.meshConfig.sources.length === 0) {
      throw new Error('sources must be a non-empty array');
    }
  });

  check('first source has graphql handler with endpoint', () => {
    const src = mesh.meshConfig.sources[0];
    if (!src.handler || !src.handler.graphql || !src.handler.graphql.endpoint) {
      throw new Error('first source must have handler.graphql.endpoint');
    }
  });

  check('meshConfig.plugins has beforeAll hook', () => {
    const hookPlugin = (mesh.meshConfig.plugins || []).find(p => p.hooks);
    if (!hookPlugin || !hookPlugin.hooks.beforeAll) {
      throw new Error('plugins must include a beforeAll hook');
    }
  });

  check('meshConfig.additionalResolvers is configured', () => {
    if (!Array.isArray(mesh.meshConfig.additionalResolvers) || mesh.meshConfig.additionalResolvers.length === 0) {
      throw new Error('additionalResolvers must be a non-empty array');
    }
  });

  // Check that referenced hook/resolver files exist.
  // After build, paths point to mesh-artifact/; before build, check the source files too.
  function assertFileOrSource(filePath) {
    const fullPath = path.join(ROOT, filePath.replace(/^\.\//, ''));
    if (fs.existsSync(fullPath)) return;
    // Fall back to the source file (mesh-artifact/src/... → src/...)
    const sourcePath = filePath.replace('mesh-artifact/', '');
    const sourceFullPath = path.join(ROOT, sourcePath.replace(/^\.\//, ''));
    if (fs.existsSync(sourceFullPath)) return;
    throw new Error(`File not found: ${filePath}`);
  }

  const hookComposer = ((mesh.meshConfig.plugins || []).find(p => p.hooks) || {}).hooks;
  if (hookComposer && hookComposer.beforeAll && hookComposer.beforeAll.composer) {
    const hookFile = hookComposer.beforeAll.composer.split('#')[0];
    check(`hook file exists: ${hookFile}`, () => {
      assertFileOrSource(hookFile);
    });
  }

  for (const resolverPath of mesh.meshConfig.additionalResolvers || []) {
    check(`resolver file exists: ${resolverPath}`, () => {
      assertFileOrSource(resolverPath);
    });
  }
}

// ── Secrets files ───────────────────────────────────────────────────────────

for (const secretFile of SECRET_FILES) {
  const secretPath = path.join(ROOT, secretFile);

  check(`${secretFile} exists`, () => {
    if (!fs.existsSync(secretPath)) throw new Error(`File not found: ${secretFile}`);
  });

  if (fs.existsSync(secretPath)) {
    check(`${secretFile} has required variables`, () => {
      const content = fs.readFileSync(secretPath, 'utf8');
      const missing = REQUIRED_SECRETS.filter(key => !content.includes(key));
      if (missing.length > 0) {
        throw new Error(`Missing variables: ${missing.join(', ')}`);
      }
    });
  }
}

// ── Result ──────────────────────────────────────────────────────────────────

console.log('');
if (errors > 0) {
  console.error(`${errors} validation error(s) found.`);
  process.exit(1);
} else {
  console.log('All checks passed.');
}
