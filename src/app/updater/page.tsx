'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Database, Download, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

type UpdatePhase = 'downloading' | 'verifying' | 'installing';
type UpdateWindowSnapshot = {
  version: string;
  phase: UpdatePhase;
  downloaded: number;
  total: number | null;
};

const initial: UpdateWindowSnapshot = { version: '', phase: 'downloading', downloaded: 0, total: null };

export default function UpdaterPage() {
  const { t } = useLanguage();
  const [update, setUpdate] = useState(initial);

  useEffect(() => {
    let disposed = false;
    let eventCount = 0;
    let unlisten: UnlistenFn[] = [];

    async function subscribe() {
      try {
        const subscriptions = await Promise.all([
          listen<{ downloaded: number; total: number | null }>('coreor:update-progress', event => {
            eventCount++;
            setUpdate(previous => ({ ...previous, phase: 'downloading', ...event.payload }));
          }),
          listen('coreor:update-verifying', () => {
            eventCount++;
            setUpdate(previous => ({ ...previous, phase: 'verifying' }));
          }),
          listen('coreor:update-installing', () => {
            eventCount++;
            setUpdate(previous => ({ ...previous, phase: 'installing' }));
          })
        ]);
        if (disposed) {
          subscriptions.forEach(stop => stop());
          return;
        }
        unlisten = subscriptions;
        const beforeSnapshot = eventCount;
        const snapshot = await invoke<UpdateWindowSnapshot>('update_window_snapshot');
        if (!disposed && eventCount === beforeSnapshot) setUpdate(snapshot);
      } catch {
        // The main window is restored and displays the error if installation fails.
      }
    }

    void subscribe();
    return () => {
      disposed = true;
      unlisten.forEach(stop => stop());
    };
  }, []);

  const percent = update.total && update.total > 0
    ? Math.min(100, Math.round(update.downloaded / update.total * 100))
    : null;
  const downloading = update.phase === 'downloading';

  return (
    <main className="relative flex h-screen w-screen select-none flex-col overflow-hidden border border-zinc-700/70 bg-[#0c1017] text-zinc-100">
      <div className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-cyan-400/[0.08] blur-3xl" />

      <header data-tauri-drag-region className="relative flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] px-5">
        <div data-tauri-drag-region className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
          <Database className="pointer-events-none h-4 w-4" strokeWidth={1.8} />
        </div>
        <span data-tauri-drag-region className="text-[12px] font-semibold tracking-wide">Coreor Database</span>
        {update.version && <span data-tauri-drag-region className="ml-auto rounded-md border border-white/10 px-2 py-1 font-mono text-[10px] text-zinc-400">v{update.version}</span>}
      </header>

      <div className="relative flex flex-1 flex-col justify-center px-6 pb-5 pt-4" role="status" aria-live="polite">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
            {update.phase === 'verifying' ? <ShieldCheck className="h-5 w-5" />
              : downloading ? <Download className="h-5 w-5" />
                : <LoaderCircle className="h-5 w-5 animate-spin" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-[14px] font-semibold">{t('updates.windowTitle')}</h1>
            <p className="mt-0.5 text-[11px] text-zinc-400">{t('updates.windowDescription')}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 text-[11px]">
          <span className="text-zinc-200">{t(`updates.${update.phase}`)}</span>
          {downloading && percent !== null && <span className="font-mono text-cyan-300">{percent}%</span>}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800" role="progressbar"
          aria-label={t(`updates.${update.phase}`)} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={downloading && percent !== null ? percent : undefined}>
          {downloading && percent !== null
            ? <div className="h-full rounded-full bg-cyan-400 transition-[width] duration-200" style={{ width: `${percent}%` }} />
            : <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-400/80" />}
        </div>
        <p className="mt-4 text-[10px] text-zinc-500">{t('updates.windowRestart')}</p>
      </div>
    </main>
  );
}
