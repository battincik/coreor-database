import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'src');
const localeDir = join(src, 'locales');
const strictDirect = process.argv.includes('--strict-direct');

function flatten(value, prefix = '', output = {}) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') output[path] = child.replace(/\s+/g, ' ').trim();
    else if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, path, output);
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
function normalize(value) {
  return value.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
}
function humanReadable(value) {
  if (!value || value.length < 2 || value.length > 260) return false;
  if (/^(?:https?:|[A-Za-z]:\\|\/|@\/|\.\/|\.\.\/)/.test(value)) return false;
  if (/^(?:[A-Z0-9_]+|[a-z0-9_.:/@-]+)$/.test(value) && !value.includes(' ')) return false;
  if (/^(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REPLACE|MERGE|CALL|EXPLAIN|SHOW|WITH)\b/i.test(value)) return false;
  if (/^(?:MySQL|MariaDB|PostgreSQL|CockroachDB|MSSQL|TiDB|SQL|JSON|CSV|PDF|AES-256-GCM|Argon2id|Coreor Database|GitHub|WebView|TLS|SSL|READ ONLY|READ\/WRITE)$/i.test(value)) return false;
  if (/^(?:[.#\[\](){}]|var\(|calc\(|min\(|max\(|clamp\(|rgb|hsl|text-|bg-|border-|grid|flex|rounded|shadow|hover:|focus:|data-)/.test(value)) return false;
  return /[A-Za-zÀ-žçğıöşüÇĞİÖŞÜ\u0400-\u04ff\u0600-\u06ff\u3040-\u30ff\u4e00-\u9fff]/u.test(value);
}
function location(source, index) {
  return source.slice(0, index).split('\n').length;
}

const en = flatten(JSON.parse(await readFile(join(localeDir, 'en.json'), 'utf8')));
const tr = flatten(JSON.parse(await readFile(join(localeDir, 'tr.json'), 'utf8')));
const sourceValues = new Set([...Object.values(en), ...Object.values(tr)]);
const sourceKeys = new Set([...Object.keys(en), ...Object.keys(tr)]);
const files = await walk(src);
const missingCatalog = [];
const missingKeys = [];
const legacyLiterals = [];

function inspectLiteral(path, source, index, value, context) {
  const normalized = normalize(value);
  if (!humanReadable(normalized)) return;
  if (sourceValues.has(normalized)) {
    legacyLiterals.push({ path, line: location(source, index), value: normalized, context });
    return;
  }
  missingCatalog.push({ path, line: location(source, index), value: normalized, context });
}

for (const path of files) {
  if (path.endsWith('legacy-translation-bridge.tsx')) continue;
  const source = await readFile(path, 'utf8');

  for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) {
    const key = match[1];
    if (!en[key] || !tr[key]) missingKeys.push({ path, line: location(source, match.index ?? 0), key });
  }

  // Plain JSX text.
  for (const match of source.matchAll(/>([^<>{}\n]{2,260})</g)) {
    inspectLiteral(path, source, match.index ?? 0, match[1], 'jsx-text');
  }

  // User-facing JSX attributes.
  for (const match of source.matchAll(/\b(?:title|placeholder|aria-label|aria-description|data-tooltip|data-title)\s*=\s*["']([^"'\n]{2,260})["']/g)) {
    inspectLiteral(path, source, match.index ?? 0, match[1], 'jsx-attribute');
  }

  // Common UI object properties used by menus, dialogs, options and notifications.
  for (const match of source.matchAll(/\b(?:label|title|description|confirmLabel|disabledReason|placeholder)\s*:\s*['"]([^'"\n]{2,260})['"]/g)) {
    inspectLiteral(path, source, match.index ?? 0, match[1], 'ui-property');
  }

  // Turkish literals outside the contexts above catch toast/error/helper copy.
  for (const match of source.matchAll(/(['"`])([^\n]*?[çğıöşüÇĞİÖŞÜ][^\n]*?)\1/g)) {
    const value = match[2];
    if (value.includes('${')) continue;
    if (/console\.|RegExp|regex|className|data-testid/.test(value)) continue;
    inspectLiteral(path, source, match.index ?? 0, value, 'turkish-literal');
  }
}

if (missingKeys.length || missingCatalog.length || (strictDirect && legacyLiterals.length)) {
  if (missingKeys.length) {
    console.error('\nMissing t(...) keys in en.json/tr.json:\n');
    for (const item of missingKeys) console.error(`${relative(root, item.path)}:${item.line}  ${item.key}`);
  }
  if (missingCatalog.length) {
    console.error('\nUser-facing literals missing from source JSON catalogs:\n');
    for (const item of missingCatalog) console.error(`${relative(root, item.path)}:${item.line} [${item.context}] ${item.value}`);
  }
  if (strictDirect && legacyLiterals.length) {
    console.error('\nCatalog-backed legacy literals still rendered without direct t(...):\n');
    for (const item of legacyLiterals) console.error(`${relative(root, item.path)}:${item.line} [${item.context}] ${item.value}`);
  }
  process.exit(1);
}

console.log(`✓ Audited ${files.length} TypeScript/TSX files.`);
console.log(`✓ All literal t(...) keys exist in both en.json and tr.json.`);
console.log(`✓ No catalogless user-facing static UI literal detected.`);
if (legacyLiterals.length) {
  console.log(`ℹ ${legacyLiterals.length} catalog-backed legacy literal occurrence(s) remain behind LegacyTranslationBridge.`);
  console.log('  Run npm run i18n:audit:strict to list them while migrating to direct t(...).');
} else {
  console.log('✓ All scanned user-facing static UI copy uses direct localization.');
}
