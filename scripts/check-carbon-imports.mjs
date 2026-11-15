import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = path.resolve('src');
const allowedRoot = path.resolve('src/design-system');
const violations = [];
const packageImport = /(?:from\s*|import\s*|@use\s*|@forward\s*)['"](?:@carbon\/(?:react|icons-react)|@fontsource\/)[^'"]*['"]/g;
const forbiddenStyleProperty = /(?:^|[;{\s])(?:color|background(?:-color)?|font-family|font-size|font-weight|line-height|letter-spacing|box-shadow|border-radius|z-index)\s*:/im;
const literalColor = /#(?:[0-9a-f]{3,8})\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/i;

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(fullPath);
      continue;
    }
    if (!/\.[cm]?[jt]sx?$|\.s[ac]ss$|\.css$/.test(entry.name)) continue;
    if (fullPath.startsWith(allowedRoot + path.sep)) continue;

    const source = await readFile(fullPath, 'utf8');
    const relative = path.relative(process.cwd(), fullPath);

    if (packageImport.test(source)) {
      violations.push(`${relative}: direct Carbon/font package import is forbidden`);
    }
    packageImport.lastIndex = 0;

    if (/\.s[ac]ss$|\.css$/.test(entry.name)) {
      if (forbiddenStyleProperty.test(source) || literalColor.test(source)) {
        violations.push(`${relative}: visual styles must use the local design-system tokens`);
      }
    }

    if (/\.tsx?$/.test(entry.name) && /style\s*=\s*\{\s*\{/.test(source)) {
      violations.push(`${relative}: inline visual styles are forbidden; use design-system tokens`);
    }
  }
}

await scan(sourceRoot);
if (violations.length) {
  console.error('Design-system boundary violations:');
  for (const violation of violations) console.error(' - ' + violation);
  process.exit(1);
}
console.log('Design-system boundary passed.');
