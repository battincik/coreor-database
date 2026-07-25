'use client';

import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock, Download, Filter, Terminal, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatabaseContext } from '@/context/DatabaseContext';
import {
  clearActivities,
  exportActivities,
  getActivitiesServerSnapshot,
  getActivitiesSnapshot,
  recordActivity,
  subscribeActivities,
  type ActivityEntry
} from '@/lib/activityConsole';

interface BottomBarProps {
  selectedDatabase?: string | null;
  selectedTable?: string | null;
}

type ConsoleFilter = 'all' | 'sql' | 'errors';

const CATEGORY_LABELS: Record<ActivityEntry['category'], string> = {
  system: 'Sistem',
  vault: 'Kasa',
  connection: 'Bağlantı',
  catalog: 'Katalog',
  schema: 'Şema',
  data: 'Veri',
  query: 'SQL',
  navigation: 'Gezinme'
};

function formatClock(timestamp: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  }).format(new Date(timestamp));
}

function statusIcon(level: ActivityEntry['level']) {
  if (level === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  if (level === 'error') return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  if (level === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />;
  if (level === 'sql') return <Terminal className="h-3.5 w-3.5 text-cyan-400" />;
  return <Clock className="h-3.5 w-3.5 text-zinc-500" />;
}

function downloadActivityLog() {
  const blob = new Blob([exportActivities()], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `coreor-database-activity-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function BottomBar({ selectedDatabase, selectedTable }: BottomBarProps) {
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [filter, setFilter] = useState<ConsoleFilter>('all');
  const endRef = useRef<HTMLDivElement | null>(null);
  const hasRecordedSession = useRef(false);
  const activityEntries = useSyncExternalStore(subscribeActivities, getActivitiesSnapshot, getActivitiesServerSnapshot);
  const { servers, activeServerId, isServersLoading } = useContext(DatabaseContext)!;
  const activeServer = servers.find(server => server.id === activeServerId) ?? null;

  useEffect(() => {
    if (hasRecordedSession.current) return;
    hasRecordedSession.current = true;
    recordActivity({
      level: 'info',
      category: 'system',
      title: 'Editör oturumu hazır',
      message: 'Veritabanı işlemleri bu konsolda gerçek zamanlı listelenecek.'
    });
  }, []);

  const filteredEntries = useMemo(() => {
    if (filter === 'sql') {
      return activityEntries.filter(entry => entry.category === 'query' || Boolean(entry.sql));
    }

    if (filter === 'errors') {
      return activityEntries.filter(entry => entry.level === 'error' || entry.level === 'warning');
    }

    return activityEntries;
  }, [activityEntries, filter]);

  const metrics = useMemo(() => {
    const successful = activityEntries.filter(entry => entry.level === 'success').length;
    const failed = activityEntries.filter(entry => entry.level === 'error').length;
    const queries = activityEntries.filter(entry => entry.category === 'query' && entry.level !== 'info').length;
    const lastDuration = [...activityEntries].reverse().find(entry => typeof entry.durationMs === 'number')?.durationMs;

    return { successful, failed, queries, lastDuration };
  }, [activityEntries]);

  useEffect(() => {
    if (isConsoleOpen) {
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [filteredEntries.length, isConsoleOpen]);

  return (
    <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 text-xs">
      <div className={`flex flex-col transition-[height] duration-200 ${isConsoleOpen ? 'h-56' : 'h-8'}`}>
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-zinc-800/80 px-2">
          <button type="button" className="flex min-w-0 items-center gap-2 text-zinc-300 hover:text-white" onClick={() => setIsConsoleOpen(previous => !previous)}>
            <Terminal className="h-3.5 w-3.5" />
            <span className="font-medium">İşlem konsolu</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{activityEntries.length}</span>
            {isConsoleOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>

          {isConsoleOpen && (
            <div className="flex items-center gap-1">
              <div className="mr-1 flex items-center rounded-md border border-zinc-800 bg-black/20 p-0.5">
                <Filter className="mx-1 h-3 w-3 text-zinc-500" />
                {(['all', 'sql', 'errors'] as ConsoleFilter[]).map(item => (
                  <button
                    key={item}
                    type="button"
                    className={`rounded px-2 py-1 text-[10px] ${filter === item ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
                    onClick={() => setFilter(item)}
                  >
                    {item === 'all' ? 'Tümü' : item === 'sql' ? 'SQL' : 'Hatalar'}
                  </button>
                ))}
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-white" onClick={downloadActivityLog} title="Konsolu dışa aktar">
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-red-400" onClick={clearActivities} title="Konsolu temizle">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {isConsoleOpen && (
          <div className="min-h-0 flex-1 overflow-auto font-mono">
            {filteredEntries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[11px] text-zinc-600">Bu filtre için henüz işlem kaydı yok.</div>
            ) : (
              <div className="divide-y divide-zinc-900">
                {filteredEntries.map(entry => (
                  <div key={entry.id} className="grid grid-cols-[84px_20px_minmax(110px,0.5fr)_minmax(180px,1fr)_auto] items-start gap-2 px-2 py-1.5 text-[11px] hover:bg-white/[0.025]">
                    <span className="tabular-nums text-zinc-600">{formatClock(entry.timestamp)}</span>
                    <span className="pt-0.5">{statusIcon(entry.level)}</span>
                    <div className="min-w-0">
                      <div className="truncate text-zinc-300">{CATEGORY_LABELS[entry.category]}</div>
                      <div className="truncate text-[10px] text-zinc-600">{entry.serverName || 'Coreor'}</div>
                    </div>
                    <div className="min-w-0">
                      <div className={`truncate ${entry.level === 'error' ? 'text-red-300' : entry.level === 'warning' ? 'text-amber-300' : 'text-zinc-200'}`}>{entry.title}</div>
                      {entry.message && <div className="truncate text-[10px] text-zinc-500">{entry.message}</div>}
                      {entry.sql && <code className="mt-1 block max-w-full truncate rounded bg-black/40 px-1.5 py-1 text-[10px] text-cyan-300">{entry.sql}</code>}
                    </div>
                    <div className="flex items-center gap-2 whitespace-nowrap text-[10px] text-zinc-600">
                      {entry.databaseName && <span>{entry.databaseName}{entry.tableName ? `.${entry.tableName}` : ''}</span>}
                      {typeof entry.rowCount === 'number' && <span>{entry.rowCount} satır</span>}
                      {typeof entry.affectedRows === 'number' && <span>{entry.affectedRows} etkilendi</span>}
                      {typeof entry.durationMs === 'number' && <span>{entry.durationMs} ms</span>}
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex h-7 items-center justify-between overflow-hidden border-t border-zinc-800 px-2 text-[10px] text-zinc-500">
        <div className="flex min-w-0 items-center divide-x divide-zinc-800">
          <span className="pr-3 text-zinc-300">
            {isServersLoading ? 'Sunucu kasası okunuyor' : activeServer ? `${activeServer.databaseType === 'mariadb' ? 'MariaDB' : 'MySQL'} ${activeServer.version || ''}` : 'Sunucu bağlı değil'}
          </span>
          {activeServer && (
            <>
              <span className="px-3">{activeServer.host}:{activeServer.port || 3306}</span>
              <span className="px-3">{selectedDatabase || activeServer.databaseName || 'Veritabanı seçilmedi'}{selectedTable ? ` / ${selectedTable}` : ''}</span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 pl-3 tabular-nums">
          <span>{metrics.queries} SQL</span>
          <span className="text-emerald-500/80">{metrics.successful} başarılı</span>
          <span className={metrics.failed > 0 ? 'text-red-400' : ''}>{metrics.failed} hata</span>
          {typeof metrics.lastDuration === 'number' && <span>son: {metrics.lastDuration} ms</span>}
        </div>
      </div>
    </div>
  );
}
