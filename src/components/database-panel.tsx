/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Code,
  Copy,
  Database,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  Table as TableIcon,
  Trash2,
  X
} from 'lucide-react';
import type { DatabasePanelProps, EditorQueryTab, TableForeignKeyInfo } from 'types';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useDesktop } from '@/context/DesktopContext';
import { fetchServerTables, fetchTableInfo } from '@/lib/databaseApi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { CoreorInputModal } from '@/components/ui/coreor-input-modal';
import { useAppPreferences } from '@/lib/appPreferences';
import { EmptyState, ErrorState, LoadingState } from '@/components/app-state';
import { DatabaseCatalogView } from '@/components/database-catalog-view';
import { DatabaseSchemaGraph } from '@/components/database-schema-graph';
import { TableSchemaEditor } from '@/components/table-schema-editor';
import { TableDataView } from '@/components/table-data-view';
import { QueryWorkspace } from '@/components/query-workspace';
import { useAppContextMenu } from '@/components/app-context-menu';
import { migrateLegacyWorkspaceCollection, readWorkspaceCollection, writeWorkspaceCollection } from '@/lib/nativeWorkspaceStore';
import {
  OPEN_QUERY_TAB_EVENT,
  qualifiedSqlName,
  quoteSqlIdentifier,
  toSqlLiteral,
  type OpenQueryTabDetail
} from '@/lib/queryWorkspaceEvents';

const QUERY_TABS_STORAGE_KEY = 'coreor:query-tabs:v2';
const QUERY_ACTIVE_TAB_STORAGE_KEY = 'coreor:query-active-tab:v2';
const LEGACY_QUERY_TABS_STORAGE_KEY = 'coreor:query-tabs:v1';
type TableView = 'data' | 'structure';

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeQueryTabs(items: unknown[]): EditorQueryTab[] {
  return items.slice(-20).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const value = item as Partial<EditorQueryTab>;
    const now = new Date().toISOString();
    return [{
      id: String(value.id || createId('query')),
      title: String(value.title || 'Sorgu'),
      serverId: typeof value.serverId === 'string' ? value.serverId : null,
      databaseName: typeof value.databaseName === 'string' ? value.databaseName : null,
      sql: String(value.sql || ''),
      isRunning: false,
      error: typeof value.error === 'string' ? value.error : null,
      result: value.result && typeof value.result === 'object' ? value.result : null,
      createdAt: String(value.createdAt || now),
      updatedAt: String(value.updatedAt || now)
    }];
  });
}

function serializableQueryTabs(tabs: EditorQueryTab[]) {
  return tabs.slice(-20).map(tab => ({
    ...tab,
    isRunning: false,
    runImmediately: false,
    result: tab.result ? {
      ...tab.result,
      rows: tab.result.rows.slice(0, 250),
      maximumRows: tab.result.maximumRows ?? tab.result.rows.length
    } : null
  }));
}

