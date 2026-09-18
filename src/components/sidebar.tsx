'use client';

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Braces, ChevronDown, ChevronRight, Circle, Code2, Copy, Database, Download, FileCode2, FunctionSquare, Gauge, HardDrive, KeyRound, LogOut, MoreHorizontal, Network, Plus, RefreshCw, Search, Server, Settings2, ShieldCheck, Sparkles, Table2, Trash2, UserRound, View, Wifi, WifiOff, Wrench, X, Zap } from 'lucide-react';
import type { DatabaseEngine, DatabaseSchemaObject, DatabaseServerConfig, SidebarProps } from 'types';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useDesktop } from '@/context/DesktopContext';
import { Button } from '@/components/ui/button';
import { CoreorConfirmModal, type CoreorConfirmation } from '@/components/ui/coreor-confirm-modal';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ServerCreateModal } from '@/components/server-create-modal';
import { DatabaseActionConfirmModal, type DatabaseActionConfirmation } from '@/components/database-action-confirm-modal';
import { useAppContextMenu } from '@/components/app-context-menu';
import { executeDatabaseQuery, fetchDatabaseObjects, fetchServerTables } from '@/lib/databaseApi';
import { openQueryTab } from '@/lib/queryWorkspaceEvents';
import { OPEN_IMPORT_EXPORT_EVENT, OPEN_SETTINGS_MODAL_EVENT } from '@/lib/databaseToolEvents';
import { databaseEngineDefinition, databaseEngineFamily, databaseEngineLabel, quoteDatabaseIdentifier, qualifiedDatabaseTable } from '@/lib/databaseEngines';

const objectExplorerKey = (serverId: string, databaseName: string) => `${serverId}:${databaseName}`;

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

function sqlText(value: string) { return `'${value.replaceAll("'", "''")}'`; }

function objectQualifiedName(engine: DatabaseEngine, databaseName: string, object: DatabaseSchemaObject) {
  const schema = object.schema || databaseName;
  return `${quoteDatabaseIdentifier(schema, engine)}.${quoteDatabaseIdentifier(object.name, engine)}`;
}

function objectDefinitionSql(engine: DatabaseEngine, databaseName: string, object: DatabaseSchemaObject) {
  const family = databaseEngineFamily(engine);
  const qualified = objectQualifiedName(engine, databaseName, object);
  if (family === 'mysql') {
    const keyword = object.kind === 'procedure' ? 'PROCEDURE' : object.kind === 'function' ? 'FUNCTION' : object.kind === 'trigger' ? 'TRIGGER' : object.kind === 'event' ? 'EVENT' : object.kind === 'view' ? 'VIEW' : 'TABLE';
    return `SHOW CREATE ${keyword} ${qualified};`;
  }
  if (family === 'mssql') return `SELECT OBJECT_DEFINITION(OBJECT_ID(N'${(object.schema || 'dbo').replaceAll("'", "''")}.${object.name.replaceAll("'", "''")}')) AS definition;`;
  if (object.kind === 'view') return `SELECT pg_get_viewdef('${(object.schema || 'public').replaceAll("'", "''")}.${object.name.replaceAll("'", "''")}'::regclass, true) AS definition;`;
  if (object.kind === 'trigger' && object.tableName) return `SELECT pg_get_triggerdef(t.oid, true) AS definition\nFROM pg_trigger t\nJOIN pg_class c ON c.oid=t.tgrelid\nJOIN pg_namespace n ON n.oid=c.relnamespace\nWHERE n.nspname=${sqlText(object.schema || 'public')} AND c.relname=${sqlText(object.tableName)} AND t.tgname=${sqlText(object.name)};`;
  if (object.kind === 'procedure' || object.kind === 'function') return `SELECT pg_get_functiondef(p.oid) AS definition\nFROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace\nWHERE n.nspname=${sqlText(object.schema || 'public')} AND p.proname=${sqlText(object.name)};`;
  return `-- PostgreSQL tablo DDL'si yapı ekranındaki kolon/index/FK metadata'sından incelenebilir.\nSELECT * FROM information_schema.columns\nWHERE table_schema=${sqlText(object.schema || 'public')} AND table_name=${sqlText(object.name)}\nORDER BY ordinal_position;`;
}

