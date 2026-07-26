'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  FileClock,
  History,
  Loader2,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  StarOff,
  Terminal,
  Trash2,
  Wand2,
  XCircle
} from 'lucide-react';
import type { DatabaseServerConfig, EditorQueryTab, QueryExecutionResult, TableInfo } from 'types';
import { executeDatabaseQuery, fetchTableInfo } from '@/lib/databaseApi';
import { databaseEngineDefinition, quoteDatabaseIdentifier } from '@/lib/databaseEngines';
import { useAppContextMenu } from '@/components/app-context-menu';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { SqlEditor } from '@/components/ui/sql-syntax';
import { DatabaseActionConfirmModal, type DatabaseActionConfirmation } from '@/components/database-action-confirm-modal';
import { useAppPreferences } from '@/lib/appPreferences';
import { approvalRequests, automationId, migrationDrafts, schemaSnapshots } from '@/lib/databaseAutomation';

interface QueryWorkspaceProps {
  tab: EditorQueryTab;
  servers: DatabaseServerConfig[];
  accountId?: string | null;
  onChange: (patch: Partial<EditorQueryTab>) => void;
  onDuplicate: () => void;
}

interface StoredQuery { id: string; title: string; sql: string; databaseName: string | null; createdAt: string; }
interface Suggestion { id: string; label: string; insertText: string; detail: string; kind: 'keyword' | 'database' | 'table' | 'column'; }
interface ResultSet { id: string; sql: string; label: string; result: QueryExecutionResult | null; error: string | null; dryRun?: boolean; }

const HISTORY_KEY = 'coreor:query-history:v3';
const FAVORITES_KEY = 'coreor:query-favorites:v3';
const MAX_HISTORY = 150;
const SQL_KEYWORDS = ['SELECT','DISTINCT','FROM','WHERE','AND','OR','NOT','NULL','JOIN','LEFT JOIN','RIGHT JOIN','ON','GROUP BY','HAVING','ORDER BY','ASC','DESC','LIMIT','OFFSET','TOP','INSERT INTO','VALUES','UPDATE','SET','DELETE FROM','CREATE TABLE','ALTER TABLE','DROP TABLE','TRUNCATE TABLE','CREATE INDEX','UNIQUE','COUNT','SUM','AVG','MIN','MAX','CASE','WHEN','THEN','ELSE','END','AS','IN','BETWEEN','LIKE','EXISTS','UNION','WITH','EXPLAIN','SHOW TABLES','SHOW CREATE TABLE','DESCRIBE','COMMIT','ROLLBACK'];

function createId(prefix = 'query') { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function valueText(value: unknown) { return value === null ? '(NULL)' : value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value); }
function readStored(key: string): StoredQuery[] { if (typeof window === 'undefined') return []; try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function writeStored(key: string, values: StoredQuery[]) { if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(values.slice(0, MAX_HISTORY))); }
function queryTitle(sql: string) { const text = sql.replace(/\s+/g, ' ').trim(); return text.length > 72 ? `${text.slice(0, 72)}…` : text || 'SQL sorgusu'; }
function formatSql(source: string) { return source.trim().replace(/\s+(FROM|WHERE|LEFT JOIN|RIGHT JOIN|INNER JOIN|GROUP BY|HAVING|ORDER BY|LIMIT|VALUES|SET)\s+/gi, '\n$1\n  ').replace(/\s+(AND|OR)\s+/gi, '\n  $1 '); }

function splitStatements(sql: string) {
  const result: string[] = []; let current = ''; let quote: string | null = null; let comment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]; const next = sql[index + 1];
    if (!quote && char === '-' && next === '-') comment = true;
    if (comment && char === '\n') comment = false;
    if (!comment && (char === "'" || char === '"' || char === '`')) {
      if (quote === char && sql[index - 1] !== '\\') quote = null; else if (!quote) quote = char;
    }
    if (char === ';' && !quote && !comment) { if (current.trim()) result.push(current.trim()); current = ''; }
    else current += char;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function operationType(sql: string) {
  const clean = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (/^DROP\s+(TABLE|DATABASE)\b/i.test(clean)) return 'drop' as const;
  if (/^TRUNCATE\s+TABLE\b/i.test(clean)) return 'truncate' as const;
  if (/^ALTER\s+TABLE\b/i.test(clean)) return 'production-alter' as const;
  return null;
}

