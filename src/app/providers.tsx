'use client';

import { LanguageProvider } from '@/context/LanguageContext';
import { DesktopProvider } from '@/context/DesktopContext';
import { AuthProvider } from '@/context/AuthContext';
import { DatabaseProvider } from '@/context/DatabaseContext';
import { LegacyTranslationBridge } from '@/components/legacy-translation-bridge';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <AuthProvider>
        <DesktopProvider>
        <DatabaseProvider>
          <LegacyTranslationBridge />
          {children}
        </DatabaseProvider>
        </DesktopProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
export default Providers;
