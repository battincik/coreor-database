'use client';

import type {
  DatabaseApiAction,
  DatabaseCatalogItem,
  DatabaseConnectionPayload,
  DatabaseQueryMeta,
  DatabaseQueryStatement,
  DatabaseServerConfig,
  QueryExecutionResult,
  SchemaOverviewResponse,
  TableCellUpdateInput,
  TableCellUpdateResponse,
  TableRowInsertInput,
  TableRowInsertResponse,
  TableDataFilter,
  TableDataResponse,
  TableDataSort,
  TableInfo,
  TableRowsDeleteInput,
  TableRowsDeleteResponse,
  TableSchemaMutationInput,
  TableSchemaMutationResponse
} from 'types';
import { readLocalServerProfiles, writeLocalServerProfiles } from '@/lib/localProfiles';
import { recordActivity } from '@/lib/activityConsole';
import { databaseEngineDefinition, databaseEngineLabel } from '@/lib/databaseEngines';
import { desktopDatabaseRequest } from '@/lib/desktopClient';

let profileMutationQueue: Promise<void> = Promise.resolve();
const inFlightControllers = new Map<string, AbortController>();
const tableInfoCache = new Map<string, { expiresAt: number; value: TableInfo }>();
const tableInfoRequests = new Map<string, Promise<TableInfo>>();
const TABLE_INFO_CACHE_MS = 15_000;

export interface DatabaseServerCatalogItem extends DatabaseServerConfig {
  databases: DatabaseCatalogItem[];
}

interface DatabaseErrorPayload {
  error?: string;
  message?: string;
  _meta?: DatabaseQueryMeta;
}

interface ProfileMutationResult<T> {
  servers: DatabaseServerConfig[];
  result: T;
}

interface DatabaseRequestError extends Error {
  code?: string;
  queryMeta?: DatabaseQueryMeta;
}

interface RequestOptions {
  requestKey?: string;
  connectionDatabase?: string | null;
}

export interface FetchTableDataOptions {
  page?: number;
  pageSize?: number;
  sorts?: TableDataSort[];
  filters?: TableDataFilter[];
  includeTotal?: boolean;
  knownTotalRows?: number;
}

const ACTION_TITLES: Record<DatabaseApiAction, string> = {
  test: 'Bağlantı testi',
  catalog: 'Veritabanı kataloğu',
  'table-info': 'Tablo yapısı',
  'schema-overview': 'Şema metadata',
  'table-data': 'Tablo verileri',
  'update-cell': 'Hücre güncelleme',
  'insert-row': 'Satır ekleme',
  'delete-rows': 'Satır silme',
  'alter-table': 'Tablo yapısını değiştirme',
  query: 'SQL sorgusu'
};

