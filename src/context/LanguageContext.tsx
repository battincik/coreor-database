/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface LanguageContextProps {
  language: string;
  translations: Record<string, string>;
  setLanguage: (lang: string) => void;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguage] = useState('en'); // Default language
  const [translations, setTranslations] = useState<Record<string, string>>({});

  // Check localStorage on initial render
  useEffect(() => {
    const storedLanguage = localStorage.getItem('language');
    if (storedLanguage && storedLanguage !== language) {
      setLanguage(storedLanguage);
    }
  }, []);

  // Update localStorage when language changes
  const updateLanguage = (lang: string) => {
    setLanguage(lang);
    localStorage.setItem('language', lang);
  };

  // Listen to localStorage changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'language' && e.newValue && e.newValue !== language) {
        setLanguage(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [language]);

  useEffect(() => {
    const loadTranslations = async () => {
      try {
        const translationsModule = await import(`@/locales/${language}.json`);
        setTranslations(translationsModule.default);
      } catch (error) {
        console.warn(`Could not load translations for language: ${language}. Falling back to English.`);
        const fallbackModule = await import(`@/locales/en.json`);
        setTranslations(fallbackModule.default);
      }
    };

    loadTranslations();
  }, [language]);

  return <LanguageContext.Provider value={{ language, translations, setLanguage: updateLanguage }}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
