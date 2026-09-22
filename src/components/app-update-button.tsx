'use client';
import { useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { installUpdate, useAppUpdater } from '@/lib/appUpdater';
import { updateActivity } from '@/lib/updateActivity';
import { useLanguage } from '@/context/LanguageContext';
export function AppUpdateButton() {
  const { t } = useLanguage();
  const update = useAppUpdater();
  const busy = useSyncExternalStore(updateActivity.subscribe, updateActivity.count, () => 0);
  if (!update.version) return null;
  const title = busy ? t('updates.busy') : update.error ? t(`updates.errors.${update.error}`) : t('updates.install', { version: update.version });
  return <button type="button" disabled={busy > 0 || update.phase !== 'available'} title={title} aria-label={title}
    onClick={() => void installUpdate()} className="flex h-9 w-10 shrink-0 items-center justify-center text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">
    <Download className="h-4 w-4" />
  </button>;
}
