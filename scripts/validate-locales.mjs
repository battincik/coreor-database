import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const localeDirectory = join(root, 'src', 'locales');
const coverageDirectory = join(localeDirectory, 'coverage');
const legacyPath = join(localeDirectory, 'legacy-phrases.json');
const supportedLocales = ['tr', 'en', 'es', 'zh-CN', 'hi', 'ar', 'pt-BR', 'fr', 'de', 'ru', 'ja', 'ko'];
const placeholderPattern = /\{([A-Za-z0-9_]+)\}/g;

async function readDictionary(path, label) {
  const raw = await readFile(path, 'utf8');
  const dictionary = JSON.parse(raw);
  if (!dictionary || Array.isArray(dictionary) || typeof dictionary !== 'object') {
    throw new Error(`${label} kök değeri bir JSON nesnesi olmalıdır.`);
  }
  return dictionary;
}

const legacyCatalog = await readDictionary(legacyPath, 'legacy-phrases.json');

async function readLocale(code) {
  const base = await readDictionary(join(localeDirectory, `${code}.json`), `${code}.json`);
  const coverage = await readDictionary(join(coverageDirectory, `${code}.json`), `coverage/${code}.json`);
  const legacy = legacyCatalog[code];
  if (!legacy || Array.isArray(legacy) || typeof legacy !== 'object') {
    throw new Error(`legacy-phrases.json içinde ${code} sözlüğü bulunamadı.`);
  }
  return { base, coverage, legacy, merged: { ...base, ...coverage, ...legacy } };
}

function placeholders(value) {
  return [...String(value).matchAll(placeholderPattern)].map(match => match[1]).sort();
}

function compareDictionaryKeys(reference, dictionary, code, scope, problems) {
  const referenceKeys = Object.keys(reference).sort();
  const keys = Object.keys(dictionary).sort();
  const missing = referenceKeys.filter(key => !(key in dictionary));
  const extra = keys.filter(key => !(key in reference));
  if (missing.length) problems.push(`${code} ${scope}: eksik anahtarlar: ${missing.join(', ')}`);
  if (extra.length) problems.push(`${code} ${scope}: fazla anahtarlar: ${extra.join(', ')}`);

  for (const key of referenceKeys) {
    const value = dictionary[key];
    if (typeof value !== 'string' || !value.trim()) {
      problems.push(`${code} ${scope}: ${key} boş veya string değil.`);
      continue;
    }
    const expectedPlaceholders = placeholders(reference[key]);
    const actualPlaceholders = placeholders(value);
    if (expectedPlaceholders.join('|') !== actualPlaceholders.join('|')) {
      problems.push(`${code} ${scope}: ${key} yer tutucuları farklı. Beklenen {${expectedPlaceholders.join('}, {')}}, bulunan {${actualPlaceholders.join('}, {')}}.`);
    }
  }
}

const dictionaries = new Map();
for (const code of supportedLocales) dictionaries.set(code, await readLocale(code));

const reference = dictionaries.get('en');
const problems = [];

for (const code of supportedLocales) {
  const dictionary = dictionaries.get(code);
  compareDictionaryKeys(reference.base, dictionary.base, code, 'ana sözlük', problems);
  compareDictionaryKeys(reference.coverage, dictionary.coverage, code, 'coverage', problems);
  compareDictionaryKeys(reference.legacy, dictionary.legacy, code, 'legacy', problems);
  compareDictionaryKeys(reference.merged, dictionary.merged, code, 'birleşik sözlük', problems);

  const direction = dictionary.merged['meta.direction'];
  if (direction !== 'ltr' && direction !== 'rtl') problems.push(`${code}: meta.direction yalnızca ltr veya rtl olabilir.`);
  if (!dictionary.merged['meta.nativeName']?.trim()) problems.push(`${code}: meta.nativeName zorunludur.`);
}

if (dictionaries.get('ar').merged['meta.direction'] !== 'rtl') problems.push('ar: Arapça dil paketi rtl olmalıdır.');
for (const code of supportedLocales.filter(locale => locale !== 'ar')) {
  if (dictionaries.get(code).merged['meta.direction'] !== 'ltr') problems.push(`${code}: Bu dil paketi ltr olmalıdır.`);
}

if (problems.length) {
  console.error(`\nLocale doğrulaması başarısız (${problems.length} sorun):\n`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`✓ ${supportedLocales.length} dil paketi doğrulandı.`);
console.log(`✓ Ana sözlükte ${Object.keys(reference.base).length}, coverage paketinde ${Object.keys(reference.coverage).length}, legacy sözlüğünde ${Object.keys(reference.legacy).length} ortak anahtar bulunuyor.`);
console.log(`✓ Birleşik sözlüklerde ${Object.keys(reference.merged).length} anahtar, placeholder ve yazım yönü uyumlu.`);
