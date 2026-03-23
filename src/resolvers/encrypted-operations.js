/**
 * Encrypted Operations Resolver
 *
 * Source-agnostic encrypted wrapper resolver. Any GraphQL source registered
 * in the registry (encryption-registry.js) is handled here automatically.
 * To add a new source, only the registry needs to be updated.
 *
 * Constants below use mustache-style placeholder syntax. They are replaced with real
 * values from secrets.yaml at build time by scripts/build-mesh.js.
 * The built artifact (mesh/mesh.json) contains no placeholders.
 */

const DEFAULT_PASS_PHRASE = '{{MESH_AES_PASSPHRASE}}';
const DEFAULT_KEY_SIZE = 128;
const DEFAULT_ITERATION_COUNT = 10000;

// Registry is inlined here (mesh linter does not allow require/import).
// Keep this in sync with src/config/encryption-registry.js.
const COMMERCE_ENDPOINT = '{{COMMERCE_GRAPHQL_ENDPOINT}}';
const COMMERCE_HOST = '{{ALLOWED_COMMERCE_HOSTS}}';
const SFDC_ENDPOINT = '{{SFDC_ENDPOINT}}';
const SFDC_HOST = '{{ALLOWED_SFDC_HOSTS}}';

// Registry: maps each wrapper field to its upstream source.
// The client supplies the full GraphQL query inside the payload.
const registry = [
  {
    wrapperField: 'encryptedCreateCustomer',
    operationType: 'Mutation',
    requestMode: 'encrypted',
    responseEncryption: 'always',
    source: { endpoint: COMMERCE_ENDPOINT, allowedHosts: COMMERCE_HOST }
  },
  {
    wrapperField: 'encryptedGenerateCustomerToken',
    operationType: 'Mutation',
    requestMode: 'encrypted',
    responseEncryption: 'always',
    source: { endpoint: COMMERCE_ENDPOINT, allowedHosts: COMMERCE_HOST }
  },
  {
    wrapperField: 'encryptedCreateLead',
    operationType: 'Mutation',
    requestMode: 'encrypted',
    responseEncryption: 'always',
    source: { endpoint: SFDC_ENDPOINT, allowedHosts: SFDC_HOST }
  }
];

function getRegistryByWrapperField(fieldName) {
  return registry.find((item) => item.wrapperField === fieldName) || null;
}

function assertAllowedHost(endpoint, allowedHostsCsv) {
  const url = new URL(endpoint);
  const allowedHosts = String(allowedHostsCsv || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (allowedHosts.length > 0 && !allowedHosts.includes(url.host)) {
    throw new Error('Source endpoint host is not allowed: ' + url.host);
  }
  return url.toString();
}

async function executeSourceGraphQL(input) {
  const fetchFn = input.fetchImpl || (typeof globalThis !== 'undefined' && globalThis.fetch) || (typeof global !== 'undefined' && global.fetch);
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch is not available in this runtime.');
  }
  const safeEndpoint = assertAllowedHost(input.endpoint, input.allowedHosts);
  const startTime = Date.now();
  const response = await fetchFn(safeEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: input.document, variables: input.variables })
  });
  const json = await response.json();
  var duration = Date.now() - startTime;
  console.log('[encrypted-ops] upstream_call status=' + response.status + ' ok=' + response.ok + ' duration=' + duration + 'ms' + (json.errors ? ' errors=' + json.errors.length : ''));
  return { ok: response.ok, status: response.status, json };
}

function toBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(base64) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(byteCount) {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function deriveAesKey(passPhrase, saltHex, keySizeBits, iterationCount) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(passPhrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hexToBytes(saltHex),
      iterations: iterationCount
    },
    keyMaterial,
    { name: 'AES-CBC', length: keySizeBits },
    false,
    ['encrypt', 'decrypt']
  );
}

function decodeEnvelope(envelope) {
  if (typeof envelope !== 'string' || !envelope.trim()) {
    throw new Error('Encrypted payload must be a non-empty string.');
  }
  const decoded = typeof Buffer !== 'undefined'
    ? Buffer.from(envelope, 'base64').toString('utf8')
    : new TextDecoder().decode(fromBase64(envelope));
  const parts = decoded.split('::');
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted payload format. Expected 5 envelope sections.');
  }
  const keySize = Number(parts[0]);
  const iterationCount = Number(parts[1]);
  const ivHex = parts[2];
  const saltHex = parts[3];
  const cipherText = parts[4];

  if (!Number.isFinite(keySize) || !Number.isFinite(iterationCount)) {
    throw new Error('Invalid envelope metadata.');
  }
  if (ivHex.length !== 32 || saltHex.length !== 32) {
    throw new Error('Invalid IV or salt length in envelope.');
  }
  if (!cipherText || typeof cipherText !== 'string') {
    throw new Error('Missing cipher text in envelope.');
  }
  return { keySize, iterationCount, ivHex, saltHex, cipherText };
}

async function encryptText(plainText, passPhrase, overrides) {
  const config = overrides || {};
  const keySize = config.keySize || DEFAULT_KEY_SIZE;
  const iterationCount = config.iterationCount || DEFAULT_ITERATION_COUNT;
  const ivHex = config.ivHex || randomHex(16);
  const saltHex = config.saltHex || randomHex(16);
  const key = await deriveAesKey(passPhrase, saltHex, keySize, iterationCount);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: hexToBytes(ivHex) },
    key,
    new TextEncoder().encode(plainText)
  );
  const cipherText = toBase64(new Uint8Array(encrypted));
  return toBase64(new TextEncoder().encode([keySize, iterationCount, ivHex, saltHex, cipherText].join('::')));
}

