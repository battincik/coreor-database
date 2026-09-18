'use client';

import { useEffect } from 'react';
import { openDeveloperTools, setDeveloperToolsEnabled } from '@/lib/desktopClient';
import { useAppPreferences } from '@/lib/appPreferences';

export function DeveloperToolsGate() {
  const { preferences } = useAppPreferences();

  useEffect(() => {
    void setDeveloperToolsEnabled(preferences.developerToolsEnabled)
      .catch(error => console.error('DevTools politikası uygulanamadı:', error));
  }, [preferences.developerToolsEnabled]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const developerShortcut =
        event.key === 'F12'
        || ((event.ctrlKey || event.metaKey) && event.shiftKey && ['i', 'j'].includes(event.key.toLocaleLowerCase('en-US')));

      if (!developerShortcut) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (!preferences.developerToolsEnabled) return;
      void openDeveloperTools().catch(error => console.error('DevTools açılamadı:', error));
    };

    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [preferences.developerToolsEnabled]);

  return null;
}
