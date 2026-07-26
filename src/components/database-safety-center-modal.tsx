'use client';

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  BadgeCheck,
  Binary,
  CheckCircle2,
  Clock3,
  Code2,
  Columns3,
  Database,
  Download,
  FileClock,
  FileDiff,
  FileKey2,
  Gauge,
  HardDriveDownload,
  KeyRound,
  Loader2,
  Mask,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  X,
  XCircle
} from 'lucide-react';
import type { DatabaseCatalogItem, DatabaseEngine, DatabaseServerConfig, QueryExecutionResult, TableColumnInfo } from 'types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { CoreorSwitch } from '@/components/ui/coreor-switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SqlCodeBlock } from '@/components/ui/sql-syntax';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { executeDatabaseQuery, fetchTableData, fetchTableInfo } from '@/lib/databaseApi';
import { databaseEngineDefinition, databaseEngineLabel, quoteDatabaseIdentifier } from '@/lib/databaseEngines';
import {
  DEFAULT_SHORTCUTS,
  addApproval,
  deleteBackupJob,
  deletePreparedSet,
  exportSafetyWorkspace,
  getDatabaseSafetyWorkspace,
  getServerDatabaseSafetyWorkspace,
  resetShortcuts,
  reviewApproval,
  saveBackupJob,
  savePreparedSet,
  saveShortcut,
  subscribeDatabaseSafetyWorkspace,
  type ApprovalRecord,
  type BackupJobRecord,
  type PreparedStatementSet
} from '@/lib/databaseSafetyWorkspace';
import type { DatabaseSafetyCenterTab } from '@/lib/databaseSafetyEvents';

interface DatabaseSafetyCenterModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: DatabaseSafetyCenterTab;
  servers: DatabaseServerConfig[];
  activeServerId: string | null;
  accountId?: string | null;
  databases: DatabaseCatalogItem[];
  selectedDatabase?: string | null;
  selectedTable?: string | null;
  initialSql?: string;
}

const tabs: Array<{ id: DatabaseSafetyCenterTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'history', label: 'Tablo geçmişi', icon: FileClock },
  { id: 'backups', label: 'Yedekleme', icon: HardDriveDownload },
  { id: 'approvals', label: 'Onay akışları', icon: UserCheck },
  { id: 'indexes', label: 'İndeks danışmanı', icon: Gauge },
  { id: 'prepared', label: 'Prepared Lab', icon: Binary },
  { id: 'compare', label: 'Veri karşılaştırma', icon: FileDiff },
  { id: 'masking', label: 'Veri maskeleme', icon: Mask },
  { id: 'shortcuts', label: 'Kısayollar', icon: KeyRound }
];

