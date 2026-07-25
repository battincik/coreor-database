/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Code,
  Copy,
  Database,
  Filter,
  Key,
  Link,
  Plus,
  RefreshCw,
  Search,
  Server,
  Table as TableIcon,
  Trash2,
  X
} from 'lucide-react';
import type {
  DatabasePanelProps,
  EditorQueryTab,
  GridRuntimeStatus,
  TableDataFilter,
  TableDataFilterOperator,
  TableDataPagination,
  TableDataSort,
  TableInfo
} from 'types';
import { useAuth } from '@/context/AuthContext';
import { DatabaseContext } from '@/context/DatabaseContext';
import {
  fetchServerTables,
  fetchTableData as fetchTableDataFromApi,
  fetchTableInfo as fetchTableInfoFromApi,
  updateTableCell
} from '@/lib/databaseApi';
import { EmptyState, ErrorState, LoadingState } from '@/components/app-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppContextMenu } from '@/components/app-context-menu';
import { QueryWorkspace } from '@/components/query-workspace';
import {
  OPEN_QUERY_TAB_EVENT,
  openQueryTab,
  qualifiedSqlName,
  quoteSqlIdentifier,
  toSqlLiteral,
  type OpenQueryTabDetail
} from '@/lib/queryWorkspaceEvents';

const QUERY_TABS_STORAGE_KEY = 'coreor:query-tabs:v1';

const INITIAL_PAGINATION: TableDataPagination = {
  page: 1,
  pageSize: 50,
  totalRows: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false
};

const FILTER_OPERATORS: Array<{ value: TableDataFilterOperator; label: string; needsValue: boolean }> = [
  { value: 'contains', label: 'İçerir', needsValue: true },
  { value: 'equals', label: 'Eşittir', needsValue: true },
  { value: 'startsWith', label: 'İle başlar', needsValue: true },
  { value: 'endsWith', label: 'İle biter', needsValue: true },
  { value: 'gt', label: 'Büyüktür', needsValue: true },
  { value: 'gte', label: 'Büyük/eşit', needsValue: true },
  { value: 'lt', label: 'Küçüktür', needsValue: true },
  { value: 'lte', label: 'Küçük/eşit', needsValue: true },
  { value: 'isNull', label: 'NULL', needsValue: false },
  { value: 'isNotNull', label: 'NULL değil', needsValue: false }
];

type EditingCell = {
  rowIndex: number;
  column: string;
  draft: string;
  originalValue: unknown;
  isSaving: boolean;
};

