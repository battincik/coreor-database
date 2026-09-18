'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import english from '@/locales/en.json';
import turkish from '@/locales/tr.json';
import spanish from '@/locales/es.json';
import french from '@/locales/fr.json';
import german from '@/locales/de.json';
import portugueseBrazil from '@/locales/pt-BR.json';
import russian from '@/locales/ru.json';
import simplifiedChinese from '@/locales/zh-CN.json';
import japanese from '@/locales/ja.json';
import korean from '@/locales/ko.json';
import hindi from '@/locales/hi.json';
import arabic from '@/locales/ar.json';

export type LocaleCode = 'tr' | 'en' | 'es' | 'zh-CN' | 'hi' | 'ar' | 'pt-BR' | 'fr' | 'de' | 'ru' | 'ja' | 'ko';
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

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish', direction: 'ltr', region: 'Türkiye', searchTerms: ['turkce', 'türkçe', 'turkish'] },
  { code: 'en', nativeName: 'English', englishName: 'English', direction: 'ltr', region: 'Global', searchTerms: ['english', 'ingilizce'] },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', direction: 'ltr', region: 'España / Latinoamérica', searchTerms: ['spanish', 'espanol', 'español', 'ispanyolca'] },
  { code: 'zh-CN', nativeName: '简体中文', englishName: 'Simplified Chinese', direction: 'ltr', region: '中国大陆', searchTerms: ['chinese', 'simplified', '中文', 'çince'] },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', direction: 'ltr', region: 'भारत', searchTerms: ['hindi', 'हिन्दी', 'hintce'] },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', direction: 'rtl', region: 'الشرق الأوسط', searchTerms: ['arabic', 'العربية', 'arapça'] },
  { code: 'pt-BR', nativeName: 'Português (Brasil)', englishName: 'Portuguese', direction: 'ltr', region: 'Brasil', searchTerms: ['portuguese', 'portugues', 'português', 'brezilya'] },
  { code: 'fr', nativeName: 'Français', englishName: 'French', direction: 'ltr', region: 'France / Francophonie', searchTerms: ['french', 'francais', 'français', 'fransızca'] },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', direction: 'ltr', region: 'Deutschland', searchTerms: ['german', 'deutsch', 'almanca'] },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian', direction: 'ltr', region: 'Россия / СНГ', searchTerms: ['russian', 'русский', 'rusça'] },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese', direction: 'ltr', region: '日本', searchTerms: ['japanese', '日本語', 'japonca'] },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean', direction: 'ltr', region: '대한민국', searchTerms: ['korean', '한국어', 'korece'] }
];

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

const RAW_LANGUAGE_DICTIONARIES: Record<LocaleCode, LocaleTree> = {
  tr: turkish as LocaleTree,
  en: english as LocaleTree,
  es: spanish as LocaleTree,
  'zh-CN': simplifiedChinese as LocaleTree,
  hi: hindi as LocaleTree,
  ar: arabic as LocaleTree,
  'pt-BR': portugueseBrazil as LocaleTree,
  fr: french as LocaleTree,
  de: german as LocaleTree,
  ru: russian as LocaleTree,
  ja: japanese as LocaleTree,
  ko: korean as LocaleTree
};

const ENGLISH_DICTIONARY = flattenLocaleTree(RAW_LANGUAGE_DICTIONARIES.en);

export const LANGUAGE_DICTIONARIES = Object.fromEntries(
  SUPPORTED_LANGUAGES.map(({ code }) => [
    code,
    { ...ENGLISH_DICTIONARY, ...flattenLocaleTree(RAW_LANGUAGE_DICTIONARIES[code]) }
  ])
) as Record<LocaleCode, TranslationDictionary>;

export const SOURCE_TRANSLATIONS: TranslationDictionary = LANGUAGE_DICTIONARIES.tr;
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
    () => SUPPORTED_LANGUAGES.find(item => item.code === language) ?? SUPPORTED_LANGUAGES[0],
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
