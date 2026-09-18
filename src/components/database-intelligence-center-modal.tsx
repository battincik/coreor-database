'use client';

import { useModalEscape } from '@/lib/useModalEscape';
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Database,
  Download,
  Gauge,
  HeartPulse,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  TestTube2,
  Wand2,
  X
} from 'lucide-react';
import type { DatabaseEngine, DatabaseServerConfig, QueryExecutionResult, TableInfo } from 'types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CoreorSwitch } from '@/components/ui/coreor-switch';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { SqlCodeBlock } from '@/components/ui/sql-syntax';
import { executeDatabaseQuery, fetchTableInfo } from '@/lib/databaseApi';
import { fetchDatabasePerformanceSnapshot } from '@/lib/databaseWorkbenchApi';
import type { DatabasePerformanceSnapshot } from '@/lib/databaseWorkbenchTypes';
import { getActivitiesServerSnapshot, getActivitiesSnapshot, subscribeActivities } from '@/lib/activityConsole';
import { backupTasks } from '@/lib/databaseAutomation';
import { databaseEngineDefinition, databaseEngineFamily } from '@/lib/databaseEngines';
import { openQueryTab } from '@/lib/queryWorkspaceEvents';
import {
  MASK_TYPES,
  MOCK_DATA_TYPES,
  QUERY_SNIPPETS,
  analyzeDataQuality,
  calculateHealthScore,
  generateMockRows,
  inferMockKind,
  maskValueAdvanced,
  notificationRuleStore,
  profileActivities,
  type DataQualityReport,
  type MaskKind,
  type MockColumnRule,
  type NotificationRule,
  type QueryProfile
} from '@/lib/decentralizedIntelligence';
import { useCoreorToast } from '@/components/ui/coreor-toast';

export type IntelligenceCenterTab = 'profiler' | 'slow' | 'health' | 'masking' | 'generator' | 'quality' | 'snippets' | 'alerts';

interface DatabaseIntelligenceCenterModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: IntelligenceCenterTab;
  servers: DatabaseServerConfig[];
  activeServerId: string | null;
  accountId?: string | null;
  selectedDatabase?: string | null;
  selectedTable?: string | null;
}

interface MaskRule { column: string; kind: MaskKind; }

const TABS: Array<{ id: IntelligenceCenterTab; label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'profiler', label: 'Canlı profiler', description: 'Yerel sorgu süreleri ve dağılımları', icon: Activity },
  { id: 'slow', label: 'Slow query', description: 'Yavaş sorgu parmak izleri', icon: Gauge },
  { id: 'health', label: 'Sağlık skoru', description: 'Sunucu ve operasyon puanı', icon: HeartPulse },
  { id: 'masking', label: 'Veri maskeleme', description: '40+ maskeleme tipi ve ön izleme', icon: ShieldCheck },
  { id: 'generator', label: 'Test verisi', description: 'Snowflake dahil ayrıntılı üretici', icon: TestTube2 },
  { id: 'quality', label: 'Data quality', description: 'NULL, duplicate, format ve outlier', icon: BarChart3 },
  { id: 'snippets', label: 'Snippet kütüphanesi', description: 'Yerel hazır sorgu paketleri', icon: Clipboard },
  { id: 'alerts', label: 'Alarm kuralları', description: 'Anlık yerel bildirim eşikleri', icon: BellRing }
];

function download(filename: string, content: string, type = 'application/json;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csv(rows: Record<string, unknown>[]) {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [columns.map(escape).join(','), ...rows.map(row => columns.map(column => escape(typeof row[column] === 'object' ? JSON.stringify(row[column]) : row[column])).join(','))].join('\n');
}

function sqlLiteral(value: unknown) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${(typeof value === 'object' ? JSON.stringify(value) : String(value)).replace(/'/g, "''")}'`;
}

function insertSql(tableName: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return '-- Veri üretilmedi.';
  const columns = Object.keys(rows[0]);
  return rows.map(row => `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${columns.map(column => sqlLiteral(row[column])).join(', ')});`).join('\n');
}

function duration(value: number) {
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10000 ? 2 : 1)} sn`;
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const angle = Math.max(0, Math.min(100, score)) * 3.6;
  return (
    <div className="relative flex h-36 w-36 items-center justify-center rounded-full" style={{ background: `conic-gradient(var(--primary) ${angle}deg, rgba(63,63,70,.6) ${angle}deg)` }}>
      <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-zinc-950">
        <div className="text-4xl font-semibold">{score}</div>
        <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-600">Not {grade}</div>
      </div>
    </div>
  );
}

