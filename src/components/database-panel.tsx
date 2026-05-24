/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useEffect, useContext, useMemo } from 'react';
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Database, Table as TableIcon, Code, Key, Link, RefreshCw, Filter, SortAsc, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { DatabasePanelProps } from 'types';
import { useAuth } from '@/context/AuthContext';
import { DatabaseContext } from '@/context/DatabaseContext';
import { fetchServerTables, fetchTableData as fetchTableDataFromApi, fetchTableInfo as fetchTableInfoFromApi } from '@/lib/databaseApi';

function highlightSQL(sql: string): React.ReactNode {
  const keywords = ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'BETWEEN', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'LIKE', 'IN', 'AS', 'JOIN', 'ON', 'ORDER', 'BY', 'GROUP', 'HAVING', 'DISTINCT', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'END'];

  const dataTypes = ['VARCHAR', 'CHAR', 'TEXT', 'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'BOOLEAN'];

  const regexKeywords = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
  const regexDataTypes = new RegExp(`\\b(${dataTypes.join('|')})\\b`, 'gi');
  const regexIdentifiers = /`([^`]+)`/g;

  return sql.split(/(\s+)/).map((part, index) => {
    if (regexKeywords.test(part)) {
      return (
        <span key={index} className="text-blue-500 font-bold">
          {part.toUpperCase()}
        </span>
      );
    } else if (regexDataTypes.test(part)) {
      return (
        <span key={index} className="text-orange-500 font-semibold">
          {part.toUpperCase()}
        </span>
      );
    } else if (regexIdentifiers.test(part)) {
      return (
        <span key={index} className="text-teal-500">
          {part}
        </span>
      );
    } else if (/^['"].*['"]$/.test(part)) {
      return (
        <span key={index} className="text-green-500">
          {part}
        </span>
      );
    } else if (/^\d+$/.test(part)) {
      return (
        <span key={index} className="text-purple-500">
          {part}
        </span>
      );
    }
    return part;
  });
}

export function DatabasePanel({ selectedDatabase, selectedTable, activeTab, setActiveTab, onDatabaseSelect, onTableSelect }: DatabasePanelProps) {
  const { databases, setDatabases, tableInfo, setTableInfo, databaseTables, setDatabaseTables, tableData, setTableData, servers, activeServerId, loadServers } = useContext(DatabaseContext)!;
  const { activeToken } = useAuth();
  const activeServer = useMemo(() => servers.find(server => server.id === activeServerId) ?? null, [servers, activeServerId]);
  const [sortConfig, setSortConfig] = React.useState<{ column: string | null; direction: 'asc' | 'desc' }>({ column: null, direction: 'asc' });

  const fetchDatabaseTables = async () => {
    if (selectedDatabase && activeServerId) {
      try {
        const data = await fetchServerTables(activeServerId, activeToken);
        setDatabases(data.databases || []);
        setDatabaseTables([]);
      } catch (error) {
        console.error('Tablo bilgileri yüklenirken bir hata oluştu:', error);
      }
    }
  };

  useEffect(() => {
    const currentServer = servers.find(server => server.id === activeServerId) ?? servers[0];

    setDatabases(currentServer?.databases || []);
  }, [servers, activeServerId]);

  useEffect(() => {
    if (activeTab === 'database') {
      fetchDatabaseTables();
    }
  }, [activeTab, selectedDatabase, activeServerId]);

  const handleRefreshTables = () => {
    setDatabaseTables([]);
    fetchDatabaseTables();
  };

  useEffect(() => {
    if (selectedTable) {
      onTableSelect(null);
    }
    setTableInfo(null);
  }, [selectedDatabase]);

  const handleRefreshDatabases = () => {
    setDatabases([]);
    loadServers();
  };

  const handleSortByColumn = (column: string) => {
    setSortConfig(prev => {
      if (prev.column === column) {
        return {
          column,
          direction: prev.direction === 'asc' ? 'desc' : 'asc'
        };
      }

      return {
        column,
        direction: 'asc'
      };
    });
  };

  const handleToolbarSort = () => {
    const firstColumn = tableInfo?.columns?.[0]?.Field;

    if (firstColumn) {
      handleSortByColumn(firstColumn);
    }
  };

  useEffect(() => {
    setTableInfo(null);
    const fetchTableInfo = async () => {
      if (selectedDatabase && selectedTable && activeServerId) {
        try {
          const data = await fetchTableInfoFromApi(activeServerId, selectedDatabase, selectedTable, activeToken);
          setTableInfo(data);
        } catch (error) {
          console.error('Tablo bilgileri yüklenirken bir hata oluştu:', error);
        }
      } else {
        setTableInfo(null);
      }
    };

    fetchTableInfo();
  }, [selectedDatabase, selectedTable]);

  useEffect(() => {
    setTableData([]);
    const loadTableData = async () => {
      if (activeTab === 'table-data' && selectedDatabase && selectedTable && activeServerId) {
        try {
          const sortParam = sortConfig.column ? `${sortConfig.direction === 'desc' ? '-' : ''}${sortConfig.column}` : null;
          const data = await fetchTableDataFromApi(activeServerId, selectedDatabase, selectedTable, 512, activeToken, sortParam);
          setTableData(data.data || []);
        } catch (error) {
          console.error('Tablo verileri yüklenirken bir hata oluştu:', error);
        }
      }
    };

    loadTableData();
  }, [activeTab, selectedDatabase, selectedTable, activeServerId, sortConfig]);

  useEffect(() => {
    setSortConfig({ column: null, direction: 'asc' });
  }, [selectedDatabase, selectedTable]);

  const handleDatabaseSelect = (dbName: string | null) => {
    onDatabaseSelect(dbName);
    if (dbName && activeTab !== 'table-data') {
      setActiveTab('database');
    }
  };

  const handleTableSelect = (dbName: string, tableName: string) => {
    if (selectedDatabase !== dbName) {
      onDatabaseSelect(dbName);
    }
    onTableSelect(tableName);
    if (activeTab !== 'table-data') {
      setActiveTab('table-data');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="border-b">
          <TabsList className="h-8 bg-transparent justify-start">
            <TabsTrigger value="sql-editor" className="data-[state=active]:bg-background text-xs h-8 px-3" icon={<Code className="h-4 w-4" />}>
              Databases
            </TabsTrigger>
            {selectedDatabase && (
              <TabsTrigger value="database" className="data-[state=active]:bg-background text-xs h-8 px-3" icon={<Database className="h-4 w-4" />}>
                Database: {selectedDatabase}
              </TabsTrigger>
            )}
            {selectedDatabase && selectedTable && databases.find(db => db.name === selectedDatabase)?.tables.includes(selectedTable) && (
              <>
                <TabsTrigger value="table" className="data-[state=active]:bg-background text-xs h-8 px-3" icon={<TableIcon className="h-4 w-4" />}>
                  Table: {selectedTable}
                </TabsTrigger>
                <TabsTrigger value="table-data" className="data-[state=active]:bg-background text-xs h-8 px-3" icon={<TableIcon className="h-4 w-4" />}>
                  Data: {selectedTable}
                </TabsTrigger>
              </>
            )}
          </TabsList>
        </div>

        <TabsContent value="sql-editor" className="flex-1 p-0 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="px-0">
              <div className="flex items-center gap-2 h-8 px-2">
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={handleRefreshDatabases}>
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
                {activeServer && <span className="text-[11px] text-muted-foreground">Server: {activeServer.name}</span>}
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Filter className="h-4 w-4" />
                  Filter
                </button>
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <SortAsc className="h-4 w-4" />
                  Sort
                </button>
              </div>
            </div>
            <div className="pb-2">
              <Table className="border rounded-md w-full" size="sm">
                <TableHeader>
                  <TableRow className="border hover:bg-transparent">
                    <TableHead className="border bg-[#101010] text-muted-foreground">Name</TableHead>
                    <TableHead className="border bg-[#101010] text-muted-foreground w-full">Tables</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {databases.map(db => (
                    <TableRow key={db.name} className={`cursor-pointer hover:bg-muted/50 ${selectedDatabase === db.name ? 'bg-muted' : ''}`} onClick={() => handleDatabaseSelect(db.name)}>
                      <TableCell className="border font-medium py-1">
                        <div className="flex items-center gap-2">
                          <Database className={`h-4 w-4 ${selectedDatabase === db.name ? 'text-primary' : 'text-emerald-500'}`} />
                          {db.name}
                        </div>
                      </TableCell>
                      <TableCell className="py-1">{db.tables.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="database" className="flex-1 p-0 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="px-0">
              <div className="flex items-center gap-2 h-8 px-2">
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={handleRefreshTables}>
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Filter className="h-4 w-4" />
                  Filter
                </button>
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <SortAsc className="h-4 w-4" />
                  Sort
                </button>
              </div>
            </div>
            <div className="pb-2">
              <Table className="border rounded-md w-full" size="sm">
                <TableHeader>
                  <TableRow className="border">
                    <TableHead className="border bg-[#101010] text-muted-foreground">Name</TableHead>
                    <TableHead className="border bg-[#101010] text-muted-foreground">Rows</TableHead>
                    <TableHead className="border bg-[#101010] text-muted-foreground">Columns</TableHead>
                    <TableHead className="border bg-[#101010] text-muted-foreground">Size (MB)</TableHead>
                    <TableHead className="border bg-[#101010] text-muted-foreground">Created At</TableHead>
                    <TableHead className="border bg-[#101010] text-muted-foreground">Updated At</TableHead>
                    <TableHead className="border bg-[#101010] text-muted-foreground">Engine</TableHead>
                    <TableHead className="border bg-[#101010] text-muted-foreground">Indexes</TableHead>
                    <TableHead className="border bg-[#101010] text-muted-foreground">Foreign Keys</TableHead>
                    <TableHead className="border bg-[#101010] text-muted-foreground">Comment</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {databases
                    .find(db => db.name === selectedDatabase)
                    ?.tables.map(tableName => {
                      const tableData = databaseTables.find(t => t.tableName === tableName);
                      return (
                        <TableRow key={tableName} className="cursor-pointer hover:bg-muted/50 border" onClick={() => handleTableSelect(selectedDatabase!, tableName)}>
                          <TableCell className="border font-medium py-1">
                            <div className="flex items-center gap-2">
                              <TableIcon className="h-4 w-4 text-blue-500" />
                              {tableName}
                            </div>
                          </TableCell>
                          <TableCell className="border font-medium py-1">{tableData?.rows || '-'}</TableCell>
                          <TableCell className="border font-medium py-1">{tableData?.columns || '-'}</TableCell>
                          <TableCell className="border font-medium py-1">{tableData?.sizeMB || '-'}</TableCell>
                          <TableCell className="border font-medium py-1">{tableData?.createdAt ? new Date(tableData.createdAt).toLocaleString() : '-'}</TableCell>
                          <TableCell className="border font-medium py-1">{tableData?.updatedAt ? new Date(tableData.updatedAt).toLocaleString() : '-'}</TableCell>
                          <TableCell className="border font-medium py-1">{tableData?.engine || '-'}</TableCell>
                          <TableCell className="border font-medium py-1">{tableData?.indexCount || '-'}</TableCell>
                          <TableCell className="border font-medium py-1">{tableData?.foreignKeyCount || '-'}</TableCell>
                          <TableCell className="border font-medium py-1">{tableData?.comment || '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="table" className="flex-1 p-0 m-0">
          <ScrollArea className="h-full">
            <div className="px-0">
              <Tabs defaultValue="columns" className="flex flex-col h-full">
                <TabsList className="h-8 bg-transparent justify-start">
                  <TabsTrigger value="columns" className="data-[state=active]:bg-background text-xs h-8 px-3" icon={<TableIcon className="h-4 w-4" />}>
                    Columns
                  </TabsTrigger>
                  <TabsTrigger value="indexes" className="data-[state=active]:bg-background text-xs h-8 px-3" icon={<Key className="h-4 w-4" />}>
                    Indexes
                  </TabsTrigger>
                  <TabsTrigger value="foreign-keys" className="data-[state=active]:bg-background text-xs h-8 px-3" icon={<Link className="h-4 w-4" />}>
                    Foreign Keys
                  </TabsTrigger>
                  <TabsTrigger value="create-sql" className="data-[state=active]:bg-background text-xs h-8 px-3" icon={<Code className="h-4 w-4" />}>
                    Create SQL
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="columns" className="flex-1 p-0 m-0">
                  <Table size="sm" className="border rounded-md">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="border bg-[#101010] text-muted-foreground">Field</TableHead>
                        <TableHead className="border bg-[#101010] text-muted-foreground">Type</TableHead>
                        <TableHead className="border bg-[#101010] text-muted-foreground">Null</TableHead>
                        <TableHead className="border bg-[#101010] text-muted-foreground">Key</TableHead>
                        <TableHead className="border bg-[#101010] text-muted-foreground">Default</TableHead>
                        <TableHead className="border bg-[#101010] text-muted-foreground">Extra</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableInfo?.columns.map(column => (
                        <TableRow key={column.Field}>
                          <TableCell className="border font-medium py-1">
                            <div className="flex items-center gap-2">
                              <TableIcon className="h-4 w-4 text-blue-500" />
                              {column.Field}
                            </div>
                          </TableCell>
                          <TableCell className="border font-medium py-1">{column.Type}</TableCell>
                          <TableCell className="border font-medium py-1">{column.Null}</TableCell>
                          <TableCell className="border font-medium py-1">{column.Key}</TableCell>
                          <TableCell className="border font-medium py-1">{column.Default ?? 'NULL'}</TableCell>
                          <TableCell className="border font-medium py-1">{column.Extra}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="indexes" className="flex-1 p-0 m-0">
                  <Table size="sm" className="border rounded-md">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="border bg-[#101010] text-muted-foreground">Key Name</TableHead>
                        <TableHead className="border bg-[#101010] text-muted-foreground">Column Name</TableHead>
                        <TableHead className="border bg-[#101010] text-muted-foreground">Non-Unique</TableHead>
                        <TableHead className="border bg-[#101010] text-muted-foreground">Seq in Index</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableInfo?.indexes.map(index => (
                        <TableRow key={`${index.Key_name}-${index.Column_name}`}>
                          <TableCell className="border font-medium py-1">{index.Key_name}</TableCell>
                          <TableCell className="border font-medium py-1">{index.Column_name}</TableCell>
                          <TableCell className="border font-medium py-1">{index.Non_unique}</TableCell>
                          <TableCell className="border font-medium py-1">{index.Seq_in_index}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="foreign-keys" className="flex-1 p-0 m-0">
                  <Table size="sm" className="border rounded-md">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="border bg-[#101010] text-muted-foreground">Column Name</TableHead>
                        <TableHead className="border bg-[#101010] text-muted-foreground">Referenced Table</TableHead>
                        <TableHead className="border bg-[#101010] text-muted-foreground">Referenced Column</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableInfo?.foreignKeys.map(fk => (
                        <TableRow key={fk.COLUMN_NAME}>
                          <TableCell className="border font-medium py-1">{fk.COLUMN_NAME}</TableCell>
                          <TableCell className="border font-medium py-1">{fk.REFERENCED_TABLE_NAME}</TableCell>
                          <TableCell className="border font-medium py-1">{fk.REFERENCED_COLUMN_NAME}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="create-sql" className="flex-1 p-0 m-0">
                  <pre className="bg-muted rounded-md text-sm overflow-auto">{tableInfo?.createSQL ? highlightSQL(tableInfo.createSQL) : null}</pre>
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="table-data" className="flex-1 p-0 m-0 overflow-hidden">
          <ScrollArea className="w-full h-full">
            <div className="min-w-[1200px]">
              <div className="flex items-center gap-2 h-8 px-2">
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={handleRefreshTables}>
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Filter className="h-4 w-4" />
                  Filter
                </button>
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={handleToolbarSort}>
                  <ArrowUpDown className="h-4 w-4" />
                  Sort
                </button>
              </div>

              <Table size="sm" className="border rounded-md w-full">
                <TableHeader>
                  <TableRow>
                    {tableInfo?.columns.map((column, colIndex) => (
                      <TableHead
                        key={colIndex}
                        className="border bg-[#101010] text-muted-foreground whitespace-nowrap cursor-pointer select-none"
                        onClick={() => handleSortByColumn(column.Field)}
                      >
                        <span className="inline-flex items-center gap-1">
                          {column.Field}
                          {sortConfig.column === column.Field ? (
                            sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableData.length > 0 ? (
                    tableData.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {tableInfo?.columns.map((column, colIndex) => {
                          const value = row[column.Field];
                          let displayValue = '';
                          let textColorClass = '';

                          if (value === null) {
                            displayValue = '(NULL)';
                            textColorClass = 'text-gray-400 italic';
                          } else if (typeof value === 'object') {
                            displayValue = JSON.stringify(value);
                            textColorClass = 'text-yellow-500';
                          } else if (typeof value === 'boolean') {
                            displayValue = value ? 'True' : 'False';
                            textColorClass = 'text-purple-500';
                          } else if (typeof value === 'number') {
                            displayValue = value.toString();
                            textColorClass = 'text-blue-500';
                          } else if (typeof value === 'string') {
                            displayValue = value;
                            const isDateLike = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?/.test(value);
                            textColorClass = isDateLike ? 'text-red-300 font-semibold' : 'text-green-500';
                          }

                          return (
                            <TableCell key={colIndex} className={`border font-medium py-1 whitespace-nowrap ${textColorClass}`}>
                              {displayValue}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={tableInfo?.columns.length || 1} className="text-center py-2">
                        No data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
