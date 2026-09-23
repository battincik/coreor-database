'use client';
import { useTrackedBusy } from '@/lib/useUpdateActivity';

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Gauge,
  Loader2,
  PauseCircle,
  Play,
  ShieldCheck,
  Table2,
  Wrench,
  X
} from 'lucide-react';
import type { DatabaseEngine, DatabaseServerConfig } from 'types';
import type { DatabaseMaintenanceOperation } from '@/lib/databaseWorkbenchTypes';
import { runDatabaseMaintenanceStep } from '@/lib/databaseWorkbenchApi';
import { fetchServerTables } from '@/lib/databaseApi';
import { databaseEngineFamily, databaseEngineLabel } from '@/lib/databaseEngines';
import { publishCoreorNotification } from '@/lib/notificationStore';
import { useModalEscape } from '@/lib/useModalEscape';
import { Button } from '@/components/ui/button';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useLanguage } from '@/context/LanguageContext';

interface DatabaseMaintenanceModalProps {
  open: boolean;
  onClose: () => void;
  server: DatabaseServerConfig | null;
  accountId?: string | null;
  initialDatabase?: string | null;
  initialTable?: string | null;
}

interface MaintenanceOperationDefinition {
  id: DatabaseMaintenanceOperation;
  label: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  readOnlySafe?: boolean;
}

interface TableProgress {
  completed: number;
  total: number;
  success: number;
  failed: number;
  durationMs: number;
  currentOperation: DatabaseMaintenanceOperation | null;
  error: string | null;
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled';
}

interface MaintenanceLog {
  id: string;
  table: string;
  operation: DatabaseMaintenanceOperation;
  status: 'success' | 'error';
  durationMs: number;
  message: string;
}

function operationDefinitions(engine: DatabaseEngine | undefined, t: (key: string) => string): MaintenanceOperationDefinition[] {
  if (engine === 'cockroachdb') {
    return [{ id: 'analyze', label: 'ANALYZE', description: t('maintenance.optimizerStats'), impact: 'low' }];
  }
  const family = databaseEngineFamily(engine);
  if (family === 'postgresql') {
    return [
      { id: 'analyze', label: 'ANALYZE', description: t('maintenance.plannerStats'), impact: 'low' },
      { id: 'vacuum-analyze', label: 'VACUUM ANALYZE', description: t('maintenance.vacuumAnalyze'), impact: 'medium' },
      { id: 'reindex', label: 'REINDEX', description: t('maintenance.rebuildIndexes'), impact: 'high' }
    ];
  }
  if (family === 'mssql') {
    return [
      { id: 'check', label: 'CHECKTABLE', description: t('maintenance.integrityCheck'), impact: 'medium', readOnlySafe: true },
      { id: 'update-statistics', label: 'UPDATE STATISTICS', description: t('maintenance.optimizerStats'), impact: 'low' },
      { id: 'reorganize-index', label: 'INDEX REORGANIZE', description: t('maintenance.reorganizeIndexes'), impact: 'medium' }
    ];
  }
  return [
    { id: 'check', label: 'CHECK TABLE', description: t('maintenance.integrityStatus'), impact: 'low', readOnlySafe: true },
    { id: 'analyze', label: 'ANALYZE TABLE', description: t('maintenance.optimizerStats'), impact: 'low' },
    { id: 'optimize', label: 'OPTIMIZE TABLE', description: t('maintenance.optimizeTable'), impact: 'high' }
  ];
}

function defaultOperations(engine: DatabaseEngine | undefined, readOnly: boolean, t: (key: string) => string) {
  const definitions = operationDefinitions(engine, t);
  if (readOnly) return definitions.filter(operation => operation.readOnlySafe).map(operation => operation.id);
  if (databaseEngineFamily(engine) === 'mssql') return definitions.filter(operation => operation.id === 'update-statistics').map(operation => operation.id);
  return definitions.filter(operation => operation.id === 'analyze' || operation.id === 'check').map(operation => operation.id);
}

function impactClass(impact: MaintenanceOperationDefinition['impact']) {
  return impact === 'high'
    ? 'border-amber-500/20 bg-amber-500/[0.05] text-amber-300'
    : impact === 'medium'
      ? 'border-sky-500/20 bg-sky-500/[0.05] text-sky-300'
      : 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-300';
}