function Panel({ title, description, children, className = '' }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-zinc-800 bg-black/20 p-4 ${className}`}><div className="mb-4"><h3 className="text-xs font-semibold">{title}</h3>{description && <p className="mt-1 text-[9px] leading-4 text-zinc-600">{description}</p>}</div>{children}</section>;
}

function QueryProfileList({ profiles, onOpen }: { profiles: QueryProfile[]; onOpen: (profile: QueryProfile) => void }) {
  return <div className="space-y-2">{profiles.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-xs text-zinc-600">Henüz profillenecek SQL kaydı yok.</div> : profiles.map(profile => <button key={profile.fingerprint} type="button" onClick={() => onOpen(profile)} className="grid w-full gap-3 rounded-xl border border-zinc-800 bg-black/20 p-3 text-left transition hover:border-cyan-500/25 hover:bg-cyan-500/[0.03] lg:grid-cols-[minmax(0,1fr)_80px_80px_80px_80px]"><div className="min-w-0"><div className="truncate font-mono text-[10px] text-cyan-200">{profile.sampleSql.replace(/\s+/g, ' ')}</div><div className="mt-1 text-[8px] text-zinc-600">Son çalışma {new Date(profile.lastAt).toLocaleString('tr-TR')} • {profile.databaseName || 'sunucu geneli'}</div></div><div><div className="text-[8px] text-zinc-600">Çalışma</div><div className="mt-1 text-xs font-semibold">{profile.count}</div></div><div><div className="text-[8px] text-zinc-600">Ortalama</div><div className="mt-1 text-xs font-semibold">{duration(profile.averageMs)}</div></div><div><div className="text-[8px] text-zinc-600">P95</div><div className="mt-1 text-xs font-semibold text-amber-300">{duration(profile.p95Ms)}</div></div><div><div className="text-[8px] text-zinc-600">Hata</div><div className={`mt-1 text-xs font-semibold ${profile.errors ? 'text-red-300' : 'text-emerald-300'}`}>{profile.errors}</div></div></button>)}</div>;
}

export function DatabaseIntelligenceCenterModal({ open, onClose, initialTab = 'profiler', servers, activeServerId, accountId, selectedDatabase, selectedTable }: DatabaseIntelligenceCenterModalProps) {
  const toast = useCoreorToast();
  const activities = useSyncExternalStore(subscribeActivities, getActivitiesSnapshot, getActivitiesServerSnapshot);
  const [tab, setTab] = useState<IntelligenceCenterTab>(initialTab);
  const [serverId, setServerId] = useState(activeServerId || '');
  const [databaseName, setDatabaseName] = useState(selectedDatabase || '');
  const [tableName, setTableName] = useState(selectedTable || '');
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [snapshot, setSnapshot] = useState<DatabasePerformanceSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  useModalEscape(open, onClose, busy);
  const [error, setError] = useState<string | null>(null);
  const [slowThreshold, setSlowThreshold] = useState(1000);
  const [maskRules, setMaskRules] = useState<MaskRule[]>([]);
  const [maskPreview, setMaskPreview] = useState<Record<string, unknown>[]>([]);
  const [generatorRules, setGeneratorRules] = useState<MockColumnRule[]>([]);
  const [generatorRows, setGeneratorRows] = useState<Record<string, unknown>[]>([]);
  const [generatorCount, setGeneratorCount] = useState(100);
  const [generatorSeed, setGeneratorSeed] = useState('coreor-3.0');
  const [quality, setQuality] = useState<DataQualityReport | null>(null);
  const [snippetSearch, setSnippetSearch] = useState('');
  const [snippetCategory, setSnippetCategory] = useState('all');
  const [alertRules, setAlertRules] = useState<NotificationRule[]>([]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setServerId(activeServerId || '');
    setDatabaseName(selectedDatabase || '');
    setTableName(selectedTable || '');
    setAlertRules(notificationRuleStore.list());
  }, [open, initialTab, activeServerId, selectedDatabase, selectedTable]);

  const server = servers.find(item => item.id === serverId) || null;
  const engine = server?.databaseType || 'mysql';
  const serverOptions = useMemo<SearchSelectOption[]>(() => servers.map(item => ({ value: item.id, label: item.name, description: `${item.host}:${item.port}`, badge: databaseEngineDefinition(item.databaseType).label })), [servers]);
  const databaseOptions = useMemo<SearchSelectOption[]>(() => (server?.databases || []).map(item => ({ value: item.name, label: item.name, description: `${item.tableCount} tablo` })), [server]);
  const tableOptions = useMemo<SearchSelectOption[]>(() => (server?.databases?.find(item => item.name === databaseName)?.tables || []).map(value => ({ value, label: value })), [server, databaseName]);
  const profiles = useMemo(() => profileActivities(activities, serverId), [activities, serverId]);
  const slowProfiles = useMemo(() => profiles.filter(profile => profile.p95Ms >= slowThreshold || profile.maxMs >= slowThreshold).sort((a,b)=>b.p95Ms-a.p95Ms), [profiles, slowThreshold]);
  const lastBackup = useMemo(() => backupTasks.list().filter(item => item.serverId === serverId && item.status === 'completed' && item.lastRunAt).sort((a,b)=>(b.lastRunAt || '').localeCompare(a.lastRunAt || ''))[0], [serverId, open]);
  const backupAge = lastBackup?.lastRunAt ? (Date.now() - new Date(lastBackup.lastRunAt).getTime()) / 3600000 : null;
  const health = useMemo(() => calculateHealthScore(snapshot, activities.filter(item => item.serverId === serverId), backupAge), [snapshot, activities, serverId, backupAge]);

  const commonTarget = <div className="grid gap-2 md:grid-cols-3"><SearchSelect value={serverId} options={serverOptions} onValueChange={value => { setServerId(value); setDatabaseName(''); setTableName(''); setSnapshot(null); }} placeholder="Sunucu seç" dropdownMinWidth={430}/><SearchSelect value={databaseName} options={databaseOptions} onValueChange={value => { setDatabaseName(value); setTableName(''); }} placeholder="Veritabanı seç" dropdownMinWidth={400}/><SearchSelect value={tableName} options={tableOptions} onValueChange={setTableName} placeholder="Tablo seç" dropdownMinWidth={400}/></div>;

  const loadTableInfo = async () => {
    if (!serverId || !databaseName || !tableName || !accountId) throw new Error('Sunucu, veritabanı ve tablo seçin.');
    const info = await fetchTableInfo(serverId, databaseName, tableName, accountId);
    setTableInfo(info);
    return info;
  };

  const loadSnapshot = async () => {
    if (!serverId || !accountId) return;
    if (databaseEngineFamily(engine) !== 'mysql') { setSnapshot(null); return; }
    setBusy(true); setError(null);
    try { setSnapshot(await fetchDatabasePerformanceSnapshot(serverId, accountId, databaseName || null)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Performans snapshot alınamadı.'); }
    finally { setBusy(false); }
  };

  const loadMasking = async () => {
    if (!accountId || !serverId || !databaseName || !tableName) return;
    setBusy(true); setError(null);
    try {
      const info = tableInfo || await loadTableInfo();
      const result = await executeDatabaseQuery(serverId, `SELECT * FROM ${tableName} LIMIT 25`, accountId, databaseName);
      if (!maskRules.length) setMaskRules(info.columns.slice(0, 6).map(column => ({ column: column.Field, kind: /email/i.test(column.Field) ? 'email' : /phone|telefon/i.test(column.Field) ? 'phone' : /address|adres/i.test(column.Field) ? 'address' : /iban/i.test(column.Field) ? 'iban' : /tc|identity/i.test(column.Field) ? 'tc' : 'redact' })));
      const rules = maskRules.length ? maskRules : info.columns.slice(0, 6).map(column => ({ column: column.Field, kind: 'redact' as MaskKind }));
      setMaskPreview(result.rows.map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => { const rule = rules.find(item => item.column === key); return [key, rule ? maskValueAdvanced(value, rule.kind) : value]; }))));
      toast.show({ variant:'success', title:'Maskeleme ön izlemesi hazır', description:'Kaynak veritabanındaki hiçbir değer değiştirilmedi.' });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Maskeleme ön izlemesi oluşturulamadı.'); }
    finally { setBusy(false); }
  };

  const prepareGenerator = async () => {
    setBusy(true); setError(null);
    try {
      const info = tableInfo || await loadTableInfo();
      setGeneratorRules(info.columns.map(column => ({ column:column.Field, kind:inferMockKind(column), nullablePercent:column.Null==='YES'?5:0, min:1, max:100000, decimals:2 })));
      toast.show({ variant:'primary', title:'Kolonlar analiz edildi', description:`${info.columns.length} kolon için başlangıç veri tipleri tahmin edildi.` });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Tablo yapısı okunamadı.'); }
    finally { setBusy(false); }
  };

  const runGenerator = () => {
    const rows = generateMockRows(generatorRules, generatorCount, generatorSeed);
    setGeneratorRows(rows);
    toast.show({ variant:'success', title:'Test verisi üretildi', description:`${rows.length.toLocaleString('tr-TR')} satır yalnızca uygulama belleğinde oluşturuldu.` });
  };

  const runQuality = async () => {
    if (!accountId || !serverId || !databaseName || !tableName) return;
    setBusy(true); setError(null);
    try {
      const result = await executeDatabaseQuery(serverId, `SELECT * FROM ${tableName} LIMIT 5000`, accountId, databaseName);
      const report = analyzeDataQuality(result.rows);
      setQuality(report);
      toast.show({ variant:report.score >= 80 ? 'success' : report.score >= 60 ? 'warning' : 'danger', title:`Veri kalitesi ${report.score}/100`, description:`${report.rows} satır ve ${report.columns} kolon yerel olarak analiz edildi.` });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Veri kalitesi analizi çalıştırılamadı.'); }
    finally { setBusy(false); }
  };

  const maskColumnOptions = (info: TableInfo | null): SearchSelectOption[] => (info?.columns || []).map(column => ({ value:column.Field, label:column.Field, description:column.Type }));
  const maskTypeOptions: SearchSelectOption[] = MASK_TYPES.map(item => ({ value:item.id, label:item.label, description:item.description, badge:item.category, keywords:[item.category] }));
  const mockTypeOptions: SearchSelectOption[] = MOCK_DATA_TYPES.map(item => ({ value:item.id, label:item.label, description:item.description, badge:item.category, keywords:[item.category] }));
  const categories = useMemo(() => ['all', ...new Set(QUERY_SNIPPETS.map(item => item.category))], []);
  const visibleSnippets = useMemo(() => QUERY_SNIPPETS.filter(item => {
    const engineMatch = item.engines.includes('all') || item.engines.includes(engine as DatabaseEngine);
    const categoryMatch = snippetCategory === 'all' || item.category === snippetCategory;
    const query = snippetSearch.toLocaleLowerCase('tr-TR');
    return engineMatch && categoryMatch && (!query || `${item.title} ${item.description} ${item.tags.join(' ')}`.toLocaleLowerCase('tr-TR').includes(query));
  }), [engine, snippetCategory, snippetSearch]);

  const renderTab = () => {
    if (tab === 'profiler') return <div className="space-y-4">{commonTarget}<div className="grid gap-3 sm:grid-cols-4">{[
      ['Toplam çalışma', profiles.reduce((sum,item)=>sum+item.count,0).toLocaleString('tr-TR')],
      ['Parmak izi', profiles.length.toLocaleString('tr-TR')],
      ['Toplam süre', duration(profiles.reduce((sum,item)=>sum+item.totalMs,0))],
      ['Hata', profiles.reduce((sum,item)=>sum+item.errors,0).toLocaleString('tr-TR')]
    ].map(([label,value])=><div key={label} className="rounded-2xl border border-zinc-800 bg-black/20 p-4"><div className="text-[8px] uppercase tracking-[.12em] text-zinc-600">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>)}</div><Panel title="Canlı yerel sorgu profili" description="SQL metni normalize edilerek literal değerlerden bağımsız parmak izi oluşturulur. Veriler yalnızca bu uygulama oturumundaki SQL günlüğünden gelir."><QueryProfileList profiles={profiles.slice(0,100)} onOpen={profile=>openQueryTab({serverId:profile.serverId||serverId,databaseName:profile.databaseName||databaseName||null,title:'Profiler sorgusu',sql:profile.sampleSql})}/></Panel></div>;

    if (tab === 'slow') return <div className="space-y-4">{commonTarget}<Panel title="Slow query eşiği" description="P95 veya maksimum süresi eşiği geçen yerel sorgu grupları gösterilir."><div className="max-w-sm"><SearchSelect value={String(slowThreshold)} options={[100,250,500,1000,2000,5000,10000,30000].map(value=>({value:String(value),label:duration(value),description:`${value} ms ve üzeri`}))} onValueChange={value=>setSlowThreshold(Number(value))}/></div></Panel><Panel title={`${slowProfiles.length} yavaş sorgu parmak izi`}><QueryProfileList profiles={slowProfiles} onOpen={profile=>openQueryTab({serverId:profile.serverId||serverId,databaseName:profile.databaseName||databaseName||null,title:'Slow query',sql:profile.sampleSql})}/></Panel></div>;

    if (tab === 'health') return <div className="space-y-4">{commonTarget}<div className="flex justify-end"><Button variant="outline" disabled={busy||!serverId} onClick={()=>void loadSnapshot()}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<RefreshCw className="mr-2 h-4 w-4"/>}Canlı ölçümü yenile</Button></div><div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]"><Panel title="Genel sağlık" className="flex flex-col items-center justify-center"><ScoreRing score={health.score} grade={health.grade}/><p className="mt-4 text-center text-[9px] leading-5 text-zinc-500">Canlı MySQL metrikleri, yerel sorgu geçmişi ve yedek güncelliği birlikte puanlanır.</p></Panel><Panel title="Sağlık faktörleri"><div className="grid gap-2 md:grid-cols-2">{health.factors.map(factor=><div key={factor.id} className="rounded-xl border border-zinc-800 p-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${factor.status==='healthy'?'bg-emerald-400':factor.status==='warning'?'bg-amber-400':factor.status==='critical'?'bg-red-400':'bg-zinc-500'}`}/><span className="text-[10px] font-medium">{factor.label}</span><span className="ml-auto font-mono text-[9px] text-zinc-500">{factor.score}/{factor.maximum}</span></div><p className="mt-2 text-[9px] leading-4 text-zinc-600">{factor.message}</p></div>)}</div></Panel></div></div>;

    if (tab === 'masking') return <div className="space-y-4">{commonTarget}<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy||!tableName} onClick={()=>void loadTableInfo()}><Database className="mr-2 h-4 w-4"/>Kolonları oku</Button><Button disabled={busy||!tableName} onClick={()=>void loadMasking()}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Wand2 className="mr-2 h-4 w-4"/>}Maskeli ön izleme</Button></div><Panel title="Maskeleme kuralları" description="Rol bazlı görünüm uygulanmaz. Kurallar yalnızca yerel ön izleme ve dışa aktarma için kullanılır."><div className="space-y-2">{maskRules.map((rule,index)=><div key={`${rule.column}:${index}`} className="grid gap-2 rounded-xl border border-zinc-800 p-3 md:grid-cols-[1fr_1.4fr_auto]"><SearchSelect value={rule.column} options={maskColumnOptions(tableInfo)} onValueChange={column=>setMaskRules(previous=>previous.map((item,itemIndex)=>itemIndex===index?{...item,column}:item))} placeholder="Kolon"/><SearchSelect value={rule.kind} options={maskTypeOptions} onValueChange={kind=>setMaskRules(previous=>previous.map((item,itemIndex)=>itemIndex===index?{...item,kind:kind as MaskKind}:item))} placeholder="Maske tipi" dropdownMinWidth={520}/><Button variant="ghost" size="icon" onClick={()=>setMaskRules(previous=>previous.filter((_,itemIndex)=>itemIndex!==index))}><X className="h-4 w-4"/></Button></div>)}<Button variant="outline" size="sm" onClick={()=>setMaskRules(previous=>[...previous,{column:tableInfo?.columns[0]?.Field||'',kind:'redact'}])}>Kural ekle</Button></div></Panel>{maskPreview.length>0&&<Panel title="Maskeli veri ön izlemesi"><pre className="coreor-table-scroll max-h-96 overflow-auto rounded-xl bg-black/30 p-4 font-mono text-[9px] leading-5">{JSON.stringify(maskPreview,null,2)}</pre></Panel>}</div>;

    if (tab === 'generator') return <div className="space-y-4">{commonTarget}<div className="flex flex-wrap items-center gap-2"><Button variant="outline" disabled={busy||!tableName} onClick={()=>void prepareGenerator()}><Sparkles className="mr-2 h-4 w-4"/>Tablodan kural üret</Button><Input value={String(generatorCount)} onChange={event=>setGeneratorCount(Math.max(1,Math.min(10000,Number(event.target.value)||1)))} className="h-9 w-28" type="number" min="1" max="10000"/><Input value={generatorSeed} onChange={event=>setGeneratorSeed(event.target.value)} className="h-9 w-48" placeholder="Seed"/><Button disabled={!generatorRules.length} onClick={runGenerator}><TestTube2 className="mr-2 h-4 w-4"/>Veri üret</Button></div><Panel title="Kolon üretim kuralları" description="Snowflake ID, geçerli T.C. kimlik, IBAN, Luhn test kartı, coğrafi veri ve 40+ veri tipi desteklenir."><div className="space-y-2">{generatorRules.map((rule,index)=><div key={`${rule.column}:${index}`} className="grid gap-2 rounded-xl border border-zinc-800 p-3 lg:grid-cols-[1fr_1.5fr_100px_100px_100px]"><div className="flex items-center font-mono text-[10px] text-cyan-200">{rule.column}</div><SearchSelect value={rule.kind} options={mockTypeOptions} onValueChange={kind=>setGeneratorRules(previous=>previous.map((item,itemIndex)=>itemIndex===index?{...item,kind:kind as MockColumnRule['kind']}:item))} dropdownMinWidth={540}/><Input value={String(rule.nullablePercent||0)} onChange={event=>setGeneratorRules(previous=>previous.map((item,itemIndex)=>itemIndex===index?{...item,nullablePercent:Number(event.target.value)}:item))} type="number" title="NULL %"/><Input value={String(rule.min??1)} onChange={event=>setGeneratorRules(previous=>previous.map((item,itemIndex)=>itemIndex===index?{...item,min:Number(event.target.value)}:item))} type="number" title="Min"/><Input value={String(rule.max??100000)} onChange={event=>setGeneratorRules(previous=>previous.map((item,itemIndex)=>itemIndex===index?{...item,max:Number(event.target.value)}:item))} type="number" title="Max"/></div>)}</div></Panel>{generatorRows.length>0&&<Panel title={`${generatorRows.length.toLocaleString('tr-TR')} üretilen satır`}><div className="mb-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={()=>download(`${tableName||'mock'}.json`,JSON.stringify(generatorRows,null,2))}><Download className="mr-1 h-3.5 w-3.5"/>JSON</Button><Button variant="outline" size="sm" onClick={()=>download(`${tableName||'mock'}.csv`,csv(generatorRows),'text/csv;charset=utf-8')}><Download className="mr-1 h-3.5 w-3.5"/>CSV</Button><Button variant="outline" size="sm" onClick={()=>download(`${tableName||'mock'}.sql`,insertSql(tableName||'table_name',generatorRows),'text/sql;charset=utf-8')}><Download className="mr-1 h-3.5 w-3.5"/>INSERT SQL</Button></div><pre className="coreor-table-scroll max-h-80 overflow-auto rounded-xl bg-black/30 p-4 font-mono text-[9px]">{JSON.stringify(generatorRows.slice(0,20),null,2)}</pre></Panel>}</div>;

    if (tab === 'quality') return <div className="space-y-4">{commonTarget}<Button disabled={busy||!tableName} onClick={()=>void runQuality()}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<BarChart3 className="mr-2 h-4 w-4"/>}İlk 5.000 satırı analiz et</Button>{quality&&<><div className="grid gap-3 sm:grid-cols-4">{[['Kalite puanı',`${quality.score}/100`],['Satır',quality.rows.toLocaleString('tr-TR')],['Kolon',quality.columns.toLocaleString('tr-TR')],['Sorun',quality.issues.length.toLocaleString('tr-TR')]].map(([label,value])=><div key={label} className="rounded-2xl border border-zinc-800 p-4"><div className="text-[8px] text-zinc-600">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>)}</div><Panel title="Kalite sorunları"><div className="space-y-2">{quality.issues.length===0?<div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-xs text-emerald-300">Belirgin kalite sorunu bulunmadı.</div>:quality.issues.map(issue=><div key={issue.id} className="flex gap-3 rounded-xl border border-zinc-800 p-3"><AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${issue.severity==='error'?'text-red-400':issue.severity==='warning'?'text-amber-400':'text-cyan-400'}`}/><div className="min-w-0 flex-1"><div className="text-[10px] font-medium">{issue.column} • {issue.message}</div><div className="mt-1 text-[8px] text-zinc-600">{issue.affected.toLocaleString('tr-TR')} kayıt • {issue.type}</div></div></div>)}</div></Panel></>}</div>;

    if (tab === 'snippets') return <div className="space-y-4"><div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_260px]"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-600"/><Input value={snippetSearch} onChange={event=>setSnippetSearch(event.target.value)} placeholder="Snippet, etiket veya açıklama ara…" className="pl-9"/></div><SearchSelect value={snippetCategory} options={categories.map(category=>({value:category,label:category==='all'?'Bütün kategoriler':category}))} onValueChange={setSnippetCategory}/></div><div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4 text-[10px] leading-5 text-cyan-100">Bu sürümde snippet marketplace merkezi bir mağaza değildir. Ön tanımlı paketler uygulamayla gelir; gelecekte imzalı, indirilebilir ve yerel kasada saklanan paket formatına geçecektir.</div><div className="grid gap-3 lg:grid-cols-2">{visibleSnippets.map(snippet=><article key={snippet.id} className="flex flex-col rounded-2xl border border-zinc-800 bg-black/20 p-4"><div className="flex items-start gap-3"><span className={`rounded-lg px-2 py-1 text-[8px] ${snippet.risk==='read'?'bg-emerald-500/10 text-emerald-300':snippet.risk==='write'?'bg-amber-500/10 text-amber-300':'bg-red-500/10 text-red-300'}`}>{snippet.risk}</span><div className="min-w-0 flex-1"><h3 className="text-xs font-semibold">{snippet.title}</h3><p className="mt-1 text-[9px] leading-4 text-zinc-600">{snippet.description}</p></div></div><SqlCodeBlock sql={snippet.sql} className="mt-3 max-h-40"/><div className="mt-3 flex items-center gap-2"><span className="text-[8px] text-zinc-600">{snippet.category} • {snippet.tags.join(', ')}</span><Button size="sm" className="ml-auto h-7 text-[9px]" onClick={()=>openQueryTab({serverId:serverId||activeServerId,databaseName:databaseName||selectedDatabase||null,title:snippet.title,sql:snippet.sql})}>Editörde aç<ChevronRight className="ml-1 h-3 w-3"/></Button></div></article>)}</div></div>;

    return <div className="space-y-4"><div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4 text-[10px] leading-5 text-cyan-100">Kurallar bu cihazın localStorage alanında tutulur. Alarm oluştuğunda sağ üst Coreor toast sistemi anlık bildirim gösterir; veriler merkezi bir sunucuya gönderilmez.</div><div className="space-y-2">{alertRules.map((rule,index)=><div key={rule.id} className="grid gap-3 rounded-2xl border border-zinc-800 p-4 lg:grid-cols-[minmax(0,1fr)_180px_130px_150px]"><CoreorSwitch checked={rule.enabled} onCheckedChange={enabled=>setAlertRules(previous=>previous.map((item,itemIndex)=>itemIndex===index?{...item,enabled}:item))} label={rule.name} description={`${rule.metric} • ${rule.operator}`}/><Input value={String(rule.threshold)} onChange={event=>setAlertRules(previous=>previous.map((item,itemIndex)=>itemIndex===index?{...item,threshold:Number(event.target.value)}:item))} type="number"/><SearchSelect value={rule.severity} options={['neutral','warning','error','danger','primary'].map(value=>({value,label:value}))} onValueChange={severity=>setAlertRules(previous=>previous.map((item,itemIndex)=>itemIndex===index?{...item,severity:severity as NotificationRule['severity']}:item))}/><Input value={String(rule.cooldownSeconds)} onChange={event=>setAlertRules(previous=>previous.map((item,itemIndex)=>itemIndex===index?{...item,cooldownSeconds:Number(event.target.value)}:item))} type="number" title="Cooldown saniye"/></div>)}</div><div className="flex gap-2"><Button onClick={()=>{notificationRuleStore.save(alertRules);toast.show({variant:'success',title:'Alarm kuralları kaydedildi'});}}>Kuralları kaydet</Button><Button variant="outline" onClick={()=>{notificationRuleStore.reset();setAlertRules(notificationRuleStore.list());}}>Varsayılanlara dön</Button><Button variant="outline" onClick={()=>toast.confirm({variant:'primary',title:'Etkileşimli toast testi',description:'Checkbox, input ve evet/hayır akışını birlikte test edin.',yesNo:true,input:{label:'Test adı',placeholder:'Bildirim testi',required:true},checkboxes:[{id:'ack',label:'Detayları okudum',required:true},{id:'remember',label:'Tercihimi bu oturumda hatırla'}]}).then(result=>toast.show({variant:result.confirmed?'success':'neutral',title:result.confirmed?'Toast onaylandı':'Toast iptal edildi',description:result.inputValue||undefined}))}>Toast sistemini test et</Button></div></div>;
  };

  if (!open || typeof document === 'undefined') return null;
  const activeTab = TABS.find(item=>item.id===tab) || TABS[0];
  const ActiveIcon = activeTab.icon;

  return createPortal(<div className="fixed inset-0 z-[350] flex items-center justify-center p-2 sm:p-3"><button className="absolute inset-0 bg-black/82 backdrop-blur-md" onClick={onClose}/><div className="relative z-10 grid h-[calc(100dvh-16px)] max-h-[920px] w-[calc(100vw-16px)] max-w-[1540px] min-w-0 grid-cols-[clamp(180px,21vw,250px)_minmax(0,1fr)] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)] sm:rounded-3xl"><aside className="flex min-h-0 flex-col border-r border-zinc-800 bg-black/25"><div className="border-b border-zinc-800 p-4"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-cyan-400"/><div><div className="text-xs font-semibold">Veri Zekâsı</div><div className="text-[8px] text-zinc-600">Coreor Database 3.0.0 • yerel</div></div></div></div><nav className="min-h-0 flex-1 overflow-y-auto p-2">{TABS.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>{setTab(item.id);setError(null);}} className={`mb-1 flex w-full gap-3 rounded-xl border px-3 py-2.5 text-left ${tab===item.id?'border-cyan-500/20 bg-cyan-500/10':'border-transparent hover:bg-white/[0.035]'}`}><Icon className={`mt-0.5 h-4 w-4 ${tab===item.id?'text-cyan-300':'text-zinc-600'}`}/><span><span className="block text-[10px] font-medium">{item.label}</span><span className="mt-0.5 block text-[8px] text-zinc-600">{item.description}</span></span></button>})}</nav><div className="border-t border-zinc-800 p-3 text-[8px] leading-4 text-zinc-600"><ShieldCheck className="mb-1 h-3.5 w-3.5 text-emerald-400"/>Sorgu örnekleri ve analiz sonuçları bu cihazdaki Coreor Database verisinde kalır.</div></aside><main className="flex min-h-0 flex-col"><header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800 px-4"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800"><ActiveIcon className="h-4 w-4 text-cyan-400"/></span><div><h2 className="text-sm font-semibold">{activeTab.label}</h2><p className="text-[9px] text-zinc-600">{activeTab.description}</p></div><Button variant="ghost" size="icon" className="ml-auto" onClick={onClose}><X className="h-4 w-4"/></Button></header>{error&&<div className="border-b border-red-500/20 bg-red-500/[0.07] px-4 py-2 text-[10px] text-red-300">{error}</div>}<div className="coreor-table-scroll min-h-0 flex-1 overflow-auto p-5">{renderTab()}</div></main></div></div>,document.body);
}
