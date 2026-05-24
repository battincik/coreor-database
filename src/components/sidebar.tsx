/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { useState, useEffect, useContext } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sun, Moon, LogOut, Plus, Table, ChevronDown, ChevronRight, Database, Search, User, Settings, Globe } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { SidebarProps } from 'types';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';
import { DatabaseContext } from '@/context/DatabaseContext';
import { ServerCreateModal } from '@/components/server-create-modal';
import { useAuth } from '@/context/AuthContext';
import { fetchTableInfo } from '@/lib/databaseApi';

type ColumnMeta = {
  name: string;
  type: string;
};

function getColumnTypeClass(sqlType: string) {
  const normalizedType = sqlType.toUpperCase();

  if (/\b(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|BIT|YEAR)\b/.test(normalizedType)) {
    return 'text-blue-500';
  }

  if (/\b(DATE|DATETIME|TIMESTAMP|TIME|YEAR)\b/.test(normalizedType)) {
    return 'text-red-300 font-semibold';
  }

  if (/\b(BOOL|BOOLEAN)\b/.test(normalizedType)) {
    return 'text-purple-500';
  }

  if (/\b(JSON|BLOB|LONGBLOB|MEDIUMBLOB|TINYBLOB|VARBINARY|BINARY)\b/.test(normalizedType)) {
    return 'text-yellow-500';
  }

  if (/\b(CHAR|VARCHAR|TEXT|TINYTEXT|MEDIUMTEXT|LONGTEXT|ENUM|SET)\b/.test(normalizedType)) {
    return 'text-green-500';
  }

  return 'text-muted-foreground';
}

function formatColumnType(sqlType: string) {
  return sqlType.toUpperCase();
}

