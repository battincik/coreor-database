'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Database,
  FileClock,
  History,
  Info,
  GripHorizontal,
  Loader2,
  LockKeyhole,
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
import type { DatabaseQueryExecutionMode, DatabaseServerConfig, EditorQueryTab, QueryExecutionResult, TableInfo } from 'types';
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
import { toSqlLiteral } from '@/lib/queryWorkspaceEvents';
import { matchesShortcut } from '@/lib/shortcuts';
import { approvalRequests, automationId, migrationDrafts, schemaSnapshots } from '@/lib/databaseAutomation';
import { analyzeSqlDocument, type SqlDiagnostic } from '@/lib/sqlLanguageServer';
import { useCoreorToast } from '@/components/ui/coreor-toast';
import { migrateLegacyWorkspaceCollection, readWorkspaceCollection, writeWorkspaceCollection } from '@/lib/nativeWorkspaceStore';
import { useLanguage } from '@/context/LanguageContext';

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
const RESULT_HEIGHT_KEY = 'coreor:query-result-height:v1';
const SQL_KEYWORDS = ['SELECT','DISTINCT','FROM','WHERE','AND','OR','NOT','NULL','JOIN','LEFT JOIN','RIGHT JOIN','ON','GROUP BY','HAVING','ORDER BY','ASC','DESC','LIMIT','OFFSET','TOP','INSERT INTO','VALUES','UPDATE','SET','DELETE FROM','CREATE TABLE','ALTER TABLE','DROP TABLE','TRUNCATE TABLE','CREATE INDEX','UNIQUE','COUNT','SUM','AVG','MIN','MAX','CASE','WHEN','THEN','ELSE','END','AS','IN','BETWEEN','LIKE','EXISTS','UNION','WITH','EXPLAIN','SHOW TABLES','SHOW CREATE TABLE','DESCRIBE','COMMIT','ROLLBACK'];

