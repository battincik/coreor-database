'use client';

import { useModalEscape } from '@/lib/useModalEscape';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Braces, Check, ChevronDown, ChevronRight, Circle, Code2, Copy, Database, Download, FileCode2, FunctionSquare, Gauge, HardDrive, KeyRound, ListFilter, LogOut, MoreHorizontal, Network, Plus, RefreshCw, Search, Server, Settings2, ShieldCheck, Sparkles, Table2, Trash2, UserRound, View, Wifi, WifiOff, Wrench, X, Zap } from 'lucide-react';
import type { DatabaseEngine, DatabaseSchemaObject, DatabaseServerConfig, DatabaseTable, SidebarProps } from 'types';
import { DatabaseContext } from '@/context/DatabaseContext';
import { useDesktop } from '@/context/DesktopContext';
import { Button } from '@/components/ui/button';
import { CoreorConfirmModal, type CoreorConfirmation } from '@/components/ui/coreor-confirm-modal';
import { Input } from '@/components/ui/input';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ServerCreateModal } from '@/components/server-create-modal';
import { DatabaseActionConfirmModal, type DatabaseActionConfirmation } from '@/components/database-action-confirm-modal';
import { useAppContextMenu } from '@/components/app-context-menu';
import { executeDatabaseQuery, fetchDatabaseObjects, fetchServerTables } from '@/lib/databaseApi';
import { openQueryTab } from '@/lib/queryWorkspaceEvents';
import { OPEN_IMPORT_EXPORT_EVENT, OPEN_MAINTENANCE_CENTER_EVENT, OPEN_SETTINGS_MODAL_EVENT } from '@/lib/databaseToolEvents';
import { databaseEngineDefinition, databaseEngineFamily, databaseEngineLabel, quoteDatabaseIdentifier, qualifiedDatabaseTable } from '@/lib/databaseEngines';
import { useAppPreferences } from '@/lib/appPreferences';
import { recalculateDatabaseStorage, recalculateTableStorage } from '@/lib/databaseWorkbenchApi';
import { useCoreorToast } from '@/components/ui/coreor-toast';
import { publishCoreorNotification } from '@/lib/notificationStore';
import { useLanguage } from '@/context/LanguageContext';

const objectExplorerKey = (serverId: string, databaseName: string) => `${serverId}:${databaseName}`;
type Translator = (key: string, values?: Record<string, string | number>) => string;

type ObjectSearchType = 'all' | 'server' | 'database' | DatabaseSchemaObject['kind'];

const OBJECT_SEARCH_TYPES: Array<{ value: ObjectSearchType; labelKey: string; icon: typeof Database; color: string }> = [
  { value: 'all', labelKey: 'common.all', icon: Search, color: 'text-cyan-300' },
  { value: 'server', labelKey: 'statusGuide.server', icon: Server, color: 'text-emerald-400' },
  { value: 'database', labelKey: 'database.database', icon: Database, color: 'text-sky-400' },
  { value: 'table', labelKey: 'database.table', icon: Table2, color: 'text-cyan-400' },
  { value: 'view', labelKey: 'database.view', icon: View, color: 'text-violet-400' },
  { value: 'procedure', labelKey: 'database.procedure', icon: Zap, color: 'text-amber-400' },
  { value: 'function', labelKey: 'database.function', icon: FunctionSquare, color: 'text-fuchsia-400' },
  { value: 'trigger', labelKey: 'database.trigger', icon: Activity, color: 'text-orange-400' },
  { value: 'event', labelKey: 'database.event', icon: Sparkles, color: 'text-emerald-400' }
];

function objectKindColor(kind: DatabaseSchemaObject['kind']) {
  return OBJECT_SEARCH_TYPES.find(item => item.value === kind)?.color || 'text-zinc-500';
}

function compactCountBase(value: number, locale: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat(locale, { notation: numeric >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(numeric);
}

function compactBytesBase(bytes: number | null | undefined, locale: string) {
  if (bytes === null || bytes === undefined) return null;
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value === 0) return '0 B';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toLocaleString(locale, { maximumFractionDigits: 1 })} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(value / 1024)).toLocaleString(locale)} KB`;
}

function compactSizeBase(megabytes: string | number | null | undefined, locale: string) {
  if (megabytes === null || megabytes === undefined) return null;
  const mb = Number(megabytes);
  return Number.isFinite(mb) && mb >= 0 ? compactBytesBase(mb * 1024 * 1024, locale) : null;
}

function objectMetadataTextBase(object: DatabaseSchemaObject, detail: DatabaseTable | undefined, locale: string, rowsLabel: string) {
  if (object.kind === 'table') {
    const measured = Boolean(detail?.storageMeasuredAt);
    const rows = measured ? detail?.rows : object.rows ?? detail?.rows;
    const size = measured ? compactSizeBase(detail?.sizeMB, locale) : compactBytesBase(object.sizeBytes, locale) || compactSizeBase(detail?.sizeMB, locale);
    if (rows === undefined && !size) return null;
    return [rows === undefined ? null : `${compactCountBase(rows, locale)} ${rowsLabel}`, size].filter(Boolean).join(' • ');
  }
  if (object.kind === 'view') {
    const rows = object.rows ?? detail?.rows;
    const size = compactBytesBase(object.sizeBytes, locale) || compactSizeBase(detail?.sizeMB, locale);
    return [rows ? `${compactCountBase(rows, locale)} ${rowsLabel}` : null, size].filter(Boolean).join(' • ') || 'View';
  }
  if (object.kind === 'trigger') return object.tableName ? `→ ${object.tableName}` : 'Trigger';
  if (object.kind === 'procedure') return object.comment?.trim() || 'Procedure';
  if (object.kind === 'function') return object.comment?.trim() || 'Function';
  if (object.kind === 'event') return object.comment?.trim() || (object.updatedAt ? 'Event' : 'Event');
  return null;
}

interface CreateDatabaseState {
  server: DatabaseServerConfig;
  name: string;
  charset: string;
  collation: string;
  owner: string;
  busy: boolean;
  error: string | null;
}

interface RenameDatabaseState {
  server: DatabaseServerConfig;
  currentName: string;
  nextName: string;
  charset: string;
  collation: string;
  busy: boolean;
  error: string | null;
}

function databaseRenameSql(engine: DatabaseEngine, currentName: string, nextName: string) {
  const family = databaseEngineFamily(engine);
  if (family === 'postgresql') return `ALTER DATABASE ${quoteDatabaseIdentifier(currentName, engine)} RENAME TO ${quoteDatabaseIdentifier(nextName, engine)};`;
  if (family === 'mssql') return `ALTER DATABASE ${quoteDatabaseIdentifier(currentName, engine)} MODIFY NAME = ${quoteDatabaseIdentifier(nextName, engine)};`;
  return null;
}

interface DatabaseCharsetOption extends SearchSelectOption<string> {
  defaultCollation?: string;
}

interface DatabaseCollationOption extends SearchSelectOption<string> {
  charset?: string;
  isDefault?: boolean;
}

function databaseOptionText(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  return '';
}

function useDatabaseEncodingOptions(server: DatabaseServerConfig | null, accountId: string | null | undefined, enabled: boolean) {
  const { t } = useLanguage();
  const [charsets, setCharsets] = useState<DatabaseCharsetOption[]>([]);
  const [collations, setCollations] = useState<DatabaseCollationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !server || !accountId) return;
    let cancelled = false;
    const family = databaseEngineFamily(server.databaseType || 'mysql');
    setLoading(true);
    setError(null);
    void (async () => {
      if (family === 'mysql') {
        const [charsetResult, collationResult] = await Promise.all([
          executeDatabaseQuery(server.id, 'SHOW CHARACTER SET;', accountId, null),
          executeDatabaseQuery(server.id, 'SHOW COLLATION;', accountId, null)
        ]);
        if (cancelled) return;
        setCharsets(charsetResult.rows.map(row => {
          const value = databaseOptionText(row, 'Charset', 'CHARACTER_SET_NAME', 'charset');
          const description = databaseOptionText(row, 'Description', 'DESCRIPTION');
          const defaultCollation = databaseOptionText(row, 'Default collation', 'DEFAULT_COLLATE_NAME', 'Default_collation');
          const maxLength = databaseOptionText(row, 'Maxlen', 'MAXLEN');
          return { value, label: value, description, badge: maxLength ? `${maxLength} byte` : undefined, defaultCollation, keywords: [description, defaultCollation] };
        }).filter(option => option.value));
        setCollations(collationResult.rows.map(row => {
          const value = databaseOptionText(row, 'Collation', 'COLLATION_NAME', 'collation');
          const charset = databaseOptionText(row, 'Charset', 'CHARACTER_SET_NAME', 'charset');
          const defaultFlag = databaseOptionText(row, 'Default', 'IS_DEFAULT');
          return { value, label: value, charset, isDefault: /^(yes|1)$/i.test(defaultFlag), description: charset, badge: /^(yes|1)$/i.test(defaultFlag) ? t('common.default') : undefined, keywords: [charset] };
        }).filter(option => option.value));
        return;
      }
      if (family === 'mssql') {
        const result = await executeDatabaseQuery(server.id, 'SELECT name AS Collation, description AS Description FROM sys.fn_helpcollations() ORDER BY name;', accountId, null);
        if (cancelled) return;
        setCharsets([]);
        setCollations(result.rows.map(row => {
          const value = databaseOptionText(row, 'Collation', 'name');
          return { value, label: value, description: databaseOptionText(row, 'Description', 'description') };
        }).filter(option => option.value));
        return;
      }
      if (server.databaseType === 'cockroachdb') {
        if (!cancelled) { setCharsets([{ value: 'UTF8', label: 'UTF8' }]); setCollations([]); }
        return;
      }
      const result = await executeDatabaseQuery(server.id, `SELECT DISTINCT pg_encoding_to_char(i) AS "Charset" FROM generate_series(0, 100) AS g(i) WHERE pg_encoding_to_char(i) <> '' ORDER BY 1;`, accountId, null);
      if (cancelled) return;
      setCharsets(result.rows.map(row => { const value = databaseOptionText(row, 'Charset', 'charset'); return { value, label: value }; }).filter(option => option.value));
      setCollations([]);
    })().catch(failure => {
      if (!cancelled) setError(failure instanceof Error ? failure.message : t('sidebar.databaseOptionsFailed'));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [server?.id, server?.databaseType, accountId, enabled, t]);

  return { charsets, collations, loading, error };
}

function initials(name?: string | null, email?: string | null) {
  return (name?.trim() || email?.trim() || 'C')
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
}

function objectTemplate(engine: DatabaseEngine, databaseName: string, type: string, t: Translator, tableName = 'new_object') {
  const family = databaseEngineFamily(engine);
  const object = quoteDatabaseIdentifier(tableName, engine);
  const table = qualifiedDatabaseTable(databaseName, tableName, engine);
  if (type === 'table') return `CREATE TABLE ${table} (\n  id ${family === 'mysql' ? 'BIGINT UNSIGNED AUTO_INCREMENT' : family === 'mssql' ? 'BIGINT IDENTITY(1,1)' : 'BIGSERIAL'} PRIMARY KEY,\n  created_at ${family === 'mssql' ? 'DATETIME2' : 'TIMESTAMP'} NOT NULL DEFAULT ${family === 'mssql' ? 'SYSUTCDATETIME()' : 'CURRENT_TIMESTAMP'}\n);`;
  if (type === 'view') return `CREATE VIEW ${object} AS\nSELECT *\nFROM ${qualifiedDatabaseTable(databaseName, 'source_table', engine)};`;
  if (type === 'procedure') return family === 'mysql' ? `DELIMITER //\nCREATE PROCEDURE ${object}()\nBEGIN\n  SELECT CURRENT_TIMESTAMP;\nEND //\nDELIMITER ;` : family === 'mssql' ? `CREATE PROCEDURE ${object}\nAS\nBEGIN\n  SET NOCOUNT ON;\n  SELECT SYSUTCDATETIME() AS current_time;\nEND;` : `CREATE PROCEDURE ${object}()\nLANGUAGE SQL\nAS $$\n  SELECT CURRENT_TIMESTAMP;\n$$;`;
  if (type === 'function') return family === 'mssql' ? `CREATE FUNCTION ${object}()\nRETURNS DATETIME2\nAS\nBEGIN\n  RETURN SYSUTCDATETIME();\nEND;` : `CREATE FUNCTION ${object}()\nRETURNS TIMESTAMP\n${family === 'mysql' ? 'DETERMINISTIC\nRETURN CURRENT_TIMESTAMP' : 'LANGUAGE SQL\nAS $$ SELECT CURRENT_TIMESTAMP $$'};`;
  if (type === 'trigger') return `CREATE TRIGGER ${object}\n${family === 'mssql' ? 'ON' : 'BEFORE INSERT ON'} ${qualifiedDatabaseTable(databaseName, 'target_table', engine)}\n${family === 'mssql' ? 'AFTER INSERT\nAS\nBEGIN\n  SET NOCOUNT ON;\nEND;' : 'FOR EACH ROW\nBEGIN\n  -- trigger body\nEND;'}`;
  if (type === 'event') return family === 'mysql' ? `CREATE EVENT ${object}\nON SCHEDULE EVERY 1 DAY\nDO\n  SELECT CURRENT_TIMESTAMP;` : `-- ${t('sidebar.sqlTemplates.scheduledTaskHelp',{engine:databaseEngineLabel(engine)})}`;
  return `CREATE INDEX ${object}\nON ${qualifiedDatabaseTable(databaseName, 'target_table', engine)} (${quoteDatabaseIdentifier('column_name', engine)});`;
}

