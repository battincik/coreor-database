/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code,
  Copy,
  Database,
  LogOut,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Sun,
  Table,
  User
} from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import type { DatabaseServerConfig, SidebarProps } from 'types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLanguage } from '@/context/LanguageContext';
import { DatabaseContext } from '@/context/DatabaseContext';
import { ServerCreateModal } from '@/components/server-create-modal';
import { useAuth } from '@/context/AuthContext';
import { fetchServerTables, fetchTableInfo } from '@/lib/databaseApi';
import { EmptyState, ErrorState, LoadingState } from '@/components/app-state';
import { recordActivity } from '@/lib/activityConsole';
import { useAppContextMenu } from '@/components/app-context-menu';
import { openQueryTab, qualifiedSqlName, quoteSqlIdentifier } from '@/lib/queryWorkspaceEvents';

type ColumnMeta = { name: string; type: string; key: string };

function columnTypeClass(sqlType: string) {
  const value = sqlType.toUpperCase();
  if (/\b(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|BIT|YEAR)\b/.test(value)) return 'text-blue-500';
  if (/\b(DATE|DATETIME|TIMESTAMP|TIME|YEAR)\b/.test(value)) return 'text-red-300 font-semibold';
  if (/\b(BOOL|BOOLEAN)\b/.test(value)) return 'text-purple-500';
  if (/\b(JSON|BLOB|LONGBLOB|MEDIUMBLOB|TINYBLOB|VARBINARY|BINARY)\b/.test(value)) return 'text-yellow-500';
  if (/\b(CHAR|VARCHAR|TEXT|TINYTEXT|MEDIUMTEXT|LONGTEXT|ENUM|SET)\b/.test(value)) return 'text-green-500';
  return 'text-muted-foreground';
}

function initials(name?: string | null, email?: string | null) {
  return (name?.trim() || email?.trim() || 'K').split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
}

function tableTemplate(databaseName: string, tableName: string, kind: 'insert' | 'update' | 'delete' | 'truncate' | 'drop') {
  const table = qualifiedSqlName(databaseName, tableName);
  if (kind === 'insert') return `INSERT INTO ${table} (\n  \`column_name\`\n) VALUES (\n  'value'\n);`;
  if (kind === 'update') return `UPDATE ${table}\nSET \`column_name\` = 'new_value'\nWHERE \`primary_key\` = 'value'\nLIMIT 1;`;
  if (kind === 'delete') return `DELETE FROM ${table}\nWHERE \`primary_key\` = 'value'\nLIMIT 1;`;
  if (kind === 'truncate') return `-- DİKKAT: Bu işlem tablodaki tüm satırları kalıcı olarak siler.\nTRUNCATE TABLE ${table};`;
  return `-- DİKKAT: Bu işlem tabloyu ve içindeki tüm verileri kalıcı olarak siler.\nDROP TABLE ${table};`;
}

