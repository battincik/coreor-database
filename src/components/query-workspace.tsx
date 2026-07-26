'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  BookOpen,
  Braces,
  Code2,
  Copy,
  Database,
  FileCode2,
  Gauge,
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
import { QueryDryRunModal, type QueryDryRunPreview } from '@/components/query-dry-run-modal';
import { useAppPreferences } from '@/lib/appPreferences';
import {
  addApproval,
  getDatabaseSafetyWorkspace,
  getServerDatabaseSafetyWorkspace,
  subscribeDatabaseSafetyWorkspace
} from '@/lib/databaseSafetyWorkspace';
import { displayShortcut, shortcutFor, shortcutMatches } from '@/lib/keyboardShortcuts';
import { looksLikeProductionServer } from '@/lib/schemaMigration';
import { openDatabaseSafetyCenter } from '@/lib/databaseSafetyEvents';

interface QueryWorkspaceProps {
  tab: EditorQueryTab;
  servers: DatabaseServerConfig[];
  accountId?: string | null;
  onChange: (patch: Partial<EditorQueryTab>) => void;
  onDuplicate: () => void;
}

interface StoredQuery {
  id: string;
  title: string;
  sql: string;
  databaseName: string | null;
  createdAt: string;
  lastRunAt?: string;
}

interface Suggestion {
  id: string;
  label: string;
  insertText: string;
  detail: string;
  kind: 'keyword' | 'database' | 'table' | 'column' | 'snippet';
}

interface QueryResultSet {
  id: string;
  sql: string;
  title: string;
  result: QueryExecutionResult | null;
  error: string | null;
  durationMs: number;
}

interface DryRunSql {
  countSql: string;
  previewSql: string;
}

const HISTORY_KEY = 'coreor:query-history:v2';
const FAVORITES_KEY = 'coreor:query-favorites:v2';
const MAX_HISTORY = 120;
const SQL_KEYWORDS = [
  'SELECT','DISTINCT','FROM','WHERE','AND','OR','NOT','NULL','IS NULL','IS NOT NULL','INNER JOIN','LEFT JOIN','RIGHT JOIN','CROSS JOIN','ON','GROUP BY','HAVING','ORDER BY','ASC','DESC','LIMIT','OFFSET','TOP','INSERT INTO','VALUES','UPDATE','SET','DELETE FROM','CREATE TABLE','CREATE VIEW','ALTER TABLE','DROP TABLE','TRUNCATE TABLE','CREATE INDEX','UNIQUE','COUNT','SUM','AVG','MIN','MAX','CASE','WHEN','THEN','ELSE','END','AS','IN','BETWEEN','LIKE','EXISTS','UNION','UNION ALL','WITH','EXPLAIN','EXPLAIN ANALYZE','SHOW TABLES','SHOW CREATE TABLE','DESCRIBE','START TRANSACTION','COMMIT','ROLLBACK','CALL'
];
const SNIPPETS = [
  { id: 'select-page', title: 'Sayfalı SELECT', sql: 'SELECT *\nFROM table_name\nWHERE 1 = 1\nORDER BY id DESC\nLIMIT 100 OFFSET 0;' },
  { id: 'join', title: 'İki tablo JOIN', sql: 'SELECT\n  a.*,\n  b.*\nFROM table_a AS a\nINNER JOIN table_b AS b ON b.a_id = a.id\nWHERE 1 = 1;' },
  { id: 'aggregate', title: 'Gruplama ve toplam', sql: 'SELECT status, COUNT(*) AS row_count\nFROM table_name\nGROUP BY status\nORDER BY row_count DESC;' },
  { id: 'insert', title: 'Güvenli INSERT', sql: 'INSERT INTO table_name (column_a, column_b)\nVALUES (?, ?);' },
  { id: 'update', title: 'Primary key UPDATE', sql: 'UPDATE table_name\nSET column_name = ?\nWHERE id = ?;' },
  { id: 'duplicates', title: 'Tekrarlanan değerler', sql: 'SELECT column_name, COUNT(*) AS duplicate_count\nFROM table_name\nGROUP BY column_name\nHAVING COUNT(*) > 1;' }
];

function valueText(value: unknown) {
  if (value === null) return '(NULL)';
  if (value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function readStored(key: string): StoredQuery[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function writeStored(key: string, values: StoredQuery[]) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, JSON.stringify(values.slice(0, MAX_HISTORY))); } catch { /* optional local library */ }
}

function createId(prefix = 'query') {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function queryTitle(sql: string) {
  const normalized = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();
  return normalized.length > 72 ? `${normalized.slice(0, 72)}…` : normalized || 'SQL sorgusu';
}

function statementTitle(sql: string, index: number) {
  const command = sql.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/g, '').trim().split(/\s+/)[0]?.toUpperCase() || 'SQL';
  return `${index + 1}. ${command}`;
}

