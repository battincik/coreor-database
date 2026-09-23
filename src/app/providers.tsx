'use client';

import { AppLifecycle } from '@/components/app-lifecycle';
import { EditorPanelErrorBoundary } from '@/components/editor-panel-error-boundary';
import { LanguageProvider } from '@/context/LanguageContext';
import { DesktopProvider } from '@/context/DesktopContext';
import { AuthProvider } from '@/context/AuthContext';
import { DatabaseProvider } from '@/context/DatabaseContext';
import { LegacyTranslationBridge } from '@/components/legacy-translation-bridge';
import { DeveloperToolsGate } from '@/components/developer-tools-gate';
import { usePathname } from 'next/navigation';

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The updater is a dedicated webview. It must not initialize database
  // connections or start another update check while the main window is hidden.
  if (pathname?.startsWith('/updater')) {
    return <LanguageProvider>{children}</LanguageProvider>;
  }
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
