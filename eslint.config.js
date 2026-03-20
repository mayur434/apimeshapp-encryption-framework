const { FlatCompat } = require('@eslint/eslintrc');
const path = require('path');

const compat = new FlatCompat({
  baseDirectory: __dirname
});

module.exports = [
  ...compat.extends('./.eslintrc.json'),
  {
    ignores: [
      'node_modules/**',
      '.mesh/**',
      '.wrangler/**',
      'mesh-artifact/**',
      'tempfiles/**',
      'testMesh/**'
    ]
  }
];