export function Sidebar({ onDatabaseSelect, onTableSelect, selectedDatabase, selectedTable }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const Router = useRouter();
  const { data: session } = useSession();
  const { translations } = useLanguage();
  const { activeToken } = useAuth();
  const { servers, activeServerId, setActiveServerId, addServer } = useContext(DatabaseContext)!;

  const activeServer = servers.find(server => server.id === activeServerId) ?? servers[0];

  const [expandedDbs, setExpandedDbs] = useState<Record<string, boolean>>({});
  const [expandedDatabases, setExpandedDatabases] = useState<Record<string, Record<string, boolean>>>({});
  const [expandedTables, setExpandedTables] = useState<Record<string, Record<string, boolean>>>({});
  const [loadedTableColumns, setLoadedTableColumns] = useState<Record<string, Record<string, ColumnMeta[]>>>({});
  const [loadingTables, setLoadingTables] = useState<Record<string, Record<string, boolean>>>({});
  const [tableLoadErrors, setTableLoadErrors] = useState<Record<string, Record<string, string | null>>>({});
  const [prevExpandedDbs, setPrevExpandedDbs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState<'database' | 'table'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('');
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    console.log(session);
  }, [session]);

  useEffect(() => {
    if (servers.length > 0) {
      setLoading(false);
    }
    if (searchQuery) {
      if (Object.keys(prevExpandedDbs).length === 0) {
        setPrevExpandedDbs(expandedDbs);
      }

      const allExpanded = Object.fromEntries(servers.map(server => [server.id, true]));
      setExpandedDbs(allExpanded);
    } else {
      if (Object.keys(prevExpandedDbs).length > 0) {
        setExpandedDbs(prevExpandedDbs);
        setPrevExpandedDbs({});
      } else {
        setExpandedDbs({});
      }
    }
  }, [searchQuery, servers]);

  const handleServerClick = (serverId: string) => {
    setActiveServerId(serverId);
    setExpandedDbs(prev => {
      const isCurrentlyExpanded = prev[serverId];
      if (isCurrentlyExpanded) {
        return {
          ...prev,
          [serverId]: false
        };
      }

      setTimeout(() => {
        onDatabaseSelect(null);
        onTableSelect(null);
      }, 0);

      return {
        ...prev,
        [serverId]: true
      };
    });
  };

  const toggleDatabase = async (serverId: string, databaseName: string) => {
    setExpandedDatabases(prev => {
      const currentServerState = prev[serverId] || {};
      const nextExpanded = !currentServerState[databaseName];

      return {
        ...prev,
        [serverId]: {
          ...currentServerState,
          [databaseName]: nextExpanded
        }
      };
    });
  };

  const toggleTable = async (serverId: string, databaseName: string, tableName: string) => {
    const tableKey = `${serverId}:${databaseName}:${tableName}`;

    setExpandedTables(prev => ({
      ...prev,
      [serverId]: {
        ...(prev[serverId] || {}),
        [tableName]: !prev[serverId]?.[tableName]
      }
    }));

    if (!loadedTableColumns[serverId]?.[tableKey]) {
      setTableLoadErrors(prev => ({
        ...prev,
        [serverId]: {
          ...(prev[serverId] || {}),
          [tableKey]: null
        }
      }));

      setLoadingTables(prev => ({
        ...prev,
        [serverId]: {
          ...(prev[serverId] || {}),
          [tableKey]: true
        }
      }));

      try {
        const tableInfo = await fetchTableInfo(serverId, databaseName, tableName, activeToken);
        const columns = tableInfo.columns.map(column => ({
          name: column.Field,
          type: column.Type
        }));

        setLoadedTableColumns(prev => ({
          ...prev,
          [serverId]: {
            ...(prev[serverId] || {}),
            [tableKey]: columns
          }
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Tablo bilgileri yüklenemedi.';

        setTableLoadErrors(prev => ({
          ...prev,
          [serverId]: {
            ...(prev[serverId] || {}),
            [tableKey]: message
          }
        }));

        console.error('Tablo bilgileri yüklenemedi:', { serverId, databaseName, tableName, error });
      } finally {
        setLoadingTables(prev => ({
          ...prev,
          [serverId]: {
            ...(prev[serverId] || {}),
            [tableKey]: false
          }
        }));
      }
    }
  };

  const handleLogOut = () => {
    signOut({ callbackUrl: '/' });
    setActiveTab('');
  };

  const handleAddServer = () => {
    setIsServerModalOpen(true);
  };

  const handleTableClick = (dbName: string, tableName: string | null) => {
    onDatabaseSelect(dbName);
    onTableSelect(tableName);
    console.log('Selected table:', tableName);
    console.log(activeTab);

    if (activeTab == 'table-data') {
      setActiveTab('table-data');
    }
  };

  const filteredServers = servers
    .map(server => ({
      ...server,
      databases:
        searchQuery && searchFilter === 'table'
          ? (server.databases || [])
              .map(database => ({
                ...database,
                tables: database.tables.filter(table => table.toLowerCase().includes(searchQuery.toLowerCase()))
              }))
              .filter(database => database.tables.length > 0)
          : server.databases || []
    }))
    .filter(server => (searchQuery && searchFilter === 'database' ? server.name.toLowerCase().includes(searchQuery.toLowerCase()) : true));

  return (
    <div className="flex flex-col h-full border-r border-zinc-700 dark:bg-zinc-950">
      <div className="py-2 border-b border-zinc-700">
        <div className="flex items-center gap-1 font-semibold text-sm pb-2 px-2">
          <Database className="h-4 w-4 text-emerald-500" />
          <span>{translations['products']}</span>
        </div>
        <div className="px-2 pb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between h-8 text-xs">
                <span className="flex items-center gap-2 truncate">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="truncate">{activeServer?.name ?? 'Sunucu seç'}</span>
                </span>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 text-xs">
              {servers.map(server => (
                <DropdownMenuItem key={server.id} className={activeServerId === server.id ? 'bg-muted' : ''} onClick={() => setActiveServerId(server.id)}>
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="font-medium">{server.name}</span>
                    <span className="text-[11px] text-muted-foreground truncate max-w-[220px]">{server.host ? `${server.host}:${server.port || 3306}` : server.baseUrl || 'API bağlantısı'}</span>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleAddServer}>
                <Plus className="mr-2 h-4 w-4" />
                Sunucu ekle
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2 border-t border-zinc-700 pt-2 px-2">
          <div className="relative flex-1">
            <Input placeholder={`${translations['search']} ${searchFilter === 'table' ? translations['tables'] : translations['databases']}...`} className="h-7 text-xs" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <Search className="absolute right-2 top-1.5 h-3 w-3 text-muted-foreground" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                {searchFilter === 'table' ? translations['tables'] : translations['databases']}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem onClick={() => setSearchFilter('table')}>{translations['tables']}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSearchFilter('database')}>{translations['databases']}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1 space-y-1">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <span className="text-sm text-muted-foreground">{translations['loading']}</span>
            </div>
          ) : (
            filteredServers.map(server => (
              <div key={server.id}>
                <div className={`flex items-center justify-between py-1 px-1 cursor-pointer rounded hover:bg-muted/50 ${activeServerId === server.id ? 'text-primary bg-muted/30' : ''}`} onClick={() => handleServerClick(server.id)}>
                  <div className="flex items-center gap-1 text-xs font-medium">
                    {expandedDbs[server.id] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <Database className={`h-3 w-3 ${activeServerId === server.id ? 'text-primary' : 'text-emerald-500'}`} />
                    <span>{server.name}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-4 w-4 p-0">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                {expandedDbs[server.id] && (
                  <div className="pl-4 space-y-0.5 mt-0.5">
                    {(server.databases || []).map(database => (
                      <div key={database.name}>
                        <div
                          className={`flex items-center gap-1 text-xs rounded py-1 px-1 hover:bg-muted/50 cursor-pointer ${selectedDatabase === database.name && activeServerId === server.id ? 'bg-muted/30 text-primary' : ''}`}
                          onClick={() => handleTableClick(database.name, null)}
                        >
                          <button
                            type="button"
                            className="flex items-center justify-center"
                            onClick={event => {
                              event.stopPropagation();
                              toggleDatabase(server.id, database.name);
                            }}
                            aria-label={`${database.name} veritabanını genişlet`}
                          >
                            {expandedDatabases[server.id]?.[database.name] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </button>
                          <Table className={`h-3 w-3 ${selectedDatabase === database.name && activeServerId === server.id ? 'text-primary' : 'text-muted-foreground'}`} />
                          <span>{database.name}</span>
                        </div>
                        {expandedDatabases[server.id]?.[database.name] && (
                          <div className="pl-4 space-y-0.5 mt-0.5">
                            {database.tables.map(table => {
                                const tableKey = `${server.id}:${database.name}:${table}`;
                                const isTableExpanded = expandedTables[server.id]?.[table];

                                return (
                                  <div key={table}>
                                    <div
                                      className={`flex items-center gap-1 text-xs rounded py-1 px-1 hover:bg-muted/50 cursor-pointer ${selectedDatabase === database.name && selectedTable === table ? 'bg-muted/30 text-primary' : ''}`}
                                      onClick={() => {
                                        setActiveServerId(server.id);
                                        handleTableClick(database.name, table);
                                      }}
                                    >
                                      <button
                                        type="button"
                                        className="flex items-center justify-center"
                                        onClick={event => {
                                          event.stopPropagation();
                                          toggleTable(server.id, database.name, table);
                                        }}
                                        aria-label={`${table} tablosunu genişlet`}
                                      >
                                        {isTableExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                      </button>
                                      <Table className={`h-3 w-3 ${selectedDatabase === database.name && selectedTable === table ? 'text-primary' : 'text-muted-foreground'}`} />
                                      <span>{table}</span>
                                    </div>
                                    {isTableExpanded && (
                                      <div className="pl-4 space-y-0.5 mt-0.5">
                                        {tableLoadErrors[server.id]?.[tableKey] && (
                                          <div className="text-[11px] text-red-400 py-1 px-1">
                                            {tableLoadErrors[server.id]?.[tableKey]}
                                          </div>
                                        )}
                                        {(loadedTableColumns[server.id]?.[tableKey] || []).map(column => (
                                          <div key={column.name} className="flex items-center gap-2 text-[11px] rounded py-1 px-1 text-muted-foreground">
                                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                                            <span>{column.name}</span>
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${getColumnTypeClass(column.type)}`}>
                                              {formatColumnType(column.type)}
                                            </span>
                                          </div>
                                        ))}
                                        {loadingTables[server.id]?.[tableKey] && <div className="text-[11px] text-muted-foreground py-1 px-1">Kolonlar yükleniyor...</div>}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      <ServerCreateModal
        open={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        onSubmit={server => {
          addServer(server);
        }}
      />
      <div className="border-t p-2 flex items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="flex items-center gap-2 cursor-pointer rounded-md p-2 hover:bg-muted/50 data-[state=open]:bg-muted/50 w-full">
              <Avatar className="h-10 w-10">
                <AvatarImage src="https://github.com/battincik.png" alt="Avatar" />
                <AvatarFallback>B</AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1">
                <span className="text-sm font-semibold">Battincik</span>
                <span className="text-xs text-muted-foreground">@battincik</span>
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" className="w-[--radix-popper-anchor-width] p-2">
            <div className="px-4 py-2">
              <div className="flex items-center gap-2">
                <Avatar className="h-12 w-12">
                  <AvatarImage src="https://github.com/battincik.png" alt="Avatar" />
                  <AvatarFallback>B</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">Battincik</span>
                  <span className="text-xs text-muted-foreground">@battincik</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded">Admin</span>
                <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded">Developer</span>
                <span className="text-xs bg-purple-500 text-white px-2 py-0.5 rounded">Beta Tester</span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="px-4">
              <User className="mr-2 h-4 w-4" />
              {translations['settings']}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="px-4">
                <Database className="mr-2 h-4 w-4" />
                Veritabanları
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="text-xs w-full p-2">
                <DropdownMenuItem className="px-2 text-center justify-center">Veritabanlarını Yönet</DropdownMenuItem>
                <DropdownMenuSeparator />
                <ScrollArea className="h-[256px] flex-1">
                  {servers.map(server => (
                    <DropdownMenuItem key={server.id} className="px-2">
                      {server.name}
                    </DropdownMenuItem>
                  ))}
                </ScrollArea>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="px-4">
                <Settings className="mr-2 h-4 w-4" />
                Hesap Değiştir
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="text-xs w-full p-2">
                <div className="px-2 py-1 text-muted-foreground text-center text-sm select-none">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src="https://github.com/battincik.png" alt="Avatar" />
                      <AvatarFallback>B</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">Battincik</span>
                      <span className="text-xs text-muted-foreground">@battincik</span>
                    </div>
                  </div>
                </div>
                <DropdownMenuSeparator />
                {[
                  { displayName: 'John Doe', username: '@johndoe', avatar: 'https://github.com/johndoe.png' },
                  { displayName: 'Jane Smith', username: '@janesmith', avatar: 'https://github.com/janesmith.png' },
                  { displayName: 'Alice Brown', username: '@alicebrown', avatar: 'https://github.com/alicebrown.png' }
                ].map(account => (
                  <DropdownMenuItem key={account.username} className="px-2 w-48">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={account.avatar} alt="Avatar" />
                        <AvatarFallback>{account.displayName[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">{account.displayName}</span>
                        <span className="text-xs text-muted-foreground">{account.username}</span>
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="px-2 text-center justify-center">Hesap Ekle</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem className="px-4 text-red-400" onClick={() => handleLogOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              {translations['logout']}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={toggleTheme}>
          <Sun className="h-10 w-10 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-10 w-10 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">{translations['appearance']}</span>
        </Button>
        <Button variant="ghost" size="icon" className="h-10 w-10 min-w-10 min-h-10 p-0" onClick={() => Router.push('/editor/settings')}>
          <Settings className="h-5 w-5" />
          <span className="sr-only">{translations['settings']}</span>
        </Button>
      </div>
    </div>
  );
}
