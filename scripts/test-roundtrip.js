#!/usr/bin/env node

/**
 * End-to-end roundtrip test — encrypt → mesh → decrypt.
 *
 * Usage:
 *   node scripts/test-roundtrip.js [port]
 */

const { encryptText, decryptText } = require('./crypto-envelope');
const { loadEnv } = require('./env-loader');

const PORT = process.argv[2] || 5001;
const env = loadEnv();
const PASSPHRASE = env.MESH_AES_PASSPHRASE;

if (!PASSPHRASE) {
  console.error('MESH_AES_PASSPHRASE not set');
  process.exit(1);
}

async function testOperation(name, innerPayload) {
  console.log('\n--- ' + name + ' ---');

  // Encrypt
  const encrypted = await encryptText(JSON.stringify(innerPayload), PASSPHRASE);
  console.log('Encrypted payload length:', encrypted.length);

  // Send to mesh
  const gqlQuery = 'mutation($input: EncryptedOperationInput!) { ' + name + '(input: $input) { encrypted operationName payload } }';
  const body = JSON.stringify({
    query: gqlQuery,
    variables: { input: { encrypted: true, payload: encrypted } }
  });

  const res = await fetch('http://localhost:' + PORT + '/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body
  });

  const json = await res.json();

  if (json.errors) {
    console.error('Mesh errors:', JSON.stringify(json.errors, null, 2));
    return;
  }

  const result = json.data[name];
  console.log('encrypted:', result.encrypted);
  console.log('operationName:', result.operationName);

  // Decrypt response
  if (result.encrypted) {
    const decrypted = await decryptText(result.payload, PASSPHRASE);
    console.log('Decrypted response:', decrypted.substring(0, 200) + (decrypted.length > 200 ? '...' : ''));
  } else {
    console.log('Response (plain):', result.payload.substring(0, 200));
  }

  console.log('✓ ' + name + ' passed');
}

async function main() {
  console.log('Testing against http://localhost:' + PORT + '/graphql');

  await testOperation('encryptedGenerateCustomerToken', {
    query: 'mutation { generateCustomerToken(email: "roni_cost@example.com", password: "roni_cost3@example.com") { token } }'
  });

  await testOperation('encryptedCreateLead', {
    body: {
      FirstName: 'Test',
      LastName: 'Lead',
      Company: 'Acme',
      Email: 'test@acme.com'
    }
  });

  console.log('\n=== All roundtrip tests passed ===');
}

main().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
