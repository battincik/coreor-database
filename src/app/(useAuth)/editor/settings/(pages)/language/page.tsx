'use client';

import React, { useState } from 'react';
import { SettingsSidebar } from '../../components/sidebar';
import { Check } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLanguage } from '@/context/LanguageContext';
import { CircleFlag } from 'react-circle-flags';

export default function SettingsPage() {
  const { language, translations, setLanguage } = useLanguage();
  const [selectedLanguage, setSelectedLanguage] = useState(language);

  const handleLanguageChange = (code: string) => {
    setLanguage(code);
    setSelectedLanguage(code);
  };

  const languages = [
    // { code: 'bg', languageCode: 'bg', countryCode: 'BG', name: 'Български', nativeName: 'Български', flag: '🇧🇬' },
    // { code: 'cs', languageCode: 'cs', countryCode: 'CZ', name: 'Čeština', nativeName: 'Čeština', flag: '🇨🇿' },
    // { code: 'da', languageCode: 'da', countryCode: 'DK', name: 'Dansk', nativeName: 'Dansk', flag: '🇩🇰' },
    // { code: 'de', languageCode: 'de', countryCode: 'DE', name: 'Deutsch', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'en-GB', languageCode: 'en', countryCode: 'GB', name: 'English, UK', nativeName: 'English', flag: '🇬🇧' },
    { code: 'en', languageCode: 'en', countryCode: 'US', name: 'English, US', nativeName: 'English', flag: '🇺🇸' },
    // { code: 'es', languageCode: 'es', countryCode: 'ES', name: 'Español', nativeName: 'Español', flag: '🇪🇸' },
    // { code: 'fi', languageCode: 'fi', countryCode: 'FI', name: 'Suomi', nativeName: 'Suomi', flag: '🇫🇮' },
    // { code: 'fr', languageCode: 'fr', countryCode: 'FR', name: 'Français', nativeName: 'Français', flag: '🇫🇷' },
    // { code: 'el', languageCode: 'el', countryCode: 'GR', name: 'Ελληνικά', nativeName: 'Ελληνικά', flag: '🇬🇷' },
    // { code: 'hr', languageCode: 'hr', countryCode: 'HR', name: 'Hrvatski', nativeName: 'Hrvatski', flag: '🇭🇷' },
    // { code: 'hu', languageCode: 'hu', countryCode: 'HU', name: 'Magyar', nativeName: 'Magyar', flag: '🇭🇺' },
    // { code: 'it', languageCode: 'it', countryCode: 'IT', name: 'Italiano', nativeName: 'Italiano', flag: '🇮🇹' },
    // { code: 'ja', languageCode: 'ja', countryCode: 'JP', name: '日本語', nativeName: '日本語', flag: '🇯🇵' },
    // { code: 'ko', languageCode: 'ko', countryCode: 'KR', name: '한국어', nativeName: '한국어', flag: '🇰🇷' },
    // { code: 'lt', languageCode: 'lt', countryCode: 'LT', name: 'Lietuviškai', nativeName: 'Lietuvių', flag: '🇱🇹' },
    // { code: 'nl', languageCode: 'nl', countryCode: 'NL', name: 'Nederlands', nativeName: 'Nederlands', flag: '🇳🇱' },
    // { code: 'no', languageCode: 'no', countryCode: 'NO', name: 'Norsk', nativeName: 'Norsk', flag: '🇳🇴' },
    // { code: 'pl', languageCode: 'pl', countryCode: 'PL', name: 'Polski', nativeName: 'Polski', flag: '🇵🇱' },
    // { code: 'pt-BR', languageCode: 'pt', countryCode: 'BR', name: 'Português do Brasil', nativeName: 'Português (Brasil)', flag: '🇧🇷' },
    // { code: 'ro', languageCode: 'ro', countryCode: 'RO', name: 'Română', nativeName: 'Română', flag: '🇷🇴' },
    // { code: 'ru', languageCode: 'ru', countryCode: 'RU', name: 'Русский', nativeName: 'Русский', flag: '🇷🇺' },
    // { code: 'sv', languageCode: 'sv', countryCode: 'SE', name: 'Svenska', nativeName: 'Svenska', flag: '🇸🇪' },
    // { code: 'th', languageCode: 'th', countryCode: 'TH', name: 'ไทย', nativeName: 'ไทย', flag: '🇹🇭' },
    { code: 'tr', languageCode: 'tr', countryCode: 'TR', name: 'Türkçe', nativeName: 'Türkçe', flag: '🇹🇷' }
    // { code: 'uk', languageCode: 'uk', countryCode: 'UA', name: 'Українська', nativeName: 'Українська', flag: '🇺🇦' },
    // { code: 'vi', languageCode: 'vi', countryCode: 'VN', name: 'Tiếng Việt', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
    // { code: 'zh-TW', languageCode: 'zh', countryCode: 'TW', name: '繁體中文', nativeName: '繁體中文', flag: '🇹🇼' }
  ];

  const selectedLanguageDetails = languages.find(lang => lang.code === selectedLanguage);

  return (
    <div className="flex h-screen">
      <SettingsSidebar activeTab="language" />
      <div className="flex-1 flex flex-col p-4">
        <h1 className="text-2xl font-bold mb-4">{translations['language.settingsTitle'] || 'Language Settings'}</h1>
        {selectedLanguageDetails && (
          <div className="mb-4 text-lg flex items-center gap-2">
            <span>
              {translations['language.selected'] || 'Selected Language'}: {selectedLanguageDetails.name} ({selectedLanguageDetails.nativeName})
            </span>
            <CircleFlag countryCode={selectedLanguageDetails.countryCode.toLowerCase()} style={{ width: '1.5em', height: '1.5em' }} className="rounded-full" />
          </div>
        )}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="space-y-4 px-4">
            {languages.map(language => (
              <div key={language.code} className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer ${selectedLanguage === language.code ? 'bg-muted/30 border-primary' : 'border-muted'}`} onClick={() => handleLanguageChange(language.code)}>
                <div className="flex items-center gap-4">
                  <span className="text-2xl">
                    <CircleFlag countryCode={language.countryCode.toLowerCase()} style={{ width: '2em', height: '2em' }} className="rounded-full" />
                  </span>
                  <div>
                    <p className="font-medium">{language.name}</p>
                    <p className="text-sm text-muted-foreground">{language.nativeName}</p>
                  </div>
                </div>
                {selectedLanguage === language.code && <Check className="h-5 w-5 text-primary" />}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
