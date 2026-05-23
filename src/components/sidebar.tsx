/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { useState, useEffect, useContext } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sun, Moon, LogOut, Plus, Table, ChevronDown, ChevronRight, Database, Search, User, Settings } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { SidebarProps } from 'types';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';
import { DatabaseContext } from '@/context/DatabaseContext';

export function Sidebar({ onDatabaseSelect, onTableSelect, selectedDatabase, selectedTable }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const Router = useRouter();
  const { data: session } = useSession();
  const { translations } = useLanguage();
  const { databases } = useContext(DatabaseContext)!;

  const [expandedDbs, setExpandedDbs] = useState<Record<string, boolean>>({});
  const [prevExpandedDbs, setPrevExpandedDbs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState<'database' | 'table'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('');

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    console.log(session);
  }, [session]);

  useEffect(() => {
    if (databases.length > 0) {
      setLoading(false);
    }
    if (searchQuery) {
      if (Object.keys(prevExpandedDbs).length === 0) {
        setPrevExpandedDbs(expandedDbs);
      }

      const allExpanded = Object.fromEntries(databases.map(db => [db.name, true]));
      setExpandedDbs(allExpanded);
    } else {
      if (Object.keys(prevExpandedDbs).length > 0) {
        setExpandedDbs(prevExpandedDbs);
        setPrevExpandedDbs({});
      } else {
        setExpandedDbs({});
      }
    }
  }, [searchQuery, databases]);

  const handleDatabaseClick = (dbName: string) => {
    setExpandedDbs(prev => {
      const isCurrentlyExpanded = prev[dbName];
      if (isCurrentlyExpanded) {
        return {
          ...prev,
          [dbName]: false
        };
      }

      setTimeout(() => {
        onDatabaseSelect(dbName);
        onTableSelect(null);
      }, 0);

      return {
        ...prev,
        [dbName]: true
      };
    });
  };

  const handleLogOut = () => {
    signOut({ callbackUrl: '/' });
    setActiveTab('');
  };

  const handleTableClick = (dbName: string, tableName: string) => {
    onDatabaseSelect(dbName);
    onTableSelect(tableName);
    console.log('Selected table:', tableName);
    console.log(activeTab);

    if (activeTab == 'table-data') {
      setActiveTab('table-data');
    }
  };

  const filteredDatabases = databases
    .map(db => ({
      ...db,
      tables: searchQuery && searchFilter === 'table' ? db.tables.filter(table => table.toLowerCase().includes(searchQuery.toLowerCase())) : db.tables
    }))
    .filter(db => (searchQuery && searchFilter === 'database' ? db.name.toLowerCase().includes(searchQuery.toLowerCase()) : db.tables));

  return (
    <div className="flex flex-col h-full border-r border-zinc-700 dark:bg-zinc-950">
      <div className="py-2 border-b border-zinc-700">
        <div className="flex items-center gap-1 font-semibold text-sm pb-2 px-2">
          <Database className="h-4 w-4 text-emerald-500" />
          <span>{translations['products']}</span>
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
            filteredDatabases.map(db => (
              <div key={db.name}>
                <div className={`flex items-center justify-between py-1 px-1 cursor-pointer rounded hover:bg-muted/50 ${selectedDatabase === db.name ? 'text-primary bg-muted/30' : ''}`} onClick={() => handleDatabaseClick(db.name)}>
                  <div className="flex items-center gap-1 text-xs font-medium">
                    {expandedDbs[db.name] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <Database className={`h-3 w-3 ${selectedDatabase === db.name ? 'text-primary' : 'text-emerald-500'}`} />
                    <span>{db.name}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-4 w-4 p-0">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                {expandedDbs[db.name] && (
                  <div className="pl-4 space-y-0.5 mt-0.5">
                    {db.tables.map(table => (
                      <div key={table} className={`flex items-center gap-1 text-xs rounded py-1 px-1 hover:bg-muted/50 cursor-pointer ${selectedDatabase === db.name && selectedTable === table ? 'bg-muted/30 text-primary' : ''}`} onClick={() => handleTableClick(db.name, table)}>
                        <Table className={`h-3 w-3 ${selectedDatabase === db.name && selectedTable === table ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span>{table}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
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
                  {databases.map(db => (
                    <DropdownMenuItem key={db.name} className="px-2">
                      {db.name}
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
