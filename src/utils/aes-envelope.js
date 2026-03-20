/* eslint-disable */
const { getCryptoJS } = require('./load-crypto-js');

const DEFAULT_KEY_SIZE = 128;
const DEFAULT_ITERATION_COUNT = 10000;

function randomHex(bytes) {
  const CryptoJS = getCryptoJS();
  return CryptoJS.lib.WordArray.random(bytes).toString(CryptoJS.enc.Hex);
}

function generateKey(CryptoJS, saltHex, passPhrase, keySizeBits, iterationCount) {
  return CryptoJS.PBKDF2(passPhrase, CryptoJS.enc.Hex.parse(saltHex), {
    keySize: keySizeBits / 32,
    iterations: iterationCount
  });
}

function encodeEnvelope(parts) {
  return Buffer.from(parts.join('::'), 'utf8').toString('base64');
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
  const [keySizeRaw, iterationRaw, ivHex, saltHex, cipherText] = parts;
  const keySize = Number(keySizeRaw);
  const iterationCount = Number(iterationRaw);
  if (!Number.isFinite(keySize) || !Number.isFinite(iterationCount)) {
    throw new Error('Invalid envelope metadata.');
  }
  return { keySize, iterationCount, ivHex, saltHex, cipherText };
}

function encryptText(plainText, passPhrase, overrides = {}) {
  const CryptoJS = getCryptoJS();
  const keySize = overrides.keySize || DEFAULT_KEY_SIZE;
  const iterationCount = overrides.iterationCount || DEFAULT_ITERATION_COUNT;
  const ivHex = overrides.ivHex || randomHex(16);
  const saltHex = overrides.saltHex || randomHex(16);
  const key = generateKey(CryptoJS, saltHex, passPhrase, keySize, iterationCount);
  const encrypted = CryptoJS.AES.encrypt(plainText, key, {
    iv: CryptoJS.enc.Hex.parse(ivHex)
  });
  const cipherText = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  return encodeEnvelope([keySize, iterationCount, ivHex, saltHex, cipherText]);
}

function decryptText(envelope, passPhrase) {
  const CryptoJS = getCryptoJS();
  const parsed = decodeEnvelope(envelope);
  const key = generateKey(CryptoJS, parsed.saltHex, passPhrase, parsed.keySize, parsed.iterationCount);
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(parsed.cipherText)
  });
  const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
    iv: CryptoJS.enc.Hex.parse(parsed.ivHex)
  });
  const result = decrypted.toString(CryptoJS.enc.Utf8);
  if (typeof result !== 'string' || result.length === 0) {
    throw new Error('Decryption failed or produced empty plaintext.');
  }
  return result;
}

module.exports = {
  DEFAULT_KEY_SIZE,
  DEFAULT_ITERATION_COUNT,
  decodeEnvelope,
  encryptText,
  decryptText
};
