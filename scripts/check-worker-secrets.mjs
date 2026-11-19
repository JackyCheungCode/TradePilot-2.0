import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('worker/src');
const findings = [];
const patterns = [
  ['API key literal', /(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*['"][A-Za-z0-9_./+=-]{24,}['"]/i],
  ['Bearer token literal', /Bearer\s+[A-Za-z0-9._-]{24,}/i],
  ['JWT literal', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./],
  ['Google API key literal', /AIza[0-9A-Za-z_-]{20,}/],
  ['OpenAI-style key literal', /sk-[A-Za-z0-9]{20,}/],
];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(file);
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    const source = await readFile(file, 'utf8');
    for (const [label, pattern] of patterns) {
      if (pattern.test(source)) findings.push(path.relative(process.cwd(), file) + ': possible ' + label);
    }
  }
}

await scan(root);
if (findings.length) {
  console.error('Potential secrets found in Worker source:');
  for (const finding of findings) console.error(' - ' + finding);
  process.exit(1);
}
console.log('Worker source secret scan passed.');
