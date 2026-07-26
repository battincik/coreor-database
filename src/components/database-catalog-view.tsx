'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Database,
  RefreshCw,
  Search,
  Table as TableIcon
} from 'lucide-react';
import type { DatabaseCatalogItem, DatabaseTable } from 'types';
import { formatStorageBytes, formatStorageMb } from '@/lib/formatStorageSize';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
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
  direction: 'asc' | 'desc';
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`inline-flex items-center gap-1 whitespace-nowrap ${active ? 'text-cyan-300' : 'text-zinc-400 hover:text-zinc-200'}`} onClick={onClick}>
      {children}{active ? direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
    </button>
  );
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
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: mode === 'databases' ? 'name' : 'tableName', direction: 'asc' });
  const pageSize = 100;

  useEffect(() => {
    setSearch(''); setPage(1); setSort({ key: mode === 'databases' ? 'name' : 'tableName', direction: 'asc' });
  }, [mode, selectedDatabase]);

  const selectedDatabaseItem = databases.find(database => database.name === selectedDatabase) ?? null;
  const databaseRows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR');
    const rows = databases.filter(database => !normalizedSearch || database.name.toLocaleLowerCase('tr-TR').includes(normalizedSearch));
    return [...rows].sort((left, right) => {
      const leftValue = sort.key === 'name' ? left.name : sort.key === 'tableCount' ? left.tableCount : sort.key === 'totalRows' ? left.totalRows : Number(left.totalSizeMB);
      const rightValue = sort.key === 'name' ? right.name : sort.key === 'tableCount' ? right.tableCount : sort.key === 'totalRows' ? right.totalRows : Number(right.totalSizeMB);
      const comparison = typeof leftValue === 'string' && typeof rightValue === 'string' ? leftValue.localeCompare(rightValue, 'tr-TR') : Number(leftValue) - Number(rightValue);
      return comparison * (sort.direction === 'asc' ? 1 : -1);
    });
  }, [databases, search, sort]);

  const tableRows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR');
    const rows = (selectedDatabaseItem?.tableDetails || []).filter(table => !normalizedSearch || [table.tableName, table.comment, table.engine, table.tableType, table.collation, table.rowFormat].filter(Boolean).some(value => String(value).toLocaleLowerCase('tr-TR').includes(normalizedSearch)));
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
      const leftValue = readValue(left); const rightValue = readValue(right);
      const comparison = typeof leftValue === 'string' && typeof rightValue === 'string' ? leftValue.localeCompare(rightValue, 'tr-TR') : Number(leftValue) - Number(rightValue);
      return comparison * (sort.direction === 'asc' ? 1 : -1);
    });
  }, [selectedDatabaseItem, search, sort]);

  const activeRows = mode === 'databases' ? databaseRows : tableRows;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / pageSize));
  const pagedRows = activeRows.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(previous => Math.min(previous, totalPages)); }, [totalPages]);
  const changeSort = (key: string) => { setSort(previous => previous.key === key ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }); setPage(1); };

  if (isLoading) return <LoadingState title={mode === 'databases' ? 'Veritabanları okunuyor' : 'Tablolar hazırlanıyor'} description={activeServerName || undefined} />;
  if (error) return <ErrorState title="Katalog yüklenemedi" description={error} actionLabel="Tekrar dene" onAction={onRefresh} />;
  if (mode === 'databases' && databases.length === 0) return <EmptyState icon={Database} title="Görüntülenebilir veritabanı yok" description="Bağlantı kullanıcısının yetkilerini kontrol edin veya kataloğu yenileyin." actionLabel="Kataloğu yenile" onAction={onRefresh} />;
  if (mode === 'tables' && !selectedDatabaseItem) return <EmptyState icon={Database} title="Veritabanı seçilmedi" description="Sol ağaçtan veya veritabanı listesinden bir veritabanı seçin." />;
  if (mode === 'tables' && selectedDatabaseItem.tableDetails.length === 0) return <EmptyState icon={TableIcon} title="Bu veritabanında tablo yok" description="Kullanıcının tablo görüntüleme yetkisini kontrol edin veya kataloğu yenileyin." actionLabel="Yenile" onAction={onRefresh} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-2 py-1">
        <button type="button" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200" onClick={() => void onRefresh()}><RefreshCw className="h-3.5 w-3.5" /> Yenile</button>
        <button type="button" className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300" onClick={() => onOpenQuery(mode === 'tables' ? selectedDatabase : null)}>+ Sorgu</button>
        <div className="relative min-w-64 max-w-md flex-1"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" /><Input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={mode === 'databases' ? 'Veritabanı ara' : 'Tablo, yorum, motor veya collation ara'} className="h-7 pl-7 text-xs" /></div>
        <span className="ml-auto text-[10px] text-zinc-600">{mode === 'databases' ? `${databaseRows.length.toLocaleString('tr-TR')} veritabanı • ${databases.reduce((total, database) => total + database.tableCount, 0).toLocaleString('tr-TR')} tablo` : `${tableRows.length.toLocaleString('tr-TR')} tablo • yaklaşık ${formatNumber(selectedDatabaseItem?.totalRows || 0)} satır • ${formatStorageMb(selectedDatabaseItem?.totalSizeMB)}`}</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {mode === 'databases' ? <div className="min-w-[1100px]"><Table size="sm" className="w-full"><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="sticky top-0 z-10 border bg-zinc-950"><SortButton active={sort.key === 'name'} direction={sort.direction} onClick={() => changeSort('name')}>Veritabanı</SortButton></TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right"><SortButton active={sort.key === 'tableCount'} direction={sort.direction} onClick={() => changeSort('tableCount')}>Tablo</SortButton></TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right"><SortButton active={sort.key === 'totalRows'} direction={sort.direction} onClick={() => changeSort('totalRows')}>Tahmini satır</SortButton></TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right"><SortButton active={sort.key === 'totalSizeMB'} direction={sort.direction} onClick={() => changeSort('totalSizeMB')}>Toplam boyut</SortButton></TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right">Veri boyutu</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right">İndeks boyutu</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950">Charset</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950">Collation</TableHead></TableRow></TableHeader><TableBody>{(pagedRows as DatabaseCatalogItem[]).map(database => <TableRow key={database.name} className={`cursor-pointer hover:bg-zinc-900/70 ${selectedDatabase === database.name ? 'bg-cyan-500/[0.06]' : ''}`} onClick={() => onDatabaseSelect(database.name)} onContextMenu={event => onDatabaseContextMenu(event, database.name)}><TableCell className="border py-1.5 font-medium"><span className="flex items-center gap-2"><Database className="h-3.5 w-3.5 text-emerald-500" />{database.name}</span></TableCell><TableCell className="border py-1.5 text-right tabular-nums">{formatNumber(database.tableCount)}</TableCell><TableCell className="border py-1.5 text-right tabular-nums text-blue-400">{formatNumber(database.totalRows)}</TableCell><TableCell className="border py-1.5 text-right tabular-nums">{formatStorageMb(database.totalSizeMB)}</TableCell><TableCell className="border py-1.5 text-right tabular-nums">{formatStorageMb(database.dataSizeMB)}</TableCell><TableCell className="border py-1.5 text-right tabular-nums">{formatStorageMb(database.indexSizeMB)}</TableCell><TableCell className="border py-1.5 font-mono text-[10px] text-zinc-400">{database.defaultCharset || '—'}</TableCell><TableCell className="border py-1.5 font-mono text-[10px] text-zinc-400">{database.defaultCollation || '—'}</TableCell></TableRow>)}</TableBody></Table></div> : <div className="min-w-[2400px]"><Table size="sm" className="w-full"><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="sticky left-0 top-0 z-20 min-w-56 border bg-zinc-950"><SortButton active={sort.key === 'tableName'} direction={sort.direction} onClick={() => changeSort('tableName')}>Tablo adı</SortButton></TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950"><SortButton active={sort.key === 'engine'} direction={sort.direction} onClick={() => changeSort('engine')}>Motor</SortButton></TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950">Tür</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right"><SortButton active={sort.key === 'rows'} direction={sort.direction} onClick={() => changeSort('rows')}>Tahmini satır</SortButton></TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right"><SortButton active={sort.key === 'columns'} direction={sort.direction} onClick={() => changeSort('columns')}>Kolon</SortButton></TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right"><SortButton active={sort.key === 'sizeMB'} direction={sort.direction} onClick={() => changeSort('sizeMB')}>Toplam boyut</SortButton></TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right">Veri</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right">İndeks</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right">Boş alan</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right">Ort. satır</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950">Row format</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950">Collation</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right">Auto inc.</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right">İndeks</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950 text-right">FK</TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950"><SortButton active={sort.key === 'createdAt'} direction={sort.direction} onClick={() => changeSort('createdAt')}>Oluşturulma</SortButton></TableHead><TableHead className="sticky top-0 z-10 border bg-zinc-950"><SortButton active={sort.key === 'updatedAt'} direction={sort.direction} onClick={() => changeSort('updatedAt')}>Güncellenme</SortButton></TableHead><TableHead className="sticky top-0 z-10 min-w-72 border bg-zinc-950">Yorum</TableHead></TableRow></TableHeader><TableBody>{(pagedRows as DatabaseTable[]).map(table => <TableRow key={table.tableName} className={`cursor-pointer hover:bg-zinc-900/70 ${selectedTable === table.tableName ? 'bg-cyan-500/[0.06]' : ''}`} onClick={() => selectedDatabase && onTableSelect(selectedDatabase, table.tableName)} onContextMenu={event => selectedDatabase && onTableContextMenu(event, selectedDatabase, table.tableName)}><TableCell className="sticky left-0 z-10 border bg-zinc-950/95 py-1.5 font-medium"><span className="flex items-center gap-2"><TableIcon className="h-3.5 w-3.5 text-blue-500" />{table.tableName}</span></TableCell><TableCell className="border py-1.5 text-emerald-400">{table.engine}</TableCell><TableCell className="border py-1.5">{table.tableType}</TableCell><TableCell className="border py-1.5 text-right tabular-nums text-blue-400">{formatNumber(table.rows)}</TableCell><TableCell className="border py-1.5 text-right tabular-nums">{formatNumber(table.columns)}</TableCell><TableCell className="border py-1.5 text-right tabular-nums">{formatStorageMb(table.sizeMB)}</TableCell><TableCell className="border py-1.5 text-right tabular-nums">{formatStorageMb(table.dataSizeMB)}</TableCell><TableCell className="border py-1.5 text-right tabular-nums">{formatStorageMb(table.indexSizeMB)}</TableCell><TableCell className="border py-1.5 text-right tabular-nums">{formatStorageMb(table.freeSizeMB)}</TableCell><TableCell className="border py-1.5 text-right tabular-nums">{formatStorageBytes(table.avgRowLength)}</TableCell><TableCell className="border py-1.5">{table.rowFormat || '—'}</TableCell><TableCell className="border py-1.5 font-mono text-[10px]">{table.collation || '—'}</TableCell><TableCell className="border py-1.5 text-right tabular-nums">{table.autoIncrement === null ? '—' : String(table.autoIncrement)}</TableCell><TableCell className="border py-1.5 text-right tabular-nums">{formatNumber(table.indexCount)}</TableCell><TableCell className="border py-1.5 text-right tabular-nums">{formatNumber(table.foreignKeyCount)}</TableCell><TableCell className="border py-1.5 whitespace-nowrap">{formatDate(table.createdAt)}</TableCell><TableCell className="border py-1.5 whitespace-nowrap">{formatDate(table.updatedAt)}</TableCell><TableCell className="max-w-96 truncate border py-1.5 text-zinc-400" title={table.comment}>{table.comment || '—'}</TableCell></TableRow>)}</TableBody></Table></div>}
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <div className="flex h-9 shrink-0 items-center justify-end gap-2 border-t border-zinc-800 px-2 text-[10px] text-zinc-500"><span>{activeRows.length.toLocaleString('tr-TR')} kayıt</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(previous => Math.max(1, previous - 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button><span className="min-w-16 text-center">{page} / {totalPages}</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(previous => Math.min(totalPages, previous + 1))}><ChevronRight className="h-3.5 w-3.5" /></Button></div>
    </div>
  );
}
