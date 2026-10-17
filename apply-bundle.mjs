// apply-bundle.mjs
import fs from 'node:fs';
import path from 'node:path';

const bundleFile = process.argv[2] || 'vision-upgrade.bundle';
const raw = fs.readFileSync(bundleFile, 'utf8');

const fileRegex = /^================\r?\nFile:\s*(.+?)\r?\n================\r?\n([\s\S]*?)(?=^================\r?\nFile:|\z)/gm;

let count = 0;
const parts = raw.split(/^================\r?\nFile:\s*/m).slice(1);

for (const part of parts) {
    const [headerLine, ...rest] = part.split(/\r?\n================\r?\n/);
    const filePath = headerLine.trim();
    const content = rest.join('\n================\n').replace(/\r?\n$/, '');
    const fullPath = path.resolve(process.cwd(), filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content + '\n', 'utf8');
    console.log(`✓ Updated: ${filePath}`);
    count++;
}
console.log(`\nSuccessfully applied ${count} files from ${bundleFile}!`);