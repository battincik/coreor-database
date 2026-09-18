import fs from 'node:fs';

const required = [
  ['package-lock.json', 'npm'],
  ['src-tauri/Cargo.lock', 'Cargo']
];

const missing = required.filter(([file]) => !fs.existsSync(file));
if (missing.length) {
  console.error('Deterministik build için lockfile eksik:');
  for (const [file, tool] of missing) console.error(` - ${file} (${tool})`);
  console.error('\nÜretmek için: npm run locks:generate');
  process.exit(1);
}

console.log('Lockfile doğrulaması geçti.');
