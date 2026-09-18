'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Database,
  RefreshCw,
  RotateCcw,
  Search,
  Table as TableIcon
} from 'lucide-react';
import type { DatabaseCatalogItem, DatabaseTable } from 'types';
import { formatStorageBytes, formatStorageMb } from '@/lib/formatStorageSize';
import { requestTableColumnAction } from '@/lib/tableColumnSizing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/app-state';

interface DatabaseCatalogViewProps {
  mode: 'databases' | 'tables';
  databases: DatabaseCatalogItem[];
  selectedDatabase: string | null;
  selectedTable: string | null;
  activeServerName?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onRefresh: () => void | Promise<void>;
  onDatabaseSelect: (databaseName: string) => void;
  onTableSelect: (databaseName: string, tableName: string) => void;
  onDatabaseContextMenu: (event: React.MouseEvent, databaseName: string) => void;
  onTableContextMenu: (event: React.MouseEvent, databaseName: string, tableName: string) => void;
  onOpenQuery: (databaseName: string | null) => void;
}

type SortDirection = 'asc' | 'desc';
type SortState = { key: string; direction: SortDirection };

interface ColumnDefinition {
  key: string;
  label: string;
  sortKey?: string;
  align?: 'left' | 'right';
  sticky?: boolean;
  className?: string;
}

const DATABASE_COLUMNS: ColumnDefinition[] = [
  { key: 'name', label: 'Veritabanı', sortKey: 'name' },
  { key: 'tableCount', label: 'Tablo', sortKey: 'tableCount', align: 'right' },
  { key: 'totalRows', label: 'Tahmini satır', sortKey: 'totalRows', align: 'right' },
  { key: 'totalSizeMB', label: 'Toplam boyut', sortKey: 'totalSizeMB', align: 'right' },
  { key: 'dataSizeMB', label: 'Veri boyutu', align: 'right' },
  { key: 'indexSizeMB', label: 'İndeks boyutu', align: 'right' },
  { key: 'defaultCharset', label: 'Charset' },
  { key: 'defaultCollation', label: 'Collation' }
];

