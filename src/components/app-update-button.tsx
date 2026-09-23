'use client';

import { useSyncExternalStore } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { installUpdate, useAppUpdater } from '@/lib/appUpdater';
import { updateActivity } from '@/lib/updateActivity';
import { useLanguage } from '@/context/LanguageContext';

export function AppUpdateButton() {
  const { t } = useLanguage();
  const update = useAppUpdater();
  const busy = useSyncExternalStore(updateActivity.subscribe, updateActivity.count, () => 0);

  if (!update.version) return null;

  const blocked = busy > 0 || update.phase !== 'available';
  const title = busy
    ? t('updates.busy')
    : update.error
      ? t(`updates.errors.${update.error}`)
      : t('updates.install', { version: update.version });

  return (
    <button
      type="button"
      disabled={blocked}
      title={title}
      aria-label={title}
      onClick={() => void installUpdate()}
      className="group relative flex h-8 w-10 shrink-0 items-center justify-center border-l border-zinc-800 text-cyan-300 transition hover:bg-cyan-500/[0.07] hover:text-cyan-200 disabled:cursor-not-allowed disabled:text-zinc-700 disabled:hover:bg-transparent"
    >
      {update.phase === 'downloading' || update.phase === 'verifying' || update.phase === 'installing'
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <Download className="h-4 w-4" />}
      {!blocked && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,.75)]" />}
    </button>
  );
}
