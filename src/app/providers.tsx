'use client';

import { LanguageProvider } from '@/context/LanguageContext';
import { DesktopProvider } from '@/context/DesktopContext';
import { DatabaseProvider } from '@/context/DatabaseContext';
import { LegacyTranslationBridge } from '@/components/legacy-translation-bridge';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <DesktopProvider>
        <DatabaseProvider>
          <LegacyTranslationBridge />
          {children}
        </DatabaseProvider>
      </DesktopProvider>
    </LanguageProvider>
  );
}
export default Providers;
