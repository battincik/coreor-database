'use client';

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Braces, ChevronDown, ChevronRight, Circle, Code2, Copy, Database, Download, FileCode2, FunctionSquare, Gauge, HardDrive, KeyRound, LogOut, MoreHorizontal, Network, Plus, RefreshCw, Search, Server, Settings2, ShieldCheck, Sparkles, Table2, Trash2, UserRound, View, Wifi, WifiOff, Wrench, X, Zap } from 'lucide-react';
import type { DatabaseEngine, DatabaseServerConfig, SidebarProps } from 'types';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useDesktop } from '@/context/DesktopContext';
import { Button } from '@/components/ui/button';
import { CoreorConfirmModal, type CoreorConfirmation } from '@/components/ui/coreor-confirm-modal';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ServerCreateModal } from '@/components/server-create-modal';
import { DatabaseActionConfirmModal, type DatabaseActionConfirmation } from '@/components/database-action-confirm-modal';
import { useAppContextMenu } from '@/components/app-context-menu';
import { executeDatabaseQuery, fetchServerTables } from '@/lib/databaseApi';
import { openQueryTab } from '@/lib/queryWorkspaceEvents';
import { OPEN_IMPORT_EXPORT_EVENT, OPEN_SETTINGS_MODAL_EVENT } from '@/lib/databaseToolEvents';
import { databaseEngineDefinition, databaseEngineFamily, databaseEngineLabel, quoteDatabaseIdentifier, qualifiedDatabaseTable } from '@/lib/databaseEngines';

interface CreateDatabaseState {
  server: DatabaseServerConfig;
  name: string;
  busy: boolean;
  error: string | null;
}

function initials(name?: string | null, email?: string | null) {
  return (name?.trim() || email?.trim() || 'C')
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
}

function objectTemplate(engine: DatabaseEngine, databaseName: string, type: string, tableName = 'new_object') {
  const family = databaseEngineFamily(engine);
  const object = quoteDatabaseIdentifier(tableName, engine);
  const table = qualifiedDatabaseTable(databaseName, tableName, engine);
  if (type === 'table') return `CREATE TABLE ${table} (\n  id ${family === 'mysql' ? 'BIGINT UNSIGNED AUTO_INCREMENT' : family === 'mssql' ? 'BIGINT IDENTITY(1,1)' : 'BIGSERIAL'} PRIMARY KEY,\n  created_at ${family === 'mssql' ? 'DATETIME2' : 'TIMESTAMP'} NOT NULL DEFAULT ${family === 'mssql' ? 'SYSUTCDATETIME()' : 'CURRENT_TIMESTAMP'}\n);`;
  if (type === 'view') return `CREATE VIEW ${object} AS\nSELECT *\nFROM ${qualifiedDatabaseTable(databaseName, 'source_table', engine)};`;
  if (type === 'procedure') return family === 'mysql' ? `DELIMITER //\nCREATE PROCEDURE ${object}()\nBEGIN\n  SELECT CURRENT_TIMESTAMP;\nEND //\nDELIMITER ;` : family === 'mssql' ? `CREATE PROCEDURE ${object}\nAS\nBEGIN\n  SET NOCOUNT ON;\n  SELECT SYSUTCDATETIME() AS current_time;\nEND;` : `CREATE PROCEDURE ${object}()\nLANGUAGE SQL\nAS $$\n  SELECT CURRENT_TIMESTAMP;\n$$;`;
  if (type === 'function') return family === 'mssql' ? `CREATE FUNCTION ${object}()\nRETURNS DATETIME2\nAS\nBEGIN\n  RETURN SYSUTCDATETIME();\nEND;` : `CREATE FUNCTION ${object}()\nRETURNS TIMESTAMP\n${family === 'mysql' ? 'DETERMINISTIC\nRETURN CURRENT_TIMESTAMP' : 'LANGUAGE SQL\nAS $$ SELECT CURRENT_TIMESTAMP $$'};`;
  if (type === 'trigger') return `CREATE TRIGGER ${object}\n${family === 'mssql' ? 'ON' : 'BEFORE INSERT ON'} ${qualifiedDatabaseTable(databaseName, 'target_table', engine)}\n${family === 'mssql' ? 'AFTER INSERT\nAS\nBEGIN\n  SET NOCOUNT ON;\nEND;' : 'FOR EACH ROW\nBEGIN\n  -- trigger body\nEND;'}`;
  if (type === 'event') return family === 'mysql' ? `CREATE EVENT ${object}\nON SCHEDULE EVERY 1 DAY\nDO\n  SELECT CURRENT_TIMESTAMP;` : `-- ${databaseEngineLabel(engine)} zamanlanmış görevleri için sunucu scheduler/agent kullanın.`;
  return `CREATE INDEX ${object}\nON ${qualifiedDatabaseTable(databaseName, 'target_table', engine)} (${quoteDatabaseIdentifier('column_name', engine)});`;
}

