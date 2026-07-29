import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scanRoots = [join(root, 'src', 'app'), join(root, 'src', 'components'), join(root, 'src', 'context')];
const strict = process.argv.includes('--strict');
const turkishPattern = /[çğıİöşüÇĞÖŞÜ]|\b(?:ayarlar?|sunucu|veritabanı|tablo|sorgu|bağlantı|yükleniyor|bulunamadı|oluştur|düzenle|kapat|satır|sütun|kolon|şema|yedekleme|güvenlik|geçmiş|yenile|temizle|karşılaştırma|maskeleme|kullanıcı|parola|işlem)\b/i;
const ignoredTechnicalPattern = /^(?:SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|SHOW|DESCRIBE|EXPLAIN|GRANT|REVOKE|WITH|BEGIN|COMMIT|ROLLBACK|SET|USE|CALL|EXEC|DBCC|VACUUM|ANALYZE)\b/i;
const allowedExtensions = new Set(['.tsx', '.ts', '.jsx', '.js']);
const excludedFragments = [
  `${join('src', 'locales')}`,
  `${join('src', 'i18n')}`,
  `${join('src', 'lib', 'releaseHistory')}`,
  `${join('src', 'lib', 'databaseEngines')}`,
  `${join('src', 'lib', 'server')}`,
  `${join('src', 'lib', 'sql-')}`
];

async function readDictionary(code, coverage = false) {
  const path = coverage
    ? join(root, 'src', 'locales', 'coverage', `${code}.json`)
    : join(root, 'src', 'locales', `${code}.json`);
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readLegacyTurkish() {
  const catalog = JSON.parse(await readFile(join(root, 'src', 'locales', 'legacy-phrases.json'), 'utf8'));
  return catalog.tr || {};
}

async function readAliasSources() {
  const source = await readFile(join(root, 'src', 'i18n', 'legacy-source-aliases.ts'), 'utf8');
  const values = [];
  const pattern = /^\s*'((?:\\'|[^'])+)'\s*:/gm;
  let match = pattern.exec(source);
  while (match) {
    values.push(match[1].replace(/\\'/g, "'"));
    match = pattern.exec(source);
  }
  return values;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (allowedExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function normalize(value) {
  return value
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function collectCandidates(source) {
  const candidates = [];
  const patterns = [
    />\s*([^<>{}\n][^<>{}]{1,240}?)\s*</g,
    /(?:placeholder|title|aria-label|aria-description|data-placeholder|label|description|message|emptyText|actionLabel)\s*(?:=|:)\s*["'`]([^"'`]{2,240})["'`]/g
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match) {
      candidates.push({ value: normalize(match[1]), index: match.index });
      match = pattern.exec(source);
    }
  }
  return candidates;
}

const baseTurkish = await readDictionary('tr');
const coverageTurkish = await readDictionary('tr', true);
const legacyTurkish = await readLegacyTurkish();
const aliasSources = await readAliasSources();
const translatedSources = new Set([
  ...Object.values({ ...baseTurkish, ...coverageTurkish, ...legacyTurkish }),
  ...aliasSources
].map(normalize));
const findings = [];

for (const scanRoot of scanRoots) {
  for (const file of await walk(scanRoot)) {
    const relativePath = relative(root, file);
    if (excludedFragments.some(fragment => relativePath.includes(fragment))) continue;
    const source = await readFile(file, 'utf8');
    for (const candidate of collectCandidates(source)) {
      if (!candidate.value || candidate.value.length > 240) continue;
      if (!turkishPattern.test(candidate.value)) continue;
      if (ignoredTechnicalPattern.test(candidate.value)) continue;
      if (translatedSources.has(candidate.value)) continue;
      const line = lineAt(source, candidate.index);
      const sourceLine = source.split('\n')[line - 1] || '';
      if (sourceLine.includes('i18n-ignore-line')) continue;
      findings.push({ file: relativePath, line, value: candidate.value });
    }
  }
}

const unique = [...new Map(findings.map(item => [`${item.file}:${item.line}:${item.value}`, item])).values()]
  .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);

if (!unique.length) {
  console.log('✓ Kullanıcıya görünen sabit Türkçe metin bulunamadı.');
  process.exit(0);
}

console.log(`\n⚠ Çeviri kataloğunda bulunmayan ${unique.length} olası UI metni tespit edildi:\n`);
for (const item of unique) console.log(`- ${item.file}:${item.line} — ${item.value}`);
console.log('\nBu rapor SQL, code/pre, tablo verisi ve sunucu tarafı teknik mesajları kapsamaz.');
console.log('Bilinçli olarak çevrilmeyecek bir satıra // i18n-ignore-line açıklaması eklenebilir.');
if (strict) process.exit(1);