const TABLE_COLUMNS: ColumnDefinition[] = [
  { key: 'tableName', label: 'Tablo adı', sortKey: 'tableName', sticky: true },
  { key: 'engine', label: 'Motor', sortKey: 'engine' },
  { key: 'tableType', label: 'Tür' },
  { key: 'rows', label: 'Tahmini satır', sortKey: 'rows', align: 'right' },
  { key: 'columns', label: 'Kolon', sortKey: 'columns', align: 'right' },
  { key: 'sizeMB', label: 'Toplam boyut', sortKey: 'sizeMB', align: 'right' },
  { key: 'dataSizeMB', label: 'Veri', align: 'right' },
  { key: 'indexSizeMB', label: 'İndeks', align: 'right' },
  { key: 'freeSizeMB', label: 'Boş alan', align: 'right' },
  { key: 'avgRowLength', label: 'Ort. satır', align: 'right' },
  { key: 'rowFormat', label: 'Row format' },
  { key: 'collation', label: 'Collation' },
  { key: 'autoIncrement', label: 'Auto inc.', align: 'right' },
  { key: 'indexCount', label: 'İndeks', align: 'right' },
  { key: 'foreignKeyCount', label: 'FK', align: 'right' },
  { key: 'createdAt', label: 'Oluşturulma', sortKey: 'createdAt' },
  { key: 'updatedAt', label: 'Güncellenme', sortKey: 'updatedAt' },
  { key: 'comment', label: 'Yorum', className: 'min-w-72' }
];

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('tr-TR') : '0';
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function SortButton({ active, direction, children, onClick }: {
  active: boolean;
  direction: SortDirection;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 whitespace-nowrap ${active ? 'text-cyan-300' : 'text-zinc-400 hover:text-zinc-200'}`}
      onClick={onClick}
    >
      {children}
      {active ? direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
    </button>
  );
}

function databaseCell(database: DatabaseCatalogItem, key: string) {
  switch (key) {
    case 'name':
      return <span className="flex items-center gap-2"><Database className="h-3.5 w-3.5 text-emerald-500" />{database.name}</span>;
    case 'tableCount': return formatNumber(database.tableCount);
    case 'totalRows': return formatNumber(database.totalRows);
    case 'totalSizeMB': return formatStorageMb(database.totalSizeMB);
    case 'dataSizeMB': return formatStorageMb(database.dataSizeMB);
    case 'indexSizeMB': return formatStorageMb(database.indexSizeMB);
    case 'defaultCharset': return database.defaultCharset || '—';
    case 'defaultCollation': return database.defaultCollation || '—';
    default: return '—';
  }
}

function tableCell(table: DatabaseTable, key: string) {
  switch (key) {
    case 'tableName': return <span className="flex items-center gap-2"><TableIcon className="h-3.5 w-3.5 text-blue-500" />{table.tableName}</span>;
    case 'engine': return table.engine;
    case 'tableType': return table.tableType;
    case 'rows': return formatNumber(table.rows);
    case 'columns': return formatNumber(table.columns);
    case 'sizeMB': return formatStorageMb(table.sizeMB);
    case 'dataSizeMB': return formatStorageMb(table.dataSizeMB);
    case 'indexSizeMB': return formatStorageMb(table.indexSizeMB);
    case 'freeSizeMB': return formatStorageMb(table.freeSizeMB);
    case 'avgRowLength': return formatStorageBytes(table.avgRowLength);
    case 'rowFormat': return table.rowFormat || '—';
    case 'collation': return table.collation || '—';
    case 'autoIncrement': return table.autoIncrement === null ? '—' : String(table.autoIncrement);
    case 'indexCount': return formatNumber(table.indexCount);
    case 'foreignKeyCount': return formatNumber(table.foreignKeyCount);
    case 'createdAt': return formatDate(table.createdAt);
    case 'updatedAt': return formatDate(table.updatedAt);
    case 'comment': return table.comment || '—';
    default: return '—';
  }
}

export function DatabaseCatalogView({
  mode,
  databases,
  selectedDatabase,
  selectedTable,
  activeServerName,
  isLoading,
  error,
  onRefresh,
  onDatabaseSelect,
  onTableSelect,
  onDatabaseContextMenu,
  onTableContextMenu,
  onOpenQuery
}: DatabaseCatalogViewProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ key: mode === 'databases' ? 'name' : 'tableName', direction: 'asc' });
  const pageSize = 100;

  useEffect(() => {
    setSearch('');
    setPage(1);
    setSort({ key: mode === 'databases' ? 'name' : 'tableName', direction: 'asc' });
  }, [mode, selectedDatabase]);

  const selectedDatabaseItem = databases.find(database => database.name === selectedDatabase) ?? null;
  const databaseRows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR');
    const rows = databases.filter(database => !normalizedSearch || database.name.toLocaleLowerCase('tr-TR').includes(normalizedSearch));
    return [...rows].sort((left, right) => {
      const leftValue = sort.key === 'name' ? left.name : sort.key === 'tableCount' ? left.tableCount : sort.key === 'totalRows' ? left.totalRows : Number(left.totalSizeMB);
      const rightValue = sort.key === 'name' ? right.name : sort.key === 'tableCount' ? right.tableCount : sort.key === 'totalRows' ? right.totalRows : Number(right.totalSizeMB);
      const comparison = typeof leftValue === 'string' && typeof rightValue === 'string'
        ? leftValue.localeCompare(rightValue, 'tr-TR')
        : Number(leftValue) - Number(rightValue);
      return comparison * (sort.direction === 'asc' ? 1 : -1);
    });
  }, [databases, search, sort]);

  const tableRows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR');
    const rows = (selectedDatabaseItem?.tableDetails || []).filter(table => (
      !normalizedSearch || [table.tableName, table.comment, table.engine, table.tableType, table.collation, table.rowFormat]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase('tr-TR').includes(normalizedSearch))
    ));
    const readValue = (table: DatabaseTable) => {
      switch (sort.key) {
        case 'rows': return table.rows;
        case 'columns': return table.columns;
        case 'sizeMB': return Number(table.sizeMB);
        case 'createdAt': return table.createdAt || '';
        case 'updatedAt': return table.updatedAt || '';
        case 'engine': return table.engine;
        default: return table.tableName;
      }
    };
    return [...rows].sort((left, right) => {
      const leftValue = readValue(left);
      const rightValue = readValue(right);
      const comparison = typeof leftValue === 'string' && typeof rightValue === 'string'
        ? leftValue.localeCompare(rightValue, 'tr-TR')
        : Number(leftValue) - Number(rightValue);
      return comparison * (sort.direction === 'asc' ? 1 : -1);
    });
  }, [selectedDatabaseItem, search, sort]);

  const activeRows = mode === 'databases' ? databaseRows : tableRows;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / pageSize));
  const pagedRows = activeRows.slice((page - 1) * pageSize, page * pageSize);
  const columns = mode === 'databases' ? DATABASE_COLUMNS : TABLE_COLUMNS;
  const columnStorageKey = `coreor:catalog-column-widths:v2:${activeServerName || 'server'}:${mode}:${selectedDatabase || 'all'}`;

  useEffect(() => {
    setPage(previous => Math.min(previous, totalPages));
  }, [totalPages]);

  const changeSort = (key: string) => {
    setSort(previous => previous.key === key
      ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });
    setPage(1);
  };

  if (isLoading) return <LoadingState title={mode === 'databases' ? 'Veritabanları okunuyor' : 'Tablolar hazırlanıyor'} description={activeServerName || undefined} />;
  if (error) return <ErrorState title="Katalog yüklenemedi" description={error} actionLabel="Tekrar dene" onAction={onRefresh} />;
  if (mode === 'databases' && databases.length === 0) return <EmptyState icon={Database} title="Görüntülenebilir veritabanı yok" description="Bağlantı kullanıcısının yetkilerini kontrol edin veya kataloğu yenileyin." actionLabel="Kataloğu yenile" onAction={onRefresh} />;
  if (mode === 'tables' && !selectedDatabaseItem) return <EmptyState icon={Database} title="Veritabanı seçilmedi" description="Sol ağaçtan veya veritabanı listesinden bir veritabanı seçin." />;
  if (mode === 'tables' && selectedDatabaseItem && selectedDatabaseItem.tableDetails.length === 0) return <EmptyState icon={TableIcon} title="Bu veritabanında tablo yok" description="Kullanıcının tablo görüntüleme yetkisini kontrol edin veya kataloğu yenileyin." actionLabel="Yenile" onAction={onRefresh} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-2 py-1">
        <button type="button" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200" onClick={() => void onRefresh()}><RefreshCw className="h-3.5 w-3.5" />Yenile</button>
        <button type="button" className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300" onClick={() => onOpenQuery(mode === 'tables' ? selectedDatabase : null)}>+ Sorgu</button>
        <button type="button" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200" onClick={() => requestTableColumnAction(columnStorageKey, 'fit-all')} title="Bütün sütunları mevcut içeriğe göre kompakt biçimde fit eder"><Columns3 className="h-3.5 w-3.5" />Tümünü fit et</button>
        <button type="button" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200" onClick={() => requestTableColumnAction(columnStorageKey, 'reset')} title="Bu görünüm için kaydedilen sütun genişliklerini siler"><RotateCcw className="h-3.5 w-3.5" />Genişlikleri sıfırla</button>
        <div className="relative min-w-64 max-w-md flex-1"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" /><Input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={mode === 'databases' ? 'Veritabanı ara' : 'Tablo, yorum, motor veya collation ara'} className="h-7 pl-7 text-xs" /></div>
        <span className="ml-auto text-[10px] text-zinc-600">{mode === 'databases' ? `${databaseRows.length.toLocaleString('tr-TR')} veritabanı • ${databases.reduce((total, database) => total + database.tableCount, 0).toLocaleString('tr-TR')} tablo` : `${tableRows.length.toLocaleString('tr-TR')} tablo • yaklaşık ${formatNumber(selectedDatabaseItem?.totalRows || 0)} satır • ${formatStorageMb(selectedDatabaseItem?.totalSizeMB)}`}</span>
      </div>

      <div className="shrink-0 border-b border-zinc-900 bg-black/15 px-2 py-1 text-[9px] text-zinc-700">
        Sütun ayırıcısını sürükleyerek genişliği değiştirin; ayırıcıya çift tıklayarak Excel tarzı otomatik fit uygulayın. Genişlikler bu tablo için yerel uygulama durumunda saklanır.
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="min-w-max">
          <Table size="sm" className="w-full" columnStorageKey={columnStorageKey}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map(column => (
                  <TableHead
                    key={column.key}
                    columnKey={column.key}
                    className={`${column.sticky ? 'sticky left-0 top-0 z-20' : 'sticky top-0 z-10'} border bg-zinc-950 ${column.align === 'right' ? 'text-right' : ''} ${column.className || ''}`}
                  >
                    {column.sortKey ? (
                      <SortButton active={sort.key === column.sortKey} direction={sort.direction} onClick={() => changeSort(column.sortKey!)}>{column.label}</SortButton>
                    ) : column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {mode === 'databases'
                ? (pagedRows as DatabaseCatalogItem[]).map(database => (
                  <TableRow
                    key={database.name}
                    className={`cursor-pointer hover:bg-zinc-900/70 ${selectedDatabase === database.name ? 'bg-cyan-500/[0.06]' : ''}`}
                    onClick={() => onDatabaseSelect(database.name)}
                    onContextMenu={event => onDatabaseContextMenu(event, database.name)}
                  >
                    {DATABASE_COLUMNS.map(column => (
                      <TableCell
                        key={column.key}
                        className={`border py-1.5 ${column.align === 'right' ? 'text-right tabular-nums' : ''} ${column.key === 'name' ? 'font-medium' : ''} ${column.key === 'totalRows' ? 'text-blue-400' : ''} ${['defaultCharset', 'defaultCollation'].includes(column.key) ? 'font-mono text-[10px] text-zinc-400' : ''}`}
                      >
                        {databaseCell(database, column.key)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
                : (pagedRows as DatabaseTable[]).map(table => (
                  <TableRow
                    key={table.tableName}
                    className={`cursor-pointer hover:bg-zinc-900/70 ${selectedTable === table.tableName ? 'bg-cyan-500/[0.06]' : ''}`}
                    onClick={() => selectedDatabase && onTableSelect(selectedDatabase, table.tableName)}
                    onContextMenu={event => selectedDatabase && onTableContextMenu(event, selectedDatabase, table.tableName)}
                  >
                    {TABLE_COLUMNS.map(column => (
                      <TableCell
                        key={column.key}
                        title={column.key === 'comment' ? table.comment : undefined}
                        className={`${column.sticky ? 'sticky left-0 z-10 bg-zinc-950/95' : ''} border py-1.5 ${column.align === 'right' ? 'text-right tabular-nums' : ''} ${column.key === 'tableName' ? 'font-medium' : ''} ${column.key === 'engine' ? 'text-emerald-400' : ''} ${column.key === 'rows' ? 'text-blue-400' : ''} ${column.key === 'collation' ? 'font-mono text-[10px]' : ''} ${['createdAt', 'updatedAt'].includes(column.key) ? 'whitespace-nowrap' : ''} ${column.key === 'comment' ? 'truncate text-zinc-400' : ''}`}
                      >
                        {tableCell(table, column.key)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </ScrollArea>

      <div className="flex h-9 shrink-0 items-center justify-end gap-2 border-t border-zinc-800 px-2 text-[10px] text-zinc-500">
        <span>{activeRows.length.toLocaleString('tr-TR')} kayıt</span>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(previous => Math.max(1, previous - 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
        <span className="min-w-16 text-center">{page} / {totalPages}</span>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(previous => Math.min(totalPages, previous + 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}
