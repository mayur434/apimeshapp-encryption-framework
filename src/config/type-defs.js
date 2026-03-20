/* eslint-disable */
const registry = require('./encryption-registry');

function buildAdditionalTypeDefs() {
  const wrapperInput = [
    'input EncryptedOperationInput {',
    '  encrypted: Boolean!',
    '  payload: String!',
    '}',
    'type EncryptedOperationResult {',
    '  encrypted: Boolean!',
    '  operationName: String!',
    '  payload: String!',
    '}'
  ].join('\n');

  const groups = { Query: [], Mutation: [] };
  for (const item of registry) {
    groups[item.operationType].push(`  ${item.wrapperField}(input: EncryptedOperationInput!): EncryptedOperationResult!`);
  }

  const queryType = groups.Query.length ? `type Query {\n${groups.Query.join('\n')}\n}` : '';
  const mutationType = groups.Mutation.length ? `type Mutation {\n${groups.Mutation.join('\n')}\n}` : '';

  return [wrapperInput, queryType, mutationType].filter(Boolean).join('\n\n');
}

module.exports = { buildAdditionalTypeDefs };
