import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'wrangler.jsonc',
  'wrangler.preview.jsonc',
  'wrangler.prospect-preview.jsonc',
  'cloudflare.config.ts',
  '.github/workflows/deploy.yml',
];

const forbiddenValues = [
  'nlklnkkcwapwerkahoyb',
  'sb_publishable_9jPg2Sv0VmMho3vOvxU00Q_-kWg8xw_',
  'ea4e98dce9c478d7dd5c07f10e5c722d',
  'tradepilot-skill-artifacts',
];

const failures = [];
const contents = new Map();

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    failures.push(file + ': required standalone configuration file is missing');
    continue;
  }
  const content = readFileSync(file, 'utf8');
  contents.set(file, content);
  for (const value of forbiddenValues) {
    if (content.includes(value)) failures.push(file + ': contains a source-installation identifier');
  }
}

for (const file of [
  '.github/workflows/deploy-inbox-preview.yml',
  '.github/workflows/deploy-prospect-preview.yml',
]) {
  if (existsSync(file)) failures.push(file + ': source-account preview deployment workflow must be removed');
}

const deploy = contents.get('.github/workflows/deploy.yml') ?? '';
if (!deploy.includes('workflow_dispatch:')) failures.push('deploy.yml: deployment must be manual-only');
if (!deploy.includes("inputs.release_confirmation == 'approved'")) failures.push('deploy.yml: explicit approval gate is missing');
if (deploy.includes('\n  push:')) failures.push('deploy.yml: automatic push deployment is not allowed');
if (!deploy.includes('secrets.CLOUDFLARE_ACCOUNT_ID')) failures.push('deploy.yml: operator Cloudflare account secret is not used');

if (failures.length) {
  console.error('Standalone isolation check failed:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('Standalone isolation check passed.');
