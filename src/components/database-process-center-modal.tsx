'use client';

import { useModalEscape } from '@/lib/useModalEscape';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { publishCoreorNotification } from '@/lib/notificationStore';
import { useLanguage } from '@/context/LanguageContext';

interface DatabaseProcessCenterModalProps {
  open: boolean;
  onClose: () => void;
  serverId: string | null;
  accountId?: string | null;
}

const emptyState: DatabaseProcessCenterResponse = { processes: [], locks: [], deadlockText: null, currentConnectionId: null };

function duration(seconds: number, t:(key:string,values?:Record<string,string|number>)=>string) {
  if (seconds < 60) return t('processCenter.seconds',{count:seconds});
  if (seconds < 3600) return t('processCenter.minutesSeconds',{minutes:Math.floor(seconds/60),seconds:seconds%60});
  return t('processCenter.hoursMinutes',{hours:Math.floor(seconds/3600),minutes:Math.floor((seconds%3600)/60)});
}

export function DatabaseProcessCenterModal({ open, onClose, serverId, accountId }: DatabaseProcessCenterModalProps) {
  const { openContextMenu } = useAppContextMenu();
  const { preferences } = useAppPreferences();
  const {t,language}=useLanguage();
  const [data, setData] = useState(emptyState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [minimumSeconds, setMinimumSeconds] = useState(0);
  const [killingId, setKillingId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<CoreorConfirmation | null>(null);
  const lastArchivedErrorRef = useRef<string | null>(null);
  useModalEscape(open, onClose, killingId !== null);

  const load = async () => {
    if (!serverId || !accountId) return;
    setLoading(true); setError(null);
    try {
      setData(await fetchDatabaseProcessCenter(serverId, accountId));
      lastArchivedErrorRef.current = null;
    }
    catch (failure) {
      const message = failure instanceof Error ? failure.message : t('processCenter.loadFailed');
      setError(message);
      const code = (failure as Error & { code?: string })?.code || 'PROCESS_CENTER_FAILED';
      const signature = `${serverId}:${code}:${message}`;
      if (lastArchivedErrorRef.current !== signature) {
        lastArchivedErrorRef.current = signature;
        publishCoreorNotification({
          id: `process-center-${serverId}`,
          severity: 'error',
          source: 'system',
          title: t('processCenter.readFailed'),
          description: message,
          serverId,
          code,
          metadata: [{ label: t('maintenance.scope'), value: t('processCenter.scope') }]
        });
      }
    }
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
    const query = filter.trim().toLocaleLowerCase(language);
    return data.processes.filter(process => process.seconds >= minimumSeconds && (!query || [process.user, process.host, process.database, process.command, process.state, process.info].filter(Boolean).some(value => String(value).toLocaleLowerCase(language).includes(query))));
  }, [data.processes, filter, minimumSeconds, language]);

  const stats = useMemo(() => ({
    total: data.processes.length,
    active: data.processes.filter(process => Boolean(process.info) && process.command?.toLocaleLowerCase('en-US') !== 'sleep').length,
    long: data.processes.filter(process => process.seconds >= 60).length,
    waiting: data.locks.filter(lock => ['PENDING', 'WAITING'].includes(String(lock.lockStatus || '').toUpperCase())).length
  }), [data.processes, data.locks]);

  if (!open || typeof document === 'undefined') return null;

  const kill = (id: number, type: 'query' | 'connection') => {
    if (!serverId || !accountId || id === data.currentConnectionId) return;
    const label = type === 'query' ? t('processCenter.query') : t('processCenter.connection');
    setConfirmation({
      title: type === 'query' ? t('processCenter.terminateQuery') : t('processCenter.terminateConnection'),
      description: t('processCenter.terminateDescription',{id,label}),
      confirmLabel: t('processCenter.terminate'),
      tone: 'danger',
      onConfirm: async () => {
        setKillingId(id); setError(null);
        try { await killDatabaseProcess(serverId, id, type, accountId); await load(); }
        catch (failure) { setError(failure instanceof Error ? failure.message : t('processCenter.terminateFailed')); throw failure; }
        finally { setKillingId(null); }
      }
    });
  };

  const openProcessMenu = (event: React.MouseEvent, process: DatabaseProcessCenterResponse['processes'][number]) => openContextMenu(event, [
    { id: 'open-sql', label: t('processCenter.openSql'), icon: Clock3, disabled: !process.info, onSelect: () => openQueryTab({ serverId, databaseName: process.database || null, title: `Process ${process.id}`, sql: process.info || '' }) },
    { id: 'copy-sql', label: t('bottomBar.copySql'), icon: Copy, disabled: !process.info, onSelect: () => navigator.clipboard.writeText(process.info || '') },
    { id: 'copy-process', label: t('processCenter.copySummary'), icon: Copy, onSelect: () => navigator.clipboard.writeText(`ID ${process.id} • ${process.user}@${process.host} • ${process.database || t('processCenter.general')} • ${duration(process.seconds,t)}`) },
    { id: 'sep-kill', separator: true },
    { id: 'kill-query', label: t('processCenter.killQueryOnly'), icon: StopCircle, danger: true, disabled: process.id === data.currentConnectionId || !process.info || killingId === process.id, onSelect: () => kill(process.id, 'query') },
    { id: 'kill-connection', label: t('processCenter.terminateConnection'), icon: Skull, danger: true, disabled: process.id === data.currentConnectionId || killingId === process.id, onSelect: () => kill(process.id, 'connection') }
  ], `Process #${process.id}`);

  return <>
    {createPortal(
    <div className="fixed inset-0 z-[325] flex items-center justify-center p-2 sm:p-3">
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Kapat" />
      <div className="relative z-10 flex h-[calc(100dvh-16px)] max-h-[780px] w-[calc(100vw-16px)] max-w-[1280px] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)]">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 px-4"><Clock3 className="h-4 w-4 text-cyan-400" /><div><h2 className="text-sm font-semibold">{t('processCenter.title')}</h2><p className="text-[10px] text-zinc-500">{t('processCenter.subtitle')}</p></div><span className="ml-auto text-[10px] text-zinc-600">{preferences.autoRefreshProcesses ? `${preferences.performanceRefreshSeconds} sn otomatik yenileme` : 'Manuel yenileme'}</span><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button><Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button></div>
        {error && <div className="flex shrink-0 items-center gap-3 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-[10px] text-red-300"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 flex-1">{error}</span><Button variant="ghost" size="sm" className="h-7 text-[9px]" onClick={() => void load()}>Tekrar dene</Button></div>}
        <Tabs defaultValue="processes" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="h-10 shrink-0 justify-start rounded-none border-b border-zinc-800 bg-zinc-950 px-2"><TabsTrigger value="processes" className="h-9 text-xs">Processler ({data.processes.length})</TabsTrigger><TabsTrigger value="locks" className="h-9 text-xs">Metadata lock ({data.locks.length})</TabsTrigger><TabsTrigger value="deadlock" className="h-9 text-xs">Son deadlock</TabsTrigger></TabsList>
          <TabsContent value="processes" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="grid shrink-0 grid-cols-4 gap-px border-b border-zinc-800 bg-zinc-800">
              {[
                ['Toplam', stats.total, 'text-zinc-200'],
                ['Aktif', stats.active, 'text-emerald-300'],
                ['60 sn+', stats.long, stats.long ? 'text-amber-300' : 'text-zinc-500'],
                ['Bekleyen lock', stats.waiting, stats.waiting ? 'text-red-300' : 'text-zinc-500']
              ].map(([label, value, tone]) => <div key={String(label)} className="bg-zinc-950 px-3 py-2"><div className="text-[8px] uppercase tracking-wide text-zinc-700">{label}</div><div className={`mt-0.5 text-sm font-semibold tabular-nums ${tone}`}>{value}</div></div>)}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 p-2"><Input className="h-8 min-w-52 max-w-md flex-1 text-[10px]" value={filter} onChange={event => setFilter(event.target.value)} placeholder={t('processCenter.search')} /><label className="flex items-center gap-2 text-[9px] text-zinc-600">En az<select value={minimumSeconds} onChange={event => setMinimumSeconds(Number(event.target.value))} className="h-8 rounded border border-zinc-800 bg-zinc-950 px-2 text-[10px] text-zinc-300"><option value="0">{t('common.all')}</option><option value="5">{t('processCenter.seconds',{count:5})}</option><option value="30">{t('processCenter.seconds',{count:30})}</option><option value="60">{t('processCenter.minutes',{count:1})}</option><option value="300">{t('processCenter.minutes',{count:5})}</option></select></label><span className="text-[9px] text-zinc-700">{processes.length} gösteriliyor</span></div>
            <div className="coreor-scrollbar min-h-0 flex-1 overflow-auto">
              <Table size="sm" scrollContainer={false} className="min-w-[900px]">
                <TableHeader><TableRow>
                  <TableHead className="sticky top-0 z-10 w-16 border bg-zinc-950">ID</TableHead>
                  <TableHead className="sticky top-0 z-10 w-44 border bg-zinc-950">Hesap</TableHead>
                  <TableHead className="sticky top-0 z-10 w-36 border bg-zinc-950">{t('catalog.database')}</TableHead>
                  <TableHead className="sticky top-0 z-10 w-44 border bg-zinc-950">{t('processCenter.status')}</TableHead>
                  <TableHead className="sticky top-0 z-10 w-24 border bg-zinc-950">{t('processCenter.duration')}</TableHead>
                  <TableHead className="sticky top-0 z-10 border bg-zinc-950">SQL</TableHead>
                  <TableHead className="sticky top-0 z-10 w-20 border bg-zinc-950">{t('processCenter.action')}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {processes.map(process => <TableRow key={process.id} onContextMenu={event => openProcessMenu(event, process)} className={process.id === data.currentConnectionId ? 'bg-cyan-500/[0.05]' : process.seconds >= 60 ? 'bg-amber-500/[0.04]' : ''}>
                    <TableCell className="border font-mono text-[9px]">{process.id}{process.id === data.currentConnectionId && <span className="ml-1 text-cyan-400">• bu</span>}</TableCell>
                    <TableCell className="border"><div className="truncate text-[10px] text-zinc-300">{process.user}</div><div className="mt-0.5 truncate font-mono text-[8px] text-zinc-700" title={process.host}>{process.host || '—'}</div></TableCell>
                    <TableCell className="max-w-36 truncate border text-[10px]" title={process.database || ''}>{process.database || '—'}</TableCell>
                    <TableCell className="border"><div className="truncate text-[9px] text-zinc-300">{process.command || '—'}</div><div className="mt-0.5 truncate text-[8px] text-zinc-700" title={process.state || ''}>{process.state || '—'}</div></TableCell>
                    <TableCell className={`border text-[9px] tabular-nums ${process.seconds >= 60 ? 'text-amber-300' : 'text-zinc-400'}`}>{duration(process.seconds,t)}</TableCell>
                    <TableCell className="max-w-[420px] truncate border font-mono text-[9px] text-cyan-100/80" title={process.info || ''}>{process.info || <span className="text-zinc-800">{t('processCenter.empty')}</span>}</TableCell>
                    <TableCell className="border"><div className="flex items-center justify-center gap-0.5"><Button size="icon" variant="ghost" className="h-7 w-7" title={t('processCenter.terminateQuery')} disabled={process.id === data.currentConnectionId || !process.info || killingId === process.id} onClick={() => void kill(process.id, 'query')}>{killingId === process.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <StopCircle className="h-3.5 w-3.5" />}</Button><Button size="icon" variant="ghost" className="h-7 w-7 text-red-400" title={t('processCenter.terminateConnection')} disabled={process.id === data.currentConnectionId || killingId === process.id} onClick={() => void kill(process.id, 'connection')}><Skull className="h-3.5 w-3.5" /></Button></div></TableCell>
                  </TableRow>)}
                </TableBody>
              </Table>
              {!loading && processes.length === 0 && <div className="flex min-h-40 items-center justify-center text-[10px] text-zinc-700">{t('processCenter.noProcesses')}</div>}
            </div>
          </TabsContent>
          <TabsContent value="locks" className="coreor-scrollbar m-0 min-h-0 flex-1 overflow-auto p-0"><Table size="sm" scrollContainer={false} className="min-w-[880px]"><TableHeader><TableRow><TableHead className="sticky top-0 border bg-zinc-950">Durum</TableHead><TableHead className="sticky top-0 border bg-zinc-950">{t('processCenter.objectType')}</TableHead><TableHead className="sticky top-0 border bg-zinc-950">Şema</TableHead><TableHead className="sticky top-0 border bg-zinc-950">{t('processCenter.object')}</TableHead><TableHead className="sticky top-0 border bg-zinc-950">{t('processCenter.lockType')}</TableHead><TableHead className="sticky top-0 border bg-zinc-950">Süre</TableHead><TableHead className="sticky top-0 border bg-zinc-950">Thread</TableHead><TableHead className="sticky top-0 border bg-zinc-950">Process</TableHead></TableRow></TableHeader><TableBody>{data.locks.map((lock, index) => <TableRow key={`${lock.ownerThreadId}-${lock.objectName}-${index}`} className={lock.lockStatus === 'PENDING' ? 'bg-red-500/[0.07]' : ''}><TableCell className={`border text-[10px] ${lock.lockStatus === 'PENDING' ? 'text-red-300' : 'text-emerald-300'}`}><Lock className="mr-1 inline h-3 w-3" />{lock.lockStatus || '—'}</TableCell><TableCell className="border text-[10px]">{lock.objectType || '—'}</TableCell><TableCell className="border text-xs">{lock.schema || '—'}</TableCell><TableCell className="border text-xs">{lock.objectName || '—'}</TableCell><TableCell className="border text-[10px]">{lock.lockType || '—'}</TableCell><TableCell className="border text-[10px]">{lock.lockDuration || '—'}</TableCell><TableCell className="border font-mono text-[10px]">{lock.ownerThreadId ?? '—'}</TableCell><TableCell className="border font-mono text-[10px]">{lock.processId ?? '—'}</TableCell></TableRow>)}</TableBody></Table>{data.locks.length === 0 && <div className="p-8 text-center text-xs text-zinc-500">{t('processCenter.noMetadataLocks')}</div>}</TabsContent>
          <TabsContent value="deadlock" className="m-0 min-h-0 flex-1 overflow-auto p-4">{data.deadlockText ? <pre className="whitespace-pre-wrap rounded-xl border border-red-500/20 bg-black/40 p-4 font-mono text-[11px] leading-5 text-red-100">{data.deadlockText}</pre> : <div className="flex h-full items-center justify-center"><div className="max-w-md text-center"><AlertTriangle className="mx-auto mb-3 h-8 w-8 text-zinc-700" /><h3 className="text-sm font-medium">Deadlock kaydı bulunamadı</h3><p className="mt-1 text-xs text-zinc-500">InnoDB status erişimi yoksa veya yakın zamanda deadlock oluşmadıysa bu bölüm boş kalır.</p></div></div>}</TabsContent>
        </Tabs>
      </div>
    </div>, document.body
  )}
    <CoreorConfirmModal action={confirmation} onClose={() => setConfirmation(null)} />
  </>;
}
