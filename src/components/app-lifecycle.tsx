'use client';

import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Database, Loader2 } from 'lucide-react';
import { installErrorListeners } from '@/lib/errorReporting';
import { isDesktopRuntime } from '@/lib/desktopClient';
import { checkForUpdates, useAppUpdater, setUpdateProgress, setUpdateInstalling } from '@/lib/appUpdater';
import { useAppPreferences } from '@/lib/appPreferences';
import { useLanguage } from '@/context/LanguageContext';

export function AppLifecycle() {
  const { t } = useLanguage();
  const { preferences } = useAppPreferences();
  const update = useAppUpdater();
  const [startup, setStartup] = useState(true);

  useEffect(() => {
    const cleanup = installErrorListeners();
    if (!isDesktopRuntime()) return cleanup;

    let disposed = false;
    const subscriptions = [
      listen<{ downloaded: number; total: number | null }>('coreor:update-progress', event =>
        setUpdateProgress(event.payload.downloaded, event.payload.total)
      ),
      listen('coreor:update-installing', setUpdateInstalling)
    ];

    void checkForUpdates().finally(() => {
      if (!disposed) setStartup(false);
    });

    const timeout = window.setTimeout(() => setStartup(false), 12_000);

    return () => {
      disposed = true;
      cleanup();
      clearTimeout(timeout);
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

  const installing = update.phase === 'downloading' || update.phase === 'installing';
  if (!installing && !(startup && update.phase === 'checking')) return null;

  const phase = installing ? update.phase : 'checking';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/96 text-zinc-100"
    >
      <div className="w-[360px] rounded-2xl border border-zinc-800 bg-zinc-950/95 p-6 shadow-[0_28px_90px_rgba(0,0,0,.7)]">
        <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06]">
            <Database className="h-5 w-5 text-cyan-300" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold">Coreor Database</div>
            <div className="mt-0.5 text-[8px] text-zinc-600">{t('updates.lifecycleDescription')}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 py-5 text-[10px] text-zinc-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
          <span>{t(`updates.${phase}`)}</span>
          {update.version && <span className="ml-auto font-mono text-[9px] text-zinc-600">v{update.version}</span>}
        </div>

        {update.progress !== null && (
          <div className="space-y-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-900">
              <div
                className="h-full rounded-full bg-cyan-400 transition-[width]"
                style={{ width: `${Math.max(0, Math.min(100, update.progress))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[8px] text-zinc-600">
              <span>{t('updates.downloading')}</span>
              <span className="font-mono text-cyan-300">{update.progress}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