function sqlText(value: string) { return `'${value.replaceAll("'", "''")}'`; }

function objectQualifiedName(engine: DatabaseEngine, databaseName: string, object: DatabaseSchemaObject) {
  const schema = object.schema || databaseName;
  return `${quoteDatabaseIdentifier(schema, engine)}.${quoteDatabaseIdentifier(object.name, engine)}`;
}

function objectDefinitionSql(engine: DatabaseEngine, databaseName: string, object: DatabaseSchemaObject, t: Translator) {
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
  return `-- ${t('sidebar.sqlTemplates.postgresTableDdlHelp')}\nSELECT * FROM information_schema.columns\nWHERE table_schema=${sqlText(object.schema || 'public')} AND table_name=${sqlText(object.name)}\nORDER BY ordinal_position;`;
}

function objectDependencySql(engine: DatabaseEngine, databaseName: string, object: DatabaseSchemaObject) {
  const family = databaseEngineFamily(engine);
  const name = object.name.replaceAll("'", "''");
  if (family === 'mysql') return `SELECT 'foreign_key' AS dependencyType, TABLE_NAME AS sourceObject, CONSTRAINT_NAME AS detail\nFROM information_schema.KEY_COLUMN_USAGE\nWHERE TABLE_SCHEMA='${databaseName.replaceAll("'", "''")}' AND REFERENCED_TABLE_NAME='${name}'\nUNION ALL\nSELECT 'trigger', TRIGGER_NAME, EVENT_OBJECT_TABLE\nFROM information_schema.TRIGGERS\nWHERE TRIGGER_SCHEMA='${databaseName.replaceAll("'", "''")}' AND ACTION_STATEMENT LIKE '%${name}%'\nUNION ALL\nSELECT 'routine', ROUTINE_NAME, ROUTINE_TYPE\nFROM information_schema.ROUTINES\nWHERE ROUTINE_SCHEMA='${databaseName.replaceAll("'", "''")}' AND ROUTINE_DEFINITION LIKE '%${name}%';`;
  if (family === 'mssql') return `SELECT OBJECT_SCHEMA_NAME(referencing_id) AS sourceSchema, OBJECT_NAME(referencing_id) AS sourceObject, referenced_entity_name AS targetObject\nFROM sys.sql_expression_dependencies\nWHERE referenced_entity_name=N'${name}' OR referencing_id=OBJECT_ID(N'${(object.schema || 'dbo').replaceAll("'", "''")}.${name}');`;
  return `SELECT pg_describe_object(classid,objid,objsubid) AS dependentObject, pg_describe_object(refclassid,refobjid,refobjsubid) AS referencedObject, deptype\nFROM pg_depend\nWHERE pg_describe_object(refclassid,refobjid,refobjsubid) ILIKE '%${name}%';`;
}

function objectRenameTemplate(engine: DatabaseEngine, databaseName: string, object: DatabaseSchemaObject, t: Translator) {
  const family = databaseEngineFamily(engine);
  const qualified = objectQualifiedName(engine, databaseName, object);
  const next = quoteDatabaseIdentifier(`${object.name}_renamed`, engine);
  if (family === 'mysql' && (object.kind === 'table' || object.kind === 'view')) return `RENAME TABLE ${qualified} TO ${quoteDatabaseIdentifier(databaseName, engine)}.${next};`;
  if (family === 'mssql') return `EXEC sp_rename N'${(object.schema || 'dbo').replaceAll("'", "''")}.${object.name.replaceAll("'", "''")}', N'${object.name.replaceAll("'", "''")}_renamed';`;
  if (family === 'postgresql' && (object.kind === 'table' || object.kind === 'view')) return `ALTER ${object.kind === 'view' ? 'VIEW' : 'TABLE'} ${qualified} RENAME TO ${next};`;
  return `-- ${t('sidebar.sqlTemplates.renameUnavailable')}\n-- ${t('sidebar.sqlTemplates.newName',{name:`${object.name}_renamed`})}`;
}

function objectDropSql(engine: DatabaseEngine, databaseName: string, object: DatabaseSchemaObject) {
  const keyword = object.kind === 'procedure' ? 'PROCEDURE' : object.kind === 'function' ? 'FUNCTION' : object.kind === 'trigger' ? 'TRIGGER' : object.kind === 'event' ? 'EVENT' : object.kind === 'view' ? 'VIEW' : 'TABLE';
  return `DROP ${keyword} ${objectQualifiedName(engine, databaseName, object)};`;
}

