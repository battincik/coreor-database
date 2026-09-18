'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, BookOpen, Code, Command, Database, Gauge, Network, Play, Search, Settings, ShieldAlert, Table2, Users } from 'lucide-react';
import type { DatabaseSchemaObject, DatabaseServerConfig } from 'types';
import { openQueryTab, qualifiedSqlName } from '@/lib/queryWorkspaceEvents';
import { fetchDatabaseObjects } from '@/lib/databaseApi';
import { useDesktop } from '@/context/DesktopContext';
import { matchesShortcut, shortcutLabel } from '@/lib/shortcuts';
import { databaseEngineFamily } from '@/lib/databaseEngines';
import { OPEN_PERFORMANCE_PANEL_EVENT, OPEN_PROCESS_CENTER_EVENT, OPEN_SETTINGS_MODAL_EVENT, OPEN_SQL_NOTEBOOK_EVENT, OPEN_TRANSACTION_WORKSPACE_EVENT, OPEN_USER_MANAGER_EVENT, TOGGLE_COMMAND_PALETTE_EVENT, dispatchDatabaseTool } from '@/lib/databaseToolEvents';

interface DatabaseCommandPaletteProps {
  servers: DatabaseServerConfig[];
  activeServerId: string | null;
  selectedDatabase: string | null;
  selectedTable: string | null;
  onDatabaseSelect: (databaseName: string | null) => void;
  onTableSelect: (tableName: string | null) => void;
}

interface PaletteItem {
  id: string;
  category: 'Son kullanılanlar' | 'Komutlar' | 'Veritabanları' | 'Tablolar' | 'Nesneler' | 'SQL';
  label: string;
  description: string;
  keywords: string;
  icon: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR');
}
function fuzzyScore(query: string, value: string) {
  const tokens = normalized(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const haystack = normalized(value);
  let score = 0;
  for (const token of tokens) {
    const direct = haystack.indexOf(token);
    if (direct >= 0) { score += direct === 0 ? 120 : Math.max(30, 90 - direct); continue; }
    let cursor = 0;
    let gaps = 0;
    for (const character of token) {
      const found = haystack.indexOf(character, cursor);
      if (found < 0) return -1;
      gaps += found - cursor;
      cursor = found + 1;
    }
    score += Math.max(5, 35 - gaps);
  }
  return score;
}

const RECENT_COMMANDS_KEY = 'coreor:command-palette-recent:v1';

function sqlFromQuery(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('>')) return trimmed.slice(1).trimStart();
  return trimmed.replace(/^sql:\s*/i, '');
}
function looksLikeSql(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith('>') || /^(sql:\s*)?(select|show|describe|desc|explain|with|insert|update|delete|create|alter|drop|truncate|call|set|start|commit|rollback)\b/i.test(trimmed);
}

