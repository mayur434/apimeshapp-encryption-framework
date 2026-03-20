#!/usr/bin/env node

/**
 * Decrypt an encrypted response payload from API Mesh.
 *
 * Usage:
 *   npm run decrypt:response -- "<encrypted-envelope>"
 *   npm run decrypt:response -- '{"encrypted":true,"operationName":"...","payload":"<envelope>"}'
 *
 * Output:
 *   Decrypted JSON response from the upstream source
 */

const { decryptText } = require('./crypto-envelope');
const { loadEnv } = require('./env-loader');

const env = loadEnv();
const PASSPHRASE = env.MESH_AES_PASSPHRASE;
if (!PASSPHRASE) {
  console.error('Error: MESH_AES_PASSPHRASE is not set. Check mesh/prod-secrets.yaml.');
  process.exit(1);
}

function extractPayload(raw) {
  try {
    const parsed = JSON.parse(raw);
    // Full mesh response: { data: { encryptedX: { encrypted, payload } } }
    if (parsed.data) {
      const fields = Object.values(parsed.data);
      for (const field of fields) {
        if (field && field.encrypted && typeof field.payload === 'string') {
          return field.payload;
        }
      }
    }
    // Direct result object: { encrypted, payload }
    if (parsed.encrypted && typeof parsed.payload === 'string') {
      return parsed.payload;
    }
  } catch (_) {
    // Not JSON — treat as raw envelope string
  }
  return raw;
}

async function main() {
  const input = process.argv[2];

  if (!input || !input.trim()) {
    console.error('Usage: npm run decrypt:response -- "<encrypted-envelope-or-json>"');
    process.exit(1);
  }

  try {
    const envelope = extractPayload(input);
    const decrypted = await decryptText(envelope, PASSPHRASE);

    // Pretty-print if the decrypted value is JSON
    try {
      const json = JSON.parse(decrypted);
      console.log(JSON.stringify(json, null, 2));
    } catch (_) {
      console.log(decrypted);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
