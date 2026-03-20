#!/usr/bin/env node

/**
 * Validate GitHub Actions workflow files.
 *
 * Checks:
 *   - All expected workflow files exist
 *   - Workflow files are valid YAML (basic structure check)
 *   - Required fields (name, on, jobs) are present
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows');

const EXPECTED_WORKFLOWS = [
  'deploy-production.yml',
  'deploy-stage.yml',
  'pr-checks.yml'
];

let errors = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
    errors++;
  }
}

console.log('Workflow validation\n');

check('.github/workflows/ directory exists', () => {
  if (!fs.existsSync(WORKFLOWS_DIR)) throw new Error('Directory not found: .github/workflows/');
});

for (const filename of EXPECTED_WORKFLOWS) {
  const filePath = path.join(WORKFLOWS_DIR, filename);

  check(`${filename} exists`, () => {
    if (!fs.existsSync(filePath)) throw new Error(`Workflow not found: ${filename}`);
  });

  if (fs.existsSync(filePath)) {
    check(`${filename} has required fields`, () => {
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.includes('name:')) throw new Error('Missing "name:" field');
      if (!content.includes('on:')) throw new Error('Missing "on:" trigger');
      if (!content.includes('jobs:')) throw new Error('Missing "jobs:" section');
    });

    check(`${filename} has no syntax errors (basic)`, () => {
      const content = fs.readFileSync(filePath, 'utf8');
      // Check for common YAML issues
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('\t')) {
          throw new Error(`Tab character found on line ${i + 1} (YAML requires spaces)`);
        }
      }
    });
  }
}

console.log('');
if (errors > 0) {
  console.error(`${errors} validation error(s) found.`);
  process.exit(1);
} else {
  console.log('All checks passed.');
}