function CreateDatabaseModal({ state, accountId, onChange, onClose, onCreate }: { state: CreateDatabaseState | null; accountId?: string | null; onChange: (state: CreateDatabaseState) => void; onClose: () => void; onCreate: () => void | Promise<void> }) {
  const { t } = useLanguage();
  const encodingOptions = useDatabaseEncodingOptions(state?.server || null, accountId, Boolean(state));
  useModalEscape(Boolean(state), onClose, Boolean(state?.busy));
  if (!state || typeof document === 'undefined') return null;
  const family = databaseEngineFamily(state.server.databaseType);
  const { charsets, collations, loading: optionsLoading, error: optionsError } = encodingOptions;
  const supportsCharset = family === 'mysql' || (family === 'postgresql' && state.server.databaseType !== 'cockroachdb');
  const supportsOwner = family === 'postgresql' && state.server.databaseType !== 'cockroachdb';
  const supportsCollation = family === 'mysql' || family === 'mssql';
  const charsetOptions = charsets.some(option => option.value === state.charset) || !state.charset ? charsets : [{ value: state.charset, label: state.charset }, ...charsets];
  const filteredCollations = collations.filter(option => !option.charset || !state.charset || option.charset === state.charset);
  const collationOptions: SearchSelectOption<string>[] = [{ value: '', label: t('sidebar.serverDefault') }, ...filteredCollations];
  const validName = /^[A-Za-z0-9_$-]+$/.test(state.name);
  const safeOption = (value: string) => !value || /^[A-Za-z0-9_.-]+$/.test(value);
  const optionsValid = safeOption(state.charset) && safeOption(state.collation) && (!state.owner || state.owner.length <= 128);

  return createPortal(
    <div className="fixed inset-0 z-[610] flex items-center justify-center p-2 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={state.busy ? undefined : onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <header className="flex items-center gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10">
            <Database className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t('sidebar.createDatabaseTitle')}</h2>
            <p className="mt-0.5 truncate text-[9px] text-zinc-600">
              {state.server.name} • {databaseEngineLabel(state.server.databaseType)}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={state.busy} onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="space-y-4 p-5">
          <label className="block text-[10px] text-zinc-400">
            {t('server.databaseName')}
            <Input autoFocus value={state.name} onChange={event => onChange({ ...state, name: event.target.value, error: null })} className="mt-1.5 h-9 bg-black/25 font-mono" placeholder="coreor_app" />
            <span className="mt-1 block text-[8px] text-zinc-700">{t('sidebar.databaseNameRules')}</span>
          </label>

          {(supportsCharset || supportsCollation || supportsOwner) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {supportsCharset && <div className="text-[10px] text-zinc-400">
                <div className="mb-1.5">{t('sidebar.characterSet')}</div>
                <SearchSelect
                  value={state.charset}
                  options={charsetOptions}
                  onValueChange={value => {
                    const selected = charsets.find(option => option.value === value);
                    const nextCollation = family === 'mysql' ? selected?.defaultCollation || '' : state.collation;
                    onChange({ ...state, charset: value, collation: nextCollation, error: null });
                  }}
                  searchPlaceholder={t('sidebar.searchCharset')}
                  emptyText={optionsLoading ? t('common.loading') : t('common.noResults')}
                  triggerClassName="min-h-9 font-mono"
                  dropdownMinWidth={360}
                />
              </div>}
              {supportsCollation && <div className="text-[10px] text-zinc-400">
                <div className="mb-1.5">{t('database.collation')} <span className="text-zinc-700">({t('sidebar.optional')})</span></div>
                <SearchSelect
                  value={state.collation}
                  options={collationOptions}
                  onValueChange={value => onChange({ ...state, collation: value, error: null })}
                  searchPlaceholder={t('sidebar.searchCollation')}
                  emptyText={optionsLoading ? t('common.loading') : t('common.noResults')}
                  triggerClassName="min-h-9 font-mono"
                  dropdownMinWidth={420}
                  dropdownMaxWidth={620}
                />
              </div>}
              {supportsOwner && <label className="text-[10px] text-zinc-400 sm:col-span-2">
                {t('sidebar.owner')} <span className="text-zinc-700">({t('sidebar.optional')})</span>
                <Input value={state.owner} onChange={event => onChange({ ...state, owner: event.target.value, error: null })} className="mt-1.5 h-9 bg-black/25 font-mono text-[10px]" placeholder={t('sidebar.currentUser')} />
              </label>}
            </div>
          )}

          <div className="rounded-xl border border-zinc-800 bg-black/20 px-3 py-2 text-[9px] leading-4 text-zinc-600">
            {family === 'mysql' && t('sidebar.mysqlDatabaseHint')}
            {family === 'postgresql' && state.server.databaseType !== 'cockroachdb' && t('sidebar.postgresDatabaseHint')}
            {state.server.databaseType === 'cockroachdb' && t('sidebar.cockroachDatabaseHint')}
            {family === 'mssql' && t('sidebar.mssqlDatabaseHint')}
          </div>

          {(state.error || optionsError) && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">{state.error || optionsError}</div>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <Button variant="ghost" size="sm" disabled={state.busy} onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="sm" disabled={!validName || !optionsValid || state.busy} onClick={() => void onCreate()}>
            {state.busy && <Activity className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{t('common.create')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

function RenameDatabaseModal({ state, accountId, onChange, onClose, onRename }: { state: RenameDatabaseState | null; accountId?: string | null; onChange: (state: RenameDatabaseState) => void; onClose: () => void; onRename: () => void | Promise<void> }) {
  const { t } = useLanguage();
  const encodingOptions = useDatabaseEncodingOptions(state?.server || null, accountId, Boolean(state));
  useModalEscape(Boolean(state), onClose, Boolean(state?.busy));
  if (!state || typeof document === 'undefined') return null;
  const family = databaseEngineFamily(state.server.databaseType || 'mysql');
  const database = (state.server.databases || []).find(item => item.name === state.currentName);
  const { charsets, collations, loading: optionsLoading, error: optionsError } = encodingOptions;
  const supportsCharset = family === 'mysql';
  const supportsCollation = family === 'mysql' || family === 'mssql';
  const charsetOptions = charsets.some(option => option.value === state.charset) || !state.charset ? charsets : [{ value: state.charset, label: state.charset }, ...charsets];
  const filteredCollations = collations.filter(option => !option.charset || !state.charset || option.charset === state.charset);
  const collationOptions: SearchSelectOption<string>[] = [{ value: '', label: t('sidebar.serverDefault') }, ...filteredCollations];
  const validName = /^[A-Za-z0-9_$-]+$/.test(state.nextName);
  const nameUnchanged = state.nextName.trim() === state.currentName;
  const settingsChanged = (supportsCharset && state.charset !== (database?.defaultCharset || '')) || (supportsCollation && state.collation !== (database?.defaultCollation || ''));
  const unchanged = nameUnchanged && !settingsChanged;

  return createPortal(
    <div className="fixed inset-0 z-[610] flex items-center justify-center p-2 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={state.busy ? undefined : onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <header className="flex items-center gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10"><Database className="h-4 w-4 text-cyan-300" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t('sidebar.editDatabaseTitle')}</h2>
            <p className="mt-0.5 truncate text-[9px] text-zinc-600">{state.server.name} • {state.currentName}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={state.busy} onClick={onClose}><X className="h-4 w-4" /></Button>
        </header>
        <div className="space-y-4 p-5">
          <label className="block text-[10px] text-zinc-400">
            {t('sidebar.newDatabaseName')}
            <Input autoFocus value={state.nextName} onChange={event => onChange({ ...state, nextName: event.target.value, error: null })} className="mt-1.5 h-9 bg-black/25 font-mono" />
            <span className="mt-1 block text-[8px] text-zinc-700">{t('sidebar.databaseNameRules')}</span>
          </label>
          {(supportsCharset || supportsCollation) && <div className="grid gap-3 sm:grid-cols-2">
            {supportsCharset && <div className="text-[10px] text-zinc-400">
              <div className="mb-1.5">{t('sidebar.characterSet')}</div>
              <SearchSelect
                value={state.charset}
                options={charsetOptions}
                onValueChange={value => {
                  const selected = charsets.find(option => option.value === value);
                  onChange({ ...state, charset: value, collation: selected?.defaultCollation || '', error: null });
                }}
                searchPlaceholder={t('sidebar.searchCharset')}
                emptyText={optionsLoading ? t('common.loading') : t('common.noResults')}
                triggerClassName="min-h-9 font-mono"
                dropdownMinWidth={360}
              />
            </div>}
            {supportsCollation && <div className="text-[10px] text-zinc-400">
              <div className="mb-1.5">{t('database.collation')}</div>
              <SearchSelect
                value={state.collation}
                options={collationOptions}
                onValueChange={value => onChange({ ...state, collation: value, error: null })}
                searchPlaceholder={t('sidebar.searchCollation')}
                emptyText={optionsLoading ? t('common.loading') : t('common.noResults')}
                triggerClassName="min-h-9 font-mono"
                dropdownMinWidth={420}
                dropdownMaxWidth={620}
              />
            </div>}
          </div>}
          <div className={`rounded-xl border px-3 py-2 text-[9px] leading-4 ${family === 'mysql' ? 'border-amber-500/20 bg-amber-500/[0.06] text-amber-200' : 'border-zinc-800 bg-black/20 text-zinc-500'}`}>
            {family === 'mysql' ? t('sidebar.mysqlRenameMigrationWarning') : t('sidebar.renameDatabaseDescription')}
          </div>
          {(state.error || optionsError) && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">{state.error || optionsError}</div>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <Button variant="ghost" size="sm" disabled={state.busy} onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="sm" disabled={!validName || unchanged || state.busy} onClick={() => void onRename()}>
            {state.busy && <Activity className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{t('common.save')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

export default function Sidebar({ onDatabaseSelect, onTableSelect, selectedDatabase, selectedTable }: SidebarProps) {
  const { workspaceKey, user } = useDesktop();
  const { t, language, formatNumber } = useLanguage();
  const compactCount = useCallback((value: number) => compactCountBase(value, language), [language]);
  const compactBytes = useCallback((value: number | null | undefined) => compactBytesBase(value, language), [language]);
  const compactSize = useCallback((value: string | number | null | undefined) => compactSizeBase(value, language), [language]);
  const objectMetadataText = useCallback((object: DatabaseSchemaObject, detail?: DatabaseTable) => objectMetadataTextBase(object, detail, language, t('query.rows')), [language, t]);
  const objectSearchTypes = useMemo(() => OBJECT_SEARCH_TYPES.map(option => ({ ...option, label: t(option.labelKey) })), [t]);
  const context = useContext(DatabaseContext)!;
  const { openContextMenu } = useAppContextMenu();
  const toast = useCoreorToast();
  const { preferences } = useAppPreferences();
  const { servers, setServers, activeServerId, setActiveServerId, addServer, updateServer, removeServer, loadServers, isAddingServer, isServersLoading } = context;
  const [search, setSearch] = useState('');
  const [searchTypes, setSearchTypes] = useState<Set<ObjectSearchType>>(new Set(['all']));
  const [searchFilterOpen, setSearchFilterOpen] = useState(false);
  const searchFilterRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
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
  const [renameDatabase, setRenameDatabase] = useState<RenameDatabaseState | null>(null);
  const metadataRefreshTimersRef = useRef<Map<string, number>>(new Map());
  const [online, setOnline] = useState(true);
  const catalogBootstrapKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const focusSearch = () => { searchRef.current?.focus(); searchRef.current?.select(); };
    window.addEventListener('coreor:focus-object-search', focusSearch);
    return () => window.removeEventListener('coreor:focus-object-search', focusSearch);
  }, []);
  useEffect(() => {
    const closeFilter = (event: MouseEvent) => {
      if (!searchFilterRef.current?.contains(event.target as Node)) setSearchFilterOpen(false);
    };
    document.addEventListener('mousedown', closeFilter);
    return () => document.removeEventListener('mousedown', closeFilter);
  }, []);
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

  const normalizedSearch = search.trim().toLocaleLowerCase(language);
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

  const searchAll = searchTypes.has('all');
  const searchTypeEnabled = useCallback((type: ObjectSearchType) => searchAll || searchTypes.has(type), [searchAll, searchTypes]);
  const searchObjectKindsEnabled = searchAll || ['table', 'view', 'procedure', 'function', 'trigger', 'event'].some(type => searchTypes.has(type as ObjectSearchType));
  const advancedTypeSelected = !searchAll && ['view', 'procedure', 'function', 'trigger', 'event'].some(type => searchTypes.has(type as ObjectSearchType));
  const objectFilterActive = Boolean(normalizedSearch) || !searchAll;

  useEffect(() => {
    if (!workspaceKey || (normalizedSearch.length < 2 && !advancedTypeSelected)) return;
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
        } catch { /* catalog objects stay usable when advanced metadata is denied */ }
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => { cancelled = true; };
  }, [normalizedSearch, workspaceKey, servers, advancedTypeSelected]);

  const filteredServers = useMemo(
    () => servers.map(server => {
      const serverOwnMatch = searchTypeEnabled('server') && (!normalizedSearch || `${server.name} ${server.host} ${databaseEngineLabel(server.databaseType)}`.toLocaleLowerCase(language).includes(normalizedSearch));
      const databases = (server.databases || []).map(database => {
        const key = objectExplorerKey(server.id, database.name);
        const catalogObjects: DatabaseSchemaObject[] = database.tables.map(table => {
          const detail = database.tableDetails.find(item => item.tableName === table);
          return { name: table, kind: detail?.tableType?.toUpperCase().includes('VIEW') ? 'view' : 'table' };
        });
        const nativeObjects = databaseObjects[key] || [];
        const mergedObjects = [...catalogObjects];
        for (const object of nativeObjects) {
          const index = mergedObjects.findIndex(existing =>
            existing.kind === object.kind
            && existing.name === object.name
            && (existing.schema || '') === (object.schema || '')
          );
          if (index >= 0) mergedObjects[index] = { ...mergedObjects[index], ...object };
          else mergedObjects.push(object);
        }
        const objectMatches = mergedObjects.filter(object =>
          searchTypeEnabled(object.kind)
          && (!normalizedSearch || `${server.name} ${database.name} ${object.kind} ${object.schema || ''} ${object.name} ${object.tableName || ''}`.toLocaleLowerCase(language).includes(normalizedSearch))
        );
        const tableMatches = catalogObjects
          .filter(object => object.kind === 'table' && searchTypeEnabled('table') && (!normalizedSearch || `${server.name} ${database.name} table ${object.name}`.toLocaleLowerCase(language).includes(normalizedSearch)))
          .map(object => object.name);
        const databaseOwnMatch = searchTypeEnabled('database') && (!normalizedSearch || `${server.name} ${database.name}`.toLocaleLowerCase(language).includes(normalizedSearch));
        return { ...database, tables: tableMatches, objectMatches, databaseOwnMatch };
      }).filter(database => database.databaseOwnMatch || database.objectMatches.length > 0);
      return { ...server, databases, serverOwnMatch };
    }).filter(server => server.serverOwnMatch || Boolean(server.databases?.length)),
    [servers, normalizedSearch, databaseObjects, searchTypeEnabled]
  );

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string, force?: boolean) =>
    setter(previous => {
      const next = new Set(previous);
      const enabled = force ?? !next.has(value);
      if (enabled) next.add(value);
      else next.delete(value);
      return next;
    });
  const expandServer = (server: DatabaseServerConfig) => {
    setExpandedServers(previous => new Set(previous).add(server.id));
    setExpandedDatabases(previous => {
      const next = new Set(previous);
      for (const database of server.databases || []) next.add(`${server.id}:${database.name}`);
      return next;
    });
    setExpandedObjectGroups(previous => {
      const next = new Set(previous);
      for (const database of server.databases || []) {
        for (const group of objectGroupDefinitions) next.add(`${server.id}:${database.name}:${group.kind}`);
      }
      return next;
    });
    for (const database of server.databases || []) void loadObjects(server, database.name);
  };

  const collapseServer = (server: DatabaseServerConfig) => {
    const prefix = `${server.id}:`;
    setExpandedServers(previous => { const next = new Set(previous); next.delete(server.id); return next; });
    setExpandedDatabases(previous => new Set([...previous].filter(key => !key.startsWith(prefix))));
    setExpandedObjectGroups(previous => new Set([...previous].filter(key => !key.startsWith(prefix))));
  };

  const expandDatabase = (server: DatabaseServerConfig, databaseName: string) => {
    const databaseKey = `${server.id}:${databaseName}`;
    setExpandedServers(previous => new Set(previous).add(server.id));
    setExpandedDatabases(previous => new Set(previous).add(databaseKey));
    setExpandedObjectGroups(previous => {
      const next = new Set(previous);
      for (const group of objectGroupDefinitions) next.add(`${databaseKey}:${group.kind}`);
      return next;
    });
    void loadObjects(server, databaseName);
  };

  const collapseDatabase = (server: DatabaseServerConfig, databaseName: string) => {
    const databaseKey = `${server.id}:${databaseName}`;
    setExpandedDatabases(previous => { const next = new Set(previous); next.delete(databaseKey); return next; });
    setExpandedObjectGroups(previous => new Set([...previous].filter(key => !key.startsWith(`${databaseKey}:`))));
  };
  const preloadServerObjects = useCallback(async (server: DatabaseServerConfig, databases: DatabaseServerConfig['databases']) => {
    if (!workspaceKey || !databases?.length) return;
    const targets = databases.map(database => database.name);
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const databaseName = targets[cursor++];
        if (!databaseName) return;
        const key = objectExplorerKey(server.id, databaseName);
        setObjectLoading(previous => new Set(previous).add(key));
        try {
          const result = await fetchDatabaseObjects(server.id, databaseName, workspaceKey, true);
          setDatabaseObjects(previous => ({ ...previous, [key]: result.objects }));
        } catch {
          setDatabaseObjects(previous => ({ ...previous, [key]: [] }));
        } finally {
          setObjectLoading(previous => { const next = new Set(previous); next.delete(key); return next; });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, targets.length) }, () => worker()));
  }, [workspaceKey]);

  const refreshServer = useCallback(async (server: DatabaseServerConfig) => {
    if (!workspaceKey) return;
    const response = await fetchServerTables(server.id, workspaceKey);
    const nextServer = { ...server, databases: response.databases };
    setServers(previous => previous.map(item => item.id === server.id ? { ...item, databases: response.databases } : item));
    setDatabaseObjects(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${server.id}:`))));
    await preloadServerObjects(nextServer, response.databases);
  }, [workspaceKey, setServers, preloadServerObjects]);

  const refreshMetadata = useCallback(async (server: DatabaseServerConfig, databaseName: string | null) => {
    if (!workspaceKey) return;
    const response = await fetchServerTables(server.id, workspaceKey);
    setServers(previous => previous.map(item => item.id === server.id ? { ...item, databases: response.databases } : item));
    if (!databaseName || !response.databases.some(database => database.name === databaseName)) {
      setDatabaseObjects(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${server.id}:`))));
      return;
    }
    const key = objectExplorerKey(server.id, databaseName);
    setDatabaseObjects(previous => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    try {
      const objects = await fetchDatabaseObjects(server.id, databaseName, workspaceKey, true);
      setDatabaseObjects(previous => ({ ...previous, [key]: objects.objects }));
    } catch {
      // Catalog refresh remains valid even if advanced object metadata is denied.
    }
  }, [workspaceKey, setServers]);

  useEffect(() => {
    const handleInvalidation = (event: Event) => {
      const detail = (event as CustomEvent<{ serverId?: string; databaseName?: string | null }>).detail;
      if (!detail?.serverId) return;
      const server = servers.find(item => item.id === detail.serverId);
      if (!server) return;
      const key = `${detail.serverId}:${detail.databaseName || '*'}`;
      const existing = metadataRefreshTimersRef.current.get(key);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        metadataRefreshTimersRef.current.delete(key);
        void refreshMetadata(server, detail.databaseName ?? null);
      }, 250);
      metadataRefreshTimersRef.current.set(key, timer);
    };
    window.addEventListener('coreor:database-metadata-invalidated', handleInvalidation);
    return () => {
      window.removeEventListener('coreor:database-metadata-invalidated', handleInvalidation);
      for (const timer of metadataRefreshTimersRef.current.values()) window.clearTimeout(timer);
      metadataRefreshTimersRef.current.clear();
    };
  }, [servers, refreshMetadata]);

  useEffect(() => {
    if (!workspaceKey || !activeServerId) return;
    const server = servers.find(item => item.id === activeServerId);
    if (!server) return;
    const bootstrapKey = [server.id, server.host, server.port, server.username, server.databaseType, server.sslMode].join(':');
    if (catalogBootstrapKeyRef.current === bootstrapKey) return;
    catalogBootstrapKeyRef.current = bootstrapKey;
    void refreshServer(server).catch(() => {
      if (catalogBootstrapKeyRef.current === bootstrapKey) catalogBootstrapKeyRef.current = null;
    });
  }, [workspaceKey, activeServerId, servers, refreshServer]);
  const runDangerous = (server: DatabaseServerConfig, database: string, table: string, sql: string, title: string, description: string, label: string) =>
    setConfirmation({
      title,
      description,
      expectedText: table,
      sql,
      confirmLabel: label,
      onConfirm: async () => {
        if (!workspaceKey) throw new Error(t('sidebar.workspaceNotReady'));
        await executeDatabaseQuery(server.id, sql, workspaceKey, database);
        await refreshServer(server);
        if (/DROP\s+TABLE/i.test(sql)) onTableSelect(null);
      }
    });
  const openSql = (server: DatabaseServerConfig, database: string | null, title: string, sql: string, runImmediately = false) => openQueryTab({ serverId: server.id, databaseName: database, title, sql, runImmediately });


  const recalculateDatabaseSize = useCallback(async (server: DatabaseServerConfig, database: string) => {
    if (!workspaceKey) return;
    const toastId = toast.show({ title: t('sidebar.storage.databaseCalculating'), description: database, loading: true, persistent: true });
    try {
      const result = await recalculateDatabaseStorage(server.id, database, workspaceKey);
      await loadServers();
      toast.update(toastId, {
        loading: false,
        persistent: false,
        variant: 'success',
        title: t('sidebar.storage.databaseUpdated'),
        description: t('sidebar.storage.databaseResult', { database, size: compactBytes(result.totalBytes) || '0 B', tables: result.tableResults?.length || 0, rowMode: result.rowCountSource === 'exact-count' ? t('sidebar.storage.rowsExact') : t('sidebar.storage.rowsEstimated'), failed: result.failedTables?.length ? t('sidebar.storage.failedTables', { count: result.failedTables.length }) : '', source: result.measurementSource === 'innodb-tablespace' ? t('sidebar.storage.physicalInnoDb') : '' }),
        duration: result.failedTables?.length ? 5000 : 3500
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const notification = publishCoreorNotification({
        id: `storage-database-${server.id}-${database}`,
        severity: 'error',
        source: 'storage',
        title: t('sidebar.storage.databaseFailed'),
        description: message,
        serverId: server.id,
        serverName: server.name,
        databaseName: database,
        code: (error as Error & { code?: string })?.code || 'STORAGE_RECALCULATION_FAILED',
        metadata: [
          { label: t('sidebar.storage.scope'), value: t('database.database') },
          { label: t('database.database'), value: database },
          { label: t('bottomBar.engine'), value: server.databaseType || 'mysql' }
        ]
      });
      toast.update(toastId, {
        loading: false,
        persistent: false,
        variant: 'error',
        title: t('sidebar.storage.calculationFailed'),
        description: message,
        duration: 5000,
        onOpen: () => window.dispatchEvent(new CustomEvent('coreor:open-notification', { detail: { id: notification.id } }))
      });
    }
  }, [workspaceKey, loadServers, toast]);

  const recalculateTableSize = useCallback(async (server: DatabaseServerConfig, database: string, table: string) => {
    if (!workspaceKey) return;
    const toastId = toast.show({ title: t('sidebar.storage.tableCalculating'), description: `${database}.${table}`, loading: true, persistent: true });
    try {
      const result = await recalculateTableStorage(server.id, database, table, workspaceKey);
      await loadServers();
      toast.update(toastId, {
        loading: false,
        persistent: false,
        variant: 'success',
        title: t('sidebar.storage.tableUpdated'),
        description: t('sidebar.storage.tableResult', { table, size: compactBytes(result.totalBytes) || '0 B', rows: Number(result.rows || 0).toLocaleString(language), exact: result.rowCountSource === 'exact-count' ? t('sidebar.storage.exact') : '', source: result.measurementSource === 'innodb-tablespace' ? t('sidebar.storage.physicalInnoDb') : '' }),
        duration: 3500
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const notification = publishCoreorNotification({
        id: `storage-table-${server.id}-${database}-${table}`,
        severity: 'error',
        source: 'storage',
        title: t('sidebar.storage.tableFailed'),
        description: message,
        serverId: server.id,
        serverName: server.name,
        databaseName: database,
        tableName: table,
        code: (error as Error & { code?: string })?.code || 'STORAGE_RECALCULATION_FAILED',
        metadata: [
          { label: t('sidebar.storage.scope'), value: t('database.table') },
          { label: t('database.table'), value: `${database}.${table}` },
          { label: t('bottomBar.engine'), value: server.databaseType || 'mysql' }
        ]
      });
      toast.update(toastId, {
        loading: false,
        persistent: false,
        variant: 'error',
        title: t('sidebar.storage.calculationFailed'),
        description: message,
        duration: 5000,
        onOpen: () => window.dispatchEvent(new CustomEvent('coreor:open-notification', { detail: { id: notification.id } }))
      });
    }
  }, [workspaceKey, loadServers, toast]);

  const recalculateServerSizes = useCallback(async (server: DatabaseServerConfig) => {
    if (!workspaceKey) return;
    const databases = server.databases || [];
    const toastId = toast.show({ title: t('sidebar.storage.serverCalculating'), description: t('sidebar.storage.serverProgress',{count:formatNumber(databases.length)}), loading: true, persistent: true });
    try {
      for (const database of databases) {
        await recalculateDatabaseStorage(server.id, database.name, workspaceKey);
      }
      await loadServers();
      toast.update(toastId, {
        loading: false,
        persistent: false,
        variant: 'success',
        title: t('sidebar.storage.serverUpdated'),
        description: t('sidebar.storage.serverResult',{server:server.name,count:formatNumber(databases.length)}),
        duration: 3500
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const notification = publishCoreorNotification({
        id: `storage-server-${server.id}`,
        severity: 'error',
        source: 'storage',
        title: t('sidebar.storage.serverFailed'),
        description: message,
        serverId: server.id,
        serverName: server.name,
        code: (error as Error & { code?: string })?.code || 'STORAGE_RECALCULATION_FAILED',
        metadata: [
          { label: t('sidebar.storage.scope'), value: t('statusGuide.server') },
          { label: t('statusGuide.server'), value: server.name },
          { label: t('bottomBar.engine'), value: server.databaseType || 'mysql' }
        ]
      });
      toast.update(toastId, {
        loading: false,
        persistent: false,
        variant: 'error',
        title: t('sidebar.storage.serverCalculationFailed'),
        description: message,
        duration: 5000,
        onOpen: () => window.dispatchEvent(new CustomEvent('coreor:open-notification', { detail: { id: notification.id } }))
      });
    }
  }, [workspaceKey, loadServers, toast]);

  const serverMenu = (event: React.MouseEvent, server: DatabaseServerConfig) =>
    openContextMenu(
      event,
      [
        { id: 'activate', label: t('sidebar.menu.activateServer'), icon: Server, onSelect: () => setActiveServerId(server.id) },
        { id: 'create-db', label: t('sidebar.menu.createDatabase'), icon: Plus, onSelect: () => setCreateDatabase({ server, name: '', charset: databaseEngineFamily(server.databaseType) === 'mysql' ? 'utf8mb4' : 'UTF8', collation: '', owner: '', busy: false, error: null }) },
        { id: 'query', label: t('sidebar.menu.serverQuery'), icon: Code2, onSelect: () => openSql(server, null, t('sidebar.editor.serverQuery',{server:server.name}), '') },
        { id: 'refresh', label: t('sidebar.menu.refreshCatalog'), icon: RefreshCw, onSelect: () => void refreshServer(server) },
        { id: 'recalculate-sizes', label: t('sidebar.menu.recalculateAllSizes'), icon: HardDrive, onSelect: () => void recalculateServerSizes(server) },
        { id: 'sep1', separator: true },
        { id: 'expand', label: t('sidebar.expandAll'), icon: ChevronDown, onSelect: () => expandServer(server) },
        { id: 'collapse', label: t('sidebar.collapseAll'), icon: ChevronRight, onSelect: () => collapseServer(server) },
        { id: 'copy-connection', label: t('sidebar.menu.copyConnection'), icon: Copy, children: [
          { id: 'copy-host', label: 'Host', icon: Copy, onSelect: () => navigator.clipboard.writeText(server.host || '') },
          { id: 'copy-host-port', label: 'Host:port', icon: Copy, onSelect: () => navigator.clipboard.writeText(`${server.host}:${server.port}`) },
          { id: 'copy-user', label: t('server.username'), icon: Copy, onSelect: () => navigator.clipboard.writeText(server.username || '') },
          { id: 'copy-summary', label: t('server.connectionSummary'), icon: Copy, onSelect: () => navigator.clipboard.writeText(`${server.name} • ${databaseEngineLabel(server.databaseType)} • ${server.host}:${server.port} • ${server.username}`) }
        ] },
        {
          id: 'edit',
          label: t('sidebar.editConnection'),
          icon: Settings2,
          onSelect: () => {
            setEditingServer(server);
            setServerModalOpen(true);
          }
        },
        {
          id: 'remove-profile',
          label: t('sidebar.menu.removeConnectionProfile'),
          icon: Trash2,
          danger: true,
          onSelect: () => setProfileConfirmation({
            title: t('sidebar.profile.removeTitle'),
            description: t('sidebar.profile.removeDescription',{server:server.name}),
            confirmLabel: t('sidebar.profile.removeConfirm'),
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
          label: t('sidebar.menu.openDatabase'),
          icon: Database,
          onSelect: () => {
            setActiveServerId(server.id);
            onDatabaseSelect(database);
            onTableSelect(null);
          }
        },
        { id: 'query', label: t('sidebar.menu.newSqlQuery'), icon: Code2, onSelect: () => openSql(server, database, t('sidebar.editor.databaseQuery',{database}), '') },
        {
          id: 'schema',
          label: t('sidebar.menu.openSchemaGraph'),
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
          label: t('sidebar.menu.createNew'),
          icon: Plus,
          children: [
            ['table', t('database.table'), Table2],
            ['view', t('database.view'), View],
            ['procedure', t('database.procedure'), Zap],
            ['function', t('database.function'), FunctionSquare],
            ['trigger', t('database.trigger'), Activity],
            ['event', t('sidebar.groups.eventScheduled'), Sparkles],
            ['index', t('database.index'), KeyRound]
          ].map(([type, label, icon]) => ({ id: `new-${type}`, label: String(label), icon: icon as typeof Plus, onSelect: () => openSql(server, database, t('sidebar.editor.newObject',{object:String(label)}), objectTemplate(server.databaseType || 'mysql', database, String(type), t)) }))
        },
        {
          id: 'routines',
          label: t('sidebar.menu.runRoutines'),
          icon: Braces,
          children: [
            { id: 'call', label: t('sidebar.menu.callProcedure'), icon: Zap, onSelect: () => openSql(server, database, t('sidebar.editor.procedureCall'), databaseEngineFamily(server.databaseType) === 'postgresql' ? 'CALL procedure_name();' : 'CALL procedure_name();') },
            { id: 'function', label: t('sidebar.menu.runFunction'), icon: FunctionSquare, onSelect: () => openSql(server, database, t('sidebar.editor.functionRun'), 'SELECT function_name();') }
          ]
        },
        {
          id: 'export',
          label: t('sidebar.menu.exportDatabaseSql'),
          icon: Download,
          onSelect: () => {
            setActiveServerId(server.id);
            onDatabaseSelect(database);
            window.dispatchEvent(new Event(OPEN_IMPORT_EXPORT_EVENT));
          }
        },
        { id: 'sep2', separator: true },
        { id: 'expand', label: t('sidebar.menu.expandObjectGroups'), icon: ChevronDown, onSelect: () => expandDatabase(server, database) },
        { id: 'collapse', label: t('sidebar.menu.collapseObjectGroups'), icon: ChevronRight, onSelect: () => collapseDatabase(server, database) },
        { id: 'copy-db', label: t('sidebar.menu.copyDatabaseName'), icon: Copy, onSelect: () => navigator.clipboard.writeText(database) },
        { id: 'copy-db-quoted', label: t('sidebar.menu.copyQuotedDatabaseName'), icon: Code2, onSelect: () => navigator.clipboard.writeText(quoteDatabaseIdentifier(database, server.databaseType || 'mysql')) },
        {
          id: 'rename-database',
          label: t('sidebar.menu.editDatabase'),
          icon: Wrench,
          disabled: Boolean(server.readOnly),
          disabledReason: server.readOnly ? t('sidebar.readOnlyConnection') : undefined,
          onSelect: () => { const info = (server.databases || []).find(item => item.name === database); setRenameDatabase({ server, currentName: database, nextName: database, charset: info?.defaultCharset || (databaseEngineFamily(server.databaseType) === 'mysql' ? 'utf8mb4' : ''), collation: info?.defaultCollation || '', busy: false, error: null }); }
        },
        { id: 'recalculate-size', label: t('sidebar.menu.recalculateSize'), icon: HardDrive, onSelect: () => void recalculateDatabaseSize(server, database) },
        { id: 'maintenance-center', label: t('sidebar.menu.maintenanceCenter'), icon: Wrench, onSelect: () => {
          setActiveServerId(server.id);
          onDatabaseSelect(database);
          onTableSelect(null);
          window.dispatchEvent(new CustomEvent(OPEN_MAINTENANCE_CENTER_EVENT, { detail: { serverId: server.id, databaseName: database, tableName: null } }));
        } },
        { id: 'refresh', label: t('common.refresh'), icon: RefreshCw, shortcut: 'refresh', onSelect: () => void refreshServer(server) },
        { id: 'sep-danger', separator: true },
        {
          id: 'drop-database',
          label: t('sidebar.menu.dropDatabase'),
          icon: Trash2,
          danger: true,
          onSelect: () => setConfirmation({
            title: t('sidebar.menu.dropDatabaseTitle',{database}),
            description: t('sidebar.menu.dropDatabaseDescription'),
            expectedText: database,
            sql: `DROP DATABASE ${quoteDatabaseIdentifier(database, server.databaseType || 'mysql')};`,
            confirmLabel: t('sidebar.menu.dropDatabaseConfirm'),
            onConfirm: async () => {
              if (!workspaceKey) throw new Error(t('sidebar.workspaceNotReady'));
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
          label: t('sidebar.menu.openData'),
          icon: Table2,
          onSelect: () => {
            setActiveServerId(server.id);
            onDatabaseSelect(database);
            onTableSelect(table);
          }
        },
        {
          id: 'structure',
          label: t('sidebar.menu.openStructure'),
          icon: Wrench,
          onSelect: () => {
            setActiveServerId(server.id);
            onDatabaseSelect(database);
            onTableSelect(table);
          }
        },
        { id: 'query', label: t('sidebar.menu.selectQuery'), icon: Code2, onSelect: () => openSql(server, database, `${table} SELECT`, `SELECT * FROM ${qualified}\nLIMIT 100;`) },
        { id: 'ddl', label: t('sidebar.menu.showDdlMetadata'), icon: FileCode2, onSelect: () => openSql(server, database, `${table} DDL`, objectDefinitionSql(engine, database, { name: table, kind: 'table' }, t), true) },
        { id: 'copy-ddl', label: t('sidebar.menu.copyCreateTable'), icon: Copy, disabled: databaseEngineFamily(engine) !== 'mysql', disabledReason: t('sidebar.menu.showCreateUnavailable'), onSelect: async () => { if (!workspaceKey) return; const result = await executeDatabaseQuery(server.id, objectDefinitionSql(engine, database, { name: table, kind: 'table' }, t), workspaceKey, database); const text = result.rows.flatMap(row => Object.values(row)).filter(value => typeof value === 'string').map(String).at(-1) || ''; if (text) await navigator.clipboard.writeText(text); } },
        { id: 'dependencies', label: t('sidebar.menu.queryDependencies'), icon: Network, onSelect: () => openSql(server, database, t('sidebar.editor.dependencies',{object:table}), objectDependencySql(engine, database, { name: table, kind: 'table' }), true) },
        { id: 'rename', label: t('sidebar.menu.renameDraft'), icon: Wrench, disabled: Boolean(server.readOnly), disabledReason: server.readOnly ? t('sidebar.readOnlyConnection') : undefined, onSelect: () => openSql(server, database, `${table} rename`, objectRenameTemplate(engine, database, { name: table, kind: 'table' }, t)) },
        { id: 'insert-row', label: t('sidebar.menu.insertRow'), icon: Plus, shortcut: 'insertRow', disabled: Boolean(server.readOnly), disabledReason: server.readOnly ? t('sidebar.readOnlyConnection') : undefined, onSelect: () => { setActiveServerId(server.id); onDatabaseSelect(database); onTableSelect(table); window.dispatchEvent(new CustomEvent('coreor:request-insert-table-row', { detail: { databaseName: database, tableName: table } })); } },
        {
          id: 'new',
          label: t('sidebar.menu.createNew'),
          icon: Plus,
          children: [
            ['table', t('database.table'), Table2],
            ['view', t('database.view'), View],
            ['procedure', t('database.procedure'), Zap],
            ['function', t('database.function'), FunctionSquare],
            ['trigger', t('database.trigger'), Activity],
            ['event', t('database.event'), Sparkles],
            ['index', t('database.index'), KeyRound]
          ].map(([type, label, icon]) => ({ id: `new-${type}`, label: String(label), icon: icon as typeof Plus, onSelect: () => openSql(server, database, t('sidebar.editor.newObject',{object:String(label)}), objectTemplate(engine, database, String(type), t)) }))
        },
        { id: 'routines', label: t('sidebar.menu.runRoutines'), icon: Braces, onSelect: () => openSql(server, database, `${table} rutin`, `CALL routine_name(${quoteDatabaseIdentifier('parameter', engine)});`) },
        { id: 'sep1', separator: true },
        { id: 'truncate', label: t('sidebar.menu.emptyTable'), icon: Trash2, danger: true, onSelect: () => runDangerous(server, database, table, `TRUNCATE TABLE ${qualified};`, t('sidebar.menu.emptyTableTitle',{table}), t('sidebar.menu.emptyTableDescription'), t('sidebar.menu.emptyTableConfirm')) },
        { id: 'drop', label: t('sidebar.menu.dropTable'), icon: Trash2, danger: true, onSelect: () => runDangerous(server, database, table, `DROP TABLE ${qualified};`, t('sidebar.menu.dropTableTitle',{table}), t('sidebar.menu.dropTableDescription'), t('sidebar.menu.dropTableConfirm')) },
        { id: 'sep2', separator: true },
        {
          id: 'export',
          label: t('sidebar.menu.exportSql'),
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
          label: t('sidebar.menu.maintenanceCenter'),
          icon: Wrench,
          onSelect: () => {
            setActiveServerId(server.id);
            onDatabaseSelect(database);
            onTableSelect(table);
            window.dispatchEvent(new CustomEvent(OPEN_MAINTENANCE_CENTER_EVENT, { detail: { serverId: server.id, databaseName: database, tableName: table } }));
          }
        },
        { id: 'copy-table', label: t('common.copy'), icon: Copy, children: [
          { id: 'copy-table-name', label: t('sidebar.menu.tableName'), icon: Copy, onSelect: () => navigator.clipboard.writeText(table) },
          { id: 'copy-qualified', label: t('sidebar.menu.fullTableName'), icon: Copy, onSelect: () => navigator.clipboard.writeText(qualified) },
          { id: 'copy-select', label: t('sidebar.menu.selectDraft'), icon: Code2, onSelect: () => navigator.clipboard.writeText(`SELECT * FROM ${qualified}\nLIMIT 100;`) }
        ] },
        { id: 'sep3', separator: true },
        { id: 'expand', label: t('sidebar.menu.expandDatabase'), icon: ChevronDown, onSelect: () => expandDatabase(server, database) },
        { id: 'collapse', label: t('sidebar.menu.collapseDatabase'), icon: ChevronRight, onSelect: () => collapseDatabase(server, database) },
        { id: 'recalculate-size', label: t('sidebar.menu.recalculateSize'), icon: HardDrive, onSelect: () => void recalculateTableSize(server, database, table) },
        { id: 'refresh', label: t('common.refresh'), icon: RefreshCw, onSelect: () => void refreshServer(server) }
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
        label: object.kind === 'view' ? t('sidebar.menu.openData') : t('sidebar.menu.openOrRun'),
        icon: object.kind === 'view' ? View : object.kind === 'procedure' ? Zap : object.kind === 'function' ? FunctionSquare : Activity,
        onSelect: () => {
          setActiveServerId(server.id); onDatabaseSelect(database);
          if (object.kind === 'view') onTableSelect(object.name);
          else if (object.kind === 'procedure') openSql(server, database, t('sidebar.editor.callObject',{object:object.name}), `CALL ${qualified}();`);
          else if (object.kind === 'function') openSql(server, database, t('sidebar.editor.runObject',{object:object.name}), `SELECT ${qualified}();`);
          else openSql(server, database, t('sidebar.editor.definition',{object:object.name}), objectDefinitionSql(engine, database, object, t), true);
        }
      },
      { id: 'new-query', label: t('sidebar.menu.newQuery'), icon: Code2, shortcut: 'newQuery', onSelect: () => openSql(server, database, `${object.name} sorgu`, '') },
      { id: 'definition', label: t('sidebar.menu.showDefinition'), icon: FileCode2, onSelect: () => openSql(server, database, `${object.name} DDL`, objectDefinitionSql(engine, database, object, t), true) },
      { id: 'copy-definition', label: t('sidebar.menu.copyDdl'), icon: Copy, disabled: databaseEngineFamily(engine) !== 'mysql' && object.kind === 'table', disabledReason: t('sidebar.menu.ddlUnavailable'), onSelect: async () => {
        if (!workspaceKey) return;
        const result = await executeDatabaseQuery(server.id, objectDefinitionSql(engine, database, object, t), workspaceKey, database);
        const text = result.rows.flatMap(row => Object.values(row)).filter(value => typeof value === 'string').map(String).at(-1) || object.definition || '';
        if (text) await navigator.clipboard.writeText(text);
      } },
      { id: 'dependencies', label: t('sidebar.menu.queryDependencies'), icon: Network, onSelect: () => openSql(server, database, t('sidebar.editor.dependencies',{object:object.name}), objectDependencySql(engine, database, object), true) },
      { id: 'sep-edit', separator: true },
      { id: 'rename', label: t('sidebar.menu.renameDraft'), icon: Wrench, disabled: Boolean(server.readOnly) || !canRename, disabledReason: server.readOnly ? t('sidebar.readOnlyConnection') : t('sidebar.menu.renameUnavailable'), onSelect: () => openSql(server, database, `${object.name} rename`, objectRenameTemplate(engine, database, object, t)) },
      { id: 'copy', label: t('common.copy'), icon: Copy, children: [
        { id: 'copy-name', label: t('sidebar.menu.objectName'), icon: Copy, onSelect: () => navigator.clipboard.writeText(object.name) },
        { id: 'copy-qualified', label: t('sidebar.menu.fullObjectName'), icon: Copy, onSelect: () => navigator.clipboard.writeText(qualified) },
        ...(object.tableName ? [{ id: 'copy-parent', label: t('sidebar.menu.relatedTableName'), icon: Copy, onSelect: () => navigator.clipboard.writeText(object.tableName || '') }] : [])
      ] },
      { id: 'sep-danger', separator: true },
      {
        id: 'drop',
        label: t('sidebar.menu.dropObjectKind',{kind:t(`database.${object.kind}`)}),
        icon: Trash2,
        danger: true,
        disabled: Boolean(server.readOnly),
        disabledReason: server.readOnly ? t('sidebar.readOnlyConnection') : undefined,
        onSelect: () => runDangerous(server, database, object.name, objectDropSql(engine, database, object), t('sidebar.menu.dropObjectTitle',{object:object.name}), t('sidebar.menu.dropObjectDescription',{kind:t(`database.${object.kind}`)}), t('sidebar.menu.dropObject'))
      }
    ], `${object.kind.toUpperCase()} • ${object.schema ? `${object.schema}.` : ''}${object.name}`);
  };

  const objectGroupDefinitions = useMemo(() => [
    { kind: 'table' as const, label: t('sidebar.groups.tables'), singular: t('database.table'), icon: Table2 },
    { kind: 'view' as const, label: t('sidebar.groups.views'), singular: t('database.view'), icon: View },
    { kind: 'procedure' as const, label: t('sidebar.groups.procedures'), singular: t('database.procedure'), icon: Zap },
    { kind: 'function' as const, label: t('sidebar.groups.functions'), singular: t('database.function'), icon: FunctionSquare },
    { kind: 'trigger' as const, label: t('sidebar.groups.triggers'), singular: t('database.trigger'), icon: Activity },
    { kind: 'event' as const, label: t('sidebar.groups.events'), singular: t('database.event'), icon: Sparkles }
  ], [t]);

  const objectGroupMenu = (event: React.MouseEvent, server: DatabaseServerConfig, database: string, kind: DatabaseSchemaObject['kind']) => {
    const definition = objectGroupDefinitions.find(item => item.kind === kind);
    const label = definition?.label || kind;
    openContextMenu(event, [
      { id: 'new', label: t('sidebar.menu.newObject',{object:definition?.singular || label}), icon: Plus, disabled: Boolean(server.readOnly), disabledReason: server.readOnly ? t('sidebar.readOnlyConnection') : undefined, onSelect: () => openSql(server, database, t('sidebar.editor.newObject',{object:definition?.singular || kind}), objectTemplate(server.databaseType || 'mysql', database, kind, t)) },
      { id: 'query', label: t('sidebar.menu.newSqlQuery'), icon: Code2, shortcut: 'newQuery', onSelect: () => openSql(server, database, t('sidebar.editor.databaseQuery',{database}), '') },
      { id: 'sep', separator: true },
      { id: 'refresh', label: t('sidebar.menu.refreshObjects'), icon: RefreshCw, shortcut: 'refresh', onSelect: () => void loadObjects(server, database, true) },
      { id: 'copy-db', label: t('sidebar.menu.copyDatabaseName'), icon: Copy, onSelect: () => navigator.clipboard.writeText(database) }
    ], `${database} • ${label}`);
  };

  const toggleSearchType = (type: ObjectSearchType) => {
    setSearchTypes(previous => {
      if (type === 'all') return new Set<ObjectSearchType>(['all']);
      const next = new Set<ObjectSearchType>(previous);
      next.delete('all');
      if (next.has(type)) next.delete(type);
      else next.add(type);
      if (!next.size) next.add('all');
      return next;
    });
  };

  const activeSearchTypeLabel = searchAll
    ? t('common.all')
    : searchTypes.size === 1
      ? objectSearchTypes.find(item => searchTypes.has(item.value))?.label || t('sidebar.filter')
      : t('sidebar.selectedTypes', { count: searchTypes.size });

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-zinc-800 bg-zinc-950/96">
      <header className="shrink-0 border-b border-zinc-800 p-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10">
            <Database className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-zinc-100">Coreor Database</div>
            <div className="text-[8px] text-zinc-600">v3.1.0 • {t('sidebar.multiEngineWorkspace')}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              setEditingServer(null);
              setServerModalOpen(true);
            }}
            title={t('sidebar.newServer')}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { const active=servers.find(server=>server.id===activeServerId); if(active) void refreshServer(active); else void loadServers(); }} title={t('sidebar.refreshActiveCatalog')}>
            <RefreshCw className={`h-3.5 w-3.5 ${isServersLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div ref={searchFilterRef} className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <Input ref={searchRef} value={search} onChange={event => setSearch(event.target.value)} className="h-8 rounded-xl border-zinc-800 bg-black/30 pl-8 pr-[7.3rem] text-[10px]" placeholder={t('sidebar.searchObjects')} />
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            {search && <button type="button" className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300" title={t('sidebar.clearSearch')} onClick={() => setSearch('')}><X className="h-3 w-3" /></button>}
            <button type="button" aria-expanded={searchFilterOpen} className={`flex h-6 max-w-24 items-center gap-1.5 rounded-lg border px-2 text-[8px] font-medium transition ${searchAll ? 'border-zinc-800 bg-zinc-900/80 text-zinc-500 hover:text-zinc-300' : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300'}`} onClick={() => setSearchFilterOpen(previous => !previous)} title={t('sidebar.filterSearchTypes')}>
              <ListFilter className="h-3 w-3 shrink-0" />
              <span className="truncate">{activeSearchTypeLabel}</span>
              <ChevronDown className={`h-2.5 w-2.5 shrink-0 transition-transform ${searchFilterOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {searchFilterOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-[350] w-56 overflow-hidden rounded-xl border border-zinc-700/90 bg-zinc-950/98 p-1.5 shadow-[0_18px_55px_rgba(0,0,0,.68)] backdrop-blur-xl">
              <div className="mb-1 px-2 py-1 text-[8px] font-medium uppercase tracking-wider text-zinc-600">{t('sidebar.searchScope')}</div>
              {objectSearchTypes.map(option => {
                const Icon = option.icon;
                const checked = searchAll || searchTypes.has(option.value);
                return <button key={option.value} type="button" className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[9px] transition ${checked ? 'bg-white/[0.045] text-zinc-200' : 'text-zinc-500 hover:bg-white/[0.025] hover:text-zinc-300'}`} onClick={() => toggleSearchType(option.value)}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-md bg-white/[0.025] ${option.color}`}><Icon className="h-3 w-3" /></span>
                  <span className="min-w-0 flex-1">{option.label}</span>
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300' : 'border-zinc-800 text-transparent'}`}><Check className="h-2.5 w-2.5" /></span>
                </button>;
              })}
              <div className="mt-1 border-t border-zinc-800 px-2 pt-1.5 text-[7px] leading-4 text-zinc-700">{t('sidebar.searchScopeHint')}</div>
            </div>
          )}
        </div>
      </header>

      <div className="coreor-sidebar-scroll min-h-0 flex-1 overflow-auto py-1.5 pl-1.5 pr-0">
        {isServersLoading && !servers.length ? (
          <div className="flex h-32 items-center justify-center gap-2 text-[10px] text-zinc-600">
            <Activity className="h-3.5 w-3.5 animate-spin" />
            {t('sidebar.loadingVault')}
          </div>
        ) : !filteredServers.length ? (
          <div className="p-6 text-center">
            <Server className="mx-auto h-7 w-7 text-zinc-700" />
            <div className="mt-3 text-[10px] text-zinc-500">{objectFilterActive ? t('sidebar.noSearchMatches') : t('sidebar.noServersYet')}</div>
          </div>
        ) : (
          filteredServers.map(server => {
            const serverOpen = expandedServers.has(server.id) || objectFilterActive;
            const active = activeServerId === server.id;
            return (
              <section key={server.id} className="mb-1 overflow-hidden rounded-xl border border-transparent hover:border-zinc-800/70">
                <div className={`group flex h-9 items-center gap-1.5 px-1.5 ${active ? 'bg-cyan-500/[0.07]' : 'hover:bg-white/[0.025]'}`} onContextMenu={event => serverMenu(event, server)}>
                  <button type="button" className="flex h-6 w-6 items-center justify-center rounded hover:bg-zinc-800" onClick={() => toggle(setExpandedServers, server.id)}>
                    {serverOpen ? <ChevronDown className="h-3.5 w-3.5 text-cyan-400" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />}
                  </button>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setActiveServerId(server.id)}>
                    <Server className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-emerald-400' : 'text-emerald-700'}`} />
                    <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-zinc-300">{server.name}</span>
                    <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[8px] text-zinc-500">{databaseEngineLabel(server.databaseType)}</span>
                    <span
                      className="flex shrink-0 items-center gap-1 rounded bg-blue-500/[0.06] px-1.5 py-0.5 font-mono text-[8px] tabular-nums text-blue-300/80"
                      title={t('sidebar.catalogSizeTooltip')}
                    >
                      <HardDrive className="h-2.5 w-2.5" />
                      {compactSize((server.databases || []).reduce((sum, database) => sum + (Number(database.totalSizeMB) || 0), 0))}
                    </span>
                  </button>
                  <button type="button" className="flex h-6 w-6 items-center justify-center rounded opacity-0 hover:bg-zinc-800 group-hover:opacity-100" onClick={event => serverMenu(event, server)}>
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>
                {serverOpen && (
                  <div className="ml-4 border-l border-zinc-800 pl-1.5">
                    {(server.databases || []).map(database => {
                      const databaseKey = `${server.id}:${database.name}`;
                      const databaseOpen = expandedDatabases.has(databaseKey) || (objectFilterActive && searchObjectKindsEnabled);
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
                              <Database className="h-3 w-3 shrink-0 text-sky-400" />
                              <span className="min-w-0 flex-1 truncate text-[9px] text-zinc-400">{database.name}</span>
                              <span className="flex shrink-0 items-center gap-1.5 text-[9px] tabular-nums text-zinc-500">
                                <span>{database.objectMatches.length.toLocaleString(language)} nesne</span>
                                <span className="text-zinc-800">•</span>
                                <span className="font-mono text-blue-300/75">{compactSize(database.totalSizeMB)}</span>
                              </span>
                            </button>
                          </div>
                          {databaseOpen && (() => {
                            const key = objectExplorerKey(server.id, database.name);
                            const loaded = databaseObjects[key];
                            const fallbackObjects: DatabaseSchemaObject[] = database.tables.map(table => {
                              const detail = database.tableDetails.find(item => item.tableName === table);
                              return { name: table, kind: detail?.tableType?.toUpperCase().includes('VIEW') ? 'view' : 'table' };
                            });
                            const visibleObjects = database.objectMatches.length
                              ? database.objectMatches
                              : loaded?.length
                                ? [...fallbackObjects, ...loaded.filter(object => !fallbackObjects.some(fallback => fallback.kind === object.kind && fallback.name === object.name))]
                                : fallbackObjects;
                            const sortedObjects = [...visibleObjects].sort((left, right) => left.name.localeCompare(right.name, language, { sensitivity: 'base' }));
                            const renderObject = (object: DatabaseSchemaObject, Icon: typeof Table2) => {
                              const detail = database.tableDetails.find(item => item.tableName === object.name);
                              const metadata = objectMetadataText(object, detail);
                              return (
                              <button
                                key={`${object.kind}:${object.schema || ''}:${object.name}`}
                                type="button"
                                title={preferences.objectExplorerDetails && metadata ? `${object.name} • ${metadata}` : object.name}
                                className={`group flex h-7 w-full min-w-0 items-center gap-2 rounded px-2 text-left ${active && selectedDatabase === database.name && selectedTable === object.name && (object.kind === 'table' || object.kind === 'view') ? 'bg-cyan-500/10 text-cyan-100' : 'text-zinc-500 hover:bg-white/[0.025] hover:text-zinc-200'}`}
                                onClick={() => {
                                  setActiveServerId(server.id); onDatabaseSelect(database.name);
                                  if (object.kind === 'table' || object.kind === 'view') onTableSelect(object.name);
                                  else if (object.kind === 'procedure') openSql(server, database.name, t('sidebar.editor.callObject',{object:object.name}), `CALL ${objectQualifiedName(server.databaseType || 'mysql', database.name, object)}();`);
                                  else if (object.kind === 'function') openSql(server, database.name, t('sidebar.editor.runObject',{object:object.name}), `SELECT ${objectQualifiedName(server.databaseType || 'mysql', database.name, object)}();`);
                                  else openSql(server, database.name, t('sidebar.editor.definition',{object:object.name}), objectDefinitionSql(server.databaseType || 'mysql', database.name, object, t), true);
                                }}
                                onContextMenu={event => objectMenu(event, server, database.name, object)}
                              >
                                <Icon className={`h-3 w-3 shrink-0 ${objectKindColor(object.kind)}`} />
                                <span className="min-w-0 flex-1 truncate text-[9px]">{object.schema && object.schema !== database.name ? `${object.schema}.` : ''}{object.name}</span>
                                {preferences.objectExplorerDetails && metadata && <span className="max-w-[48%] shrink-0 truncate font-mono text-[9px] tabular-nums text-zinc-500 group-hover:text-zinc-300">{metadata}</span>}
                                {!preferences.objectExplorerGrouped && <span className={`shrink-0 rounded bg-white/[0.025] px-1.5 py-0.5 text-[7px] uppercase ${objectKindColor(object.kind)}`}>{object.kind}</span>}
                              </button>
                              );
                            };
                            return (
                              <div className="ml-5 border-l border-zinc-900 pl-1">
                                {objectLoading.has(key) && !loaded && <div className="flex h-7 items-center gap-2 px-2 text-[8px] text-zinc-700"><Activity className="h-3 w-3 animate-spin" />{t('sidebar.objectsLoading')}</div>}
                                {preferences.objectExplorerGrouped ? objectGroupDefinitions.filter(group => searchTypeEnabled(group.kind) && (!normalizedSearch || sortedObjects.some(object => object.kind === group.kind))).map(group => {
                                  const GroupIcon = group.icon;
                                  const items = sortedObjects.filter(object => object.kind === group.kind);
                                  const groupKey = `${key}:${group.kind}`;
                                  const groupOpen = expandedObjectGroups.has(groupKey) || objectFilterActive;
                                  return (
                                    <div key={group.kind}>
                                      <div className="group flex h-7 items-center gap-1 rounded hover:bg-white/[0.02]" onContextMenu={event => objectGroupMenu(event, server, database.name, group.kind)}>
                                        <button type="button" className="flex h-6 w-6 items-center justify-center" onClick={() => toggle(setExpandedObjectGroups, groupKey)}>
                                          {groupOpen ? <ChevronDown className="h-3 w-3 text-zinc-500" /> : <ChevronRight className="h-3 w-3 text-zinc-700" />}
                                        </button>
                                        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => toggle(setExpandedObjectGroups, groupKey)}>
                                          <GroupIcon className={`h-3 w-3 shrink-0 ${objectKindColor(group.kind)}`} />
                                          <span className="min-w-0 flex-1 truncate text-[9px] font-medium text-zinc-400">{group.label}</span>
                                          <span className="pr-2 text-[8px] tabular-nums text-zinc-600">{items.length}</span>
                                        </button>
                                      </div>
                                      {groupOpen && (
                                        <div className="ml-5 border-l border-zinc-900/80 pl-1">
                                          {items.length ? items.map(object => renderObject(object, GroupIcon)) : <div className="px-2 py-1.5 text-[8px] text-zinc-800">{t('sidebar.noObjects')}</div>}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }) : (
                                  <div className="py-0.5">
                                    {sortedObjects.length ? sortedObjects.map(object => {
                                      const definition = objectGroupDefinitions.find(group => group.kind === object.kind);
                                      return renderObject(object, definition?.icon || FileCode2);
                                    }) : <div className="px-2 py-2 text-[8px] text-zinc-800">{t('sidebar.noObjects')}</div>}
                                  </div>
                                )}
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
            <div className="truncate text-[11px] font-semibold text-zinc-100">{user?.name || t('sidebar.coreorUser')}</div>
            <div className="truncate text-[9px] text-zinc-600">{user?.email || t('sidebar.emailNotShared')}</div>
            <div className={`mt-1 flex items-center gap-1 text-[8px] font-medium ${online ? 'text-emerald-400' : 'text-red-400'}`}>
              {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {online ? t('common.connected') : t('common.offline')}
            </div>
          </div>
          <ChevronDown className={`h-3.5 w-3.5 text-zinc-600 transition ${profileOpen ? 'rotate-180' : ''}`} />
        </button>
        {profileOpen && (
          <div className="absolute bottom-[calc(100%+7px)] left-2 right-2 z-[220] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
            <div className="border-b border-zinc-800 px-3 py-2.5">
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-zinc-500">{t('sidebar.connectionStatus')}</span>
                <span className={online ? 'text-emerald-400' : 'text-red-400'}>{online ? t('sidebar.internetConnected') : t('sidebar.noInternet')}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[9px]">
                <span className="text-zinc-500">{t('sidebar.registeredServers')}</span>
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
              {t('sidebar.openSettings')}
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
              {t('sidebar.newServer')}
            </button>
            <button type="button" className="flex h-9 w-full items-center gap-2 border-t border-zinc-800 px-3 text-[10px] text-red-400 hover:bg-red-500/[0.06]" onClick={() => { setProfileOpen(false); void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().close()); }}>
              <LogOut className="h-3.5 w-3.5" />
              {t('sidebar.closeApplication')}
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
      <RenameDatabaseModal
        state={renameDatabase}
        accountId={workspaceKey}
        onChange={setRenameDatabase}
        onClose={() => setRenameDatabase(null)}
        onRename={async () => {
          if (!renameDatabase || !workspaceKey) return;
          const currentName = renameDatabase.currentName;
          const nextName = renameDatabase.nextName.trim();
          const engine = renameDatabase.server.databaseType || 'mysql';
          const family = databaseEngineFamily(engine);
          const charset = renameDatabase.charset.trim();
          const collation = renameDatabase.collation.trim();
          const nameChanged = nextName !== currentName;
          if (nameChanged && (renameDatabase.server.databases || []).some(database => database.name === nextName)) {
            setRenameDatabase(previous => previous ? { ...previous, error: t('sidebar.renameDatabaseExists', { database: nextName }) } : null);
            return;
          }
          if (charset && !/^[A-Za-z0-9_.-]+$/.test(charset)) { setRenameDatabase(previous => previous ? { ...previous, error: t('sidebar.invalidCharset') } : null); return; }
          if (collation && !/^[A-Za-z0-9_.-]+$/.test(collation)) { setRenameDatabase(previous => previous ? { ...previous, error: t('sidebar.invalidCollation') } : null); return; }
          setRenameDatabase(previous => previous ? { ...previous, busy: true, error: null } : null);
          let activeName = currentName;
          let createdMysqlTarget = false;
          let movedMysqlTables = false;
          try {
            if (nameChanged && family === 'mysql') {
              const catalogDatabase = (renameDatabase.server.databases || []).find(database => database.name === currentName);
              const objects = await fetchDatabaseObjects(renameDatabase.server.id, currentName, workspaceKey, true);
              const catalogViews = (catalogDatabase?.tableDetails || []).filter(table => /VIEW/i.test(table.tableType)).map(table => table.tableName);
              const objectBlocking = objects.objects.filter(object => object.kind !== 'table');
              const blockingKeys = new Set(objectBlocking.map(object => `${object.kind}:${object.name}`));
              const blocking = [...objectBlocking];
              for (const view of catalogViews) {
                const key = `view:${view}`;
                if (!blockingKeys.has(key)) blocking.push({ name: view, kind: 'view' as const });
              }
              if (blocking.length) {
                const kinds = Array.from(new Set(blocking.map(object => object.kind))).join(', ');
                throw new Error(t('sidebar.mysqlRenameBlocked', { count: blocking.length, kinds }));
              }
              const catalogBaseTables = (catalogDatabase?.tableDetails || []).length
                ? (catalogDatabase?.tableDetails || []).filter(table => !/VIEW/i.test(table.tableType)).map(table => table.tableName)
                : (catalogDatabase?.tables || []);
              const tables = Array.from(new Set([
                ...catalogBaseTables,
                ...objects.objects.filter(object => object.kind === 'table').map(object => object.name)
              ]));
              if ((catalogDatabase?.tableCount || 0) > 0 && tables.length === 0) {
                throw new Error(t('sidebar.mysqlRenameCatalogIncomplete'));
              }
              let createSql = `CREATE DATABASE ${quoteDatabaseIdentifier(nextName, engine)}`;
              if (charset) createSql += ` CHARACTER SET ${charset}`;
              if (collation) createSql += ` COLLATE ${collation}`;
              createSql += ';';
              await executeDatabaseQuery(renameDatabase.server.id, createSql, workspaceKey, null);
              createdMysqlTarget = true;
              if (tables.length) {
                const moves = tables.map(table => `${qualifiedDatabaseTable(currentName, table, engine)} TO ${qualifiedDatabaseTable(nextName, table, engine)}`);
                await executeDatabaseQuery(renameDatabase.server.id, `RENAME TABLE ${moves.join(', ')};`, workspaceKey, null);
                movedMysqlTables = true;
              }
              await executeDatabaseQuery(renameDatabase.server.id, `DROP DATABASE ${quoteDatabaseIdentifier(currentName, engine)};`, workspaceKey, null);
              activeName = nextName;
            } else if (nameChanged) {
              const sql = databaseRenameSql(engine, currentName, nextName);
              if (!sql) throw new Error(t('sidebar.renameDatabaseUnsupported', { engine: databaseEngineLabel(engine) }));
              await executeDatabaseQuery(renameDatabase.server.id, sql, workspaceKey, null);
              activeName = nextName;
            }

            if (family === 'mysql' && !nameChanged) {
              let alterSql = `ALTER DATABASE ${quoteDatabaseIdentifier(activeName, engine)}`;
              if (charset) alterSql += ` CHARACTER SET ${charset}`;
              if (collation) alterSql += ` COLLATE ${collation}`;
              if (charset || collation) await executeDatabaseQuery(renameDatabase.server.id, `${alterSql};`, workspaceKey, null);
            } else if (family === 'mssql' && collation) {
              await executeDatabaseQuery(renameDatabase.server.id, `ALTER DATABASE ${quoteDatabaseIdentifier(activeName, engine)} COLLATE ${collation};`, workspaceKey, null);
            }

            if (selectedDatabase === currentName) { onTableSelect(null); onDatabaseSelect(activeName); }
            if (renameDatabase.server.databaseName === currentName && nameChanged) {
              await updateServer({ ...renameDatabase.server, databaseName: activeName });
              setDatabaseObjects(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${renameDatabase.server.id}:`))));
            } else {
              await refreshMetadata(renameDatabase.server, nameChanged ? null : activeName);
            }
            if (nameChanged) {
              setExpandedDatabases(previous => { const next = new Set(previous); next.delete(`${renameDatabase.server.id}:${currentName}`); next.add(`${renameDatabase.server.id}:${activeName}`); return next; });
              setExpandedObjectGroups(previous => {
                const oldPrefix = `${renameDatabase.server.id}:${currentName}:`;
                const newPrefix = `${renameDatabase.server.id}:${activeName}:`;
                return new Set([...previous].map(key => key.startsWith(oldPrefix) ? `${newPrefix}${key.slice(oldPrefix.length)}` : key));
              });
            }
            setRenameDatabase(null);
            toast.show({ variant: 'success', title: t('sidebar.databaseUpdated'), description: nameChanged ? `${currentName} → ${activeName}` : activeName });
          } catch (error) {
            if (family === 'mysql' && nameChanged && createdMysqlTarget && !movedMysqlTables) {
              try { await executeDatabaseQuery(renameDatabase.server.id, `DROP DATABASE ${quoteDatabaseIdentifier(nextName, engine)};`, workspaceKey, null); } catch { /* preserve primary failure */ }
            }
            setRenameDatabase(previous => previous ? { ...previous, busy: false, error: error instanceof Error ? error.message : t('sidebar.renameDatabaseFailed') } : null);
          }
        }}
      />
      <CreateDatabaseModal
        state={createDatabase}
        accountId={workspaceKey}
        onChange={setCreateDatabase}
        onClose={() => setCreateDatabase(null)}
        onCreate={async () => {
          if (!createDatabase || !workspaceKey) return;
          const name = createDatabase.name.trim();
          const engine = createDatabase.server.databaseType || 'mysql';
          const family = databaseEngineFamily(engine);
          const charset = createDatabase.charset.trim();
          const collation = createDatabase.collation.trim();
          const owner = createDatabase.owner.trim();
          if (charset && !/^[A-Za-z0-9_.-]+$/.test(charset)) {
            setCreateDatabase({ ...createDatabase, error: t('sidebar.invalidCharset') });
            return;
          }
          if (collation && !/^[A-Za-z0-9_.-]+$/.test(collation)) {
            setCreateDatabase({ ...createDatabase, error: t('sidebar.invalidCollation') });
            return;
          }

          let createSql = `CREATE DATABASE ${quoteDatabaseIdentifier(name, engine)}`;
          if (family === 'mysql') {
            if (charset) createSql += ` CHARACTER SET ${charset}`;
            if (collation) createSql += ` COLLATE ${collation}`;
          } else if (family === 'postgresql' && engine !== 'cockroachdb') {
            if (owner) createSql += ` OWNER ${quoteDatabaseIdentifier(owner, engine)}`;
            createSql += ` ENCODING '${charset || 'UTF8'}'`;
          } else if (family === 'mssql' && collation) {
            createSql += ` COLLATE ${collation}`;
          }
          createSql += ';';

          setCreateDatabase({ ...createDatabase, busy: true, error: null });
          try {
            await executeDatabaseQuery(createDatabase.server.id, createSql, workspaceKey, null);
            await refreshServer(createDatabase.server);
            setCreateDatabase(null);
          } catch (error) {
            setCreateDatabase(previous => (previous ? { ...previous, busy: false, error: error instanceof Error ? error.message : t('sidebar.createDatabaseFailed') } : null));
          }
        }}
      />
    </aside>
  );
}
