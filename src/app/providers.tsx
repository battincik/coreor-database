'use client';

import { LanguageProvider } from '@/context/LanguageContext';
import { AuthProvider } from '@/context/AuthContext';
import { DatabaseProvider } from '@/context/DatabaseContext';
import { LanguageSwitcher } from '@/components/language-switcher';
import { LegacyTranslationBridge } from '@/components/legacy-translation-bridge';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <AuthProvider>
        <DatabaseProvider>
          <LegacyTranslationBridge />
          {children}
          <LanguageSwitcher />
        </DatabaseProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
export default Providers;
