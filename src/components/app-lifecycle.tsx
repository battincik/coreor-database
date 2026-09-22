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
      listen<{ downloaded: number; total: number | null }>('coreor:update-progress', e => setUpdateProgress(e.payload.downloaded, e.payload.total)),
      listen('coreor:update-installing', setUpdateInstalling)
    ];
    void checkForUpdates().finally(() => { if (!disposed) setStartup(false); });
    // An unavailable update server must never trap the user at the splash screen.
    const timeout = window.setTimeout(() => setStartup(false), 12_000);
    return () => { disposed = true; cleanup(); clearTimeout(timeout); subscriptions.forEach(p => { void p.then(fn => fn()).catch(() => undefined); }); };
  }, []);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    const interval = window.setInterval(() => { void checkForUpdates(); }, preferences.updateCheckMinutes * 60_000);
    return () => clearInterval(interval);
  }, [preferences.updateCheckMinutes]);
  const installing = update.phase === 'downloading' || update.phase === 'installing';
  if (!installing && !(startup && update.phase === 'checking')) return null;
  return <div role="status" aria-live="polite" className="fixed inset-0 z-[9999] flex items-center justify-center bg-background text-foreground">
    <div className="flex w-80 flex-col items-center gap-7 border border-border bg-background p-10 text-center shadow-2xl">
      <Database className="h-16 w-16 text-emerald-400" />
      <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t(`updates.${installing ? update.phase : 'checking'}`)}</div>
      {update.progress !== null && <div className="w-full"><progress aria-label={t('updates.downloading')} max={100} value={update.progress} className="h-1 w-full accent-emerald-400" /><p className="mt-2 text-xs">{update.progress}%</p></div>}
    </div>
  </div>;
}
