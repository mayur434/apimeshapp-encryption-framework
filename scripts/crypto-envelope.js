const { webcrypto: crypto } = require('crypto');

const DEFAULT_KEY_SIZE = 128;
const DEFAULT_ITERATION_COUNT = 10000;

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('Invalid hex value.');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
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
  const decoded = Buffer.from(envelope, 'base64').toString('utf8');
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

module.exports = {
  encryptText,
  decryptText,
  decodeEnvelope,
  DEFAULT_KEY_SIZE,
  DEFAULT_ITERATION_COUNT
};
