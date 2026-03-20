/* eslint-disable */
const registry = require('../config/encryption-registry');

function getRegistryByWrapperField(fieldName) {
  return registry.find((item) => item.wrapperField === fieldName) || null;
}

function extractPrimaryFieldName(payload) {
  const body = payload?.context?.body;
  const queryText = body?.query || payload?.params?.query || '';
  const match = queryText.match(/\b(query|mutation)\b[\s\S]*?\{\s*([A-Za-z_][A-Za-z0-9_]*)/);
  return match ? match[2] : null;
}

function getJsonAtPath(input, pathArray = []) {
  let current = input;
  for (const part of pathArray) {
    if (current == null) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

module.exports = {
  registry,
  getRegistryByWrapperField,
  extractPrimaryFieldName,
  getJsonAtPath
};
