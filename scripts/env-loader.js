const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

/**
 * Parse secrets from mesh/prod-secrets.yaml (or mesh/stage-secrets.yaml) and merge
 * with shell environment. Shell environment variables take precedence.
 *
 * @param {string} [environment] - 'prod' or 'stage' (default: 'prod')
 * @returns {Object} merged key-value env map
 */
function loadEnv(environment) {
  const env = environment || 'prod';
  const primaryPath = path.join(rootDir, 'mesh', `${env}-secrets.yaml`);
  const fallbackPath = path.join(rootDir, 'mesh', 'prod-secrets.yaml');
  const secretsPath = fs.existsSync(primaryPath) ? primaryPath : fallbackPath;
  const fileEnv = {};

  if (fs.existsSync(secretsPath)) {
    const lines = fs.readFileSync(secretsPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx < 0) continue;
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      fileEnv[key] = value;
    }
  }

  // Shell env takes precedence over secrets file
  return Object.assign({}, fileEnv, process.env);
}

module.exports = { loadEnv };
