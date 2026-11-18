import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = path.resolve('src');
const allowedRoot = path.resolve('src/design-system');
const violations = [];
const forbiddenPackages = /(?:from\\s*|import\\s*|@use\\s*|@forward\\s*|@import\\s*)['"](?:@carbon\\/(?:react|icons-react|pictograms-react)|@fontsource[^'"]*|lucide-react|react-icons(?:\\/[^'"]*)?|@fortawesome\\/|@tabler\\/)[^'"]*['"]/g;
const cssDeclaration = /(?:^|[;{}\\s])[-a-zA-Z]+\\s*:\\s*[^;{}]+;/m;
const nativeSelectElement = /<(?:select|option|datalist)\\b|<input\\b[^>]*\\blist\\s*=/is;

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(fullPath);
      continue;
    }
    if (!/\\.[cm]?[jt]sx?$|\\.s[ac]ss$|\\.css$/.test(entry.name)) continue;
    if (fullPath.startsWith(allowedRoot + path.sep)) continue;

    const source = await readFile(fullPath, 'utf8');
    const relative = path.relative(process.cwd(), fullPath);

    if (forbiddenPackages.test(source)) {
      violations.push(relative + ': import UI, icon, and font packages through src/design-system only');
    }
    forbiddenPackages.lastIndex = 0;

    if (/\\.tsx?$/.test(entry.name) && nativeSelectElement.test(source)) {
      violations.push(relative + ': native <select>/<option> elements are forbidden; use Carbon Dropdown, ComboBox, or MultiSelect; browser datalists are also forbidden');
    }

    if (/\\.s[ac]ss$|\\.css$/.test(entry.name)) {
      const withoutComments = source.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '');
      if (cssDeclaration.test(withoutComments)) {
        violations.push(relative + ': feature-owned CSS declarations are forbidden; compose Carbon and design-system resources');
      }
    }

    if (/\\.tsx?$/.test(entry.name) && /\\bstyle\\s*=/.test(source)) {
      violations.push(relative + ': inline styles are forbidden; use Carbon components and design-system tokens');
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
