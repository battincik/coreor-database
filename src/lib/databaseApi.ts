'use client';

import type {
  DatabaseApiAction,
  DatabaseCatalogItem,
  DatabaseConnectionPayload,
  DatabaseQueryMeta,
  DatabaseQueryStatement,
  DatabaseQueryExecutionMode,
  DatabaseObjectsResponse,
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
import { mutateLocalServerProfiles, readLocalServerProfiles } from '@/lib/localProfiles';
import { recordActivity } from '@/lib/activityConsole';
import { databaseEngineDefinition, databaseEngineLabel } from '@/lib/databaseEngines';
import { desktopDatabaseRequest } from '@/lib/desktopClient';
import { normalizeDatabaseClientError } from '@/lib/databaseErrorPresentation';
import { translateRuntime } from '@/lib/i18nRuntime';

const inFlightControllers = new Map<string, AbortController>();
const tableInfoCache = new Map<string, { expiresAt: number; value: TableInfo }>();
const tableInfoRequests = new Map<string, Promise<TableInfo>>();
const tableDataRequests = new Map<string, Promise<TableDataResponse>>();
const TABLE_INFO_CACHE_MS = 15_000;
const databaseObjectsCache = new Map<string, { expiresAt: number; value: DatabaseObjectsResponse }>();
const DATABASE_OBJECTS_CACHE_MS = 30_000;

export interface DatabaseServerCatalogItem extends DatabaseServerConfig {
  databases: DatabaseCatalogItem[];
}

interface ProfileMutationResult<T> {
  servers: DatabaseServerConfig[];
  result: T;
}

interface DatabaseRequestError extends Error {
  code?: string;
  queryMeta?: DatabaseQueryMeta;
}

export interface DatabaseQueryExecutionContext {
  statementStartLine?: number;
  statementIndex?: number;
  statementCount?: number;
  executionMode?: DatabaseQueryExecutionMode;
  resultLimit?: number;
  activityOrigin?: 'user' | 'internal';
}

interface RequestOptions {
  requestKey?: string;
  connectionDatabase?: string | null;
  executionContext?: DatabaseQueryExecutionContext;
}

export interface FetchTableDataOptions {
  page?: number;
  pageSize?: number;
  sorts?: TableDataSort[];
  filters?: TableDataFilter[];
  includeTotal?: boolean;
  knownTotalRows?: number;
}

const ACTION_TITLE_KEYS: Record<DatabaseApiAction, string> = {
  test: 'apiErrors.connectionTest',
  catalog: 'apiErrors.detailedCatalog',
  'table-info': 'apiErrors.tableStructure',
  'schema-overview': 'apiErrors.schemaMetadata',
  'database-objects': 'apiErrors.objectExplorer',
  'table-data': 'apiErrors.tableRows',
  'update-cell': 'apiErrors.cellUpdate',
  'insert-row': 'apiErrors.rowInsert',
  'delete-rows': 'apiErrors.rowDelete',
  'alter-table': 'apiErrors.alterTable',
  query: 'apiErrors.queryEditor'
};

function actionTitle(action: DatabaseApiAction) {
  return translateRuntime(ACTION_TITLE_KEYS[action]);
}

function createServerId() {
  if (typeof window !== 'undefined' && 'randomUUID' in window.crypto) return window.crypto.randomUUID();
  return `server-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createConnectionPayload(server: DatabaseServerConfig, databaseOverride?: string | null): DatabaseConnectionPayload {
  const engine = server.databaseType ?? 'mysql';
  const definition = databaseEngineDefinition(engine);
  if (!server.host?.trim() || !server.username?.trim()) {
    throw new Error(translateRuntime('apiErrors.hostOrUsernameMissing'));
  }
  return {
    serverId: server.id,
    engine,
    host: server.host.trim(),
    port: server.port ?? definition.defaultPort,
    username: server.username.trim(),
    password: server.password || undefined,
    database: databaseOverride === undefined ? server.databaseName?.trim() || undefined : databaseOverride,
    sslMode: server.sslMode ?? 'preferred',
    connectTimeoutMs: server.connectionTimeoutMs ?? 20_000,
    poolMaxConnections: Math.min(
      32,
      Math.max(1, server.poolMaxConnections ?? 6),
      Math.max(1, server.serverMaxConnections ?? 32)
    ),
    readOnly: Boolean(server.readOnly)
  };
}

function fallbackStatements(action: DatabaseApiAction, payload: Record<string, unknown>, server: DatabaseServerConfig): DatabaseQueryStatement[] {
  const engine = databaseEngineLabel(server.databaseType);
  const database = String(payload.database || translateRuntime('query.serverScope'));
  const table = String(payload.table || translateRuntime('database.table').toLocaleLowerCase());
  const label = actionTitle(action);
  if (action === 'test') return [{ label, sql: `/* ${engine} ${translateRuntime('apiErrors.connectionTest').toLocaleLowerCase()} */ SELECT version` }];
  if (action === 'catalog') return [{ label, sql: `/* ${engine} ${translateRuntime('apiErrors.catalogQueries').toLocaleLowerCase()} */` }];
  if (action === 'table-info') return [{ label, sql: `/* ${engine} */ DESCRIBE ${database}.${table}` }];
  if (action === 'schema-overview') return [{ label, sql: `/* ${engine} */ information_schema metadata for ${database}` }];
  if (action === 'database-objects') return [{ label, sql: `/* ${engine} */ database objects for ${database}` }];
  if (action === 'table-data') return [{ label, sql: `SELECT * FROM ${database}.${table}` }];
  if (action === 'update-cell') return [{ label, sql: `UPDATE ${database}.${table} SET ${String(payload.column || 'column')} = ? WHERE <primary-key>` }];
  if (action === 'insert-row') return [{ label, sql: `INSERT INTO ${database}.${table} (...) VALUES (...)` }];
  if (action === 'delete-rows') return [{ label, sql: `DELETE FROM ${database}.${table} WHERE <primary-key>` }];
  if (action === 'alter-table') return [{ label, sql: `ALTER TABLE ${database}.${table} <validated-operation>` }];
  return [{ label, sql: String(payload.sql || '') }];
}

function resultMetrics(action: DatabaseApiAction, result: unknown) {
  const payload = result as { databases?: unknown[]; columns?: unknown[]; data?: unknown[]; rows?: unknown[]; affectedRows?: number; tableInfo?: { columns?: unknown[] } } | null;
  if (!payload) return {};
  if (action === 'catalog') return { rowCount: payload.databases?.length };
  if (action === 'table-info') return { rowCount: payload.columns?.length };
  if (action === 'schema-overview') return { rowCount: payload.columns?.length };
  if (action === 'database-objects') return { rowCount: (payload as { objects?: unknown[] }).objects?.length };
  if (action === 'table-data') return { rowCount: payload.data?.length };
  if (action === 'alter-table') return { rowCount: payload.tableInfo?.columns?.length };
  if (action === 'update-cell' || action === 'insert-row' || action === 'delete-rows') return { affectedRows: payload.affectedRows };
  if (action === 'query') return { rowCount: payload.rows?.length, affectedRows: payload.affectedRows };
  return {};
}

function enrichClientTimings(result: unknown, totalMs: number) {
  if (!result || typeof result !== 'object') return;
  const payload = result as { timings?: QueryExecutionResult['timings'] };
  if (!payload.timings) return;
  const nativeTotalMs = typeof payload.timings.nativeTotalMs === 'number' ? payload.timings.nativeTotalMs : totalMs;
  payload.timings = {
    ...payload.timings,
    totalMs,
    clientOverheadMs: Math.max(0, totalMs - nativeTotalMs)
  };
}

function inferSqlErrorLocation(message: string | undefined, sql: string) {
  if (!message) return {} as { line?: number; column?: number };
  const direct = /\bline\s+(\d+)(?:\s*[,;:]?\s*(?:column|col)\s+(\d+))?/i.exec(message);
  if (direct) return { line: Number(direct[1]), column: direct[2] ? Number(direct[2]) : undefined };
  const position = /\bposition\s*[:=]?\s*(\d+)\b/i.exec(message);
  if (!position) return {} as { line?: number; column?: number };
  const offset = Math.max(0, Math.min(sql.length, Number(position[1]) - 1));
  const prefix = sql.slice(0, offset);
  const lastNewline = prefix.lastIndexOf('\n');
  return {
    line: prefix.split('\n').length,
    column: offset - lastNewline
  };
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
  executionContext?: DatabaseQueryExecutionContext;
}) {
  const metrics = options.result ? resultMetrics(options.action, options.result) : {};
  options.statements.forEach((statement, index) => {
    const isLast = index === options.statements.length - 1;
    const location = options.level === 'error' ? inferSqlErrorLocation(options.error?.message, statement.sql) : {};
    const statementStartLine = options.executionContext?.statementStartLine;
    const errorLine = location.line
      ? statementStartLine
        ? statementStartLine + location.line - 1
        : location.line
      : undefined;
    const resultTimings = isLast && options.action === 'query'
      ? (options.result as QueryExecutionResult | undefined)?.timings
      : undefined;
    recordActivity({
      level: options.level,
      kind: options.level === 'error'
        ? 'error'
        : options.action === 'query' && options.executionContext?.activityOrigin === 'user'
          ? 'user-query'
          : 'internal-query',
      category: options.action === 'query' ? 'query' : undefined,
      title: statement.label || actionTitle(options.action),
      message: options.level === 'error' ? options.error?.message || translateRuntime('apiErrors.queryFailed') : translateRuntime('apiErrors.executedSuccessfully',{server:options.server.name}),
      serverId: options.server.id,
      serverName: options.server.name,
      host: options.server.host,
      databaseName: options.databaseName,
      tableName: options.tableName,
      sql: statement.sql,
      parameters: statement.parameters,
      durationMs: isLast ? options.durationMs : undefined,
      timings: resultTimings,
      rowCount: isLast ? metrics.rowCount : undefined,
      affectedRows: isLast ? metrics.affectedRows : undefined,
      errorCode: options.error?.code,
      statementStartLine,
      errorLine,
      errorColumn: location.column,
      statementIndex: options.executionContext?.statementIndex,
      statementCount: options.executionContext?.statementCount
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
    const durationMs = Math.max(0, performance.now() - startedAt);
    enrichClientTimings(result, durationMs);
    const queryMeta = (result as { _meta?: DatabaseQueryMeta } | null)?._meta;
    recordStatements({
      statements: queryMeta?.statements?.length ? queryMeta.statements : fallbackStatements(action, payload, server),
      action, level: 'success', server, databaseName, tableName,
      durationMs: Math.round(durationMs), result,
      executionContext: options.executionContext
    });
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const aborted = new Error(translateRuntime('apiErrors.requestSuperseded')) as DatabaseRequestError;
      aborted.code = 'REQUEST_SUPERSEDED';
      throw aborted;
    }
    const normalized = normalizeDatabaseClientError(error);
    const normalizedError = Object.assign(new Error(normalized.message), {
      code: normalized.code,
      status: normalized.status,
      retryable: normalized.retryable
    }) as DatabaseRequestError;
    recordStatements({
      statements: normalizedError.queryMeta?.statements?.length ? normalizedError.queryMeta.statements : fallbackStatements(action, payload, server),
      action, level: 'error', server, databaseName, tableName,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)), error: normalizedError,
      executionContext: options.executionContext
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
  if (!server) throw new Error(translateRuntime('apiErrors.serverProfileNotFound'));
  return server;
}

async function mutateServerProfiles<T>(mutation: (servers: DatabaseServerConfig[]) => ProfileMutationResult<T>) {
  return mutateLocalServerProfiles(mutation);
}

function mergeMeasuredStorage(previous: DatabaseCatalogItem | undefined, incoming: DatabaseCatalogItem): DatabaseCatalogItem {
  if (!previous) return incoming;

  const previousTables = new Map((previous.tableDetails || []).map(table => [table.tableName, table]));
  const tableDetails = (incoming.tableDetails || []).map(table => {
    const measured = previousTables.get(table.tableName);
    if (!measured?.storageMeasuredAt) return table;
    return {
      ...table,
      rows: measured.rows,
      sizeMB: measured.sizeMB,
      dataSizeMB: measured.dataSizeMB,
      indexSizeMB: measured.indexSizeMB,
      freeSizeMB: measured.freeSizeMB,
      storageMeasuredAt: measured.storageMeasuredAt,
      storageMeasurementSource: measured.storageMeasurementSource,
      storagePhysicalBytes: measured.storagePhysicalBytes,
      rowCountMeasuredAt: measured.rowCountMeasuredAt,
      rowCountMeasurementSource: measured.rowCountMeasurementSource
    };
  });

  const merged: DatabaseCatalogItem = { ...incoming, tableDetails };
  if (previous.storageMeasuredAt) {
    merged.totalRows = previous.totalRows;
    merged.dataSizeMB = previous.dataSizeMB;
    merged.indexSizeMB = previous.indexSizeMB;
    merged.totalSizeMB = previous.totalSizeMB;
    merged.freeSizeMB = previous.freeSizeMB;
    merged.storageMeasuredAt = previous.storageMeasuredAt;
    merged.storageMeasurementSource = previous.storageMeasurementSource;
    merged.storagePhysicalBytes = previous.storagePhysicalBytes;
    merged.rowCountMeasuredAt = previous.rowCountMeasuredAt;
    merged.rowCountMeasurementSource = previous.rowCountMeasurementSource;
  }
  return merged;
}

async function updateCachedDatabases(serverId: string, databases: DatabaseCatalogItem[]) {
  return mutateServerProfiles(servers => {
    let mergedDatabases = databases;
    const nextServers = servers.map(server => {
      if (server.id !== serverId) return server;
      const previous = new Map((server.databases || []).map(database => [database.name, database]));
      mergedDatabases = databases.map(database => mergeMeasuredStorage(previous.get(database.name), database));
      return { ...server, databases: mergedDatabases, updatedAt: new Date().toISOString() };
    });
    return { servers: nextServers, result: mergedDatabases };
  });
}

export async function fetchDatabaseServers(accountId?: string | null) {
  void accountId;
  return await readLocalServerProfiles() as DatabaseServerCatalogItem[];
}

export async function createDatabaseServer(server: DatabaseServerConfig, accountId?: string | null) {
  void accountId;
  if (!server.connectionTestedAt) throw new Error(translateRuntime('server.connectionTestRequired'));
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
    poolMaxConnections: Math.min(32, Math.max(1, server.poolMaxConnections ?? 6), Math.max(1, server.serverMaxConnections ?? 32)),
    serverMaxConnections: server.serverMaxConnections,
    connectionTestedAt: server.connectionTestedAt,
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
  void accountId;
  return mutateServerProfiles(servers => {
    const existing = servers.find(server => server.id === serverId);
    if (!existing) throw new Error('Silinecek bağlantı profili bulunamadı.');
    return { servers: servers.filter(server => server.id !== serverId), result: existing };
  });
}

export async function testDatabaseConnection(server: DatabaseServerConfig) {
  const port = server.port ?? databaseEngineDefinition(server.databaseType).defaultPort;
  return requestDatabaseApi<{ connection: { version?: string; databaseName?: string | null; currentUser?: string; maxConnections?: number | null }; _meta?: DatabaseQueryMeta }>(server, 'test', {}, { requestKey: `connection-test:${server.host}:${port}` });
}

export async function testStoredDatabaseConnection(serverId: string, accountId?: string | null) {
  return testDatabaseConnection(await requireServer(accountId, serverId));
}

export async function fetchServerTables(serverId: string, accountId?: string | null) {
  const server = await requireServer(accountId, serverId);
  const response = await requestDatabaseApi<{ databases: DatabaseCatalogItem[]; _meta?: DatabaseQueryMeta }>(server, 'catalog', {}, { requestKey: `catalog:${serverId}` });
  if (!Array.isArray(response?.databases)) throw new Error('Yerel veritabanı köprüsü katalog yanıtı geçersiz.');
  for (const key of databaseObjectsCache.keys()) if (key.startsWith(`${serverId}:`)) databaseObjectsCache.delete(key);
  const databases = await updateCachedDatabases(serverId, response.databases);
  return { serverId, databases };
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

function mbToBytes(value: string | number | null | undefined) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric * 1048576)) : 0;
}

function mergeMeasuredObjectMetadata(
  server: DatabaseServerConfig,
  databaseName: string,
  response: DatabaseObjectsResponse
): DatabaseObjectsResponse {
  const database = (server.databases || []).find(item => item.name === databaseName);
  if (!database?.tableDetails?.length) return response;
  const measured = new Map(
    database.tableDetails
      .filter(table => Boolean(table.storageMeasuredAt))
      .map(table => [table.tableName, table])
  );
  if (!measured.size) return response;

  return {
    ...response,
    objects: response.objects.map(object => {
      if (object.kind !== 'table') return object;
      const detail = measured.get(object.name);
      if (!detail) return object;
      return {
        ...object,
        rows: detail.rows,
        dataSizeBytes: mbToBytes(detail.dataSizeMB),
        indexSizeBytes: mbToBytes(detail.indexSizeMB),
        sizeBytes: mbToBytes(detail.sizeMB)
      };
    })
  };
}

export async function fetchDatabaseObjects(serverId: string, databaseName: string, accountId?: string | null, force = false) {
  const key = `${serverId}:${databaseName}`;
  const cached = databaseObjectsCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  const server = await requireServer(accountId, serverId);
  const raw = await requestDatabaseApi<DatabaseObjectsResponse>(server, 'database-objects', { database: databaseName }, { requestKey: `database-objects:${key}`, connectionDatabase: databaseName });
  const value = mergeMeasuredObjectMetadata(server, databaseName, raw);
  databaseObjectsCache.set(key, { expiresAt: Date.now() + DATABASE_OBJECTS_CACHE_MS, value });
  return value;
}

export async function fetchTableData(serverId: string, databaseName: string, tableName: string, accountId?: string | null, options: FetchTableDataOptions = {}) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 100;
  const sorts = options.sorts ?? [];
  const filters = options.filters ?? [];
  const includeTotal = options.includeTotal ?? true;
  const requestIdentity = JSON.stringify([
    serverId, databaseName, tableName, page, pageSize, sorts, filters, includeTotal, options.knownTotalRows ?? null
  ]);
  const pending = tableDataRequests.get(requestIdentity);
  if (pending) return pending;

  const request = (async () => {
    const server = await requireServer(accountId, serverId);
    return requestDatabaseApi<TableDataResponse>(server, 'table-data', {
      database: databaseName,
      table: tableName,
      page,
      pageSize,
      sorts,
      filters,
      includeTotal,
      knownTotalRows: options.knownTotalRows
    }, {
      requestKey: `table-data:${requestIdentity}`,
      connectionDatabase: databaseName
    });
  })().finally(() => tableDataRequests.delete(requestIdentity));

  tableDataRequests.set(requestIdentity, request);
  return request;
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

export async function executeDatabaseQuery(
  serverId: string,
  sql: string,
  accountId?: string | null,
  databaseName?: string | null,
  executionContext?: DatabaseQueryExecutionContext
) {
  const server = await requireServer(accountId, serverId);
  if (!sql.trim()) throw new Error('Çalıştırılacak SQL sorgusu boş olamaz.');
  const selectedDatabase = databaseName === undefined ? server.databaseName || undefined : databaseName;
  return requestDatabaseApi<QueryExecutionResult>(
    server,
    'query',
    {
      database: selectedDatabase,
      sql,
      executionMode: executionContext?.executionMode ?? 'text',
      resultLimit: executionContext?.resultLimit
    },
    { connectionDatabase: selectedDatabase, executionContext }
  );
}