function objectDependencySql(engine: DatabaseEngine, databaseName: string, object: DatabaseSchemaObject) {
  const family = databaseEngineFamily(engine);
  const name = object.name.replaceAll("'", "''");
  if (family === 'mysql') return `SELECT 'foreign_key' AS dependencyType, TABLE_NAME AS sourceObject, CONSTRAINT_NAME AS detail\nFROM information_schema.KEY_COLUMN_USAGE\nWHERE TABLE_SCHEMA='${databaseName.replaceAll("'", "''")}' AND REFERENCED_TABLE_NAME='${name}'\nUNION ALL\nSELECT 'trigger', TRIGGER_NAME, EVENT_OBJECT_TABLE\nFROM information_schema.TRIGGERS\nWHERE TRIGGER_SCHEMA='${databaseName.replaceAll("'", "''")}' AND ACTION_STATEMENT LIKE '%${name}%'\nUNION ALL\nSELECT 'routine', ROUTINE_NAME, ROUTINE_TYPE\nFROM information_schema.ROUTINES\nWHERE ROUTINE_SCHEMA='${databaseName.replaceAll("'", "''")}' AND ROUTINE_DEFINITION LIKE '%${name}%';`;
  if (family === 'mssql') return `SELECT OBJECT_SCHEMA_NAME(referencing_id) AS sourceSchema, OBJECT_NAME(referencing_id) AS sourceObject, referenced_entity_name AS targetObject\nFROM sys.sql_expression_dependencies\nWHERE referenced_entity_name=N'${name}' OR referencing_id=OBJECT_ID(N'${(object.schema || 'dbo').replaceAll("'", "''")}.${name}');`;
  return `SELECT pg_describe_object(classid,objid,objsubid) AS dependentObject, pg_describe_object(refclassid,refobjid,refobjsubid) AS referencedObject, deptype\nFROM pg_depend\nWHERE pg_describe_object(refclassid,refobjid,refobjsubid) ILIKE '%${name}%';`;
}

function objectRenameTemplate(engine: DatabaseEngine, databaseName: string, object: DatabaseSchemaObject) {
  const family = databaseEngineFamily(engine);
  const qualified = objectQualifiedName(engine, databaseName, object);
  const next = quoteDatabaseIdentifier(`${object.name}_renamed`, engine);
  if (family === 'mysql' && (object.kind === 'table' || object.kind === 'view')) return `RENAME TABLE ${qualified} TO ${quoteDatabaseIdentifier(databaseName, engine)}.${next};`;
  if (family === 'mssql') return `EXEC sp_rename N'${(object.schema || 'dbo').replaceAll("'", "''")}.${object.name.replaceAll("'", "''")}', N'${object.name.replaceAll("'", "''")}_renamed';`;
  if (family === 'postgresql' && (object.kind === 'table' || object.kind === 'view')) return `ALTER ${object.kind === 'view' ? 'VIEW' : 'TABLE'} ${qualified} RENAME TO ${next};`;
  return `-- Bu nesne türü için güvenli rename sözdizimi motor/sürüme göre değişir.\n-- Yeni ad: ${object.name}_renamed`;
}

