/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Code,
  Database,
  Filter,
  Key,
  Link,
  Plus,
  RefreshCw,
  Server,
  SortAsc,
  Table as TableIcon
} from 'lucide-react';
import type { DatabasePanelProps } from 'types';
import { useAuth } from '@/context/AuthContext';
import { DatabaseContext } from '@/context/DatabaseContext';
import { fetchServerTables, fetchTableData as fetchTableDataFromApi, fetchTableInfo as fetchTableInfoFromApi } from '@/lib/databaseApi';
import { EmptyState, ErrorState, LoadingState } from '@/components/app-state';
import { Button } from '@/components/ui/button';

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

export function DatabasePanel({ selectedDatabase, selectedTable, activeTab, setActiveTab, onDatabaseSelect, onTableSelect }: DatabasePanelProps) {
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
  const activeServer = useMemo(() => servers.find(server => server.id === activeServerId) ?? null, [servers, activeServerId]);
  const [sortConfig, setSortConfig] = useState<{ column: string | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'asc' });
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isTableInfoLoading, setIsTableInfoLoading] = useState(false);
  const [tableInfoError, setTableInfoError] = useState<string | null>(null);
  const [isTableDataLoading, setIsTableDataLoading] = useState(false);
  const [tableDataError, setTableDataError] = useState<string | null>(null);

  const selectedDatabaseItem = databases.find(database => database.name === selectedDatabase);

  const loadCatalog = async () => {
    if (!activeServerId || !activeToken || isCatalogLoading) return;

    setIsCatalogLoading(true);
    setCatalogError(null);

    try {
      const data = await fetchServerTables(activeServerId, activeToken);
      setDatabases(data.databases || []);
      await loadServers();
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Veritabanı kataloğu yüklenemedi.');
    } finally {
      setIsCatalogLoading(false);
    }
  };

  useEffect(() => {
    const currentServer = servers.find(server => server.id === activeServerId) ?? null;
    const cachedDatabases = currentServer?.databases || [];
    setDatabases(cachedDatabases);
    setCatalogError(null);

    if (currentServer && cachedDatabases.length === 0 && activeToken) {
      loadCatalog();
    }
  }, [activeServerId, activeToken]);

  useEffect(() => {
    onTableSelect(null);
    setTableInfo(null);
    setTableData([]);
    setTableInfoError(null);
    setTableDataError(null);
  }, [selectedDatabase]);

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
        setTableInfoError(error instanceof Error ? error.message : 'Tablo yapısı yüklenemedi.');
      } finally {
        setIsTableInfoLoading(false);
      }
    };

    loadTableInfo();
  }, [selectedDatabase, selectedTable, activeServerId, activeToken]);

  useEffect(() => {
    const loadTableData = async () => {
      if (activeTab !== 'table-data' || !selectedDatabase || !selectedTable || !activeServerId || !activeToken) return;

      setIsTableDataLoading(true);
      setTableDataError(null);
      setTableData([]);

      try {
        const sortParam = sortConfig.column ? `${sortConfig.direction === 'desc' ? '-' : ''}${sortConfig.column}` : null;
        const data = await fetchTableDataFromApi(activeServerId, selectedDatabase, selectedTable, 512, activeToken, sortParam);
        setTableData(data.data || []);
      } catch (error) {
        setTableDataError(error instanceof Error ? error.message : 'Tablo verileri yüklenemedi.');
      } finally {
        setIsTableDataLoading(false);
      }
    };

    loadTableData();
  }, [activeTab, selectedDatabase, selectedTable, activeServerId, activeToken, sortConfig]);

  useEffect(() => {
    setSortConfig({ column: null, direction: 'asc' });
  }, [selectedDatabase, selectedTable]);

  const handleSortByColumn = (column: string) => {
    setSortConfig(previous => ({
      column,
      direction: previous.column === column && previous.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleDatabaseSelect = (databaseName: string) => {
    onDatabaseSelect(databaseName);
    onTableSelect(null);
    setActiveTab('database');
  };

  const handleTableSelect = (databaseName: string, tableName: string) => {
    if (selectedDatabase !== databaseName) onDatabaseSelect(databaseName);
    onTableSelect(tableName);
    setActiveTab('table-data');
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

  const retryTableData = () => {
    setSortConfig(previous => ({ ...previous }));
  };

  if (isServersLoading) {
    return <LoadingState title="Çalışma alanı hazırlanıyor" description="Şifreli sunucu profilleri ve son seçimler yükleniyor." />;
  }

  if (serversError) {
    return <ErrorState title="Çalışma alanı açılamadı" description={serversError} actionLabel="Tekrar dene" onAction={loadServers} />;
  }

  if (servers.length === 0) {
    return <EmptyState icon={Server} title="İlk sunucunuzu ekleyin" description="MySQL veya MariaDB sunucusu eklediğinizde veritabanları, tablolar ve işlem geçmişi burada görüntülenecek." actionLabel="Sunucu ekle" onAction={openServerModal} />;
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
        <div className="shrink-0 border-b border-zinc-800">
          <TabsList className="h-8 justify-start bg-transparent">
            <TabsTrigger value="sql-editor" className="h-8 px-3 text-xs data-[state=active]:bg-background" icon={<Database className="h-4 w-4" />}>Veritabanları</TabsTrigger>
            {selectedDatabase && <TabsTrigger value="database" className="h-8 px-3 text-xs data-[state=active]:bg-background" icon={<Database className="h-4 w-4" />}>{selectedDatabase}</TabsTrigger>}
            {selectedDatabase && selectedTable && (
              <>
                <TabsTrigger value="table" className="h-8 px-3 text-xs data-[state=active]:bg-background" icon={<TableIcon className="h-4 w-4" />}>Yapı: {selectedTable}</TabsTrigger>
                <TabsTrigger value="table-data" className="h-8 px-3 text-xs data-[state=active]:bg-background" icon={<TableIcon className="h-4 w-4" />}>Veri: {selectedTable}</TabsTrigger>
              </>
            )}
          </TabsList>
        </div>

        <TabsContent value="sql-editor" className="m-0 min-h-0 flex-1 overflow-hidden p-0">
          <div className="flex h-8 shrink-0 items-center gap-3 border-b border-zinc-800 px-2">
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={loadCatalog} disabled={isCatalogLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${isCatalogLoading ? 'animate-spin' : ''}`} /> Yenile
            </button>
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
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="border-b border-r border-zinc-800 bg-zinc-950 text-muted-foreground">Veritabanı</TableHead>
                    <TableHead className="border-b border-zinc-800 bg-zinc-950 text-muted-foreground">Tablo sayısı</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {databases.map(database => (
                    <TableRow key={database.name} className={`cursor-pointer hover:bg-muted/40 ${selectedDatabase === database.name ? 'bg-muted/30' : ''}`} onClick={() => handleDatabaseSelect(database.name)}>
                      <TableCell className="border-r border-zinc-800 py-1.5 font-medium"><span className="flex items-center gap-2"><Database className="h-4 w-4 text-emerald-500" />{database.name}</span></TableCell>
                      <TableCell className="py-1.5 tabular-nums">{database.tables.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="database" className="m-0 min-h-0 flex-1 overflow-hidden p-0">
          <div className="flex h-8 items-center gap-3 border-b border-zinc-800 px-2">
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={loadCatalog}><RefreshCw className="h-3.5 w-3.5" /> Yenile</button>
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Filter className="h-3.5 w-3.5" /> Filtre</button>
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><SortAsc className="h-3.5 w-3.5" /> Sırala</button>
          </div>
          {!selectedDatabase ? (
            <EmptyState icon={Database} title="Veritabanı seçilmedi" description="Sol ağaçtan veya veritabanları listesinden bir veritabanı seçin." />
          ) : !selectedDatabaseItem || selectedDatabaseItem.tables.length === 0 ? (
            <EmptyState icon={TableIcon} title="Bu veritabanında tablo yok" description="Kullanıcının tablo görüntüleme yetkisini kontrol edin veya kataloğu yenileyin." actionLabel="Yenile" onAction={loadCatalog} />
          ) : (
            <ScrollArea className="h-[calc(100%-2rem)]">
              <Table size="sm" className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="border-b border-r border-zinc-800 bg-zinc-950 text-muted-foreground">Tablo adı</TableHead>
                    <TableHead className="border-b border-r border-zinc-800 bg-zinc-950 text-muted-foreground">Motor</TableHead>
                    <TableHead className="border-b border-zinc-800 bg-zinc-950 text-muted-foreground">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedDatabaseItem.tables.map(tableName => (
                    <TableRow key={tableName} className="cursor-pointer hover:bg-muted/40" onClick={() => handleTableSelect(selectedDatabase, tableName)}>
                      <TableCell className="border-r border-zinc-800 py-1.5 font-medium"><span className="flex items-center gap-2"><TableIcon className="h-4 w-4 text-blue-500" />{tableName}</span></TableCell>
                      <TableCell className="border-r border-zinc-800 py-1.5">{activeServer?.databaseType === 'mariadb' ? 'MariaDB' : 'MySQL'}</TableCell>
                      <TableCell className="py-1.5 text-xs text-emerald-400">Verileri aç</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
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
              <TabsContent value="columns" className="m-0 min-h-0 flex-1 overflow-auto p-0">
                <Table size="sm"><TableHeader><TableRow><TableHead className="border bg-zinc-950">Alan</TableHead><TableHead className="border bg-zinc-950">Tür</TableHead><TableHead className="border bg-zinc-950">NULL</TableHead><TableHead className="border bg-zinc-950">Anahtar</TableHead><TableHead className="border bg-zinc-950">Varsayılan</TableHead><TableHead className="border bg-zinc-950">Ek</TableHead></TableRow></TableHeader><TableBody>{tableInfo.columns.map(column => <TableRow key={column.Field}><TableCell className="border py-1 font-medium">{column.Field}</TableCell><TableCell className="border py-1 text-green-400">{column.Type}</TableCell><TableCell className="border py-1">{column.Null}</TableCell><TableCell className="border py-1">{column.Key}</TableCell><TableCell className="border py-1">{column.Default ?? 'NULL'}</TableCell><TableCell className="border py-1">{column.Extra}</TableCell></TableRow>)}</TableBody></Table>
              </TabsContent>
              <TabsContent value="indexes" className="m-0 min-h-0 flex-1 overflow-auto p-0">
                {tableInfo.indexes.length === 0 ? <EmptyState icon={Key} title="İndeks bulunmuyor" description="Bu tablo için tanımlı indeks yok." /> : <Table size="sm"><TableHeader><TableRow><TableHead className="border bg-zinc-950">İndeks</TableHead><TableHead className="border bg-zinc-950">Kolon</TableHead><TableHead className="border bg-zinc-950">Non-unique</TableHead><TableHead className="border bg-zinc-950">Sıra</TableHead></TableRow></TableHeader><TableBody>{tableInfo.indexes.map(index => <TableRow key={`${index.Key_name}-${index.Column_name}`}><TableCell className="border py-1">{index.Key_name}</TableCell><TableCell className="border py-1">{index.Column_name}</TableCell><TableCell className="border py-1">{index.Non_unique}</TableCell><TableCell className="border py-1">{index.Seq_in_index}</TableCell></TableRow>)}</TableBody></Table>}
              </TabsContent>
              <TabsContent value="foreign-keys" className="m-0 min-h-0 flex-1 overflow-auto p-0">
                {tableInfo.foreignKeys.length === 0 ? <EmptyState icon={Link} title="Foreign key bulunmuyor" description="Bu tablo başka bir tabloya bağlı değil." /> : <Table size="sm"><TableHeader><TableRow><TableHead className="border bg-zinc-950">Kolon</TableHead><TableHead className="border bg-zinc-950">Referans tablo</TableHead><TableHead className="border bg-zinc-950">Referans kolon</TableHead></TableRow></TableHeader><TableBody>{tableInfo.foreignKeys.map(foreignKey => <TableRow key={`${foreignKey.COLUMN_NAME}-${foreignKey.REFERENCED_TABLE_NAME}`}><TableCell className="border py-1">{foreignKey.COLUMN_NAME}</TableCell><TableCell className="border py-1">{foreignKey.REFERENCED_TABLE_NAME}</TableCell><TableCell className="border py-1">{foreignKey.REFERENCED_COLUMN_NAME}</TableCell></TableRow>)}</TableBody></Table>}
              </TabsContent>
              <TabsContent value="create-sql" className="m-0 min-h-0 flex-1 overflow-auto bg-black/30 p-3"><pre className="whitespace-pre-wrap font-mono text-xs leading-5">{highlightSQL(tableInfo.createSQL)}</pre></TabsContent>
            </Tabs>
          )}
        </TabsContent>

        <TabsContent value="table-data" className="m-0 min-h-0 flex-1 overflow-hidden p-0">
          <div className="flex h-8 items-center gap-3 border-b border-zinc-800 px-2">
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={retryTableData}><RefreshCw className={`h-3.5 w-3.5 ${isTableDataLoading ? 'animate-spin' : ''}`} /> Yenile</button>
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Filter className="h-3.5 w-3.5" /> Filtre</button>
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => tableInfo?.columns[0] && handleSortByColumn(tableInfo.columns[0].Field)}><ArrowUpDown className="h-3.5 w-3.5" /> Sırala</button>
          </div>
          {isTableDataLoading ? (
            <LoadingState title="Satırlar yükleniyor" description={`${selectedDatabase}.${selectedTable}`} />
          ) : tableDataError ? (
            <ErrorState title="Tablo verileri yüklenemedi" description={tableDataError} actionLabel="Tekrar dene" onAction={retryTableData} />
          ) : !tableInfo ? (
            <LoadingState title="Kolon bilgileri hazırlanıyor" />
          ) : tableData.length === 0 ? (
            <EmptyState icon={TableIcon} title="Tabloda veri yok" description="Sorgu başarılı oldu ancak görüntülenecek satır bulunamadı." />
          ) : (
            <ScrollArea className="h-[calc(100%-2rem)] w-full">
              <div className="min-w-max">
                <Table size="sm" className="w-full">
                  <TableHeader><TableRow>{tableInfo.columns.map(column => <TableHead key={column.Field} className="cursor-pointer whitespace-nowrap border bg-zinc-950" onClick={() => handleSortByColumn(column.Field)}><span className="inline-flex items-center gap-1">{column.Field}{sortConfig.column === column.Field ? sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}</span></TableHead>)}</TableRow></TableHeader>
                  <TableBody>{tableData.map((row, rowIndex) => <TableRow key={rowIndex}>{tableInfo.columns.map(column => { const value = row[column.Field]; const displayValue = value === null ? '(NULL)' : typeof value === 'object' ? JSON.stringify(value) : String(value); const className = value === null ? 'text-zinc-500 italic' : typeof value === 'number' ? 'text-blue-400' : typeof value === 'boolean' ? 'text-purple-400' : typeof value === 'object' ? 'text-amber-400' : 'text-green-400'; return <TableCell key={column.Field} className={`whitespace-nowrap border py-1 font-mono text-xs ${className}`}>{displayValue}</TableCell>; })}</TableRow>)}</TableBody>
                </Table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