function highlightSQL(sql: string): React.ReactNode {
  const keywords = ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'BETWEEN', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'LIKE', 'IN', 'AS', 'JOIN', 'ON', 'ORDER', 'BY', 'GROUP', 'HAVING', 'DISTINCT', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'END'];
  const dataTypes = ['VARCHAR', 'CHAR', 'TEXT', 'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'BOOLEAN'];
  const regexKeywords = new RegExp(`\\b(${keywords.join('|')})\\b`, 'i');
  const regexDataTypes = new RegExp(`\\b(${dataTypes.join('|')})\\b`, 'i');

  return sql.split(/(\s+)/).map((part, index) => {
    if (regexKeywords.test(part)) return <span key={index} className="font-semibold text-blue-400">{part.toUpperCase()}</span>;
    if (regexDataTypes.test(part)) return <span key={index} className="font-medium text-orange-400">{part.toUpperCase()}</span>;
    if (/^`.*`$/.test(part)) return <span key={index} className="text-teal-400">{part}</span>;
    if (/^['"].*['"]$/.test(part)) return <span key={index} className="text-green-400">{part}</span>;
    if (/^\d+$/.test(part)) return <span key={index} className="text-purple-400">{part}</span>;
    return part;
  });
}

function openServerModal() {
  window.dispatchEvent(new Event('coreor:open-server-modal'));
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createFilterId() {
  return createId('filter');
}

function operatorNeedsValue(operator: TableDataFilterOperator) {
  return FILTER_OPERATORS.find(item => item.value === operator)?.needsValue ?? true;
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debouncedValue;
}

function displayValue(value: unknown) {
  if (value === null) return '(NULL)';
  if (value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseEditedValue(draft: string, columnType: string, originalValue: unknown) {
  const type = columnType.toUpperCase();
  if (/\b(JSON)\b/.test(type)) return JSON.parse(draft);
  if (/\b(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|BIT|YEAR)\b/.test(type)) {
    const numeric = Number(draft);
    if (!Number.isFinite(numeric)) throw new Error('Bu kolon sayısal bir değer bekliyor.');
    return numeric;
  }
  if (/\b(BOOL|BOOLEAN)\b/.test(type)) {
    const normalized = draft.trim().toLocaleLowerCase('tr-TR');
    if (['1', 'true', 'evet'].includes(normalized)) return 1;
    if (['0', 'false', 'hayır'].includes(normalized)) return 0;
    throw new Error('Boolean değer için 1/0 veya true/false kullanın.');
  }
  if (typeof originalValue === 'number') {
    const numeric = Number(draft);
    if (!Number.isFinite(numeric)) throw new Error('Geçerli bir sayı girin.');
    return numeric;
  }
  return draft;
}

function primaryKeyObject(row: Record<string, unknown>, tableInfo: TableInfo | null) {
  const keyColumns = tableInfo?.columns.filter(column => column.Key === 'PRI').map(column => column.Field) || [];
  if (keyColumns.length === 0 || keyColumns.some(column => row[column] === undefined)) return null;
  return Object.fromEntries(keyColumns.map(column => [column, row[column]]));
}

function primaryKeySql(primaryKey: Record<string, unknown>) {
  return Object.entries(primaryKey)
    .map(([column, value]) => `${quoteSqlIdentifier(column)} <=> ${toSqlLiteral(value)}`)
    .join(' AND ');
}

function hydrateQueryTabs(): EditorQueryTab[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(QUERY_TABS_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-20).map(item => ({
      id: String(item.id || createId('query')),
      title: String(item.title || 'Sorgu'),
      serverId: typeof item.serverId === 'string' ? item.serverId : null,
      databaseName: typeof item.databaseName === 'string' ? item.databaseName : null,
      sql: String(item.sql || ''),
      isRunning: false,
      error: null,
      result: null,
      createdAt: String(item.createdAt || new Date().toISOString()),
      updatedAt: String(item.updatedAt || new Date().toISOString())
    }));
  } catch {
    return [];
  }
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
    tableData,
    setTableData,
    servers,
    activeServerId,
    loadServers,
    isServersLoading,
    serversError
  } = useContext(DatabaseContext)!;
  const { activeToken } = useAuth();
  const { openContextMenu } = useAppContextMenu();
  const activeServer = useMemo(() => servers.find(server => server.id === activeServerId) ?? null, [servers, activeServerId]);
  const selectedDatabaseItem = databases.find(database => database.name === selectedDatabase);

  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isTableInfoLoading, setIsTableInfoLoading] = useState(false);
  const [tableInfoError, setTableInfoError] = useState<string | null>(null);
  const [isTableDataLoading, setIsTableDataLoading] = useState(false);
  const [tableDataError, setTableDataError] = useState<string | null>(null);
  const [cellEditError, setCellEditError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pagination, setPagination] = useState<TableDataPagination>(INITIAL_PAGINATION);
  const [sorts, setSorts] = useState<TableDataSort[]>([]);
  const [filters, setFilters] = useState<TableDataFilter[]>([]);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const debouncedFilters = useDebouncedValue(filters, 350);
  const requestSequence = useRef(0);
  const totalCache = useRef<{ key: string; totalRows: number } | null>(null);

  const [tableNameSearch, setTableNameSearch] = useState('');
  const [tableNameSort, setTableNameSort] = useState<'asc' | 'desc'>('asc');
  const [tableListPage, setTableListPage] = useState(1);
  const tableListPageSize = 100;

  const [queryTabs, setQueryTabs] = useState<EditorQueryTab[]>([]);
  const queryTabsHydrated = useRef(false);

  const effectiveFilters = useMemo(
    () =>
      debouncedFilters.filter(filter => {
        if (!filter.column) return false;
        if (!operatorNeedsValue(filter.operator)) return true;
        return Boolean(filter.value?.trim());
      }),
    [debouncedFilters]
  );
  const effectiveFilterKey = useMemo(() => JSON.stringify(effectiveFilters), [effectiveFilters]);
  const tableDataCacheKey = `${activeServerId || ''}:${selectedDatabase || ''}:${selectedTable || ''}:${effectiveFilterKey}`;

  const visibleTableNames = useMemo(() => {
    const normalizedSearch = tableNameSearch.trim().toLocaleLowerCase('tr-TR');
    const names = (selectedDatabaseItem?.tables || []).filter(name => !normalizedSearch || name.toLocaleLowerCase('tr-TR').includes(normalizedSearch));
    names.sort((left, right) => left.localeCompare(right, 'tr-TR') * (tableNameSort === 'asc' ? 1 : -1));
    return names;
  }, [selectedDatabaseItem?.tables, tableNameSearch, tableNameSort]);
  const tableListTotalPages = Math.max(1, Math.ceil(visibleTableNames.length / tableListPageSize));
  const pagedTableNames = visibleTableNames.slice((tableListPage - 1) * tableListPageSize, tableListPage * tableListPageSize);

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
    setQueryTabs(previous => {
      const index = previous.findIndex(tab => tab.id === id);
      const next = previous.filter(tab => tab.id !== id);
      if (activeTab === `query:${id}`) {
        const fallback = next[Math.max(0, index - 1)];
        setActiveTab(fallback ? `query:${fallback.id}` : selectedTable ? 'table-data' : selectedDatabase ? 'database' : 'sql-editor');
      }
      return next;
    });
  }, [activeTab, selectedTable, selectedDatabase, setActiveTab]);

  const duplicateQueryTab = useCallback((tab: EditorQueryTab) => {
    createQueryTab({
      serverId: tab.serverId,
      databaseName: tab.databaseName,
      title: `${tab.title} kopya`,
      sql: tab.sql
    });
  }, [createQueryTab]);

  useEffect(() => {
    setQueryTabs(hydrateQueryTabs());
    queryTabsHydrated.current = true;
  }, []);

  useEffect(() => {
    if (!queryTabsHydrated.current) return;
    try {
      window.sessionStorage.setItem(
        QUERY_TABS_STORAGE_KEY,
        JSON.stringify(queryTabs.map(({ result: _result, error: _error, isRunning: _isRunning, runImmediately: _runImmediately, ...tab }) => tab))
      );
    } catch {
      // Sorgu sekmesi kalıcılığı editör akışını durdurmamalıdır.
    }
  }, [queryTabs]);

  useEffect(() => {
    const handler = (event: Event) => createQueryTab((event as CustomEvent<OpenQueryTabDetail>).detail || {});
    window.addEventListener(OPEN_QUERY_TAB_EVENT, handler);
    return () => window.removeEventListener(OPEN_QUERY_TAB_EVENT, handler);
  }, [createQueryTab]);

  const loadCatalog = async () => {
    if (!activeServerId || !activeToken || isCatalogLoading) return;
    setIsCatalogLoading(true);
    setCatalogError(null);
    try {
      const data = await fetchServerTables(activeServerId, activeToken);
      setDatabases(data.databases || []);
      await loadServers();
    } catch (error) {
      const code = (error as Error & { code?: string }).code;
      if (code !== 'REQUEST_SUPERSEDED') setCatalogError(error instanceof Error ? error.message : 'Veritabanı kataloğu yüklenemedi.');
    } finally {
      setIsCatalogLoading(false);
    }
  };

  useEffect(() => {
    const currentServer = servers.find(server => server.id === activeServerId) ?? null;
    const cachedDatabases = currentServer?.databases || [];
    setDatabases(cachedDatabases);
    setCatalogError(null);
    if (currentServer && cachedDatabases.length === 0 && activeToken) loadCatalog();
  }, [activeServerId, activeToken]);

  useEffect(() => {
    onTableSelect(null);
    setTableInfo(null);
    setTableData([]);
    setTableInfoError(null);
    setTableDataError(null);
    setCellEditError(null);
    setEditingCell(null);
    setTableNameSearch('');
    setTableListPage(1);
  }, [selectedDatabase]);

  useEffect(() => {
    setPage(1);
    setPageSize(50);
    setPagination(INITIAL_PAGINATION);
    setSorts([]);
    setFilters([]);
    setIsFilterPanelOpen(false);
    setEditingCell(null);
    setCellEditError(null);
    totalCache.current = null;
  }, [selectedDatabase, selectedTable, activeServerId]);

  useEffect(() => {
    setPage(1);
    totalCache.current = null;
  }, [effectiveFilterKey, pageSize]);

  useEffect(() => {
    setTableListPage(1);
  }, [tableNameSearch, tableNameSort, selectedDatabase]);

  useEffect(() => {
    const loadTableInfo = async () => {
      if (!selectedDatabase || !selectedTable || !activeServerId || !activeToken) {
        setTableInfo(null);
        return;
      }

      setIsTableInfoLoading(true);
      setTableInfoError(null);
      setTableInfo(null);
      try {
        const data = await fetchTableInfoFromApi(activeServerId, selectedDatabase, selectedTable, activeToken);
        setTableInfo(data);
      } catch (error) {
        const code = (error as Error & { code?: string }).code;
        if (code !== 'REQUEST_SUPERSEDED') setTableInfoError(error instanceof Error ? error.message : 'Tablo yapısı yüklenemedi.');
      } finally {
        setIsTableInfoLoading(false);
      }
    };

    loadTableInfo();
  }, [selectedDatabase, selectedTable, activeServerId, activeToken]);

  useEffect(() => {
    const loadTableData = async () => {
      if (activeTab !== 'table-data' || !selectedDatabase || !selectedTable || !activeServerId || !activeToken) return;
      const sequence = ++requestSequence.current;
      setIsTableDataLoading(true);
      setTableDataError(null);

      const cachedTotal = totalCache.current?.key === tableDataCacheKey ? totalCache.current.totalRows : undefined;
      try {
        const response = await fetchTableDataFromApi(activeServerId, selectedDatabase, selectedTable, activeToken, {
          page,
          pageSize,
          sorts,
          filters: effectiveFilters,
          includeTotal: cachedTotal === undefined,
          knownTotalRows: cachedTotal
        });

        if (sequence !== requestSequence.current) return;
        setTableData(response.data || []);
        setPagination(response.pagination);
        totalCache.current = { key: tableDataCacheKey, totalRows: response.pagination.totalRows };
        if (response.pagination.page !== page) setPage(response.pagination.page);
      } catch (error) {
        if (sequence !== requestSequence.current) return;
        const code = (error as Error & { code?: string }).code;
        if (code !== 'REQUEST_SUPERSEDED') setTableDataError(error instanceof Error ? error.message : 'Tablo verileri yüklenemedi.');
      } finally {
        if (sequence === requestSequence.current) setIsTableDataLoading(false);
      }
    };

    loadTableData();
  }, [activeTab, selectedDatabase, selectedTable, activeServerId, activeToken, page, pageSize, sorts, effectiveFilterKey, refreshNonce]);

  const handleSortByColumn = (column: string, additive = false, forcedDirection?: 'asc' | 'desc') => {
    setPage(1);
    setSorts(previous => {
      if (forcedDirection) {
        if (!additive) return [{ column, direction: forcedDirection }];
        return [...previous.filter(sort => sort.column !== column), { column, direction: forcedDirection }];
      }

      const existingIndex = previous.findIndex(sort => sort.column === column);
      const existing = existingIndex >= 0 ? previous[existingIndex] : null;
      let nextForColumn: TableDataSort | null = null;
      if (!existing) nextForColumn = { column, direction: 'asc' };
      else if (existing.direction === 'asc') nextForColumn = { column, direction: 'desc' };

      if (!additive) return nextForColumn ? [nextForColumn] : [];
      const next = previous.filter(sort => sort.column !== column);
      if (nextForColumn) next.push(nextForColumn);
      return next;
    });
  };

  const refreshTableData = () => {
    totalCache.current = null;
    setRefreshNonce(previous => previous + 1);
  };

  const addFilter = (columnName?: string, operator: TableDataFilterOperator = 'contains', value = '') => {
    const firstColumn = columnName || tableInfo?.columns[0]?.Field;
    if (!firstColumn) return;
    setFilters(previous => [...previous, { id: createFilterId(), column: firstColumn, operator, value }]);
    setIsFilterPanelOpen(true);
  };

  const updateFilter = (id: string | undefined, patch: Partial<TableDataFilter>) => {
    setFilters(previous => previous.map(filter => (filter.id === id ? { ...filter, ...patch } : filter)));
  };

  const removeFilter = (id: string | undefined) => {
    setFilters(previous => previous.filter(filter => filter.id !== id));
  };

  const handleDatabaseSelect = (databaseName: string) => {
    onDatabaseSelect(databaseName);
    onTableSelect(null);
    setActiveTab('database');
  };

  const handleTableSelect = (databaseName: string, tableName: string, view: 'structure' | 'data' = 'data') => {
    if (selectedDatabase !== databaseName) onDatabaseSelect(databaseName);
    onTableSelect(tableName);
    setActiveTab(view === 'data' ? 'table-data' : 'table');
  };

  const retryTableInfo = async () => {
    if (!selectedDatabase || !selectedTable || !activeServerId || !activeToken) return;
    setIsTableInfoLoading(true);
    setTableInfoError(null);
    try {
      setTableInfo(await fetchTableInfoFromApi(activeServerId, selectedDatabase, selectedTable, activeToken));
    } catch (error) {
      setTableInfoError(error instanceof Error ? error.message : 'Tablo yapısı yüklenemedi.');
    } finally {
      setIsTableInfoLoading(false);
    }
  };

  useEffect(() => {
    const openTableView = (event: Event) => {
      const view = (event as CustomEvent<{ view?: 'structure' | 'data' }>).detail?.view;
      if (view === 'data') setActiveTab('table-data');
      if (view === 'structure') setActiveTab('table');
    };
    const refreshActiveView = () => {
      if (activeTab === 'table-data') refreshTableData();
      else if (activeTab === 'table') void retryTableInfo();
      else if (activeTab === 'database' || activeTab === 'sql-editor') void loadCatalog();
    };

    window.addEventListener('coreor:open-table-view', openTableView);
    window.addEventListener('coreor:refresh-active-view', refreshActiveView);
    return () => {
      window.removeEventListener('coreor:open-table-view', openTableView);
      window.removeEventListener('coreor:refresh-active-view', refreshActiveView);
    };
  }, [activeTab, selectedDatabase, selectedTable, activeServerId, activeToken]);

  useEffect(() => {
    const detail: GridRuntimeStatus = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalRows: pagination.totalRows,
      totalPages: pagination.totalPages,
      filters: effectiveFilters.length,
      sorts: sorts.length,
      isLoading: isTableDataLoading
    };
    window.dispatchEvent(new CustomEvent<GridRuntimeStatus>('coreor:grid-status', { detail }));
  }, [pagination, effectiveFilters.length, sorts.length, isTableDataLoading]);

  const saveCell = async (rowIndex: number, column: TableInfo['columns'][number], valueOverride?: unknown) => {
    if (!selectedDatabase || !selectedTable || !activeServerId || !activeToken || !tableInfo) return;
    const row = tableData[rowIndex];
    const primaryKey = primaryKeyObject(row, tableInfo);
    if (!primaryKey) {
      setCellEditError('Bu tabloda primary key bulunmadığı için güvenli hücre düzenleme kapalıdır.');
      return;
    }

    const editor = editingCell?.rowIndex === rowIndex && editingCell.column === column.Field ? editingCell : null;
    let nextValue = valueOverride;
    try {
      if (arguments.length < 3) nextValue = parseEditedValue(editor?.draft || '', column.Type, row[column.Field]);
    } catch (error) {
      setCellEditError(error instanceof Error ? error.message : 'Hücre değeri dönüştürülemedi.');
      return;
    }

    setCellEditError(null);
    if (editor) setEditingCell({ ...editor, isSaving: true });
    try {
      await updateTableCell(activeServerId, {
        database: selectedDatabase,
        table: selectedTable,
        column: column.Field,
        value: nextValue,
        primaryKey
      }, activeToken);
      setTableData(previous => previous.map((item, index) => index === rowIndex ? { ...item, [column.Field]: nextValue } : item));
      setEditingCell(null);
    } catch (error) {
      setCellEditError(error instanceof Error ? error.message : 'Hücre güncellenemedi.');
      if (editor) setEditingCell({ ...editor, isSaving: false });
    }
  };

  const startCellEdit = (rowIndex: number, column: TableInfo['columns'][number]) => {
    const row = tableData[rowIndex];
    if (!primaryKeyObject(row, tableInfo)) {
      setCellEditError('Hücre düzenleme için tabloda primary key bulunmalıdır.');
      return;
    }
    const value = row[column.Field];
    setCellEditError(null);
    setEditingCell({
      rowIndex,
      column: column.Field,
      draft: value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value),
      originalValue: value,
      isSaving: false
    });
  };

  const openCellMenu = (event: React.MouseEvent, row: Record<string, unknown>, rowIndex: number, column: TableInfo['columns'][number]) => {
    const value = row[column.Field];
    const primaryKey = primaryKeyObject(row, tableInfo);
    const table = selectedDatabase && selectedTable ? qualifiedSqlName(selectedDatabase, selectedTable) : '';
    const whereSql = primaryKey ? primaryKeySql(primaryKey) : '';
    const rowColumns = tableInfo?.columns.map(item => item.Field) || Object.keys(row);
    const insertSql = table
      ? `INSERT INTO ${table} (${rowColumns.map(quoteSqlIdentifier).join(', ')})\nVALUES (${rowColumns.map(name => toSqlLiteral(row[name])).join(', ')});`
      : '';

    openContextMenu(event, [
      { id: 'edit-cell', label: 'Hücreyi düzenle', icon: Code, disabled: !primaryKey, onSelect: () => startCellEdit(rowIndex, column) },
      { id: 'set-null', label: 'NULL yap', icon: Trash2, disabled: !primaryKey || column.Null !== 'YES' || value === null, onSelect: () => saveCell(rowIndex, column, null) },
      { id: 'separator-1', separator: true },
      { id: 'copy-value', label: 'Hücre değerini kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(value === null ? 'NULL' : displayValue(value)) },
      { id: 'copy-row', label: 'Satırı JSON olarak kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(JSON.stringify(row, null, 2)) },
      { id: 'filter-value', label: value === null ? 'NULL değerleri filtrele' : 'Bu değere göre filtrele', icon: Filter, onSelect: () => addFilter(column.Field, value === null ? 'isNull' : 'equals', value === null ? '' : String(value)) },
      { id: 'separator-2', separator: true },
      { id: 'insert-query', label: 'Bu satırdan INSERT oluştur', icon: Plus, disabled: !table, onSelect: () => openQueryTab({ serverId: activeServerId, databaseName: selectedDatabase, title: `${selectedTable} INSERT`, sql: insertSql }) },
      { id: 'update-query', label: 'Bu hücre için UPDATE oluştur', icon: Code, disabled: !primaryKey || !table, onSelect: () => openQueryTab({ serverId: activeServerId, databaseName: selectedDatabase, title: `${selectedTable} UPDATE`, sql: `UPDATE ${table}\nSET ${quoteSqlIdentifier(column.Field)} = ${toSqlLiteral(value)}\nWHERE ${whereSql}\nLIMIT 1;` }) },
      { id: 'delete-query', label: 'Bu satır için DELETE oluştur', icon: Trash2, danger: true, disabled: !primaryKey || !table, onSelect: () => openQueryTab({ serverId: activeServerId, databaseName: selectedDatabase, title: `${selectedTable} DELETE`, sql: `-- Çalıştırmadan önce koşulu doğrulayın.\nDELETE FROM ${table}\nWHERE ${whereSql}\nLIMIT 1;` }) }
    ], `${column.Field}: ${displayValue(value)}`);
  };

  const openColumnMenu = (event: React.MouseEvent, column: TableInfo['columns'][number]) => {
    openContextMenu(event, [
      { id: 'sort-asc', label: 'Artan sırala', icon: ArrowUp, onSelect: () => handleSortByColumn(column.Field, false, 'asc') },
      { id: 'sort-desc', label: 'Azalan sırala', icon: ArrowDown, onSelect: () => handleSortByColumn(column.Field, false, 'desc') },
      { id: 'add-sort-asc', label: 'Çoklu sıralamaya ekle', icon: ArrowUpDown, onSelect: () => handleSortByColumn(column.Field, true, 'asc') },
      { id: 'separator-1', separator: true },
      { id: 'filter-contains', label: 'Bu kolona filtre ekle', icon: Filter, onSelect: () => addFilter(column.Field) },
      { id: 'copy-column', label: 'Kolon adını kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(column.Field) },
      { id: 'clear-sorts', label: 'Tüm sıralamaları temizle', icon: Trash2, disabled: sorts.length === 0, onSelect: () => setSorts([]) }
    ], `${column.Field} • ${column.Type}`);
  };

  const openDatabaseMenu = (event: React.MouseEvent, databaseName: string) => {
    openContextMenu(event, [
      { id: 'open-database', label: 'Veritabanını aç', icon: Database, onSelect: () => handleDatabaseSelect(databaseName) },
      { id: 'new-query', label: 'Yeni sorgu sekmesi', icon: Code, onSelect: () => createQueryTab({ serverId: activeServerId, databaseName, title: databaseName }) },
      { id: 'show-tables', label: 'SHOW TABLES çalıştır', icon: TableIcon, onSelect: () => createQueryTab({ serverId: activeServerId, databaseName, title: `${databaseName} tabloları`, sql: 'SHOW FULL TABLES;', runImmediately: true }) },
      { id: 'copy-name', label: 'Veritabanı adını kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(databaseName) }
    ], databaseName);
  };

  const openTableMenu = (event: React.MouseEvent, databaseName: string, tableName: string) => {
    const table = qualifiedSqlName(databaseName, tableName);
    openContextMenu(event, [
      { id: 'open-data', label: 'Verileri aç', icon: TableIcon, onSelect: () => handleTableSelect(databaseName, tableName, 'data') },
      { id: 'open-structure', label: 'Yapıyı aç', icon: Database, onSelect: () => handleTableSelect(databaseName, tableName, 'structure') },
      { id: 'separator-1', separator: true },
      { id: 'select-100', label: 'İlk 100 satırı sorgula', icon: Search, onSelect: () => createQueryTab({ serverId: activeServerId, databaseName, title: `${tableName} SELECT`, sql: `SELECT * FROM ${table}\nLIMIT 100;`, runImmediately: true }) },
      { id: 'count', label: 'Satır sayısını sorgula', icon: Search, onSelect: () => createQueryTab({ serverId: activeServerId, databaseName, title: `${tableName} COUNT`, sql: `SELECT COUNT(*) AS totalRows FROM ${table};`, runImmediately: true }) },
      { id: 'describe', label: 'DESCRIBE çalıştır', icon: Code, onSelect: () => createQueryTab({ serverId: activeServerId, databaseName, title: `${tableName} DESCRIBE`, sql: `DESCRIBE ${table};`, runImmediately: true }) },
      { id: 'copy', label: 'Tam tablo adını kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(table) }
    ], `${databaseName}.${tableName}`);
  };

  if (isServersLoading) return <LoadingState title="Çalışma alanı hazırlanıyor" description="Şifreli sunucu profilleri ve son seçimler yükleniyor." />;
  if (serversError) return <ErrorState title="Çalışma alanı açılamadı" description={serversError} actionLabel="Tekrar dene" onAction={loadServers} />;
  if (servers.length === 0) return <EmptyState icon={Server} title="İlk sunucunuzu ekleyin" description="MySQL veya MariaDB sunucusu eklediğinizde veritabanları ve tablolar burada görüntülenecek." actionLabel="Sunucu ekle" onAction={openServerModal} />;

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
        <div className="flex h-8 shrink-0 items-center overflow-x-auto border-b border-zinc-800">
          <TabsList className="h-8 shrink-0 justify-start bg-transparent">
            <TabsTrigger value="sql-editor" className="h-8 px-3 text-xs data-[state=active]:bg-background" icon={<Database className="h-4 w-4" />}>Veritabanları</TabsTrigger>
            {selectedDatabase && <TabsTrigger value="database" className="h-8 px-3 text-xs data-[state=active]:bg-background" icon={<Database className="h-4 w-4" />}>{selectedDatabase}</TabsTrigger>}
            {selectedDatabase && selectedTable && (
              <>
                <TabsTrigger value="table" className="h-8 px-3 text-xs data-[state=active]:bg-background" icon={<TableIcon className="h-4 w-4" />}>Yapı: {selectedTable}</TabsTrigger>
                <TabsTrigger value="table-data" className="h-8 px-3 text-xs data-[state=active]:bg-background" icon={<TableIcon className="h-4 w-4" />}>Veri: {selectedTable}</TabsTrigger>
              </>
            )}
            {queryTabs.map(tab => (
              <div key={tab.id} className="flex h-8 items-center border-r border-zinc-800">
                <TabsTrigger value={`query:${tab.id}`} className="h-8 max-w-48 border-r-0 px-2 text-xs data-[state=active]:bg-background" icon={<Code className="h-3.5 w-3.5" />}>
                  <span className="truncate">{tab.title}</span>
                </TabsTrigger>
                <button type="button" className="mr-1 flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:bg-zinc-800 hover:text-white" onClick={event => { event.stopPropagation(); closeQueryTab(tab.id); }} title="Sorgu sekmesini kapat"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </TabsList>
          <Button type="button" variant="ghost" size="icon" className="ml-1 h-7 w-7 shrink-0" onClick={() => createQueryTab({ databaseName: selectedDatabase || null })} title="Yeni sorgu sekmesi"><Plus className="h-3.5 w-3.5" /></Button>
        </div>

        <TabsContent value="sql-editor" className="m-0 min-h-0 flex-1 overflow-hidden p-0">
          <div className="flex h-8 shrink-0 items-center gap-3 border-b border-zinc-800 px-2">
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={loadCatalog} disabled={isCatalogLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${isCatalogLoading ? 'animate-spin' : ''}`} /> Yenile
            </button>
            <button type="button" className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300" onClick={() => createQueryTab({ databaseName: null })}><Plus className="h-3.5 w-3.5" /> Genel sorgu</button>
            <span className="text-[11px] text-muted-foreground">Sunucu: {activeServer?.name}</span>
          </div>
          {isCatalogLoading ? (
            <LoadingState title="Veritabanları okunuyor" description={`${activeServer?.name || 'Sunucu'} kataloğu alınıyor.`} />
          ) : catalogError ? (
            <ErrorState title="Katalog yüklenemedi" description={catalogError} actionLabel="Tekrar dene" onAction={loadCatalog} />
          ) : databases.length === 0 ? (
            <EmptyState icon={Database} title="Görüntülenebilir veritabanı yok" description="Bağlantı kullanıcısının yetkilerini kontrol edin veya kataloğu tekrar yenileyin." actionLabel="Kataloğu yenile" onAction={loadCatalog} />
          ) : (
            <ScrollArea className="h-[calc(100%-2rem)]">
              <Table size="sm" className="w-full border-collapse">
                <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="border-b border-r border-zinc-800 bg-zinc-950">Veritabanı</TableHead><TableHead className="border-b border-zinc-800 bg-zinc-950">Tablo sayısı</TableHead></TableRow></TableHeader>
                <TableBody>{databases.map(database => <TableRow key={database.name} className={`cursor-pointer hover:bg-muted/40 ${selectedDatabase === database.name ? 'bg-muted/30' : ''}`} onClick={() => handleDatabaseSelect(database.name)} onContextMenu={event => openDatabaseMenu(event, database.name)}><TableCell className="border-r border-zinc-800 py-1.5 font-medium"><span className="flex items-center gap-2"><Database className="h-4 w-4 text-emerald-500" />{database.name}</span></TableCell><TableCell className="py-1.5 tabular-nums">{database.tables.length}</TableCell></TableRow>)}</TableBody>
              </Table>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="database" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-2 py-1">
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={loadCatalog}><RefreshCw className="h-3.5 w-3.5" /> Yenile</button>
            <button type="button" className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300" onClick={() => createQueryTab({ databaseName: selectedDatabase })}><Plus className="h-3.5 w-3.5" /> Sorgu</button>
            <div className="relative min-w-52 max-w-sm flex-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
              <Input value={tableNameSearch} onChange={event => setTableNameSearch(event.target.value)} placeholder="Tablo ara" className="h-7 pl-7 text-xs" />
            </div>
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setTableNameSort(previous => previous === 'asc' ? 'desc' : 'asc')}>
              {tableNameSort === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />} Ada göre
            </button>
            <span className="ml-auto text-[10px] text-zinc-600">{visibleTableNames.length.toLocaleString('tr-TR')} tablo</span>
          </div>
          {!selectedDatabase ? (
            <EmptyState icon={Database} title="Veritabanı seçilmedi" description="Sol ağaçtan veya veritabanları listesinden bir veritabanı seçin." />
          ) : !selectedDatabaseItem || selectedDatabaseItem.tables.length === 0 ? (
            <EmptyState icon={TableIcon} title="Bu veritabanında tablo yok" description="Kullanıcının tablo görüntüleme yetkisini kontrol edin veya kataloğu yenileyin." actionLabel="Yenile" onAction={loadCatalog} />
          ) : visibleTableNames.length === 0 ? (
            <EmptyState icon={Search} title="Eşleşen tablo yok" description="Tablo arama metnini değiştirin." actionLabel="Aramayı temizle" onAction={() => setTableNameSearch('')} />
          ) : (
            <>
              <ScrollArea className="min-h-0 flex-1">
                <Table size="sm" className="w-full">
                  <TableHeader><TableRow><TableHead className="sticky top-0 border-b border-r border-zinc-800 bg-zinc-950">Tablo adı</TableHead><TableHead className="sticky top-0 border-b border-r border-zinc-800 bg-zinc-950">Motor</TableHead><TableHead className="sticky top-0 border-b border-zinc-800 bg-zinc-950">İşlem</TableHead></TableRow></TableHeader>
                  <TableBody>{pagedTableNames.map(tableName => <TableRow key={tableName} className="cursor-pointer hover:bg-muted/40" onClick={() => handleTableSelect(selectedDatabase, tableName)} onContextMenu={event => openTableMenu(event, selectedDatabase, tableName)}><TableCell className="border-r border-zinc-800 py-1.5 font-medium"><span className="flex items-center gap-2"><TableIcon className="h-4 w-4 text-blue-500" />{tableName}</span></TableCell><TableCell className="border-r border-zinc-800 py-1.5">{activeServer?.databaseType === 'mariadb' ? 'MariaDB' : 'MySQL'}</TableCell><TableCell className="py-1.5 text-xs text-emerald-400">Verileri aç</TableCell></TableRow>)}</TableBody>
                </Table>
              </ScrollArea>
              <div className="flex h-9 shrink-0 items-center justify-end gap-2 border-t border-zinc-800 px-2 text-[11px] text-zinc-500">
                <Button variant="ghost" size="sm" className="h-7" disabled={tableListPage <= 1} onClick={() => setTableListPage(previous => Math.max(1, previous - 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <span>{tableListPage} / {tableListTotalPages}</span>
                <Button variant="ghost" size="sm" className="h-7" disabled={tableListPage >= tableListTotalPages} onClick={() => setTableListPage(previous => Math.min(tableListTotalPages, previous + 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="table" className="m-0 min-h-0 flex-1 overflow-hidden p-0">
          {isTableInfoLoading ? (
            <LoadingState title="Tablo yapısı okunuyor" description={selectedTable || undefined} />
          ) : tableInfoError ? (
            <ErrorState title="Tablo yapısı yüklenemedi" description={tableInfoError} actionLabel="Tekrar dene" onAction={retryTableInfo} />
          ) : !tableInfo ? (
            <EmptyState icon={TableIcon} title="Tablo seçilmedi" description="Yapısını incelemek için bir tablo seçin." />
          ) : (
            <Tabs defaultValue="columns" className="flex h-full flex-col">
              <TabsList className="h-8 shrink-0 justify-start bg-transparent">
                <TabsTrigger value="columns" className="h-8 px-3 text-xs" icon={<TableIcon className="h-4 w-4" />}>Kolonlar</TabsTrigger>
                <TabsTrigger value="indexes" className="h-8 px-3 text-xs" icon={<Key className="h-4 w-4" />}>İndeksler</TabsTrigger>
                <TabsTrigger value="foreign-keys" className="h-8 px-3 text-xs" icon={<Link className="h-4 w-4" />}>Foreign key</TabsTrigger>
                <TabsTrigger value="create-sql" className="h-8 px-3 text-xs" icon={<Code className="h-4 w-4" />}>CREATE SQL</TabsTrigger>
              </TabsList>
              <TabsContent value="columns" className="m-0 min-h-0 flex-1 overflow-auto p-0"><Table size="sm"><TableHeader><TableRow><TableHead className="border bg-zinc-950">Alan</TableHead><TableHead className="border bg-zinc-950">Tür</TableHead><TableHead className="border bg-zinc-950">NULL</TableHead><TableHead className="border bg-zinc-950">Anahtar</TableHead><TableHead className="border bg-zinc-950">Varsayılan</TableHead><TableHead className="border bg-zinc-950">Ek</TableHead></TableRow></TableHeader><TableBody>{tableInfo.columns.map(column => <TableRow key={column.Field}><TableCell className="border py-1 font-medium">{column.Field}</TableCell><TableCell className="border py-1 text-green-400">{column.Type}</TableCell><TableCell className="border py-1">{column.Null}</TableCell><TableCell className="border py-1">{column.Key}</TableCell><TableCell className="border py-1">{column.Default ?? 'NULL'}</TableCell><TableCell className="border py-1">{column.Extra}</TableCell></TableRow>)}</TableBody></Table></TabsContent>
              <TabsContent value="indexes" className="m-0 min-h-0 flex-1 overflow-auto p-0">{tableInfo.indexes.length === 0 ? <EmptyState icon={Key} title="İndeks bulunmuyor" description="Bu tablo için tanımlı indeks yok." /> : <Table size="sm"><TableHeader><TableRow><TableHead className="border bg-zinc-950">İndeks</TableHead><TableHead className="border bg-zinc-950">Kolon</TableHead><TableHead className="border bg-zinc-950">Non-unique</TableHead><TableHead className="border bg-zinc-950">Sıra</TableHead></TableRow></TableHeader><TableBody>{tableInfo.indexes.map(index => <TableRow key={`${index.Key_name}-${index.Column_name}`}><TableCell className="border py-1">{index.Key_name}</TableCell><TableCell className="border py-1">{index.Column_name}</TableCell><TableCell className="border py-1">{index.Non_unique}</TableCell><TableCell className="border py-1">{index.Seq_in_index}</TableCell></TableRow>)}</TableBody></Table>}</TabsContent>
              <TabsContent value="foreign-keys" className="m-0 min-h-0 flex-1 overflow-auto p-0">{tableInfo.foreignKeys.length === 0 ? <EmptyState icon={Link} title="Foreign key bulunmuyor" description="Bu tablo başka bir tabloya bağlı değil." /> : <Table size="sm"><TableHeader><TableRow><TableHead className="border bg-zinc-950">Kolon</TableHead><TableHead className="border bg-zinc-950">Referans tablo</TableHead><TableHead className="border bg-zinc-950">Referans kolon</TableHead></TableRow></TableHeader><TableBody>{tableInfo.foreignKeys.map(foreignKey => <TableRow key={`${foreignKey.COLUMN_NAME}-${foreignKey.REFERENCED_TABLE_NAME}`}><TableCell className="border py-1">{foreignKey.COLUMN_NAME}</TableCell><TableCell className="border py-1">{foreignKey.REFERENCED_TABLE_NAME}</TableCell><TableCell className="border py-1">{foreignKey.REFERENCED_COLUMN_NAME}</TableCell></TableRow>)}</TableBody></Table>}</TabsContent>
              <TabsContent value="create-sql" className="m-0 min-h-0 flex-1 overflow-auto bg-black/30 p-3"><pre className="whitespace-pre-wrap font-mono text-xs leading-5">{highlightSQL(tableInfo.createSQL)}</pre></TabsContent>
            </Tabs>
          )}
        </TabsContent>

        <TabsContent value="table-data" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-2 py-1">
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={refreshTableData}><RefreshCw className={`h-3.5 w-3.5 ${isTableDataLoading ? 'animate-spin' : ''}`} /> Yenile</button>
            <button type="button" className={`flex items-center gap-1 text-xs hover:text-foreground ${isFilterPanelOpen ? 'text-cyan-400' : 'text-muted-foreground'}`} onClick={() => setIsFilterPanelOpen(previous => !previous)}><Filter className="h-3.5 w-3.5" /> Filtre {effectiveFilters.length > 0 && `(${effectiveFilters.length})`}</button>
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setSorts([])} disabled={sorts.length === 0}><ArrowUpDown className="h-3.5 w-3.5" /> Sıralamayı temizle</button>
            <button type="button" className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300" onClick={() => selectedDatabase && selectedTable && createQueryTab({ databaseName: selectedDatabase, title: `${selectedTable} sorgu`, sql: `SELECT * FROM ${qualifiedSqlName(selectedDatabase, selectedTable)}\nLIMIT 100;` })}><Code className="h-3.5 w-3.5" /> Sorguya aç</button>
            <span className="ml-auto text-[10px] text-zinc-600">Sağ tık: hücre işlemleri • Shift+tık: çoklu sıralama</span>
          </div>

          {isFilterPanelOpen && tableInfo && (
            <div className="shrink-0 space-y-2 border-b border-zinc-800 bg-zinc-950/80 p-2">
              {filters.map(filter => {
                const needsValue = operatorNeedsValue(filter.operator);
                return (
                  <div key={filter.id} className="grid gap-2 sm:grid-cols-[minmax(140px,0.7fr)_minmax(120px,0.5fr)_minmax(180px,1fr)_32px]">
                    <select value={filter.column} onChange={event => updateFilter(filter.id, { column: event.target.value })} className="h-8 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs">
                      {tableInfo.columns.map(column => <option key={column.Field} value={column.Field}>{column.Field}</option>)}
                    </select>
                    <select value={filter.operator} onChange={event => updateFilter(filter.id, { operator: event.target.value as TableDataFilterOperator })} className="h-8 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs">
                      {FILTER_OPERATORS.map(operator => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                    </select>
                    <Input value={filter.value || ''} disabled={!needsValue} onChange={event => updateFilter(filter.id, { value: event.target.value })} placeholder={needsValue ? 'Filtre değeri' : 'Değer gerekmiyor'} className="h-8 text-xs" />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-red-400" onClick={() => removeFilter(filter.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                );
              })}
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => addFilter()}><Plus className="h-3.5 w-3.5" /> Filtre ekle</Button>
                {filters.length > 0 && <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] text-zinc-500" onClick={() => setFilters([])}>Tümünü temizle</Button>}
                <span className="text-[10px] text-zinc-600">Filtreler 350 ms bekleme sonrasında sunucuda uygulanır.</span>
              </div>
            </div>
          )}

          {cellEditError && <div className="shrink-0 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300">{cellEditError}</div>}

          {!tableInfo && isTableInfoLoading ? (
            <LoadingState title="Kolon bilgileri hazırlanıyor" />
          ) : tableDataError && tableData.length === 0 ? (
            <ErrorState title="Tablo verileri yüklenemedi" description={tableDataError} actionLabel="Tekrar dene" onAction={refreshTableData} />
          ) : isTableDataLoading && tableData.length === 0 ? (
            <LoadingState title="Satırlar yükleniyor" description={`${selectedDatabase}.${selectedTable}`} />
          ) : !tableInfo ? (
            <EmptyState icon={TableIcon} title="Tablo seçilmedi" description="Verilerini görmek için bir tablo seçin." />
          ) : tableData.length === 0 ? (
            <EmptyState icon={TableIcon} title={effectiveFilters.length > 0 ? 'Filtre sonucu bulunamadı' : 'Tabloda veri yok'} description={effectiveFilters.length > 0 ? 'Filtre değerlerini değiştirin veya temizleyin.' : 'Sorgu başarılı oldu ancak görüntülenecek satır bulunamadı.'} actionLabel={effectiveFilters.length > 0 ? 'Filtreleri temizle' : undefined} onAction={effectiveFilters.length > 0 ? () => setFilters([]) : undefined} />
          ) : (
            <div className="relative min-h-0 flex-1">
              {isTableDataLoading && <div className="absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden bg-zinc-800"><div className="h-full w-1/3 animate-pulse bg-cyan-400" /></div>}
              {tableDataError && <div className="absolute inset-x-2 top-2 z-20 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{tableDataError}</div>}
              <ScrollArea className="h-full w-full">
                <div className="min-w-max">
                  <Table size="sm" className="w-full">
                    <TableHeader>
                      <TableRow>
                        {tableInfo.columns.map(column => {
                          const sortIndex = sorts.findIndex(sort => sort.column === column.Field);
                          const sort = sortIndex >= 0 ? sorts[sortIndex] : null;
                          return (
                            <TableHead key={column.Field} className="sticky top-0 z-10 cursor-pointer whitespace-nowrap border bg-zinc-950 select-none" onClick={event => handleSortByColumn(column.Field, event.shiftKey)} onContextMenu={event => openColumnMenu(event, column)}>
                              <span className="inline-flex items-center gap-1">
                                {column.Field}
                                {column.Key === 'PRI' && <Key className="h-3 w-3 text-amber-400" />}
                                {sort ? sort.direction === 'asc' ? <ArrowUp className="h-3 w-3 text-cyan-400" /> : <ArrowDown className="h-3 w-3 text-cyan-400" /> : <ArrowUpDown className="h-3 w-3 opacity-35" />}
                                {sorts.length > 1 && sort && <span className="rounded bg-cyan-500/15 px-1 text-[9px] text-cyan-300">{sortIndex + 1}</span>}
                              </span>
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.map((row, rowIndex) => (
                        <TableRow key={(pagination.page - 1) * pagination.pageSize + rowIndex}>
                          {tableInfo.columns.map(column => {
                            const value = row[column.Field];
                            const text = displayValue(value);
                            const className = value === null ? 'text-zinc-500 italic' : typeof value === 'number' ? 'text-blue-400' : typeof value === 'boolean' ? 'text-purple-400' : typeof value === 'object' ? 'text-amber-400' : 'text-green-400';
                            const isEditing = editingCell?.rowIndex === rowIndex && editingCell.column === column.Field;
                            return (
                              <TableCell key={column.Field} className={`max-w-[520px] truncate whitespace-nowrap border p-0 font-mono text-xs ${className}`} title={isEditing ? undefined : text} onDoubleClick={() => startCellEdit(rowIndex, column)} onContextMenu={event => openCellMenu(event, row, rowIndex, column)}>
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    value={editingCell.draft}
                                    disabled={editingCell.isSaving}
                                    className="h-7 min-w-32 w-full border-0 bg-cyan-500/10 px-2 font-mono text-xs text-cyan-100 outline-none ring-1 ring-inset ring-cyan-500/50"
                                    onChange={event => setEditingCell(current => current ? { ...current, draft: event.target.value } : current)}
                                    onKeyDown={event => {
                                      if (event.key === 'Enter') {
                                        event.preventDefault();
                                        void saveCell(rowIndex, column);
                                      }
                                      if (event.key === 'Escape') {
                                        event.preventDefault();
                                        setEditingCell(null);
                                        setCellEditError(null);
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="truncate px-2 py-1">{text}</div>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          )}

          {tableInfo && (
            <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-t border-zinc-800 px-2 py-1 text-[11px] text-zinc-500">
              <span>{pagination.totalRows.toLocaleString('tr-TR')} satır</span>
              <span>•</span>
              <span>{pagination.totalPages.toLocaleString('tr-TR')} sayfa</span>
              <span>•</span>
              <span>{tableInfo.columns.filter(column => column.Key === 'PRI').length > 0 ? 'Hücre düzenleme açık' : 'Primary key yok: düzenleme kapalı'}</span>
              <label className="ml-auto flex items-center gap-1.5">
                Sayfa boyutu
                <select value={pageSize} onChange={event => setPageSize(Number(event.target.value))} className="h-7 rounded border border-zinc-800 bg-zinc-950 px-2 text-[11px] text-zinc-300">
                  {[25, 50, 100, 250, 500].map(size => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={!pagination.hasPreviousPage || isTableDataLoading} onClick={() => setPage(1)}>İlk</Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={!pagination.hasPreviousPage || isTableDataLoading} onClick={() => setPage(previous => Math.max(1, previous - 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <span className="min-w-20 text-center tabular-nums">{pagination.page} / {pagination.totalPages}</span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={!pagination.hasNextPage || isTableDataLoading} onClick={() => setPage(previous => Math.min(pagination.totalPages, previous + 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={!pagination.hasNextPage || isTableDataLoading} onClick={() => setPage(pagination.totalPages)}>Son</Button>
            </div>
          )}
        </TabsContent>

        {queryTabs.map(tab => (
          <TabsContent key={tab.id} value={`query:${tab.id}`} className="m-0 min-h-0 flex-1 overflow-hidden p-0">
            <QueryWorkspace
              tab={tab}
              servers={servers}
              accountId={activeToken}
              onChange={patch => updateQueryTab(tab.id, patch)}
              onDuplicate={() => duplicateQueryTab(tab)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