function isDangerousSql(sql: string) {
  const normalized = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
  return /^\s*(DROP\s+(TABLE|DATABASE)|TRUNCATE\s+TABLE)\b/i.test(normalized)
    || (/^\s*DELETE\s+FROM\b/i.test(normalized) && !/\bWHERE\b/i.test(normalized))
    || (/^\s*UPDATE\b/i.test(normalized) && !/\bWHERE\b/i.test(normalized));
}

function requiresApproval(sql: string, server: DatabaseServerConfig, enabled: boolean) {
  if (!enabled) return false;
  const normalized = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
  if (/^\s*(DROP\s+(TABLE|DATABASE)|TRUNCATE\s+TABLE)\b/i.test(normalized)) return true;
  return /^\s*ALTER\b/i.test(normalized) && looksLikeProductionServer(server.name, server.host);
}

function approvalAction(sql: string): 'drop' | 'truncate' | 'production-alter' {
  if (/^\s*TRUNCATE\b/i.test(sql)) return 'truncate';
  if (/^\s*DROP\b/i.test(sql)) return 'drop';
  return 'production-alter';
}

function applyClientLimit(sql: string, maximumRows: number, engine: string) {
  const trimmed = sql.trim();
  if (!/^SELECT\b/i.test(trimmed) || /\b(LIMIT|TOP|FETCH\s+NEXT)\b/i.test(trimmed)) return trimmed;
  return engine === 'mssql'
    ? trimmed.replace(/^SELECT\s+/i, `SELECT TOP (${maximumRows}) `)
    : `${trimmed.replace(/;\s*$/, '')}\nLIMIT ${maximumRows};`;
}

function formatSql(source: string) {
  const compact = source.replace(/\r/g, '').trim();
  if (!compact) return '';
  const major = ['SELECT','FROM','WHERE','INNER JOIN','LEFT JOIN','RIGHT JOIN','CROSS JOIN','GROUP BY','HAVING','ORDER BY','LIMIT','OFFSET','UNION ALL','UNION','VALUES','SET','RETURNING'];
  let formatted = compact.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ');
  for (const keyword of major.sort((left, right) => right.length - left.length)) {
    formatted = formatted.replace(new RegExp(`\\s+${keyword.replace(/ /g, '\\s+')}\\s+`, 'gi'), `\n${keyword}\n  `);
  }
  return formatted.replace(/\b(AND|OR)\b/gi, '\n  $1').replace(/,\s*/g, ',\n  ').replace(/\n{3,}/g, '\n\n').trim();
}

function cursorToken(sql: string, cursor: number) {
  const before = sql.slice(0, cursor);
  const match = /([A-Za-z0-9_$`".\[\]-]+)$/.exec(before);
  return { value: match?.[1] || '', start: match ? cursor - match[1].length : cursor };
}

function referencedTables(sql: string) {
  const values = new Set<string>();
  const pattern = /\b(?:FROM|JOIN|UPDATE|INTO)\s+[`"\[]?(?:[A-Za-z0-9_$-]+[`"\]]?\.)?[`"\[]?([A-Za-z0-9_$-]+)[`"\]]?/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql))) values.add(match[1]);
  return [...values].slice(0, 12);
}

function suggestionIcon(kind: Suggestion['kind']) {
  if (kind === 'database') return <Database className="h-3.5 w-3.5 text-purple-400" />;
  if (kind === 'table') return <Database className="h-3.5 w-3.5 text-emerald-400" />;
  if (kind === 'column') return <Code2 className="h-3.5 w-3.5 text-cyan-400" />;
  if (kind === 'snippet') return <FileCode2 className="h-3.5 w-3.5 text-purple-400" />;
  return <Sparkles className="h-3.5 w-3.5 text-amber-300" />;
}