function createId(prefix = 'query') { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function valueText(value: unknown) {
  if (value === null) return '(NULL)';
  if (value === undefined) return '';
  if (value && typeof value === 'object') {
    const binary = value as { type?: unknown; base64?: unknown };
    if (binary.type === 'binary' && typeof binary.base64 === 'string') {
      try {
        const bytes = Uint8Array.from(atob(binary.base64), character => character.charCodeAt(0));
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch { return JSON.stringify(value); }
    }
    return JSON.stringify(value);
  }
  return String(value);
}
function writeStored(key: string, values: StoredQuery[]) {
  const collection = key === HISTORY_KEY ? 'query-history' : 'query-favorites';
  void writeWorkspaceCollection(collection, 'global', values.slice(0, MAX_HISTORY));
}
function queryTitle(sql: string) { const text = sql.replace(/\s+/g, ' ').trim(); return text.length > 72 ? `${text.slice(0, 72)}…` : text || 'SQL'; }
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

function locateStatements(sql: string, statements: string[]) {
  let searchFrom = 0;
  return statements.map(statement => {
    const index = sql.indexOf(statement, searchFrom);
    if (index < 0) return { startLine: undefined as number | undefined };
    searchFrom = index + statement.length;
    return { startLine: sql.slice(0, index).split('\n').length };
  });
}

function metadataMutationScope(sql: string, currentDatabase: string | null) {
  const clean = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  const head = clean.slice(0, 180);
  const mutatingVerb = /^(?:CREATE|ALTER|DROP|RENAME)\b/i.test(head);
  const schemaObject = /\b(?:DATABASE|SCHEMA|TABLE|VIEW|INDEX|PROCEDURE|FUNCTION|TRIGGER|EVENT)\b/i.test(head);
  if (!mutatingVerb || !schemaObject) return undefined;
  if (/\b(?:DATABASE|SCHEMA)\b/i.test(head)) return null;
  return currentDatabase;
}

function operationType(sql: string) {
  const clean = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (/^DROP\s+(TABLE|DATABASE)\b/i.test(clean)) return 'drop' as const;
  if (/^TRUNCATE\s+TABLE\b/i.test(clean)) return 'truncate' as const;
  if (/^ALTER\s+TABLE\b/i.test(clean)) return 'production-alter' as const;
  return null;
}

function isWriteStatement(sql: string) {
  const clean = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  return /^(?:INSERT|UPDATE|DELETE|REPLACE|MERGE|ALTER|CREATE|DROP|TRUNCATE|RENAME|GRANT|REVOKE|CALL|EXEC(?:UTE)?|LOAD\s+DATA|LOCK\s+TABLES|UNLOCK\s+TABLES|SET\s+(?:GLOBAL|SESSION)?\s*(?:TRANSACTION|AUTOCOMMIT)|BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\b/i.test(clean);
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
function diagnosticIcon(item: SqlDiagnostic) { return item.severity === 'error' ? <XCircle className="h-3.5 w-3.5 text-red-400"/> : item.severity === 'warning' ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400"/> : <Info className="h-3.5 w-3.5 text-cyan-400"/>; }

export function QueryWorkspace({ tab, servers, accountId, onChange, onDuplicate }: QueryWorkspaceProps) {
  const { openContextMenu } = useAppContextMenu();
  const { t, formatNumber, language } = useLanguage();
  const toast = useCoreorToast();
  const { preferences, setPreferences } = useAppPreferences();
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
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(true);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [resultCollapsed, setResultCollapsed] = useState(false);
  const [resultHeight, setResultHeight] = useState(300);

  const selectedServer = useMemo(() => servers.find(server => server.id === tab.serverId) ?? servers[0] ?? null, [servers, tab.serverId]);
  const databases = selectedServer?.databases || [];
  const selectedDatabase = databases.find(database => database.name === tab.databaseName) || null;
  const engine = selectedServer?.databaseType || 'mysql';
  const supportsProtocolSelection = engine === 'mysql' || engine === 'mariadb' || engine === 'tidb';
  const executionMode: DatabaseQueryExecutionMode = supportsProtocolSelection && tab.executionMode === 'prepared' ? 'prepared' : 'text';
  const token = useMemo(() => cursorToken(tab.sql, cursor), [tab.sql, cursor]);
  const serverOptions = useMemo<SearchSelectOption[]>(() => servers.map(server => ({ value: server.id, label: server.name, description: `${server.host}:${server.port}`, badge: databaseEngineDefinition(server.databaseType).label })), [servers]);
  const databaseOptions = useMemo<SearchSelectOption[]>(() => [{ value: '', label: t('query.serverScope') }, ...databases.map(database => ({ value: database.name, label: database.name, description: t('queryWorkspace.tableCount', { count: formatNumber(database.tableCount) }) }))], [databases, formatNumber, t]);
  const executionModeOptions = useMemo<SearchSelectOption[]>(() => [
    {
      value: 'text',
      label: t('queryWorkspace.executionModeText'),
      description: t('queryWorkspace.executionModeTextDescription'),
      badge: t('queryWorkspace.executionModeDefault')
    },
    {
      value: 'prepared',
      label: t('queryWorkspace.executionModePrepared'),
      description: t('queryWorkspace.executionModePreparedDescription'),
      badge: 'COM_STMT'
    }
  ], [t]);
  const queryLimitOptions = useMemo<SearchSelectOption[]>(() => [100, 250, 500, 1000, 2000, 5000, 10000, 25000, 50000].map(value => ({
    value: String(value),
    label: t('queryWorkspace.resultLimitRows', { count: formatNumber(value) }),
    description: value <= 1000 ? t('queryWorkspace.resultLimitFast') : value <= 5000 ? t('queryWorkspace.resultLimitBalanced') : t('queryWorkspace.resultLimitLarge'),
    badge: value === 5000 ? t('common.default') : undefined
  })), [formatNumber, t]);

  useEffect(() => {
    let cancelled = false;
    const storedHeight = Number(localStorage.getItem(RESULT_HEIGHT_KEY));
    if (Number.isFinite(storedHeight) && storedHeight >= 120) setResultHeight(storedHeight);
    void (async () => {
      await Promise.all([
        migrateLegacyWorkspaceCollection('query-history', 'global', HISTORY_KEY, 'local'),
        migrateLegacyWorkspaceCollection('query-favorites', 'global', FAVORITES_KEY, 'local')
      ]);
      const [storedHistory, storedFavorites] = await Promise.all([
        readWorkspaceCollection<StoredQuery>('query-history', 'global'),
        readWorkspaceCollection<StoredQuery>('query-favorites', 'global')
      ]);
      if (!cancelled) {
        setHistory(storedHistory.slice(0, MAX_HISTORY));
        setFavorites(storedFavorites.slice(0, MAX_HISTORY));
      }
    })().catch(() => {
      if (!cancelled) { setHistory([]); setFavorites([]); }
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { setColumnCache({}); }, [selectedServer?.id, tab.databaseName]);
  useEffect(() => {
    if (!preferences.autocomplete || !selectedServer || !tab.databaseName || !accountId || (!suggestionsOpen && !tab.sql.trim())) return;
    const pendingTables = (selectedDatabase?.tables || []).filter(tableName => !columnCache[tableName]).slice(0, 12);
    if (!pendingTables.length) return;

    let cancelled = false;
    let cursor = 0;
    const poolSize = Math.min(32, Math.max(1, selectedServer.poolMaxConnections ?? 6));
    const workerCount = Math.min(4, Math.max(1, Math.floor(poolSize / 2)), pendingTables.length);
    const worker = async () => {
      while (!cancelled) {
        const index = cursor++;
        const tableName = pendingTables[index];
        if (!tableName) return;
        try {
          const info = await fetchTableInfo(selectedServer.id, tab.databaseName!, tableName, accountId);
          if (!cancelled) setColumnCache(previous => previous[tableName] ? previous : ({ ...previous, [tableName]: info }));
        } catch {
          // Autocomplete prefetch is opportunistic and must never block the editor.
        }
      }
    };
    void Promise.all(Array.from({ length: workerCount }, () => worker()));
    return () => { cancelled = true; };
  }, [preferences.autocomplete, selectedServer, tab.databaseName, accountId, suggestionsOpen, selectedDatabase, columnCache, tab.sql]);

  const diagnostics = useMemo(() => selectedServer ? analyzeSqlDocument(tab.sql, { engine, currentDatabase: tab.databaseName, databases, tableInfo: columnCache }) : [], [tab.sql, engine, tab.databaseName, databases, columnCache, selectedServer]);
  const diagnosticCounts = useMemo(() => ({ errors: diagnostics.filter(item => item.severity === 'error').length, warnings: diagnostics.filter(item => item.severity === 'warning').length, info: diagnostics.filter(item => item.severity === 'info').length }), [diagnostics]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!preferences.autocomplete || !suggestionsOpen || !selectedServer) return [];
    const raw = token.value.replace(/[`"\[\]]/g, ''); const lower = raw.toLocaleLowerCase(language); const upper = raw.toUpperCase(); const quote = (value: string) => quoteDatabaseIdentifier(value, engine); const list: Suggestion[] = [];
    for (const keyword of SQL_KEYWORDS) if (!upper || keyword.startsWith(upper)) list.push({ id: `k:${keyword}`, label: keyword, insertText: keyword, detail: 'SQL', kind: 'keyword' });
    for (const database of databases) if (!lower || database.name.toLocaleLowerCase(language).includes(lower)) list.push({ id: `d:${database.name}`, label: database.name, insertText: quote(database.name), detail: t('queryWorkspace.tableCount', { count: formatNumber(database.tableCount) }), kind: 'database' });
    for (const tableName of selectedDatabase?.tables || []) if (!lower || tableName.toLocaleLowerCase(language).includes(lower)) list.push({ id: `t:${tableName}`, label: tableName, insertText: quote(tableName), detail: tab.databaseName || '', kind: 'table' });
    for (const [tableName, info] of Object.entries(columnCache)) for (const column of info.columns) if (!lower || column.Field.toLocaleLowerCase(language).includes(lower)) list.push({ id: `c:${tableName}:${column.Field}`, label: column.Field, insertText: quote(column.Field), detail: `${tableName} • ${column.Type}`, kind: 'column' });
    return list.slice(0, 36);
  }, [preferences.autocomplete, suggestionsOpen, selectedServer, token.value, engine, databases, selectedDatabase, columnCache, tab.databaseName, language, t, formatNumber]);

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
    schemaSnapshots.add({ id: automationId('snapshot'), serverId: selectedServer.id, databaseName: tab.databaseName, tableName, engine, createdAt: new Date().toISOString(), reason: t('queryWorkspace.snapshotBeforeAlter'), alterSql: statement, createSql, tableInfo });
    migrationDrafts.save({ id: automationId('migration'), serverId: selectedServer.id, databaseName: tab.databaseName, name: `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}_${tableName}_alter`, createdAt: new Date().toISOString(), upSql: `${statement};`, downSql: createSql ? `-- ${t('queryWorkspace.previousCreateDefinition')}\n${createSql}` : t('queryWorkspace.downSqlManual'), source: 'query', status: 'draft' });
  }, [preferences.autoSchemaSnapshots, selectedServer, accountId, tab.databaseName, engine]);

  const requiresApproval = useCallback((statement: string) => {
    const type = operationType(statement); if (!type || !preferences.requireSecondApproval) return false;
    if (type === 'production-alter' && !preferences.productionAlterApproval) return false;
    const approved = approvalRequests.list().find(item => item.serverId === selectedServer?.id && item.databaseName === tab.databaseName && item.sql.trim() === statement.trim() && item.status === 'approved');
    if (approved) { approvalRequests.remove(approved.id); return false; }
    approvalRequests.save({ id: automationId('approval'), serverId: selectedServer?.id || '', databaseName: tab.databaseName, operation: type, sql: statement, requester: 'current-user', createdAt: new Date().toISOString(), status: 'pending' });
    window.dispatchEvent(new CustomEvent('coreor:open-automation-center', { detail: { tab: 'approvals' } }));
    onChange({ error: t('queryWorkspace.sentForApproval'), isRunning: false });
    return true;
  }, [preferences.requireSecondApproval, preferences.productionAlterApproval, selectedServer?.id, tab.databaseName, onChange]);

  const assertWritable = useCallback((statements: string[]) => {
    const write = statements.find(isWriteStatement);
    if (!selectedServer?.readOnly || !write) return true;
    const message = t('queryWorkspace.readOnlyMessage', { server: selectedServer.name });
    onChange({ isRunning: false, error: message });
    toast.show({ variant: 'warning', title: t('queryWorkspace.readOnlyConnection'), description: message, metadata: [{ label: t('queryWorkspace.blockedSql'), value: queryTitle(write) }] });
    return false;
  }, [selectedServer, onChange, toast]);

  const executeStatements = useCallback(async (statements: string[]) => {
    if (!selectedServer || !accountId || !assertWritable(statements)) return;
    onChange({ isRunning: true, error: null, runImmediately: false, serverId: selectedServer.id });
    const sets: ResultSet[] = [];
    const locations = locateStatements(tab.sql, statements);
    let metadataRefreshRequested = false;
    let metadataDatabase: string | null = tab.databaseName;
    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index];
      if (requiresApproval(statement)) return;
      await takeSnapshot(statement);
      try {
        const result = await executeDatabaseQuery(
          selectedServer.id,
          statement,
          accountId,
          tab.databaseName,
          {
            statementStartLine: locations[index]?.startLine,
            statementIndex: index + 1,
            statementCount: statements.length,
            executionMode,
            resultLimit: preferences.queryResultLimit
          }
        );
        sets.push({ id: createId('result'), sql: statement, label: t('queryWorkspace.resultNumber', { number: index + 1 }), result, error: null });
        const refreshScope = metadataMutationScope(statement, tab.databaseName);
        if (refreshScope !== undefined) {
          metadataRefreshRequested = true;
          if (refreshScope === null) metadataDatabase = null;
        }
      } catch (error) {
        sets.push({ id: createId('result'), sql: statement, label: t('queryWorkspace.resultNumber', { number: index + 1 }), result: null, error: error instanceof Error ? error.message : t('queryWorkspace.queryFailed') });
        break;
      }
    }
    setResultSets(sets); setActiveResultId(sets[0]?.id || null);
    if (metadataRefreshRequested) {
      window.dispatchEvent(new CustomEvent('coreor:database-metadata-invalidated', {
        detail: { serverId: selectedServer.id, databaseName: metadataDatabase }
      }));
    }
    const first = sets[0]; onChange({ isRunning: false, error: first?.error || null, result: first?.result || null, updatedAt: new Date().toISOString() });
  }, [selectedServer, accountId, tab.databaseName, tab.sql, executionMode, preferences.queryResultLimit, onChange, requiresApproval, takeSnapshot, assertWritable]);

  const executeNow = useCallback(async (skipDryRun = false) => {
    if (!selectedServer || !accountId || tab.isRunning || !tab.sql.trim()) return;
    const statements = splitStatements(tab.sql); recordHistory(tab.sql);
    if (!assertWritable(statements)) return;
    if (!skipDryRun && preferences.dryRunMutations && statements.length === 1) {
      const mutation = parseMutation(statements[0]);
      if (mutation) {
        onChange({ isRunning: true, error: null });
        try {
          const preview = await executeDatabaseQuery(selectedServer.id, mutation.preview, accountId, tab.databaseName, { executionMode, resultLimit: preferences.queryResultLimit });
          setDryRunPending({ statement: statements[0], preview, table: mutation.table });
          setResultSets([{ id: 'dry-run', sql: mutation.preview, label: t('queryWorkspace.dryRunPreview'), result: preview, error: null, dryRun: true }]); setActiveResultId('dry-run');
          onChange({ isRunning: false, result: preview, error: null });
        } catch (error) { onChange({ isRunning: false, error: error instanceof Error ? error.message : t('queryWorkspace.dryRunFailed') }); }
        return;
      }
    }
    await executeStatements(statements);
  }, [selectedServer, accountId, tab.isRunning, tab.sql, tab.databaseName, executionMode, preferences.dryRunMutations, preferences.queryResultLimit, onChange, recordHistory, executeStatements, assertWritable]);

  const runQuery = useCallback(() => {
    const statements = splitStatements(tab.sql);
    if (!assertWritable(statements)) return;
    const blockingDiagnostics = diagnostics.filter(item => item.severity === 'error' && ['UNTERMINATED_STRING','UNEXPECTED_PAREN','UNCLOSED_PAREN','MISSING_WHERE','ENGINE_SYNTAX'].includes(item.code));
    if (blockingDiagnostics.length) {
      toast.show({ variant: 'error', title: t('query.errorStopped'), description: blockingDiagnostics[0].message, metadata: [{ label: t('notificationCenter.code'), value: blockingDiagnostics[0].code }, { label: t('queryWorkspace.totalErrors'), value: blockingDiagnostics.length }] });
      return;
    }
    const dangerous = statements.some(statement => operationType(statement) || (/^(UPDATE|DELETE)\b/i.test(statement) && !/\bWHERE\b/i.test(statement)));
    if (preferences.confirmDangerousQueries && dangerous) {
      setConfirmation({ title: t('queryWorkspace.safeSqlValidation'), description: t('query.dangerousConfirm'), expectedText: t('queryWorkspace.executeUpper'), sql: tab.sql, confirmLabel: t('queryWorkspace.continueSecurity'), onConfirm: () => void executeNow() }); return;
    }
    void executeNow();
  }, [preferences.confirmDangerousQueries, tab.sql, executeNow, diagnostics, toast, assertWritable]);

  useEffect(() => { if (tab.runImmediately && !autoRunHandled.current) { autoRunHandled.current = true; runQuery(); } }, [tab.runImmediately, runQuery]);
  useEffect(() => { autoRunHandled.current = false; }, [tab.id]);

  const activeSet = resultSets.find(item => item.id === activeResultId) || resultSets[0] || null;
  const activeResult = activeSet?.result || tab.result || null;
  const timings = activeResult?.timings;
  const timingText = (value: number | undefined) => typeof value === 'number'
    ? value.toLocaleString(language, { minimumFractionDigits: value < 10 ? 1 : 0, maximumFractionDigits: 1 })
    : '—';
  const poolTimingTitle = timings?.pool
    ? t('queryWorkspace.timingPoolTitle', {
        total: timings.pool.total,
        idle: timings.pool.idle,
        inUse: timings.pool.inUse,
        waiters: timings.pool.waiters,
        failed: timings.pool.createFailed
      })
    : undefined;
  const columns = activeResult?.fields?.map(field => field.name) || Object.keys(activeResult?.rows?.[0] || {});
  const isFavorite = favorites.some(item => item.sql === tab.sql && item.databaseName === tab.databaseName);
  const toggleFavorite = () => setFavorites(previous => { const next = isFavorite ? previous.filter(item => !(item.sql === tab.sql && item.databaseName === tab.databaseName)) : [{ id: createId(), title: queryTitle(tab.sql), sql: tab.sql, databaseName: tab.databaseName, createdAt: new Date().toISOString() }, ...previous]; writeStored(FAVORITES_KEY, next); return next; });
  const insertSuggestion = (suggestion: Suggestion) => { const next = `${tab.sql.slice(0, token.start)}${suggestion.insertText}${tab.sql.slice(cursor)}`; onChange({ sql: next }); setCursor(token.start + suggestion.insertText.length); setSuggestionsOpen(false); };
  const libraryItems = library === 'history' ? history : favorites;
  const editorContextMenu = (event: React.MouseEvent) => openContextMenu(event, [
    { id: 'run', label: t('query.run'), icon: Play, shortcut: 'runQuery', disabled: !tab.sql.trim() || Boolean(selectedServer?.readOnly && splitStatements(tab.sql).some(isWriteStatement)), onSelect: runQuery },
    { id: 'format', label: t('query.format'), icon: Wand2, shortcut: 'formatSql', disabled: !tab.sql.trim(), onSelect: () => onChange({ sql: formatSql(tab.sql) }) },
    { id: 'explain', label: t('queryWorkspace.prepareExplain'), icon: Search, disabled: !tab.sql.trim() || /^\s*EXPLAIN\b/i.test(tab.sql), onSelect: () => onChange({ sql: `EXPLAIN ${tab.sql.trim()}` }) },
    { id: 'sep-library', separator: true },
    { id: 'favorite', label: isFavorite ? t('queryWorkspace.removeFavorite') : t('queryWorkspace.addFavorite'), icon: isFavorite ? StarOff : Star, disabled: !tab.sql.trim(), onSelect: toggleFavorite },
    { id: 'history', label: t('queryWorkspace.openHistory'), icon: History, onSelect: () => setLibrary('history') },
    { id: 'favorites', label: t('queryWorkspace.openFavorites'), icon: BookOpen, onSelect: () => setLibrary('favorites') },
    { id: 'sep-copy', separator: true },
    { id: 'copy-sql', label: t('queryWorkspace.copyAllSql'), icon: Copy, disabled: !tab.sql.trim(), onSelect: () => navigator.clipboard.writeText(tab.sql) },
    { id: 'copy-db', label: t('queryWorkspace.copyActiveDatabase'), icon: Database, disabled: !tab.databaseName, onSelect: () => navigator.clipboard.writeText(tab.databaseName || '') },
    { id: 'duplicate', label: t('queryWorkspace.duplicateTab'), icon: Copy, onSelect: onDuplicate },
    { id: 'sep-danger', separator: true },
    { id: 'clear-result', label: t('queryWorkspace.clearResult'), icon: XCircle, disabled: !tab.result && !tab.error, onSelect: () => { setResultSets([]); setActiveResultId(null); onChange({ result: null, error: null }); } },
    { id: 'clear', label: t('queryWorkspace.clearEditor'), icon: Trash2, danger: Boolean(tab.sql.trim()), onSelect: () => onChange({ sql: '', result: null, error: null }) }
  ], tab.title);

  const resultCellContextMenu = (event: React.MouseEvent, row: Record<string, unknown>, column: string) => {
    const value = row[column];
    openContextMenu(event, [
      { id: 'copy-value', label: t('queryWorkspace.copyCell'), icon: Copy, onSelect: () => navigator.clipboard.writeText(valueText(value)) },
      { id: 'copy-literal', label: t('queryWorkspace.copyLiteral'), icon: Code2, onSelect: () => navigator.clipboard.writeText(toSqlLiteral(value)) },
      { id: 'copy-column', label: t('queryWorkspace.copyColumn'), icon: Copy, onSelect: () => navigator.clipboard.writeText(column) },
      { id: 'sep-row', separator: true },
      { id: 'copy-row', label: t('queryWorkspace.copyRowJson'), icon: Copy, onSelect: () => navigator.clipboard.writeText(JSON.stringify(row, null, 2)) },
      { id: 'copy-result', label: t('queryWorkspace.copyAllJson'), icon: Copy, disabled: !activeResult?.rows?.length, onSelect: () => navigator.clipboard.writeText(JSON.stringify(activeResult?.rows || [], null, 2)) }
    ], `${column}: ${valueText(value)}`);
  };

  const startResultResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resultCollapsed || !splitRef.current) return;
    event.preventDefault();
    const panel = splitRef.current;
    const move = (pointerEvent: PointerEvent) => {
      const rect = panel.getBoundingClientRect();
      const maxHeight = Math.max(140, rect.height - 160);
      setResultHeight(Math.min(maxHeight, Math.max(140, rect.bottom - pointerEvent.clientY)));
    };
    const stop = (pointerEvent: PointerEvent) => {
      move(pointerEvent);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      const rect = panel.getBoundingClientRect();
      const nextHeight = Math.min(Math.max(140, rect.height - 160), Math.max(140, rect.bottom - pointerEvent.clientY));
      localStorage.setItem(RESULT_HEIGHT_KEY, String(Math.round(nextHeight)));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  return <div className="flex h-full min-h-0 flex-col bg-zinc-950/30">
    <div className="coreor-hide-scrollbar flex min-h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-zinc-800 px-2 py-1">
      <Button size="sm" className="h-7 gap-1.5 text-[11px]" disabled={!selectedServer || !accountId || tab.isRunning || !tab.sql.trim() || Boolean(selectedServer?.readOnly && splitStatements(tab.sql).some(isWriteStatement))} onClick={runQuery}>{tab.isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : selectedServer?.readOnly ? <LockKeyhole className="h-3.5 w-3.5"/> : <Play className="h-3.5 w-3.5"/>}{t('query.run')}</Button>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => onChange({ sql: formatSql(tab.sql) })}><Wand2 className="mr-1 h-3.5 w-3.5"/>{t('query.format')}</Button>
      <Button variant="ghost" size="icon" className={`h-7 w-7 ${isFavorite ? 'text-amber-300' : ''}`} onClick={toggleFavorite}>{isFavorite ? <Star className="h-3.5 w-3.5 fill-current"/> : <StarOff className="h-3.5 w-3.5"/>}</Button>
      <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setLibrary(library === 'history' ? null : 'history')}><History className="mr-1 h-3.5 w-3.5"/>{t('query.history')}</Button>
      <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setLibrary(library === 'favorites' ? null : 'favorites')}><BookOpen className="mr-1 h-3.5 w-3.5"/>{t('query.favorites')}</Button>
      <button type="button" className="flex h-7 items-center gap-1 rounded px-2 text-[9px] text-zinc-500 hover:bg-zinc-900" onClick={() => setDiagnosticsOpen(previous => !previous)}><CheckCircle2 className="h-3.5 w-3.5 text-cyan-400"/>LSP <span className={diagnosticCounts.errors ? 'text-red-400' : 'text-emerald-400'}>{diagnosticCounts.errors}</span>/<span className="text-amber-400">{diagnosticCounts.warnings}</span></button>
      <div className="w-48 shrink-0"><SearchSelect value={selectedServer?.id || ''} options={serverOptions} onValueChange={serverId => onChange({ serverId: serverId || null, databaseName: null, executionMode: 'text', result: null })} triggerClassName="h-7 min-h-7" showDescriptionInTrigger={false}/></div>
      <div className="w-52 shrink-0"><SearchSelect value={tab.databaseName || ''} options={databaseOptions} onValueChange={databaseName => onChange({ databaseName: databaseName || null, result: null })} triggerClassName="h-7 min-h-7" showDescriptionInTrigger={false}/></div>
      {supportsProtocolSelection && <div className="w-44 shrink-0"><SearchSelect value={executionMode} options={executionModeOptions} onValueChange={value => onChange({ executionMode: value === 'prepared' ? 'prepared' : 'text', result: null })} triggerClassName="h-7 min-h-7 font-mono" showDescriptionInTrigger={false}/></div>}
      <div className="w-40 shrink-0"><SearchSelect value={String(preferences.queryResultLimit)} options={queryLimitOptions} onValueChange={value => setPreferences({ queryResultLimit: Number(value) || 5000 })} triggerClassName="h-7 min-h-7 font-mono" showDescriptionInTrigger={false}/></div>
      <span className="ml-auto flex items-center gap-2 text-[9px] text-zinc-600">{selectedServer?.readOnly && <span className="rounded bg-amber-500/10 px-2 py-1 text-amber-300">READ ONLY</span>}<span className={preferences.dryRunMutations ? 'text-emerald-400' : ''}>Dry-run {preferences.dryRunMutations ? t('queryWorkspace.enabled') : t('queryWorkspace.disabled')}</span><span>•</span><span>{preferences.autoSchemaSnapshots ? t('query.snapshotEnabled') : t('queryWorkspace.snapshotOff')}</span></span>
    </div>

    {diagnosticsOpen && diagnostics.length > 0 && <div className="coreor-hide-scrollbar flex max-h-20 shrink-0 gap-2 overflow-x-auto border-b border-zinc-800 bg-black/20 px-2 py-1.5">{diagnostics.slice(0, 12).map(item => <button key={item.id} type="button" className="flex min-w-[260px] max-w-[420px] items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 text-left" title={item.suggestion}><span className="mt-0.5">{diagnosticIcon(item)}</span><span className="min-w-0"><span className="block truncate text-[9px] text-zinc-300">{item.message}</span><span className="mt-0.5 block text-[8px] text-zinc-600">{item.code}{item.suggestion ? ` • ${item.suggestion}` : ''}</span></span></button>)}</div>}

    {dryRunPending && <div className="flex shrink-0 items-center gap-3 border-b border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[10px] text-amber-100"><AlertTriangle className="h-4 w-4"/><div className="min-w-0 flex-1"><b>{t('queryWorkspace.rowsMayBeAffected', { count: formatNumber(dryRunPending.preview.rows.length) })}</b> {t('queryWorkspace.sourceTable', { table: dryRunPending.table })}</div><Button size="sm" className="h-7" disabled={selectedServer?.readOnly} onClick={() => { const statement = dryRunPending.statement; setDryRunPending(null); void executeStatements([statement]); }}><ShieldCheck className="mr-1 h-3.5 w-3.5"/>{t('query.applyChange')}</Button><Button variant="ghost" size="sm" onClick={() => setDryRunPending(null)}>{t('common.cancel')}</Button></div>}

    <div className={`grid min-h-0 flex-1 ${library ? 'grid-cols-[minmax(0,1fr)_300px]' : 'grid-cols-1'}`}>
      <div ref={splitRef} className="flex min-h-0 flex-col">
        <div className="relative min-h-[160px] flex-1"><SqlEditor value={tab.sql} onChange={(sql, position) => { onChange({ sql }); setCursor(position); setSuggestionsOpen(preferences.autocomplete); setSuggestionIndex(0); }} onCursorChange={setCursor} onContextMenu={editorContextMenu} onKeyDown={event => { if (matchesShortcut(event, 'runQuery')) { event.preventDefault(); runQuery(); } else if (matchesShortcut(event, 'formatSql')) { event.preventDefault(); onChange({ sql: formatSql(tab.sql) }); } else if (suggestionsOpen && suggestions.length && (event.key === 'Enter' || event.key === 'Tab')) { event.preventDefault(); insertSuggestion(suggestions[suggestionIndex] || suggestions[0]); } else if (suggestionsOpen && event.key === 'ArrowDown') { event.preventDefault(); setSuggestionIndex(value => (value + 1) % suggestions.length); } else if (suggestionsOpen && event.key === 'ArrowUp') { event.preventDefault(); setSuggestionIndex(value => (value - 1 + suggestions.length) % suggestions.length); } else if (event.key === 'Escape') setSuggestionsOpen(false); }}/>
          {suggestionsOpen && suggestions.length > 0 && <div className="absolute bottom-3 left-3 z-30 max-h-80 w-[500px] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-1 shadow-2xl">{suggestions.map((suggestion, index) => <button key={suggestion.id} onMouseDown={event => { event.preventDefault(); insertSuggestion(suggestion); }} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${index === suggestionIndex ? 'bg-cyan-500/15' : 'hover:bg-zinc-900'}`}>{suggestionIcon(suggestion.kind)}<span className="min-w-0 flex-1 truncate font-mono text-[10px]">{suggestion.label}</span><span className="text-[9px] text-zinc-600">{suggestion.detail}</span></button>)}</div>}
        </div>
        <div className="flex min-h-0 shrink-0 flex-col border-t border-zinc-800 bg-black/20" style={{ height: resultCollapsed ? 36 : resultHeight }}>
          {!resultCollapsed && <div role="separator" aria-orientation="horizontal" aria-label={t('queryWorkspace.resizeResults')} className="group flex h-1.5 shrink-0 cursor-row-resize touch-none items-center justify-center bg-zinc-950 hover:bg-cyan-500/10" onPointerDown={startResultResize}><GripHorizontal className="h-3 w-3 text-zinc-800 transition group-hover:text-cyan-500" /></div>}
          <div className="coreor-hide-scrollbar flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-800 px-2 text-[10px] text-zinc-500"><Terminal className="h-3.5 w-3.5"/>{resultSets.length > 1 ? resultSets.map(item => <button key={item.id} onClick={() => setActiveResultId(item.id)} className={`rounded px-2 py-1 ${activeSet?.id === item.id ? 'bg-cyan-500/10 text-cyan-300' : 'hover:bg-zinc-900'}`}>{item.label}{item.error ? ` • ${t('common.error')}` : item.dryRun ? ` ${t('queryWorkspace.preview')}` : ''}</button>) : <span>{activeSet?.dryRun ? t('queryWorkspace.dryRunResult') : t('queryWorkspace.result')}</span>}{timings && <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[9px] text-zinc-600">
            <span title={t('queryWorkspace.timingQueryDescription')}>{t('queryWorkspace.timingQuery')} <b className="font-medium text-zinc-400">{timingText(timings.queryRoundTripMs)} ms</b></span>
            <span>•</span>
            <span>{t('queryWorkspace.timingFetch')} <b className="font-medium text-zinc-400">{timingText(timings.fetchDecodeMs)} ms</b></span>
            <span>•</span>
            <span title={poolTimingTitle}>{t('queryWorkspace.timingAcquire')} <b className="font-medium text-zinc-400">{timingText(timings.acquireMs)} ms</b>{timings.pooled ? <em className="ml-1 not-italic text-cyan-500/80">{timings.poolReused ? t('queryWorkspace.timingReused') : t('queryWorkspace.timingNew')}</em> : null}</span>
            <span>•</span>
            <span>{t('queryWorkspace.timingClient')} <b className="font-medium text-zinc-400">{timingText(timings.clientOverheadMs)} ms</b></span>
            <span>•</span>
            <span>{t('queryWorkspace.timingTotal')} <b className="font-medium text-zinc-300">{timingText(timings.totalMs)} ms</b></span>
            {timings.pool && <><span>•</span><span title={poolTimingTitle}>{t('queryWorkspace.timingConnections')} <b className="font-medium text-zinc-400">{timings.pool.inUse}/{timings.pool.total}</b></span></>}
          </span>}<span className={`${timings ? '' : 'ml-auto '}shrink-0`}>{t('queryWorkspace.rowsCount',{count:formatNumber(activeResult?.rows?.length || 0)})}</span><button type="button" className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" onClick={() => setResultCollapsed(previous => !previous)} title={resultCollapsed ? t('queryWorkspace.openResults') : t('queryWorkspace.collapseResultsFully')} aria-label={resultCollapsed ? t('queryWorkspace.openResults') : t('queryWorkspace.collapseResults')}>{resultCollapsed ? <ChevronUp className="h-3.5 w-3.5"/> : <ChevronDown className="h-3.5 w-3.5"/>}</button></div>
          {!resultCollapsed && (activeSet?.error || tab.error ? <div className="m-3 rounded border border-red-500/30 bg-red-500/10 p-3 font-mono text-[11px] text-red-300">{activeSet?.error || tab.error}</div> : activeResult?.rows?.length ? <ScrollArea className="min-h-0 flex-1"><div className="min-w-max"><Table size="sm" columnStorageKey={`query-result:${tab.id}:${columns.join('|')}`}><TableHeader><TableRow>{columns.map(column => <TableHead key={column} columnKey={column} className="sticky top-0 z-10 border bg-zinc-950">{column}</TableHead>)}</TableRow></TableHeader><TableBody>{activeResult.rows.map((row, rowIndex) => <TableRow key={rowIndex}>{columns.map(column => <TableCell key={column} className="truncate border font-mono text-[11px]" title={valueText(row[column])} onContextMenu={event => resultCellContextMenu(event, row, column)}>{valueText(row[column])}</TableCell>)}</TableRow>)}</TableBody></Table></div></ScrollArea> : activeResult ? <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">{typeof activeResult.affectedRows === 'number' ? t('query.affectedRows',{count:formatNumber(activeResult.affectedRows)}) : t('query.completed')}</div> : <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">{t('queryWorkspace.resultsHere')}</div>)}
        </div>
      </div>
      {library && <aside className="min-h-0 overflow-y-auto border-l border-zinc-800 p-2">{libraryItems.map(item => <button key={item.id} className="mb-1 w-full rounded-xl border border-zinc-800 p-3 text-left" onClick={() => { onChange({ sql: item.sql, databaseName: item.databaseName }); setLibrary(null); }}><div className="truncate text-[10px] font-medium">{item.title}</div><div className="mt-1 line-clamp-2 font-mono text-[8px] text-zinc-600">{item.sql}</div></button>)}</aside>}
    </div>
    <DatabaseActionConfirmModal action={confirmation} onClose={() => setConfirmation(null)}/>
  </div>;
}
