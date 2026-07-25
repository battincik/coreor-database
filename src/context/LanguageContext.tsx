'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import englishTranslations from '@/locales/en.json';

interface LanguageContextProps {
  language: string;
  translations: Record<string, string>;
  isLoading: boolean;
  setLanguage: (lang: string) => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguage] = useState('en');
  const [translations, setTranslations] = useState<Record<string, string>>(englishTranslations);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const storedLanguage = localStorage.getItem('language');
    if (storedLanguage && storedLanguage !== language) {
      setLanguage(storedLanguage);
    }
  }, []);

  const updateLanguage = (lang: string) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
  };

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'language' && event.newValue && event.newValue !== language) {
        setLanguage(event.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [language]);

  useEffect(() => {
    let cancelled = false;

    const loadTranslations = async () => {
      setIsLoading(true);

      try {
        const translationsModule = await import(`@/locales/${language}.json`);
        if (!cancelled) {
          setTranslations({ ...englishTranslations, ...translationsModule.default });
        }
      } catch {
        console.warn(`Could not load translations for language: ${language}. Falling back to English.`);
        if (!cancelled) {
          setTranslations(englishTranslations);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadTranslations();

    return () => {
      cancelled = true;
    };
  }, [language]);

  const t = (key: string, fallback?: string) => translations[key] || fallback || key;

  return <LanguageContext.Provider value={{ language, translations, isLoading, setLanguage: updateLanguage, t }}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
