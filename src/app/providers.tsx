'use client';

import { AppLifecycle } from '@/components/app-lifecycle';
import { EditorPanelErrorBoundary } from '@/components/editor-panel-error-boundary';
import { LanguageProvider } from '@/context/LanguageContext';
import { DesktopProvider } from '@/context/DesktopContext';
import { AuthProvider } from '@/context/AuthContext';
import { DatabaseProvider } from '@/context/DatabaseContext';
import { LegacyTranslationBridge } from '@/components/legacy-translation-bridge';
import { DeveloperToolsGate } from '@/components/developer-tools-gate';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <AppLifecycle />
      <EditorPanelErrorBoundary resetKey="application">
      <AuthProvider>
        <DesktopProvider>
        <DatabaseProvider>
          <LegacyTranslationBridge />
          <DeveloperToolsGate />
          {children}
        </DatabaseProvider>
        </DesktopProvider>
      </AuthProvider>
      </EditorPanelErrorBoundary>
    </LanguageProvider>
  );
}
export default Providers;
