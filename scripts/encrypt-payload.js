#!/usr/bin/env node

/**
 * Build and encrypt a wrapper payload for API Mesh.
 *
 * Usage:
 *   npm run encrypt:payload -- "<GraphQL query>" '{"key":"value"}'
 *
 * Output:
 *   Base64 encrypted envelope for input.payload
 */

const { encryptText } = require('./crypto-envelope');
const { loadEnv } = require('./env-loader');

const env = loadEnv();
const PASSPHRASE = env.MESH_AES_PASSPHRASE;
if (!PASSPHRASE) {
  console.error('Error: MESH_AES_PASSPHRASE is not set. Check mesh/prod-secrets.yaml.');
  process.exit(1);
}

function parseVariables(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    throw new Error('variables must be a JSON object');
  } catch (error) {
    throw new Error('Invalid variables JSON: ' + error.message);
  }
}

async function main() {
  const query = process.argv[2];
  const rawVariables = process.argv[3];

  if (!query || !query.trim()) {
    console.error('Usage: npm run encrypt:payload -- "<GraphQL query>" \'{"key":"value"}\'');
    process.exit(1);
  }

  try {
    const variables = parseVariables(rawVariables);
    const payloadObject = {
      query,
      variables
    };

    const encrypted = await encryptText(JSON.stringify(payloadObject), PASSPHRASE);
    console.log(encrypted);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
