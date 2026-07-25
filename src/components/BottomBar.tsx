'use client';

import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Terminal,
  Trash2,
  X,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatabaseContext } from '@/context/DatabaseContext';
import {
  clearActivities,
  exportActivities,
  getActivitiesServerSnapshot,
  getActivitiesSnapshot,
  subscribeActivities,
  type ActivityEntry
} from '@/lib/activityConsole';

interface BottomBarProps {
  selectedDatabase?: string | null;
  selectedTable?: string | null;
}

type ConsoleFilter = 'all' | 'success' | 'errors';

function formatClock(timestamp: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  }).format(new Date(timestamp));
}

function formatDateTime(timestamp: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'long',
    timeStyle: 'medium'
  }).format(new Date(timestamp));
}

function statusIcon(level: ActivityEntry['level'], className = 'h-3 w-3') {
  if (level === 'success') return <CheckCircle2 className={`${className} text-emerald-400`} />;
  if (level === 'warning') return <AlertTriangle className={`${className} text-amber-400`} />;
  if (level === 'error') return <XCircle className={`${className} text-red-400`} />;
  return <CheckCircle2 className={`${className} text-cyan-400`} />;
}

function statusLabel(level: ActivityEntry['level']) {
  if (level === 'success') return 'Başarılı';
  if (level === 'warning') return 'Uyarı';
  if (level === 'error') return 'Hata';
  return 'Çalıştırıldı';
}

function queryTarget(entry: ActivityEntry) {
  const databaseTarget = entry.databaseName
    ? `${entry.databaseName}${entry.tableName ? `.${entry.tableName}` : ''}`
    : entry.tableName || 'veritabanı yok';

  return `${entry.serverName || 'Coreor'} • ${databaseTarget}`;
}

