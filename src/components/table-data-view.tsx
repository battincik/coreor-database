'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Clipboard,
  Code,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  FileInput,
  Filter,
  Key,
  Link,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react';
import type {
  GridRuntimeStatus,
  TableColumnInfo,
  TableDataFilter,
  TableDataFilterOperator,
  TableDataPagination,
  TableDataSort,
  TableForeignKeyInfo,
  TableInfo
} from 'types';
import { deleteTableRows, fetchTableData, updateTableCell } from '@/lib/databaseApi';
import { qualifiedSqlName, quoteSqlIdentifier, toSqlLiteral } from '@/lib/queryWorkspaceEvents';
import { useAppContextMenu } from '@/components/app-context-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/app-state';

interface TableDataViewProps {
  serverId: string;
  databaseName: string;
  tableName: string;
  accountId?: string | null;
  info: TableInfo;
  onOpenQuery: (title: string, sql: string, runImmediately?: boolean, databaseName?: string | null) => void;
  onFollowForeignKey: (foreignKey: TableForeignKeyInfo, value: unknown) => void;
}

interface EditingCell {
  rowIndex: number;
  column: string;
  draft: string;
  originalValue: unknown;
  isSaving: boolean;
}

interface ValueDialogState {
  rowIndex: number;
  column: TableColumnInfo;
  value: string;
  useNull: boolean;
}

interface ConfirmState {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}

const INITIAL_PAGINATION: TableDataPagination = { page: 1, pageSize: 50, totalRows: 0, totalPages: 1, hasPreviousPage: false, hasNextPage: false };
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

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function binaryValue(value: unknown): { type: 'binary'; base64: string } | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { type?: unknown; base64?: unknown };
  return candidate.type === 'binary' && typeof candidate.base64 === 'string' ? { type: 'binary', base64: candidate.base64 } : null;
}

