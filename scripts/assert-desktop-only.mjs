import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'types'];
const banned = [
  ['next-auth', 'NextAuth'],
  ['/api/database', 'web database API'],
  ['/api/release-history', 'web release API'],
  ['@/lib/server', 'server backend import'],
  ['mysql2', 'Node MySQL driver'],
  ["from 'pg'", 'Node PostgreSQL driver'],
  ["from 'mssql'", 'Node MSSQL driver']
];

const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) files.push(target);
  }
}
roots.forEach(walk);

const failures = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const [needle, label] of banned) if (text.includes(needle)) failures.push(`${file}: ${label} (${needle})`);
}
if (fs.existsSync(path.join('src', 'app', 'api'))) failures.push('src/app/api: desktop client cannot contain Next.js API routes');
if (fs.existsSync(path.join('src', 'lib', 'server'))) failures.push('src/lib/server: desktop client cannot contain web backend services');

if (failures.length) {
  console.error('Desktop-only validation failed:\n' + failures.map(x => ' - ' + x).join('\n'));
  process.exit(1);
}
console.log(`Desktop-only validation passed (${files.length} source files).`);
