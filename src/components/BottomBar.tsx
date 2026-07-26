'use client';

import React, { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Database,
  Download,
  Filter,
  Server,
  Table,
  Terminal,
  Trash2,
  X,
  XCircle
} from 'lucide-react';
import type { GridRuntimeStatus } from 'types';
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

const EMPTY_GRID_STATUS: GridRuntimeStatus = {
  page: 1,
  pageSize: 50,
  totalRows: 0,
  totalPages: 1,
  filters: 0,
  sorts: 0,
  isLoading: false
};

function formatClock(timestamp: string) {
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }).format(new Date(timestamp));
}

function formatDateTime(timestamp: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'medium' }).format(new Date(timestamp));
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
  const target = entry.databaseName ? `${entry.databaseName}${entry.tableName ? `.${entry.tableName}` : ''}` : entry.tableName || 'sunucu geneli';
  return `${entry.serverName || 'Coreor'} • ${target}`;
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

function StatusTooltip({ children, title, rows, align = 'left' }: {
  children: React.ReactNode;
  title: string;
  rows: Array<{ label: string; value: React.ReactNode; tone?: 'normal' | 'success' | 'warning' | 'danger' }>;
  align?: 'left' | 'right';
}) {
  return (
    <div className="group relative flex h-full items-center">
      {children}
      <div className={`pointer-events-none absolute bottom-[calc(100%+7px)] z-[180] hidden w-72 rounded-lg border border-zinc-800 bg-zinc-950/98 p-3 shadow-2xl backdrop-blur group-hover:block ${align === 'right' ? 'right-0' : 'left-0'}`}>
        <div className="mb-2 border-b border-zinc-800 pb-2 text-[11px] font-semibold text-zinc-200">{title}</div>
        <div className="space-y-1.5">
          {rows.map((row, index) => (
            <div key={`${row.label}-${index}`} className="flex items-start justify-between gap-4 text-[10px] leading-4">
              <span className="shrink-0 text-zinc-600">{row.label}</span>
              <span className={`min-w-0 break-all text-right ${row.tone === 'success' ? 'text-emerald-400' : row.tone === 'warning' ? 'text-amber-400' : row.tone === 'danger' ? 'text-red-400' : 'text-zinc-300'}`}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QueryDetailModal({ entry, onClose }: { entry: ActivityEntry | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [entry?.id]);
  if (!entry || typeof document === 'undefined') return null;

  const copySql = async () => {
    await navigator.clipboard.writeText(entry.sql);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-center justify-center p-4">
      <button type="button" aria-label="Kapat" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-start justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 rounded-md border border-zinc-800 bg-black/30 p-2">{statusIcon(entry.level, 'h-4 w-4')}</div>
            <div className="min-w-0"><h2 className="truncate text-sm font-semibold text-zinc-100">{entry.title}</h2><p className="mt-1 text-xs text-zinc-500">{formatDateTime(entry.timestamp)}</p></div>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-xs">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Durum', statusLabel(entry.level)],
              ['Süre', typeof entry.durationMs === 'number' ? `${entry.durationMs} ms` : '—'],
              ['Dönen satır', typeof entry.rowCount === 'number' ? entry.rowCount.toLocaleString('tr-TR') : '—'],
              ['Etkilenen satır', typeof entry.affectedRows === 'number' ? entry.affectedRows.toLocaleString('tr-TR') : '—']
            ].map(([label, value]) => <div key={label} className="rounded-lg border border-zinc-800 bg-black/20 p-3"><div className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</div><div className="mt-1 font-medium text-zinc-200">{value}</div></div>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 p-3"><div className="text-[10px] uppercase tracking-wider text-zinc-600">Sunucu</div><div className="mt-1 text-zinc-200">{entry.serverName || '—'}</div>{entry.host && <div className="mt-0.5 font-mono text-[11px] text-zinc-500">{entry.host}</div>}</div>
            <div className="rounded-lg border border-zinc-800 p-3"><div className="text-[10px] uppercase tracking-wider text-zinc-600">Hedef</div><div className="mt-1 font-mono text-zinc-200">{entry.databaseName || 'sunucu geneli'}{entry.tableName ? `.${entry.tableName}` : ''}</div>{entry.errorCode && <div className="mt-0.5 text-[11px] text-red-400">{entry.errorCode}</div>}</div>
          </div>
          {entry.message && <div className={`rounded-lg border px-3 py-2.5 ${entry.level === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-zinc-800 bg-black/20 text-zinc-400'}`}>{entry.message}</div>}
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-3 py-2"><span className="font-medium text-zinc-300">SQL</span><Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={copySql}>{copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Kopyalandı' : 'Kopyala'}</Button></div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap bg-black/40 p-4 text-left font-mono text-[11px] leading-5 text-cyan-200">{entry.sql}</pre>
          </div>
          {entry.parameters && entry.parameters.length > 0 && <div className="overflow-hidden rounded-lg border border-zinc-800"><div className="border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 font-medium text-zinc-300">Parametreler</div><pre className="max-h-48 overflow-auto bg-black/40 p-4 text-left font-mono text-[11px] leading-5 text-amber-200">{JSON.stringify(entry.parameters, null, 2)}</pre></div>}
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
  const [gridStatus, setGridStatus] = useState<GridRuntimeStatus>(EMPTY_GRID_STATUS);
  const endRef = useRef<HTMLDivElement | null>(null);
  const queryEntries = useSyncExternalStore(subscribeActivities, getActivitiesSnapshot, getActivitiesServerSnapshot);
  const { servers, activeServerId, isServersLoading } = useContext(DatabaseContext)!;
  const activeServer = servers.find(server => server.id === activeServerId) ?? null;

  useEffect(() => {
    const handler = (event: Event) => setGridStatus((event as CustomEvent<GridRuntimeStatus>).detail || EMPTY_GRID_STATUS);
    window.addEventListener('coreor:grid-status', handler);
    return () => window.removeEventListener('coreor:grid-status', handler);
  }, []);

  const filteredEntries = useMemo(() => {
    if (filter === 'success') return queryEntries.filter(entry => entry.level === 'success');
    if (filter === 'errors') return queryEntries.filter(entry => entry.level === 'error' || entry.level === 'warning');
    return queryEntries;
  }, [queryEntries, filter]);

  const metrics = useMemo(() => {
    const successful = queryEntries.filter(entry => entry.level === 'success').length;
    const failed = queryEntries.filter(entry => entry.level === 'error').length;
    const warnings = queryEntries.filter(entry => entry.level === 'warning').length;
    const durations = queryEntries.map(entry => entry.durationMs).filter((value): value is number => typeof value === 'number');
    const averageDuration = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : undefined;
    const completed = successful + failed;
    const successRate = completed ? Math.round(successful / completed * 100) : 100;
    return { successful, failed, warnings, averageDuration, successRate, lastEntry: queryEntries.at(-1) };
  }, [queryEntries]);

  useEffect(() => {
    if (isConsoleOpen) endRef.current?.scrollIntoView({ block: 'end' });
  }, [filteredEntries.length, isConsoleOpen]);

  const engineName = activeServer?.databaseType === 'mariadb' ? 'MariaDB' : 'MySQL';
  const targetName = selectedDatabase || activeServer?.databaseName || 'Sunucu geneli';

  return (
    <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 text-xs">
      <div className={`flex flex-col transition-[height] duration-200 ${isConsoleOpen ? 'h-[212px]' : 'h-8'}`}>
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-zinc-800/80 px-2">
          <button type="button" className="flex min-w-0 items-center gap-2 text-zinc-300 hover:text-white" onClick={() => setIsConsoleOpen(previous => !previous)}>
            <Terminal className="h-3.5 w-3.5" /><span className="font-medium">SQL günlüğü</span><span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-400">{queryEntries.length}</span>{isConsoleOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>
          {isConsoleOpen && <div className="flex items-center gap-1"><div className="mr-1 flex items-center rounded-md border border-zinc-800 bg-black/20 p-0.5">{(['all', 'success', 'errors'] as ConsoleFilter[]).map(item => <button key={item} type="button" className={`rounded px-2 py-1 text-[9px] ${filter === item ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-200'}`} onClick={() => setFilter(item)}>{item === 'all' ? 'Tümü' : item === 'success' ? 'Başarılı' : 'Hatalar'}</button>)}</div><Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-zinc-500" onClick={downloadActivityLog} title="SQL günlüğünü dışa aktar"><Download className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-red-400" onClick={clearActivities} title="SQL günlüğünü temizle"><Trash2 className="h-3.5 w-3.5" /></Button></div>}
        </div>

        {isConsoleOpen && <div className="min-h-0 flex-1 overflow-auto font-mono">
          {filteredEntries.length === 0 ? <div className="flex h-full items-center justify-center text-[9px] text-zinc-600">Henüz çalıştırılmış SQL sorgusu yok.</div> : <div className="divide-y divide-zinc-900/80">
            {filteredEntries.map(entry => <div key={entry.id} className="grid h-[18px] grid-cols-[18px_70px_minmax(150px,0.34fr)_minmax(300px,1fr)_auto] items-center gap-1 px-1 text-left text-[9px] leading-none hover:bg-white/[0.025]">
              <button type="button" className="flex h-4 w-4 items-center justify-center rounded hover:bg-zinc-800" onClick={() => setSelectedEntry(entry)} title="İşlem özetini aç">{statusIcon(entry.level, 'h-2.5 w-2.5')}</button>
              <span className="tabular-nums text-left text-zinc-600">{formatClock(entry.timestamp)}</span>
              <span className="min-w-0 truncate text-left text-zinc-500" title={queryTarget(entry)}><span className="text-zinc-200">{entry.serverName || 'Coreor'}</span><span className="mx-1 text-zinc-700">•</span><span>{entry.databaseName || 'sunucu geneli'}{entry.tableName ? `.${entry.tableName}` : ''}</span></span>
              <code className={`block min-w-0 truncate text-left ${entry.level === 'error' ? 'text-red-300' : 'text-cyan-300'}`}>{entry.sql.replace(/\s+/g, ' ')}</code>
              <div className="flex items-center justify-end gap-2 whitespace-nowrap pr-1 text-[9px] text-zinc-600">{typeof entry.rowCount === 'number' && <span>{entry.rowCount.toLocaleString('tr-TR')} satır</span>}{typeof entry.affectedRows === 'number' && <span>{entry.affectedRows.toLocaleString('tr-TR')} etkilendi</span>}{typeof entry.durationMs === 'number' && <span>{entry.durationMs} ms</span>}</div>
            </div>)}
            <div ref={endRef} />
          </div>}
        </div>}
      </div>

      <div className="flex h-7 items-center justify-between overflow-visible border-t border-zinc-800 px-1 text-[9px] text-zinc-500">
        <div className="flex h-full min-w-0 items-center divide-x divide-zinc-800">
          <StatusTooltip title="Bağlantı profili" rows={[{ label: 'Motor', value: activeServer ? engineName : 'Bağlı değil' }, { label: 'Sürüm profili', value: activeServer?.version || '—' }, { label: 'TLS modu', value: activeServer?.sslMode || '—', tone: activeServer?.sslMode === 'required' ? 'success' : activeServer ? 'warning' : 'normal' }, { label: 'Bağlantı timeout', value: activeServer ? `${activeServer.connectionTimeoutMs || 20000} ms` : '—' }]}><span className="flex h-full items-center gap-1 px-2 text-zinc-300"><Server className="h-3 w-3" />{isServersLoading ? 'Kasa okunuyor' : activeServer ? `${engineName} ${activeServer.version || ''}` : 'Sunucu yok'}</span></StatusTooltip>
          {activeServer && <StatusTooltip title="Ağ ve kullanıcı" rows={[{ label: 'Sunucu adı', value: activeServer.name }, { label: 'Host', value: activeServer.host || '—' }, { label: 'Port', value: activeServer.port || 3306 }, { label: 'Kullanıcı', value: activeServer.username || '—' }]}><span className="flex h-full items-center px-2 font-mono">{activeServer.host}:{activeServer.port || 3306}</span></StatusTooltip>}
          <StatusTooltip title="Aktif hedef" rows={[{ label: 'Veritabanı', value: targetName }, { label: 'Tablo', value: selectedTable || '—' }, { label: 'Katalog veritabanı', value: activeServer?.databases?.length || 0 }, { label: 'Katalog tablo', value: activeServer?.databases?.reduce((total, database) => total + database.tableCount, 0) || 0 }]}><span className="flex h-full max-w-64 items-center gap-1 truncate px-2"><Database className="h-3 w-3" /><span className="truncate">{targetName}{selectedTable ? ` / ${selectedTable}` : ''}</span></span></StatusTooltip>
          {selectedTable && <StatusTooltip title="Tablo gridi" rows={[{ label: 'Sayfa', value: `${gridStatus.page.toLocaleString('tr-TR')} / ${gridStatus.totalPages.toLocaleString('tr-TR')}` }, { label: 'Sayfa boyutu', value: gridStatus.pageSize.toLocaleString('tr-TR') }, { label: 'Toplam satır', value: gridStatus.totalRows.toLocaleString('tr-TR') }, { label: 'Aktif filtre', value: gridStatus.filters }, { label: 'Sıralama kolonu', value: gridStatus.sorts }, { label: 'Durum', value: gridStatus.isLoading ? 'Yükleniyor' : 'Hazır', tone: gridStatus.isLoading ? 'warning' : 'success' }]}><span className="flex h-full items-center gap-1 px-2"><Table className="h-3 w-3" />{gridStatus.page}/{gridStatus.totalPages} • {gridStatus.pageSize}</span></StatusTooltip>}
        </div>

        <div className="flex h-full shrink-0 items-center divide-x divide-zinc-800 pl-1 tabular-nums">
          <StatusTooltip title="SQL performansı" align="right" rows={[{ label: 'Toplam sorgu', value: queryEntries.length }, { label: 'Başarılı', value: metrics.successful, tone: 'success' }, { label: 'Hata', value: metrics.failed, tone: metrics.failed ? 'danger' : 'normal' }, { label: 'Uyarı', value: metrics.warnings, tone: metrics.warnings ? 'warning' : 'normal' }, { label: 'Başarı oranı', value: `%${metrics.successRate}`, tone: metrics.successRate >= 95 ? 'success' : metrics.successRate >= 75 ? 'warning' : 'danger' }, { label: 'Ortalama süre', value: metrics.averageDuration === undefined ? '—' : `${metrics.averageDuration} ms` }]}><span className="flex h-full items-center gap-1 px-2"><Terminal className="h-3 w-3" />{queryEntries.length} SQL</span></StatusTooltip>
          <StatusTooltip title="Aktif grid koşulları" align="right" rows={[{ label: 'Filtre', value: gridStatus.filters }, { label: 'Sıralama', value: gridStatus.sorts }, { label: 'Yükleme', value: gridStatus.isLoading ? 'Devam ediyor' : 'Beklemede', tone: gridStatus.isLoading ? 'warning' : 'normal' }]}><span className="flex h-full items-center gap-2 px-2"><span className={gridStatus.filters ? 'text-cyan-400' : ''}><Filter className="inline h-3 w-3" /> {gridStatus.filters}</span><span className={gridStatus.sorts ? 'text-cyan-400' : ''}><ArrowUpDown className="inline h-3 w-3" /> {gridStatus.sorts}</span></span></StatusTooltip>
          <StatusTooltip title="Son sorgu" align="right" rows={[{ label: 'Zaman', value: metrics.lastEntry ? formatDateTime(metrics.lastEntry.timestamp) : '—' }, { label: 'Durum', value: metrics.lastEntry ? statusLabel(metrics.lastEntry.level) : '—', tone: metrics.lastEntry?.level === 'error' ? 'danger' : metrics.lastEntry ? 'success' : 'normal' }, { label: 'Süre', value: metrics.lastEntry?.durationMs === undefined ? '—' : `${metrics.lastEntry.durationMs} ms` }, { label: 'Hedef', value: metrics.lastEntry ? queryTarget(metrics.lastEntry) : '—' }]}><span className="flex h-full items-center gap-1 px-2"><Clock className="h-3 w-3" />{metrics.lastEntry?.durationMs === undefined ? '—' : `${metrics.lastEntry.durationMs} ms`}</span></StatusTooltip>
        </div>
      </div>

      <QueryDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
}
