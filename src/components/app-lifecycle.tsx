'use client';

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { installErrorListeners } from '@/lib/errorReporting';
import { isDesktopRuntime } from '@/lib/desktopClient';
import { checkForUpdates, installUpdate, setUpdateProgress, setUpdateInstalling, setUpdateVerifying } from '@/lib/appUpdater';
import { getAppPreferences, useAppPreferences } from '@/lib/appPreferences';
import { updateActivity } from '@/lib/updateActivity';

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

    // Only auto-install at startup, before the user begins editing data.
    // An active query, dirty editor or transaction makes the native install
    // refuse immediately; periodic checks never interrupt work.
    let disposed = false;
    void (async () => {
      const available = await checkForUpdates();
      if (!disposed && available && getAppPreferences().autoInstallUpdates && updateActivity.count() === 0) {
        await installUpdate();
      }
    })();

    return () => {
      disposed = true;
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