function maintenanceSql(engine: DatabaseEngine, database: string, table: string, operation: 'analyze' | 'check' | 'optimize' | 'repair') {
  const family = databaseEngineFamily(engine);
  const target = qualifiedDatabaseTable(database, table, engine);
  if (family === 'mysql') return `${operation.toUpperCase()} TABLE ${target};`;
  if (family === 'postgresql') return operation === 'analyze' ? `ANALYZE ${target};` : operation === 'optimize' ? `VACUUM (ANALYZE) ${target};` : `-- ${operation} işlemi için PostgreSQL katalog ve loglarını inceleyin.\nANALYZE ${target};`;
  return operation === 'analyze' ? `UPDATE STATISTICS ${target};` : operation === 'check' ? `DBCC CHECKTABLE ('${table}') WITH NO_INFOMSGS;` : `ALTER INDEX ALL ON ${target} REORGANIZE;`;
}

function CreateDatabaseModal({ state, onChange, onClose, onCreate }: { state: CreateDatabaseState | null; onChange: (state: CreateDatabaseState) => void; onClose: () => void; onCreate: () => void | Promise<void> }) {
  if (!state || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[610] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={state.busy ? undefined : onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <header className="flex items-center gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10">
            <Database className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Yeni veritabanı</h2>
            <p className="mt-0.5 truncate text-[9px] text-zinc-600">
              {state.server.name} • {databaseEngineLabel(state.server.databaseType)}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="p-5">
          <label className="mb-2 block text-[10px] text-zinc-400">Veritabanı adı</label>
          <Input autoFocus value={state.name} onChange={event => onChange({ ...state, name: event.target.value, error: null })} className="h-10 bg-black/25 font-mono" placeholder="coreor_app" />
          {state.error && <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">{state.error}</div>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            İptal
          </Button>
          <Button size="sm" disabled={!/^[A-Za-z0-9_$-]+$/.test(state.name) || state.busy} onClick={() => void onCreate()}>
            {state.busy && <Activity className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Oluştur
          </Button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

export default function Sidebar({ onDatabaseSelect, onTableSelect, selectedDatabase, selectedTable }: SidebarProps) {
  const { workspaceKey, user } = useDesktop();
  const context = useContext(DatabaseContext)!;
  const { openContextMenu } = useAppContextMenu();
  const { servers, activeServerId, setActiveServerId, addServer, updateServer, removeServer, loadServers, isAddingServer, isServersLoading } = context;
  const [search, setSearch] = useState('');
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [profileOpen, setProfileOpen] = useState(false);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<DatabaseServerConfig | null>(null);
  const [confirmation, setConfirmation] = useState<DatabaseActionConfirmation | null>(null);
  const [profileConfirmation, setProfileConfirmation] = useState<CoreorConfirmation | null>(null);
  const [createDatabase, setCreateDatabase] = useState<CreateDatabaseState | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!activeServerId) return;
    setExpandedServers(previous => new Set(previous).add(activeServerId));
  }, [activeServerId]);
  useEffect(() => {
    const open = () => {
      setEditingServer(null);
      setServerModalOpen(true);
    };
    const edit = (event: Event) => {
      const id = (event as CustomEvent<{ serverId?: string }>).detail?.serverId;
      const server = servers.find(item => item.id === id);
      if (server) {
        setEditingServer(server);
        setServerModalOpen(true);
      }
    };
    window.addEventListener('coreor:open-server-modal', open);
    window.addEventListener('coreor:edit-server-modal', edit);
    return () => {
      window.removeEventListener('coreor:open-server-modal', open);
      window.removeEventListener('coreor:edit-server-modal', edit);
    };
  }, [servers]);

  const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR');
  const filteredServers = useMemo(
    () =>
      servers
        .map(server => ({
          ...server,
          databases: (server.databases || []).map(database => ({ ...database, tables: database.tables.filter(table => !normalizedSearch || `${server.name} ${database.name} ${table}`.toLocaleLowerCase('tr-TR').includes(normalizedSearch)) })).filter(database => !normalizedSearch || database.tables.length || `${server.name} ${database.name}`.toLocaleLowerCase('tr-TR').includes(normalizedSearch))
        }))
        .filter(server => !normalizedSearch || server.databases?.length || `${server.name} ${server.host} ${databaseEngineLabel(server.databaseType)}`.toLocaleLowerCase('tr-TR').includes(normalizedSearch)),
    [servers, normalizedSearch]
  );

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string, force?: boolean) =>
    setter(previous => {
      const next = new Set(previous);
      const enabled = force ?? !next.has(value);
      if (enabled) next.add(value);
      else next.delete(value);
      return next;
    });
  const expandAll = (server?: DatabaseServerConfig) => {
    const targets = server ? [server] : servers;
    setExpandedServers(new Set(targets.map(item => item.id)));
    setExpandedDatabases(new Set(targets.flatMap(item => (item.databases || []).map(database => `${item.id}:${database.name}`))));
  };
  const collapseAll = () => {
    setExpandedServers(new Set());
    setExpandedDatabases(new Set());
  };
  const refreshServer = async (server: DatabaseServerConfig) => {
    if (!workspaceKey) return;
    await fetchServerTables(server.id, workspaceKey);
    await loadServers();
  };
  const runDangerous = (server: DatabaseServerConfig, database: string, table: string, sql: string, title: string, description: string, label: string) =>
    setConfirmation({
      title,
      description,
      expectedText: table,
      sql,
      confirmLabel: label,
      onConfirm: async () => {
        if (!workspaceKey) throw new Error('Yerel çalışma alanı hazır değil.');
        await executeDatabaseQuery(server.id, sql, workspaceKey, database);
        await refreshServer(server);
        if (/DROP\s+TABLE/i.test(sql)) onTableSelect(null);
      }
    });
  const openSql = (server: DatabaseServerConfig, database: string | null, title: string, sql: string, runImmediately = false) => openQueryTab({ serverId: server.id, databaseName: database, title, sql, runImmediately });

  const serverMenu = (event: React.MouseEvent, server: DatabaseServerConfig) =>
    openContextMenu(
      event,
      [
        { id: 'activate', label: 'Sunucuyu etkinleştir', icon: Server, onSelect: () => setActiveServerId(server.id) },
        { id: 'create-db', label: 'Yeni veritabanı oluştur', icon: Plus, onSelect: () => setCreateDatabase({ server, name: '', busy: false, error: null }) },
        { id: 'query', label: 'Sunucu geneli sorgu', icon: Code2, onSelect: () => openSql(server, null, `${server.name} sorgu`, '') },
        { id: 'refresh', label: 'Bütün kataloğu yenile', icon: RefreshCw, onSelect: () => void refreshServer(server) },
        { id: 'sep1', separator: true },
        { id: 'expand', label: 'Hepsini genişlet', icon: ChevronDown, onSelect: () => expandAll(server) },
        { id: 'collapse', label: 'Hepsini daralt', icon: ChevronRight, onSelect: collapseAll },
        { id: 'copy-connection', label: 'Bağlantı bilgisini kopyala', icon: Copy, children: [
          { id: 'copy-host', label: 'Host', icon: Copy, onSelect: () => navigator.clipboard.writeText(server.host || '') },
          { id: 'copy-host-port', label: 'Host:port', icon: Copy, onSelect: () => navigator.clipboard.writeText(`${server.host}:${server.port}`) },
          { id: 'copy-user', label: 'Kullanıcı adı', icon: Copy, onSelect: () => navigator.clipboard.writeText(server.username || '') },
          { id: 'copy-summary', label: 'Bağlantı özeti', icon: Copy, onSelect: () => navigator.clipboard.writeText(`${server.name} • ${databaseEngineLabel(server.databaseType)} • ${server.host}:${server.port} • ${server.username}`) }
        ] },
        {
          id: 'edit',
          label: 'Bağlantıyı düzenle',
          icon: Settings2,
          onSelect: () => {
            setEditingServer(server);
            setServerModalOpen(true);
          }
        },
        {
          id: 'remove-profile',
          label: 'Bağlantı profilini kaldır',
          icon: Trash2,
          danger: true,
          onSelect: () => setProfileConfirmation({
            title: 'Bağlantı profilini kaldır',
            description: `"${server.name}" profili yalnızca bu bilgisayardaki Coreor bağlantı kasasından kaldırılacak. MySQL sunucusu, veritabanları ve tablolar silinmez.`,
            confirmLabel: 'Profili kaldır',
            tone: 'danger',
            onConfirm: () => removeServer(server.id)
          })
        }
      ],
      `${server.name} • ${databaseEngineLabel(server.databaseType)}`
    );

  const databaseMenu = (event: React.MouseEvent, server: DatabaseServerConfig, database: string) =>
    openContextMenu(
      event,
      [
        {
          id: 'open',
          label: 'Veritabanını aç',
          icon: Database,
          onSelect: () => {
            setActiveServerId(server.id);
            onDatabaseSelect(database);
            onTableSelect(null);
          }
        },
        { id: 'query', label: 'Yeni SQL sorgusu', icon: Code2, onSelect: () => openSql(server, database, `${database} sorgu`, '') },
        {
          id: 'schema',
          label: 'Şema grafiğini aç',
          icon: Network,
          onSelect: () => {
            setActiveServerId(server.id);
            onDatabaseSelect(database);
            onTableSelect(null);
            window.dispatchEvent(new Event('coreor:open-schema-graph'));
          }
        },
        {
          id: 'new',
          label: 'Yeni oluştur',
          icon: Plus,
          children: [
            ['table', 'Tablo', Table2],
            ['view', 'View', View],
            ['procedure', 'Stored procedure', Zap],
            ['function', 'Function', FunctionSquare],
            ['trigger', 'Trigger', Activity],
            ['event', 'Event / zamanlanmış olay', Sparkles],
            ['index', 'İndeks', KeyRound]
          ].map(([type, label, icon]) => ({ id: `new-${type}`, label: String(label), icon: icon as typeof Plus, onSelect: () => openSql(server, database, `Yeni ${label}`, objectTemplate(server.databaseType || 'mysql', database, String(type))) }))
        },
        {
          id: 'routines',
          label: 'Rutinleri yürüt',
          icon: Braces,
          children: [
            { id: 'call', label: 'Procedure çağır', icon: Zap, onSelect: () => openSql(server, database, 'Procedure çağır', databaseEngineFamily(server.databaseType) === 'postgresql' ? 'CALL procedure_name();' : 'CALL procedure_name();') },
            { id: 'function', label: 'Function çalıştır', icon: FunctionSquare, onSelect: () => openSql(server, database, 'Function çalıştır', 'SELECT function_name();') }
          ]
        },
        {
          id: 'export',
          label: 'Veritabanını SQL olarak dışa aktar',
          icon: Download,
          onSelect: () => {
            setActiveServerId(server.id);
            onDatabaseSelect(database);
            window.dispatchEvent(new Event(OPEN_IMPORT_EXPORT_EVENT));
          }
        },
        { id: 'sep2', separator: true },
        {
          id: 'expand',
          label: 'Hepsini genişlet',
          icon: ChevronDown,
          onSelect: () => {
            toggle(setExpandedServers, server.id, true);
            toggle(setExpandedDatabases, `${server.id}:${database}`, true);
          }
        },
        { id: 'collapse', label: 'Hepsini daralt', icon: ChevronRight, onSelect: () => toggle(setExpandedDatabases, `${server.id}:${database}`, false) },
        { id: 'copy-db', label: 'Veritabanı adını kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(database) },
        { id: 'copy-db-quoted', label: 'Quoted veritabanı adını kopyala', icon: Code2, onSelect: () => navigator.clipboard.writeText(quoteDatabaseIdentifier(database, server.databaseType || 'mysql')) },
        { id: 'refresh', label: 'Yenile', icon: RefreshCw, onSelect: () => void refreshServer(server) },
        { id: 'sep-danger', separator: true },
        {
          id: 'drop-database',
          label: 'Veritabanını sil (DROP DATABASE)',
          icon: Trash2,
          danger: true,
          onSelect: () => setConfirmation({
            title: `${database} veritabanını sil`,
            description: 'Bu işlem veritabanını, bütün tablolarını ve içindeki verileri sunucudan kalıcı olarak siler.',
            expectedText: database,
            sql: `DROP DATABASE ${quoteDatabaseIdentifier(database, server.databaseType || 'mysql')};`,
            confirmLabel: 'Veritabanını kalıcı olarak sil',
            onConfirm: async () => {
              if (!workspaceKey) throw new Error('Yerel çalışma alanı hazır değil.');
              await executeDatabaseQuery(server.id, `DROP DATABASE ${quoteDatabaseIdentifier(database, server.databaseType || 'mysql')};`, workspaceKey, null);
              if (selectedDatabase === database) { onTableSelect(null); onDatabaseSelect(null); }
              await refreshServer(server);
            }
          })
        }
      ],
      `${server.name}.${database}`
    );

  const tableMenu = (event: React.MouseEvent, server: DatabaseServerConfig, database: string, table: string) => {
    const engine = server.databaseType || 'mysql';
    const qualified = qualifiedDatabaseTable(database, table, engine);
    openContextMenu(
      event,
      [
        {
          id: 'data',
          label: 'Verileri aç',
          icon: Table2,
          onSelect: () => {
            setActiveServerId(server.id);
            onDatabaseSelect(database);
            onTableSelect(table);
          }
        },
        {
          id: 'structure',
          label: 'Yapıyı aç',
          icon: Wrench,
          onSelect: () => {
            setActiveServerId(server.id);
            onDatabaseSelect(database);
            onTableSelect(table);
          }
        },
        { id: 'query', label: 'SELECT sorgusu', icon: Code2, onSelect: () => openSql(server, database, `${table} SELECT`, `SELECT * FROM ${qualified}\nLIMIT 100;`) },
        { id: 'insert-row', label: 'Satır ekle', icon: Plus, disabled: Boolean(server.readOnly), onSelect: () => { setActiveServerId(server.id); onDatabaseSelect(database); onTableSelect(table); window.dispatchEvent(new CustomEvent('coreor:request-insert-table-row', { detail: { databaseName: database, tableName: table } })); } },
        {
          id: 'new',
          label: 'Yeni oluştur',
          icon: Plus,
          children: [
            ['table', 'Tablo', Table2],
            ['view', 'View', View],
            ['procedure', 'Stored procedure', Zap],
            ['function', 'Function', FunctionSquare],
            ['trigger', 'Trigger', Activity],
            ['event', 'Event', Sparkles],
            ['index', 'İndeks', KeyRound]
          ].map(([type, label, icon]) => ({ id: `new-${type}`, label: String(label), icon: icon as typeof Plus, onSelect: () => openSql(server, database, `Yeni ${label}`, objectTemplate(engine, database, String(type))) }))
        },
        { id: 'routines', label: 'Rutinleri yürüt', icon: Braces, onSelect: () => openSql(server, database, `${table} rutin`, `CALL routine_name(${quoteDatabaseIdentifier('parameter', engine)});`) },
        { id: 'sep1', separator: true },
        { id: 'truncate', label: 'Boş tablo — bütün veriyi sil', icon: Trash2, danger: true, onSelect: () => runDangerous(server, database, table, `TRUNCATE TABLE ${qualified};`, `${table} tablosunu boşalt`, 'Tablodaki bütün satırlar tek işlemde kalıcı olarak silinecek.', 'Tabloyu boşalt') },
        { id: 'drop', label: 'Düşür — tabloyu sil', icon: Trash2, danger: true, onSelect: () => runDangerous(server, database, table, `DROP TABLE ${qualified};`, `${table} tablosunu düşür`, 'Tablo yapısı, verileri, indeksleri ve bağlı nesneleri kalıcı olarak silinebilir.', 'Tabloyu sil') },
        { id: 'sep2', separator: true },
        {
          id: 'export',
          label: 'SQL olarak dışa aktar',
          icon: Download,
          onSelect: () => {
            setActiveServerId(server.id);
            onDatabaseSelect(database);
            onTableSelect(table);
            window.dispatchEvent(new Event(OPEN_IMPORT_EXPORT_EVENT));
          }
        },
        {
          id: 'maintenance',
          label: 'Bakım',
          icon: Wrench,
          children: [
            ['analyze', 'İstatistikleri analiz et'],
            ['check', 'Bütünlüğü kontrol et'],
            ['optimize', 'Optimize / vacuum'],
            ['repair', 'Onarım taslağı']
          ].map(([operation, label]) => ({ id: `maintenance-${operation}`, label, icon: Gauge, onSelect: () => openSql(server, database, `${table} bakım`, maintenanceSql(engine, database, table, operation as 'analyze' | 'check' | 'optimize' | 'repair')) }))
        },
        { id: 'copy-table', label: 'Kopyala', icon: Copy, children: [
          { id: 'copy-table-name', label: 'Tablo adı', icon: Copy, onSelect: () => navigator.clipboard.writeText(table) },
          { id: 'copy-qualified', label: 'Tam tablo adı', icon: Copy, onSelect: () => navigator.clipboard.writeText(qualified) },
          { id: 'copy-select', label: 'SELECT taslağı', icon: Code2, onSelect: () => navigator.clipboard.writeText(`SELECT * FROM ${qualified}\nLIMIT 100;`) }
        ] },
        { id: 'sep3', separator: true },
        { id: 'expand', label: 'Hepsini genişlet', icon: ChevronDown, onSelect: () => expandAll(server) },
        { id: 'collapse', label: 'Hepsini daralt', icon: ChevronRight, onSelect: collapseAll },
        { id: 'refresh', label: 'Yenile', icon: RefreshCw, onSelect: () => void refreshServer(server) }
      ],
      `${database}.${table}`
    );
  };

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-zinc-800 bg-zinc-950/96">
      <header className="shrink-0 border-b border-zinc-800 p-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10">
            <Database className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-zinc-100">Coreor Database</div>
            <div className="text-[8px] text-zinc-600">v3.1.0 • Çoklu motor çalışma alanı</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              setEditingServer(null);
              setServerModalOpen(true);
            }}
            title="Yeni sunucu"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void loadServers()} title="Kasa ve katalogları yenile">
            <RefreshCw className={`h-3.5 w-3.5 ${isServersLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <Input value={search} onChange={event => setSearch(event.target.value)} className="h-8 rounded-xl border-zinc-800 bg-black/30 pl-8 pr-8 text-[10px]" placeholder="Sunucu, veritabanı veya tablo ara…" />
          {search && (
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600" onClick={() => setSearch('')}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      <div className="coreor-scroll-frame min-h-0 flex-1 overflow-auto p-1.5">
        {isServersLoading && !servers.length ? (
          <div className="flex h-32 items-center justify-center gap-2 text-[10px] text-zinc-600">
            <Activity className="h-3.5 w-3.5 animate-spin" />
            Bağlantı kasası okunuyor…
          </div>
        ) : !filteredServers.length ? (
          <div className="p-6 text-center">
            <Server className="mx-auto h-7 w-7 text-zinc-700" />
            <div className="mt-3 text-[10px] text-zinc-500">{search ? 'Aramayla eşleşen kayıt yok.' : 'Henüz sunucu eklenmedi.'}</div>
          </div>
        ) : (
          filteredServers.map(server => {
            const serverOpen = expandedServers.has(server.id) || Boolean(search);
            const active = activeServerId === server.id;
            return (
              <section key={server.id} className="mb-1 overflow-hidden rounded-xl border border-transparent hover:border-zinc-800/70">
                <div className={`group flex h-9 items-center gap-1.5 px-1.5 ${active ? 'bg-cyan-500/[0.07]' : 'hover:bg-white/[0.025]'}`} onContextMenu={event => serverMenu(event, server)}>
                  <button type="button" className="flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-800" onClick={() => toggle(setExpandedServers, server.id)}>
                    {serverOpen ? <ChevronDown className="h-3.5 w-3.5 text-cyan-400" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />}
                  </button>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setActiveServerId(server.id)}>
                    <Server className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-emerald-400' : 'text-zinc-600'}`} />
                    <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-zinc-300">{server.name}</span>
                    <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[7px] text-zinc-600">{databaseEngineLabel(server.databaseType)}</span>
                  </button>
                  <button type="button" className="flex h-6 w-6 items-center justify-center rounded opacity-0 hover:bg-zinc-800 group-hover:opacity-100" onClick={event => serverMenu(event, server)}>
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>
                {serverOpen && (
                  <div className="ml-4 border-l border-zinc-800 pl-1.5">
                    {(server.databases || []).map(database => {
                      const databaseKey = `${server.id}:${database.name}`;
                      const databaseOpen = expandedDatabases.has(databaseKey) || Boolean(search);
                      const selected = active && selectedDatabase === database.name;
                      return (
                        <div key={database.name}>
                          <div className={`group flex h-8 items-center gap-1 px-1 ${selected ? 'bg-cyan-500/[0.05]' : 'hover:bg-white/[0.02]'}`} onContextMenu={event => databaseMenu(event, server, database.name)}>
                            <button type="button" className="flex h-6 w-6 items-center justify-center" onClick={() => toggle(setExpandedDatabases, databaseKey)}>
                              {databaseOpen ? <ChevronDown className="h-3 w-3 text-cyan-400" /> : <ChevronRight className="h-3 w-3 text-zinc-700" />}
                            </button>
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              onClick={() => {
                                setActiveServerId(server.id);
                                onDatabaseSelect(database.name);
                                onTableSelect(null);
                              }}
                            >
                              <Database className="h-3 w-3 shrink-0 text-emerald-500" />
                              <span className="min-w-0 flex-1 truncate text-[9px] text-zinc-400">{database.name}</span>
                              <span className="text-[7px] tabular-nums text-zinc-700">{database.tableCount}</span>
                            </button>
                          </div>
                          {databaseOpen && (
                            <div className="ml-5 border-l border-zinc-900 pl-1">
                              {database.tables.map(table => (
                                <button
                                  key={table}
                                  type="button"
                                  className={`group flex h-7 w-full min-w-0 items-center gap-2 rounded px-2 text-left ${active && selectedDatabase === database.name && selectedTable === table ? 'bg-cyan-500/10 text-cyan-200' : 'text-zinc-500 hover:bg-white/[0.025] hover:text-zinc-300'}`}
                                  onClick={() => {
                                    setActiveServerId(server.id);
                                    onDatabaseSelect(database.name);
                                    onTableSelect(table);
                                  }}
                                  onContextMenu={event => tableMenu(event, server, database.name, table)}
                                >
                                  <Table2 className="h-3 w-3 shrink-0" />
                                  <span className="min-w-0 flex-1 truncate text-[9px]">{table}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      <div className="relative shrink-0 border-t border-zinc-800 p-2">
        <button type="button" onClick={() => setProfileOpen(previous => !previous)} className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-black/25 p-2.5 text-left transition hover:border-zinc-700 hover:bg-white/[0.025]">
          <div className="relative">
            <Avatar className="h-10 w-10 border border-zinc-700">
              <AvatarImage src={user?.image || undefined} />
              <AvatarFallback>{initials(user?.name, user?.email)}</AvatarFallback>
            </Avatar>
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-950 ${online ? 'bg-emerald-400' : 'bg-red-400'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold text-zinc-100">{user?.name || 'Coreor kullanıcısı'}</div>
            <div className="truncate text-[9px] text-zinc-600">{user?.email || 'E-posta paylaşılmadı'}</div>
            <div className={`mt-1 flex items-center gap-1 text-[8px] font-medium ${online ? 'text-emerald-400' : 'text-red-400'}`}>
              {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {online ? 'Bağlı' : 'Çevrimdışı'}
            </div>
          </div>
          <ChevronDown className={`h-3.5 w-3.5 text-zinc-600 transition ${profileOpen ? 'rotate-180' : ''}`} />
        </button>
        {profileOpen && (
          <div className="absolute bottom-[calc(100%+7px)] left-2 right-2 z-[220] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
            <div className="border-b border-zinc-800 px-3 py-2.5">
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-zinc-500">Bağlantı durumu</span>
                <span className={online ? 'text-emerald-400' : 'text-red-400'}>{online ? 'İnternet bağlı' : 'İnternet yok'}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[9px]">
                <span className="text-zinc-500">Kayıtlı sunucu</span>
                <span className="text-zinc-300">{servers.length}</span>
              </div>
            </div>
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 px-3 text-[10px] text-zinc-300 hover:bg-white/[0.04]"
              onClick={() => {
                window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_MODAL_EVENT, { detail: { tab: 'account' } }));
                setProfileOpen(false);
              }}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Ayarları aç
            </button>
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 px-3 text-[10px] text-zinc-300 hover:bg-white/[0.04]"
              onClick={() => {
                setEditingServer(null);
                setServerModalOpen(true);
                setProfileOpen(false);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Yeni sunucu ekle
            </button>
            <button type="button" className="flex h-9 w-full items-center gap-2 border-t border-zinc-800 px-3 text-[10px] text-red-400 hover:bg-red-500/[0.06]" onClick={() => { setProfileOpen(false); void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().close()); }}>
              <LogOut className="h-3.5 w-3.5" />
              Uygulamayı kapat
            </button>
          </div>
        )}
      </div>

      <ServerCreateModal
        open={serverModalOpen}
        onClose={() => {
          setServerModalOpen(false);
          setEditingServer(null);
        }}
        initialServer={editingServer}
        onSubmit={addServer}
        onUpdate={updateServer}
      />
      <DatabaseActionConfirmModal action={confirmation} onClose={() => setConfirmation(null)} />
      <CoreorConfirmModal action={profileConfirmation} onClose={() => setProfileConfirmation(null)} />
      <CreateDatabaseModal
        state={createDatabase}
        onChange={setCreateDatabase}
        onClose={() => setCreateDatabase(null)}
        onCreate={async () => {
          if (!createDatabase || !workspaceKey) return;
          const name = createDatabase.name.trim();
          const engine = createDatabase.server.databaseType || 'mysql';
          setCreateDatabase({ ...createDatabase, busy: true, error: null });
          try {
            await executeDatabaseQuery(createDatabase.server.id, `CREATE DATABASE ${quoteDatabaseIdentifier(name, engine)};`, workspaceKey, null);
            await refreshServer(createDatabase.server);
            setCreateDatabase(null);
          } catch (error) {
            setCreateDatabase(previous => (previous ? { ...previous, busy: false, error: error instanceof Error ? error.message : 'Veritabanı oluşturulamadı.' } : null));
          }
        }}
      />
    </aside>
  );
}