async function decryptText(envelope, passPhrase) {
  const parsed = decodeEnvelope(envelope);
  const key = await deriveAesKey(passPhrase, parsed.saltHex, parsed.keySize, parsed.iterationCount);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: hexToBytes(parsed.ivHex) },
    key,
    fromBase64(parsed.cipherText)
  );
  const result = new TextDecoder().decode(new Uint8Array(decrypted));
  if (typeof result !== 'string' || result.length === 0) {
    throw new Error('Decryption failed or produced empty plaintext.');
  }
  return result;
}

async function parseWrapperPayload(input, passPhrase) {
  var decryptStart = Date.now();
  const plainText = input.encrypted ? await decryptText(input.payload, passPhrase) : input.payload;
  console.log('[encrypted-ops] request_decrypt encrypted=' + input.encrypted + ' payload_size=' + (input.payload ? input.payload.length : 0) + ' duration=' + (Date.now() - decryptStart) + 'ms');
  let parsed;
  try {
    parsed = JSON.parse(plainText);
  } catch (error) {
    throw new Error('Wrapper payload is not valid JSON: ' + error.message);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Wrapper payload must decode to a JSON object.');
  }
  if (!parsed.query || typeof parsed.query !== 'string' || !parsed.query.trim()) {
    throw new Error('Wrapper payload must contain a "query" field with the GraphQL document.');
  }
  return parsed;
}

function shouldEncryptResponse(registration, input) {
  if (registration.responseEncryption === 'always') return true;
  if (registration.responseEncryption === 'never') return false;
  return Boolean(input.encrypted);
}

async function resolveEncryptedOperation(fieldName, args, context) {
  var resolveStart = Date.now();
  console.log('[encrypted-ops] resolve_start field=' + fieldName);

  try {
    const registration = getRegistryByWrapperField(fieldName);
    if (!registration) {
      console.error('[encrypted-ops] error field=' + fieldName + ' reason=no_registration');
      throw new Error('The requested operation is not available.');
    }

    const passPhrase = DEFAULT_PASS_PHRASE;

    // Endpoint and allowed hosts come from the registry entry — each source is self-contained.
    const endpoint = registration.source && registration.source.endpoint;
    const allowedHosts = registration.source && registration.source.allowedHosts;
    if (!endpoint) {
      console.error('[encrypted-ops] error field=' + fieldName + ' reason=no_endpoint');
      throw new Error('The requested operation is not available.');
    }

    const input = (args && args.input) || {};

    var wrapperPayload;
    try {
      wrapperPayload = await parseWrapperPayload(input, passPhrase);
    } catch (decryptErr) {
      console.error('[encrypted-ops] error field=' + fieldName + ' stage=decrypt reason=' + decryptErr.message);
      throw new Error('Failed to process the encrypted request. Please verify the payload and try again.');
    }

    var sourceResult;
    try {
      // query and variables come from the client payload — no hardcoded document.
      sourceResult = await executeSourceGraphQL({
        endpoint,
        allowedHosts,
        document: wrapperPayload.query,
        variables: wrapperPayload.variables || {},
        fetchImpl: (context && context.fetch) || (typeof globalThis !== 'undefined' && globalThis.fetch) || (typeof global !== 'undefined' && global.fetch)
      });
    } catch (upstreamErr) {
      console.error('[encrypted-ops] error field=' + fieldName + ' stage=upstream reason=' + upstreamErr.message);
      throw new Error('The upstream service is currently unavailable. Please try again later.');
    }

    // Return the full upstream response — client controls the query so they know the shape.
    const responsePayload = JSON.stringify(sourceResult.json);
    const encryptResponse = shouldEncryptResponse(registration, input);
    var encryptStart = Date.now();
    var encryptedPayload;
    try {
      encryptedPayload = encryptResponse ? await encryptText(responsePayload, passPhrase) : responsePayload;
    } catch (encryptErr) {
      console.error('[encrypted-ops] error field=' + fieldName + ' stage=response_encrypt reason=' + encryptErr.message);
      throw new Error('Failed to process the response. Please try again later.');
    }
    var encryptDuration = Date.now() - encryptStart;
    var totalDuration = Date.now() - resolveStart;
    console.log('[encrypted-ops] response_encrypt encrypted=' + encryptResponse + ' payload_size=' + responsePayload.length + ' duration=' + encryptDuration + 'ms');
    console.log('[encrypted-ops] resolve_end field=' + fieldName + ' upstream_status=' + sourceResult.status + ' response_encrypted=' + encryptResponse + ' total_duration=' + totalDuration + 'ms' + (sourceResult.json.errors ? ' has_errors=true' : ''));
    return {
      encrypted: encryptResponse,
      operationName: fieldName,
      payload: encryptedPayload
    };
  } catch (err) {
    var totalDuration = Date.now() - resolveStart;
    console.error('[encrypted-ops] resolve_failed field=' + fieldName + ' total_duration=' + totalDuration + 'ms error=' + err.message);
    throw err;
  }
}

function buildTypeResolvers(typeName) {
  const result = {};
  for (const item of registry) {
    if (item.operationType === typeName) {
      result[item.wrapperField] = {
        resolve: (_root, args, context, info) => resolveEncryptedOperation(info.fieldName, args, context)
      };
    }
  }
  return result;
}

module.exports = {
  resolvers: {
    Query: buildTypeResolvers('Query'),
    Mutation: buildTypeResolvers('Mutation')
  }
};
