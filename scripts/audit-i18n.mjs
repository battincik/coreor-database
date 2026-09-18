import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'src');
const trPath = join(src, 'locales', 'tr.json');

function flatten(value, output = []) {
  for (const child of Object.values(value)) {
    if (typeof child === 'string') output.push(child.replace(/\s+/g, ' ').trim());
    else if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, output);
  }
  return output;
}

async function walk(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'locales') await walk(path, output);
      continue;
    }
    if (['.ts', '.tsx'].includes(extname(entry.name))) output.push(path);
  }
  return output;
}

const tr = JSON.parse(await readFile(trPath, 'utf8'));
const catalogValues = new Set(flatten(tr));
const files = await walk(src);
const missing = new Map();

function add(path, value) {
  const normalized = value.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized || catalogValues.has(normalized)) return;
  const values = missing.get(path) ?? new Set();
  values.add(normalized);
  missing.set(path, values);
}

for (const path of files) {
  const source = await readFile(path, 'utf8');

  // Static quoted/template strings containing Turkish-specific characters.
  for (const match of source.matchAll(/(['"`])([^\n]*?[çğıöşüÇĞİÖŞÜ][^\n]*?)\1/g)) {
    const value = match[2];
    if (/className=|console\.|data-testid|regex|RegExp/.test(value)) continue;
    if (value.includes('${')) continue; // Dynamic strings are reviewed through semantic t(...) calls.
    add(path, value);
  }

  // Plain JSX text, including Turkish text without Turkish-specific characters.
  for (const match of source.matchAll(/>([^<>{}\n]{2,160})</g)) {
    const value = match[1].trim();
    if (!/[A-Za-zçğıöşüÇĞİÖŞÜ]/.test(value)) continue;
    if (/^[A-Z0-9_./:+ -]+$/.test(value) && !/[a-zçğıöşü]/.test(value)) continue;
    add(path, value);
  }
}

if (missing.size) {
  console.error('\nKatalog dışında kullanıcıya görünebilecek Türkçe UI metinleri bulundu:\n');
  for (const [path, values] of missing) {
    console.error(relative(root, path));
    for (const value of values) console.error(`  - ${value}`);
  }
  console.error('\nMetni tr.json/en.json kataloglarına ekleyin veya componentte t(...) kullanın.');
  process.exit(1);
}

console.log(`✓ ${files.length} TypeScript/TSX dosyasında katalogsuz statik Türkçe UI metni bulunmadı.`);