function createServerId() {
  if (typeof window !== 'undefined' && 'randomUUID' in window.crypto) return window.crypto.randomUUID();
  return `server-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createConnectionPayload(server: DatabaseServerConfig, databaseOverride?: string | null): DatabaseConnectionPayload {
  const engine = server.databaseType ?? 'mysql';
  const definition = databaseEngineDefinition(engine);
  if (!server.host?.trim() || !server.username?.trim() || !server.password) {
    throw new Error('Host, kullanıcı adı ve parola eksik.');
  }
  return {
    engine,
    host: server.host.trim(),
    port: server.port ?? definition.defaultPort,
    username: server.username.trim(),
    password: server.password,
    database: databaseOverride === undefined ? server.databaseName?.trim() || undefined : databaseOverride,
    sslMode: server.sslMode ?? 'preferred',
    connectTimeoutMs: server.connectionTimeoutMs ?? 20_000,
    readOnly: Boolean(server.readOnly)
  };
}

function fallbackStatements(action: DatabaseApiAction, payload: Record<string, unknown>, server: DatabaseServerConfig): DatabaseQueryStatement[] {
  const engine = databaseEngineLabel(server.databaseType);
  const database = String(payload.database || 'sunucu geneli');
  const table = String(payload.table || 'tablo');
  if (action === 'test') return [{ label: 'Bağlantı testi', sql: `/* ${engine} bağlantı testi */ SELECT version` }];
  if (action === 'catalog') return [{ label: 'Ayrıntılı katalog', sql: `/* ${engine} katalog sorguları */` }];
  if (action === 'table-info') return [{ label: 'Tablo yapısı', sql: `/* ${engine} */ DESCRIBE ${database}.${table}` }];
  if (action === 'schema-overview') return [{ label: 'Şema metadata', sql: `/* ${engine} */ information_schema metadata for ${database}` }];
  if (action === 'table-data') return [{ label: 'Tablo satırları', sql: `SELECT * FROM ${database}.${table}` }];
  if (action === 'update-cell') return [{ label: 'Hücre güncelleme', sql: `UPDATE ${database}.${table} SET ${String(payload.column || 'column')} = ? WHERE <primary-key>` }];
  if (action === 'insert-row') return [{ label: 'Satır ekleme', sql: `INSERT INTO ${database}.${table} (...) VALUES (...)` }];
  if (action === 'delete-rows') return [{ label: 'Seçili satırları sil', sql: `DELETE FROM ${database}.${table} WHERE <primary-key>` }];
  if (action === 'alter-table') return [{ label: 'Tablo yapısını değiştir', sql: `ALTER TABLE ${database}.${table} <validated-operation>` }];
  return [{ label: 'SQL editörü sorgusu', sql: String(payload.sql || '') }];
}

function resultMetrics(action: DatabaseApiAction, result: unknown) {
  const payload = result as { databases?: unknown[]; columns?: unknown[]; data?: unknown[]; rows?: unknown[]; affectedRows?: number; tableInfo?: { columns?: unknown[] } } | null;
  if (!payload) return {};
  if (action === 'catalog') return { rowCount: payload.databases?.length };
  if (action === 'table-info') return { rowCount: payload.columns?.length };
  if (action === 'schema-overview') return { rowCount: payload.columns?.length };
  if (action === 'table-data') return { rowCount: payload.data?.length };
  if (action === 'alter-table') return { rowCount: payload.tableInfo?.columns?.length };
  if (action === 'update-cell' || action === 'insert-row' || action === 'delete-rows') return { affectedRows: payload.affectedRows };
  if (action === 'query') return { rowCount: payload.rows?.length, affectedRows: payload.affectedRows };
  return {};
}

function recordStatements(options: {
  statements: DatabaseQueryStatement[];
  action: DatabaseApiAction;
  level: 'success' | 'error';
  server: DatabaseServerConfig;
  databaseName?: string;
  tableName?: string;
  durationMs: number;
  result?: unknown;
  error?: DatabaseRequestError;
}) {
  const metrics = options.result ? resultMetrics(options.action, options.result) : {};
  options.statements.forEach((statement, index) => {
    const isLast = index === options.statements.length - 1;
    recordActivity({
      level: options.level,
      title: statement.label || ACTION_TITLES[options.action],
      message: options.level === 'error' ? options.error?.message || 'Sorgu başarısız oldu.' : `${options.server.name} üzerinde başarıyla çalıştırıldı.`,
      serverId: options.server.id,
      serverName: options.server.name,
      host: options.server.host,
      databaseName: options.databaseName,
      tableName: options.tableName,
      sql: statement.sql,
      parameters: statement.parameters,
      durationMs: isLast ? options.durationMs : undefined,
      rowCount: isLast ? metrics.rowCount : undefined,
      affectedRows: isLast ? metrics.affectedRows : undefined,
      errorCode: options.error?.code
    });
  });
}

async function requestDatabaseApi<T>(
  server: DatabaseServerConfig,
  action: DatabaseApiAction,
  payload: Record<string, unknown> = {},
  options: RequestOptions = {}
) {
  if (options.requestKey) inFlightControllers.get(options.requestKey)?.abort();
  const controller = new AbortController();
  if (options.requestKey) inFlightControllers.set(options.requestKey, controller);
  const timeoutMs = Math.min(Math.max(server.connectionTimeoutMs ?? 20_000, 3_000), 120_000);
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs + 5_000);
  const startedAt = performance.now();
  const databaseName = typeof payload.database === 'string' ? payload.database : undefined;
  const tableName = typeof payload.table === 'string' ? payload.table : undefined;

  try {
    const result = await desktopDatabaseRequest<T>({ action, connection: createConnectionPayload(server, options.connectionDatabase), ...payload });
    const queryMeta = (result as { _meta?: DatabaseQueryMeta } | null)?._meta;
    recordStatements({
      statements: queryMeta?.statements?.length ? queryMeta.statements : fallbackStatements(action, payload, server),
      action, level: 'success', server, databaseName, tableName,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)), result
    });
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const aborted = new Error('Önceki tablo isteği daha güncel bir istek tarafından iptal edildi.') as DatabaseRequestError;
      aborted.code = 'REQUEST_SUPERSEDED';
      throw aborted;
    }
    const normalizedError = error instanceof TypeError
      ? Object.assign(new Error('Yerel veritabanı köprüsü erişilemedi. Uygulama sunucusunu ve ağ erişimini kontrol edin.'), { code: 'DATABASE_API_UNREACHABLE' }) as DatabaseRequestError
      : error instanceof Error ? error as DatabaseRequestError : new Error('Bilinmeyen veritabanı hatası.') as DatabaseRequestError;
    recordStatements({
      statements: normalizedError.queryMeta?.statements?.length ? normalizedError.queryMeta.statements : fallbackStatements(action, payload, server),
      action, level: 'error', server, databaseName, tableName,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)), error: normalizedError
    });
    throw normalizedError;
  } finally {
    window.clearTimeout(timeout);
    if (options.requestKey && inFlightControllers.get(options.requestKey) === controller) inFlightControllers.delete(options.requestKey);
  }
}

async function requireServer(accountId: string | null | undefined, serverId: string) {
  const servers = await readLocalServerProfiles();
  const server = servers.find(item => item.id === serverId);
  if (!server) throw new Error('Sunucu profili yerel config içinde bulunamadı.');
  return server;
}

async function mutateServerProfiles<T>(mutation: (servers: DatabaseServerConfig[]) => ProfileMutationResult<T>) {
  let mutationResult!: T;
  const currentMutation = profileMutationQueue.catch(() => undefined).then(async () => {
    const currentServers = await readLocalServerProfiles();
    const nextState = mutation(currentServers);
    mutationResult = nextState.result;
    await writeLocalServerProfiles(nextState.servers);
  });
  profileMutationQueue = currentMutation;
  await currentMutation;
  return mutationResult;
}

async function updateCachedDatabases(serverId: string, databases: DatabaseCatalogItem[]) {
  await mutateServerProfiles(servers => ({
    servers: servers.map(server => server.id === serverId ? { ...server, databases, updatedAt: new Date().toISOString() } : server),
    result: undefined
  }));
}

export async function fetchDatabaseServers(accountId?: string | null) {
  return await readLocalServerProfiles() as DatabaseServerCatalogItem[];
}

export async function createDatabaseServer(server: DatabaseServerConfig, accountId?: string | null) {
  const now = new Date().toISOString();
  const engine = server.databaseType ?? 'mysql';
  const definition = databaseEngineDefinition(engine);
  const nextServer: DatabaseServerConfig = {
    id: server.id || createServerId(),
    name: server.name.trim(),
    databaseType: engine,
    version: server.version || definition.defaultVersion,
    host: server.host?.trim(),
    port: server.port ?? definition.defaultPort,
    username: server.username?.trim(),
    password: server.password,
    databaseName: server.databaseName?.trim(),
    sslMode: server.sslMode ?? 'preferred',
    connectionTimeoutMs: server.connectionTimeoutMs ?? 20_000,
    readOnly: Boolean(server.readOnly),
    visibleTo: server.visibleTo ?? [],
    organizationId: server.organizationId ?? null,
    databases: server.databases ?? [],
    createdAt: server.createdAt ?? now,
    updatedAt: now
  };
  return mutateServerProfiles(servers => {
    const existingIndex = servers.findIndex(item => item.id === nextServer.id);
    const nextServers = [...servers];
    if (existingIndex >= 0) nextServers[existingIndex] = nextServer; else nextServers.push(nextServer);
    return { servers: nextServers, result: nextServer };
  });
}

export async function deleteDatabaseServer(serverId: string, accountId?: string | null) {
  return mutateServerProfiles(servers => {
    const existing = servers.find(server => server.id === serverId);
    if (!existing) throw new Error('Silinecek bağlantı profili bulunamadı.');
    return { servers: servers.filter(server => server.id !== serverId), result: existing };
  });
}

export async function testDatabaseConnection(server: DatabaseServerConfig) {
  const port = server.port ?? databaseEngineDefinition(server.databaseType).defaultPort;
  return requestDatabaseApi<{ connection: { version?: string; databaseName?: string | null; currentUser?: string }; _meta?: DatabaseQueryMeta }>(server, 'test', {}, { requestKey: `connection-test:${server.host}:${port}` });
}

export async function testStoredDatabaseConnection(serverId: string, accountId?: string | null) {
  return testDatabaseConnection(await requireServer(accountId, serverId));
}

export async function fetchServerTables(serverId: string, accountId?: string | null) {
  const server = await requireServer(accountId, serverId);
  const response = await requestDatabaseApi<{ databases: DatabaseCatalogItem[]; _meta?: DatabaseQueryMeta }>(server, 'catalog', {}, { requestKey: `catalog:${serverId}` });
  if (!Array.isArray(response?.databases)) throw new Error('Yerel veritabanı köprüsü katalog yanıtı geçersiz.');
  await updateCachedDatabases(serverId, response.databases);
  return { serverId, databases: response.databases };
}

export async function fetchTableInfo(serverId: string, databaseName: string, tableName: string, accountId?: string | null) {
  const key = `${serverId}:${databaseName}:${tableName}`;
  const cached = tableInfoCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = tableInfoRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    const server = await requireServer(accountId, serverId);
    const value = await requestDatabaseApi<TableInfo>(server, 'table-info', { database: databaseName, table: tableName }, { requestKey: `table-info:${key}`, connectionDatabase: databaseName });
    tableInfoCache.set(key, { expiresAt: Date.now() + TABLE_INFO_CACHE_MS, value });
    return value;
  })().finally(() => tableInfoRequests.delete(key));
  tableInfoRequests.set(key, request);
  return request;
}

export async function fetchSchemaOverview(serverId: string, databaseName: string, accountId?: string | null) {
  const server = await requireServer(accountId, serverId);
  return requestDatabaseApi<SchemaOverviewResponse>(server, 'schema-overview', { database: databaseName }, { requestKey: `schema-overview:${serverId}:${databaseName}`, connectionDatabase: databaseName });
}

export async function fetchTableData(serverId: string, databaseName: string, tableName: string, accountId?: string | null, options: FetchTableDataOptions = {}) {
  const server = await requireServer(accountId, serverId);
  return requestDatabaseApi<TableDataResponse>(server, 'table-data', {
    database: databaseName, table: tableName, page: options.page ?? 1, pageSize: options.pageSize ?? 50,
    sorts: options.sorts ?? [], filters: options.filters ?? [], includeTotal: options.includeTotal ?? true,
    knownTotalRows: options.knownTotalRows
  }, { requestKey: `table-data:${serverId}:${databaseName}:${tableName}`, connectionDatabase: databaseName });
}

export async function updateTableCell(serverId: string, input: TableCellUpdateInput, accountId?: string | null) {
  return requestDatabaseApi<TableCellUpdateResponse>(await requireServer(accountId, serverId), 'update-cell', input as unknown as Record<string, unknown>, { connectionDatabase: input.database });
}

export async function insertTableRow(serverId: string, input: TableRowInsertInput, accountId?: string | null) {
  return requestDatabaseApi<TableRowInsertResponse>(await requireServer(accountId, serverId), 'insert-row', input as unknown as Record<string, unknown>, { connectionDatabase: input.database });
}

export async function deleteTableRows(serverId: string, input: TableRowsDeleteInput, accountId?: string | null) {
  return requestDatabaseApi<TableRowsDeleteResponse>(await requireServer(accountId, serverId), 'delete-rows', input as unknown as Record<string, unknown>, { connectionDatabase: input.database });
}

export async function mutateTableSchema(serverId: string, input: TableSchemaMutationInput, accountId?: string | null) {
  const result = await requestDatabaseApi<TableSchemaMutationResponse>(await requireServer(accountId, serverId), 'alter-table', input as unknown as Record<string, unknown>, { connectionDatabase: input.database });
  tableInfoCache.delete(`${serverId}:${input.database}:${input.table}`);
  return result;
}

export async function executeDatabaseQuery(serverId: string, sql: string, accountId?: string | null, databaseName?: string | null) {
  const server = await requireServer(accountId, serverId);
  if (!sql.trim()) throw new Error('Çalıştırılacak SQL sorgusu boş olamaz.');
  const selectedDatabase = databaseName === undefined ? server.databaseName || undefined : databaseName;
  return requestDatabaseApi<QueryExecutionResult>(server, 'query', { database: selectedDatabase, sql }, { connectionDatabase: selectedDatabase });
}
