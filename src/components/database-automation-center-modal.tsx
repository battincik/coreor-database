'use client';

import { useModalEscape } from '@/lib/useModalEscape';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Database,
  Download,
  FileClock,
  FileCode2,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  Wand2,
  X
} from 'lucide-react';
import type { DatabaseServerConfig, QueryExecutionResult } from 'types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { CoreorSwitch } from '@/components/ui/coreor-switch';
import { SqlCode } from '@/components/ui/sql-syntax';
import { executeDatabaseQuery } from '@/lib/databaseApi';
import { useLanguage } from '@/context/LanguageContext';
import { detectPlatform, shortcutLabel, type ShortcutId } from '@/lib/shortcuts';
import {
  approvalRequests,
  automationId,
  backupCommand,
  backupTasks,
  maskValue,
  migrationDrafts,
  preparedStatementSets,
  schemaSnapshots,
  type ApprovalRequest,
  type BackupTask,
  type MigrationDraft,
  type PreparedStatementSet,
  type SchemaSnapshot
} from '@/lib/databaseAutomation';

export type AutomationCenterTab = 'history' | 'migrations' | 'backups' | 'indexes' | 'prepared' | 'approvals' | 'compare' | 'masking' | 'shortcuts';

interface DatabaseAutomationCenterModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: AutomationCenterTab;
  servers: DatabaseServerConfig[];
  activeServerId: string | null;
  accountId?: string | null;
  selectedDatabase?: string | null;
  selectedTable?: string | null;
}

const TABS: Array<{ id: AutomationCenterTab; labelKey: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'history', labelKey: 'automation.tableHistory', icon: FileClock },
  { id: 'migrations', labelKey: 'automation.migrations', icon: FileCode2 },
  { id: 'backups', labelKey: 'automation.backups', icon: Archive },
  { id: 'indexes', labelKey: 'automation.indexAdvisor', icon: Sparkles },
  { id: 'prepared', labelKey: 'automation.tab.prepared', icon: Code2 },
  { id: 'approvals', labelKey: 'automation.approvals', icon: ClipboardCheck },
  { id: 'compare', labelKey: 'automation.dataCompare', icon: BarChart3 },
  { id: 'masking', labelKey: 'automation.masking', icon: ShieldCheck },
  { id: 'shortcuts', labelKey: 'automation.tab.shortcuts', icon: KeyRound }
];
function splitCsv(value: string) {
  const items: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) {
        if (value[index + 1] === quote) {
          current += quote;
          index += 1;
        } else {
          quote = null;
        }
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ',') {
      items.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }

  if (current.length || value.endsWith(',')) items.push(current.trim());
  return items;
}

function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const SHORTCUT_REFERENCE: Array<[ShortcutId, string]> = [
  ['commandPalette', 'automation.shortcut.commandPalette'],
  ['runQuery', 'automation.shortcut.runQuery'],
  ['formatSql', 'automation.shortcut.formatSql'],
  ['newQuery', 'automation.shortcut.newQuery'],
  ['refresh', 'automation.refreshActive'],
  ['insertRow', 'automation.addRow'],
  ['settings', 'common.settings'],
  ['find', 'settingsCatalog.shortcuts.find'],
  ['closeTab', 'settingsCatalog.shortcuts.closeTab'],
  ['duplicateTab', 'automation.duplicateQuery'],
  ['language', 'automation.languageSelector'],
  ['backupCenter', 'automation.shortcut.backupCenter'],
  ['automationCenter', 'automation.shortcut.operationsCenter']
];

