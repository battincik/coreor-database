'use client';

import React, { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
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
  Gauge,
  HardDrive,
  Loader2,
  Network,
  PlugZap,
  Server,
  Table,
  Terminal,
  Timer,
  Trash2,
  Wifi,
  X,
  XCircle
} from 'lucide-react';
import type { GridRuntimeStatus } from 'types';
import type { DatabasePerformanceSnapshot } from '@/lib/databaseWorkbenchTypes';
import { Button } from '@/components/ui/button';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useAuth } from '@/context/AuthContext';
import { fetchDatabasePerformanceSnapshot } from '@/lib/databaseWorkbenchApi';
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

interface ActiveConnectionSession {
  serverId: string;
  startedAt: number;
}

const EMPTY_GRID_STATUS: GridRuntimeStatus = {
  page: 1,
  pageSize: 50,
  totalRows: 0,
  totalPages: 1,
  filters: 0,
  sorts: 0,
  isLoading: false
};

const ACTIVE_CONNECTION_STORAGE_KEY = 'coreor:active-connection-session:v1';

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

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;
  return `${amount.toLocaleString('tr-TR', { maximumFractionDigits: amount >= 100 ? 0 : amount >= 10 ? 1 : 2 })} ${units[index]}`;
}

function formatDuration(totalSeconds: number, detailed = false) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainingSeconds = seconds % 60;
  const values = detailed
    ? [[days, 'gün'], [hours, 'saat'], [minutes, 'dk'], [remainingSeconds, 'sn']] as const
    : [[days, 'g'], [hours, 'sa'], [minutes, 'dk'], [remainingSeconds, 'sn']] as const;
  const visible = values.filter(([value]) => value > 0).slice(0, detailed ? 4 : 2);
  if (!visible.length) return '0 sn';
  return visible.map(([value, unit]) => `${value} ${unit}`).join(' ');
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
  const target = entry.databaseName
    ? `${entry.databaseName}${entry.tableName ? `.${entry.tableName}` : ''}`
    : entry.tableName || 'sunucu geneli';
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

