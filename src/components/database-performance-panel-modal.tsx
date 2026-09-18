'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, AlertTriangle, Clock, Database, HardDrive, Loader2, RefreshCw, Server, X } from 'lucide-react';
import type { DatabasePerformanceSnapshot } from '@/lib/databaseWorkbenchTypes';
import { fetchDatabasePerformanceSnapshot } from '@/lib/databaseWorkbenchApi';
import { formatStorageBytes } from '@/lib/formatStorageSize';
import { Button } from '@/components/ui/button';
import { CoreorSwitch } from '@/components/ui/coreor-switch';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { useAppPreferences, type PerformanceRefreshSeconds } from '@/lib/appPreferences';
import { performanceHistoryStore, type PerformanceHistoryPoint } from '@/lib/decentralizedIntelligence';

interface DatabasePerformancePanelModalProps {
  open: boolean;
  onClose: () => void;
  serverId: string | null;
  accountId?: string | null;
  selectedDatabase?: string | null;
}

interface PerformancePoint {
  at: number;
  qps: number;
  slowPerSecond: number;
  connections: number;
  running: number;
  receivePerSecond: number;
  sendPerSecond: number;
}

type HistoryWindow = '15m' | '1h' | '6h' | '24h';
const WINDOW_MS: Record<HistoryWindow, number> = { '15m': 15 * 60_000, '1h': 60 * 60_000, '6h': 6 * 60 * 60_000, '24h': 24 * 60 * 60_000 };
const REFRESH_OPTIONS: SearchSelectOption<PerformanceRefreshSeconds>[] = [1, 3, 5, 10, 15, 30].map(value => ({ value: value as PerformanceRefreshSeconds, label: `${value} saniye`, description: value <= 3 ? 'Çok canlı; daha fazla sorgu üretir.' : value <= 10 ? 'Dengeli canlı takip.' : 'Daha düşük veritabanı yükü.', badge: value === 5 ? 'Varsayılan' : undefined }));
const WINDOW_OPTIONS: SearchSelectOption<HistoryWindow>[] = [
  { value: '15m', label: 'Son 15 dakika', description: 'Ani dalgalanmalar' },
  { value: '1h', label: 'Son 1 saat', description: 'Kısa dönem eğilim' },
  { value: '6h', label: 'Son 6 saat', description: 'Vardiya görünümü' },
  { value: '24h', label: 'Son 24 saat', description: 'Günlük görünüm' }
];

function number(value: number, digits = 1) {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);
}

function percent(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `%${number(value, digits)}`;
}

