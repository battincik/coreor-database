import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const localeDirectory = join(root, 'src', 'locales');
const supportedLocales = ['tr', 'en', 'es', 'zh-CN', 'hi', 'ar', 'pt-BR', 'fr', 'de', 'ru', 'ja', 'ko'];
const placeholderPattern = /\{([A-Za-z0-9_]+)\}/g;

async function readLocale(code) {
  const path = join(localeDirectory, `${code}.json`);
  const raw = await readFile(path, 'utf8');
  const dictionary = JSON.parse(raw);
  if (!dictionary || Array.isArray(dictionary) || typeof dictionary !== 'object') {
    throw new Error(`${code}.json kök değeri bir JSON nesnesi olmalıdır.`);
  }
  return dictionary;
}

function placeholders(value) {
  return [...String(value).matchAll(placeholderPattern)].map(match => match[1]).sort();
}

const dictionaries = new Map();
for (const code of supportedLocales) dictionaries.set(code, await readLocale(code));

const reference = dictionaries.get('en');
const referenceKeys = Object.keys(reference).sort();
const problems = [];

for (const code of supportedLocales) {
  const dictionary = dictionaries.get(code);
  const keys = Object.keys(dictionary).sort();
  const missing = referenceKeys.filter(key => !(key in dictionary));
  const extra = keys.filter(key => !(key in reference));
  if (missing.length) problems.push(`${code}: eksik anahtarlar: ${missing.join(', ')}`);
  if (extra.length) problems.push(`${code}: fazla anahtarlar: ${extra.join(', ')}`);

  for (const key of referenceKeys) {
    const value = dictionary[key];
    if (typeof value !== 'string' || !value.trim()) {
      problems.push(`${code}: ${key} boş veya string değil.`);
      continue;
    }
    const expectedPlaceholders = placeholders(reference[key]);
    const actualPlaceholders = placeholders(value);
    if (expectedPlaceholders.join('|') !== actualPlaceholders.join('|')) {
      problems.push(`${code}: ${key} yer tutucuları farklı. Beklenen {${expectedPlaceholders.join('}, {')}}, bulunan {${actualPlaceholders.join('}, {')}}.`);
    }
  }

  const direction = dictionary['meta.direction'];
  if (direction !== 'ltr' && direction !== 'rtl') problems.push(`${code}: meta.direction yalnızca ltr veya rtl olabilir.`);
  if (!dictionary['meta.nativeName']?.trim()) problems.push(`${code}: meta.nativeName zorunludur.`);
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

console.log(`✓ ${supportedLocales.length} dil paketi doğrulandı.`);
console.log(`✓ Her pakette ${referenceKeys.length} ortak çeviri anahtarı bulunuyor.`);
console.log('✓ Yer tutucular ve yazım yönleri uyumlu.');