export function Sidebar({ onDatabaseSelect, onTableSelect, selectedDatabase, selectedTable }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const { data: session } = useSession();
  const { t } = useLanguage();
  const { activeToken } = useAuth();
  const { openContextMenu } = useAppContextMenu();
  const {
    servers,
    activeServerId,
    setActiveServerId,
    addServer,
    updateServer,
    loadServers,
    isServersLoading,
    isAddingServer,
    serversError
  } = useContext(DatabaseContext)!;

  const activeServer = servers.find(item => item.id === activeServerId) ?? servers[0] ?? null;
  const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});
  const [expandedDatabases, setExpandedDatabases] = useState<Record<string, Record<string, boolean>>>({});
  const [expandedTables, setExpandedTables] = useState<Record<string, Record<string, boolean>>>({});
  const [columns, setColumns] = useState<Record<string, ColumnMeta[]>>({});
  const [columnLoading, setColumnLoading] = useState<Record<string, boolean>>({});
  const [columnErrors, setColumnErrors] = useState<Record<string, string | null>>({});
  const [catalogLoading, setCatalogLoading] = useState<Record<string, boolean>>({});
  const [searchFilter, setSearchFilter] = useState<'database' | 'table'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<DatabaseServerConfig | null>(null);

  const displayName = session?.user?.name || 'Coreor kullanıcısı';
  const displayEmail = session?.user?.email || 'GitHub oturumu';
  const displayImage = session?.user?.image || undefined;

  useEffect(() => {
    const openHandler = () => {
      setEditingServer(null);
      setIsServerModalOpen(true);
    };
    const editHandler = (event: Event) => {
      const serverId = (event as CustomEvent<{ serverId?: string }>).detail?.serverId || activeServerId;
      const server = servers.find(item => item.id === serverId) || null;
      if (!server) return;
      setEditingServer(server);
      setIsServerModalOpen(true);
    };
    window.addEventListener('coreor:open-server-modal', openHandler);
    window.addEventListener('coreor:edit-server-modal', editHandler);
    return () => {
      window.removeEventListener('coreor:open-server-modal', openHandler);
      window.removeEventListener('coreor:edit-server-modal', editHandler);
    };
  }, [servers, activeServerId]);

  useEffect(() => {
    if (!activeServerId && servers[0]) setActiveServerId(servers[0].id);
  }, [servers, activeServerId]);

  const filteredServers = useMemo(() => {
    const query = searchQuery.toLocaleLowerCase('tr-TR');
    if (!query) return servers;
    return servers
      .map(serverItem => ({
        ...serverItem,
        databases: (serverItem.databases || [])
          .map(database => ({
            ...database,
            tables: searchFilter === 'table' ? database.tables.filter(tableName => tableName.toLocaleLowerCase('tr-TR').includes(query)) : database.tables,
            tableDetails: searchFilter === 'table' ? database.tableDetails.filter(table => table.tableName.toLocaleLowerCase('tr-TR').includes(query)) : database.tableDetails
          }))
          .filter(database => searchFilter === 'database' ? database.name.toLocaleLowerCase('tr-TR').includes(query) : database.tables.length > 0)
      }))
      .filter(serverItem => (serverItem.databases || []).length > 0);
  }, [servers, searchFilter, searchQuery]);

  const loadCatalog = async (serverId: string) => {
    if (!activeToken || catalogLoading[serverId]) return;
    setCatalogLoading(previous => ({ ...previous, [serverId]: true }));
    try {
      await fetchServerTables(serverId, activeToken);
      await loadServers();
    } finally {
      setCatalogLoading(previous => ({ ...previous, [serverId]: false }));
    }
  };

  const selectServer = async (serverId: string) => {
    const serverItem = servers.find(item => item.id === serverId);
    const opening = !expandedServers[serverId];
    setActiveServerId(serverId);
    setExpandedServers(previous => ({ ...previous, [serverId]: opening }));
    onDatabaseSelect(null);
    onTableSelect(null);
    recordActivity({ level: 'info', category: 'navigation', title: 'Sunucu seçildi', message: serverItem?.name || serverId, serverId, serverName: serverItem?.name, host: serverItem?.host });
    if (opening && (serverItem?.databases || []).length === 0) await loadCatalog(serverId).catch(() => undefined);
  };

  const selectDatabase = (serverId: string, databaseName: string) => {
    const serverItem = servers.find(item => item.id === serverId);
    setActiveServerId(serverId);
    onDatabaseSelect(databaseName);
    onTableSelect(null);
    recordActivity({ level: 'info', category: 'navigation', title: 'Veritabanı seçildi', serverId, serverName: serverItem?.name, host: serverItem?.host, databaseName });
  };

  const selectTable = (serverId: string, databaseName: string, tableName: string, view?: 'structure' | 'data') => {
    const serverItem = servers.find(item => item.id === serverId);
    setActiveServerId(serverId);
    onDatabaseSelect(databaseName);
    onTableSelect(tableName);
    if (view) window.dispatchEvent(new CustomEvent('coreor:open-table-view', { detail: { view } }));
    recordActivity({ level: 'info', category: 'navigation', title: 'Tablo seçildi', serverId, serverName: serverItem?.name, host: serverItem?.host, databaseName, tableName });
  };

  const toggleDatabase = (serverId: string, databaseName: string) => setExpandedDatabases(previous => ({
    ...previous,
    [serverId]: { ...(previous[serverId] || {}), [databaseName]: !previous[serverId]?.[databaseName] }
  }));

  const toggleTable = async (serverId: string, databaseName: string, tableName: string) => {
    const key = `${serverId}:${databaseName}:${tableName}`;
    const opening = !expandedTables[serverId]?.[key];
    setExpandedTables(previous => ({ ...previous, [serverId]: { ...(previous[serverId] || {}), [key]: opening } }));
    if (!opening || columns[key] || !activeToken) return;
    setColumnLoading(previous => ({ ...previous, [key]: true }));
    setColumnErrors(previous => ({ ...previous, [key]: null }));
    try {
      const info = await fetchTableInfo(serverId, databaseName, tableName, activeToken);
      setColumns(previous => ({ ...previous, [key]: info.columns.map(column => ({ name: column.Field, type: column.Type, key: column.Key })) }));
    } catch (error) {
      setColumnErrors(previous => ({ ...previous, [key]: error instanceof Error ? error.message : 'Tablo bilgileri yüklenemedi.' }));
    } finally {
      setColumnLoading(previous => ({ ...previous, [key]: false }));
    }
  };

  const openServerMenu = (event: React.MouseEvent, serverItem: DatabaseServerConfig) => {
    const endpoint = `${serverItem.host || ''}:${serverItem.port || 3306}`;
    openContextMenu(event, [
      { id: 'query', label: 'Yeni sunucu geneli sorgu', icon: Code, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName: null, title: `${serverItem.name} sorgu` }) },
      { id: 'connection', label: 'Bağlantı ve sürüm sorgusu', icon: Server, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName: null, title: 'Bağlantı bilgisi', sql: 'SELECT VERSION() AS version, CURRENT_USER() AS currentUser, DATABASE() AS currentDatabase;', runImmediately: true }) },
      { id: 'edit', label: 'Bağlantıyı düzenle', icon: Pencil, onSelect: () => { setEditingServer(serverItem); setIsServerModalOpen(true); } },
      { id: 'separator', separator: true },
      { id: 'refresh', label: 'Kataloğu yenile', icon: RefreshCw, onSelect: () => void loadCatalog(serverItem.id) },
      { id: 'copy', label: 'Host ve portu kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(endpoint) }
    ], serverItem.name);
  };

  const openDatabaseMenu = (event: React.MouseEvent, serverItem: DatabaseServerConfig, databaseName: string) => {
    const quotedDatabase = quoteSqlIdentifier(databaseName);
    openContextMenu(event, [
      { id: 'open', label: 'Veritabanını aç', icon: Database, onSelect: () => selectDatabase(serverItem.id, databaseName) },
      { id: 'query', label: 'Yeni sorgu sekmesi', icon: Code, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName, title: databaseName }) },
      { id: 'tables', label: 'SHOW FULL TABLES', icon: Table, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName, title: `${databaseName} tabloları`, sql: 'SHOW FULL TABLES;', runImmediately: true }) },
      { id: 'create', label: 'CREATE TABLE taslağı', icon: Plus, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName, title: 'Yeni tablo', sql: `CREATE TABLE ${quotedDatabase}.\`new_table\` (\n  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,\n  PRIMARY KEY (\`id\`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;` }) },
      { id: 'separator', separator: true },
      { id: 'copy', label: 'Veritabanı adını kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(databaseName) },
      { id: 'refresh', label: 'Kataloğu yenile', icon: RefreshCw, onSelect: () => void loadCatalog(serverItem.id) }
    ], databaseName);
  };

  const openTableMenu = (event: React.MouseEvent, serverItem: DatabaseServerConfig, databaseName: string, tableName: string) => {
    const table = qualifiedSqlName(databaseName, tableName);
    openContextMenu(event, [
      { id: 'data', label: 'Verileri aç', icon: Table, onSelect: () => selectTable(serverItem.id, databaseName, tableName, 'data') },
      { id: 'structure', label: 'Tablo yapısını aç', icon: Database, onSelect: () => selectTable(serverItem.id, databaseName, tableName, 'structure') },
      { id: 'separator-1', separator: true },
      { id: 'read', label: 'Okuma sorguları', icon: Search, children: [
        { id: 'select', label: 'İlk 100 satır', icon: Table, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName, title: `${tableName} SELECT`, sql: `SELECT * FROM ${table}\nLIMIT 100;`, runImmediately: true }) },
        { id: 'count', label: 'Satır sayısı', icon: Search, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName, title: `${tableName} COUNT`, sql: `SELECT COUNT(*) AS totalRows FROM ${table};`, runImmediately: true }) },
        { id: 'describe', label: 'DESCRIBE', icon: Database, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName, title: `${tableName} DESCRIBE`, sql: `DESCRIBE ${table};`, runImmediately: true }) },
        { id: 'create', label: 'SHOW CREATE TABLE', icon: Code, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName, title: `${tableName} CREATE`, sql: `SHOW CREATE TABLE ${table};`, runImmediately: true }) }
      ] },
      { id: 'write', label: 'Değişiklik sorgusu oluştur', icon: Code, children: [
        { id: 'insert', label: 'INSERT taslağı', icon: Plus, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName, title: `${tableName} INSERT`, sql: tableTemplate(databaseName, tableName, 'insert') }) },
        { id: 'update', label: 'UPDATE taslağı', icon: Code, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName, title: `${tableName} UPDATE`, sql: tableTemplate(databaseName, tableName, 'update') }) },
        { id: 'delete', label: 'DELETE taslağı', icon: AlertTriangle, danger: true, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName, title: `${tableName} DELETE`, sql: tableTemplate(databaseName, tableName, 'delete') }) },
        { id: 'truncate', label: 'TRUNCATE taslağı', icon: AlertTriangle, danger: true, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName, title: `${tableName} TRUNCATE`, sql: tableTemplate(databaseName, tableName, 'truncate') }) },
        { id: 'drop', label: 'DROP TABLE taslağı', icon: AlertTriangle, danger: true, onSelect: () => openQueryTab({ serverId: serverItem.id, databaseName, title: `${tableName} DROP`, sql: tableTemplate(databaseName, tableName, 'drop') }) }
      ] },
      { id: 'separator-2', separator: true },
      { id: 'copy', label: 'Tam tablo adını kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(table) }
    ], `${databaseName}.${tableName}`);
  };

  const renderTree = () => {
    if (isServersLoading) return <LoadingState compact title="Sunucu kasası açılıyor" description="Şifreli profiller okunuyor." />;
    if (serversError) return <ErrorState compact title="Sunucular yüklenemedi" description={serversError} actionLabel="Tekrar dene" onAction={loadServers} />;
    if (servers.length === 0) return <EmptyState compact icon={Server} title="Henüz sunucu yok" description="MySQL veya MariaDB bağlantısı ekleyerek başlayın." actionLabel="Sunucu ekle" onAction={() => { setEditingServer(null); setIsServerModalOpen(true); }} />;
    if (filteredServers.length === 0) return <EmptyState compact icon={Search} title="Sonuç bulunamadı" description="Arama metnini veya filtreyi değiştirin." />;

    return filteredServers.map(serverItem => {
      const serverExpanded = Boolean(expandedServers[serverItem.id]);
      const databases = serverItem.databases || [];
      return (
        <div key={serverItem.id} className="space-y-0.5">
          <button type="button" className={`flex w-full items-center justify-between rounded px-1.5 py-1.5 text-left text-xs hover:bg-muted/50 ${activeServerId === serverItem.id ? 'bg-muted/40 text-primary' : ''}`} onClick={() => void selectServer(serverItem.id)} onContextMenu={event => openServerMenu(event, serverItem)}>
            <span className="flex min-w-0 items-center gap-1.5">{serverExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}<Server className="h-3.5 w-3.5 text-emerald-500" /><span className="truncate font-medium">{serverItem.name}</span></span>
            <span className="text-[9px] text-zinc-600">{serverItem.databaseType === 'mariadb' ? 'MariaDB' : 'MySQL'}</span>
          </button>

          {serverExpanded && <div className="ml-3 border-l border-zinc-800 pl-2">
            {catalogLoading[serverItem.id] ? <LoadingState compact title="Katalog okunuyor" /> : databases.length === 0 ? <div className="space-y-2 px-2 py-3 text-[10px] text-zinc-500"><p>Görüntülenebilir veritabanı bulunamadı.</p><button type="button" className="inline-flex items-center gap-1 text-emerald-400" onClick={() => void loadCatalog(serverItem.id)}><RefreshCw className="h-3 w-3" /> Yenile</button></div> : databases.map(database => {
              const databaseExpanded = Boolean(expandedDatabases[serverItem.id]?.[database.name]);
              return <div key={database.name}>
                <div className={`flex items-center gap-1 rounded px-1 py-1 text-xs hover:bg-muted/50 ${selectedDatabase === database.name && activeServerId === serverItem.id ? 'bg-muted/30 text-primary' : ''}`} onContextMenu={event => openDatabaseMenu(event, serverItem, database.name)}>
                  <button type="button" onClick={() => toggleDatabase(serverItem.id, database.name)}>{databaseExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</button>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left" onClick={() => selectDatabase(serverItem.id, database.name)}><Database className="h-3 w-3 text-emerald-500" /><span className="truncate">{database.name}</span><span className="ml-auto text-[9px] text-zinc-600" title={`${database.totalRows.toLocaleString('tr-TR')} tahmini satır`}>{database.tableCount} tablo</span></button>
                </div>

                {databaseExpanded && <div className="ml-3 border-l border-zinc-800 pl-2">
                  {database.tables.length === 0 ? <div className="px-2 py-2 text-[10px] text-zinc-500">Bu veritabanında tablo yok.</div> : database.tables.map(tableName => {
                    const key = `${serverItem.id}:${database.name}:${tableName}`;
                    const tableExpanded = Boolean(expandedTables[serverItem.id]?.[key]);
                    const detail = database.tableDetails.find(table => table.tableName === tableName);
                    return <div key={tableName}>
                      <div className={`flex items-center gap-1 rounded px-1 py-1 text-xs hover:bg-muted/50 ${selectedDatabase === database.name && selectedTable === tableName ? 'bg-muted/30 text-primary' : ''}`} onContextMenu={event => openTableMenu(event, serverItem, database.name, tableName)}>
                        <button type="button" onClick={() => void toggleTable(serverItem.id, database.name, tableName)}>{tableExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</button>
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left" onClick={() => selectTable(serverItem.id, database.name, tableName)}><Table className="h-3 w-3 text-blue-500" /><span className="truncate">{tableName}</span><span className="ml-auto shrink-0 text-[9px] tabular-nums text-zinc-600" title="information_schema tahmini satır sayısı">{detail ? detail.rows.toLocaleString('tr-TR') : '—'}</span></button>
                      </div>
                      {tableExpanded && <div className="ml-4 space-y-0.5">
                        {columnLoading[key] && <div className="px-1 py-1 text-[10px] text-zinc-500">Kolonlar yükleniyor…</div>}
                        {columnErrors[key] && <div className="px-1 py-1 text-[10px] text-red-400">{columnErrors[key]}</div>}
                        {(columns[key] || []).map(column => <div key={column.name} className="flex items-center gap-1.5 rounded px-1 py-1 text-[9px] text-zinc-500"><span className={`h-1.5 w-1.5 rounded-full ${column.key === 'PRI' ? 'bg-amber-400' : column.key === 'UNI' ? 'bg-red-400' : column.key === 'MUL' ? 'bg-emerald-400' : 'bg-zinc-700'}`} /><span className="truncate">{column.name}</span><span className={`ml-auto rounded bg-white/[0.03] px-1 py-0.5 ${columnTypeClass(column.type)}`}>{column.type.toUpperCase()}</span></div>)}
                      </div>}
                    </div>;
                  })}
                </div>}
              </div>;
            })}
          </div>}
        </div>
      );
    });
  };

  return (
    <div className="flex h-full flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="shrink-0 border-b border-zinc-800 p-2">
        <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200"><Database className="h-4 w-4 text-emerald-500" /><span>{t('servers', 'Sunucular')}</span></div><Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingServer(null); setIsServerModalOpen(true); }}><Plus className="h-3.5 w-3.5" /></Button></div>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-8 w-full justify-between text-xs" disabled={isServersLoading}><span className="flex min-w-0 items-center gap-2"><Server className="h-3.5 w-3.5" /><span className="truncate">{activeServer?.name || t('selectServer', 'Sunucu seç')}</span></span><ChevronDown className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-64 text-xs">{servers.map(serverItem => <DropdownMenuItem key={serverItem.id} className={activeServerId === serverItem.id ? 'bg-muted' : ''} onClick={() => void selectServer(serverItem.id)}><div className="flex min-w-0 flex-col"><span className="truncate font-medium">{serverItem.name}</span><span className="truncate text-[10px] text-zinc-500">{serverItem.host}:{serverItem.port || 3306}</span></div></DropdownMenuItem>)}{servers.length > 0 && <DropdownMenuSeparator />}<DropdownMenuItem onClick={() => { setEditingServer(null); setIsServerModalOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Sunucu ekle</DropdownMenuItem>{activeServer && <DropdownMenuItem onClick={() => { setEditingServer(activeServer); setIsServerModalOpen(true); }}><Pencil className="mr-2 h-4 w-4" /> Bağlantıyı düzenle</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>
        <div className="mt-2 flex items-center gap-1.5 border-t border-zinc-800 pt-2"><div className="relative min-w-0 flex-1"><Input placeholder={`${t('search', 'Ara')} ${searchFilter === 'table' ? t('tables', 'tablolar') : t('databases', 'veritabanları')}…`} className="h-7 pr-7 text-xs" value={searchQuery} disabled={servers.length === 0} onChange={event => setSearchQuery(event.target.value)} /><Search className="absolute right-2 top-1.5 h-3 w-3 text-zinc-600" /></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" disabled={servers.length === 0}>{searchFilter === 'table' ? t('tables', 'Tablolar') : t('databases', 'Veritabanları')}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="text-xs"><DropdownMenuItem onClick={() => setSearchFilter('table')}>{t('tables', 'Tablolar')}</DropdownMenuItem><DropdownMenuItem onClick={() => setSearchFilter('database')}>{t('databases', 'Veritabanları')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
      </div>

      <ScrollArea className="min-h-0 flex-1"><div className="space-y-0.5 p-1">{renderTree()}</div></ScrollArea>
      <ServerCreateModal open={isServerModalOpen} onClose={() => { setIsServerModalOpen(false); setEditingServer(null); }} onSubmit={addServer} initialServer={editingServer} onUpdate={updateServer} />

      <div className="flex shrink-0 items-center gap-1 border-t border-zinc-800 p-2">
        <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1.5 text-left hover:bg-muted/50"><Avatar className="h-8 w-8"><AvatarImage src={displayImage} alt={displayName} /><AvatarFallback>{initials(displayName, displayEmail)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{displayName}</div><div className="truncate text-[10px] text-zinc-500">{displayEmail}</div></div><ChevronUp className="h-3 w-3 text-zinc-500" /></button></DropdownMenuTrigger><DropdownMenuContent side="top" align="start" className="w-64 p-1.5"><div className="flex items-center gap-2 px-2 py-2"><Avatar className="h-9 w-9"><AvatarImage src={displayImage} alt={displayName} /><AvatarFallback>{initials(displayName, displayEmail)}</AvatarFallback></Avatar><div className="min-w-0"><div className="truncate text-sm font-semibold">{displayName}</div><div className="truncate text-xs text-zinc-500">{displayEmail}</div></div></div><DropdownMenuSeparator /><DropdownMenuItem onClick={() => router.push('/editor/settings')}><User className="mr-2 h-4 w-4" /> Hesap ayarları</DropdownMenuItem><DropdownMenuItem onClick={() => { setEditingServer(null); setIsServerModalOpen(true); }} disabled={isAddingServer}><Plus className="mr-2 h-4 w-4" /> Yeni sunucu ekle</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-red-400" onClick={() => signOut({ callbackUrl: '/' })}><LogOut className="mr-2 h-4 w-4" /> {t('logout', 'Çıkış yap')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}><Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" /><Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/editor/settings')}><Settings className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
