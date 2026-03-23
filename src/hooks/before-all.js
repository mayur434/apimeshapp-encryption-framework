/**
 * Before-All Hook
 *
 * Validates incoming requests for any encrypted wrapper field defined in the
 * registry. Source-agnostic — all sources registered in encryption-registry.js
 * are protected uniformly. No crypto operations happen here; only structural
 * envelope validation to reject malformed requests early.
 */

// Registry is inlined here (mesh linter does not allow require/import).
// Keep this in sync with src/config/encryption-registry.js.
const registry = [
  {
    wrapperField: 'encryptedCreateCustomer',
    requestMode: 'encrypted',
    responseEncryption: 'always'
  },
  {
    wrapperField: 'encryptedGenerateCustomerToken',
    requestMode: 'encrypted',
    responseEncryption: 'always'
  },
  {
    wrapperField: 'encryptedCreateLead',
    requestMode: 'encrypted',
    responseEncryption: 'always'
  }
];

function getRegistryByWrapperField(fieldName) {
  return registry.find((item) => item.wrapperField === fieldName) || null;
}

function extractPrimaryFieldName(payload) {
  const body = payload && payload.context && payload.context.body;
  const queryText = (body && body.query) || (payload && payload.params && payload.params.query) || '';
  const match = queryText.match(/\b(query|mutation)\b[\s\S]*?\{\s*([A-Za-z_][A-Za-z0-9_]*)/);
  return match ? match[2] : null;
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
  if (!Number.isFinite(keySize) || !Number.isFinite(iterationCount)) {
    throw new Error('Invalid envelope metadata.');
  }
}

function getInput(payload) {
  return payload && payload.context && payload.context.body && payload.context.body.variables
    ? payload.context.body.variables.input
    : null;
}

function beforeAll(payload) {
  try {
    const fieldName = extractPrimaryFieldName(payload);
    const registration = fieldName ? getRegistryByWrapperField(fieldName) : null;

    if (!registration) {
      return { status: 'SUCCESS', message: 'Request is not using an encrypted wrapper field.' };
    }

    const input = getInput(payload);
    if (!input || typeof input !== 'object') {
      return { status: 'ERROR', message: 'Missing input for the requested operation.' };
    }

    if (typeof input.payload !== 'string' || !input.payload.trim()) {
      return { status: 'ERROR', message: 'Missing payload for the requested operation.' };
    }

    if (registration.requestMode === 'encrypted-only' && !input.encrypted) {
      return { status: 'ERROR', message: 'This operation requires an encrypted request.' };
    }

    if (!input.encrypted) {
      try {
        JSON.parse(input.payload);
        return {
          status: 'SUCCESS',
          message: 'Plain wrapper request validated. Response policy is ' + (registration.responseEncryption || 'mirror-request') + '.'
        };
      } catch (_error) {
        return { status: 'ERROR', message: 'The provided payload is not valid JSON.' };
      }
    }

    try {
      decodeEnvelope(input.payload);
      return {
        status: 'SUCCESS',
        message: 'Encrypted request validated. Response policy is ' + (registration.responseEncryption || 'mirror-request') + '.'
      };
    } catch (envelopeErr) {
      console.error('[before-all] envelope_validation_failed error=' + envelopeErr.message);
      return { status: 'ERROR', message: 'The encrypted payload format is invalid.' };
    }
  } catch (err) {
    console.error('[before-all] unexpected_error error=' + err.message);
    return { status: 'ERROR', message: 'Request validation failed. Please try again later.' };
  }
}

module.exports = { beforeAll };