function downloadActivityLog() {
  const blob = new Blob([exportActivities()], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `coreor-sql-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function QueryDetailModal({ entry, onClose }: { entry: ActivityEntry | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [entry?.id]);

  if (!entry || typeof document === 'undefined') return null;

  const copySql = async () => {
    await navigator.clipboard.writeText(entry.sql);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" aria-label="Kapat" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-start justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 rounded-md border border-zinc-800 bg-black/30 p-2">{statusIcon(entry.level, 'h-4 w-4')}</div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-zinc-100">{entry.title}</h2>
              <p className="mt-1 text-xs text-zinc-500">{formatDateTime(entry.timestamp)}</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">Durum</div>
              <div className={entry.level === 'error' ? 'mt-1 font-medium text-red-400' : entry.level === 'warning' ? 'mt-1 font-medium text-amber-400' : 'mt-1 font-medium text-emerald-400'}>{statusLabel(entry.level)}</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">Süre</div>
              <div className="mt-1 font-medium text-zinc-200">{typeof entry.durationMs === 'number' ? `${entry.durationMs} ms` : '—'}</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">Dönen satır</div>
              <div className="mt-1 font-medium text-zinc-200">{typeof entry.rowCount === 'number' ? entry.rowCount.toLocaleString('tr-TR') : '—'}</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">Etkilenen satır</div>
              <div className="mt-1 font-medium text-zinc-200">{typeof entry.affectedRows === 'number' ? entry.affectedRows.toLocaleString('tr-TR') : '—'}</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">Sunucu</div>
              <div className="mt-1 text-zinc-200">{entry.serverName || '—'}</div>
              {entry.host && <div className="mt-0.5 font-mono text-[11px] text-zinc-500">{entry.host}</div>}
            </div>
            <div className="rounded-lg border border-zinc-800 p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">Hedef</div>
              <div className="mt-1 font-mono text-zinc-200">{entry.databaseName || '—'}{entry.tableName ? `.${entry.tableName}` : ''}</div>
              {entry.errorCode && <div className="mt-0.5 text-[11px] text-red-400">{entry.errorCode}</div>}
            </div>
          </div>

          {entry.message && (
            <div className={`rounded-lg border px-3 py-2.5 ${entry.level === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-zinc-800 bg-black/20 text-zinc-400'}`}>
              {entry.message}
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
              <span className="font-medium text-zinc-300">SQL</span>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={copySql}>
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Kopyalandı' : 'Kopyala'}
              </Button>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap bg-black/40 p-4 font-mono text-[11px] leading-5 text-cyan-200">{entry.sql}</pre>
          </div>

          {entry.parameters && entry.parameters.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-zinc-800">
              <div className="border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 font-medium text-zinc-300">Parametreler</div>
              <pre className="max-h-48 overflow-auto bg-black/40 p-4 font-mono text-[11px] leading-5 text-amber-200">{JSON.stringify(entry.parameters, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function BottomBar({ selectedDatabase, selectedTable }: BottomBarProps) {
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [filter, setFilter] = useState<ConsoleFilter>('all');
  const [selectedEntry, setSelectedEntry] = useState<ActivityEntry | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const queryEntries = useSyncExternalStore(subscribeActivities, getActivitiesSnapshot, getActivitiesServerSnapshot);
  const { servers, activeServerId, isServersLoading } = useContext(DatabaseContext)!;
  const activeServer = servers.find(server => server.id === activeServerId) ?? null;

  const filteredEntries = useMemo(() => {
    if (filter === 'success') return queryEntries.filter(entry => entry.level === 'success');
    if (filter === 'errors') return queryEntries.filter(entry => entry.level === 'error' || entry.level === 'warning');
    return queryEntries;
  }, [queryEntries, filter]);

  const metrics = useMemo(() => {
    const successful = queryEntries.filter(entry => entry.level === 'success').length;
    const failed = queryEntries.filter(entry => entry.level === 'error').length;
    const lastDuration = [...queryEntries].reverse().find(entry => typeof entry.durationMs === 'number')?.durationMs;
    return { successful, failed, lastDuration };
  }, [queryEntries]);

  useEffect(() => {
    if (isConsoleOpen) endRef.current?.scrollIntoView({ block: 'end' });
  }, [filteredEntries.length, isConsoleOpen]);

  return (
    <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 text-xs">
      <div className={`flex flex-col transition-[height] duration-200 ${isConsoleOpen ? 'h-52' : 'h-8'}`}>
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-zinc-800/80 px-2">
          <button type="button" className="flex min-w-0 items-center gap-2 text-zinc-300 hover:text-white" onClick={() => setIsConsoleOpen(previous => !previous)}>
            <Terminal className="h-3.5 w-3.5" />
            <span className="font-medium">SQL günlüğü</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{queryEntries.length}</span>
            {isConsoleOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>

          {isConsoleOpen && (
            <div className="flex items-center gap-1">
              <div className="mr-1 flex items-center rounded-md border border-zinc-800 bg-black/20 p-0.5">
                {(['all', 'success', 'errors'] as ConsoleFilter[]).map(item => (
                  <button
                    key={item}
                    type="button"
                    className={`rounded px-2 py-1 text-[10px] ${filter === item ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
                    onClick={() => setFilter(item)}
                  >
                    {item === 'all' ? 'Tümü' : item === 'success' ? 'Başarılı' : 'Hatalar'}
                  </button>
                ))}
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-white" onClick={downloadActivityLog} title="SQL günlüğünü dışa aktar">
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-red-400" onClick={clearActivities} title="SQL günlüğünü temizle">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {isConsoleOpen && (
          <div className="min-h-0 flex-1 overflow-auto font-mono">
            {filteredEntries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[11px] text-zinc-600">Henüz çalıştırılmış SQL sorgusu yok.</div>
            ) : (
              <div className="divide-y divide-zinc-900/80">
                {filteredEntries.map(entry => (
                  <div key={entry.id} className="grid h-7 grid-cols-[22px_82px_minmax(180px,0.42fr)_minmax(280px,1fr)_auto] items-center gap-1 px-1 text-[10px] leading-none hover:bg-white/[0.025]">
                    <button type="button" className="flex h-5 w-5 items-center justify-center rounded hover:bg-zinc-800" onClick={() => setSelectedEntry(entry)} title="İşlem özetini aç">
                      {statusIcon(entry.level)}
                    </button>
                    <span className="tabular-nums text-zinc-600">{formatClock(entry.timestamp)}</span>
                    <span className="min-w-0 truncate text-zinc-500" title={queryTarget(entry)}>
                      <span className="text-zinc-200">{entry.serverName || 'Coreor'}</span>
                      <span className="mx-1 text-zinc-700">•</span>
                      <span>{entry.databaseName || 'veritabanı yok'}{entry.tableName ? `.${entry.tableName}` : ''}</span>
                    </span>
                    <code className={`block min-w-0 truncate ${entry.level === 'error' ? 'text-red-300' : 'text-cyan-300'}`}>{entry.sql}</code>
                    <div className="flex items-center gap-2 whitespace-nowrap pr-1 text-[10px] text-zinc-600">
                      {typeof entry.rowCount === 'number' && <span>{entry.rowCount.toLocaleString('tr-TR')} satır</span>}
                      {typeof entry.affectedRows === 'number' && <span>{entry.affectedRows.toLocaleString('tr-TR')} etkilendi</span>}
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
          <span>{queryEntries.length} SQL</span>
          <span className="text-emerald-500/80">{metrics.successful} başarılı</span>
          <span className={metrics.failed > 0 ? 'text-red-400' : ''}>{metrics.failed} hata</span>
          {typeof metrics.lastDuration === 'number' && <span>son: {metrics.lastDuration} ms</span>}
        </div>
      </div>

      <QueryDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
}