function percent(completed: number, total: number) {
  return total ? Math.min(100, Math.max(0, Math.round(completed / total * 100))) : 0;
}

export function DatabaseMaintenanceModal({
  open,
  onClose,
  server,
  accountId,
  initialDatabase,
  initialTable
}: DatabaseMaintenanceModalProps) {
  const { loadServers } = useContext(DatabaseContext)!;
  const { t, formatNumber } = useLanguage();
  const [databaseName, setDatabaseName] = useState(initialDatabase || '');
  const [scope, setScope] = useState<'database' | 'table'>(initialTable ? 'table' : 'database');
  const [tableName, setTableName] = useState(initialTable || '');
  const [operations, setOperations] = useState<DatabaseMaintenanceOperation[]>([]);
  const [running, setRunning] = useTrackedBusy();
  const [cancelRequested, setCancelRequested] = useState(false);
  const [overall, setOverall] = useState({ completed: 0, total: 0, success: 0, failed: 0 });
  const [tableProgress, setTableProgress] = useState<Record<string, TableProgress>>({});
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const cancelRef = useRef(false);
  useModalEscape(open, onClose, running);

  const databases = useMemo(() => server?.databases || [], [server]);
  const database = databases.find(item => item.name === databaseName) || null;
  const definitions = useMemo(() => operationDefinitions(server?.databaseType, t), [server?.databaseType, t]);
  const allowedDefinitions = useMemo(
    () => server?.readOnly ? definitions.filter(operation => operation.readOnlySafe) : definitions,
    [definitions, server?.readOnly]
  );
  const tableOptions = useMemo<SearchSelectOption[]>(
    () => (database?.tables || []).map(table => ({ value: table, label: table, description: t('maintenance.tableTarget') })),
    [database, t]
  );
  const databaseOptions = useMemo<SearchSelectOption[]>(
    () => databases.map(item => ({
      value: item.name,
      label: item.name,
      description: t('maintenance.databaseSummary',{tables:formatNumber(item.tableCount),rows:formatNumber(Number(item.totalRows || 0))})
    })),
    [databases, formatNumber, t]
  );

  useEffect(() => {
    if (!open) return;
    const nextDatabase = initialDatabase && databases.some(item => item.name === initialDatabase)
      ? initialDatabase
      : databases[0]?.name || '';
    setDatabaseName(nextDatabase);
    setScope(initialTable ? 'table' : 'database');
    setTableName(initialTable || '');
    setOperations(defaultOperations(server?.databaseType, Boolean(server?.readOnly), t));
    setRunning(false);
    setCancelRequested(false);
    cancelRef.current = false;
    setOverall({ completed: 0, total: 0, success: 0, failed: 0 });
    setTableProgress({});
    setLogs([]);
  }, [open, initialDatabase, initialTable, server?.id, server?.databaseType, server?.readOnly, databases, setRunning, t]);

  useEffect(() => {
    if (!databaseName || !database) return;
    if (scope === 'table' && !database.tables.includes(tableName)) setTableName(database.tables[0] || '');
  }, [databaseName, database, scope, tableName]);

  const toggleOperation = (operation: DatabaseMaintenanceOperation) => {
    if (running) return;
    setOperations(current => current.includes(operation)
      ? current.filter(item => item !== operation)
      : [...current, operation]);
  };

  const requestCancel = () => {
    cancelRef.current = true;
    setCancelRequested(true);
  };

  const run = async () => {
    if (!server || !accountId || !database || !operations.length || running) return;
    const targets = scope === 'table'
      ? (tableName ? [tableName] : [])
      : database.tables;
    if (!targets.length) return;

    cancelRef.current = false;
    setCancelRequested(false);
    setRunning(true);
    setLogs([]);

    const initialProgress = Object.fromEntries(targets.map(table => [table, {
      completed: 0,
      total: operations.length,
      success: 0,
      failed: 0,
      durationMs: 0,
      currentOperation: null,
      error: null,
      status: 'pending'
    } satisfies TableProgress]));
    setTableProgress(initialProgress);
    const total = targets.length * operations.length;
    let completed = 0;
    let success = 0;
    let failed = 0;
    setOverall({ completed: 0, total, success: 0, failed: 0 });

    for (const table of targets) {
      if (cancelRef.current) break;
      for (const operation of operations) {
        if (cancelRef.current) break;
        setTableProgress(current => ({
          ...current,
          [table]: { ...current[table], currentOperation: operation, status: 'running', error: null }
        }));
        const startedAt = performance.now();
        try {
          const result = await runDatabaseMaintenanceStep(server.id, { database: database.name, table, operation }, accountId);
          const durationMs = result.durationMs || Math.round(performance.now() - startedAt);
          completed += 1;
          success += 1;
          setTableProgress(current => {
            const previous = current[table];
            const nextCompleted = previous.completed + 1;
            return {
              ...current,
              [table]: {
                ...previous,
                completed: nextCompleted,
                success: previous.success + 1,
                durationMs: previous.durationMs + durationMs,
                currentOperation: null,
                status: nextCompleted === previous.total ? 'success' : 'running'
              }
            };
          });
          setLogs(current => [{
            id: `${table}:${operation}:${Date.now()}`,
            table,
            operation,
            status: 'success' as const,
            durationMs,
            message: result.rows.length ? `${result.rows.length} sonuç satırı` : t('maintenance.completed')
          }, ...current].slice(0, 200));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const durationMs = Math.round(performance.now() - startedAt);
          completed += 1;
          failed += 1;
          setTableProgress(current => {
            const previous = current[table];
            const nextCompleted = previous.completed + 1;
            return {
              ...current,
              [table]: {
                ...previous,
                completed: nextCompleted,
                failed: previous.failed + 1,
                durationMs: previous.durationMs + durationMs,
                currentOperation: null,
                error: message,
                status: nextCompleted === previous.total ? 'error' : 'running'
              }
            };
          });
          setLogs(current => [{
            id: `${table}:${operation}:${Date.now()}`,
            table,
            operation,
            status: 'error' as const,
            durationMs,
            message
          }, ...current].slice(0, 200));
        }
        setOverall({ completed, total, success, failed });
      }
    }

    if (cancelRef.current) {
      setTableProgress(current => Object.fromEntries(Object.entries(current).map(([table, state]) => [
        table,
        state.completed < state.total && state.status !== 'error'
          ? { ...state, status: 'cancelled', currentOperation: null }
          : state
      ])));
    }

    try {
      await fetchServerTables(server.id, accountId);
      await loadServers();
    } catch { /* maintenance result stays valid even when catalog refresh fails */ }

    publishCoreorNotification({
      id: `maintenance-${server.id}-${database.name}-${Date.now()}`,
      severity: failed ? 'warning' : 'success',
      source: 'system',
      title: cancelRef.current ? t('maintenance.taskStopped') : failed ? t('maintenance.partialFailure') : t('maintenance.completedTitle'),
      description: t('maintenance.notificationSummary',{database:database.name,success:formatNumber(success),failed:formatNumber(failed),completed:formatNumber(completed),total:formatNumber(total)}),
      serverId: server.id,
      serverName: server.name,
      databaseName: database.name,
      code: failed ? 'MAINTENANCE_PARTIAL_FAILURE' : 'MAINTENANCE_COMPLETED',
      metadata: [
        { label: t('maintenance.scope'), value: scope === 'table' ? t('maintenance.tableScopeValue',{table:tableName}) : t('maintenance.tablesScopeValue',{count:formatNumber(targets.length)}) },
        { label: t('maintenance.operations'), value: operations.join(', ') },
        { label: t('maintenance.completedLabel'), value: `${completed}/${total}` }
      ]
    });

    setRunning(false);
  };

  if (!open || !server || typeof document === 'undefined') return null;

  const visibleTables = Object.entries(tableProgress);
  const overallPercent = percent(overall.completed, overall.total);

  return createPortal(
    <div className="fixed inset-0 z-[370] flex items-center justify-center p-2 sm:p-3">
      <button type="button" aria-label={t('maintenance.close')} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={running ? undefined : onClose} />
      <div className="relative z-10 flex h-[calc(100dvh-16px)] max-h-[860px] w-[calc(100vw-16px)] max-w-[1180px] min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)]">
        <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-300"><Wrench className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-zinc-100">{t('maintenance.title')}</div>
            <div className="mt-0.5 truncate text-[8px] text-zinc-600">{t('maintenance.subtitle',{server:server.name,engine:databaseEngineLabel(server.databaseType)})}</div>
          </div>
          {server.readOnly && <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[8px] text-amber-300">{t('query.readOnly')}</span>}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} disabled={running}><X className="h-4 w-4" /></Button>
        </header>

        <div className="coreor-scrollbar min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
            <section className="rounded-xl border border-zinc-800 bg-black/20 p-3">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold text-zinc-300"><Database className="h-3.5 w-3.5 text-cyan-400" />{t('maintenance.target')}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div><div className="mb-1 text-[8px] uppercase tracking-wider text-zinc-600">{t('database.database')}</div><SearchSelect value={databaseName} options={databaseOptions} onValueChange={value => { setDatabaseName(value); setTableName(''); }} disabled={running} searchPlaceholder={t('maintenance.databaseSearch')} dropdownMinWidth={360} /></div>
                <div><div className="mb-1 text-[8px] uppercase tracking-wider text-zinc-600">{t('maintenance.scope')}</div><div className="flex h-10 rounded-xl border border-zinc-800 bg-zinc-950 p-1">{(['database','table'] as const).map(value => <button key={value} type="button" disabled={running} onClick={() => setScope(value)} className={`flex-1 rounded-lg text-[9px] transition ${scope === value ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-600 hover:text-zinc-300'}`}>{value === 'database' ? t('maintenance.allTables') : t('maintenance.singleTable')}</button>)}</div></div>
              </div>
              {scope === 'table' && <div className="mt-2"><div className="mb-1 text-[8px] uppercase tracking-wider text-zinc-600">{t('database.table')}</div><SearchSelect value={tableName} options={tableOptions} onValueChange={setTableName} disabled={running} searchPlaceholder={t('maintenance.tableSearch')} dropdownMinWidth={380} /></div>}
              <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-2.5 text-[8px] leading-4 text-zinc-500">
                {scope === 'database'
  ? t('maintenance.databaseScopeInfo', { count: formatNumber(database?.tables.length || 0) })
  : tableName
    ? t('maintenance.tableScopeInfo', { table: tableName })
    : t('maintenance.selectTable')}
                {' '}{t('maintenance.executionInfo')}
              </div>
            </section>

            <section className="rounded-xl border border-zinc-800 bg-black/20 p-3">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold text-zinc-300"><Gauge className="h-3.5 w-3.5 text-emerald-400" />{t('maintenance.operations')}</div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {allowedDefinitions.map(operation => {
                  const selected = operations.includes(operation.id);
                  return <button key={operation.id} type="button" disabled={running} onClick={() => toggleOperation(operation.id)} className={`min-w-0 rounded-xl border p-3 text-left transition ${selected ? 'border-cyan-500/35 bg-cyan-500/[0.06]' : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'}`}>
                    <div className="flex items-start gap-2"><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-cyan-400 bg-cyan-400 text-black' : 'border-zinc-700'}`}>{selected && <CheckCircle2 className="h-3 w-3" />}</span><span className="min-w-0 flex-1"><span className="block text-[9px] font-semibold text-zinc-200">{operation.label}</span><span className="mt-1 block text-[8px] leading-4 text-zinc-600">{operation.description}</span></span></div>
                    <span className={`mt-2 inline-flex rounded border px-1.5 py-0.5 text-[7px] ${impactClass(operation.impact)}`}>{operation.impact === 'high' ? t('maintenance.highIo') : operation.impact === 'medium' ? t('maintenance.mediumLoad') : t('maintenance.lowLoad')}</span>
                  </button>;
                })}
              </div>
              {server.readOnly && !allowedDefinitions.length && <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[9px] text-amber-300">{t('maintenance.readOnlyUnavailable')}</div>}
            </section>
          </div>

          <section className="mt-3 rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-[9px]"><span className="font-medium text-zinc-300">{running ? cancelRequested ? t('maintenance.stopAfterCurrent') : t('maintenance.running') : overall.total ? t('maintenance.lastResult') : t('common.ready')}</span><span className="font-mono text-zinc-600">{overall.completed}/{overall.total || ((scope === 'table' ? (tableName ? 1 : 0) : database?.tables.length || 0) * operations.length)} • %{overallPercent}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-900"><div className="h-full rounded-full bg-cyan-500 transition-[width] duration-300" style={{ width: `${overallPercent}%` }} /></div>
              </div>
              <div className="flex shrink-0 gap-2">
                {running ? <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[9px] text-amber-300" onClick={requestCancel} disabled={cancelRequested}><PauseCircle className="h-3.5 w-3.5" />{t('maintenance.stop')}</Button>
                  : <Button size="sm" className="h-8 gap-1.5 text-[9px]" onClick={() => void run()} disabled={!database || !operations.length || (scope === 'table' && !tableName)}><Play className="h-3.5 w-3.5" />{t('maintenance.start')}</Button>}
              </div>
            </div>
            {overall.total > 0 && <div className="mt-2 flex gap-3 text-[8px]"><span className="text-emerald-400">{t('maintenance.successCount',{count:formatNumber(overall.success)})}</span><span className={overall.failed ? 'text-red-400' : 'text-zinc-600'}>{t('maintenance.failureCount',{count:formatNumber(overall.failed)})}</span><span className="text-zinc-600">{t('maintenance.pendingCount',{count:formatNumber(overall.total-overall.completed)})}</span></div>}
          </section>

          {visibleTables.length > 0 && <section className="mt-3 overflow-hidden rounded-xl border border-zinc-800 bg-black/20">
            <div className="grid grid-cols-[minmax(180px,1fr)_110px_100px_90px] border-b border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[8px] uppercase tracking-wider text-zinc-600"><span>{t('database.table')}</span><span>{t('maintenance.progress')}</span><span>{t('maintenance.status')}</span><span className="text-right">{t('maintenance.duration')}</span></div>
            <div className="coreor-scrollbar max-h-72 overflow-y-auto">
              {visibleTables.map(([table, progress]) => <div key={table} className="grid grid-cols-[minmax(180px,1fr)_110px_100px_90px] items-center border-b border-zinc-900 px-3 py-2 text-[9px] last:border-0">
                <div className="min-w-0"><div className="truncate text-zinc-300">{table}</div><div className="mt-0.5 truncate text-[7px] text-zinc-700">{progress.currentOperation || progress.error || '—'}</div></div>
                <div><div className="h-1.5 overflow-hidden rounded-full bg-zinc-900"><div className={`h-full transition-[width] duration-300 ${progress.failed ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${percent(progress.completed, progress.total)}%` }} /></div><div className="mt-1 font-mono text-[7px] text-zinc-700">{progress.completed}/{progress.total}</div></div>
                <div className={progress.status === 'success' ? 'text-emerald-400' : progress.status === 'error' ? 'text-red-400' : progress.status === 'running' ? 'text-cyan-400' : progress.status === 'cancelled' ? 'text-amber-400' : 'text-zinc-600'}>{progress.status === 'running' ? t('maintenance.working') : progress.status === 'success' ? t('maintenance.completed') : progress.status === 'error' ? t('maintenance.failed') : progress.status === 'cancelled' ? t('maintenance.stopped') : t('maintenance.pending')}</div>
                <div className="text-right font-mono text-zinc-600">{progress.durationMs ? `${progress.durationMs} ms` : '—'}</div>
              </div>)}
            </div>
          </section>}

          {logs.length > 0 && <section className="mt-3 rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-[9px] font-semibold text-zinc-400"><Activity className="h-3.5 w-3.5" />{t('maintenance.recentSteps')}</div>
            <div className="space-y-1">
              {logs.slice(0, 8).map(log => <div key={log.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-900 bg-zinc-950/50 px-2.5 py-2 text-[8px]"><span>{log.status === 'success' ? <ShieldCheck className="h-3 w-3 text-emerald-400" /> : <AlertTriangle className="h-3 w-3 text-red-400" />}</span><span className="min-w-0 flex-1 truncate text-zinc-400">{log.table} • {log.operation}</span><span className="truncate text-zinc-600">{log.message}</span><span className="shrink-0 font-mono text-zinc-700">{log.durationMs} ms</span></div>)}
            </div>
          </section>}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-4 py-2.5">
          <div className="flex items-center gap-2 text-[8px] text-zinc-600"><Table2 className="h-3 w-3" />{scope === 'database' ? `${database?.tables.length || 0} tablo` : tableName || t('maintenance.noTable')} • {operations.length} işlem seçili</div>
          <div className="flex items-center gap-2">{running && <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />}<span className="text-[8px] text-zinc-700">{databaseEngineLabel(server.databaseType)}</span></div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
