#!/usr/bin/env node

/**
 * Decrypt a value using AES-CBC decryption
 * Usage: npm run decrypt -- "encrypted-base64-envelope"
 * Output: Decrypted plaintext value
 */

const { decryptText } = require('./crypto-envelope');
const { loadEnv } = require('./env-loader');

const env = loadEnv();
const PASSPHRASE = env.MESH_AES_PASSPHRASE;
if (!PASSPHRASE) {
  console.error('Error: MESH_AES_PASSPHRASE is not set. Check mesh/prod-secrets.yaml.');
  process.exit(1);
}

async function main() {
  const encrypted = process.argv[2];
  
  if (!encrypted) {
    console.error('Usage: npm run decrypt -- "encrypted-base64-envelope"');
    process.exit(1);
  }

  try {
    const decrypted = await decryptText(encrypted, PASSPHRASE);
    console.log(decrypted);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