function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let start = 0;
  let quote: string | null = null;
  let lineComment = false;
  let blockComment = false;
  let bracket = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (!quote && !bracket && char === '-' && next === '-') { lineComment = true; index += 1; continue; }
    if (!quote && !bracket && char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (!quote && char === '[') { bracket = true; continue; }
    if (bracket) { if (char === ']') bracket = false; continue; }
    if (quote) {
      if (char === quote) {
        if (next === quote) { index += 1; continue; }
        quote = null;
      } else if (char === '\\') index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === ';') {
      const statement = sql.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

function stripTrailingQueryClauses(value: string) {
  return value.replace(/\s+(ORDER\s+BY|LIMIT|OFFSET|FETCH\s+NEXT|RETURNING)\b[\s\S]*$/i, '').trim();
}

function splitWhere(value: string) {
  const match = /\s+WHERE\s+([\s\S]+)$/i.exec(value);
  return {
    target: (match ? value.slice(0, match.index) : value).trim(),
    where: match ? ` WHERE ${stripTrailingQueryClauses(match[1])}` : ''
  };
}

function dryRunQueries(statement: string, engine: string): DryRunSql | null {
  const normalized = statement.trim().replace(/;\s*$/, '');
  let target = '';
  let where = '';

  if (/^UPDATE\b/i.test(normalized)) {
    const afterUpdate = normalized.replace(/^UPDATE\s+/i, '');
    const setMatch = /\s+SET\s+/i.exec(afterUpdate);
    if (!setMatch) return null;
    target = afterUpdate.slice(0, setMatch.index).trim();
    const afterSet = afterUpdate.slice(setMatch.index + setMatch[0].length);
    const whereMatch = /\s+WHERE\s+([\s\S]+)$/i.exec(afterSet);
    where = whereMatch ? ` WHERE ${stripTrailingQueryClauses(whereMatch[1])}` : '';
  } else if (/^DELETE\s+FROM\b/i.test(normalized)) {
    const parsed = splitWhere(normalized.replace(/^DELETE\s+FROM\s+/i, ''));
    target = parsed.target;
    where = parsed.where;
  } else {
    return null;
  }

  if (!target) return null;
  const countSql = `SELECT COUNT(*) AS affected_rows FROM ${target}${where};`;
  const previewSql = engine === 'mssql'
    ? `SELECT TOP (100) * FROM ${target}${where};`
    : `SELECT * FROM ${target}${where} LIMIT 100;`;
  return { countSql, previewSql };
}

export function QueryWorkspace({ tab, servers, accountId, onChange, onDuplicate }: QueryWorkspaceProps) {
  const { openContextMenu } = useAppContextMenu();
  const { preferences } = useAppPreferences();
  const safetyWorkspace = useSyncExternalStore(subscribeDatabaseSafetyWorkspace, getDatabaseSafetyWorkspace, getServerDatabaseSafetyWorkspace);
  const autoRunHandled = useRef(false);
  const columnRequestRef = useRef(new Set<string>());
  const [history, setHistory] = useState<StoredQuery[]>([]);
  const [favorites, setFavorites] = useState<StoredQuery[]>([]);
  const [library, setLibrary] = useState<'history' | 'favorites' | 'snippets' | null>(null);
  const [librarySearch, setLibrarySearch] = useState('');
  const [columnCache, setColumnCache] = useState<Record<string, TableInfo>>({});
  const [cursor, setCursor] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [confirmation, setConfirmation] = useState<DatabaseActionConfirmation | null>(null);
  const [dryRunPreview, setDryRunPreview] = useState<QueryDryRunPreview | null>(null);
  const [resultSets, setResultSets] = useState<QueryResultSet[]>([]);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);

  const selectedServer = useMemo(() => servers.find(server => server.id === tab.serverId) ?? servers[0] ?? null, [servers, tab.serverId]);
  const databases = selectedServer?.databases || [];
  const selectedDatabase = databases.find(database => database.name === tab.databaseName) || null;
  const engine = selectedServer?.databaseType || 'mysql';
  const token = useMemo(() => cursorToken(tab.sql, cursor), [tab.sql, cursor]);
  const activeResult = resultSets.find(result => result.id === activeResultId) || resultSets.at(-1) || null;
  const resultColumns = useMemo(() => activeResult?.result?.fields?.length ? activeResult.result.fields.map(field => field.name) : Object.keys(activeResult?.result?.rows?.[0] || {}), [activeResult]);
  const runShortcut = shortcutFor(safetyWorkspace.shortcuts, 'run-query', 'Mod+Enter');
  const formatShortcut = shortcutFor(safetyWorkspace.shortcuts, 'format-query', 'Shift+Alt+F');

  const serverOptions = useMemo<SearchSelectOption[]>(() => servers.map(server => ({
    value: server.id,
    label: server.name,
    description: `${server.host}:${server.port}`,
    badge: databaseEngineDefinition(server.databaseType).label,
    keywords: [server.host || '', server.username || '']
  })), [servers]);
  const databaseOptions = useMemo<SearchSelectOption[]>(() => [
    { value: '', label: 'Sunucu geneli', description: 'Bağlantının varsayılan kapsamı' },
    ...databases.map(database => ({ value: database.name, label: database.name, description: `${database.tableCount} tablo • ${database.totalRows.toLocaleString('tr-TR')} satır`, keywords: database.tables }))
  ], [databases]);

  useEffect(() => { setHistory(readStored(HISTORY_KEY)); setFavorites(readStored(FAVORITES_KEY)); }, []);
  useEffect(() => { setColumnCache({}); columnRequestRef.current.clear(); }, [selectedServer?.id, tab.databaseName]);
  useEffect(() => {
    if (!preferences.autocomplete || !selectedServer || !tab.databaseName || !accountId || !suggestionsOpen) return;
    const cleaned = token.value.replace(/[`"\[\]]/g, '');
    const dotted = cleaned.includes('.') ? cleaned.split('.')[0] : '';
    const candidates = [...referencedTables(tab.sql), ...(dotted ? [dotted] : []), ...(!token.value ? (selectedDatabase?.tables || []).slice(0, 6) : [])];
    for (const tableName of [...new Set(candidates)].filter(name => selectedDatabase?.tables.includes(name)).slice(0, 10)) {
      const key = `${selectedServer.id}:${tab.databaseName}:${tableName}`;
      if (columnCache[tableName] || columnRequestRef.current.has(key)) continue;
      columnRequestRef.current.add(key);
      void fetchTableInfo(selectedServer.id, tab.databaseName, tableName, accountId)
        .then(info => setColumnCache(previous => ({ ...previous, [tableName]: info })))
        .catch(() => undefined)
        .finally(() => columnRequestRef.current.delete(key));
    }
  }, [preferences.autocomplete, selectedServer, tab.databaseName, tab.sql, accountId, selectedDatabase, token.value, columnCache, suggestionsOpen]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!preferences.autocomplete || !suggestionsOpen || !selectedServer) return [];
    const raw = token.value.replace(/[`"\[\]]/g, '');
    const lower = raw.toLocaleLowerCase('tr-TR');
    const upper = raw.toUpperCase();
    const list: Suggestion[] = [];
    const quote = (value: string) => quoteDatabaseIdentifier(value, engine);
    if (raw.includes('.')) {
      const parts = raw.split('.');
      const tableName = parts.at(-2) || '';
      const partial = parts.at(-1) || '';
      for (const column of columnCache[tableName]?.columns || []) {
        if (!partial || column.Field.toLocaleLowerCase('tr-TR').startsWith(partial.toLocaleLowerCase('tr-TR'))) {
          list.push({ id: `column:${tableName}:${column.Field}`, label: `${tableName}.${column.Field}`, insertText: `${quote(tableName)}.${quote(column.Field)}`, detail: column.Type, kind: 'column' });
        }
      }
    } else {
      for (const keyword of SQL_KEYWORDS) if (!upper || keyword.startsWith(upper)) list.push({ id: `keyword:${keyword}`, label: keyword, insertText: keyword, detail: 'SQL anahtar kelimesi', kind: 'keyword' });
      for (const database of databases) if (!lower || database.name.toLocaleLowerCase('tr-TR').includes(lower)) list.push({ id: `database:${database.name}`, label: database.name, insertText: quote(database.name), detail: `${database.tableCount} tablo`, kind: 'database' });
      for (const tableName of selectedDatabase?.tables || []) if (!lower || tableName.toLocaleLowerCase('tr-TR').includes(lower)) list.push({ id: `table:${tableName}`, label: tableName, insertText: quote(tableName), detail: `${tab.databaseName} tablosu`, kind: 'table' });
      for (const [tableName, info] of Object.entries(columnCache)) {
        for (const column of info.columns) if (!lower || column.Field.toLocaleLowerCase('tr-TR').includes(lower)) list.push({ id: `column:${tableName}:${column.Field}`, label: column.Field, insertText: quote(column.Field), detail: `${tableName} • ${column.Type}`, kind: 'column' });
      }
      for (const snippet of SNIPPETS) if (!lower || snippet.title.toLocaleLowerCase('tr-TR').includes(lower)) list.push({ id: `snippet:${snippet.id}`, label: snippet.title, insertText: snippet.sql, detail: 'Snippet', kind: 'snippet' });
    }
    return list.slice(0, 24);
  }, [preferences.autocomplete, suggestionsOpen, selectedServer, token.value, engine, databases, selectedDatabase, columnCache, tab.databaseName]);

  useEffect(() => setSuggestionIndex(0), [token.value, suggestionsOpen]);

  const recordHistory = useCallback((sql: string) => {
    const normalized = sql.trim();
    if (!normalized) return;
    const next: StoredQuery = { id: createId(), title: queryTitle(normalized), sql: normalized, databaseName: tab.databaseName, createdAt: new Date().toISOString(), lastRunAt: new Date().toISOString() };
    setHistory(previous => {
      const updated = [next, ...previous.filter(item => item.sql.trim() !== normalized || item.databaseName !== tab.databaseName)].slice(0, MAX_HISTORY);
      writeStored(HISTORY_KEY, updated);
      return updated;
    });
  }, [tab.databaseName]);

  const executeStatements = useCallback(async (statements: string[]) => {
    if (!selectedServer || !accountId || tab.isRunning || !statements.length) return;
    onChange({ isRunning: true, error: null, runImmediately: false, serverId: selectedServer.id });
    recordHistory(tab.sql);
    const nextSets: QueryResultSet[] = [];
    let lastResult: QueryExecutionResult | null = null;
    let firstError: string | null = null;

    for (let index = 0; index < statements.length; index += 1) {
      const statement = applyClientLimit(statements[index], preferences.queryResultLimit, engine);
      const started = performance.now();
      try {
        const result = await executeDatabaseQuery(selectedServer.id, statement, accountId, tab.databaseName);
        lastResult = result;
        nextSets.push({ id: createId('result'), sql: statement, title: statementTitle(statement, index), result, error: null, durationMs: Math.round(performance.now() - started) });
      } catch (failure) {
        const error = failure instanceof Error ? failure.message : 'SQL sorgusu çalıştırılamadı.';
        firstError = error;
        nextSets.push({ id: createId('result'), sql: statement, title: statementTitle(statement, index), result: null, error, durationMs: Math.round(performance.now() - started) });
        break;
      }
    }

    setResultSets(nextSets);
    setActiveResultId(nextSets[0]?.id || null);
    onChange({ isRunning: false, error: firstError, result: lastResult, runImmediately: false, updatedAt: new Date().toISOString() });
  }, [selectedServer, accountId, tab.isRunning, tab.sql, tab.databaseName, onChange, recordHistory, preferences.queryResultLimit, engine]);

  const startDryRun = useCallback(async (statement: string, statements: string[]) => {
    if (!selectedServer || !accountId) return;
    const previewSql = dryRunQueries(statement, engine);
    if (!previewSql) { await executeStatements(statements); return; }
    onChange({ isRunning: true, error: null });
    try {
      const [countResult, sampleResult] = await Promise.all([
        executeDatabaseQuery(selectedServer.id, previewSql.countSql, accountId, tab.databaseName),
        executeDatabaseQuery(selectedServer.id, previewSql.previewSql, accountId, tab.databaseName)
      ]);
      const countValue = countResult.rows[0] ? Object.values(countResult.rows[0])[0] : null;
      const count = countValue === null || countValue === undefined ? null : Number(countValue);
      setDryRunPreview({
        statement,
        countSql: previewSql.countSql,
        previewSql: previewSql.previewSql,
        count: Number.isFinite(count) ? count : null,
        result: sampleResult,
        description: statements.length > 1
          ? 'İlk UPDATE/DELETE ifadesi ön izlendi. Onaydan sonra bütün statement’lar sırayla çalıştırılacaktır.'
          : 'Bu ön izleme yalnızca SELECT sorguları çalıştırdı; henüz veri değişmedi.',
        onConfirm: () => executeStatements(statements)
      });
    } catch (failure) {
      onChange({ error: failure instanceof Error ? failure.message : 'Dry-run ön izlemesi oluşturulamadı.' });
    } finally {
      onChange({ isRunning: false });
    }
  }, [selectedServer, accountId, engine, tab.databaseName, onChange, executeStatements]);

  const runQuery = useCallback(() => {
    if (!selectedServer || !accountId || !tab.sql.trim()) return;
    const statements = splitSqlStatements(tab.sql);
    if (!statements.length) return;
    const approvalStatements = statements.filter(statement => requiresApproval(statement, selectedServer, preferences.approvalWorkflows));
    if (approvalStatements.length) {
      for (const statement of approvalStatements) {
        addApproval({ serverId: selectedServer.id, serverName: selectedServer.name, database: tab.databaseName, action: approvalAction(statement), sql: statement, requestedBy: accountId });
      }
      onChange({ error: `${approvalStatements.length} işlem ikinci kullanıcı onay kuyruğuna eklendi.`, result: null });
      openDatabaseSafetyCenter({ tab: 'approvals', serverId: selectedServer.id, database: tab.databaseName });
      return;
    }
    const mutation = statements.find(statement => /^\s*(UPDATE|DELETE)\b/i.test(statement));
    if (preferences.sqlDryRun && mutation) {
      void startDryRun(mutation, statements);
      return;
    }
    if (preferences.confirmDangerousQueries && statements.some(isDangerousSql)) {
      setConfirmation({
        title: 'Tehlikeli SQL sorgusu',
        description: 'Bu sorgu veri veya şema kaybına neden olabilir.',
        expectedText: 'ÇALIŞTIR',
        sql: tab.sql,
        confirmLabel: 'Sorguyu çalıştır',
        onConfirm: () => executeStatements(statements)
      });
      return;
    }
    void executeStatements(statements);
  }, [selectedServer, accountId, tab.sql, tab.databaseName, preferences.approvalWorkflows, preferences.sqlDryRun, preferences.confirmDangerousQueries, onChange, startDryRun, executeStatements]);

  useEffect(() => {
    if (!tab.runImmediately || autoRunHandled.current) return;
    autoRunHandled.current = true;
    runQuery();
  }, [tab.runImmediately, runQuery]);
  useEffect(() => { autoRunHandled.current = false; }, [tab.id]);

  const isFavorite = favorites.some(item => item.sql.trim() === tab.sql.trim() && item.databaseName === tab.databaseName);
  const toggleFavorite = () => {
    const normalized = tab.sql.trim();
    if (!normalized) return;
    setFavorites(previous => {
      const exists = previous.some(item => item.sql.trim() === normalized && item.databaseName === tab.databaseName);
      const updated = exists
        ? previous.filter(item => !(item.sql.trim() === normalized && item.databaseName === tab.databaseName))
        : [{ id: createId(), title: queryTitle(normalized), sql: normalized, databaseName: tab.databaseName, createdAt: new Date().toISOString() }, ...previous];
      writeStored(FAVORITES_KEY, updated);
      return updated;
    });
  };

  const insertSuggestion = (suggestion: Suggestion) => {
    const next = `${tab.sql.slice(0, token.start)}${suggestion.insertText}${tab.sql.slice(cursor)}`;
    onChange({ sql: next, updatedAt: new Date().toISOString() });
    setCursor(token.start + suggestion.insertText.length);
    setSuggestionsOpen(false);
  };

  const editorContextMenu = (event: React.MouseEvent) => openContextMenu(event, [
    { id: 'run', label: 'Sorguyu çalıştır', icon: Play, shortcut: displayShortcut(runShortcut), disabled: tab.isRunning || !tab.sql.trim(), onSelect: runQuery },
    { id: 'format', label: 'SQL biçimlendir', icon: Wand2, shortcut: displayShortcut(formatShortcut), disabled: !tab.sql.trim(), onSelect: () => onChange({ sql: formatSql(tab.sql), updatedAt: new Date().toISOString() }) },
    { id: 'prepared', label: 'Prepared Lab’de aç', icon: Braces, disabled: !selectedServer || !tab.sql.trim(), onSelect: () => openDatabaseSafetyCenter({ tab: 'prepared', serverId: selectedServer?.id, database: tab.databaseName, sql: tab.sql }) },
    { id: 'indexes', label: 'İndeks danışmanına gönder', icon: Gauge, disabled: !selectedServer || !tab.sql.trim(), onSelect: () => openDatabaseSafetyCenter({ tab: 'indexes', serverId: selectedServer?.id, database: tab.databaseName, sql: tab.sql }) },
    { id: 'favorite', label: isFavorite ? 'Favorilerden kaldır' : 'Favorilere ekle', icon: isFavorite ? StarOff : Star, disabled: !tab.sql.trim(), onSelect: toggleFavorite },
    { id: 'sep', separator: true },
    { id: 'copy', label: 'SQL metnini kopyala', icon: Copy, disabled: !tab.sql.trim(), onSelect: () => navigator.clipboard.writeText(tab.sql) },
    { id: 'duplicate', label: 'Sekmeyi çoğalt', icon: Copy, onSelect: onDuplicate },
    { id: 'clear', label: 'Editörü temizle', icon: Trash2, disabled: !tab.sql, onSelect: () => { onChange({ sql: '', result: null, error: null }); setResultSets([]); } }
  ], tab.databaseName ? `${tab.databaseName} sorgusu` : 'Sunucu geneli sorgu');

  const libraryItems = useMemo(() => {
    const query = librarySearch.trim().toLocaleLowerCase('tr-TR');
    if (library === 'snippets') return SNIPPETS.filter(item => !query || item.title.toLocaleLowerCase('tr-TR').includes(query) || item.sql.toLocaleLowerCase('tr-TR').includes(query)).map(item => ({ ...item, databaseName: tab.databaseName, createdAt: '' }));
    const source = library === 'favorites' ? favorites : history;
    return source.filter(item => !query || item.title.toLocaleLowerCase('tr-TR').includes(query) || item.sql.toLocaleLowerCase('tr-TR').includes(query));
  }, [library, librarySearch, favorites, history, tab.databaseName]);

  return <div className="flex h-full min-h-0 flex-col bg-zinc-950/30">
    <div className="coreor-hide-scrollbar flex min-h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-zinc-800 px-2 py-1">
      <Button size="sm" className="h-7 gap-1.5 text-[11px]" disabled={!selectedServer || !accountId || tab.isRunning || !tab.sql.trim()} onClick={runQuery}>{tab.isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}Çalıştır</Button>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" disabled={!tab.sql.trim()} onClick={() => onChange({ sql: formatSql(tab.sql), updatedAt: new Date().toISOString() })}><Wand2 className="mr-1 h-3.5 w-3.5" />Biçimlendir</Button>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" disabled={!selectedServer || !tab.sql.trim()} onClick={() => openDatabaseSafetyCenter({ tab: 'prepared', serverId: selectedServer?.id, database: tab.databaseName, sql: tab.sql })}><Braces className="mr-1 h-3.5 w-3.5 text-purple-400" />Prepared</Button>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" disabled={!selectedServer || !tab.sql.trim()} onClick={() => openDatabaseSafetyCenter({ tab: 'indexes', serverId: selectedServer?.id, database: tab.databaseName, sql: tab.sql })}><Gauge className="mr-1 h-3.5 w-3.5 text-amber-400" />İndeks</Button>
      <Button variant="ghost" size="icon" className={`h-7 w-7 ${isFavorite ? 'text-amber-300' : ''}`} disabled={!tab.sql.trim()} onClick={toggleFavorite}>{isFavorite ? <Star className="h-3.5 w-3.5 fill-current" /> : <StarOff className="h-3.5 w-3.5" />}</Button>
      <div className="flex items-center gap-0.5 rounded border border-zinc-800 bg-zinc-950 p-0.5"><Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setLibrary(previous => previous === 'snippets' ? null : 'snippets')}><BookOpen className="mr-1 h-3 w-3" />Snippet</Button><Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setLibrary(previous => previous === 'history' ? null : 'history')}><History className="mr-1 h-3 w-3" />Geçmiş</Button><Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setLibrary(previous => previous === 'favorites' ? null : 'favorites')}><Star className="mr-1 h-3 w-3" />Favori</Button></div>
      <div className="w-48 shrink-0"><SearchSelect value={selectedServer?.id || ''} options={serverOptions} onValueChange={serverId => onChange({ serverId: serverId || null, databaseName: null, result: null, error: null })} triggerClassName="h-7 min-h-7 rounded-lg px-2 [&>span]:py-0" showDescriptionInTrigger={false} dropdownMinWidth={440} /></div>
      <div className="w-52 shrink-0"><SearchSelect value={tab.databaseName || ''} options={databaseOptions} onValueChange={databaseName => onChange({ databaseName: databaseName || null, result: null, error: null })} triggerClassName="h-7 min-h-7 rounded-lg px-2 [&>span]:py-0" showDescriptionInTrigger={false} dropdownMinWidth={480} /></div>
      <span className="ml-auto shrink-0 text-[9px] text-zinc-600">{displayShortcut(runShortcut)} çalıştır • Ctrl+Space öneri • {preferences.sqlDryRun ? 'Dry-run açık' : 'Dry-run kapalı'}</span>
    </div>

    <div className={`grid min-h-0 flex-1 ${library ? 'grid-cols-[minmax(0,1fr)_310px]' : 'grid-cols-1'}`}>
      <div className="grid min-h-0 grid-rows-[minmax(150px,.48fr)_minmax(150px,.52fr)]">
        <div className="relative min-h-0 border-b border-zinc-800">
          <SqlEditor
            value={tab.sql}
            placeholder={tab.databaseName ? `${tab.databaseName} veritabanı için SQL yazın…` : 'Sunucu genelinde çalıştırılacak SQL sorgusunu yazın…'}
            onChange={(sql, position) => { onChange({ sql, updatedAt: new Date().toISOString() }); setCursor(position); setSuggestionsOpen(preferences.autocomplete); }}
            onCursorChange={setCursor}
            onContextMenu={editorContextMenu}
            onKeyDown={event => {
              if (shortcutMatches(event, runShortcut)) { event.preventDefault(); runQuery(); return; }
              if (shortcutMatches(event, formatShortcut)) { event.preventDefault(); onChange({ sql: formatSql(tab.sql), updatedAt: new Date().toISOString() }); return; }
              if (suggestions.length && suggestionsOpen) {
                if (event.key === 'ArrowDown') { event.preventDefault(); setSuggestionIndex(previous => (previous + 1) % suggestions.length); return; }
                if (event.key === 'ArrowUp') { event.preventDefault(); setSuggestionIndex(previous => (previous - 1 + suggestions.length) % suggestions.length); return; }
                if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); insertSuggestion(suggestions[suggestionIndex] || suggestions[0]); return; }
                if (event.key === 'Escape') { event.preventDefault(); setSuggestionsOpen(false); return; }
              }
              if ((event.ctrlKey || event.metaKey) && event.code === 'Space') { event.preventDefault(); setSuggestionsOpen(true); }
            }}
          />
          {suggestionsOpen && suggestions.length > 0 && <div className="absolute bottom-3 left-3 z-30 max-h-80 w-[500px] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950/98 p-1 shadow-2xl"><div className="flex items-center gap-2 border-b border-zinc-800 px-2 py-1.5 text-[9px] text-zinc-600"><Sparkles className="h-3 w-3" />SQL, veritabanı, tablo ve kolon önerileri<span className="ml-auto">Tab/Enter</span></div>{suggestions.map((suggestion, index) => <button key={suggestion.id} type="button" onMouseDown={event => { event.preventDefault(); insertSuggestion(suggestion); }} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${index === suggestionIndex ? 'bg-cyan-500/15 text-cyan-100' : 'hover:bg-zinc-900'}`}>{suggestionIcon(suggestion.kind)}<span className="min-w-0 flex-1 truncate font-mono text-[10px]">{suggestion.label}</span><span className="max-w-48 truncate text-[9px] text-zinc-600">{suggestion.detail}</span></button>)}</div>}
        </div>

        <div className="flex min-h-0 flex-col bg-black/20">
          <div className="coreor-hide-scrollbar flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-800 px-2"><Terminal className="mr-1 h-3.5 w-3.5 text-zinc-500" />{resultSets.length ? resultSets.map(result => <button key={result.id} type="button" onClick={() => setActiveResultId(result.id)} className={`flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[9px] ${activeResult?.id === result.id ? 'bg-cyan-500/12 text-cyan-200' : 'text-zinc-500 hover:bg-white/[0.04]'}`}>{result.error ? <XCircle className="h-3 w-3 text-red-400" /> : <ShieldCheck className="h-3 w-3 text-emerald-400" />}{result.title}<span className="text-[8px] text-zinc-700">{result.durationMs} ms</span></button>) : <span className="text-[10px] text-zinc-500">Sonuç</span>}{tab.isRunning && <span className="ml-auto text-[9px] text-cyan-400">Çalıştırılıyor…</span>}</div>
          {activeResult?.error ? <div className="m-3 rounded border border-red-500/30 bg-red-500/10 p-3 font-mono text-[11px] text-red-300">{activeResult.error}</div> : activeResult?.result?.rows?.length ? <ScrollArea className="min-h-0 flex-1"><div className="min-w-max"><Table size="sm" columnStorageKey={`query-result:${tab.id}:${activeResult.id}:${resultColumns.join('|')}`}><TableHeader><TableRow>{resultColumns.map(column => <TableHead key={column} columnKey={column} className="sticky top-0 z-10 h-8 whitespace-nowrap border bg-zinc-950 px-2 text-[10px]">{column}</TableHead>)}</TableRow></TableHeader><TableBody>{activeResult.result.rows.map((row, rowIndex) => <TableRow key={rowIndex}>{resultColumns.map(column => { const text = valueText(row[column]); return <TableCell key={column} className="truncate whitespace-nowrap border px-2 py-1 font-mono text-[11px] text-zinc-300" title={text}>{text}</TableCell>; })}</TableRow>)}</TableBody></Table></div></ScrollArea> : activeResult?.result ? <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">{typeof activeResult.result.affectedRows === 'number' ? `${activeResult.result.affectedRows.toLocaleString('tr-TR')} satır etkilendi.` : 'Sorgu tamamlandı.'}</div> : tab.error ? <div className="m-3 rounded border border-amber-500/25 bg-amber-500/10 p-3 text-[10px] text-amber-300">{tab.error}</div> : <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">Sonuçlar burada ayrı sekmelerde gösterilir.</div>}
        </div>
      </div>

      {library && <aside className="flex min-h-0 flex-col border-l border-zinc-800 bg-zinc-950/95"><div className="flex h-10 items-center gap-2 border-b border-zinc-800 px-3"><Search className="h-3.5 w-3.5 text-zinc-600" /><input value={librarySearch} onChange={event => setLibrarySearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[10px] outline-none" placeholder="Kütüphanede ara" /><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLibrary(null)}><XCircle className="h-3.5 w-3.5" /></Button></div><div className="min-h-0 flex-1 overflow-y-auto p-2">{libraryItems.map(item => <button key={item.id} type="button" className="mb-1 w-full rounded-xl border border-zinc-800 bg-black/15 p-3 text-left hover:bg-white/[0.035]" onClick={() => { onChange({ sql: item.sql, databaseName: item.databaseName, result: null, error: null, updatedAt: new Date().toISOString() }); setResultSets([]); setLibrary(null); }}><div className="truncate text-[10px] font-medium">{item.title}</div><div className="mt-1 line-clamp-2 font-mono text-[8px] leading-4 text-zinc-600">{item.sql}</div></button>)}</div></aside>}
    </div>

    <DatabaseActionConfirmModal action={confirmation} onClose={() => setConfirmation(null)} />
    <QueryDryRunModal preview={dryRunPreview} onClose={() => setDryRunPreview(null)} />
  </div>;
}