function StatusTooltip({
  children,
  title,
  rows,
  align = 'left'
}: {
  children: React.ReactNode;
  title: string;
  rows: Array<{
    label: string;
    value: React.ReactNode;
    tone?: 'normal' | 'success' | 'warning' | 'danger';
  }>;
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
  const { activeToken } = useAuth();
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [filter, setFilter] = useState<ConsoleFilter>('all');
  const [selectedEntry, setSelectedEntry] = useState<ActivityEntry | null>(null);
  const [gridStatus, setGridStatus] = useState<GridRuntimeStatus>(EMPTY_GRID_STATUS);
  const [serverSnapshot, setServerSnapshot] = useState<DatabasePerformanceSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [connectionStartedAt, setConnectionStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const endRef = useRef<HTMLDivElement | null>(null);
  const queryEntries = useSyncExternalStore(subscribeActivities, getActivitiesSnapshot, getActivitiesServerSnapshot);
  const { servers, activeServerId, isServersLoading } = useContext(DatabaseContext)!;
  const activeServer = servers.find(server => server.id === activeServerId) ?? null;

  useEffect(() => {
    const handler = (event: Event) => setGridStatus((event as CustomEvent<GridRuntimeStatus>).detail || EMPTY_GRID_STATUS);
    window.addEventListener('coreor:grid-status', handler);
    return () => window.removeEventListener('coreor:grid-status', handler);
  }, []);

  useEffect(() => {
    if (!activeServerId) {
      setConnectionStartedAt(null);
      window.sessionStorage.removeItem(ACTIVE_CONNECTION_STORAGE_KEY);
      return;
    }
    let session: ActiveConnectionSession | null = null;
    try {
      session = JSON.parse(window.sessionStorage.getItem(ACTIVE_CONNECTION_STORAGE_KEY) || 'null') as ActiveConnectionSession | null;
    } catch {
      session = null;
    }
    if (!session || session.serverId !== activeServerId || !Number.isFinite(session.startedAt)) {
      session = { serverId: activeServerId, startedAt: Date.now() };
      window.sessionStorage.setItem(ACTIVE_CONNECTION_STORAGE_KEY, JSON.stringify(session));
    }
    setConnectionStartedAt(session.startedAt);
    setNow(Date.now());
  }, [activeServerId]);

  useEffect(() => {
    if (!activeServerId) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeServerId]);

  useEffect(() => {
    if (!activeServerId || !activeToken) {
      setServerSnapshot(null);
      setSnapshotError(null);
      setSnapshotLoading(false);
      return;
    }
    let cancelled = false;
    let inFlight = false;

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      setSnapshotLoading(true);
      try {
        const snapshot = await fetchDatabasePerformanceSnapshot(activeServerId, activeToken, selectedDatabase || null);
        if (!cancelled) {
          setServerSnapshot(snapshot);
          setSnapshotError(null);
        }
      } catch (error) {
        if (!cancelled) setSnapshotError(error instanceof Error ? error.message : 'Sunucu durumu alınamadı.');
      } finally {
        inFlight = false;
        if (!cancelled) setSnapshotLoading(false);
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeServerId, activeToken, selectedDatabase]);

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
    const averageDuration = durations.length
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : undefined;
    const completed = successful + failed;
    const successRate = completed ? Math.round(successful / completed * 100) : 100;
    return { successful, failed, warnings, averageDuration, successRate, lastEntry: queryEntries.at(-1) };
  }, [queryEntries]);

  useEffect(() => {
    if (isConsoleOpen) endRef.current?.scrollIntoView({ block: 'end' });
  }, [filteredEntries.length, isConsoleOpen]);

  const engineName = activeServer?.databaseType === 'mariadb' ? 'MariaDB' : 'MySQL';
  const targetName = selectedDatabase || activeServer?.databaseName || 'Sunucu geneli';
  const connectionSeconds = connectionStartedAt ? Math.max(0, Math.floor((now - connectionStartedAt) / 1000)) : 0;
  const averageQuestionsPerSecond = serverSnapshot?.uptimeSeconds
    ? serverSnapshot.questions / serverSnapshot.uptimeSeconds
    : null;
  const connectionHealthy = Boolean(activeServer && serverSnapshot && !snapshotError);

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

      <div className="h-7 overflow-x-auto overflow-y-visible border-t border-zinc-800 text-[9px] text-zinc-500">
        <div className="flex h-full min-w-max items-center divide-x divide-zinc-800 tabular-nums">
          <StatusTooltip title="Bağlantı durumu" rows={[
            { label: 'Durum', value: !activeServer ? 'Sunucu seçilmedi' : snapshotLoading && !serverSnapshot ? 'Kontrol ediliyor' : snapshotError ? 'Kontrol başarısız' : 'Bağlantı hazır', tone: !activeServer ? 'normal' : snapshotError ? 'danger' : connectionHealthy ? 'success' : 'warning' },
            { label: 'Son kontrol', value: serverSnapshot ? formatDateTime(serverSnapshot.sampledAt) : '—' },
            { label: 'Hata', value: snapshotError || '—', tone: snapshotError ? 'danger' : 'normal' },
            { label: 'Kontrol aralığı', value: '30 saniye' }
          ]}><span className={`flex h-full items-center gap-1.5 px-2 font-medium ${!activeServer ? 'text-zinc-500' : snapshotError ? 'text-red-400' : connectionHealthy ? 'text-emerald-400' : 'text-amber-400'}`}>{snapshotLoading && !serverSnapshot ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}{!activeServer ? 'Bağlantı yok' : snapshotError ? 'Erişilemiyor' : 'Bağlı'}</span></StatusTooltip>

          <StatusTooltip title="Bağlantı profili" rows={[
            { label: 'Motor', value: activeServer ? engineName : 'Bağlı değil' },
            { label: 'Sürüm profili', value: activeServer?.version || '—' },
            { label: 'TLS modu', value: activeServer?.sslMode || '—', tone: activeServer?.sslMode === 'required' ? 'success' : activeServer ? 'warning' : 'normal' },
            { label: 'Bağlantı timeout', value: activeServer ? `${activeServer.connectionTimeoutMs || 20000} ms` : '—' }
          ]}><span className="flex h-full items-center gap-1 px-2 text-zinc-300"><Server className="h-3 w-3" />{isServersLoading ? 'Kasa okunuyor' : activeServer ? `${engineName} ${activeServer.version || ''}` : 'Sunucu yok'}</span></StatusTooltip>

          {activeServer && <StatusTooltip title="Ağ ve kullanıcı" rows={[
            { label: 'Sunucu adı', value: activeServer.name },
            { label: 'Host', value: activeServer.host || '—' },
            { label: 'Port', value: activeServer.port || 3306 },
            { label: 'Kullanıcı', value: activeServer.username || '—' }
          ]}><span className="flex h-full items-center px-2 font-mono">{activeServer.host}:{activeServer.port || 3306}</span></StatusTooltip>}

          <StatusTooltip title="Sunucu uptime" rows={[
            { label: 'Çalışma süresi', value: serverSnapshot ? formatDuration(serverSnapshot.uptimeSeconds, true) : '—', tone: serverSnapshot ? 'success' : 'normal' },
            { label: 'Toplam soru/sorgu', value: serverSnapshot?.questions.toLocaleString('tr-TR') || '—' },
            { label: 'Ortalama soru/sn', value: averageQuestionsPerSecond === null ? '—' : averageQuestionsPerSecond.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) },
            { label: 'Yavaş sorgular', value: serverSnapshot?.slowQueries.toLocaleString('tr-TR') || '—', tone: serverSnapshot?.slowQueries ? 'warning' : 'normal' }
          ]}><span className="flex h-full items-center gap-1 px-2 text-cyan-300"><Timer className="h-3 w-3" />Uptime {serverSnapshot ? formatDuration(serverSnapshot.uptimeSeconds) : '—'}</span></StatusTooltip>

          <StatusTooltip title="Coreor bağlantı süresi" rows={[
            { label: 'Aktif profil süresi', value: activeServer ? formatDuration(connectionSeconds, true) : '—', tone: activeServer ? 'success' : 'normal' },
            { label: 'Başlangıç', value: connectionStartedAt ? formatDateTime(new Date(connectionStartedAt).toISOString()) : '—' },
            { label: 'Profil', value: activeServer?.name || '—' },
            { label: 'Açıklama', value: 'Aktif profil seçili kaldığı süre; normal SQL bağlantıları işlem sonunda kapanır.' }
          ]}><span className="flex h-full items-center gap-1 px-2 text-emerald-300"><PlugZap className="h-3 w-3" />Coreor {activeServer ? formatDuration(connectionSeconds) : '—'}</span></StatusTooltip>

          <StatusTooltip title="Aktif hedef ve katalog" rows={[
            { label: 'Veritabanı', value: targetName },
            { label: 'Tablo', value: selectedTable || '—' },
            { label: 'Katalog veritabanı', value: activeServer?.databases?.length || 0 },
            { label: 'Katalog tablo', value: activeServer?.databases?.reduce((total, database) => total + database.tableCount, 0) || 0 }
          ]}><span className="flex h-full max-w-64 items-center gap-1 truncate px-2"><Database className="h-3 w-3" /><span className="truncate">{targetName}{selectedTable ? ` / ${selectedTable}` : ''}</span></span></StatusTooltip>

          {selectedTable && <StatusTooltip title="Tablo gridi" rows={[
            { label: 'Sayfa', value: `${gridStatus.page.toLocaleString('tr-TR')} / ${gridStatus.totalPages.toLocaleString('tr-TR')}` },
            { label: 'Sayfa boyutu', value: gridStatus.pageSize.toLocaleString('tr-TR') },
            { label: 'Toplam satır', value: gridStatus.totalRows.toLocaleString('tr-TR') },
            { label: 'Aktif filtre', value: gridStatus.filters },
            { label: 'Sıralama kolonu', value: gridStatus.sorts },
            { label: 'Durum', value: gridStatus.isLoading ? 'Yükleniyor' : 'Hazır', tone: gridStatus.isLoading ? 'warning' : 'success' }
          ]}><span className="flex h-full items-center gap-1 px-2"><Table className="h-3 w-3" />{gridStatus.page}/{gridStatus.totalPages} • {gridStatus.pageSize}</span></StatusTooltip>}

          <StatusTooltip title="Bağlantılar ve iş parçacıkları" rows={[
            { label: 'Bağlı bağlantı', value: serverSnapshot?.threadsConnected.toLocaleString('tr-TR') || '—' },
            { label: 'Çalışan thread', value: serverSnapshot?.threadsRunning.toLocaleString('tr-TR') || '—' },
            { label: 'En yüksek kullanım', value: serverSnapshot?.maxUsedConnections.toLocaleString('tr-TR') || '—' },
            { label: 'Maksimum bağlantı', value: serverSnapshot?.maxConnections?.toLocaleString('tr-TR') || '—' },
            { label: 'Reddedilen bağlantı', value: serverSnapshot?.abortedConnects.toLocaleString('tr-TR') || '—', tone: serverSnapshot?.abortedConnects ? 'warning' : 'normal' }
          ]}><span className="flex h-full items-center gap-1 px-2"><Activity className="h-3 w-3 text-purple-400" />{serverSnapshot ? `${serverSnapshot.threadsConnected} bağlı • ${serverSnapshot.threadsRunning} çalışan` : 'Thread —'}</span></StatusTooltip>

          <StatusTooltip title="InnoDB buffer pool" rows={[
            { label: 'Kullanım', value: serverSnapshot ? `%${serverSnapshot.bufferPool.usagePercent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '—' },
            { label: 'Dirty page', value: serverSnapshot ? `%${serverSnapshot.bufferPool.dirtyPercent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '—', tone: serverSnapshot && serverSnapshot.bufferPool.dirtyPercent > 20 ? 'warning' : 'normal' },
            { label: 'Hit ratio', value: serverSnapshot?.bufferPool.hitRatio === null || serverSnapshot?.bufferPool.hitRatio === undefined ? '—' : `%${serverSnapshot.bufferPool.hitRatio.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` },
            { label: 'Toplam', value: serverSnapshot ? formatBytes(serverSnapshot.bufferPool.totalPages * serverSnapshot.bufferPool.pageSize) : '—' },
            { label: 'Boş', value: serverSnapshot ? formatBytes(serverSnapshot.bufferPool.freePages * serverSnapshot.bufferPool.pageSize) : '—' }
          ]}><span className="flex h-full items-center gap-1 px-2"><Gauge className="h-3 w-3 text-amber-400" />Buffer {serverSnapshot ? `%${Math.round(serverSnapshot.bufferPool.usagePercent)}` : '—'}</span></StatusTooltip>

          <StatusTooltip title="Mantıksal depolama" rows={[
            { label: 'Toplam', value: serverSnapshot ? formatBytes(serverSnapshot.storage.totalBytes) : '—' },
            { label: 'Veri', value: serverSnapshot ? formatBytes(serverSnapshot.storage.dataBytes) : '—' },
            { label: 'İndeks', value: serverSnapshot ? formatBytes(serverSnapshot.storage.indexBytes) : '—' },
            { label: 'Boş alan', value: serverSnapshot ? formatBytes(serverSnapshot.storage.freeBytes) : '—' },
            { label: 'Seçili veritabanı', value: serverSnapshot?.storage.selectedDatabaseBytes === null || serverSnapshot?.storage.selectedDatabaseBytes === undefined ? '—' : formatBytes(serverSnapshot.storage.selectedDatabaseBytes) }
          ]}><span className="flex h-full items-center gap-1 px-2"><HardDrive className="h-3 w-3 text-blue-400" />{serverSnapshot ? formatBytes(serverSnapshot.storage.totalBytes) : 'Depolama —'}</span></StatusTooltip>

          <StatusTooltip title="Sunucu ağ trafiği" rows={[
            { label: 'Alınan', value: serverSnapshot ? formatBytes(serverSnapshot.bytesReceived) : '—' },
            { label: 'Gönderilen', value: serverSnapshot ? formatBytes(serverSnapshot.bytesSent) : '—' },
            { label: 'Toplam', value: serverSnapshot ? formatBytes(serverSnapshot.bytesReceived + serverSnapshot.bytesSent) : '—' },
            { label: 'Sayaç başlangıcı', value: 'Sunucu açılışından beri' }
          ]}><span className="flex h-full items-center gap-1.5 px-2"><Network className="h-3 w-3 text-cyan-400" /><span><ArrowDown className="inline h-2.5 w-2.5 text-emerald-400" /> {serverSnapshot ? formatBytes(serverSnapshot.bytesReceived) : '—'}</span><span><ArrowUp className="inline h-2.5 w-2.5 text-blue-400" /> {serverSnapshot ? formatBytes(serverSnapshot.bytesSent) : '—'}</span></span></StatusTooltip>

          <StatusTooltip title="SQL performansı" align="right" rows={[
            { label: 'Toplam sorgu', value: queryEntries.length },
            { label: 'Başarılı', value: metrics.successful, tone: 'success' },
            { label: 'Hata', value: metrics.failed, tone: metrics.failed ? 'danger' : 'normal' },
            { label: 'Uyarı', value: metrics.warnings, tone: metrics.warnings ? 'warning' : 'normal' },
            { label: 'Başarı oranı', value: `%${metrics.successRate}`, tone: metrics.successRate >= 95 ? 'success' : metrics.successRate >= 75 ? 'warning' : 'danger' },
            { label: 'Ortalama süre', value: metrics.averageDuration === undefined ? '—' : `${metrics.averageDuration} ms` }
          ]}><span className="flex h-full items-center gap-1 px-2"><Terminal className="h-3 w-3" />{queryEntries.length} SQL • %{metrics.successRate}</span></StatusTooltip>

          <StatusTooltip title="Aktif grid koşulları" align="right" rows={[
            { label: 'Filtre', value: gridStatus.filters },
            { label: 'Sıralama', value: gridStatus.sorts },
            { label: 'Yükleme', value: gridStatus.isLoading ? 'Devam ediyor' : 'Beklemede', tone: gridStatus.isLoading ? 'warning' : 'normal' }
          ]}><span className="flex h-full items-center gap-2 px-2"><span className={gridStatus.filters ? 'text-cyan-400' : ''}><Filter className="inline h-3 w-3" /> {gridStatus.filters}</span><span className={gridStatus.sorts ? 'text-cyan-400' : ''}><ArrowUpDown className="inline h-3 w-3" /> {gridStatus.sorts}</span></span></StatusTooltip>

          <StatusTooltip title="Son sorgu" align="right" rows={[
            { label: 'Zaman', value: metrics.lastEntry ? formatDateTime(metrics.lastEntry.timestamp) : '—' },
            { label: 'Durum', value: metrics.lastEntry ? statusLabel(metrics.lastEntry.level) : '—', tone: metrics.lastEntry?.level === 'error' ? 'danger' : metrics.lastEntry ? 'success' : 'normal' },
            { label: 'Süre', value: metrics.lastEntry?.durationMs === undefined ? '—' : `${metrics.lastEntry.durationMs} ms` },
            { label: 'Hedef', value: metrics.lastEntry ? queryTarget(metrics.lastEntry) : '—' }
          ]}><span className="flex h-full items-center gap-1 px-2"><Clock className="h-3 w-3" />{metrics.lastEntry?.durationMs === undefined ? 'Son sorgu —' : `${metrics.lastEntry.durationMs} ms`}</span></StatusTooltip>
        </div>
      </div>

      <QueryDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
}