function duration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} sn`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dk`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} sa ${Math.floor((seconds % 3600) / 60)} dk`;
  return `${Math.floor(seconds / 86_400)} gün ${Math.floor((seconds % 86_400) / 3600)} sa`;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-10 rounded bg-white/[0.02]" />;
  const width = 220;
  const height = 40;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = index / Math.max(1, values.length - 1) * width;
    const y = height - ((value - min) / span * (height - 6) + 3);
    return `${x},${y}`;
  }).join(' ');
  return <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-cyan-400" /></svg>;
}

function MetricCard({ title, value, description, icon, values, tone = 'cyan' }: {
  title: string;
  value: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  values?: number[];
  tone?: 'cyan' | 'emerald' | 'amber' | 'purple' | 'red';
}) {
  const toneClass = tone === 'emerald' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : tone === 'purple' ? 'text-purple-400' : tone === 'red' ? 'text-red-400' : 'text-cyan-400';
  return <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black/20 p-3"><div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-600"><span className={toneClass}>{icon}</span>{title}</div><div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-100">{value}</div><div className="mt-1 min-h-8 text-[10px] leading-4 text-zinc-500">{description}</div>{values && <div className={`mt-2 ${toneClass}`}><Sparkline values={values} /></div>}</div>;
}

function ProgressBar({ value, tone = 'cyan' }: { value: number; tone?: 'cyan' | 'emerald' | 'amber' | 'red' }) {
  const barClass = tone === 'emerald' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : tone === 'red' ? 'bg-red-500' : 'bg-cyan-500';
  return <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full transition-[width] ${barClass}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function storedToPoint(item: PerformanceHistoryPoint): PerformancePoint {
  return { at: new Date(item.sampledAt).getTime(), qps: item.qps, slowPerSecond: 0, connections: item.connections, running: item.running, receivePerSecond: 0, sendPerSecond: 0 };
}

export function DatabasePerformancePanelModal({ open, onClose, serverId, accountId, selectedDatabase }: DatabasePerformancePanelModalProps) {
  const { preferences, setPreferences } = useAppPreferences();
  const [snapshot, setSnapshot] = useState<DatabasePerformanceSnapshot | null>(null);
  const [points, setPoints] = useState<PerformancePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>('15m');
  const [error, setError] = useState<string | null>(null);
  const previousRef = useRef<DatabasePerformanceSnapshot | null>(null);
  const loadingRef = useRef(false);

  const hydrateHistory = useCallback(() => {
    if (!serverId) return setPoints([]);
    const cutoff = Date.now() - WINDOW_MS[historyWindow];
    setPoints(performanceHistoryStore.list(serverId).filter(item => new Date(item.sampledAt).getTime() >= cutoff).map(storedToPoint).slice(-1800));
  }, [serverId, historyWindow]);

  const load = useCallback(async () => {
    if (!serverId || !accountId || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchDatabasePerformanceSnapshot(serverId, accountId, selectedDatabase);
      const previous = previousRef.current;
      const nextAt = new Date(next.sampledAt).getTime();
      const previousAt = previous ? new Date(previous.sampledAt).getTime() : nextAt;
      const elapsed = previous ? Math.max(0.25, (nextAt - previousAt) / 1000) : Math.max(1, next.uptimeSeconds);
      const delta = (current: number, old: number) => current >= old ? current - old : current;
      const point: PerformancePoint = {
        at: nextAt,
        qps: previous ? delta(next.questions, previous.questions) / elapsed : next.questions / elapsed,
        slowPerSecond: previous ? delta(next.slowQueries, previous.slowQueries) / elapsed : next.slowQueries / elapsed,
        connections: next.threadsConnected,
        running: next.threadsRunning,
        receivePerSecond: previous ? delta(next.bytesReceived, previous.bytesReceived) / elapsed : next.bytesReceived / elapsed,
        sendPerSecond: previous ? delta(next.bytesSent, previous.bytesSent) / elapsed : next.bytesSent / elapsed
      };
      previousRef.current = next;
      setSnapshot(next);
      performanceHistoryStore.add({
        id: `${serverId}:${next.sampledAt}`,
        serverId,
        sampledAt: next.sampledAt,
        qps: point.qps,
        slowQueries: next.slowQueries,
        connections: next.threadsConnected,
        running: next.threadsRunning,
        bytesReceived: next.bytesReceived,
        bytesSent: next.bytesSent,
        bufferUsage: next.bufferPool.usagePercent,
        replicationLag: next.replication.secondsBehind,
        storageBytes: next.storage.totalBytes
      });
      const cutoff = Date.now() - WINDOW_MS[historyWindow];
      setPoints(previousPoints => [...previousPoints.filter(item => item.at >= cutoff), point].slice(-1800));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Performans snapshot alınamadı.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [serverId, accountId, selectedDatabase, historyWindow]);

  useEffect(() => {
    if (!open) return;
    previousRef.current = null;
    hydrateHistory();
    void load();
  }, [open, serverId, selectedDatabase, historyWindow, hydrateHistory, load]);

  useEffect(() => {
    if (!open || !autoRefresh) return;
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(refresh, Math.max(3, preferences.performanceRefreshSeconds) * 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [open, autoRefresh, load, preferences.performanceRefreshSeconds]);

  const latestPoint = points.at(-1);
  const connectionPercent = snapshot?.maxConnections ? snapshot.threadsConnected / snapshot.maxConnections * 100 : 0;
  const replicationTone = !snapshot?.replication.available ? 'amber' : snapshot.replication.running ? 'emerald' : 'red';
  const topStorageMax = Math.max(1, ...(snapshot?.storage.topSchemas.map(item => item.totalBytes) || [1]));
  const chartSeries = useMemo(() => ({ qps: points.map(point => point.qps), connections: points.map(point => point.connections), running: points.map(point => point.running), slow: points.map(point => point.slowPerSecond) }), [points]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[328] flex items-center justify-center p-2 sm:p-3">
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Kapat" />
      <div className="relative z-10 flex h-[calc(100dvh-16px)] max-h-[880px] w-[calc(100vw-16px)] max-w-[1420px] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)]">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800 px-4">
          <Activity className="h-4 w-4 text-cyan-400" />
          <div><h2 className="text-sm font-semibold">Veritabanı performans paneli</h2><p className="text-[10px] text-zinc-500">Yerel zaman serisi, canlı yenileme, InnoDB, replication ve mantıksal depolama.</p></div>
          <div className="ml-auto flex items-center gap-2"><div className="w-40"><SearchSelect value={historyWindow} options={WINDOW_OPTIONS} onValueChange={setHistoryWindow} triggerClassName="h-8 min-h-8" showDescriptionInTrigger={false}/></div><div className="w-36"><SearchSelect value={preferences.performanceRefreshSeconds} options={REFRESH_OPTIONS} onValueChange={performanceRefreshSeconds => setPreferences({ performanceRefreshSeconds })} triggerClassName="h-8 min-h-8" showDescriptionInTrigger={false}/></div><CoreorSwitch checked={autoRefresh} onCheckedChange={setAutoRefresh} label="Canlı" /></div>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={loading} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {error && <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-300">{error}</div>}
        {!snapshot && loading ? <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" />Performans metrikleri okunuyor…</div> : snapshot && <div className="coreor-table-scroll min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between rounded-xl border border-zinc-800 bg-black/20 px-3 py-2 text-[9px] text-zinc-500"><span>{points.length.toLocaleString('tr-TR')} yerel ölçüm • {historyWindow} görünümü</span><button className="text-red-400 hover:text-red-300" onClick={() => { performanceHistoryStore.clear(serverId || undefined); setPoints([]); }}>Geçmişi temizle</button></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <MetricCard title="QPS" value={number(latestPoint?.qps || 0, 2)} description={points.length > 1 ? 'Son iki snapshot arasındaki Questions farkı.' : 'İlk ölçümde uptime üzerinden ortalama.'} icon={<Activity className="h-4 w-4" />} values={chartSeries.qps} />
            <MetricCard title="Aktif bağlantı" value={snapshot.threadsConnected.toLocaleString('tr-TR')} description={`${snapshot.threadsRunning.toLocaleString('tr-TR')} çalışan thread • tepe ${snapshot.maxUsedConnections.toLocaleString('tr-TR')}${snapshot.maxConnections ? ` / limit ${snapshot.maxConnections.toLocaleString('tr-TR')}` : ''}`} icon={<Server className="h-4 w-4" />} values={chartSeries.connections} tone={connectionPercent >= 85 ? 'red' : connectionPercent >= 65 ? 'amber' : 'emerald'} />
            <MetricCard title="Buffer pool" value={percent(snapshot.bufferPool.usagePercent)} description={`${formatStorageBytes(snapshot.bufferPool.totalPages * snapshot.bufferPool.pageSize)} toplam • hit ratio ${snapshot.bufferPool.hitRatio === null ? '—' : percent(snapshot.bufferPool.hitRatio * 100, 2)}`} icon={<Database className="h-4 w-4" />} tone={snapshot.bufferPool.usagePercent >= 95 ? 'amber' : 'purple'} />
            <MetricCard title="Slow query" value={number(snapshot.slowQueries, 0)} description={`${number(latestPoint?.slowPerSecond || 0, 3)} sorgu/sn • global Slow_queries sayacı`} icon={<Clock className="h-4 w-4" />} values={chartSeries.slow} tone={latestPoint?.slowPerSecond ? 'amber' : 'emerald'} />
            <MetricCard title="Replication lag" value={!snapshot.replication.available ? 'Kapalı' : snapshot.replication.secondsBehind === null ? '—' : `${number(snapshot.replication.secondsBehind, 0)} sn`} description={!snapshot.replication.available ? 'Bu sunucuda replica status dönmedi.' : `${snapshot.replication.ioRunning || 'IO ?'} / ${snapshot.replication.sqlRunning || 'SQL ?'}${snapshot.replication.sourceHost ? ` • ${snapshot.replication.sourceHost}` : ''}`} icon={<Activity className="h-4 w-4" />} tone={replicationTone} />
            <MetricCard title="Mantıksal depolama" value={formatStorageBytes(snapshot.storage.totalBytes)} description={`${formatStorageBytes(snapshot.storage.dataBytes)} veri • ${formatStorageBytes(snapshot.storage.indexBytes)} indeks${selectedDatabase && snapshot.storage.selectedDatabaseBytes !== null ? ` • ${selectedDatabase}: ${formatStorageBytes(snapshot.storage.selectedDatabaseBytes)}` : ''}`} icon={<HardDrive className="h-4 w-4" />} tone="purple" />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <section className="rounded-xl border border-zinc-800 bg-black/20 p-4">
              <div className="flex items-center justify-between"><div><h3 className="text-xs font-semibold">Bağlantı ve trafik</h3><p className="mt-1 text-[10px] text-zinc-600">Seçili zaman penceresindeki yerel snapshotlar.</p></div><div className="text-right text-[10px] text-zinc-500"><div>Alış {formatStorageBytes(latestPoint?.receivePerSecond || 0)}/sn</div><div>Gönderim {formatStorageBytes(latestPoint?.sendPerSecond || 0)}/sn</div></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-zinc-800 p-3"><div className="mb-2 flex justify-between text-[10px] text-zinc-500"><span>Bağlantı kullanımı</span><span>{snapshot.maxConnections ? percent(connectionPercent) : 'Limit yok'}</span></div><ProgressBar value={connectionPercent} tone={connectionPercent >= 85 ? 'red' : connectionPercent >= 65 ? 'amber' : 'emerald'} /></div><div className="rounded-lg border border-zinc-800 p-3"><div className="mb-2 flex justify-between text-[10px] text-zinc-500"><span>Çalışan / bağlı</span><span>{snapshot.threadsRunning} / {snapshot.threadsConnected}</span></div><ProgressBar value={snapshot.threadsConnected ? snapshot.threadsRunning / snapshot.threadsConnected * 100 : 0} /></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-zinc-800 p-3 text-emerald-400"><div className="mb-1 text-[10px] text-zinc-500">Bağlantı eğrisi</div><Sparkline values={chartSeries.connections} /></div><div className="rounded-lg border border-zinc-800 p-3 text-amber-400"><div className="mb-1 text-[10px] text-zinc-500">Çalışan thread eğrisi</div><Sparkline values={chartSeries.running} /></div></div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] sm:grid-cols-4"><div className="rounded-lg border border-zinc-800 p-3"><div className="text-zinc-600">Uptime</div><div className="mt-1 font-medium text-zinc-200">{duration(snapshot.uptimeSeconds)}</div></div><div className="rounded-lg border border-zinc-800 p-3"><div className="text-zinc-600">Aborted</div><div className="mt-1 font-medium text-zinc-200">{snapshot.abortedConnects.toLocaleString('tr-TR')}</div></div><div className="rounded-lg border border-zinc-800 p-3"><div className="text-zinc-600">Alınan toplam</div><div className="mt-1 font-medium text-zinc-200">{formatStorageBytes(snapshot.bytesReceived)}</div></div><div className="rounded-lg border border-zinc-800 p-3"><div className="text-zinc-600">Gönderilen toplam</div><div className="mt-1 font-medium text-zinc-200">{formatStorageBytes(snapshot.bytesSent)}</div></div></div>
            </section>

            <section className="rounded-xl border border-zinc-800 bg-black/20 p-4">
              <div><h3 className="text-xs font-semibold">InnoDB buffer pool</h3><p className="mt-1 text-[10px] text-zinc-600">Sayfa kullanımı, dirty page oranı ve disk okuma hit ratio’su.</p></div>
              <div className="mt-4 space-y-4"><div><div className="mb-2 flex justify-between text-[10px] text-zinc-500"><span>Kullanım</span><span>{percent(snapshot.bufferPool.usagePercent)} • {formatStorageBytes((snapshot.bufferPool.totalPages - snapshot.bufferPool.freePages) * snapshot.bufferPool.pageSize)}</span></div><ProgressBar value={snapshot.bufferPool.usagePercent} tone={snapshot.bufferPool.usagePercent >= 95 ? 'amber' : 'cyan'} /></div><div><div className="mb-2 flex justify-between text-[10px] text-zinc-500"><span>Dirty pages</span><span>{percent(snapshot.bufferPool.dirtyPercent)} • {snapshot.bufferPool.dirtyPages.toLocaleString('tr-TR')} sayfa</span></div><ProgressBar value={snapshot.bufferPool.dirtyPercent} tone={snapshot.bufferPool.dirtyPercent >= 25 ? 'amber' : 'emerald'} /></div><div><div className="mb-2 flex justify-between text-[10px] text-zinc-500"><span>Hit ratio</span><span>{snapshot.bufferPool.hitRatio === null ? '—' : percent(snapshot.bufferPool.hitRatio * 100, 3)}</span></div><ProgressBar value={(snapshot.bufferPool.hitRatio || 0) * 100} tone={(snapshot.bufferPool.hitRatio || 0) >= 0.99 ? 'emerald' : 'amber'} /></div></div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] sm:grid-cols-4"><div className="rounded-lg border border-zinc-800 p-3"><div className="text-zinc-600">Toplam sayfa</div><div className="mt-1 font-medium">{snapshot.bufferPool.totalPages.toLocaleString('tr-TR')}</div></div><div className="rounded-lg border border-zinc-800 p-3"><div className="text-zinc-600">Data sayfası</div><div className="mt-1 font-medium">{snapshot.bufferPool.dataPages.toLocaleString('tr-TR')}</div></div><div className="rounded-lg border border-zinc-800 p-3"><div className="text-zinc-600">Fiziksel okuma</div><div className="mt-1 font-medium">{snapshot.bufferPool.reads.toLocaleString('tr-TR')}</div></div><div className="rounded-lg border border-zinc-800 p-3"><div className="text-zinc-600">Okuma isteği</div><div className="mt-1 font-medium">{snapshot.bufferPool.readRequests.toLocaleString('tr-TR')}</div></div></div>
            </section>
          </div>

          <section className="mt-4 rounded-xl border border-zinc-800 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-4"><div><h3 className="text-xs font-semibold">Şema bazlı mantıksal depolama</h3><p className="mt-1 text-[10px] text-zinc-600">Gerçek disk partition doluluğu değil; DATA_LENGTH + INDEX_LENGTH toplamıdır.</p></div><div className="text-right text-[10px] text-zinc-500">Boş alan tahmini: {formatStorageBytes(snapshot.storage.freeBytes)}</div></div>
            <div className="mt-4 space-y-2">{snapshot.storage.topSchemas.length === 0 ? <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-600">Kullanıcı şeması bulunamadı veya information_schema erişimi yok.</div> : snapshot.storage.topSchemas.map(schema => <div key={schema.schema} className="grid items-center gap-3 rounded-lg border border-zinc-800 px-3 py-2 text-[10px] sm:grid-cols-[minmax(160px,0.8fr)_minmax(240px,2fr)_100px_100px_100px]"><div className="truncate font-mono text-zinc-300" title={schema.schema}>{schema.schema}</div><div><ProgressBar value={schema.totalBytes / topStorageMax * 100} tone={schema.schema === selectedDatabase ? 'emerald' : 'cyan'} /></div><div className="text-right text-zinc-300">{formatStorageBytes(schema.totalBytes)}</div><div className="text-right text-zinc-500">Veri {formatStorageBytes(schema.dataBytes)}</div><div className="text-right text-zinc-500">İndeks {formatStorageBytes(schema.indexBytes)}</div></div>)}</div>
          </section>

          {snapshot.replication.available && snapshot.replication.lastError && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4 text-xs text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-medium">Replication son hatası</div><div className="mt-1 whitespace-pre-wrap font-mono text-[10px] leading-5">{snapshot.replication.lastError}</div></div></div>}
        </div>}
      </div>
    </div>,
    document.body
  );
}
