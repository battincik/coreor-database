'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Clock3, Copy, Loader2, Lock, RefreshCw, Skull, StopCircle, X } from 'lucide-react';
import type { DatabaseProcessCenterResponse } from '@/lib/databaseWorkbenchTypes';
import { fetchDatabaseProcessCenter, killDatabaseProcess } from '@/lib/databaseWorkbenchApi';
import { useAppPreferences } from '@/lib/appPreferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CoreorConfirmModal, type CoreorConfirmation } from '@/components/ui/coreor-confirm-modal';
import { useAppContextMenu } from '@/components/app-context-menu';
import { openQueryTab } from '@/lib/queryWorkspaceEvents';

interface DatabaseProcessCenterModalProps {
  open: boolean;
  onClose: () => void;
  serverId: string | null;
  accountId?: string | null;
}

const emptyState: DatabaseProcessCenterResponse = { processes: [], locks: [], deadlockText: null, currentConnectionId: null };

function duration(seconds: number) {
  if (seconds < 60) return `${seconds} sn`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dk ${seconds % 60} sn`;
  return `${Math.floor(seconds / 3600)} sa ${Math.floor((seconds % 3600) / 60)} dk`;
}

export function DatabaseProcessCenterModal({ open, onClose, serverId, accountId }: DatabaseProcessCenterModalProps) {
  const { openContextMenu } = useAppContextMenu();
  const { preferences } = useAppPreferences();
  const [data, setData] = useState(emptyState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [minimumSeconds, setMinimumSeconds] = useState(0);
  const [killingId, setKillingId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<CoreorConfirmation | null>(null);

  const load = async () => {
    if (!serverId || !accountId) return;
    setLoading(true); setError(null);
    try { setData(await fetchDatabaseProcessCenter(serverId, accountId)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Process merkezi yüklenemedi.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) void load(); }, [open, serverId, accountId]);
  useEffect(() => {
    if (!open || !preferences.autoRefreshProcesses) return;
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(refresh, Math.max(3, preferences.performanceRefreshSeconds) * 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [open, preferences.autoRefreshProcesses, preferences.performanceRefreshSeconds, serverId, accountId]);

  const processes = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase('tr-TR');
    return data.processes.filter(process => process.seconds >= minimumSeconds && (!query || [process.user, process.host, process.database, process.command, process.state, process.info].filter(Boolean).some(value => String(value).toLocaleLowerCase('tr-TR').includes(query))));
  }, [data.processes, filter, minimumSeconds]);

  if (!open || typeof document === 'undefined') return null;

  const kill = (id: number, type: 'query' | 'connection') => {
    if (!serverId || !accountId || id === data.currentConnectionId) return;
    const label = type === 'query' ? 'sorgu' : 'bağlantı';
    setConfirmation({
      title: type === 'query' ? 'Sorguyu sonlandır' : 'Bağlantıyı sonlandır',
      description: `${id} numaralı ${label} sunucuda sonlandırılacak. Devam eden işlem rollback olabilir veya istemci bağlantısı kesilebilir.`,
      confirmLabel: 'Sonlandır',
      tone: 'danger',
      onConfirm: async () => {
        setKillingId(id); setError(null);
        try { await killDatabaseProcess(serverId, id, type, accountId); await load(); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Process sonlandırılamadı.'); throw failure; }
        finally { setKillingId(null); }
      }
    });
  };

  const openProcessMenu = (event: React.MouseEvent, process: DatabaseProcessCenterResponse['processes'][number]) => openContextMenu(event, [
    { id: 'open-sql', label: 'SQL editöründe aç', icon: Clock3, disabled: !process.info, onSelect: () => openQueryTab({ serverId, databaseName: process.database || null, title: `Process ${process.id}`, sql: process.info || '' }) },
    { id: 'copy-sql', label: 'SQL’i kopyala', icon: Copy, disabled: !process.info, onSelect: () => navigator.clipboard.writeText(process.info || '') },
    { id: 'copy-process', label: 'Process özetini kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(`ID ${process.id} • ${process.user}@${process.host} • ${process.database || 'genel'} • ${duration(process.seconds)}`) },
    { id: 'sep-kill', separator: true },
    { id: 'kill-query', label: 'Yalnız sorguyu sonlandır', icon: StopCircle, danger: true, disabled: process.id === data.currentConnectionId || !process.info || killingId === process.id, onSelect: () => kill(process.id, 'query') },
    { id: 'kill-connection', label: 'Bağlantıyı sonlandır', icon: Skull, danger: true, disabled: process.id === data.currentConnectionId || killingId === process.id, onSelect: () => kill(process.id, 'connection') }
  ], `Process #${process.id}`);

  return <>
    {createPortal(
    <div className="fixed inset-0 z-[325] flex items-center justify-center p-2 sm:p-3">
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Kapat" />
      <div className="relative z-10 flex h-[calc(100dvh-16px)] max-h-[780px] w-[calc(100vw-16px)] max-w-[1280px] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)]">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 px-4"><Clock3 className="h-4 w-4 text-cyan-400" /><div><h2 className="text-sm font-semibold">Process ve kilit merkezi</h2><p className="text-[10px] text-zinc-500">Çalışan sorgular, metadata lock ve son InnoDB deadlock kaydı.</p></div><span className="ml-auto text-[10px] text-zinc-600">{preferences.autoRefreshProcesses ? `${preferences.performanceRefreshSeconds} sn otomatik yenileme` : 'Manuel yenileme'}</span><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button><Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button></div>
        {error && <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-300">{error}</div>}
        <Tabs defaultValue="processes" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="h-10 shrink-0 justify-start rounded-none border-b border-zinc-800 bg-zinc-950 px-2"><TabsTrigger value="processes" className="h-9 text-xs">Processler ({data.processes.length})</TabsTrigger><TabsTrigger value="locks" className="h-9 text-xs">Metadata lock ({data.locks.length})</TabsTrigger><TabsTrigger value="deadlock" className="h-9 text-xs">Son deadlock</TabsTrigger></TabsList>
          <TabsContent value="processes" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 p-2"><Input className="h-8 min-w-64 max-w-md text-xs" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Kullanıcı, host, veritabanı, state veya SQL ara" /><label className="flex items-center gap-2 text-[10px] text-zinc-500">En az<select value={minimumSeconds} onChange={event => setMinimumSeconds(Number(event.target.value))} className="h-8 rounded border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-300"><option value="0">Tümü</option><option value="5">5 sn</option><option value="30">30 sn</option><option value="60">1 dk</option><option value="300">5 dk</option></select></label><span className="ml-auto text-[10px] text-zinc-600">{processes.length} kayıt</span></div>
            <div className="min-h-0 flex-1 overflow-auto"><Table size="sm" className="min-w-[1250px]"><TableHeader><TableRow><TableHead className="sticky top-0 z-10 border bg-zinc-950">ID</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950">Kullanıcı</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950">Host</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950">Veritabanı</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950">Komut</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950">Süre</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950">State</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950">SQL</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950">İşlem</TableHead></TableRow></TableHeader><TableBody>{processes.map(process => <TableRow key={process.id} onContextMenu={event => openProcessMenu(event, process)} className={process.id === data.currentConnectionId ? 'bg-cyan-500/[0.05]' : process.seconds >= 60 ? 'bg-amber-500/[0.04]' : ''}><TableCell className="border font-mono text-[10px]">{process.id}{process.id === data.currentConnectionId && <span className="ml-1 text-cyan-400">(bu)</span>}</TableCell><TableCell className="border text-xs">{process.user}</TableCell><TableCell className="border font-mono text-[10px]">{process.host}</TableCell><TableCell className="border text-xs">{process.database || '—'}</TableCell><TableCell className="border text-[10px]">{process.command}</TableCell><TableCell className={`border tabular-nums ${process.seconds >= 60 ? 'text-amber-300' : ''}`}>{duration(process.seconds)}</TableCell><TableCell className="max-w-52 truncate border text-[10px]" title={process.state || ''}>{process.state || '—'}</TableCell><TableCell className="max-w-[460px] truncate border font-mono text-[10px] text-cyan-100" title={process.info || ''}>{process.info || '—'}</TableCell><TableCell className="border"><div className="flex gap-1"><Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" disabled={process.id === data.currentConnectionId || killingId === process.id} onClick={() => void kill(process.id, 'query')}>{killingId === process.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <StopCircle className="mr-1 h-3 w-3" />}Sorgu</Button><Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-red-400" disabled={process.id === data.currentConnectionId || killingId === process.id} onClick={() => void kill(process.id, 'connection')}><Skull className="mr-1 h-3 w-3" />Bağlantı</Button></div></TableCell></TableRow>)}</TableBody></Table></div>
          </TabsContent>
          <TabsContent value="locks" className="m-0 min-h-0 flex-1 overflow-auto p-0"><Table size="sm" className="min-w-[1050px]"><TableHeader><TableRow><TableHead className="sticky top-0 border bg-zinc-950">Durum</TableHead><TableHead className="sticky top-0 border bg-zinc-950">Nesne türü</TableHead><TableHead className="sticky top-0 border bg-zinc-950">Şema</TableHead><TableHead className="sticky top-0 border bg-zinc-950">Nesne</TableHead><TableHead className="sticky top-0 border bg-zinc-950">Lock türü</TableHead><TableHead className="sticky top-0 border bg-zinc-950">Süre</TableHead><TableHead className="sticky top-0 border bg-zinc-950">Thread</TableHead><TableHead className="sticky top-0 border bg-zinc-950">Process</TableHead></TableRow></TableHeader><TableBody>{data.locks.map((lock, index) => <TableRow key={`${lock.ownerThreadId}-${lock.objectName}-${index}`} className={lock.lockStatus === 'PENDING' ? 'bg-red-500/[0.07]' : ''}><TableCell className={`border text-[10px] ${lock.lockStatus === 'PENDING' ? 'text-red-300' : 'text-emerald-300'}`}><Lock className="mr-1 inline h-3 w-3" />{lock.lockStatus || '—'}</TableCell><TableCell className="border text-[10px]">{lock.objectType || '—'}</TableCell><TableCell className="border text-xs">{lock.schema || '—'}</TableCell><TableCell className="border text-xs">{lock.objectName || '—'}</TableCell><TableCell className="border text-[10px]">{lock.lockType || '—'}</TableCell><TableCell className="border text-[10px]">{lock.lockDuration || '—'}</TableCell><TableCell className="border font-mono text-[10px]">{lock.ownerThreadId ?? '—'}</TableCell><TableCell className="border font-mono text-[10px]">{lock.processId ?? '—'}</TableCell></TableRow>)}</TableBody></Table>{data.locks.length === 0 && <div className="p-8 text-center text-xs text-zinc-500">Metadata lock bilgisi yok veya performance_schema yetkisi bulunmuyor.</div>}</TabsContent>
          <TabsContent value="deadlock" className="m-0 min-h-0 flex-1 overflow-auto p-4">{data.deadlockText ? <pre className="whitespace-pre-wrap rounded-xl border border-red-500/20 bg-black/40 p-4 font-mono text-[11px] leading-5 text-red-100">{data.deadlockText}</pre> : <div className="flex h-full items-center justify-center"><div className="max-w-md text-center"><AlertTriangle className="mx-auto mb-3 h-8 w-8 text-zinc-700" /><h3 className="text-sm font-medium">Deadlock kaydı bulunamadı</h3><p className="mt-1 text-xs text-zinc-500">InnoDB status erişimi yoksa veya yakın zamanda deadlock oluşmadıysa bu bölüm boş kalır.</p></div></div>}</TabsContent>
        </Tabs>
      </div>
    </div>, document.body
  )}
    <CoreorConfirmModal action={confirmation} onClose={() => setConfirmation(null)} />
  </>;
}