function displayValue(value: unknown) {
  if (value === null) return '(NULL)';
  if (value === undefined) return '';
  const binary = binaryValue(value);
  if (binary) return `[BLOB • ${Math.round(binary.base64.length * 0.75).toLocaleString('tr-TR')} bayt]`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseEditedValue(draft: string, column: TableColumnInfo, originalValue: unknown) {
  const type = column.Data_type.toUpperCase();
  if (type === 'JSON') return JSON.parse(draft);
  if (/^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|BIT|YEAR)$/.test(type)) {
    const numeric = Number(draft);
    if (!Number.isFinite(numeric)) throw new Error('Bu kolon sayısal bir değer bekliyor.');
    return numeric;
  }
  if (/^(BOOL|BOOLEAN)$/.test(type)) {
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

function primaryKeyColumns(info: TableInfo) {
  return info.columns.filter(column => column.Key === 'PRI').map(column => column.Field);
}

function primaryKeyObject(row: Record<string, unknown>, info: TableInfo) {
  const columns = primaryKeyColumns(info);
  if (!columns.length || columns.some(column => row[column] === undefined)) return null;
  return Object.fromEntries(columns.map(column => [column, row[column]]));
}

function stableRowKey(row: Record<string, unknown>, info: TableInfo, index: number) {
  const key = primaryKeyObject(row, info);
  return key ? JSON.stringify(key) : `row-${index}`;
}

function rowWhereSql(row: Record<string, unknown>, info: TableInfo) {
  const key = primaryKeyObject(row, info);
  if (!key) return '';
  return Object.entries(key).map(([column, value]) => `${quoteSqlIdentifier(column)} <=> ${toSqlLiteral(value)}`).join(' AND ');
}

function csvCell(value: unknown) {
  const text = value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
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

function ConfirmDialog({ state, onClose }: { state: ConfirmState | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!state || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[270] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Kapat" />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <h3 className="text-sm font-semibold text-zinc-100">{state.title}</h3>
        <p className="mt-2 text-xs leading-5 text-zinc-500">{state.description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>İptal</Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await state.onConfirm(); onClose(); } finally { setBusy(false); }
          }}>{busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{state.confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ValueDialog({ state, onChange, onClose, onSave }: {
  state: ValueDialogState | null;
  onChange: (state: ValueDialogState) => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!state || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[270] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Kapat" />
      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div><h3 className="text-sm font-semibold text-zinc-100">{state.column.Field} değerini düzenle</h3><p className="mt-0.5 text-[10px] text-zinc-600">{state.column.Type}</p></div>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="p-4">
          <textarea autoFocus value={state.value} disabled={state.useNull} onChange={event => onChange({ ...state, value: event.target.value })} className="h-72 w-full resize-none rounded border border-zinc-800 bg-black/40 p-3 font-mono text-xs leading-5 text-zinc-200 outline-none focus:border-cyan-500/60 disabled:opacity-40" />
          <label className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500"><input type="checkbox" checked={state.useNull} disabled={state.column.Null !== 'YES'} onChange={event => onChange({ ...state, useNull: event.target.checked })} /> NULL olarak kaydet {state.column.Null !== 'YES' && '(kolon NULL kabul etmiyor)'}</label>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>İptal</Button>
          <Button type="button" size="sm" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await onSave(); } finally { setBusy(false); }
          }}>{busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Kaydet</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function TableDataView({ serverId, databaseName, tableName, accountId, info, onOpenQuery, onFollowForeignKey }: TableDataViewProps) {
  const { openContextMenu } = useAppContextMenu();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pagination, setPagination] = useState<TableDataPagination>(INITIAL_PAGINATION);
  const [sorts, setSorts] = useState<TableDataSort[]>([]);
  const [filters, setFilters] = useState<TableDataFilter[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [valueDialog, setValueDialog] = useState<ValueDialogState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileTargetRef = useRef<{ rowIndex: number; column: TableColumnInfo } | null>(null);
  const totalCache = useRef<{ key: string; totalRows: number } | null>(null);
  const requestSequence = useRef(0);
  const debouncedFilters = useDebouncedValue(filters, 350);

  const effectiveFilters = useMemo(() => debouncedFilters.filter(filter => filter.column && (!operatorNeedsValue(filter.operator) || Boolean(filter.value?.trim()))), [debouncedFilters]);
  const filterKey = JSON.stringify(effectiveFilters);
  const cacheKey = `${serverId}:${databaseName}:${tableName}:${filterKey}`;
  const keyColumns = primaryKeyColumns(info);
  const selectedDataRows = useMemo(() => rows.filter((row, index) => selectedRows.has(stableRowKey(row, info, index))), [rows, selectedRows, info]);

  const refresh = () => {
    totalCache.current = null;
    setRefreshNonce(previous => previous + 1);
  };

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('coreor:refresh-table-data', handler);
    return () => window.removeEventListener('coreor:refresh-table-data', handler);
  }, []);

  useEffect(() => {
    setPage(1);
    setPageSize(50);
    setPagination(INITIAL_PAGINATION);
    setSorts([]);
    setFilters([]);
    setSelectedRows(new Set());
    setEditing(null);
    setError(null);
    totalCache.current = null;
  }, [serverId, databaseName, tableName]);

  useEffect(() => {
    setPage(1);
    totalCache.current = null;
  }, [filterKey, pageSize]);

  useEffect(() => {
    const load = async () => {
      if (!accountId) return;
      const sequence = ++requestSequence.current;
      setLoading(true);
      setError(null);
      const cachedTotal = totalCache.current?.key === cacheKey ? totalCache.current.totalRows : undefined;
      try {
        const response = await fetchTableData(serverId, databaseName, tableName, accountId, { page, pageSize, sorts, filters: effectiveFilters, includeTotal: cachedTotal === undefined, knownTotalRows: cachedTotal });
        if (sequence !== requestSequence.current) return;
        setRows(response.data || []);
        setPagination(response.pagination);
        totalCache.current = { key: cacheKey, totalRows: response.pagination.totalRows };
        setSelectedRows(new Set());
        if (response.pagination.page !== page) setPage(response.pagination.page);
      } catch (loadError) {
        if (sequence !== requestSequence.current) return;
        const code = (loadError as Error & { code?: string }).code;
        if (code !== 'REQUEST_SUPERSEDED') setError(loadError instanceof Error ? loadError.message : 'Tablo verileri yüklenemedi.');
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    };
    void load();
  }, [serverId, databaseName, tableName, accountId, page, pageSize, sorts, filterKey, refreshNonce]);

  useEffect(() => {
    const detail: GridRuntimeStatus = { page: pagination.page, pageSize: pagination.pageSize, totalRows: pagination.totalRows, totalPages: pagination.totalPages, filters: effectiveFilters.length, sorts: sorts.length, isLoading: loading };
    window.dispatchEvent(new CustomEvent<GridRuntimeStatus>('coreor:grid-status', { detail }));
  }, [pagination, effectiveFilters.length, sorts.length, loading]);

  const addFilter = (column?: string, operator: TableDataFilterOperator = 'contains', value = '') => {
    setFilters(previous => [...previous, { id: createId('filter'), column: column || info.columns[0]?.Field || '', operator, value }]);
    setFilterOpen(true);
  };

  const updateFilter = (id: string | undefined, patch: Partial<TableDataFilter>) => setFilters(previous => previous.map(filter => filter.id === id ? { ...filter, ...patch } : filter));

  const sortColumn = (column: string, direction?: 'asc' | 'desc', additive = false) => {
    setPage(1);
    setSorts(previous => {
      if (direction) return additive ? [...previous.filter(sort => sort.column !== column), { column, direction }] : [{ column, direction }];
      const current = previous.find(sort => sort.column === column);
      const next = !current ? { column, direction: 'asc' as const } : current.direction === 'asc' ? { column, direction: 'desc' as const } : null;
      if (!additive) return next ? [next] : [];
      return [...previous.filter(sort => sort.column !== column), ...(next ? [next] : [])];
    });
  };

  const startEdit = (rowIndex: number, column: TableColumnInfo, draftOverride?: string) => {
    const row = rows[rowIndex];
    if (!primaryKeyObject(row, info)) {
      setEditError('Hücre düzenlemek için tabloda primary key bulunmalıdır.');
      return;
    }
    const value = row[column.Field];
    setEditError(null);
    setEditing({ rowIndex, column: column.Field, draft: draftOverride ?? (value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)), originalValue: value, isSaving: false });
  };

  const saveValue = async (rowIndex: number, column: TableColumnInfo, override?: unknown) => {
    if (!accountId) return;
    const row = rows[rowIndex];
    const key = primaryKeyObject(row, info);
    if (!key) { setEditError('Primary key bulunamadı.'); return; }
    const editor = editing?.rowIndex === rowIndex && editing.column === column.Field ? editing : null;
    let value = override;
    try {
      if (override === undefined) value = parseEditedValue(editor?.draft || '', column, row[column.Field]);
    } catch (parseError) {
      setEditError(parseError instanceof Error ? parseError.message : 'Değer dönüştürülemedi.');
      return;
    }
    if (editor) setEditing({ ...editor, isSaving: true });
    setEditError(null);
    try {
      await updateTableCell(serverId, { database: databaseName, table: tableName, column: column.Field, value, primaryKey: key }, accountId);
      setRows(previous => previous.map((item, index) => index === rowIndex ? { ...item, [column.Field]: value } : item));
      setEditing(null);
      setValueDialog(null);
    } catch (saveError) {
      setEditError(saveError instanceof Error ? saveError.message : 'Hücre güncellenemedi.');
      if (editor) setEditing({ ...editor, isSaving: false });
    }
  };

  const requestDelete = (targetRows: Record<string, unknown>[]) => {
    const keys = targetRows.map(row => primaryKeyObject(row, info)).filter((value): value is Record<string, unknown> => Boolean(value));
    setConfirm({
      title: `${keys.length} satırı sil`,
      description: 'Seçili satırlar primary key üzerinden transaction içinde tek tek silinecek. İşlem geri alınamaz.',
      confirmLabel: 'Satırları sil',
      onConfirm: async () => {
        if (!accountId || !keys.length) return;
        await deleteTableRows(serverId, { database: databaseName, table: tableName, primaryKeys: keys }, accountId);
        refresh();
      }
    });
  };

  const exportRows = (format: 'json' | 'csv', sourceRows = selectedDataRows.length ? selectedDataRows : rows) => {
    if (format === 'json') downloadText(`${tableName}-${Date.now()}.json`, JSON.stringify(sourceRows, null, 2), 'application/json;charset=utf-8');
    else {
      const columns = info.columns.map(column => column.Field);
      const csv = [columns.map(csvCell).join(','), ...sourceRows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\n');
      downloadText(`${tableName}-${Date.now()}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
    }
  };

  const duplicateSql = (row: Record<string, unknown>, includeKeys: boolean) => {
    const columns = info.columns.filter(column => includeKeys || (column.Key !== 'PRI' && !/auto_increment/i.test(column.Extra)));
    const table = qualifiedSqlName(databaseName, tableName);
    return `INSERT INTO ${table} (${columns.map(column => quoteSqlIdentifier(column.Field)).join(', ')})\nVALUES (${columns.map(column => toSqlLiteral(row[column.Field])).join(', ')});`;
  };

  const insertTemplate = () => {
    const columns = info.columns.filter(column => !/auto_increment/i.test(column.Extra));
    const table = qualifiedSqlName(databaseName, tableName);
    onOpenQuery(`${tableName} yeni satır`, `INSERT INTO ${table} (${columns.map(column => quoteSqlIdentifier(column.Field)).join(', ')})\nVALUES (${columns.map(column => column.Default !== null ? toSqlLiteral(column.Default) : column.Null === 'YES' ? 'NULL' : "''").join(', ')});`);
  };

  const saveBlob = (value: unknown, column: string) => {
    const binary = binaryValue(value);
    if (!binary) return;
    const bytes = Uint8Array.from(atob(binary.base64), character => character.charCodeAt(0));
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${tableName}-${column}-${Date.now()}.bin`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openCellMenu = (event: React.MouseEvent, row: Record<string, unknown>, rowIndex: number, column: TableColumnInfo) => {
    const rowKey = stableRowKey(row, info, rowIndex);
    const wasSelected = selectedRows.has(rowKey);
    const contextRows = wasSelected && selectedDataRows.length ? selectedDataRows : [row];
    if (!wasSelected) setSelectedRows(new Set([rowKey]));

    const value = row[column.Field];
    const primaryKey = primaryKeyObject(row, info);
    const foreignKey = info.foreignKeys.find(item => item.COLUMN_NAME === column.Field);
    const text = displayValue(value);
    const isUrl = typeof value === 'string' && /^https?:\/\//i.test(value);
    const binary = binaryValue(value);
    const table = qualifiedSqlName(databaseName, tableName);
    const where = rowWhereSql(row, info);

    openContextMenu(event, [
      { id: 'copy', label: 'Kopyala', icon: Copy, shortcut: 'Ctrl+C', onSelect: () => navigator.clipboard.writeText(value === null ? 'NULL' : text) },
      { id: 'paste', label: 'Yapıştır', icon: Clipboard, shortcut: 'Ctrl+V', disabled: !primaryKey, onSelect: async () => {
        try { startEdit(rowIndex, column, await navigator.clipboard.readText()); } catch { setEditError('Panoya erişilemedi. Tarayıcı iznini kontrol edin.'); }
      } },
      { id: 'set-value', label: 'Değer Ekle / Düzenle', icon: Code, disabled: !primaryKey, onSelect: () => setValueDialog({ rowIndex, column, value: value === null ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value), useNull: value === null }) },
      { id: 'file-in', label: 'TEXT/BLOB alanının içine dosya koy', icon: FileInput, disabled: !primaryKey, onSelect: () => { fileTargetRef.current = { rowIndex, column }; fileInputRef.current?.click(); } },
      { id: 'blob-out', label: 'BLOB\'u dosyaya kaydet', icon: FileDown, disabled: !binary, onSelect: () => saveBlob(value, column.Field) },
      { id: 'open-url', label: 'URL aç', icon: ExternalLink, disabled: !isUrl, onSelect: () => window.open(String(value), '_blank', 'noopener,noreferrer') },
      { id: 'follow-fk', label: 'Follow Foreign Key', icon: Link, disabled: !foreignKey || value === null, onSelect: () => foreignKey && onFollowForeignKey(foreignKey, value) },
      { id: 'sep-1', separator: true },
      { id: 'insert-row', label: 'Satır Ekle', icon: Plus, onSelect: insertTemplate },
      { id: 'duplicate-no-keys', label: 'Anahtarlar olmadan yinelenen satır', icon: Copy, onSelect: () => onOpenQuery(`${tableName} satır kopyası`, duplicateSql(row, false)) },
      { id: 'duplicate-keys', label: 'Yinelenen satır — anahtarları koru', icon: Copy, onSelect: () => onOpenQuery(`${tableName} tam satır kopyası`, duplicateSql(row, true)) },
      { id: 'cancel-edit', label: 'Düzenlemeyi iptal et', icon: X, disabled: !editing, onSelect: () => { setEditing(null); setEditError(null); } },
      { id: 'delete-selected', label: `Seçili satırları sil (${contextRows.length})`, icon: Trash2, danger: true, disabled: contextRows.some(item => !primaryKeyObject(item, info)), onSelect: () => requestDelete(contextRows) },
      { id: 'sep-2', separator: true },
      { id: 'reset-sort', label: 'Sıralamayı Sıfırla', icon: ArrowUpDown, disabled: sorts.length === 0, onSelect: () => setSorts([]) },
      { id: 'filter', label: value === null ? 'NULL değerleri filtrele' : 'Bu değere göre filtrele', icon: Filter, onSelect: () => addFilter(column.Field, value === null ? 'isNull' : 'equals', value === null ? '' : String(value)) },
      { id: 'sep-3', separator: true },
      { id: 'export', label: 'Satırları dışa Aktar', icon: Download, children: [
        { id: 'export-csv', label: 'CSV olarak aktar', icon: FileDown, onSelect: () => exportRows('csv', contextRows) },
        { id: 'export-json', label: 'JSON olarak aktar', icon: FileDown, onSelect: () => exportRows('json', contextRows) }
      ] },
      { id: 'refresh', label: 'Yenile', icon: RefreshCw, onSelect: refresh },
      { id: 'sep-4', separator: true },
      { id: 'update-query', label: 'Bu hücre için UPDATE sorgusu', icon: Code, disabled: !where, onSelect: () => onOpenQuery(`${tableName} UPDATE`, `UPDATE ${table}\nSET ${quoteSqlIdentifier(column.Field)} = ${toSqlLiteral(value)}\nWHERE ${where}\nLIMIT 1;`) }
    ], `${column.Field}: ${text}`);
  };

  const openColumnMenu = (event: React.MouseEvent, column: TableColumnInfo) => openContextMenu(event, [
    { id: 'sort-asc', label: 'Artan sırala', icon: ArrowUp, onSelect: () => sortColumn(column.Field, 'asc') },
    { id: 'sort-desc', label: 'Azalan sırala', icon: ArrowDown, onSelect: () => sortColumn(column.Field, 'desc') },
    { id: 'multi-sort', label: 'Çoklu sıralamaya ekle', icon: ArrowUpDown, onSelect: () => sortColumn(column.Field, 'asc', true) },
    { id: 'sep', separator: true },
    { id: 'filter', label: 'Bu kolona filtre ekle', icon: Filter, onSelect: () => addFilter(column.Field) },
    { id: 'copy-name', label: 'Kolon adını kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(column.Field) },
    { id: 'reset', label: 'Sıralamayı sıfırla', icon: Trash2, disabled: !sorts.length, onSelect: () => setSorts([]) }
  ], `${column.Field} • ${column.Type}`);

  const toggleRow = (row: Record<string, unknown>, index: number, checked: boolean) => {
    const key = stableRowKey(row, info, index);
    setSelectedRows(previous => { const next = new Set(previous); if (checked) next.add(key); else next.delete(key); return next; });
  };

  const toggleAll = (checked: boolean) => setSelectedRows(checked ? new Set(rows.map((row, index) => stableRowKey(row, info, index))) : new Set());

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-2 py-1">
        <button type="button" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200" onClick={refresh}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile</button>
        <button type="button" className={`flex items-center gap-1 text-xs ${filterOpen ? 'text-cyan-400' : 'text-zinc-500 hover:text-zinc-200'}`} onClick={() => setFilterOpen(previous => !previous)}><Filter className="h-3.5 w-3.5" /> Filtre {effectiveFilters.length ? `(${effectiveFilters.length})` : ''}</button>
        <button type="button" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 disabled:opacity-40" disabled={!sorts.length} onClick={() => setSorts([])}><ArrowUpDown className="h-3.5 w-3.5" /> Sıralamayı temizle</button>
        <button type="button" className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300" onClick={insertTemplate}><Plus className="h-3.5 w-3.5" /> Satır ekle</button>
        {selectedRows.size > 0 && <button type="button" className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300" onClick={() => requestDelete(selectedDataRows)}><Trash2 className="h-3.5 w-3.5" /> {selectedRows.size} satırı sil</button>}
        <span className="ml-auto text-[10px] text-zinc-600">Sağ tık: gelişmiş hücre/satır işlemleri • Çift tık: düzenle</span>
      </div>

      {filterOpen && <div className="shrink-0 space-y-2 border-b border-zinc-800 bg-zinc-950/80 p-2">
        {filters.map(filter => <div key={filter.id} className="grid gap-2 sm:grid-cols-[minmax(140px,0.7fr)_minmax(120px,0.5fr)_minmax(180px,1fr)_32px]">
          <select value={filter.column} onChange={event => updateFilter(filter.id, { column: event.target.value })} className="h-8 rounded border border-zinc-800 bg-zinc-950 px-2 text-xs">{info.columns.map(column => <option key={column.Field}>{column.Field}</option>)}</select>
          <select value={filter.operator} onChange={event => updateFilter(filter.id, { operator: event.target.value as TableDataFilterOperator })} className="h-8 rounded border border-zinc-800 bg-zinc-950 px-2 text-xs">{FILTER_OPERATORS.map(operator => <option key={operator.value} value={operator.value}>{operator.label}</option>)}</select>
          <Input value={filter.value || ''} disabled={!operatorNeedsValue(filter.operator)} onChange={event => updateFilter(filter.id, { value: event.target.value })} className="h-8 text-xs" placeholder="Filtre değeri" />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => setFilters(previous => previous.filter(item => item.id !== filter.id))}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>)}
        <div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-[10px]" onClick={() => addFilter()}><Plus className="h-3 w-3" /> Filtre ekle</Button>{filters.length > 0 && <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setFilters([])}>Tümünü temizle</Button>}</div>
      </div>}

      {editError && <div className="shrink-0 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] text-red-300">{editError}</div>}

      {error && rows.length === 0 ? <ErrorState title="Tablo verileri yüklenemedi" description={error} actionLabel="Tekrar dene" onAction={refresh} /> : loading && rows.length === 0 ? <LoadingState title="Satırlar yükleniyor" description={`${databaseName}.${tableName}`} /> : rows.length === 0 ? <EmptyState icon={Code} title={effectiveFilters.length ? 'Filtre sonucu bulunamadı' : 'Tabloda veri yok'} description={effectiveFilters.length ? 'Filtreleri değiştirin veya temizleyin.' : 'Yeni satır eklemek için üst araç çubuğunu kullanın.'} /> : (
        <div className="relative min-h-0 flex-1">
          {loading && <div className="absolute inset-x-0 top-0 z-40 h-0.5 overflow-hidden bg-zinc-800"><div className="h-full w-1/3 animate-pulse bg-cyan-400" /></div>}
          {error && <div className="absolute inset-x-2 top-2 z-30 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">{error}</div>}
          <ScrollArea className="h-full w-full"><div className="min-w-max pb-10"><Table size="sm" className="w-full">
            <TableHeader><TableRow><TableHead className="sticky left-0 top-0 z-30 w-9 border bg-zinc-950 text-center"><input type="checkbox" checked={rows.length > 0 && selectedRows.size === rows.length} onChange={event => toggleAll(event.target.checked)} /></TableHead>{info.columns.map(column => {
              const sortIndex = sorts.findIndex(sort => sort.column === column.Field);
              const sort = sortIndex >= 0 ? sorts[sortIndex] : null;
              return <TableHead key={column.Field} className="sticky top-0 z-20 cursor-pointer whitespace-nowrap border bg-zinc-950 select-none" onClick={event => sortColumn(column.Field, undefined, event.shiftKey)} onContextMenu={event => openColumnMenu(event, column)}><span className="inline-flex items-center gap-1">{column.Field}{column.Key === 'PRI' && <Key className="h-3 w-3 text-amber-400" />}{sort ? sort.direction === 'asc' ? <ArrowUp className="h-3 w-3 text-cyan-400" /> : <ArrowDown className="h-3 w-3 text-cyan-400" /> : <ArrowUpDown className="h-3 w-3 opacity-30" />}{sorts.length > 1 && sort && <span className="rounded bg-cyan-500/15 px-1 text-[9px] text-cyan-300">{sortIndex + 1}</span>}</span></TableHead>;
            })}</TableRow></TableHeader>
            <TableBody>{rows.map((row, rowIndex) => {
              const key = stableRowKey(row, info, rowIndex);
              return <TableRow key={key} className={selectedRows.has(key) ? 'bg-cyan-500/[0.06]' : ''}><TableCell className="sticky left-0 z-10 border bg-zinc-950/95 text-center"><input type="checkbox" checked={selectedRows.has(key)} onChange={event => toggleRow(row, rowIndex, event.target.checked)} /></TableCell>{info.columns.map(column => {
                const value = row[column.Field];
                const text = displayValue(value);
                const isEditing = editing?.rowIndex === rowIndex && editing.column === column.Field;
                const tone = value === null ? 'text-zinc-500 italic' : binaryValue(value) ? 'text-amber-300' : typeof value === 'number' ? 'text-blue-400' : typeof value === 'boolean' ? 'text-purple-400' : typeof value === 'object' ? 'text-amber-400' : 'text-green-400';
                return <TableCell key={column.Field} className={`relative max-w-[520px] overflow-visible whitespace-nowrap border p-0 font-mono text-[11px] ${tone}`} title={isEditing ? undefined : text} onDoubleClick={() => startEdit(rowIndex, column)} onContextMenu={event => openCellMenu(event, row, rowIndex, column)}>{isEditing ? <div className="relative min-w-40"><input autoFocus value={editing.draft} disabled={editing.isSaving} onChange={event => setEditing(current => current ? { ...current, draft: event.target.value } : current)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void saveValue(rowIndex, column); } if (event.key === 'Escape') { event.preventDefault(); setEditing(null); setEditError(null); } }} className="h-7 w-full border-0 bg-cyan-500/10 px-2 font-mono text-[11px] text-cyan-100 outline-none ring-1 ring-inset ring-cyan-500/60" /><div className="absolute right-0 top-[calc(100%+2px)] z-50 flex items-center rounded-md border border-zinc-700 bg-zinc-950 p-0.5 shadow-xl"><button type="button" className="flex h-6 w-6 items-center justify-center rounded text-emerald-400 hover:bg-emerald-500/10" disabled={editing.isSaving} onClick={() => void saveValue(rowIndex, column)} title="Kaydet">{editing.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}</button><button type="button" className="flex h-6 w-6 items-center justify-center rounded text-red-400 hover:bg-red-500/10" disabled={editing.isSaving} onClick={() => { setEditing(null); setEditError(null); }} title="İptal"><X className="h-3.5 w-3.5" /></button></div></div> : <div className="truncate px-2 py-1">{text}</div>}</TableCell>;
              })}</TableRow>;
            })}</TableBody>
          </Table></div><ScrollBar orientation="horizontal" /></ScrollArea>
        </div>
      )}

      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-t border-zinc-800 px-2 py-1 text-[10px] text-zinc-500"><span>{pagination.totalRows.toLocaleString('tr-TR')} satır</span><span>•</span><span>{pagination.totalPages.toLocaleString('tr-TR')} sayfa</span><span>•</span><span>{keyColumns.length ? `Primary key: ${keyColumns.join(', ')}` : 'Primary key yok: düzenleme kapalı'}</span>{selectedRows.size > 0 && <><span>•</span><span className="text-cyan-400">{selectedRows.size} seçili</span></>}<label className="ml-auto flex items-center gap-1.5">Sayfa boyutu<select value={pageSize} onChange={event => setPageSize(Number(event.target.value))} className="h-7 rounded border border-zinc-800 bg-zinc-950 px-2 text-[10px]">{[25, 50, 100, 250, 500].map(size => <option key={size}>{size}</option>)}</select></label><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" disabled={!pagination.hasPreviousPage || loading} onClick={() => setPage(1)}>İlk</Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={!pagination.hasPreviousPage || loading} onClick={() => setPage(previous => Math.max(1, previous - 1))}><ArrowUp className="h-3.5 w-3.5 -rotate-90" /></Button><span className="min-w-20 text-center">{pagination.page} / {pagination.totalPages}</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={!pagination.hasNextPage || loading} onClick={() => setPage(previous => Math.min(pagination.totalPages, previous + 1))}><ArrowDown className="h-3.5 w-3.5 -rotate-90" /></Button><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" disabled={!pagination.hasNextPage || loading} onClick={() => setPage(pagination.totalPages)}>Son</Button></div>

      <input ref={fileInputRef} type="file" className="hidden" onChange={async event => {
        const file = event.target.files?.[0];
        const target = fileTargetRef.current;
        event.target.value = '';
        if (!file || !target) return;
        if (file.size > 6_000_000) { setEditError('Dosya en fazla 6 MB olabilir.'); return; }
        const binaryColumn = /BLOB|BINARY|GEOMETRY/i.test(target.column.Data_type);
        if (binaryColumn) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = '';
          for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
          await saveValue(target.rowIndex, target.column, { type: 'binary', base64: btoa(binary) });
        } else await saveValue(target.rowIndex, target.column, await file.text());
      }} />
      <ValueDialog state={valueDialog} onChange={setValueDialog} onClose={() => setValueDialog(null)} onSave={async () => {
        if (!valueDialog) return;
        try {
          const nextValue = valueDialog.useNull ? null : parseEditedValue(valueDialog.value, valueDialog.column, rows[valueDialog.rowIndex]?.[valueDialog.column.Field]);
          await saveValue(valueDialog.rowIndex, valueDialog.column, nextValue);
        } catch (valueError) {
          setEditError(valueError instanceof Error ? valueError.message : 'Değer dönüştürülemedi.');
        }
      }} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
