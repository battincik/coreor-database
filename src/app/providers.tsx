'use client';

import { LanguageProvider } from '@/context/LanguageContext';
import { DesktopProvider } from '@/context/DesktopContext';
import { AuthProvider } from '@/context/AuthContext';
import { DatabaseProvider } from '@/context/DatabaseContext';
import { LegacyTranslationBridge } from '@/components/legacy-translation-bridge';
import { DeveloperToolsGate } from '@/components/developer-tools-gate';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <AuthProvider>
        <DesktopProvider>
        <DatabaseProvider>
          <LegacyTranslationBridge />
          <DeveloperToolsGate />
          {children}
        </DatabaseProvider>
        </DesktopProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
export default Providers;