function createId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function download(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sqlLiteral(value: string, type: PreparedStatementSet['parameters'][number]['type']) {
  if (type === 'null') return 'NULL';
  if (type === 'number') return Number.isFinite(Number(value)) ? String(Number(value)) : '0';
  if (type === 'boolean') return /^(true|1|yes|evet)$/i.test(value) ? 'TRUE' : 'FALSE';
  return `'${value.replace(/'/g, "''")}'`;
}

function preparedSql(set: PreparedStatementSet) {
  let result = set.sql;
  for (const parameter of set.parameters) {
    const literal = sqlLiteral(parameter.value, parameter.type);
    const named = new RegExp(`:${parameter.name}\\b`, 'g');
    if (named.test(result)) result = result.replace(named, literal);
    else result = result.replace('?', literal);
  }
  return result;
}

function backupCommand(server: DatabaseServerConfig, database: string | null, options: { routines: boolean; triggers: boolean; compress: boolean; destination: string }) {
  const engine = server.databaseType || 'mysql';
  const port = server.port || databaseEngineDefinition(engine).defaultPort;
  const host = server.host || 'localhost';
  const user = server.username || 'database_user';
  const target = database || server.databaseName || 'database_name';
  if (engine === 'postgresql' || engine === 'cockroachdb') {
    return `pg_dump --host=${host} --port=${port} --username=${user} --format=custom --file=${options.destination || `${target}.dump`} ${target}`;
  }
  if (engine === 'mssql') {
    return `sqlcmd -S ${host},${port} -U ${user} -Q "BACKUP DATABASE [${target}] TO DISK=N'${options.destination || `${target}.bak`}'${options.compress ? ' WITH COMPRESSION' : ''}"`;
  }
  const switches = ['--single-transaction', '--hex-blob', options.routines ? '--routines' : '', options.triggers ? '--triggers' : ''].filter(Boolean).join(' ');
  const command = `mysqldump ${switches} -h ${host} -P ${port} -u ${user} ${target}`;
  return options.compress ? `${command} | gzip > ${options.destination || `${target}.sql.gz`}` : `${command} > ${options.destination || `${target}.sql`}`;
}

function parseIndexColumns(sql: string) {
  const found = new Set<string>();
  const patterns = [
    /\bWHERE\s+([A-Za-z0-9_`"\[\].]+)/gi,
    /\b(?:AND|OR)\s+([A-Za-z0-9_`"\[\].]+)\s*(?:=|>|<|LIKE|IN)/gi,
    /\bJOIN\s+[A-Za-z0-9_`"\[\].]+\s+(?:AS\s+\w+\s+)?ON\s+([A-Za-z0-9_`"\[\].]+)/gi,
    /\bORDER\s+BY\s+([A-Za-z0-9_`"\[\].]+)/gi,
    /\bGROUP\s+BY\s+([A-Za-z0-9_`"\[\].]+)/gi
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sql))) found.add(match[1].split('.').at(-1)?.replace(/[`"\[\]]/g, '') || match[1]);
  }
  return [...found].filter(Boolean).slice(0, 8);
}

function rowKey(row: Record<string, unknown>, primaryKeys: string[]) {
  if (primaryKeys.length) return primaryKeys.map(key => JSON.stringify(row[key])).join('|');
  return JSON.stringify(row);
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-zinc-800 bg-black/20 p-4"><div className="mb-4"><h3 className="text-xs font-semibold text-zinc-100">{title}</h3>{description && <p className="mt-1 text-[10px] leading-5 text-zinc-600">{description}</p>}</div>{children}</section>;
}

export function DatabaseSafetyCenterModal({ open, onClose, initialTab = 'history', servers, activeServerId, accountId, databases, selectedDatabase, selectedTable, initialSql = '' }: DatabaseSafetyCenterModalProps) {
  const workspace = useSyncExternalStore(subscribeDatabaseSafetyWorkspace, getDatabaseSafetyWorkspace, getServerDatabaseSafetyWorkspace);
  const [tab, setTab] = useState<DatabaseSafetyCenterTab>(initialTab);
  const [serverId, setServerId] = useState(activeServerId || servers[0]?.id || '');
  const [database, setDatabase] = useState(selectedDatabase || '');
  const [table, setTable] = useState(selectedTable || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const selectedServer = servers.find(item => item.id === serverId) || null;
  const selectedCatalog = selectedServer?.databases || databases;

  const serverOptions = useMemo<SearchSelectOption[]>(() => servers.map(server => ({ value: server.id, label: server.name, description: `${server.host}:${server.port || databaseEngineDefinition(server.databaseType).defaultPort}`, badge: databaseEngineLabel(server.databaseType) })), [servers]);
  const databaseOptions = useMemo<SearchSelectOption[]>(() => selectedCatalog.map(item => ({ value: item.name, label: item.name, description: `${item.tableCount} tablo • ${item.totalRows.toLocaleString('tr-TR')} satır` })), [selectedCatalog]);
  const tableOptions = useMemo<SearchSelectOption[]>(() => (selectedCatalog.find(item => item.name === database)?.tables || []).map(name => ({ value: name, label: name, description: 'Tablo' })), [selectedCatalog, database]);

  useEffect(() => { if (open) { setTab(initialTab); setServerId(activeServerId || servers[0]?.id || ''); setDatabase(selectedDatabase || ''); setTable(selectedTable || ''); setMessage(null); } }, [open, initialTab, activeServerId, selectedDatabase, selectedTable, servers]);
  useEffect(() => { if (!open) return; const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const renderHistory = () => {
    const snapshots = workspace.snapshots.filter(item => (!serverId || item.serverId === serverId) && (!database || item.database === database) && (!table || item.table === table));
    const migrations = workspace.migrations.filter(item => (!serverId || item.serverId === serverId) && (!database || item.database === database) && (!table || item.table === table));
    return <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Otomatik şema snapshot’ları" description="Her görsel ALTER öncesinde tablo yapısı, kolonlar, indeksler, foreign key’ler ve CREATE SQL yerel olarak saklanır.">
        <div className="space-y-2">{snapshots.length === 0 ? <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-[10px] text-zinc-600">Bu kapsamda henüz snapshot yok.</div> : snapshots.map(item => <article key={item.id} className="rounded-lg border border-zinc-800 bg-black/20 p-3"><div className="flex items-start gap-3"><Archive className="h-4 w-4 text-cyan-400" /><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-medium">{item.database}.{item.table}</div><div className="mt-1 text-[9px] text-zinc-600">{item.reason} • {formatDate(item.createdAt)}</div><div className="mt-2 flex gap-2 text-[9px] text-zinc-500"><span>{item.tableInfo.columns.length} kolon</span><span>{item.tableInfo.indexes.length} indeks</span><span>{item.tableInfo.foreignKeys.length} FK</span></div></div><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => download(`${item.database}_${item.table}_${item.id}.sql`, item.tableInfo.createSQL)}><Download className="h-3.5 w-3.5" /></Button></div></article>)}</div>
      </Section>
      <Section title="Migration üreticisi" description="Görsel şema değişikliklerinden UP ve snapshot tabanlı DOWN SQL dosyaları oluşturulur.">
        <div className="space-y-2">{migrations.length === 0 ? <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-[10px] text-zinc-600">Henüz migration üretilmedi.</div> : migrations.map(item => <article key={item.id} className="rounded-lg border border-zinc-800 bg-black/20 p-3"><div className="flex items-start gap-3"><FileKey2 className="h-4 w-4 text-purple-400" /><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-medium">{item.name}</div><div className="mt-1 text-[9px] text-zinc-600">{item.description} • {formatDate(item.createdAt)}</div><span className={`mt-2 inline-flex rounded px-1.5 py-0.5 text-[8px] ${item.status === 'applied' ? 'bg-emerald-500/10 text-emerald-300' : item.status === 'failed' ? 'bg-red-500/10 text-red-300' : 'bg-cyan-500/10 text-cyan-300'}`}>{item.status}</span></div><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => download(`${item.name}.sql`, `-- UP\n${item.upSql}\n\n-- DOWN\n${item.downSql}`)}><Download className="h-3.5 w-3.5" /></Button></div></article>)}</div>
      </Section>
    </div>;
  };

  const renderBackups = () => <BackupPanel servers={servers} accountId={accountId} activeServerId={serverId} defaultDatabase={database} jobs={workspace.backupJobs} onMessage={setMessage} />;
  const renderApprovals = () => <ApprovalPanel approvals={workspace.approvals} servers={servers} accountId={accountId} onMessage={setMessage} />;
  const renderPrepared = () => <PreparedPanel sets={workspace.preparedSets} servers={servers} accountId={accountId} initialServerId={serverId} initialDatabase={database} initialSql={initialSql} onMessage={setMessage} />;
  const renderIndexes = () => <IndexAdvisor server={selectedServer} accountId={accountId} database={database} initialSql={initialSql} onMessage={setMessage} />;
  const renderCompare = () => <ComparePanel servers={servers} accountId={accountId} initialServerId={serverId} initialDatabase={database} initialTable={table} onMessage={setMessage} />;
  const renderMasking = () => <MaskingPanel server={selectedServer} accountId={accountId} database={database} table={table} onMessage={setMessage} />;
  const renderShortcuts = () => <ShortcutPanel />;

  const content = tab === 'history' ? renderHistory() : tab === 'backups' ? renderBackups() : tab === 'approvals' ? renderApprovals() : tab === 'indexes' ? renderIndexes() : tab === 'prepared' ? renderPrepared() : tab === 'compare' ? renderCompare() : tab === 'masking' ? renderMasking() : renderShortcuts();

  return createPortal(<div className="fixed inset-0 z-[690] flex items-center justify-center p-4"><button className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} aria-label="Kapat"/><div className="relative z-10 flex h-[min(900px,95vh)] w-[min(1480px,98vw)] min-h-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-black/25"><div className="border-b border-zinc-800 p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-400" /><div><div className="text-xs font-semibold">Güvenlik ve operasyon</div><div className="text-[9px] text-zinc-600">Coreor Database 2.1.1</div></div></div></div><nav className="min-h-0 flex-1 overflow-y-auto p-2">{tabs.map(item => { const Icon = item.icon; return <button key={item.id} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[10px] ${tab === item.id ? 'bg-cyan-500/10 text-cyan-100' : 'text-zinc-400 hover:bg-white/[0.04]'}`} onClick={() => setTab(item.id)}><span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${tab === item.id ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-zinc-800 bg-black/20'}`}><Icon className="h-4 w-4" /></span>{item.label}</button>; })}</nav><div className="border-t border-zinc-800 p-3"><Button variant="outline" size="sm" className="w-full text-[10px]" onClick={() => download('coreor-safety-workspace.json', exportSafetyWorkspace(), 'application/json')}><Download className="mr-1.5 h-3.5 w-3.5" />Yerel geçmişi dışa aktar</Button></div></aside>
    <main className="flex min-w-0 flex-1 flex-col"><header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-2"><div className="min-w-44 flex-1"><SearchSelect value={serverId} options={serverOptions} onValueChange={value => { setServerId(value); setDatabase(''); setTable(''); }} placeholder="Sunucu seç" dropdownMinWidth={430} showDescriptionInTrigger={false}/></div><div className="min-w-44 flex-1"><SearchSelect value={database} options={databaseOptions} onValueChange={value => { setDatabase(value); setTable(''); }} placeholder="Veritabanı seç" dropdownMinWidth={400} showDescriptionInTrigger={false}/></div><div className="min-w-44 flex-1"><SearchSelect value={table} options={tableOptions} onValueChange={setTable} placeholder="Tablo seç" dropdownMinWidth={400} showDescriptionInTrigger={false}/></div><Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button></header>{message && <div className={`flex items-center gap-2 border-b px-4 py-2 text-[10px] ${message.tone === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : message.tone === 'warning' ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}>{message.tone === 'success' ? <CheckCircle2 className="h-3.5 w-3.5" /> : message.tone === 'warning' ? <Clock3 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{message.text}</div>}<ScrollArea className="min-h-0 flex-1"><div className="p-5">{content}</div></ScrollArea></main>
  </div></div>, document.body);
}

function BackupPanel({ servers, accountId, activeServerId, defaultDatabase, jobs, onMessage }: { servers: DatabaseServerConfig[]; accountId?: string | null; activeServerId: string; defaultDatabase: string; jobs: BackupJobRecord[]; onMessage: (message: { tone: 'success' | 'error' | 'warning'; text: string }) => void }) {
  const [name, setName] = useState('Günlük veritabanı yedeği');
  const [serverId, setServerId] = useState(activeServerId);
  const [database, setDatabase] = useState(defaultDatabase);
  const [destination, setDestination] = useState('backups/database.sql.gz');
  const [schedule, setSchedule] = useState<BackupJobRecord['schedule']>('daily');
  const [routines, setRoutines] = useState(true);
  const [triggers, setTriggers] = useState(true);
  const [compress, setCompress] = useState(true);
  const server = servers.find(item => item.id === serverId) || null;
  const command = server ? backupCommand(server, database || null, { routines, triggers, compress, destination }) : '';
  const save = () => {
    if (!server) return;
    saveBackupJob({ name, serverId: server.id, serverName: server.name, engine: server.databaseType || 'mysql', database: database || null, format: server.databaseType === 'mssql' ? 'bacpac' : server.databaseType === 'postgresql' || server.databaseType === 'cockroachdb' ? 'custom' : 'sql', destination, schedule, includeRoutines: routines, includeTriggers: triggers, compress, commandPreview: command });
    onMessage({ tone: 'success', text: 'Yedekleme görevi yerel çalışma alanına kaydedildi.' });
  };
  const plan = (job: BackupJobRecord) => {
    const manifest = { ...job, plannedAt: new Date().toISOString(), note: 'Komut, parola içermeden backup agent üzerinde çalıştırılmalıdır.' };
    saveBackupJob({ ...job, lastRunAt: new Date().toISOString(), lastStatus: 'planned' });
    download(`${job.name.replace(/\s+/g, '-').toLowerCase()}-manifest.json`, JSON.stringify(manifest, null, 2), 'application/json');
    onMessage({ tone: 'warning', text: 'Çalıştırma manifesti üretildi. Shell komutu güvenli backup agent üzerinde yürütülmelidir.' });
  };
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]"><Section title="Yeni yedekleme görevi" description="Coreor görev, komut planı ve zamanlamayı yönetir; parola komut satırına yazılmaz."><div className="grid gap-3 sm:grid-cols-2"><label className="text-[9px] text-zinc-500">Görev adı<Input value={name} onChange={event => setName(event.target.value)} className="mt-1 h-9" /></label><label className="text-[9px] text-zinc-500">Hedef dosya<Input value={destination} onChange={event => setDestination(event.target.value)} className="mt-1 h-9 font-mono" /></label><label className="text-[9px] text-zinc-500">Sunucu<SearchSelect value={serverId} options={servers.map(item => ({ value: item.id, label: item.name, description: `${item.host}:${item.port}`, badge: databaseEngineLabel(item.databaseType) }))} onValueChange={setServerId} className="mt-1" /></label><label className="text-[9px] text-zinc-500">Veritabanı<Input value={database} onChange={event => setDatabase(event.target.value)} className="mt-1 h-9" /></label><label className="text-[9px] text-zinc-500">Zamanlama<SearchSelect value={schedule} options={[{value:'manual',label:'Manuel'},{value:'hourly',label:'Saatlik'},{value:'daily',label:'Günlük'},{value:'weekly',label:'Haftalık'}]} onValueChange={value => setSchedule(value as BackupJobRecord['schedule'])} className="mt-1" /></label><div className="space-y-2 pt-4"><CoreorSwitch checked={routines} onCheckedChange={setRoutines} label="Rutinleri ekle" /><CoreorSwitch checked={triggers} onCheckedChange={setTriggers} label="Trigger’ları ekle" /><CoreorSwitch checked={compress} onCheckedChange={setCompress} label="Sıkıştır" /></div></div>{command && <div className="mt-4"><SqlCodeBlock code={command} /></div>}<Button className="mt-4" onClick={save} disabled={!server}><Save className="mr-1.5 h-4 w-4" />Görevi kaydet</Button></Section><Section title="Yedekleme görevleri" description="Görev manifestleri daha sonra izinli bir backup agent tarafından çalıştırılabilir."><div className="space-y-2">{jobs.length === 0 ? <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center text-[10px] text-zinc-600">Kayıtlı yedekleme görevi yok.</div> : jobs.map(job => <article key={job.id} className="rounded-xl border border-zinc-800 bg-black/20 p-3"><div className="flex items-start gap-3"><HardDriveDownload className="h-4 w-4 text-emerald-400" /><div className="min-w-0 flex-1"><div className="text-[11px] font-medium">{job.name}</div><div className="mt-1 text-[9px] text-zinc-600">{job.serverName} • {job.database || 'sunucu geneli'} • {job.schedule}</div><div className="mt-2 truncate font-mono text-[8px] text-zinc-500">{job.commandPreview}</div></div><Button variant="ghost" size="sm" className="h-7 text-[9px]" onClick={() => plan(job)}><Play className="mr-1 h-3 w-3" />Manifest</Button><Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => deleteBackupJob(job.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></article>)}</div></Section></div>;
}

function ApprovalPanel({ approvals, servers, accountId, onMessage }: { approvals: ApprovalRecord[]; servers: DatabaseServerConfig[]; accountId?: string | null; onMessage: (message: { tone: 'success' | 'error' | 'warning'; text: string }) => void }) {
  const [reviewer, setReviewer] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const execute = async (item: ApprovalRecord) => {
    const server = servers.find(entry => entry.id === item.serverId);
    if (!server || !accountId || item.status !== 'approved') return;
    setBusyId(item.id);
    try { await executeDatabaseQuery(server.id, item.sql, accountId, item.database); onMessage({ tone: 'success', text: 'Onaylanmış işlem çalıştırıldı.' }); }
    catch (error) { onMessage({ tone: 'error', text: error instanceof Error ? error.message : 'İşlem çalıştırılamadı.' }); }
    finally { setBusyId(null); }
  };
  return <Section title="İkinci kullanıcı onay kuyruğu" description="DROP, TRUNCATE ve production ALTER işlemleri talep eden kişiden farklı bir kullanıcı tarafından onaylanmalıdır."><div className="mb-4 max-w-md"><label className="text-[9px] text-zinc-500">İnceleyen kullanıcı<Input value={reviewer} onChange={event => setReviewer(event.target.value)} placeholder="reviewer@example.com" className="mt-1 h-9" /></label></div><div className="space-y-2">{approvals.length === 0 ? <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center text-[10px] text-zinc-600">Bekleyen onay yok.</div> : approvals.map(item => { const validReviewer = reviewer.trim() && reviewer.trim() !== item.requestedBy; return <article key={item.id} className="rounded-xl border border-zinc-800 bg-black/20 p-4"><div className="flex flex-wrap items-start gap-3"><ShieldCheck className="h-4 w-4 text-amber-400" /><div className="min-w-0 flex-1"><div className="text-[11px] font-medium">{item.action.toUpperCase()} • {item.serverName}</div><div className="mt-1 text-[9px] text-zinc-600">Talep eden: {item.requestedBy} • {formatDate(item.requestedAt)}</div><div className="mt-2"><SqlCodeBlock code={item.sql} /></div></div><span className={`rounded px-2 py-1 text-[8px] ${item.status === 'approved' ? 'bg-emerald-500/10 text-emerald-300' : item.status === 'rejected' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'}`}>{item.status}</span></div><div className="mt-3 flex justify-end gap-2">{item.status === 'pending' && <><Button variant="outline" size="sm" className="h-7 text-[9px]" disabled={!validReviewer} onClick={() => reviewApproval(item.id, 'rejected', reviewer.trim())}>Reddet</Button><Button size="sm" className="h-7 text-[9px]" disabled={!validReviewer} onClick={() => reviewApproval(item.id, 'approved', reviewer.trim())}><BadgeCheck className="mr-1 h-3 w-3" />Onayla</Button></>}{item.status === 'approved' && <Button size="sm" className="h-7 text-[9px]" disabled={busyId === item.id} onClick={() => void execute(item)}>{busyId === item.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}Çalıştır</Button>}</div></article>; })}</div></Section>;
}

function PreparedPanel({ sets, servers, accountId, initialServerId, initialDatabase, initialSql, onMessage }: { sets: PreparedStatementSet[]; servers: DatabaseServerConfig[]; accountId?: string | null; initialServerId: string; initialDatabase: string; initialSql: string; onMessage: (message: { tone: 'success' | 'error' | 'warning'; text: string }) => void }) {
  const [id, setId] = useState<string | undefined>();
  const [name, setName] = useState('Parametre seti');
  const [serverId, setServerId] = useState(initialServerId);
  const [database, setDatabase] = useState(initialDatabase);
  const [sql, setSql] = useState(initialSql || 'SELECT * FROM users WHERE id = :id;');
  const [parameters, setParameters] = useState<PreparedStatementSet['parameters']>([{ name: 'id', value: '1', type: 'number' }]);
  const [result, setResult] = useState<QueryExecutionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const save = () => { savePreparedSet({ id, name, serverId, database: database || null, sql, parameters }); onMessage({ tone: 'success', text: 'Prepared statement parametre seti kaydedildi.' }); };
  const run = async () => { if (!accountId || !serverId) return; setBusy(true); try { setResult(await executeDatabaseQuery(serverId, preparedSql({ id: id || '', name, serverId, database: database || null, sql, parameters, createdAt: '', updatedAt: '' }), accountId, database || null)); onMessage({ tone: 'success', text: 'Prepared statement parametrelerle çalıştırıldı.' }); } catch (error) { onMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Sorgu çalıştırılamadı.' }); } finally { setBusy(false); } };
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]"><Section title="Prepared statement laboratuvarı" description="Named `:parametre` veya sıralı `?` parametreleri güvenli SQL literal değerlerine dönüştürerek farklı setlerle deneyin."><div className="grid gap-3 sm:grid-cols-2"><Input value={name} onChange={event => setName(event.target.value)} placeholder="Set adı" /><SearchSelect value={serverId} options={servers.map(server => ({ value: server.id, label: server.name, description: `${server.host}:${server.port}` }))} onValueChange={setServerId} /></div><textarea value={sql} onChange={event => setSql(event.target.value)} className="coreor-sql-editor mt-3 min-h-36 w-full resize-y rounded-xl border border-zinc-800 bg-black/30 p-3 font-mono text-[11px] outline-none" />
  <div className="mt-3 space-y-2">{parameters.map((parameter, index) => <div key={`${parameter.name}-${index}`} className="grid grid-cols-[1fr_1fr_130px_32px] gap-2"><Input value={parameter.name} onChange={event => setParameters(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="parametre" /><Input value={parameter.value} onChange={event => setParameters(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} placeholder="değer" /><SearchSelect value={parameter.type} options={['string','number','boolean','null','date'].map(value => ({ value, label: value }))} onValueChange={value => setParameters(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, type: value as typeof parameter.type } : item))} /><Button variant="ghost" size="icon" className="h-9 w-8 text-red-400" onClick={() => setParameters(current => current.filter((_, itemIndex) => itemIndex !== index))}><X className="h-3.5 w-3.5" /></Button></div>)}</div><div className="mt-3 flex gap-2"><Button variant="outline" size="sm" onClick={() => setParameters(current => [...current, { name: `param${current.length + 1}`, value: '', type: 'string' }])}><Plus className="mr-1 h-3.5 w-3.5" />Parametre</Button><Button variant="outline" size="sm" onClick={save}><Save className="mr-1 h-3.5 w-3.5" />Kaydet</Button><Button size="sm" disabled={busy} onClick={() => void run()}>{busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}Çalıştır</Button></div>{result && <div className="mt-4 rounded-xl border border-zinc-800 p-3 text-[10px] text-zinc-400">{result.rows.length.toLocaleString('tr-TR')} sonuç • {result.affectedRows || 0} etkilenen satır</div>}</Section><Section title="Kaydedilen setler"><div className="space-y-2">{sets.map(set => <article key={set.id} className="rounded-lg border border-zinc-800 p-3"><button className="w-full text-left" onClick={() => { setId(set.id); setName(set.name); setServerId(set.serverId); setDatabase(set.database || ''); setSql(set.sql); setParameters(set.parameters); }}><div className="text-[10px] font-medium">{set.name}</div><div className="mt-1 line-clamp-2 font-mono text-[8px] text-zinc-600">{set.sql}</div></button><div className="mt-2 flex justify-end"><Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => deletePreparedSet(set.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></article>)}</div></Section></div>;
}

function IndexAdvisor({ server, accountId, database, initialSql, onMessage }: { server: DatabaseServerConfig | null; accountId?: string | null; database: string; initialSql: string; onMessage: (message: { tone: 'success' | 'error' | 'warning'; text: string }) => void }) {
  const [sql, setSql] = useState(initialSql || 'SELECT * FROM users WHERE email = ? ORDER BY created_at DESC;');
  const [plan, setPlan] = useState<QueryExecutionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const columns = parseIndexColumns(sql);
  const tableMatch = /\bFROM\s+[`"\[]?([A-Za-z0-9_$-]+)/i.exec(sql);
  const table = tableMatch?.[1] || 'table_name';
  const quote = (value: string) => quoteDatabaseIdentifier(value, server?.databaseType || 'mysql');
  const suggestion = columns.length ? `CREATE INDEX ${quote(`idx_${table}_${columns.join('_')}`)} ON ${quote(table)} (${columns.map(quote).join(', ')});` : '-- WHERE, JOIN, ORDER BY veya GROUP BY kolonları algılanamadı.';
  const analyze = async () => { if (!server || !accountId) return; setBusy(true); try { const prefix = server.databaseType === 'mssql' ? 'SET SHOWPLAN_ALL ON;\n' : 'EXPLAIN '; setPlan(await executeDatabaseQuery(server.id, `${prefix}${sql.replace(/;\s*$/, '')}`, accountId, database || null)); onMessage({ tone: 'success', text: 'Execution plan alındı ve indeks adayları oluşturuldu.' }); } catch (error) { onMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Execution plan alınamadı.' }); } finally { setBusy(false); } };
  return <div className="grid gap-4 xl:grid-cols-2"><Section title="Slow query ve EXPLAIN analizi"><textarea value={sql} onChange={event => setSql(event.target.value)} className="coreor-sql-editor min-h-44 w-full resize-y rounded-xl border border-zinc-800 bg-black/30 p-3 font-mono text-[11px] outline-none" /><Button className="mt-3" disabled={busy || !server} onClick={() => void analyze()}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}Planı analiz et</Button>{plan && <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-zinc-800 p-2 font-mono text-[9px] text-zinc-400">{JSON.stringify(plan.rows, null, 2)}</div>}</Section><Section title="İndeks önerisi" description="Öneri WHERE, JOIN, ORDER BY ve GROUP BY içinde kullanılan kolonlardan oluşturulur. Uygulamadan önce execution plan ve mevcut indekslerle karşılaştırın."><SqlCodeBlock code={suggestion} /><div className="mt-4 space-y-2">{columns.map((column, index) => <div key={column} className="flex items-center gap-2 rounded-lg border border-zinc-800 p-2 text-[10px]"><span className="flex h-5 w-5 items-center justify-center rounded bg-cyan-500/10 text-cyan-300">{index + 1}</span><Columns3 className="h-3.5 w-3.5 text-zinc-600" />{column}</div>)}</div></Section></div>;
}

function ComparePanel({ servers, accountId, initialServerId, initialDatabase, initialTable, onMessage }: { servers: DatabaseServerConfig[]; accountId?: string | null; initialServerId: string; initialDatabase: string; initialTable: string; onMessage: (message: { tone: 'success' | 'error' | 'warning'; text: string }) => void }) {
  const [leftServerId, setLeftServerId] = useState(initialServerId);
  const [rightServerId, setRightServerId] = useState(servers.find(item => item.id !== initialServerId)?.id || initialServerId);
  const [database, setDatabase] = useState(initialDatabase);
  const [table, setTable] = useState(initialTable);
  const [busy, setBusy] = useState(false);
  const [differences, setDifferences] = useState<Array<{ key: string; side: 'left' | 'right' | 'changed'; left?: Record<string, unknown>; right?: Record<string, unknown> }>>([]);
  const compare = async () => { if (!accountId || !leftServerId || !rightServerId || !database || !table) return; setBusy(true); try { const [leftInfo, rightInfo, leftData, rightData] = await Promise.all([fetchTableInfo(leftServerId, database, table, accountId), fetchTableInfo(rightServerId, database, table, accountId), fetchTableData(leftServerId, database, table, accountId, { pageSize: 500 }), fetchTableData(rightServerId, database, table, accountId, { pageSize: 500 })]); const primary = leftInfo.indexes.filter(item => item.Key_name === 'PRIMARY').sort((a,b) => Number(a.Seq_in_index)-Number(b.Seq_in_index)).map(item => item.Column_name); const leftMap = new Map(leftData.data.map(row => [rowKey(row, primary), row])); const rightMap = new Map(rightData.data.map(row => [rowKey(row, primary), row])); const keys = new Set([...leftMap.keys(), ...rightMap.keys()]); const next = [...keys].flatMap(key => { const left = leftMap.get(key); const right = rightMap.get(key); if (!left) return [{ key, side: 'right' as const, right }]; if (!right) return [{ key, side: 'left' as const, left }]; return JSON.stringify(left) === JSON.stringify(right) ? [] : [{ key, side: 'changed' as const, left, right }]; }); setDifferences(next); onMessage({ tone: 'success', text: `${next.length} farklı kayıt bulundu. Karşılaştırma ilk 500 satırla sınırlandı.` }); void rightInfo; } catch (error) { onMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Karşılaştırma yapılamadı.' }); } finally { setBusy(false); } };
  const options = servers.map(server => ({ value: server.id, label: server.name, description: `${server.host}:${server.port}`, badge: databaseEngineLabel(server.databaseType) }));
  return <Section title="İki sunucu arasında veri karşılaştırma" description="Aynı tablo ilk 500 satır üzerinden primary key ile eşleştirilir. Production tablolarında önce filtreli veya yedek kopya üzerinde kullanın."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><SearchSelect value={leftServerId} options={options} onValueChange={setLeftServerId} placeholder="Kaynak sunucu" /><SearchSelect value={rightServerId} options={options} onValueChange={setRightServerId} placeholder="Hedef sunucu" /><Input value={database} onChange={event => setDatabase(event.target.value)} placeholder="Veritabanı" /><Input value={table} onChange={event => setTable(event.target.value)} placeholder="Tablo" /></div><Button className="mt-3" disabled={busy} onClick={() => void compare()}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDiff className="mr-1.5 h-4 w-4" />}Karşılaştır</Button><div className="mt-4 space-y-2">{differences.slice(0, 100).map(item => <article key={item.key} className="rounded-lg border border-zinc-800 p-3"><div className="flex items-center gap-2 text-[9px]"><span className={`rounded px-1.5 py-0.5 ${item.side === 'changed' ? 'bg-amber-500/10 text-amber-300' : item.side === 'left' ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{item.side}</span><code className="truncate text-zinc-500">{item.key}</code></div><pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[8px] text-zinc-600">{JSON.stringify({ left: item.left, right: item.right }, null, 2)}</pre></article>)}</div></Section>;
}

function MaskingPanel({ server, accountId, database, table, onMessage }: { server: DatabaseServerConfig | null; accountId?: string | null; database: string; table: string; onMessage: (message: { tone: 'success' | 'error' | 'warning'; text: string }) => void }) {
  const [columns, setColumns] = useState<TableColumnInfo[]>([]);
  const [selected, setSelected] = useState<Record<string, 'email' | 'phone' | 'tc' | 'address' | 'text'>>({});
  const [where, setWhere] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setColumns([]); setSelected({}); if (!server || !accountId || !database || !table) return; void fetchTableInfo(server.id, database, table, accountId).then(info => setColumns(info.columns)).catch(() => undefined); }, [server, accountId, database, table]);
  const quote = (value: string) => quoteDatabaseIdentifier(value, server?.databaseType || 'mysql');
  const values: Record<string, string> = { email: "'masked@example.invalid'", phone: "'0000000000'", tc: "'00000000000'", address: "'MASKED ADDRESS'", text: "'MASKED'" };
  const assignments = Object.entries(selected).map(([column, kind]) => `${quote(column)} = ${values[kind]}`);
  const target = server && database && table ? `${quote(database)}.${quote(table)}` : 'database.table';
  const sql = assignments.length ? `UPDATE ${target}\nSET ${assignments.join(',\n    ')}${where.trim() ? `\nWHERE ${where.trim()}` : ''};` : '-- Maskelenecek kolon seçin.';
  const run = async () => { if (!server || !accountId || !assignments.length) return; if (!window.confirm('Maskeleme geri alınamaz. İşlemi çalıştırmak istediğinize emin misiniz?')) return; setBusy(true); try { const result = await executeDatabaseQuery(server.id, sql, accountId, database); onMessage({ tone: 'success', text: `${result.affectedRows || 0} satır maskelendi.` }); } catch (error) { onMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Maskeleme başarısız oldu.' }); } finally { setBusy(false); } };
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]"><Section title="Maskeleme profili" description="E-posta, telefon, TC ve adres alanlarını sabit anonim değerlerle değiştirir. Üretim verisinde önce yedek alın."><div className="space-y-2">{columns.map(column => <div key={column.Field} className="grid grid-cols-[1fr_180px] items-center gap-2 rounded-lg border border-zinc-800 p-2"><div><div className="text-[10px] font-medium">{column.Field}</div><div className="text-[8px] text-zinc-600">{column.Type}</div></div><SearchSelect value={selected[column.Field] || ''} options={[{value:'',label:'Maskeleme yok'},{value:'email',label:'E-posta'},{value:'phone',label:'Telefon'},{value:'tc',label:'TC kimlik'},{value:'address',label:'Adres'},{value:'text',label:'Genel metin'}]} onValueChange={value => setSelected(current => { const next = { ...current }; if (!value) delete next[column.Field]; else next[column.Field] = value as typeof selected[string]; return next; })} /></div>)}</div><Input value={where} onChange={event => setWhere(event.target.value)} className="mt-3 font-mono" placeholder="Opsiyonel WHERE koşulu: id > 100" /></Section><Section title="Üretilecek maskeleme SQL’i"><SqlCodeBlock code={sql} /><Button className="mt-4" variant="destructive" disabled={busy || !assignments.length} onClick={() => void run()}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mask className="mr-1.5 h-4 w-4" />}Maskelemeyi çalıştır</Button></Section></div>;
}

function ShortcutPanel() {
  const workspace = useSyncExternalStore(subscribeDatabaseSafetyWorkspace, getDatabaseSafetyWorkspace, getServerDatabaseSafetyWorkspace);
  return <Section title="Global klavye kısayolları" description="`Mod`, Windows/Linux’ta Ctrl; macOS’ta Command anlamına gelir. Aynı kombinasyonu iki komuta vermemeye dikkat edin."><div className="space-y-2">{workspace.shortcuts.map(binding => <div key={binding.id} className="grid items-center gap-3 rounded-xl border border-zinc-800 bg-black/20 p-3 md:grid-cols-[1fr_220px]"><div><div className="text-[10px] font-medium">{binding.label}</div><div className="mt-1 text-[9px] text-zinc-600">{binding.description} • Varsayılan: {binding.defaultKeys}</div></div><Input value={binding.keys} onChange={event => saveShortcut(binding.id, event.target.value)} className="h-9 font-mono text-[10px]" /></div>)}</div><Button variant="outline" size="sm" className="mt-4" onClick={resetShortcuts}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Varsayılanlara dön</Button></Section>;
}