export function DatabaseCommandPalette({ servers, activeServerId, selectedDatabase, selectedTable, onDatabaseSelect, onTableSelect }: DatabaseCommandPaletteProps) {
  const { workspaceKey } = useDesktop();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [objectIndex, setObjectIndex] = useState<Record<string, DatabaseSchemaObject[]>>({});
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const activeServer = servers.find(server => server.id === activeServerId) ?? null;
  const mysqlWorkbench = databaseEngineFamily(activeServer?.databaseType) === 'mysql';

  useEffect(() => {
    try { setRecentIds(JSON.parse(localStorage.getItem(RECENT_COMMANDS_KEY) || '[]')); } catch { setRecentIds([]); }
  }, []);
  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      if (matchesShortcut(event, 'commandPalette')) {
        event.preventDefault();
        setOpen(previous => !previous);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    const toggleHandler = () => setOpen(previous => !previous);
    window.addEventListener('keydown', keyHandler, true);
    window.addEventListener(TOGGLE_COMMAND_PALETTE_EVENT, toggleHandler);
    return () => {
      window.removeEventListener('keydown', keyHandler, true);
      window.removeEventListener(TOGGLE_COMMAND_PALETTE_EVENT, toggleHandler);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      setQuery('');
      setActiveIndex(0);
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open || !activeServer || !workspaceKey) return;
    let cancelled = false;
    const databases = activeServer.databases || [];
    let cursor = 0;
    const worker = async () => {
      while (!cancelled) {
        const database = databases[cursor++];
        if (!database) return;
        const key = `${activeServer.id}:${database.name}`;
        if (objectIndex[key]) continue;
        try {
          const result = await fetchDatabaseObjects(activeServer.id, database.name, workspaceKey);
          if (!cancelled) setObjectIndex(previous => ({ ...previous, [key]: result.objects }));
        } catch { /* catalog tables remain searchable */ }
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => { cancelled = true; };
  }, [open, activeServer?.id, workspaceKey]);

  const allItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [
      { id: 'new-query', category: 'Komutlar', label: 'Yeni SQL sorgusu', description: selectedDatabase ? `${selectedDatabase} veritabanında yeni sorgu` : 'Sunucu genelinde yeni sorgu', keywords: 'new yeni query sorgu sql editor create', icon: <Code className="h-4 w-4" />, shortcut: 'newQuery', disabled: !activeServer, run: () => openQueryTab({ serverId: activeServerId, databaseName: selectedDatabase, title: selectedDatabase ? `${selectedDatabase} sorgu` : 'Genel sorgu' }) },
      { id: 'settings-tls', category: 'Komutlar', label: 'TLS / bağlantı ayarları', description: 'Bağlantı profilleri ve SSL/TLS tercihleri', keywords: 'settings ayarlar tls ssl connection bağlantı security güvenlik', icon: <Settings className="h-4 w-4" />, run: () => dispatchDatabaseTool(OPEN_SETTINGS_MODAL_EVENT, { tab: 'servers' }) },
      { id: 'transaction', category: 'Komutlar', label: 'Transaction çalışma alanı', description: mysqlWorkbench ? 'Autocommit, commit ve rollback' : 'Bu motor için henüz kullanılamıyor', keywords: 'transaction commit rollback', icon: <ShieldAlert className="h-4 w-4" />, disabled: !activeServer || !mysqlWorkbench, run: () => dispatchDatabaseTool(OPEN_TRANSACTION_WORKSPACE_EVENT) },
      { id: 'users', category: 'Komutlar', label: 'Kullanıcı ve yetki yönetimi', description: mysqlWorkbench ? 'Kullanıcılar, roller, GRANT ve REVOKE' : 'Motor özel yönetim henüz kullanılamıyor', keywords: 'users kullanıcı rol grant revoke', icon: <Users className="h-4 w-4" />, disabled: !activeServer || !mysqlWorkbench, run: () => dispatchDatabaseTool(OPEN_USER_MANAGER_EVENT) },
      { id: 'processes', category: 'Komutlar', label: 'Process ve kilit merkezi', description: 'Aktif sorgular ve kilitler', keywords: 'show göster process processes lock locks kilit deadlock', icon: <Activity className="h-4 w-4" />, disabled: !activeServer || !mysqlWorkbench, run: () => dispatchDatabaseTool(OPEN_PROCESS_CENTER_EVENT) },
      { id: 'performance', category: 'Komutlar', label: 'Performans paneli', description: 'QPS, bağlantı, buffer pool ve depolama', keywords: 'performance qps buffer', icon: <Gauge className="h-4 w-4" />, disabled: !activeServer || !mysqlWorkbench, run: () => dispatchDatabaseTool(OPEN_PERFORMANCE_PANEL_EVENT) },
      { id: 'notebook', category: 'Komutlar', label: 'SQL Notebook', description: 'SQL, Markdown, sonuç ve grafikler', keywords: 'notebook markdown grafik', icon: <BookOpen className="h-4 w-4" />, disabled: !activeServer, run: () => dispatchDatabaseTool(OPEN_SQL_NOTEBOOK_EVENT) },
      { id: 'schema', category: 'Komutlar', label: 'Şema grafiğini aç', description: selectedDatabase ? `${selectedDatabase} ER / flow görünümü` : 'Önce veritabanı seçin', keywords: 'schema er graph foreign key', icon: <Network className="h-4 w-4" />, disabled: !activeServer || !selectedDatabase, run: () => window.dispatchEvent(new Event('coreor:open-schema-graph')) },
      { id: 'settings', category: 'Komutlar', label: 'Ayarları aç', description: 'Hesap, organizasyon, görünüm ve güvenlik', keywords: 'settings ayarlar organization tema preferences account hesap', icon: <Settings className="h-4 w-4" />, run: () => dispatchDatabaseTool(OPEN_SETTINGS_MODAL_EVENT, { tab: 'account' }) }
    ];
    for (const database of activeServer?.databases || []) {
      items.push({
        id: `backup:${database.name}`,
        category: 'Komutlar',
        label: `${database.name} yedeğini aç`,
        description: `${database.name} için backup merkezi`,
        keywords: `backup yedek yedekle ${database.name} database`,
        icon: <Database className="h-4 w-4" />,
        run: () => { onDatabaseSelect(database.name); window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('coreor:open-automation-center', { detail: { tab: 'backups' } }))); }
      });
      items.push({
        id: `database:${database.name}`,
        category: 'Veritabanları',
        label: database.name,
        description: `${database.tableCount} tablo • ${database.totalRows.toLocaleString('tr-TR')} satır`,
        keywords: `open aç ${database.name} database veritabanı`,
        icon: <Database className="h-4 w-4" />,
        run: () => {
          onDatabaseSelect(database.name);
          onTableSelect(null);
        }
      });
      for (const table of database.tables)
        items.push({
          id: `table:${database.name}:${table}`,
          category: 'Tablolar',
          label: `${database.name}.${table}`,
          description: selectedDatabase === database.name && selectedTable === table ? 'Şu an açık tablo' : 'Tablo verisini aç',
          keywords: `open aç show göster ${database.name} ${table} table tablo data veri`,
          icon: <Table2 className="h-4 w-4" />,
          run: () => {
            onDatabaseSelect(database.name);
            window.requestAnimationFrame(() => onTableSelect(table));
          }
        });
      for (const object of objectIndex[`${activeServer.id}:${database.name}`] || []) {
        if (object.kind === 'table') continue;
        items.push({
          id: `object:${database.name}:${object.kind}:${object.schema || ''}:${object.name}`,
          category: object.kind === 'view' ? 'Tablolar' : 'Nesneler',
          label: `${database.name}.${object.name}`,
          description: `${object.kind}${object.tableName ? ` • ${object.tableName}` : ''}`,
          keywords: `open aç show göster ${database.name} ${object.name} ${object.kind} routine procedure function trigger event view`,
          icon: object.kind === 'view' ? <Table2 className="h-4 w-4" /> : <Network className="h-4 w-4" />,
          run: () => {
            onDatabaseSelect(database.name);
            if (object.kind === 'view') window.requestAnimationFrame(() => onTableSelect(object.name));
            else {
              const target = qualifiedSqlName(database.name, object.name);
              const sql = object.kind === 'procedure' ? `CALL ${target}();` : object.kind === 'function' ? `SELECT ${target}();` : object.definition || `-- ${object.kind}: ${object.name}`;
              openQueryTab({ serverId: activeServer.id, databaseName: database.name, title: `${object.name} • ${object.kind}`, sql });
            }
          }
        });
      }
    }
    return items;
  }, [activeServer, activeServerId, selectedDatabase, selectedTable, onDatabaseSelect, onTableSelect, mysqlWorkbench, objectIndex]);

  const visibleItems = useMemo(() => {
    const search = normalized(query);
    const sql = sqlFromQuery(query).trim();
    const sqlMode = query.trimStart().startsWith('>');
    let items: PaletteItem[] = [];
    if (!sqlMode) {
      if (!search) {
        const recent = recentIds.map(id => allItems.find(item => item.id === id)).filter((item): item is PaletteItem => Boolean(item)).slice(0, 8).map(item => ({ ...item, category: 'Son kullanılanlar' as const }));
        items = [...recent, ...allItems.filter(item => item.category === 'Komutlar').slice(0, 14)];
      } else {
        items = allItems
          .map(item => ({ item, score: fuzzyScore(search, `${item.label} ${item.description} ${item.keywords}`) }))
          .filter(entry => entry.score >= 0)
          .sort((left, right) => right.score - left.score)
          .map(entry => entry.item);
      }
    }
    if (looksLikeSql(query) && activeServer && sql) items.unshift({ id: 'run-sql', category: 'SQL', label: 'Hızlı SQL çalıştır', description: sql.length > 130 ? `${sql.slice(0, 130)}…` : sql, keywords: '', icon: <Play className="h-4 w-4" />, shortcut: 'Enter', run: () => openQueryTab({ serverId: activeServerId, databaseName: selectedDatabase, title: 'Paletten SQL', sql, runImmediately: true }) });
    return items.slice(0, 120);
  }, [allItems, query, activeServer, activeServerId, selectedDatabase, recentIds]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setActiveIndex(0));
    return () => window.cancelAnimationFrame(raf);
  }, [query, open]);
  const execute = (item?: PaletteItem) => {
    if (!item || item.disabled) return;
    if (item.id !== 'run-sql') {
      setRecentIds(previous => {
        const next = [item.id, ...previous.filter(id => id !== item.id)].slice(0, 12);
        localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(next));
        return next;
      });
    }
    setOpen(false);
    item.run();
  };
  if (!open || typeof document === 'undefined') return null;

  let lastCategory: PaletteItem['category'] | null = null;
  const sqlMode = query.trimStart().startsWith('>');
  return createPortal(
    <div className="fixed inset-0 z-[640] flex items-start justify-center px-4 pt-[10vh]">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative z-10 flex max-h-[76vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950/98 shadow-2xl backdrop-blur">
        <div className={`flex h-14 shrink-0 items-center gap-3 border-b px-4 ${sqlMode ? 'border-cyan-500/25 bg-cyan-500/[0.04]' : 'border-zinc-800'}`}>
          <Search className={`h-5 w-5 ${sqlMode ? 'text-emerald-400' : 'text-cyan-400'}`} />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex(previous => (visibleItems.length ? Math.min(visibleItems.length - 1, previous + 1) : 0));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex(previous => Math.max(0, previous - 1));
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                execute(visibleItems[activeIndex]);
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="Komut ara: open sakila actor, show processes, backup coreor_proxy…"
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <span className={`rounded border px-2 py-1 text-[9px] ${sqlMode ? 'border-emerald-500/25 text-emerald-300' : 'border-zinc-800 text-zinc-500'}`}>{sqlMode ? 'SQL MODU' : 'ESC'}</span>
        </div>
        {sqlMode && (
          <div className="border-b border-zinc-800 px-4 py-2 text-[9px] text-zinc-600">
            <span className="font-mono text-emerald-400">&gt;</span> işaretinden sonra yazılan sorgu seçili veritabanında yeni sekmede çalıştırılır.
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visibleItems.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <Command className="mb-3 h-8 w-8 text-zinc-700" />
              <div className="text-sm text-zinc-400">{sqlMode ? 'Çalıştırılacak SQL’i yazın.' : 'Eşleşen komut bulunamadı.'}</div>
            </div>
          )}
          {visibleItems.map((item, index) => {
            const showCategory = lastCategory !== item.category;
            lastCategory = item.category;
            return (
              <React.Fragment key={item.id}>
                {showCategory && <div className="px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{item.category}</div>}
                <button type="button" disabled={item.disabled} onMouseEnter={() => setActiveIndex(index)} onClick={() => execute(item)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${index === activeIndex ? 'bg-cyan-500/12 text-cyan-100' : 'text-zinc-300 hover:bg-white/[0.04]'} disabled:opacity-35`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${index === activeIndex ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-zinc-800 bg-black/20 text-zinc-500'}`}>{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-zinc-600">{item.description}</span>
                  </span>
                  {item.shortcut && <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[9px] text-zinc-600">{shortcutLabel(item.shortcut)}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex h-9 shrink-0 items-center gap-3 border-t border-zinc-800 px-4 text-[9px] text-zinc-600">
          <span>↑↓ gezin</span>
          <span>Enter çalıştır</span>
          <span className="font-mono text-emerald-400">&gt; SQL</span>
          <span className="ml-auto flex items-center gap-1">
            <Database className="h-3 w-3" />
            {activeServer?.name || 'Bağlantı yok'}
            {selectedDatabase ? ` / ${selectedDatabase}` : ''}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
