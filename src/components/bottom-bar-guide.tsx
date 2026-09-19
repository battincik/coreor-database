'use client';

import React, { useContext, useMemo, useSyncExternalStore } from 'react';
import {
  Activity,
  Clock3,
  Database,
  Gauge,
  HardDrive,
  Info,
  Network,
  Server,
  ShieldCheck,
  Table,
  TerminalSquare
} from 'lucide-react';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useLanguage } from '@/context/LanguageContext';
import {
  getActivitiesServerSnapshot,
  getActivitiesSnapshot,
  subscribeActivities
} from '@/lib/activityConsole';

interface BottomBarGuideProps {
  selectedDatabase?: string | null;
  selectedTable?: string | null;
}


export function BottomBarGuide({ selectedDatabase, selectedTable }: BottomBarGuideProps) {
  const { t } = useLanguage();
  const { servers, activeServerId } = useContext(DatabaseContext)!;
  const activities = useSyncExternalStore(subscribeActivities, getActivitiesSnapshot, getActivitiesServerSnapshot);
  const activeServer = servers.find(server => server.id === activeServerId) || null;
  const errorCount = useMemo(() => activities.filter(entry => entry.level === 'error').length, [activities]);
  const items = useMemo(() => [
    { icon: Server, title: t('statusGuide.connectionEngine'), text: t('statusGuide.connectionEngineDescription') },
    { icon: Clock3, title: t('statusGuide.twoDurations'), text: t('statusGuide.twoDurationsDescription') },
    { icon: Activity, title: t('bottomBar.connectionsThreads'), text: t('statusGuide.threadsDescription') },
    { icon: Gauge, title: t('bottomBar.bufferPool'), text: t('statusGuide.bufferDescription') },
    { icon: HardDrive, title: t('bottomBar.storage'), text: t('statusGuide.storageDescription') },
    { icon: Network, title: t('database.traffic'), text: t('statusGuide.trafficDescription') },
    { icon: Table, title: t('bottomBar.gridStatus'), text: t('statusGuide.gridDescription') },
    { icon: TerminalSquare, title: t('statusGuide.sqlSummary'), text: t('statusGuide.sqlSummaryDescription') }
  ], [t]);

  return (
    <div className="group relative z-[170] flex h-full shrink-0 items-stretch">
      <button
        type="button"
        aria-label={t('statusGuide.detailTitle')}
        className="flex h-full items-center gap-1.5 px-2.5 text-[9px] text-zinc-500 transition hover:bg-white/[0.04] hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500/30"
        title={t('statusGuide.tooltip')}
      >
        <Info className="h-3 w-3" />
        <span className="hidden xl:inline">{t('statusGuide.title')}</span>
      </button>

      <div className="pointer-events-none absolute bottom-[calc(100%+6px)] right-0 hidden w-[min(680px,82vw)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/98 shadow-2xl backdrop-blur-xl group-hover:block group-focus-within:block">
        <div className="border-b border-zinc-800 bg-gradient-to-r from-cyan-500/[0.08] via-transparent to-purple-500/[0.08] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300"><Info className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-zinc-100">{t('statusGuide.tooltip')}</div>
              <p className="mt-1 text-[10px] leading-5 text-zinc-500">{t('statusGuide.intro')}</p>
            </div>
            <span className="rounded-full border border-zinc-800 bg-black/20 px-2 py-1 text-[8px] text-zinc-500">v2.0.2</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-2.5"><div className="text-[8px] uppercase tracking-wider text-zinc-600">{t('statusGuide.server')}</div><div className="mt-1 truncate text-[10px] font-medium text-zinc-200">{activeServer?.name || t('statusGuide.notSelected')}</div></div>
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-2.5"><div className="text-[8px] uppercase tracking-wider text-zinc-600">{t('database.database')}</div><div className="mt-1 truncate text-[10px] font-medium text-zinc-200">{selectedDatabase || t('query.serverScope')}</div></div>
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-2.5"><div className="text-[8px] uppercase tracking-wider text-zinc-600">{t('database.table')}</div><div className="mt-1 truncate text-[10px] font-medium text-zinc-200">{selectedTable || t('statusGuide.notSelected')}</div></div>
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-2.5"><div className="text-[8px] uppercase tracking-wider text-zinc-600">{t('statusGuide.sqlSession')}</div><div className={`mt-1 text-[10px] font-medium ${errorCount ? 'text-amber-300' : 'text-emerald-300'}`}>{t('statusGuide.sqlSessionSummary', { operations: activities.length, errors: errorCount })}</div></div>
          </div>
        </div>

        <div className="grid gap-px bg-zinc-800 sm:grid-cols-2">
          {items.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex gap-3 bg-zinc-950 p-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-black/20 text-zinc-500"><Icon className="h-3.5 w-3.5" /></div>
                <div><div className="text-[10px] font-semibold text-zinc-200">{item.title}</div><p className="mt-1 text-[9px] leading-4 text-zinc-600">{item.text}</p></div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 border-t border-zinc-800 px-4 py-3 text-[9px] text-zinc-600">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          {t('statusGuide.privacyNote')}
        </div>
      </div>
    </div>
  );
}