function parseMutation(sql: string) {
  const update = /^UPDATE\s+([^\s]+)\s+SET\s+[\s\S]+?\s+WHERE\s+([\s\S]+)$/i.exec(sql.trim().replace(/;$/, ''));
  if (update) return { table: update[1], where: update[2], preview: `SELECT * FROM ${update[1]} WHERE ${update[2]} LIMIT 250` };
  const remove = /^DELETE\s+FROM\s+([^\s]+)\s+WHERE\s+([\s\S]+)$/i.exec(sql.trim().replace(/;$/, ''));
  if (remove) return { table: remove[1], where: remove[2], preview: `SELECT * FROM ${remove[1]} WHERE ${remove[2]} LIMIT 250` };
  return null;
}

function parseAlterTable(sql: string) {
  const match = /^ALTER\s+TABLE\s+([`"\[]?)([A-Za-z0-9_$.-]+)[`"\]]?/i.exec(sql.trim());
  if (!match) return null;
  const full = match[2]; const parts = full.split('.'); return parts.at(-1) || null;
}

function cursorToken(sql: string, cursor: number) { const match = /([A-Za-z0-9_$`".\[\]-]+)$/.exec(sql.slice(0, cursor)); return { value: match?.[1] || '', start: match ? cursor - match[1].length : cursor }; }
function suggestionIcon(kind: Suggestion['kind']) { if (kind === 'database') return <Database className="h-3.5 w-3.5 text-purple-400"/>; if (kind === 'table') return <Database className="h-3.5 w-3.5 text-emerald-400"/>; if (kind === 'column') return <Code2 className="h-3.5 w-3.5 text-cyan-400"/>; return <Sparkles className="h-3.5 w-3.5 text-amber-300"/>; }

export function QueryWorkspace({ tab, servers, accountId, onChange, onDuplicate }: QueryWorkspaceProps) {
  const { openContextMenu } = useAppContextMenu();
  const { preferences } = useAppPreferences();
  const autoRunHandled = useRef(false);
  const [history, setHistory] = useState<StoredQuery[]>([]);
  const [favorites, setFavorites] = useState<StoredQuery[]>([]);
  const [library, setLibrary] = useState<'history' | 'favorites' | null>(null);
  const [cursor, setCursor] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [columnCache, setColumnCache] = useState<Record<string, TableInfo>>({});
  const [confirmation, setConfirmation] = useState<DatabaseActionConfirmation | null>(null);
  const [resultSets, setResultSets] = useState<ResultSet[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [dryRunPending, setDryRunPending] = useState<{ statement: string; preview: QueryExecutionResult; table: string } | null>(null);

  const selectedServer = useMemo(() => servers.find(server => server.id === tab.serverId) ?? servers[0] ?? null, [servers, tab.serverId]);
  const databases = selectedServer?.databases || [];
  const selectedDatabase = databases.find(database => database.name === tab.databaseName) || null;
  const engine = selectedServer?.databaseType || 'mysql';
  const token = useMemo(() => cursorToken(tab.sql, cursor), [tab.sql, cursor]);
  const serverOptions = useMemo<SearchSelectOption[]>(() => servers.map(server => ({ value: server.id, label: server.name, description: `${server.host}:${server.port}`, badge: databaseEngineDefinition(server.databaseType).label })), [servers]);
  const databaseOptions = useMemo<SearchSelectOption[]>(() => [{ value: '', label: 'Sunucu geneli' }, ...databases.map(database => ({ value: database.name, label: database.name, description: `${database.tableCount} tablo` }))], [databases]);

  useEffect(() => { setHistory(readStored(HISTORY_KEY)); setFavorites(readStored(FAVORITES_KEY)); }, []);
  useEffect(() => { setColumnCache({}); }, [selectedServer?.id, tab.databaseName]);
  useEffect(() => {
    if (!preferences.autocomplete || !selectedServer || !tab.databaseName || !accountId || !suggestionsOpen) return;
    for (const tableName of (selectedDatabase?.tables || []).slice(0, 12)) {
      if (columnCache[tableName]) continue;
      void fetchTableInfo(selectedServer.id, tab.databaseName, tableName, accountId).then(info => setColumnCache(previous => ({ ...previous, [tableName]: info }))).catch(() => undefined);
    }
  }, [preferences.autocomplete, selectedServer, tab.databaseName, accountId, suggestionsOpen, selectedDatabase, columnCache]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!preferences.autocomplete || !suggestionsOpen || !selectedServer) return [];
    const raw = token.value.replace(/[`"\[\]]/g, ''); const lower = raw.toLocaleLowerCase('tr-TR'); const upper = raw.toUpperCase(); const quote = (value: string) => quoteDatabaseIdentifier(value, engine); const list: Suggestion[] = [];
    for (const keyword of SQL_KEYWORDS) if (!upper || keyword.startsWith(upper)) list.push({ id: `k:${keyword}`, label: keyword, insertText: keyword, detail: 'SQL', kind: 'keyword' });
    for (const database of databases) if (!lower || database.name.toLocaleLowerCase('tr-TR').includes(lower)) list.push({ id: `d:${database.name}`, label: database.name, insertText: quote(database.name), detail: `${database.tableCount} tablo`, kind: 'database' });
    for (const tableName of selectedDatabase?.tables || []) if (!lower || tableName.toLocaleLowerCase('tr-TR').includes(lower)) list.push({ id: `t:${tableName}`, label: tableName, insertText: quote(tableName), detail: tab.databaseName || '', kind: 'table' });
    for (const [tableName, info] of Object.entries(columnCache)) for (const column of info.columns) if (!lower || column.Field.toLocaleLowerCase('tr-TR').includes(lower)) list.push({ id: `c:${tableName}:${column.Field}`, label: column.Field, insertText: quote(column.Field), detail: `${tableName} • ${column.Type}`, kind: 'column' });
    return list.slice(0, 28);
  }, [preferences.autocomplete, suggestionsOpen, selectedServer, token.value, engine, databases, selectedDatabase, columnCache, tab.databaseName]);

  const recordHistory = useCallback((sql: string) => {
    const item = { id: createId(), title: queryTitle(sql), sql, databaseName: tab.databaseName, createdAt: new Date().toISOString() };
    setHistory(previous => { const next = [item, ...previous.filter(entry => entry.sql !== sql)].slice(0, MAX_HISTORY); writeStored(HISTORY_KEY, next); return next; });
  }, [tab.databaseName]);

  const takeSnapshot = useCallback(async (statement: string) => {
    if (!preferences.autoSchemaSnapshots || !selectedServer || !accountId || !tab.databaseName) return;
    const tableName = parseAlterTable(statement); if (!tableName) return;
    let tableInfo: TableInfo | undefined; let createSql: string | undefined;
    try { tableInfo = await fetchTableInfo(selectedServer.id, tab.databaseName, tableName, accountId); } catch { /* optional */ }
    try {
      const show = engine === 'postgresql' || engine === 'cockroachdb'
        ? `SELECT pg_get_tabledef('${tableName}'::regclass)`
        : engine === 'mssql'
          ? `SELECT OBJECT_DEFINITION(OBJECT_ID('${tableName}')) AS create_sql`
          : `SHOW CREATE TABLE ${quoteDatabaseIdentifier(tableName, engine)}`;
      const result = await executeDatabaseQuery(selectedServer.id, show, accountId, tab.databaseName);
      createSql = result.rows.length ? String(Object.values(result.rows[0]).at(-1) || '') : undefined;
    } catch { /* tableInfo remains useful */ }
    schemaSnapshots.add({ id: automationId('snapshot'), serverId: selectedServer.id, databaseName: tab.databaseName, tableName, engine, createdAt: new Date().toISOString(), reason: 'ALTER öncesi otomatik snapshot', alterSql: statement, createSql, tableInfo });
    migrationDrafts.save({ id: automationId('migration'), serverId: selectedServer.id, databaseName: tab.databaseName, name: `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}_${tableName}_alter`, createdAt: new Date().toISOString(), upSql: `${statement};`, downSql: createSql ? `-- Önceki CREATE tanımı\n${createSql}` : '-- DOWN SQL manuel olarak tamamlanmalı', source: 'query', status: 'draft' });
  }, [preferences.autoSchemaSnapshots, selectedServer, accountId, tab.databaseName, engine]);

  const requiresApproval = useCallback((statement: string) => {
    const type = operationType(statement); if (!type || !preferences.requireSecondApproval) return false;
    if (type === 'production-alter' && !preferences.productionAlterApproval) return false;
    const approved = approvalRequests.list().find(item => item.serverId === selectedServer?.id && item.databaseName === tab.databaseName && item.sql.trim() === statement.trim() && item.status === 'approved');
    if (approved) { approvalRequests.remove(approved.id); return false; }
    approvalRequests.save({ id: automationId('approval'), serverId: selectedServer?.id || '', databaseName: tab.databaseName, operation: type, sql: statement, requester: 'current-user', createdAt: new Date().toISOString(), status: 'pending' });
    window.dispatchEvent(new CustomEvent('coreor:open-automation-center', { detail: { tab: 'approvals' } }));
    onChange({ error: 'İşlem ikinci kullanıcı onayına gönderildi. Onaylandıktan sonra sorguyu tekrar çalıştırın.', isRunning: false });
    return true;
  }, [preferences.requireSecondApproval, preferences.productionAlterApproval, selectedServer?.id, tab.databaseName, onChange]);

  const executeStatements = useCallback(async (statements: string[]) => {
    if (!selectedServer || !accountId) return;
    onChange({ isRunning: true, error: null, runImmediately: false, serverId: selectedServer.id });
    const sets: ResultSet[] = [];
    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index];
      if (requiresApproval(statement)) return;
      await takeSnapshot(statement);
      try {
        const result = await executeDatabaseQuery(selectedServer.id, statement, accountId, tab.databaseName);
        sets.push({ id: createId('result'), sql: statement, label: `Sonuç ${index + 1}`, result, error: null });
      } catch (error) {
        sets.push({ id: createId('result'), sql: statement, label: `Sonuç ${index + 1}`, result: null, error: error instanceof Error ? error.message : 'Sorgu çalıştırılamadı.' });
        break;
      }
    }
    setResultSets(sets); setActiveResultId(sets[0]?.id || null);
    const first = sets[0]; onChange({ isRunning: false, error: first?.error || null, result: first?.result || null, updatedAt: new Date().toISOString() });
  }, [selectedServer, accountId, tab.databaseName, onChange, requiresApproval, takeSnapshot]);

  const executeNow = useCallback(async (skipDryRun = false) => {
    if (!selectedServer || !accountId || tab.isRunning || !tab.sql.trim()) return;
    const statements = splitStatements(tab.sql); recordHistory(tab.sql);
    if (!skipDryRun && preferences.dryRunMutations && statements.length === 1) {
      const mutation = parseMutation(statements[0]);
      if (mutation) {
        onChange({ isRunning: true, error: null });
        try {
          const preview = await executeDatabaseQuery(selectedServer.id, mutation.preview, accountId, tab.databaseName);
          setDryRunPending({ statement: statements[0], preview, table: mutation.table });
          setResultSets([{ id: 'dry-run', sql: mutation.preview, label: 'Dry-run ön izlemesi', result: preview, error: null, dryRun: true }]); setActiveResultId('dry-run');
          onChange({ isRunning: false, result: preview, error: null });
        } catch (error) { onChange({ isRunning: false, error: error instanceof Error ? error.message : 'Dry-run çalıştırılamadı.' }); }
        return;
      }
    }
    await executeStatements(statements);
  }, [selectedServer, accountId, tab.isRunning, tab.sql, tab.databaseName, preferences.dryRunMutations, onChange, recordHistory, executeStatements]);

  const runQuery = useCallback(() => {
    const dangerous = splitStatements(tab.sql).some(statement => operationType(statement) || (/^(UPDATE|DELETE)\b/i.test(statement) && !/\bWHERE\b/i.test(statement)));
    if (preferences.confirmDangerousQueries && dangerous) {
      setConfirmation({ title: 'Güvenli SQL doğrulaması', description: 'Bu sorgu veri veya şema değişikliği oluşturabilir.', expectedText: 'ÇALIŞTIR', sql: tab.sql, confirmLabel: 'Güvenlik adımına devam et', onConfirm: () => void executeNow() }); return;
    }
    void executeNow();
  }, [preferences.confirmDangerousQueries, tab.sql, executeNow]);

  useEffect(() => { if (tab.runImmediately && !autoRunHandled.current) { autoRunHandled.current = true; runQuery(); } }, [tab.runImmediately, runQuery]);
  useEffect(() => { autoRunHandled.current = false; }, [tab.id]);

  const activeSet = resultSets.find(item => item.id === activeResultId) || resultSets[0] || null;
  const activeResult = activeSet?.result || tab.result || null;
  const columns = activeResult?.fields?.map(field => field.name) || Object.keys(activeResult?.rows?.[0] || {});
  const isFavorite = favorites.some(item => item.sql === tab.sql && item.databaseName === tab.databaseName);
  const toggleFavorite = () => setFavorites(previous => { const next = isFavorite ? previous.filter(item => !(item.sql === tab.sql && item.databaseName === tab.databaseName)) : [{ id: createId(), title: queryTitle(tab.sql), sql: tab.sql, databaseName: tab.databaseName, createdAt: new Date().toISOString() }, ...previous]; writeStored(FAVORITES_KEY, next); return next; });
  const insertSuggestion = (suggestion: Suggestion) => { const next = `${tab.sql.slice(0, token.start)}${suggestion.insertText}${tab.sql.slice(cursor)}`; onChange({ sql: next }); setCursor(token.start + suggestion.insertText.length); setSuggestionsOpen(false); };
  const libraryItems = library === 'history' ? history : favorites;
  const editorContextMenu = (event: React.MouseEvent) => openContextMenu(event, [
    { id: 'run', label: 'Sorguyu çalıştır', icon: Play, shortcut: 'Ctrl+Enter', onSelect: runQuery },
    { id: 'format', label: 'SQL biçimlendir', icon: Wand2, onSelect: () => onChange({ sql: formatSql(tab.sql) }) },
    { id: 'favorite', label: isFavorite ? 'Favorilerden kaldır' : 'Favorilere ekle', icon: isFavorite ? StarOff : Star, onSelect: toggleFavorite },
    { id: 'duplicate', label: 'Sekmeyi çoğalt', icon: Copy, onSelect: onDuplicate },
    { id: 'clear', label: 'Editörü temizle', icon: Trash2, onSelect: () => onChange({ sql: '', result: null, error: null }) }
  ]);

  return <div className="flex h-full min-h-0 flex-col bg-zinc-950/30">
    <div className="coreor-hide-scrollbar flex min-h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-zinc-800 px-2 py-1">
      <Button size="sm" className="h-7 gap-1.5 text-[11px]" disabled={!selectedServer || !accountId || tab.isRunning || !tab.sql.trim()} onClick={runQuery}>{tab.isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Play className="h-3.5 w-3.5"/>}Çalıştır</Button>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => onChange({ sql: formatSql(tab.sql) })}><Wand2 className="mr-1 h-3.5 w-3.5"/>Biçimlendir</Button>
      <Button variant="ghost" size="icon" className={`h-7 w-7 ${isFavorite ? 'text-amber-300' : ''}`} onClick={toggleFavorite}>{isFavorite ? <Star className="h-3.5 w-3.5 fill-current"/> : <StarOff className="h-3.5 w-3.5"/>}</Button>
      <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setLibrary(library === 'history' ? null : 'history')}><History className="mr-1 h-3.5 w-3.5"/>Geçmiş</Button>
      <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setLibrary(library === 'favorites' ? null : 'favorites')}><BookOpen className="mr-1 h-3.5 w-3.5"/>Favoriler</Button>
      <div className="w-48 shrink-0"><SearchSelect value={selectedServer?.id || ''} options={serverOptions} onValueChange={serverId => onChange({ serverId: serverId || null, databaseName: null, result: null })} triggerClassName="h-7 min-h-7" showDescriptionInTrigger={false}/></div>
      <div className="w-52 shrink-0"><SearchSelect value={tab.databaseName || ''} options={databaseOptions} onValueChange={databaseName => onChange({ databaseName: databaseName || null, result: null })} triggerClassName="h-7 min-h-7" showDescriptionInTrigger={false}/></div>
      <span className="ml-auto flex items-center gap-2 text-[9px] text-zinc-600"><span className={preferences.dryRunMutations ? 'text-emerald-400' : ''}>Dry-run {preferences.dryRunMutations ? 'açık' : 'kapalı'}</span><span>•</span><span>{preferences.autoSchemaSnapshots ? 'Snapshot açık' : 'Snapshot kapalı'}</span></span>
    </div>

    {dryRunPending && <div className="flex shrink-0 items-center gap-3 border-b border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[10px] text-amber-100"><AlertTriangle className="h-4 w-4"/><div className="min-w-0 flex-1"><b>{dryRunPending.preview.rows.length.toLocaleString('tr-TR')} satır</b> etkilenebilir. Kaynak tablo: {dryRunPending.table}</div><Button size="sm" className="h-7" onClick={() => { const statement = dryRunPending.statement; setDryRunPending(null); void executeStatements([statement]); }}><ShieldCheck className="mr-1 h-3.5 w-3.5"/>Değişikliği uygula</Button><Button variant="ghost" size="sm" onClick={() => setDryRunPending(null)}>İptal</Button></div>}

    <div className={`grid min-h-0 flex-1 ${library ? 'grid-cols-[minmax(0,1fr)_300px]' : 'grid-cols-1'}`}>
      <div className="grid min-h-0 grid-rows-[minmax(160px,.48fr)_minmax(170px,.52fr)]">
        <div className="relative min-h-0 border-b border-zinc-800"><SqlEditor value={tab.sql} onChange={(sql, position) => { onChange({ sql }); setCursor(position); setSuggestionsOpen(preferences.autocomplete); }} onCursorChange={setCursor} onContextMenu={editorContextMenu} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); runQuery(); } else if (suggestionsOpen && suggestions.length && (event.key === 'Enter' || event.key === 'Tab')) { event.preventDefault(); insertSuggestion(suggestions[suggestionIndex] || suggestions[0]); } else if (suggestionsOpen && event.key === 'ArrowDown') { event.preventDefault(); setSuggestionIndex(value => (value + 1) % suggestions.length); } else if (event.key === 'Escape') setSuggestionsOpen(false); }}/>
          {suggestionsOpen && suggestions.length > 0 && <div className="absolute bottom-3 left-3 z-30 max-h-80 w-[500px] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-1 shadow-2xl">{suggestions.map((suggestion, index) => <button key={suggestion.id} onMouseDown={event => { event.preventDefault(); insertSuggestion(suggestion); }} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${index === suggestionIndex ? 'bg-cyan-500/15' : 'hover:bg-zinc-900'}`}>{suggestionIcon(suggestion.kind)}<span className="min-w-0 flex-1 truncate font-mono text-[10px]">{suggestion.label}</span><span className="text-[9px] text-zinc-600">{suggestion.detail}</span></button>)}</div>}
        </div>
        <div className="flex min-h-0 flex-col bg-black/20">
          <div className="coreor-hide-scrollbar flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-800 px-2 text-[10px] text-zinc-500"><Terminal className="h-3.5 w-3.5"/>{resultSets.length > 1 ? resultSets.map(item => <button key={item.id} onClick={() => setActiveResultId(item.id)} className={`rounded px-2 py-1 ${activeSet?.id === item.id ? 'bg-cyan-500/10 text-cyan-300' : 'hover:bg-zinc-900'}`}>{item.label}{item.error ? ' • hata' : item.dryRun ? ' • ön izleme' : ''}</button>) : <span>{activeSet?.dryRun ? 'Dry-run sonucu' : 'Sonuç'}</span>}<span className="ml-auto">{activeResult?.rows?.length?.toLocaleString('tr-TR') || 0} satır</span></div>
          {activeSet?.error || tab.error ? <div className="m-3 rounded border border-red-500/30 bg-red-500/10 p-3 font-mono text-[11px] text-red-300">{activeSet?.error || tab.error}</div> : activeResult?.rows?.length ? <ScrollArea className="min-h-0 flex-1"><div className="min-w-max"><Table size="sm" columnStorageKey={`query-result:${tab.id}:${columns.join('|')}`}><TableHeader><TableRow>{columns.map(column => <TableHead key={column} columnKey={column} className="sticky top-0 z-10 border bg-zinc-950">{column}</TableHead>)}</TableRow></TableHeader><TableBody>{activeResult.rows.map((row, rowIndex) => <TableRow key={rowIndex}>{columns.map(column => <TableCell key={column} className="truncate border font-mono text-[11px]" title={valueText(row[column])}>{valueText(row[column])}</TableCell>)}</TableRow>)}</TableBody></Table></div></ScrollArea> : activeResult ? <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">{typeof activeResult.affectedRows === 'number' ? `${activeResult.affectedRows.toLocaleString('tr-TR')} satır etkilendi.` : 'Sorgu tamamlandı.'}</div> : <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">Sonuçlar burada gösterilir.</div>}
        </div>
      </div>
      {library && <aside className="min-h-0 overflow-y-auto border-l border-zinc-800 p-2">{libraryItems.map(item => <button key={item.id} className="mb-1 w-full rounded-xl border border-zinc-800 p-3 text-left" onClick={() => { onChange({ sql: item.sql, databaseName: item.databaseName }); setLibrary(null); }}><div className="truncate text-[10px] font-medium">{item.title}</div><div className="mt-1 line-clamp-2 font-mono text-[8px] text-zinc-600">{item.sql}</div></button>)}</aside>}
    </div>
    <DatabaseActionConfirmModal action={confirmation} onClose={() => setConfirmation(null)}/>
  </div>;
}