export function DatabaseAutomationCenterModal({ open, onClose, initialTab = 'history', servers, activeServerId, accountId, selectedDatabase, selectedTable }: DatabaseAutomationCenterModalProps) {
  const {t,formatNumber,language}=useLanguage();
  const [tab, setTab] = useState<AutomationCenterTab>(initialTab);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useModalEscape(open, onClose, busy);
  const [serverId, setServerId] = useState(activeServerId || '');
  const [databaseName, setDatabaseName] = useState(selectedDatabase || '');
  const [tableName, setTableName] = useState(selectedTable || '');
  const [migrationName, setMigrationName] = useState('schema_change');
  const [upSql, setUpSql] = useState('ALTER TABLE table_name ADD COLUMN new_column VARCHAR(255) NULL;');
  const [downSql, setDownSql] = useState('ALTER TABLE table_name DROP COLUMN new_column;');
  const [backupName, setBackupName] = useState('');
  const [backupDestination, setBackupDestination] = useState('./backups/database.sql');
  const [backupSchedule, setBackupSchedule] = useState<BackupTask['schedule']>('manual');
  const [explainSql, setExplainSql] = useState('SELECT * FROM table_name WHERE column_name = ?;');
  const [indexResult, setIndexResult] = useState<QueryExecutionResult | null>(null);
  const [preparedName, setPreparedName] = useState('');
  const [preparedSql, setPreparedSql] = useState('SELECT * FROM table_name WHERE id = ?;');
  const [preparedValues, setPreparedValues] = useState('1');
  const [preparedResult, setPreparedResult] = useState<QueryExecutionResult | null>(null);
  const [compareServerId, setCompareServerId] = useState('');
  const [compareDatabase, setCompareDatabase] = useState('');
  const [compareTable, setCompareTable] = useState('');
  const [compareKey, setCompareKey] = useState('id');
  const [comparison, setComparison] = useState<{ onlyLeft: number; onlyRight: number; changed: number; sample: unknown[] } | null>(null);
  const [maskColumns, setMaskColumns] = useState('email:email,phone:phone,tc:tc,address:address');
  const [maskPreview, setMaskPreview] = useState<Record<string, unknown>[]>([]);
  useEffect(() => { if (open) { setTab(initialTab); setServerId(activeServerId || ''); setDatabaseName(selectedDatabase || ''); setTableName(selectedTable || ''); } }, [open, initialTab, activeServerId, selectedDatabase, selectedTable]);
  useEffect(() => { if (!open) return; const handler = () => setRevision(value => value + 1); window.addEventListener('coreor:automation-store-changed', handler); return () => window.removeEventListener('coreor:automation-store-changed', handler); }, [open]);

  const server = servers.find(item => item.id === serverId) || null;
  const serverOptions = useMemo<SearchSelectOption[]>(() => servers.map(item => ({ value: item.id, label: item.name, description: `${item.host}:${item.port}`, badge: item.databaseType })), [servers]);
  const databaseOptions = useMemo<SearchSelectOption[]>(() => (server?.databases || []).map(item => ({ value: item.name, label: item.name, description: t('tableSchema.tableCount',{count:formatNumber(item.tableCount)}) })), [server,t,formatNumber]);
  const tableOptions = useMemo<SearchSelectOption[]>(() => (server?.databases?.find(item => item.name === databaseName)?.tables || []).map(name => ({ value: name, label: name })), [server, databaseName]);
  const snapshots = useMemo(() => schemaSnapshots.list(), [revision]);
  const migrations = useMemo(() => migrationDrafts.list(), [revision]);
  const backups = useMemo(() => backupTasks.list(), [revision]);
  const approvals = useMemo(() => approvalRequests.list(), [revision]);
  const preparedSets = useMemo(() => preparedStatementSets.list(), [revision]);

  if (!open || typeof document === 'undefined') return null;

  const execute = async (sql: string, targetServerId = serverId, targetDatabase = databaseName || null) => {
    if (!accountId || !targetServerId) throw new Error(t('automation.error.sessionRequired'));
    return executeDatabaseQuery(targetServerId, sql, accountId, targetDatabase);
  };

  const runIndexAnalysis = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const prefix = server?.databaseType === 'postgresql' || server?.databaseType === 'cockroachdb' ? 'EXPLAIN (FORMAT JSON) ' : server?.databaseType === 'mssql' ? 'SET SHOWPLAN_ALL ON; ' : 'EXPLAIN ';
      const result = await execute(`${prefix}${explainSql}`); setIndexResult(result);
      setMessage(t('automation.status.planReady'));
    } catch (failure) { setError(failure instanceof Error ? failure.message : t('automation.error.planFailed')); }
    finally { setBusy(false); }
  };

  const runPrepared = async () => {
    const values = splitCsv(preparedValues);
    let index = 0;
    const sql = preparedSql.replace(/\?/g, () => {
      const value = values[index++] ?? '';
      if (/^-?\d+(\.\d+)?$/.test(value)) return value;
      if (value.toLocaleLowerCase(language) === 'null') return 'NULL';
      return `'${value.replace(/'/g, "''")}'`;
    });
    setBusy(true); setError(null);
    try { const result = await execute(sql); setPreparedResult(result); setMessage(t('automation.status.preparedExecuted')); }
    catch (failure) { setError(failure instanceof Error ? failure.message : t('automation.error.preparedFailed')); }
    finally { setBusy(false); }
  };

  const compareData = async () => {
    if (!compareServerId || !compareDatabase || !compareTable || !tableName) return;
    setBusy(true); setError(null);
    try {
      const [left, right] = await Promise.all([
        execute(`SELECT * FROM ${tableName} LIMIT 5000`, serverId, databaseName),
        execute(`SELECT * FROM ${compareTable} LIMIT 5000`, compareServerId, compareDatabase)
      ]);
      const leftMap = new Map(left.rows.map(row => [String(row[compareKey]), row]));
      const rightMap = new Map(right.rows.map(row => [String(row[compareKey]), row]));
      const onlyLeft = [...leftMap.keys()].filter(key => !rightMap.has(key));
      const onlyRight = [...rightMap.keys()].filter(key => !leftMap.has(key));
      const changed = [...leftMap.keys()].filter(key => rightMap.has(key) && JSON.stringify(leftMap.get(key)) !== JSON.stringify(rightMap.get(key)));
      setComparison({ onlyLeft: onlyLeft.length, onlyRight: onlyRight.length, changed: changed.length, sample: [...onlyLeft.slice(0, 5).map(key => ({ type: t('automation.onlyLeft'), key })), ...onlyRight.slice(0, 5).map(key => ({ type: t('automation.onlyRight'), key })), ...changed.slice(0, 5).map(key => ({ type: t('automation.changedLower'), key }))] });
      setMessage(t('automation.status.compareDone'));
    } catch (failure) { setError(failure instanceof Error ? failure.message : t('automation.error.compareFailed')); }
    finally { setBusy(false); }
  };

  const previewMasking = async () => {
    setBusy(true); setError(null);
    try {
      const result = await execute(`SELECT * FROM ${tableName} LIMIT 25`);
      const rules = splitCsv(maskColumns).map(item => item.split(':')).filter(item => item.length === 2) as Array<[string, 'email' | 'phone' | 'tc' | 'address']>;
      setMaskPreview(result.rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
        const rule = rules.find(([column]) => column === key); return [key, rule ? maskValue(value, rule[1]) : value];
      }))));
      setMessage(t('automation.status.maskPreview'));
    } catch (failure) { setError(failure instanceof Error ? failure.message : t('automation.error.maskPreview')); }
    finally { setBusy(false); }
  };

  const commonTarget = <div className="grid gap-2 md:grid-cols-3"><SearchSelect value={serverId} options={serverOptions} onValueChange={value => { setServerId(value); setDatabaseName(''); setTableName(''); }} placeholder={t('intelligence.select.server')} /><SearchSelect value={databaseName} options={databaseOptions} onValueChange={value => { setDatabaseName(value); setTableName(''); }} placeholder={t('intelligence.select.database')} /><SearchSelect value={tableName} options={tableOptions} onValueChange={setTableName} placeholder={t('intelligence.select.table')} /></div>;

  const renderTab = () => {
    if (tab === 'history') return <div className="space-y-4">{commonTarget}<div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4 text-[11px] leading-5 text-cyan-100">{t('automation.alterSnapshotInfo')}</div><div className="space-y-2">{snapshots.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-xs text-zinc-600">{t('automation.empty.snapshots')}</div> : snapshots.map((item: SchemaSnapshot) => <article key={item.id} className="rounded-xl border border-zinc-800 bg-black/20 p-4"><div className="flex gap-3"><FileClock className="h-4 w-4 text-cyan-400"/><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{item.databaseName}.{item.tableName}</div><div className="mt-1 text-[9px] text-zinc-600">{new Date(item.createdAt).toLocaleString('tr-TR')} • {item.reason}</div><pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 font-mono text-[9px] text-cyan-200">{item.createSql || item.alterSql}</pre></div><Button variant="ghost" size="icon" onClick={() => schemaSnapshots.remove(item.id)}><Trash2 className="h-3.5 w-3.5"/></Button></div></article>)}</div></div>;

    if (tab === 'migrations') return <div className="space-y-4">{commonTarget}<div className="grid gap-3 lg:grid-cols-2"><div className="space-y-3 rounded-xl border border-zinc-800 p-4"><Input value={migrationName} onChange={event => setMigrationName(event.target.value)} placeholder={t('automation.migrationName')}/><label className="block text-[10px] text-zinc-500">{t('automation.upSql')}<textarea value={upSql} onChange={event => setUpSql(event.target.value)} className="mt-1 h-36 w-full rounded-lg border border-zinc-800 bg-black/30 p-3 font-mono text-[10px] outline-none"/></label><label className="block text-[10px] text-zinc-500">{t('automation.downSql')}<textarea value={downSql} onChange={event => setDownSql(event.target.value)} className="mt-1 h-36 w-full rounded-lg border border-zinc-800 bg-black/30 p-3 font-mono text-[10px] outline-none"/></label><Button onClick={() => { const item: MigrationDraft = { id: automationId('migration'), serverId, databaseName, name: migrationName, createdAt: new Date().toISOString(), upSql, downSql, source: 'manual', status: 'draft' }; migrationDrafts.save(item); setMessage('Migration taslağı kaydedildi.'); }}><Save className="mr-2 h-4 w-4"/>{t('automation.action.saveMigration')}</Button></div><div className="space-y-2">{migrations.map(item => <article key={item.id} className="rounded-xl border border-zinc-800 p-3"><div className="flex items-center gap-2"><FileCode2 className="h-4 w-4 text-purple-400"/><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{item.name}</div><div className="text-[9px] text-zinc-600">{item.databaseName} • {item.status}</div></div><Button variant="ghost" size="sm" onClick={() => downloadText(`${item.name}.sql`, `-- UP\n${item.upSql}\n\n-- DOWN\n${item.downSql}`)}><Download className="h-3.5 w-3.5"/></Button></div></article>)}</div></div></div>;

    if (tab === 'backups') return <div className="space-y-4">{commonTarget}<div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]"><div className="space-y-3 rounded-xl border border-zinc-800 p-4"><Input value={backupName} onChange={event => setBackupName(event.target.value)} placeholder={t('automation.taskName')}/><Input value={backupDestination} onChange={event => setBackupDestination(event.target.value)} placeholder={t('automation.targetFile')}/><SearchSelect value={backupSchedule} onValueChange={value => setBackupSchedule(value as BackupTask['schedule'])} options={[{value:'manual',label:t('automation.manual')},{value:'daily',label:t('automation.daily')},{value:'weekly',label:t('automation.weekly')}]}/><SqlCode code={server ? backupCommand(server.databaseType, server.host || 'localhost', server.port || 3306, server.username || 'user', databaseName || null, backupDestination) : '-- sunucu seçin'} className="max-h-36"/><Button disabled={!server} onClick={() => { if (!server) return; backupTasks.save({ id: automationId('backup'), name: backupName, serverId: server.id, engine: server.databaseType, databaseName: databaseName || null, format: server.databaseType === 'mssql' ? 'bacpac' : server.databaseType === 'postgresql' || server.databaseType === 'cockroachdb' ? 'custom' : 'sql', destination: backupDestination, command: backupCommand(server.databaseType, server.host || 'localhost', server.port || 3306, server.username || 'user', databaseName || null, backupDestination), schedule: backupSchedule, createdAt: new Date().toISOString(), status: 'ready' }); setMessage('Yedekleme görevi kaydedildi. Komut yalnızca yetkili host runner üzerinde çalıştırılmalıdır.'); }}><Archive className="mr-2 h-4 w-4"/>{t('automation.action.createTask')}</Button></div><div className="space-y-2">{backups.map(item => <article key={item.id} className="rounded-xl border border-zinc-800 p-4"><div className="flex items-start gap-3"><Archive className="h-4 w-4 text-emerald-400"/><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{item.name}</div><div className="mt-1 text-[9px] text-zinc-600">{item.engine} • {item.schedule} • {item.status}</div><pre className="mt-2 overflow-auto rounded bg-black/30 p-2 font-mono text-[9px] text-zinc-400">{item.command}</pre></div><Button variant="ghost" size="icon" onClick={() => backupTasks.remove(item.id)}><Trash2 className="h-3.5 w-3.5"/></Button></div></article>)}</div></div></div>;

    if (tab === 'indexes') return <div className="space-y-4">{commonTarget}<div className="rounded-xl border border-zinc-800 p-4"><textarea value={explainSql} onChange={event => setExplainSql(event.target.value)} className="h-32 w-full rounded-lg border border-zinc-800 bg-black/30 p-3 font-mono text-[11px] outline-none"/><Button className="mt-3" disabled={busy || !serverId} onClick={() => void runIndexAnalysis()}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Sparkles className="mr-2 h-4 w-4"/>}Execution plan analiz et</Button></div>{indexResult && <div className="rounded-xl border border-zinc-800 p-4"><div className="mb-2 text-xs font-semibold">{t('automation.planSignals')}</div><div className="grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-black/30 p-3"><div className="text-[9px] text-zinc-600">Plan satırı</div><div className="text-xl font-semibold">{indexResult.rows.length}</div></div><div className="rounded-lg bg-black/30 p-3"><div className="text-[9px] text-zinc-600">Kontrol</div><div className="text-xs text-amber-300">Full scan / filesort</div></div><div className="rounded-lg bg-black/30 p-3"><div className="text-[9px] text-zinc-600">Öneri</div><div className="text-xs text-cyan-300">WHERE + JOIN kolonlarını bileşik indeks olarak değerlendirin</div></div></div><pre className="mt-3 max-h-64 overflow-auto rounded bg-black/30 p-3 font-mono text-[9px]">{JSON.stringify(indexResult.rows, null, 2)}</pre></div>}</div>;

    if (tab === 'prepared') return <div className="space-y-4">{commonTarget}<div className="grid gap-4 lg:grid-cols-2"><div className="space-y-3 rounded-xl border border-zinc-800 p-4"><Input value={preparedName} onChange={event=>setPreparedName(event.target.value)}/><textarea value={preparedSql} onChange={event=>setPreparedSql(event.target.value)} className="h-32 w-full rounded-lg border border-zinc-800 bg-black/30 p-3 font-mono text-[11px]"/><Input value={preparedValues} onChange={event=>setPreparedValues(event.target.value)} placeholder={t('automation.commaParams')}/><div className="flex gap-2"><Button onClick={() => void runPrepared()} disabled={busy}><Play className="mr-2 h-4 w-4"/>{t('automation.action.run')}</Button><Button variant="outline" onClick={() => preparedStatementSets.save({ id: automationId('prepared'), name: preparedName, serverId, databaseName: databaseName || null, sql: preparedSql, parameters: splitCsv(preparedValues).map((value,index)=>({name:`p${index+1}`,value,type:/^-?\d/.test(value)?'number':'string'})), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() })}><Save className="mr-2 h-4 w-4"/>{t('automation.action.saveSet')}</Button></div></div><div className="space-y-2">{preparedSets.map((item: PreparedStatementSet)=><button key={item.id} className="w-full rounded-xl border border-zinc-800 p-3 text-left" onClick={()=>{setPreparedName(item.name);setPreparedSql(item.sql);setPreparedValues(item.parameters.map(p=>p.value).join(','));}}><div className="text-xs font-semibold">{item.name}</div><div className="mt-1 truncate font-mono text-[9px] text-zinc-600">{item.sql}</div></button>)}</div></div>{preparedResult&&<pre className="max-h-72 overflow-auto rounded-xl border border-zinc-800 bg-black/30 p-4 text-[9px]">{JSON.stringify(preparedResult.rows,null,2)}</pre>}</div>;

    if (tab === 'approvals') return <div className="space-y-4"><div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 text-[11px] leading-5 text-amber-100">{t('automation.approvalInfo')}</div>{approvals.length===0?<div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-xs text-zinc-600">{t('automation.noPendingApproval')}</div>:approvals.map((item:ApprovalRequest)=><article key={item.id} className="rounded-xl border border-zinc-800 p-4"><div className="flex gap-3"><ClipboardCheck className={`h-4 w-4 ${item.status==='approved'?'text-emerald-400':item.status==='rejected'?'text-red-400':'text-amber-400'}`}/><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{item.operation} • {item.status}</div><div className="mt-1 text-[9px] text-zinc-600">Talep: {item.requester} • {new Date(item.createdAt).toLocaleString('tr-TR')}</div><pre className="mt-2 max-h-28 overflow-auto rounded bg-black/30 p-2 font-mono text-[9px]">{item.sql}</pre></div>{item.status==='pending'&&<div className="flex gap-1"><Button size="sm" onClick={()=>approvalRequests.save({...item,status:'approved',approver:'local-approver',resolvedAt:new Date().toISOString()})}>{t('automation.action.approve')}</Button><Button size="sm" variant="destructive" onClick={()=>approvalRequests.save({...item,status:'rejected',approver:'local-approver',resolvedAt:new Date().toISOString()})}>{t('automation.action.reject')}</Button></div>}</div></article>)}</div>;

    if (tab === 'compare') return <div className="space-y-4"><div className="grid gap-2 lg:grid-cols-2"><div className="rounded-xl border border-zinc-800 p-4"><div className="mb-3 text-xs font-semibold">{t('automation.source')}</div>{commonTarget}</div><div className="space-y-2 rounded-xl border border-zinc-800 p-4"><div className="text-xs font-semibold">{t('automation.target')}</div><SearchSelect value={compareServerId} options={serverOptions} onValueChange={setCompareServerId} placeholder={t('automation.targetServer')}/><Input value={compareDatabase} onChange={event=>setCompareDatabase(event.target.value)} placeholder={t('automation.targetDatabase')}/><Input value={compareTable} onChange={event=>setCompareTable(event.target.value)} placeholder={t('automation.targetTable')}/><Input value={compareKey} onChange={event=>setCompareKey(event.target.value)} placeholder={t('automation.compareKey')}/></div></div><Button disabled={busy} onClick={()=>void compareData()}><RefreshCw className="mr-2 h-4 w-4"/>{t('automation.compare')}</Button>{comparison&&<div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-cyan-500/20 p-4"><div className="text-[9px] text-zinc-600">{t('automation.onlySource')}</div><div className="text-2xl font-semibold">{comparison.onlyLeft}</div></div><div className="rounded-xl border border-purple-500/20 p-4"><div className="text-[9px] text-zinc-600">{t('automation.onlyTarget')}</div><div className="text-2xl font-semibold">{comparison.onlyRight}</div></div><div className="rounded-xl border border-amber-500/20 p-4"><div className="text-[9px] text-zinc-600">Değişmiş</div><div className="text-2xl font-semibold">{comparison.changed}</div></div></div>}</div>;

    if (tab === 'masking') return <div className="space-y-4">{commonTarget}<div className="rounded-xl border border-zinc-800 p-4"><div className="mb-2 text-xs font-semibold">{t('automation.columnMaskRules')}</div><Input value={maskColumns} onChange={event=>setMaskColumns(event.target.value)} placeholder="email:email,phone:phone"/><Button className="mt-3" onClick={()=>void previewMasking()} disabled={busy||!tableName}><Wand2 className="mr-2 h-4 w-4"/>{t('automation.action.preview')}</Button></div>{maskPreview.length>0&&<div className="overflow-auto rounded-xl border border-zinc-800"><pre className="p-4 font-mono text-[9px]">{JSON.stringify(maskPreview,null,2)}</pre></div>}</div>;

    return <div className="space-y-4"><div className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.04] p-4 text-[11px] leading-5 text-zinc-400">{t('automation.shortcutsInfo')} <b className="text-cyan-300">{detectPlatform() === 'mac' ? 'macOS' : detectPlatform() === 'windows' ? 'Windows' : 'Linux'}</b>{t('automation.platformShortcutInfo')}</div><div className="grid gap-2 md:grid-cols-2">{SHORTCUT_REFERENCE.map(([id,labelKey])=><div key={id} className="flex items-center gap-4 rounded-xl border border-zinc-800 p-3"><div className="min-w-0 flex-1 text-xs font-medium">{t(labelKey)}</div><kbd className="rounded-lg border border-zinc-700 bg-black/30 px-2 py-1 font-mono text-[10px] text-cyan-300">{shortcutLabel(id)}</kbd></div>)}</div></div>;
  };

  return createPortal(<div className="fixed inset-0 z-[345] flex items-center justify-center p-2 sm:p-3"><button className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}/><div className="relative z-10 flex h-[calc(100dvh-16px)] max-h-[900px] w-[calc(100vw-16px)] max-w-[1460px] min-w-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)]"><aside className="w-[clamp(180px,20vw,240px)] shrink-0 overflow-y-auto border-r border-zinc-800 bg-black/20 p-2"><div className="p-3"><div className="text-sm font-semibold">{t('automation.operationsCenter')}</div><div className="mt-1 text-[9px] text-zinc-600">Coreor Database</div></div>{TABS.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>{setTab(item.id);setMessage(null);setError(null);}} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[11px] ${tab===item.id?'bg-cyan-500/10 text-cyan-100':'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200'}`}><Icon className="h-4 w-4"/>{t(item.labelKey)}</button>})}</aside><main className="flex min-w-0 flex-1 flex-col"><header className="flex h-12 shrink-0 items-center border-b border-zinc-800 px-4"><div className="text-sm font-semibold">{t(TABS.find(item=>item.id===tab)?.labelKey || 'automation.operationsCenter')}</div><Button variant="ghost" size="icon" className="ml-auto" onClick={onClose}><X className="h-4 w-4"/></Button></header>{message&&<div className="border-b border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2 text-[10px] text-emerald-300"><CheckCircle2 className="mr-2 inline h-3.5 w-3.5"/>{message}</div>}{error&&<div className="border-b border-red-500/20 bg-red-500/[0.06] px-4 py-2 text-[10px] text-red-300">{error}</div>}<div className="min-h-0 flex-1 overflow-y-auto p-5">{renderTab()}</div></main></div></div>,document.body);
}
