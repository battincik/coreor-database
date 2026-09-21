'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LOCALE_MODULES, type LocaleCode } from '@/locales/registry';

export type LocaleDirection = 'ltr' | 'rtl';
export type TranslationValues = Record<string, string | number>;
export type TranslationDictionary = Record<string, string>;
export type LocaleTree = { [key: string]: string | LocaleTree };

export interface SupportedLanguage {
  code: LocaleCode;
  nativeName: string;
  englishName: string;
  direction: LocaleDirection;
  region: string;
  searchTerms: string[];
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = (Object.entries(LOCALE_MODULES) as Array<[LocaleCode, LocaleTree]>)
  .map(([code, tree]) => {
    const meta = tree.meta as LocaleTree | undefined;
    const nativeName = typeof meta?.nativeName === 'string' ? meta.nativeName : code;
    const direction: LocaleDirection = meta?.direction === 'rtl' ? 'rtl' : 'ltr';
    let englishName: string = code;
    try {
      englishName = new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
    } catch {
      englishName = code;
    }
    const regionCode = code.includes('-') ? code.split('-')[1] : null;
    let region = 'Global';
    if (regionCode) {
      try {
        region = new Intl.DisplayNames(['en'], { type: 'region' }).of(regionCode.toUpperCase()) || regionCode.toUpperCase();
      } catch {
        region = regionCode.toUpperCase();
      }
    }
    return { code, nativeName, englishName, direction, region, searchTerms: [code, nativeName, englishName] };
  })
  .sort((left, right) => left.nativeName.localeCompare(right.nativeName));

function flattenLocaleTree(tree: LocaleTree, prefix = '', output: TranslationDictionary = {}): TranslationDictionary {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      output[path] = value;
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenLocaleTree(value, path, output);
    }
  }
  return output;
}

const RAW_LANGUAGE_DICTIONARIES = LOCALE_MODULES as unknown as Record<LocaleCode, LocaleTree>;

const ENGLISH_DICTIONARY = flattenLocaleTree(RAW_LANGUAGE_DICTIONARIES.en);

export const LANGUAGE_DICTIONARIES = Object.fromEntries(
  SUPPORTED_LANGUAGES.map(({ code }) => [
    code,
    { ...ENGLISH_DICTIONARY, ...flattenLocaleTree(RAW_LANGUAGE_DICTIONARIES[code]) }
  ])
) as Record<LocaleCode, TranslationDictionary>;

export const SOURCE_TRANSLATIONS: TranslationDictionary = LANGUAGE_DICTIONARIES.tr;
export const SOURCE_TRANSLATION_DICTIONARIES: TranslationDictionary[] = [
  flattenLocaleTree(RAW_LANGUAGE_DICTIONARIES.tr),
  flattenLocaleTree(RAW_LANGUAGE_DICTIONARIES.en)
];
const DEFAULT_LOCALE: LocaleCode = 'tr';
const FALLBACK_LOCALE: LocaleCode = 'en';
const STORAGE_KEY = 'coreor:language:v1';
const LEGACY_STORAGE_KEY = 'language';

function normalizeLocale(input?: string | null): LocaleCode | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  const exact = SUPPORTED_LANGUAGES.find(language => language.code.toLowerCase() === value);
  if (exact) return exact.code;
  if (value.startsWith('zh')) return 'zh-CN';
  if (value.startsWith('pt')) return 'pt-BR';
  const base = value.split(/[-_]/)[0];
  const matched = SUPPORTED_LANGUAGES.find(language => language.code.toLowerCase().split('-')[0] === base);
  return matched?.code ?? null;
}

function detectSystemLocale(): LocaleCode {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  for (const candidate of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const normalized = normalizeLocale(candidate);
    if (normalized) return normalized;
  }
  return DEFAULT_LOCALE;
}

function interpolate(template: string, values?: TranslationValues) {
  if (!values) return template;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => String(values[key] ?? match));
}

interface LanguageContextProps {
  language: LocaleCode;
  direction: LocaleDirection;
  translations: TranslationDictionary;
  isLoading: boolean;
  supportedLanguages: SupportedLanguage[];
  currentLanguage: SupportedLanguage;
  setLanguage: (language: LocaleCode | string) => void;
  t: (key: string, fallbackOrValues?: string | TranslationValues, values?: TranslationValues) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LocaleCode>(DEFAULT_LOCALE);
  const [hydrated, setHydrated] = useState(false);

  const currentLanguage = useMemo(
    () => SUPPORTED_LANGUAGES.find(item => item.code === language) ?? SUPPORTED_LANGUAGES.find(item => item.code === DEFAULT_LOCALE) ?? SUPPORTED_LANGUAGES[0],
    [language]
  );
  const translations = useMemo<TranslationDictionary>(() => LANGUAGE_DICTIONARIES[language], [language]);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const initial = normalizeLocale(stored) ?? detectSystemLocale();
    setLanguageState(initial);
    window.localStorage.setItem(STORAGE_KEY, initial);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    setHydrated(true);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dir = currentLanguage.direction;
    root.dataset.locale = language;
    root.dataset.direction = currentLanguage.direction;
  }, [currentLanguage.direction, language]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = normalizeLocale(event.newValue);
      if (next) setLanguageState(next);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setLanguage = useCallback((input: LocaleCode | string) => {
    const next = normalizeLocale(input) ?? DEFAULT_LOCALE;
    setLanguageState(next);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback((key: string, fallbackOrValues?: string | TranslationValues, values?: TranslationValues) => {
    const fallback = typeof fallbackOrValues === 'string' ? fallbackOrValues : undefined;
    const interpolationValues = typeof fallbackOrValues === 'object' ? fallbackOrValues : values;
    const template = translations[key] ?? LANGUAGE_DICTIONARIES[FALLBACK_LOCALE][key] ?? fallback ?? key;
    return interpolate(template, interpolationValues);
  }, [translations]);

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(language, options).format(value),
    [language]
  );
  const formatDate = useCallback(
    (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
      const date = value instanceof Date ? value : new Date(value);
      return new Intl.DateTimeFormat(language, options).format(date);
    },
    [language]
  );

  const context = useMemo<LanguageContextProps>(() => ({
    language,
    direction: currentLanguage.direction,
    translations,
    isLoading: !hydrated,
    supportedLanguages: SUPPORTED_LANGUAGES,
    currentLanguage,
    setLanguage,
    t,
    formatNumber,
    formatDate
  }), [currentLanguage, formatDate, formatNumber, hydrated, language, setLanguage, t, translations]);

  return <LanguageContext.Provider value={context}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
}
