#!/usr/bin/env node

/**
 * Encrypt a value using AES-CBC encryption
 * Usage: npm run encrypt -- "your plaintext value"
 * Output: Base64-encoded encrypted envelope
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
  const plainText = process.argv[2];
  
  if (!plainText) {
    console.error('Usage: npm run encrypt -- "your plaintext value"');
    process.exit(1);
  }

  try {
    const encrypted = await encryptText(plainText, PASSPHRASE);
    console.log(encrypted);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
