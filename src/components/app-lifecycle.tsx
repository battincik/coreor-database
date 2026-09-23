'use client';

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { installErrorListeners } from '@/lib/errorReporting';
import { isDesktopRuntime } from '@/lib/desktopClient';
import { checkForUpdates, setUpdateProgress, setUpdateInstalling, setUpdateVerifying } from '@/lib/appUpdater';
import { useAppPreferences } from '@/lib/appPreferences';

export function AppLifecycle() {
  const { preferences } = useAppPreferences();

  useEffect(() => {
    const cleanup = installErrorListeners();
    if (!isDesktopRuntime()) return cleanup;

    const subscriptions = [
      listen<{ downloaded: number; total: number | null }>('coreor:update-progress', event =>
        setUpdateProgress(event.payload.downloaded, event.payload.total)
      ),
      listen('coreor:update-verifying', setUpdateVerifying),
      listen('coreor:update-installing', setUpdateInstalling)
    ];

    void checkForUpdates();

    return () => {
      cleanup();
      subscriptions.forEach(subscription => {
        void subscription.then(unlisten => unlisten()).catch(() => undefined);
      });
    };
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    const interval = window.setInterval(() => {
      void checkForUpdates();
    }, preferences.updateCheckMinutes * 60_000);
    return () => clearInterval(interval);
  }, [preferences.updateCheckMinutes]);

  return null;
}