function objectDropSql(engine: DatabaseEngine, databaseName: string, object: DatabaseSchemaObject) {
  const keyword = object.kind === 'procedure' ? 'PROCEDURE' : object.kind === 'function' ? 'FUNCTION' : object.kind === 'trigger' ? 'TRIGGER' : object.kind === 'event' ? 'EVENT' : object.kind === 'view' ? 'VIEW' : 'TABLE';
  return `DROP ${keyword} ${objectQualifiedName(engine, databaseName, object)};`;
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
  const [expandedObjectGroups, setExpandedObjectGroups] = useState<Set<string>>(new Set());
  const [databaseObjects, setDatabaseObjects] = useState<Record<string, DatabaseSchemaObject[]>>({});
  const [objectLoading, setObjectLoading] = useState<Set<string>>(new Set());
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
  const loadObjects = async (server: DatabaseServerConfig, databaseName: string, force = false) => {
    if (!workspaceKey) return;
    const key = objectExplorerKey(server.id, databaseName);
    if (!force && (databaseObjects[key] || objectLoading.has(key))) return;
    setObjectLoading(previous => new Set(previous).add(key));
    try {
      const result = await fetchDatabaseObjects(server.id, databaseName, workspaceKey, force);
      setDatabaseObjects(previous => ({ ...previous, [key]: result.objects }));
    } catch {
      setDatabaseObjects(previous => ({ ...previous, [key]: previous[key] || [] }));
    } finally {
      setObjectLoading(previous => { const next = new Set(previous); next.delete(key); return next; });
    }
  };

  useEffect(() => {
    if (normalizedSearch.length < 2 || !workspaceKey) return;
    let cancelled = false;
    const targets = servers.flatMap(server => (server.databases || []).map(database => ({ server, database: database.name })));
    let cursor = 0;
    const worker = async () => {
      while (!cancelled) {
        const target = targets[cursor++];
        if (!target) return;
        const key = objectExplorerKey(target.server.id, target.database);
        try {
          const result = await fetchDatabaseObjects(target.server.id, target.database, workspaceKey);
          if (!cancelled) setDatabaseObjects(previous => ({ ...previous, [key]: result.objects }));
        } catch { /* search keeps catalog objects available even if advanced metadata is denied */ }
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => { cancelled = true; };
  }, [normalizedSearch, workspaceKey, servers]);

  const filteredServers = useMemo(
    () => servers.map(server => ({
      ...server,
      databases: (server.databases || []).map(database => {
        const key = objectExplorerKey(server.id, database.name);
        const objects = databaseObjects[key] || [];
        const objectMatches = objects.filter(object => !normalizedSearch || `${server.name} ${database.name} ${object.kind} ${object.schema || ''} ${object.name} ${object.tableName || ''}`.toLocaleLowerCase('tr-TR').includes(normalizedSearch));
        const tableMatches = database.tables.filter(table => !normalizedSearch || `${server.name} ${database.name} table ${table}`.toLocaleLowerCase('tr-TR').includes(normalizedSearch));
        return { ...database, tables: tableMatches, objectMatches };
      }).filter(database => !normalizedSearch || database.tables.length || database.objectMatches.length || `${server.name} ${database.name}`.toLocaleLowerCase('tr-TR').includes(normalizedSearch))
    })).filter(server => !normalizedSearch || server.databases?.length || `${server.name} ${server.host} ${databaseEngineLabel(server.databaseType)}`.toLocaleLowerCase('tr-TR').includes(normalizedSearch)),
    [servers, normalizedSearch, databaseObjects]
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
    setExpandedObjectGroups(new Set(targets.flatMap(item => (item.databases || []).flatMap(database => objectGroupDefinitions.map(group => `${item.id}:${database.name}:${group.kind}`)))));
    for (const target of targets) for (const database of target.databases || []) void loadObjects(target, database.name);
  };
  const collapseAll = () => {
    setExpandedServers(new Set());
    setExpandedDatabases(new Set());
    setExpandedObjectGroups(new Set());
  };
  const refreshServer = async (server: DatabaseServerConfig) => {
    if (!workspaceKey) return;
    await fetchServerTables(server.id, workspaceKey);
    setDatabaseObjects(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${server.id}:`))));
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

  const objectMenu = (event: React.MouseEvent, server: DatabaseServerConfig, database: string, object: DatabaseSchemaObject) => {
    if (object.kind === 'table') { tableMenu(event, server, database, object.name); return; }
    const engine = server.databaseType || 'mysql';
    const qualified = objectQualifiedName(engine, database, object);
    const canRename = databaseEngineFamily(engine) === 'mssql' || object.kind === 'view';
    openContextMenu(event, [
      {
        id: 'open',
        label: object.kind === 'view' ? 'Verileri aç' : 'Aç / çalıştır',
        icon: object.kind === 'view' ? View : object.kind === 'procedure' ? Zap : object.kind === 'function' ? FunctionSquare : Activity,
        onSelect: () => {
          setActiveServerId(server.id); onDatabaseSelect(database);
          if (object.kind === 'view') onTableSelect(object.name);
          else if (object.kind === 'procedure') openSql(server, database, `${object.name} çağır`, `CALL ${qualified}();`);
          else if (object.kind === 'function') openSql(server, database, `${object.name} çalıştır`, `SELECT ${qualified}();`);
          else openSql(server, database, `${object.name} tanımı`, objectDefinitionSql(engine, database, object), true);
        }
      },
      { id: 'new-query', label: 'Yeni sorgu', icon: Code2, shortcut: 'newQuery', onSelect: () => openSql(server, database, `${object.name} sorgu`, '') },
      { id: 'definition', label: 'DDL / tanımı göster', icon: FileCode2, onSelect: () => openSql(server, database, `${object.name} DDL`, objectDefinitionSql(engine, database, object), true) },
      { id: 'dependencies', label: 'Bağımlılıkları sorgula', icon: Network, onSelect: () => openSql(server, database, `${object.name} bağımlılıklar`, objectDependencySql(engine, database, object), true) },
      { id: 'sep-edit', separator: true },
      { id: 'rename', label: 'Rename taslağı', icon: Wrench, disabled: Boolean(server.readOnly) || !canRename, disabledReason: server.readOnly ? 'Bağlantı salt-okunur.' : 'Bu nesne türünde güvenli rename motor/sürüme göre değişiyor.', onSelect: () => openSql(server, database, `${object.name} rename`, objectRenameTemplate(engine, database, object)) },
      { id: 'copy', label: 'Kopyala', icon: Copy, children: [
        { id: 'copy-name', label: 'Nesne adı', icon: Copy, onSelect: () => navigator.clipboard.writeText(object.name) },
        { id: 'copy-qualified', label: 'Tam nesne adı', icon: Copy, onSelect: () => navigator.clipboard.writeText(qualified) },
        ...(object.tableName ? [{ id: 'copy-parent', label: 'Bağlı tablo adı', icon: Copy, onSelect: () => navigator.clipboard.writeText(object.tableName || '') }] : [])
      ] },
      { id: 'sep-danger', separator: true },
      {
        id: 'drop',
        label: `${object.kind} nesnesini sil`,
        icon: Trash2,
        danger: true,
        disabled: Boolean(server.readOnly),
        disabledReason: server.readOnly ? 'Bağlantı salt-okunur.' : undefined,
        onSelect: () => runDangerous(server, database, object.name, objectDropSql(engine, database, object), `${object.name} nesnesini sil`, `${object.kind} nesnesi sunucudan kalıcı olarak kaldırılacak.`, 'Nesneyi sil')
      }
    ], `${object.kind.toUpperCase()} • ${object.schema ? `${object.schema}.` : ''}${object.name}`);
  };

  const objectGroupDefinitions = [
    { kind: 'table' as const, label: 'Tables', icon: Table2 },
    { kind: 'view' as const, label: 'Views', icon: View },
    { kind: 'procedure' as const, label: 'Procedures', icon: Zap },
    { kind: 'function' as const, label: 'Functions', icon: FunctionSquare },
    { kind: 'trigger' as const, label: 'Triggers', icon: Activity },
    { kind: 'event' as const, label: 'Events', icon: Sparkles }
  ];

  const objectGroupMenu = (event: React.MouseEvent, server: DatabaseServerConfig, database: string, kind: DatabaseSchemaObject['kind']) => {
    const definition = objectGroupDefinitions.find(item => item.kind === kind);
    const label = definition?.label || kind;
    openContextMenu(event, [
      { id: 'new', label: `Yeni ${label.slice(0, -1) || label}`, icon: Plus, disabled: Boolean(server.readOnly), disabledReason: server.readOnly ? 'Bağlantı salt-okunur.' : undefined, onSelect: () => openSql(server, database, `Yeni ${kind}`, objectTemplate(server.databaseType || 'mysql', database, kind)) },
      { id: 'query', label: 'Yeni SQL sorgusu', icon: Code2, shortcut: 'newQuery', onSelect: () => openSql(server, database, `${database} sorgu`, '') },
      { id: 'sep', separator: true },
      { id: 'refresh', label: 'Nesne listesini yenile', icon: RefreshCw, shortcut: 'refresh', onSelect: () => void loadObjects(server, database, true) },
      { id: 'copy-db', label: 'Veritabanı adını kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(database) }
    ], `${database} • ${label}`);
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
          <Input value={search} onChange={event => setSearch(event.target.value)} className="h-8 rounded-xl border-zinc-800 bg-black/30 pl-8 pr-8 text-[10px]" placeholder="Sunucu, DB, tablo, view, routine, trigger ara…" />
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
                            <button type="button" className="flex h-6 w-6 items-center justify-center" onClick={() => { const opening = !expandedDatabases.has(databaseKey); toggle(setExpandedDatabases, databaseKey); if (opening) void loadObjects(server, database.name); }}>
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
                          {databaseOpen && (() => {
                            const key = objectExplorerKey(server.id, database.name);
                            const loaded = databaseObjects[key];
                            const fallbackObjects: DatabaseSchemaObject[] = database.tables.map(table => {
                              const detail = database.tableDetails.find(item => item.tableName === table);
                              return { name: table, kind: detail?.tableType?.toUpperCase().includes('VIEW') ? 'view' : 'table' };
                            });
                            const visibleObjects = normalizedSearch
                              ? [...database.objectMatches, ...fallbackObjects.filter(fallback => !database.objectMatches.some(object => object.kind === fallback.kind && object.name === fallback.name))]
                              : loaded || fallbackObjects;
                            return (
                              <div className="ml-5 border-l border-zinc-900 pl-1">
                                {objectLoading.has(key) && !loaded && <div className="flex h-7 items-center gap-2 px-2 text-[8px] text-zinc-700"><Activity className="h-3 w-3 animate-spin" />Nesneler yükleniyor…</div>}
                                {objectGroupDefinitions.map(group => {
                                  const GroupIcon = group.icon;
                                  const items = visibleObjects.filter(object => object.kind === group.kind);
                                  const groupKey = `${key}:${group.kind}`;
                                  const groupOpen = expandedObjectGroups.has(groupKey) || Boolean(search);
                                  return (
                                    <div key={group.kind}>
                                      <div className="group flex h-7 items-center gap-1 rounded hover:bg-white/[0.02]" onContextMenu={event => objectGroupMenu(event, server, database.name, group.kind)}>
                                        <button type="button" className="flex h-6 w-6 items-center justify-center" onClick={() => toggle(setExpandedObjectGroups, groupKey)}>
                                          {groupOpen ? <ChevronDown className="h-3 w-3 text-zinc-500" /> : <ChevronRight className="h-3 w-3 text-zinc-700" />}
                                        </button>
                                        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => toggle(setExpandedObjectGroups, groupKey)}>
                                          <GroupIcon className="h-3 w-3 shrink-0 text-zinc-600" />
                                          <span className="min-w-0 flex-1 truncate text-[9px] font-medium text-zinc-500">{group.label}</span>
                                          <span className="pr-2 text-[7px] tabular-nums text-zinc-700">{items.length}</span>
                                        </button>
                                      </div>
                                      {groupOpen && (
                                        <div className="ml-5 border-l border-zinc-900/80 pl-1">
                                          {items.length ? items.map(object => (
                                            <button
                                              key={`${object.kind}:${object.schema || ''}:${object.name}`}
                                              type="button"
                                              className={`group flex h-7 w-full min-w-0 items-center gap-2 rounded px-2 text-left ${active && selectedDatabase === database.name && selectedTable === object.name && (object.kind === 'table' || object.kind === 'view') ? 'bg-cyan-500/10 text-cyan-200' : 'text-zinc-500 hover:bg-white/[0.025] hover:text-zinc-300'}`}
                                              onClick={() => {
                                                setActiveServerId(server.id); onDatabaseSelect(database.name);
                                                if (object.kind === 'table' || object.kind === 'view') onTableSelect(object.name);
                                                else if (object.kind === 'procedure') openSql(server, database.name, `${object.name} çağır`, `CALL ${objectQualifiedName(server.databaseType || 'mysql', database.name, object)}();`);
                                                else if (object.kind === 'function') openSql(server, database.name, `${object.name} çalıştır`, `SELECT ${objectQualifiedName(server.databaseType || 'mysql', database.name, object)}();`);
                                                else openSql(server, database.name, `${object.name} tanımı`, objectDefinitionSql(server.databaseType || 'mysql', database.name, object), true);
                                              }}
                                              onContextMenu={event => objectMenu(event, server, database.name, object)}
                                            >
                                              <GroupIcon className="h-3 w-3 shrink-0" />
                                              <span className="min-w-0 flex-1 truncate text-[9px]">{object.schema && object.schema !== database.name ? `${object.schema}.` : ''}{object.name}</span>
                                              {object.tableName && <span className="max-w-20 truncate text-[7px] text-zinc-700">{object.tableName}</span>}
                                            </button>
                                          )) : <div className="px-2 py-1.5 text-[8px] text-zinc-800">Nesne yok</div>}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
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
