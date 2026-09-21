'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, BookOpen, Code, Command, Database, Gauge, Network, Play, Search, Settings, ShieldAlert, Table2, Users } from 'lucide-react';
import type { DatabaseSchemaObject, DatabaseServerConfig } from 'types';
import { openQueryTab, qualifiedSqlName } from '@/lib/queryWorkspaceEvents';
import { fetchDatabaseObjects } from '@/lib/databaseApi';
import { useDesktop } from '@/context/DesktopContext';
import { useLanguage } from '@/context/LanguageContext';
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
  category: 'recent' | 'commands' | 'databases' | 'tables' | 'objects' | 'sql';
  label: string;
  description: string;
  keywords: string;
  icon: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
}

function normalized(value: string, language: string) {
  return value.trim().toLocaleLowerCase(language);
}
function fuzzyScore(query: string, value: string, language: string) {
  const tokens = normalized(query,language).split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const haystack = normalized(value,language);
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
  const {t,formatNumber,language}=useLanguage();
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
        try {
          const result = await fetchDatabaseObjects(activeServer.id, database.name, workspaceKey);
          if (!cancelled) setObjectIndex(previous => ({ ...previous, [key]: result.objects }));
        } catch { /* catalog tables remain searchable */ }
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => { cancelled = true; };
  }, [open, activeServer, workspaceKey]);

  const allItems = useMemo<PaletteItem[]>(() => {
    const objectServerId = activeServer?.id || '';
    const items: PaletteItem[] = [
      { id: 'new-query', category: 'commands', label: t('commandPalette.newQuery'), description: selectedDatabase ? t('commandPalette.newQueryInDatabase',{database:selectedDatabase}) : t('commandPalette.newQueryServerScope'), keywords: 'new yeni query sorgu sql editor create', icon: <Code className="h-4 w-4" />, shortcut: 'newQuery', disabled: !activeServer, run: () => openQueryTab({ serverId: activeServerId, databaseName: selectedDatabase, title: selectedDatabase ? t('commandPalette.queryTitle',{database:selectedDatabase}) : t('commandPalette.generalQuery') }) },
      { id: 'settings-tls', category: 'commands', label: t('commandPalette.tlsSettings'), description: t('commandPalette.tlsSettingsDescription'), keywords: 'settings ayarlar tls ssl connection bağlantı security güvenlik', icon: <Settings className="h-4 w-4" />, run: () => dispatchDatabaseTool(OPEN_SETTINGS_MODAL_EVENT, { tab: 'servers' }) },
      { id: 'transaction', category: 'commands', label: t('commandPalette.transactionWorkspace'), description: mysqlWorkbench ? t('commandPalette.transactionDescription') : t('commandPalette.engineUnavailable'), keywords: 'transaction commit rollback', icon: <ShieldAlert className="h-4 w-4" />, disabled: !activeServer || !mysqlWorkbench, run: () => dispatchDatabaseTool(OPEN_TRANSACTION_WORKSPACE_EVENT) },
      { id: 'users', category: 'commands', label: t('commandPalette.userManagement'), description: mysqlWorkbench ? t('commandPalette.userManagementDescription') : t('commandPalette.engineManagementUnavailable'), keywords: 'users kullanıcı rol grant revoke', icon: <Users className="h-4 w-4" />, disabled: !activeServer || !mysqlWorkbench, run: () => dispatchDatabaseTool(OPEN_USER_MANAGER_EVENT) },
      { id: 'processes', category: 'commands', label: t('processCenter.title'), description: t('commandPalette.processDescription'), keywords: 'show göster process processes lock locks kilit deadlock', icon: <Activity className="h-4 w-4" />, disabled: !activeServer || !mysqlWorkbench, run: () => dispatchDatabaseTool(OPEN_PROCESS_CENTER_EVENT) },
      { id: 'performance', category: 'commands', label: t('commandPalette.performancePanel'), description: t('commandPalette.performanceDescription'), keywords: 'performance qps buffer', icon: <Gauge className="h-4 w-4" />, disabled: !activeServer || !mysqlWorkbench, run: () => dispatchDatabaseTool(OPEN_PERFORMANCE_PANEL_EVENT) },
      { id: 'notebook', category: 'commands', label: t('commandPalette.notebook'), description: t('commandPalette.notebookDescription'), keywords: 'notebook markdown grafik', icon: <BookOpen className="h-4 w-4" />, disabled: !activeServer, run: () => dispatchDatabaseTool(OPEN_SQL_NOTEBOOK_EVENT) },
      { id: 'schema', category: 'commands', label: t('commandPalette.openSchemaGraph'), description: selectedDatabase ? t('commandPalette.schemaDescription',{database:selectedDatabase}) : t('commandPalette.selectDatabaseFirst'), keywords: 'schema er graph foreign key', icon: <Network className="h-4 w-4" />, disabled: !activeServer || !selectedDatabase, run: () => window.dispatchEvent(new Event('coreor:open-schema-graph')) },
      { id: 'settings', category: 'commands', label: t('commandPalette.openSettings'), description: t('commandPalette.settingsDescription'), keywords: 'settings ayarlar organization tema preferences account hesap', icon: <Settings className="h-4 w-4" />, run: () => dispatchDatabaseTool(OPEN_SETTINGS_MODAL_EVENT, { tab: 'account' }) }
    ];
    for (const database of activeServer?.databases || []) {
      items.push({
        id: `backup:${database.name}`,
        category: 'commands',
        label: t('commandPalette.openBackup',{database:database.name}),
        description: t('commandPalette.backupDescription',{database:database.name}),
        keywords: `backup yedek yedekle ${database.name} database`,
        icon: <Database className="h-4 w-4" />,
        run: () => { onDatabaseSelect(database.name); window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('coreor:open-automation-center', { detail: { tab: 'backups' } }))); }
      });
      items.push({
        id: `database:${database.name}`,
        category: 'databases',
        label: database.name,
        description: t('commandPalette.databaseDescription',{tables:formatNumber(database.tableCount),rows:formatNumber(database.totalRows)}),
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
          category: 'tables',
          label: `${database.name}.${table}`,
          description: selectedDatabase === database.name && selectedTable === table ? t('commandPalette.currentTable') : t('commandPalette.openTableData'),
          keywords: `open aç show göster ${database.name} ${table} table tablo data veri`,
          icon: <Table2 className="h-4 w-4" />,
          run: () => {
            onDatabaseSelect(database.name);
            window.requestAnimationFrame(() => onTableSelect(table));
          }
        });
      for (const object of objectIndex[`${objectServerId}:${database.name}`] || []) {
        if (object.kind === 'table') continue;
        items.push({
          id: `object:${database.name}:${object.kind}:${object.schema || ''}:${object.name}`,
          category: object.kind === 'view' ? 'tables' : 'objects',
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
              openQueryTab({ serverId: objectServerId, databaseName: database.name, title: `${object.name} • ${object.kind}`, sql });
            }
          }
        });
      }
    }
    return items;
  }, [activeServer, activeServerId, selectedDatabase, selectedTable, onDatabaseSelect, onTableSelect, mysqlWorkbench, objectIndex, t, formatNumber]);

  const visibleItems = useMemo(() => {
    const search = normalized(query,language);
    const sql = sqlFromQuery(query).trim();
    const sqlMode = query.trimStart().startsWith('>');
    let items: PaletteItem[] = [];
    if (!sqlMode) {
      if (!search) {
        const recent = recentIds.map(id => allItems.find(item => item.id === id)).filter((item): item is PaletteItem => Boolean(item)).slice(0, 8).map(item => ({ ...item, category: 'recent' as const }));
        items = [...recent, ...allItems.filter(item => item.category === 'commands').slice(0, 14)];
      } else {
        items = allItems
          .map(item => ({ item, score: fuzzyScore(search, `${item.label} ${item.description} ${item.keywords}`,language) }))
          .filter(entry => entry.score >= 0)
          .sort((left, right) => right.score - left.score)
          .map(entry => entry.item);
      }
    }
    if (looksLikeSql(query) && activeServer && sql) items.unshift({ id: 'run-sql', category: 'sql', label: t('commandPalette.quickSql'), description: sql.length > 130 ? `${sql.slice(0, 130)}…` : sql, keywords: '', icon: <Play className="h-4 w-4" />, shortcut: 'Enter', run: () => openQueryTab({ serverId: activeServerId, databaseName: selectedDatabase, title: t('commandPalette.paletteSql'), sql, runImmediately: true }) });
    return items.slice(0, 120);
  }, [allItems, query, activeServer, activeServerId, selectedDatabase, recentIds, language, t]);

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
            placeholder={t('commandPalette.placeholder')}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <span className={`rounded border px-2 py-1 text-[9px] ${sqlMode ? 'border-emerald-500/25 text-emerald-300' : 'border-zinc-800 text-zinc-500'}`}>{sqlMode ? t('commandPalette.sqlMode') : 'ESC'}</span>
        </div>
        {sqlMode && (
          <div className="border-b border-zinc-800 px-4 py-2 text-[9px] text-zinc-600">
            <span className="font-mono text-emerald-400">&gt;</span> {t('commandPalette.sqlModeHint')}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visibleItems.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <Command className="mb-3 h-8 w-8 text-zinc-700" />
              <div className="text-sm text-zinc-400">{sqlMode ? t('commandPalette.enterSql') : t('commandPalette.noMatches')}</div>
            </div>
          )}
          {visibleItems.map((item, index) => {
            const showCategory = lastCategory !== item.category;
            lastCategory = item.category;
            return (
              <React.Fragment key={item.id}>
                {showCategory && <div className="px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{t(`commandPalette.category.${item.category}`)}</div>}
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
          <span>{t('commandPalette.navigate')}</span>
          <span>{t('commandPalette.run')}</span>
          <span className="font-mono text-emerald-400">&gt; SQL</span>
          <span className="ml-auto flex items-center gap-1">
            <Database className="h-3 w-3" />
            {activeServer?.name || t('commandPalette.noConnection')}
            {selectedDatabase ? ` / ${selectedDatabase}` : ''}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
