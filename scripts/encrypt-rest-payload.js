#!/usr/bin/env node

/**
 * Encrypt a REST payload for use with encrypted wrapper mutations that
 * target REST (non-GraphQL) upstream sources.
 *
 * Usage:
 *   npm run encrypt:rest-payload -- '{"Leads":[{"name":"sr","mobile":"123"}]}'
 *
 * The JSON argument becomes the HTTP POST body sent to the upstream REST API.
 * Output: Base64 encrypted envelope for input.payload
 */

const { encryptText } = require('./crypto-envelope');
const { loadEnv } = require('./env-loader');

const env = loadEnv();
const PASSPHRASE = env.MESH_AES_PASSPHRASE;
if (!PASSPHRASE) {
  console.error('Error: MESH_AES_PASSPHRASE is not set. Check mesh/prod-secrets.yaml.');
  process.exit(1);
}

async function main() {
  const rawBody = process.argv[2];

  if (!rawBody || !rawBody.trim()) {
    console.error('Usage: npm run encrypt:rest-payload -- \'{"Leads":[{...}]}\'');
    console.error('  The JSON argument is the REST body sent to the upstream API.');
    process.exit(1);
  }

  let body;
  try {
    body = JSON.parse(rawBody);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('REST body must be a JSON object');
    }
  } catch (error) {
    console.error('Error: Invalid JSON body — ' + error.message);
    process.exit(1);
  }

  try {
    const payloadObject = { body };
    const encrypted = await encryptText(JSON.stringify(payloadObject), PASSPHRASE);
    console.log(encrypted);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
