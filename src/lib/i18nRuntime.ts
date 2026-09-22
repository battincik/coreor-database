import { LOCALE_MODULES, type LocaleCode } from '@/locales/registry';

type LocaleTree = { [key: string]: string | LocaleTree };
type Dictionary = Record<string, string>;
export type RuntimeTranslationValues = Record<string, string | number>;

function flatten(tree: LocaleTree, prefix = '', output: Dictionary = {}): Dictionary {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') output[path] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, output);
  }
  return output;
}

const trees = LOCALE_MODULES as unknown as Record<LocaleCode, LocaleTree>;
const english = flatten(trees.en);
const dictionaries = Object.fromEntries(
  Object.entries(trees).map(([code, tree]) => [code, { ...english, ...flatten(tree) }])
) as Record<LocaleCode, Dictionary>;

function normalizeLocale(input?: string | null): LocaleCode {
  const value = input?.trim().toLowerCase();
  if (value) {
    const exact = (Object.keys(dictionaries) as LocaleCode[]).find(code => code.toLowerCase() === value);
    if (exact) return exact;
    const base = value.split(/[-_]/)[0];
    const matched = (Object.keys(dictionaries) as LocaleCode[]).find(code => code.toLowerCase().split('-')[0] === base);
    if (matched) return matched;
  }
  return 'en';
}

export function getRuntimeLocale(): LocaleCode {
  if (typeof document !== 'undefined') {
    const fromDocument = normalizeLocale(document.documentElement.dataset.locale || document.documentElement.lang);
    if (fromDocument) return fromDocument;
  }
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('coreor:language:v1');
    if (stored) return normalizeLocale(stored);
    return normalizeLocale(window.navigator.language);
  }
  return 'en';
}

export function translateRuntime(key: string, values?: RuntimeTranslationValues, fallback?: string) {
  const locale = getRuntimeLocale();
  const template = dictionaries[locale]?.[key] ?? english[key] ?? fallback ?? key;
  if (!values) return template;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => String(values[name] ?? match));
}
