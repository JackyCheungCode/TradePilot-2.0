import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = path.resolve('src');
const allowedRoot = path.resolve('src/design-system');
const forbidden = /(?:from\s*|@use\s*|@forward\s*)['"]@carbon\/(?:react|icons-react)['"]/g;
const violations = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(fullPath);
      continue;
    }
    if (!/\.[cm]?[jt]sx?$|\.s[ac]ss$/.test(entry.name)) continue;
    if (fullPath.startsWith(allowedRoot + path.sep)) continue;
    const source = await readFile(fullPath, 'utf8');
    if (forbidden.test(source)) violations.push(path.relative(process.cwd(), fullPath));
    forbidden.lastIndex = 0;
  }
}

await scan(sourceRoot);
if (violations.length) {
  console.error('Carbon imports must go through src/design-system:');
  for (const file of violations) console.error(' - ' + file);
  process.exit(1);
}
console.log('Carbon import boundary passed.');
