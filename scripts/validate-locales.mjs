import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const localeDirectory = join(root, 'src', 'locales');
const requiredLocales = ['tr', 'en'];
const placeholderPattern = /\{([A-Za-z0-9_]+)\}/g;
const sqlKeywordKeys = {
  'sql.keyword.select': 'SELECT',
  'sql.keyword.insert': 'INSERT',
  'sql.keyword.update': 'UPDATE',
  'sql.keyword.delete': 'DELETE',
  'sql.keyword.create': 'CREATE',
  'sql.keyword.alter': 'ALTER',
  'sql.keyword.drop': 'DROP',
  'sql.keyword.truncate': 'TRUNCATE'
};

async function readJson(path) {
  const raw = await readFile(path, 'utf8');
  const value = JSON.parse(raw);
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${path} root must be a JSON object.`);
  return value;
}
function flatten(value, prefix = '', output = {}) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') output[path] = child;
    else if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, output);
    else throw new Error(`${path}: locale values must be strings or nested objects.`);
  }
  return output;
}
function placeholders(value) {
  return [...String(value).matchAll(placeholderPattern)].map(match => match[1]).sort();
}

const localeFiles = (await readdir(localeDirectory)).filter(name => name.endsWith('.json')).sort();
const dictionaries = new Map();
const legacyLocales = [];
for (const file of localeFiles) {
  const code = file.slice(0, -5);
  const raw = await readJson(join(localeDirectory, file));
  if (!raw.meta || typeof raw.meta.nativeName !== 'string' || !['ltr', 'rtl'].includes(raw.meta.direction)) {
    legacyLocales.push(code);
    continue;
  }
  dictionaries.set(code, flatten(raw));
}

const supportedLocales = [...dictionaries.keys()];
const problems = [];
for (const code of requiredLocales) if (!dictionaries.has(code)) problems.push(`${code}: required modern locale is missing.`);
const reference = dictionaries.get('en') || {};
const turkish = dictionaries.get('tr') || {};
const referenceKeys = Object.keys(reference).sort();

for (const code of requiredLocales) {
  const dictionary = dictionaries.get(code) || {};
  const missing = referenceKeys.filter(key => !(key in dictionary));
  const extra = Object.keys(dictionary).filter(key => !(key in reference));
  if (missing.length) problems.push(`${code}: missing keys: ${missing.join(', ')}`);
  if (extra.length) problems.push(`${code}: keys not present in English source: ${extra.join(', ')}`);
}
for (const [code, dictionary] of dictionaries) {
  for (const key of referenceKeys) {
    const value = dictionary[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !value.trim()) {
      problems.push(`${code}: ${key} is empty or not a string.`);
      continue;
    }
    if (placeholders(reference[key]).join('|') !== placeholders(value).join('|')) {
      problems.push(`${code}: ${key} placeholders do not match English source.`);
    }
  }
  if (!['ltr', 'rtl'].includes(dictionary['meta.direction'])) problems.push(`${code}: meta.direction must be ltr or rtl.`);
  if (!dictionary['meta.nativeName']?.trim()) problems.push(`${code}: meta.nativeName is required.`);
}
if (Object.keys(turkish).length !== referenceKeys.length) {
  problems.push(`tr/en source packages must have identical key counts. tr=${Object.keys(turkish).length}, en=${referenceKeys.length}`);
}
for (const [key, keyword] of Object.entries(sqlKeywordKeys)) {
  for (const [code, dictionary] of dictionaries) {
    const value = dictionary[key];
    if (value !== undefined && value !== keyword) problems.push(`${code}: ${key} must remain SQL keyword ${keyword}.`);
  }
}
if (dictionaries.get('ar')?.['meta.direction'] !== 'rtl') problems.push('ar: Arabic locale must be rtl.');

if (problems.length) {
  console.error(`\nLocale validation failed (${problems.length} issue(s)):\n`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`✓ ${supportedLocales.length} modern JSON locale(s) discovered automatically.`);
console.log(`✓ Turkish and English source packages share ${referenceKeys.length} keys.`);
for (const code of supportedLocales) {
  const dictionary = dictionaries.get(code);
  const translated = referenceKeys.filter(key => key in dictionary).length;
  const coverage = referenceKeys.length ? ((translated / referenceKeys.length) * 100).toFixed(1) : '0.0';
  console.log(`  ${code.padEnd(6)} ${String(translated).padStart(4)}/${referenceKeys.length} • ${coverage}%`);
}
if (legacyLocales.length) console.log(`ℹ Legacy flat locale packs not exposed until migrated: ${legacyLocales.join(', ')}`);
console.log('✓ Community locales may omit keys; runtime English fallback is used.');
console.log('✓ Placeholders, directions and SQL keywords validated.');