export function DatabasePanel({
  selectedDatabase,
  selectedTable,
  activeTab,
  setActiveTab,
  onDatabaseSelect,
  onTableSelect
}: DatabasePanelProps) {
  const {
    databases,
    setDatabases,
    tableInfo,
    setTableInfo,
    servers,
    activeServerId,
    loadServers,
    isServersLoading,
    serversError
  } = useContext(DatabaseContext)!;
  const { workspaceKey } = useDesktop();
  const { openContextMenu } = useAppContextMenu();
  const { preferences } = useAppPreferences();
  const activeServer = useMemo(() => servers.find(server => server.id === activeServerId) ?? null, [servers, activeServerId]);

  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [tableInfoLoading, setTableInfoLoading] = useState(false);
  const [tableInfoError, setTableInfoError] = useState<string | null>(null);
  const [queryTabs, setQueryTabs] = useState<EditorQueryTab[]>([]);
  const [renameQueryTab, setRenameQueryTab] = useState<EditorQueryTab | null>(null);
  const [pendingInsertTarget, setPendingInsertTarget] = useState<{ databaseName: string; tableName: string } | null>(null);
  const queryTabsHydrated = useRef(false);
  const lastTableView = useRef<TableView>('data');

  useEffect(() => {
    if (activeTab === 'table-data') lastTableView.current = 'data';
    if (activeTab === 'table') lastTableView.current = 'structure';
  }, [activeTab]);

  const createQueryTab = useCallback((detail: OpenQueryTabDetail = {}) => {
    const now = new Date().toISOString();
    const id = createId('query');
    const databaseName = detail.databaseName === undefined ? selectedDatabase : detail.databaseName;
    const serverId = detail.serverId || activeServerId || servers[0]?.id || null;
    const tab: EditorQueryTab = {
      id,
      title: detail.title || (databaseName ? `${databaseName} sorgu` : 'Genel sorgu'),
      serverId,
      databaseName: databaseName || null,
      sql: detail.sql || '',
      isRunning: false,
      runImmediately: detail.runImmediately,
      error: null,
      result: null,
      createdAt: now,
      updatedAt: now
    };
    setQueryTabs(previous => [...previous.slice(-19), tab]);
    setActiveTab(`query:${id}`);
    return id;
  }, [selectedDatabase, activeServerId, servers, setActiveTab]);

  const updateQueryTab = useCallback((id: string, patch: Partial<EditorQueryTab>) => {
    setQueryTabs(previous => previous.map(tab => tab.id === id ? { ...tab, ...patch } : tab));
  }, []);

  const closeQueryTab = useCallback((id: string) => {
    const index = queryTabs.findIndex(tab => tab.id === id);
    const nextTabs = queryTabs.filter(tab => tab.id !== id);
    setQueryTabs(nextTabs);
    if (activeTab === `query:${id}`) {
      const fallback = nextTabs[Math.max(0, index - 1)];
      if (fallback) setActiveTab(`query:${fallback.id}`);
      else if (selectedTable) setActiveTab(lastTableView.current === 'data' ? 'table-data' : 'table');
      else if (selectedDatabase) setActiveTab('database');
      else setActiveTab('sql-editor');
    }
  }, [queryTabs, activeTab, selectedTable, selectedDatabase, setActiveTab]);

  const duplicateQueryTab = useCallback((tab: EditorQueryTab) => {
    createQueryTab({ serverId: tab.serverId, databaseName: tab.databaseName, title: `${tab.title} kopya`, sql: tab.sql });
  }, [createQueryTab]);

  useEffect(() => {
    const close = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id) closeQueryTab(id);
    };
    const duplicate = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      const tab = queryTabs.find(item => item.id === id);
      if (tab) duplicateQueryTab(tab);
    };
    window.addEventListener('coreor:close-query-tab', close);
    window.addEventListener('coreor:duplicate-query-tab', duplicate);
    return () => {
      window.removeEventListener('coreor:close-query-tab', close);
      window.removeEventListener('coreor:duplicate-query-tab', duplicate);
    };
  }, [queryTabs, closeQueryTab, duplicateQueryTab]);

  const queryTabContextMenu = (event: React.MouseEvent, tab: EditorQueryTab) => {
    const index = queryTabs.findIndex(item => item.id === tab.id);
    openContextMenu(event, [
      { id: 'activate', label: 'Sekmeye geç', icon: Code, onSelect: () => setActiveTab(`query:${tab.id}`) },
      { id: 'rename', label: 'Sorguyu adlandır', icon: Pencil, onSelect: () => setRenameQueryTab(tab) },
      { id: 'duplicate', label: 'Sekmeyi çoğalt', icon: Copy, shortcut: 'duplicateTab', onSelect: () => duplicateQueryTab(tab) },
      { id: 'new-same-db', label: 'Aynı veritabanında yeni sorgu', icon: Plus, onSelect: () => createQueryTab({ serverId: tab.serverId, databaseName: tab.databaseName }) },
      { id: 'sep-copy', separator: true },
      { id: 'copy-sql', label: 'SQL’i kopyala', icon: Copy, disabled: !tab.sql.trim(), onSelect: () => navigator.clipboard.writeText(tab.sql) },
      { id: 'copy-db', label: 'Veritabanı adını kopyala', icon: Database, disabled: !tab.databaseName, onSelect: () => navigator.clipboard.writeText(tab.databaseName || '') },
      { id: 'sep-close', separator: true },
      { id: 'close', label: 'Sekmeyi kapat', icon: X, shortcut: 'closeTab', onSelect: () => closeQueryTab(tab.id) },
      { id: 'close-others', label: 'Diğer sorgu sekmelerini kapat', icon: X, disabled: queryTabs.length < 2, onSelect: () => { setQueryTabs([tab]); setActiveTab(`query:${tab.id}`); } },
      { id: 'close-right', label: 'Sağdaki sorgu sekmelerini kapat', icon: X, disabled: index < 0 || index === queryTabs.length - 1, onSelect: () => setQueryTabs(previous => previous.slice(0, index + 1)) },
      { id: 'close-all', label: 'Tüm sorgu sekmelerini kapat', icon: Trash2, danger: true, disabled: !queryTabs.length, onSelect: () => { setQueryTabs([]); if (selectedTable) setActiveTab(lastTableView.current === 'data' ? 'table-data' : 'table'); else if (selectedDatabase) setActiveTab('database'); else setActiveTab('sql-editor'); } }
    ], tab.title);
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (preferences.rememberQueryWorkspace) {
        await migrateLegacyWorkspaceCollection<EditorQueryTab>(
          'query-tabs',
          'global',
          QUERY_TABS_STORAGE_KEY,
          'local',
          normalizeQueryTabs
        );
        await migrateLegacyWorkspaceCollection<EditorQueryTab>(
          'query-tabs',
          'global',
          LEGACY_QUERY_TABS_STORAGE_KEY,
          'session',
          normalizeQueryTabs
        );
        const restored = normalizeQueryTabs(await readWorkspaceCollection<EditorQueryTab>('query-tabs', 'global'));
        if (!cancelled) {
          setQueryTabs(restored);
          const storedActiveTab = window.localStorage.getItem(QUERY_ACTIVE_TAB_STORAGE_KEY);
          if (storedActiveTab && restored.some(tab => `query:${tab.id}` === storedActiveTab)) setActiveTab(storedActiveTab);
        }
      }
      if (!cancelled) queryTabsHydrated.current = true;
    })().catch(error => {
      console.error('Native query workspace yüklenemedi:', error);
      if (!cancelled) queryTabsHydrated.current = true;
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!queryTabsHydrated.current) return;
    if (!preferences.rememberQueryWorkspace) {
      void writeWorkspaceCollection<EditorQueryTab>('query-tabs', 'global', []);
      window.localStorage.removeItem(QUERY_TABS_STORAGE_KEY);
      window.sessionStorage.removeItem(LEGACY_QUERY_TABS_STORAGE_KEY);
      window.localStorage.removeItem(QUERY_ACTIVE_TAB_STORAGE_KEY);
      return;
    }

    const timer = window.setTimeout(() => {
      void writeWorkspaceCollection('query-tabs', 'global', serializableQueryTabs(queryTabs));
      try {
        if (activeTab.startsWith('query:')) window.localStorage.setItem(QUERY_ACTIVE_TAB_STORAGE_KEY, activeTab);
        else window.localStorage.removeItem(QUERY_ACTIVE_TAB_STORAGE_KEY);
      } catch { /* active tab persistence is optional */ }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [queryTabs, activeTab, preferences.rememberQueryWorkspace]);

  useEffect(() => {
    const handler = (event: Event) => createQueryTab((event as CustomEvent<OpenQueryTabDetail>).detail || {});
    window.addEventListener(OPEN_QUERY_TAB_EVENT, handler);
    return () => window.removeEventListener(OPEN_QUERY_TAB_EVENT, handler);
  }, [createQueryTab]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ databaseName: string; tableName: string }>).detail;
      if (!detail?.databaseName || !detail?.tableName) return;
      setPendingInsertTarget(detail);
      if (selectedDatabase !== detail.databaseName) onDatabaseSelect(detail.databaseName);
      onTableSelect(detail.tableName);
      setActiveTab('table-data');
    };
    window.addEventListener('coreor:request-insert-table-row', handler);
    return () => window.removeEventListener('coreor:request-insert-table-row', handler);
  }, [selectedDatabase, onDatabaseSelect, onTableSelect, setActiveTab]);

  const loadCatalog = useCallback(async () => {
    if (!activeServerId || !workspaceKey || catalogLoading) return;
    setCatalogLoading(true); setCatalogError(null);
    try {
      const response = await fetchServerTables(activeServerId, workspaceKey);
      setDatabases(response.databases || []);
      await loadServers();
    } catch (error) {
      const code = (error as Error & { code?: string }).code;
      if (code !== 'REQUEST_SUPERSEDED') setCatalogError(error instanceof Error ? error.message : 'Veritabanı kataloğu yüklenemedi.');
    } finally { setCatalogLoading(false); }
  }, [activeServerId, workspaceKey, catalogLoading, setDatabases, loadServers]);

  useEffect(() => {
    const server = servers.find(item => item.id === activeServerId) ?? null;
    const cached = server?.databases || [];
    setDatabases(cached);
    setCatalogError(null);
    if (server && cached.length === 0 && workspaceKey) void loadCatalog();
  }, [activeServerId, workspaceKey]);

  const loadSelectedTableInfo = useCallback(async () => {
    if (!selectedDatabase || !selectedTable || !activeServerId || !workspaceKey) {
      setTableInfo(null);
      return;
    }
    setTableInfoLoading(true); setTableInfoError(null);
    try { setTableInfo(await fetchTableInfo(activeServerId, selectedDatabase, selectedTable, workspaceKey)); }
    catch (error) {
      const code = (error as Error & { code?: string }).code;
      if (code !== 'REQUEST_SUPERSEDED') setTableInfoError(error instanceof Error ? error.message : 'Tablo yapısı yüklenemedi.');
    } finally { setTableInfoLoading(false); }
  }, [selectedDatabase, selectedTable, activeServerId, workspaceKey, setTableInfo]);

  useEffect(() => {
    setTableInfo(null); setTableInfoError(null); void loadSelectedTableInfo();
  }, [selectedDatabase, selectedTable, activeServerId, workspaceKey]);

  useEffect(() => {
    if (!pendingInsertTarget || activeTab !== 'table-data' || !tableInfo) return;
    if (selectedDatabase !== pendingInsertTarget.databaseName || selectedTable !== pendingInsertTarget.tableName) return;
    window.dispatchEvent(new CustomEvent('coreor:insert-table-row', { detail: pendingInsertTarget }));
    setPendingInsertTarget(null);
  }, [pendingInsertTarget, activeTab, tableInfo, selectedDatabase, selectedTable]);

  useEffect(() => {
    const refreshActiveView = () => {
      if (activeTab === 'table' && selectedTable) void loadSelectedTableInfo();
      else if (activeTab === 'database' || activeTab === 'sql-editor') void loadCatalog();
      else if (activeTab === 'table-data') window.dispatchEvent(new Event('coreor:refresh-table-data'));
    };
    window.addEventListener('coreor:refresh-active-view', refreshActiveView);
    return () => window.removeEventListener('coreor:refresh-active-view', refreshActiveView);
  }, [activeTab, loadCatalog, loadSelectedTableInfo, selectedTable]);

  const handleDatabaseSelect = (databaseName: string) => {
    onDatabaseSelect(databaseName);
    onTableSelect(null);
    setActiveTab('database');
  };

  const handleTableSelect = (databaseName: string, tableName: string, explicitView?: TableView) => {
    const view = explicitView || lastTableView.current;
    if (selectedDatabase !== databaseName) onDatabaseSelect(databaseName);
    onTableSelect(tableName);
    setActiveTab(view === 'data' ? 'table-data' : 'table');
  };

  const openDatabaseMenu = (event: React.MouseEvent, databaseName: string) => {
    openContextMenu(event, [
      { id: 'open', label: 'Veritabanını aç', icon: Database, onSelect: () => handleDatabaseSelect(databaseName) },
      { id: 'graph', label: 'Şema grafiğini aç', icon: Network, onSelect: () => { if (selectedDatabase !== databaseName) onDatabaseSelect(databaseName); onTableSelect(null); setActiveTab('schema-graph'); } },
      { id: 'query', label: 'Yeni sorgu sekmesi', icon: Code, onSelect: () => { createQueryTab({ databaseName, title: `${databaseName} sorgu` }); } },
      { id: 'show-tables', label: 'SHOW FULL TABLES', icon: TableIcon, onSelect: () => { createQueryTab({ databaseName, title: `${databaseName} tabloları`, sql: 'SHOW FULL TABLES;', runImmediately: true }); } },
      { id: 'size', label: 'Tablo boyutlarını sorgula', icon: Search, onSelect: () => createQueryTab({
        databaseName,
        title: `${databaseName} boyutları`,
        sql: `SELECT TABLE_NAME, ENGINE, TABLE_ROWS, ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS size_mb\nFROM information_schema.TABLES\nWHERE TABLE_SCHEMA = ${toSqlLiteral(databaseName)}\nORDER BY DATA_LENGTH + INDEX_LENGTH DESC;`,
        runImmediately: true
      }) },
      { id: 'objects', label: 'Şema nesnelerini incele', icon: Search, children: [
        { id: 'objects-tables', label: 'Tablo ve view listesi', icon: TableIcon, onSelect: () => createQueryTab({ databaseName, title: `${databaseName} nesneleri`, sql: `SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS, TABLE_COMMENT\nFROM information_schema.TABLES\nWHERE TABLE_SCHEMA = ${toSqlLiteral(databaseName)}\nORDER BY TABLE_TYPE, TABLE_NAME;`, runImmediately: true }) },
        { id: 'objects-fk', label: 'Foreign key listesi', icon: Network, onSelect: () => createQueryTab({ databaseName, title: `${databaseName} foreign keys`, sql: `SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME\nFROM information_schema.KEY_COLUMN_USAGE\nWHERE TABLE_SCHEMA = ${toSqlLiteral(databaseName)} AND REFERENCED_TABLE_NAME IS NOT NULL\nORDER BY TABLE_NAME, CONSTRAINT_NAME;`, runImmediately: true }) }
      ] },
      { id: 'sep', separator: true },
      { id: 'copy', label: 'Veritabanı adını kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(databaseName) },
      { id: 'copy-quoted', label: 'Quoted veritabanı adını kopyala', icon: Code, onSelect: () => navigator.clipboard.writeText(quoteSqlIdentifier(databaseName)) },
      { id: 'refresh', label: 'Kataloğu yenile', icon: RefreshCw, onSelect: () => void loadCatalog() }
    ], databaseName);
  };

  const openTableMenu = (event: React.MouseEvent, databaseName: string, tableName: string) => {
    const table = qualifiedSqlName(databaseName, tableName);
    openContextMenu(event, [
      { id: 'data', label: 'Verileri aç', icon: TableIcon, onSelect: () => handleTableSelect(databaseName, tableName, 'data') },
      { id: 'structure', label: 'Yapıyı aç', icon: Database, onSelect: () => handleTableSelect(databaseName, tableName, 'structure') },
      { id: 'sep-1', separator: true },
      { id: 'select', label: 'Satırları sorgula', icon: Search, children: [
        { id: 'select-10', label: 'İlk 10 satır', icon: Search, onSelect: () => createQueryTab({ databaseName, title: `${tableName} SELECT 10`, sql: `SELECT * FROM ${table}\nLIMIT 10;`, runImmediately: true }) },
        { id: 'select-100', label: 'İlk 100 satır', icon: Search, onSelect: () => createQueryTab({ databaseName, title: `${tableName} SELECT`, sql: `SELECT * FROM ${table}\nLIMIT 100;`, runImmediately: true }) },
        { id: 'select-1000', label: 'İlk 1.000 satır', icon: Search, onSelect: () => createQueryTab({ databaseName, title: `${tableName} SELECT 1000`, sql: `SELECT * FROM ${table}\nLIMIT 1000;`, runImmediately: true }) }
      ] },
      { id: 'count', label: 'Satır sayısını sorgula', icon: Search, onSelect: () => { createQueryTab({ databaseName, title: `${tableName} COUNT`, sql: `SELECT COUNT(*) AS totalRows FROM ${table};`, runImmediately: true }); } },
      { id: 'inspect', label: 'Tablo metadata', icon: Code, children: [
        { id: 'describe', label: 'DESCRIBE çalıştır', icon: Code, onSelect: () => createQueryTab({ databaseName, title: `${tableName} DESCRIBE`, sql: `DESCRIBE ${table};`, runImmediately: true }) },
        { id: 'show-create', label: 'SHOW CREATE TABLE', icon: Code, onSelect: () => createQueryTab({ databaseName, title: `${tableName} CREATE`, sql: `SHOW CREATE TABLE ${table};`, runImmediately: true }) },
        { id: 'indexes', label: 'İndeksleri göster', icon: Search, onSelect: () => createQueryTab({ databaseName, title: `${tableName} indeksler`, sql: `SHOW INDEX FROM ${table};`, runImmediately: true }) }
      ] },
      { id: 'sep-2', separator: true },
      { id: 'insert', label: 'Satır ekle', icon: Plus, disabled: Boolean(activeServer?.readOnly), onSelect: () => { setPendingInsertTarget({ databaseName, tableName }); handleTableSelect(databaseName, tableName, 'data'); } },
      { id: 'delete', label: 'DELETE taslağı', icon: Trash2, danger: true, onSelect: () => { createQueryTab({ databaseName, title: `${tableName} DELETE`, sql: `-- Koşulu doğrulamadan çalıştırmayın.\nDELETE FROM ${table}\nWHERE \`primary_key\` = 0\nLIMIT 1;` }); } },
      { id: 'copy', label: 'Kopyala', icon: Copy, children: [
        { id: 'copy-name', label: 'Tablo adı', icon: Copy, onSelect: () => navigator.clipboard.writeText(tableName) },
        { id: 'copy-qualified', label: 'Tam tablo adı', icon: Copy, onSelect: () => navigator.clipboard.writeText(table) },
        { id: 'copy-select', label: 'SELECT taslağı', icon: Code, onSelect: () => navigator.clipboard.writeText(`SELECT * FROM ${table}\nLIMIT 100;`) }
      ] }
    ], `${databaseName}.${tableName}`);
  };

  const followForeignKey = (foreignKey: TableForeignKeyInfo, value: unknown) => {
    const targetDatabase = foreignKey.REFERENCED_TABLE_SCHEMA || selectedDatabase || null;
    const targetTable = qualifiedSqlName(targetDatabase || selectedDatabase || '', foreignKey.REFERENCED_TABLE_NAME);
    createQueryTab({
      databaseName: targetDatabase,
      title: `${foreignKey.REFERENCED_TABLE_NAME} FK`,
      sql: `SELECT * FROM ${targetTable}\nWHERE ${quoteSqlIdentifier(foreignKey.REFERENCED_COLUMN_NAME)} <=> ${toSqlLiteral(value)}\nLIMIT 100;`,
      runImmediately: true
    });
  };

  if (isServersLoading) return <LoadingState title="Çalışma alanı hazırlanıyor" description="Şifreli sunucu profilleri ve katalog yükleniyor." />;
  if (serversError) return <ErrorState title="Çalışma alanı açılamadı" description={serversError} actionLabel="Tekrar dene" onAction={loadServers} />;
  if (servers.length === 0) return <EmptyState icon={Server} title="İlk sunucunuzu ekleyin" description="MySQL veya MariaDB sunucusu eklediğinizde veritabanları burada görüntülenecek." actionLabel="Sunucu ekle" onAction={() => window.dispatchEvent(new Event('coreor:open-server-modal'))} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center overflow-x-auto border-b border-zinc-800 bg-zinc-950/70">
          <TabsList className="h-8 shrink-0 justify-start bg-transparent">
            <TabsTrigger value="sql-editor" className="h-8 px-3 text-xs" icon={<Database className="h-3.5 w-3.5" />}>Veritabanları</TabsTrigger>
            {selectedDatabase && <>
              <TabsTrigger value="database" className="h-8 max-w-56 px-3 text-xs" icon={<Database className="h-3.5 w-3.5" />}><span className="truncate">{selectedDatabase}</span></TabsTrigger>
              <TabsTrigger value="schema-graph" className="h-8 max-w-56 px-3 text-xs" icon={<Network className="h-3.5 w-3.5" />}><span className="truncate">Şema: {selectedDatabase}</span></TabsTrigger>
            </>}
            {selectedDatabase && selectedTable && <>
              <TabsTrigger value="table" className="h-8 max-w-64 px-3 text-xs" icon={<TableIcon className="h-3.5 w-3.5" />}><span className="truncate">Yapı: {selectedTable}</span></TabsTrigger>
              <TabsTrigger value="table-data" className="h-8 max-w-64 px-3 text-xs" icon={<TableIcon className="h-3.5 w-3.5" />}><span className="truncate">Veri: {selectedTable}</span></TabsTrigger>
            </>}
            {queryTabs.map(tab => <div key={tab.id} className="flex h-8 items-center border-r border-zinc-800" onContextMenu={event => queryTabContextMenu(event, tab)}><TabsTrigger value={`query:${tab.id}`} className="h-8 max-w-52 border-r-0 px-2 text-xs" icon={<Code className="h-3.5 w-3.5" />}><span className="truncate">{tab.title}</span></TabsTrigger><button type="button" className="mr-1 flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:bg-zinc-800 hover:text-white" onClick={event => { event.stopPropagation(); closeQueryTab(tab.id); }} title="Sorgu sekmesini kapat"><X className="h-3 w-3" /></button></div>)}
          </TabsList>
          <Button type="button" variant="ghost" size="icon" className="ml-1 h-7 w-7 shrink-0" onClick={() => createQueryTab({ databaseName: selectedDatabase || null })} title="Yeni sorgu sekmesi"><Plus className="h-3.5 w-3.5" /></Button>
        </div>

        <TabsContent value="sql-editor" className="m-0 min-h-0 flex-1 overflow-hidden p-0"><DatabaseCatalogView mode="databases" databases={databases} selectedDatabase={selectedDatabase} selectedTable={selectedTable} activeServerName={activeServer?.name} isLoading={catalogLoading} error={catalogError} onRefresh={loadCatalog} onDatabaseSelect={handleDatabaseSelect} onTableSelect={handleTableSelect} onDatabaseContextMenu={openDatabaseMenu} onTableContextMenu={openTableMenu} onOpenQuery={databaseName => createQueryTab({ databaseName })} /></TabsContent>

        <TabsContent value="database" className="m-0 min-h-0 flex-1 overflow-hidden p-0"><DatabaseCatalogView mode="tables" databases={databases} selectedDatabase={selectedDatabase} selectedTable={selectedTable} activeServerName={activeServer?.name} isLoading={catalogLoading} error={catalogError} onRefresh={loadCatalog} onDatabaseSelect={handleDatabaseSelect} onTableSelect={(databaseName, tableName) => handleTableSelect(databaseName, tableName)} onDatabaseContextMenu={openDatabaseMenu} onTableContextMenu={openTableMenu} onOpenQuery={databaseName => createQueryTab({ databaseName })} /></TabsContent>

        <TabsContent value="schema-graph" className="m-0 min-h-0 flex-1 overflow-hidden p-0">
          {!selectedDatabase || !activeServerId ? <EmptyState icon={Network} title="Veritabanı seçilmedi" description="Şema grafiği için bir veritabanı seçin." /> : <DatabaseSchemaGraph serverId={activeServerId} databaseName={selectedDatabase} accountId={workspaceKey} catalog={databases} readOnly={Boolean(activeServer?.readOnly)} onCatalogRefresh={loadCatalog} onOpenTable={tableName => handleTableSelect(selectedDatabase, tableName, 'structure')} />}
        </TabsContent>

        <TabsContent value="table" className="m-0 min-h-0 flex-1 overflow-hidden p-0">
          {tableInfoLoading ? <LoadingState title="Tablo yapısı okunuyor" description={selectedTable || undefined} /> : tableInfoError ? <ErrorState title="Tablo yapısı yüklenemedi" description={tableInfoError} actionLabel="Tekrar dene" onAction={loadSelectedTableInfo} /> : !tableInfo || !selectedDatabase || !selectedTable || !activeServerId ? <EmptyState icon={TableIcon} title="Tablo seçilmedi" description="Yapısını incelemek için bir tablo seçin." /> : <TableSchemaEditor serverId={activeServerId} databaseName={selectedDatabase} tableName={selectedTable} accountId={workspaceKey} info={tableInfo} catalog={databases} onInfoChange={setTableInfo} onTableRenamed={nextTableName => { onTableSelect(nextTableName); setActiveTab('table'); }} onCatalogRefresh={loadCatalog} />}
        </TabsContent>

        <TabsContent value="table-data" className="m-0 min-h-0 flex-1 overflow-hidden p-0">
          {tableInfoLoading ? <LoadingState title="Kolon bilgileri hazırlanıyor" /> : tableInfoError ? <ErrorState title="Tablo yapısı yüklenemedi" description={tableInfoError} actionLabel="Tekrar dene" onAction={loadSelectedTableInfo} /> : !tableInfo || !selectedDatabase || !selectedTable || !activeServerId ? <EmptyState icon={TableIcon} title="Tablo seçilmedi" description="Verilerini görüntülemek için bir tablo seçin." /> : <TableDataView key={`${activeServerId}:${selectedDatabase}:${selectedTable}`} serverId={activeServerId} databaseName={selectedDatabase} tableName={selectedTable} accountId={workspaceKey} info={tableInfo} onOpenQuery={(title, sql, runImmediately, databaseName) => createQueryTab({ title, sql, runImmediately, databaseName: databaseName === undefined ? selectedDatabase : databaseName })} onFollowForeignKey={followForeignKey} />}
        </TabsContent>

        {queryTabs.map(tab => <TabsContent key={tab.id} value={`query:${tab.id}`} className="m-0 min-h-0 flex-1 overflow-hidden p-0"><QueryWorkspace tab={tab} servers={servers} accountId={workspaceKey} onChange={patch => updateQueryTab(tab.id, patch)} onDuplicate={() => duplicateQueryTab(tab)} /></TabsContent>)}
      </Tabs>
      <CoreorInputModal
        open={Boolean(renameQueryTab)}
        title="Sorguyu adlandır"
        description="Bu ad sekmede ve geri yüklenen sorgu oturumunda kullanılacak."
        initialValue={renameQueryTab?.title || ''}
        placeholder="Örn. Kullanıcı raporu"
        confirmLabel="Adı kaydet"
        onClose={() => setRenameQueryTab(null)}
        onConfirm={title => {
          if (!renameQueryTab) return;
          updateQueryTab(renameQueryTab.id, { title, updatedAt: new Date().toISOString() });
        }}
      />
    </div>
  );
}
