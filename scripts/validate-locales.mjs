import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const localeDirectory = join(root, 'src', 'locales');
const supportedLocales = ['tr', 'en', 'es', 'zh-CN', 'hi', 'ar', 'pt-BR', 'fr', 'de', 'ru', 'ja', 'ko'];
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
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${path} kök değeri bir JSON nesnesi olmalıdır.`);
  return value;
}

function flatten(value, prefix = '', output = {}) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') output[path] = child;
    else if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, output);
    else throw new Error(`${path}: locale değeri string veya nesne olmalıdır.`);
  }
  return output;
}

function placeholders(value) {
  return [...String(value).matchAll(placeholderPattern)].map(match => match[1]).sort();
}

const dictionaries = new Map();
for (const code of supportedLocales) dictionaries.set(code, flatten(await readJson(join(localeDirectory, `${code}.json`))));

const problems = [];
const reference = dictionaries.get('en');
const turkish = dictionaries.get('tr');
const referenceKeys = Object.keys(reference).sort();

for (const code of requiredLocales) {
  const dictionary = dictionaries.get(code);
  const missing = referenceKeys.filter(key => !(key in dictionary));
  const extra = Object.keys(dictionary).filter(key => !(key in reference));
  if (missing.length) problems.push(`${code}: eksik anahtarlar: ${missing.join(', ')}`);
  if (extra.length) problems.push(`${code}: İngilizce kaynak pakette olmayan anahtarlar: ${extra.join(', ')}`);
}

for (const code of supportedLocales) {
  const dictionary = dictionaries.get(code);
  for (const key of referenceKeys) {
    const value = dictionary[key];
    if (value === undefined) continue; // Community locale: runtime English fallback.
    if (typeof value !== 'string' || !value.trim()) {
      problems.push(`${code}: ${key} boş veya string değil.`);
      continue;
    }
    const expectedPlaceholders = placeholders(reference[key]);
    const actualPlaceholders = placeholders(value);
    if (expectedPlaceholders.join('|') !== actualPlaceholders.join('|')) {
      problems.push(`${code}: ${key} yer tutucuları İngilizceyle eşleşmiyor.`);
    }
  }

  const direction = dictionary['meta.direction'];
  if (direction !== 'ltr' && direction !== 'rtl') problems.push(`${code}: meta.direction yalnızca ltr veya rtl olabilir.`);
  if (!dictionary['meta.nativeName']?.trim()) problems.push(`${code}: meta.nativeName zorunludur.`);
}

if (Object.keys(turkish).length !== referenceKeys.length) {
  problems.push(`tr/en kaynak paketleri aynı sayıda anahtar taşımalıdır. tr=${Object.keys(turkish).length}, en=${referenceKeys.length}`);
}

for (const [key, keyword] of Object.entries(sqlKeywordKeys)) {
  for (const code of supportedLocales) {
    const value = dictionaries.get(code)[key];
    if (value !== undefined && value !== keyword) problems.push(`${code}: ${key} SQL anahtar kelimesi ${keyword} olarak korunmalıdır.`);
  }
}

if (dictionaries.get('ar')['meta.direction'] !== 'rtl') problems.push('ar: Arapça dil paketi rtl olmalıdır.');
for (const code of supportedLocales.filter(locale => locale !== 'ar')) {
  if (dictionaries.get(code)['meta.direction'] !== 'ltr') problems.push(`${code}: Bu dil paketi ltr olmalıdır.`);
}

if (problems.length) {
  console.error(`\nLocale doğrulaması başarısız (${problems.length} sorun):\n`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`✓ Türkçe ve İngilizce kaynak paketlerinde ${referenceKeys.length} ortak anahtar doğrulandı.`);
for (const code of supportedLocales) {
  const translated = referenceKeys.filter(key => key in dictionaries.get(code)).length;
  const coverage = ((translated / referenceKeys.length) * 100).toFixed(1);
  console.log(`  ${code.padEnd(5)} ${String(translated).padStart(4)}/${referenceKeys.length} • %${coverage}`);
}
console.log('✓ Eksik community locale anahtarları runtime’da İngilizce fallback kullanır.');
console.log('✓ Yer tutucular, yazım yönleri ve SQL anahtar kelimeleri uyumlu.');
