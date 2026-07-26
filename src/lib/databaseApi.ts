'use client';

import type {
  DatabaseApiAction,
  DatabaseCatalogItem,
  DatabaseConnectionPayload,
  DatabaseQueryMeta,
  DatabaseQueryStatement,
  DatabaseServerConfig,
  QueryExecutionResult,
  TableCellUpdateInput,
  TableCellUpdateResponse,
  TableDataFilter,
  TableDataResponse,
  TableDataSort,
  TableInfo,
  TableRowsDeleteInput,
  TableRowsDeleteResponse,
  TableSchemaMutationInput,
  TableSchemaMutationResponse
} from 'types';
import { readEncryptedServerProfiles, writeEncryptedServerProfiles } from '@/lib/secureVault';
import { recordActivity } from '@/lib/activityConsole';
import { databaseEngineDefinition, databaseEngineLabel } from '@/lib/databaseEngines';
import { getAppPreferences } from '@/lib/appPreferences';
import {
  addApproval,
  addMigration,
  addSchemaSnapshot,
  getDatabaseSafetyWorkspace,
  markApprovalExecuted
} from '@/lib/databaseSafetyWorkspace';
import { openDatabaseSafetyCenter } from '@/lib/databaseSafetyEvents';
import { looksLikeProductionServer, migrationDownSql, migrationFileName, migrationSqlForMutation } from '@/lib/schemaMigration';

const DATABASE_API_PATH = '/api/database';
const profileMutationQueues = new Map<string, Promise<void>>();
const inFlightControllers = new Map<string, AbortController>();

export interface DatabaseServerCatalogItem extends DatabaseServerConfig {
  databases: DatabaseCatalogItem[];
}

interface DatabaseErrorPayload { error?: string; message?: string; _meta?: DatabaseQueryMeta }
interface ProfileMutationResult<T> { servers: DatabaseServerConfig[]; result: T }
interface DatabaseRequestError extends Error { code?: string; queryMeta?: DatabaseQueryMeta }
interface RequestOptions { requestKey?: string; connectionDatabase?: string | null; recordActivity?: boolean }
interface QueryOptions { bypassApproval?: boolean }

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
  'table-data': 'Tablo verileri',
  'update-cell': 'Hücre güncelleme',
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
  if (!server.host?.trim() || !server.username?.trim() || !server.password) throw new Error('Host, kullanıcı adı ve parola eksik.');
  return {
    engine,
    host: server.host.trim(),
    port: server.port ?? definition.defaultPort,
    username: server.username.trim(),
    password: server.password,
    database: databaseOverride === undefined ? server.databaseName?.trim() || undefined : databaseOverride,
    sslMode: server.sslMode ?? 'required',
    connectTimeoutMs: server.connectionTimeoutMs ?? 20_000
  };
}

async function readApiResponse<T>(response: Response) {
  const rawBody = await response.text();
  let body: T | DatabaseErrorPayload | null = null;
  if (rawBody) {
    try { body = JSON.parse(rawBody) as T | DatabaseErrorPayload; }
    catch { throw new Error(response.ok ? 'Next.js veritabanı API geçerli JSON döndürmedi.' : `Veritabanı isteği başarısız oldu (${response.status}).`); }
  }
  if (!response.ok) {
    const errorBody = body as DatabaseErrorPayload | null;
    const error = new Error(errorBody?.message || errorBody?.error || `Veritabanı isteği başarısız oldu (${response.status}).`) as DatabaseRequestError;
    error.code = errorBody?.error;
    error.queryMeta = errorBody?._meta;
    throw error;
  }
  return body as T;
}

function fallbackStatements(action: DatabaseApiAction, payload: Record<string, unknown>, server: DatabaseServerConfig): DatabaseQueryStatement[] {
  const engine = databaseEngineLabel(server.databaseType);
  const database = String(payload.database || 'sunucu geneli');
  const table = String(payload.table || 'tablo');
  if (action === 'test') return [{ label: 'Bağlantı testi', sql: `/* ${engine} bağlantı testi */ SELECT version` }];
  if (action === 'catalog') return [{ label: 'Ayrıntılı katalog', sql: `/* ${engine} katalog sorguları */` }];
  if (action === 'table-info') return [{ label: 'Tablo yapısı', sql: `/* ${engine} */ DESCRIBE ${database}.${table}` }];
  if (action === 'table-data') return [{ label: 'Tablo satırları', sql: `SELECT * FROM ${database}.${table}` }];
  if (action === 'update-cell') return [{ label: 'Hücre güncelleme', sql: `UPDATE ${database}.${table} SET ${String(payload.column || 'column')} = ? WHERE <primary-key>` }];
  if (action === 'delete-rows') return [{ label: 'Seçili satırları sil', sql: `DELETE FROM ${database}.${table} WHERE <primary-key>` }];
  if (action === 'alter-table') return [{ label: 'Tablo yapısını değiştir', sql: `ALTER TABLE ${database}.${table} <validated-operation>` }];
  return [{ label: 'SQL editörü sorgusu', sql: String(payload.sql || '') }];
}

function resultMetrics(action: DatabaseApiAction, result: unknown) {
  const payload = result as { databases?: unknown[]; columns?: unknown[]; data?: unknown[]; rows?: unknown[]; affectedRows?: number; tableInfo?: { columns?: unknown[] } } | null;
  if (!payload) return {};
  if (action === 'catalog') return { rowCount: payload.databases?.length };
  if (action === 'table-info') return { rowCount: payload.columns?.length };
  if (action === 'table-data') return { rowCount: payload.data?.length };
  if (action === 'alter-table') return { rowCount: payload.tableInfo?.columns?.length };
  if (action === 'update-cell' || action === 'delete-rows') return { affectedRows: payload.affectedRows };
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

async function requestDatabaseApi<T>(server: DatabaseServerConfig, action: DatabaseApiAction, payload: Record<string, unknown> = {}, options: RequestOptions = {}) {
  if (options.requestKey) inFlightControllers.get(options.requestKey)?.abort();
  const controller = new AbortController();
  if (options.requestKey) inFlightControllers.set(options.requestKey, controller);
  const timeoutMs = Math.min(Math.max(server.connectionTimeoutMs ?? 20_000, 3_000), 120_000);
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs + 5_000);
  const startedAt = performance.now();
  const databaseName = typeof payload.database === 'string' ? payload.database : undefined;
  const tableName = typeof payload.table === 'string' ? payload.table : undefined;

  try {
    const response = await fetch(DATABASE_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'same-origin',
      signal: controller.signal,
      body: JSON.stringify({ action, connection: createConnectionPayload(server, options.connectionDatabase), ...payload })
    });
    const result = await readApiResponse<T>(response);
    if (options.recordActivity !== false) {
      const queryMeta = (result as { _meta?: DatabaseQueryMeta } | null)?._meta;
      recordStatements({ statements: queryMeta?.statements?.length ? queryMeta.statements : fallbackStatements(action, payload, server), action, level: 'success', server, databaseName, tableName, durationMs: Math.max(0, Math.round(performance.now() - startedAt)), result });
    }
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const aborted = new Error('Önceki tablo isteği daha güncel bir istek tarafından iptal edildi.') as DatabaseRequestError;
      aborted.code = 'REQUEST_SUPERSEDED';
      throw aborted;
    }
    const normalizedError = error instanceof TypeError
      ? Object.assign(new Error('Next.js veritabanı API erişilemedi. Uygulama sunucusunu ve ağ erişimini kontrol edin.'), { code: 'DATABASE_API_UNREACHABLE' }) as DatabaseRequestError
      : error instanceof Error ? error as DatabaseRequestError : new Error('Bilinmeyen veritabanı hatası.') as DatabaseRequestError;
    if (options.recordActivity !== false) {
      recordStatements({ statements: normalizedError.queryMeta?.statements?.length ? normalizedError.queryMeta.statements : fallbackStatements(action, payload, server), action, level: 'error', server, databaseName, tableName, durationMs: Math.max(0, Math.round(performance.now() - startedAt)), error: normalizedError });
    }
    throw normalizedError;
  } finally {
    window.clearTimeout(timeout);
    if (options.requestKey && inFlightControllers.get(options.requestKey) === controller) inFlightControllers.delete(options.requestKey);
  }
}

async function requireServer(accountId: string | null | undefined, serverId: string) {
  if (!accountId) throw new Error('Sunucu kasasına erişmek için kullanıcı oturumu gerekli.');
  const servers = await readEncryptedServerProfiles(accountId);
  const server = servers.find(item => item.id === serverId);
  if (!server) throw new Error('Sunucu profili şifreli kasada bulunamadı.');
  return server;
}

async function mutateServerProfiles<T>(accountId: string, mutation: (servers: DatabaseServerConfig[]) => ProfileMutationResult<T>) {
  const previousMutation = profileMutationQueues.get(accountId) ?? Promise.resolve();
  let mutationResult!: T;
  const currentMutation = previousMutation.catch(() => undefined).then(async () => {
    const currentServers = await readEncryptedServerProfiles(accountId);
    const nextState = mutation(currentServers);
    mutationResult = nextState.result;
    await writeEncryptedServerProfiles(accountId, nextState.servers);
  });
  profileMutationQueues.set(accountId, currentMutation);
  try { await currentMutation; return mutationResult; }
  finally { if (profileMutationQueues.get(accountId) === currentMutation) profileMutationQueues.delete(accountId); }
}

async function updateCachedDatabases(accountId: string, serverId: string, databases: DatabaseCatalogItem[]) {
  await mutateServerProfiles(accountId, servers => ({ servers: servers.map(server => server.id === serverId ? { ...server, databases, updatedAt: new Date().toISOString() } : server), result: undefined }));
}

function queryApproval(sql: string, server: DatabaseServerConfig, enabled: boolean) {
  if (!enabled) return null;
  const normalized = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
  if (/^\s*TRUNCATE\b/i.test(normalized)) return 'truncate' as const;
  if (/^\s*DROP\s+(TABLE|DATABASE)\b/i.test(normalized)) return 'drop' as const;
  if (/^\s*ALTER\b/i.test(normalized) && looksLikeProductionServer(server.name, server.host)) return 'production-alter' as const;
  return null;
}

export async function fetchDatabaseServers(accountId?: string | null) {
  if (!accountId) return [];
  return await readEncryptedServerProfiles(accountId) as DatabaseServerCatalogItem[];
}

export async function createDatabaseServer(server: DatabaseServerConfig, accountId?: string | null) {
  if (!accountId) throw new Error('Sunucu kaydetmek için kullanıcı oturumu gerekli.');
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
    sslMode: server.sslMode ?? 'required',
    connectionTimeoutMs: server.connectionTimeoutMs ?? 20_000,
    visibleTo: server.visibleTo ?? [],
    organizationId: server.organizationId ?? null,
    databases: server.databases ?? [],
    createdAt: server.createdAt ?? now,
    updatedAt: now
  };
  return mutateServerProfiles(accountId, servers => {
    const existingIndex = servers.findIndex(item => item.id === nextServer.id);
    const nextServers = [...servers];
    if (existingIndex >= 0) nextServers[existingIndex] = nextServer;
    else nextServers.push(nextServer);
    return { servers: nextServers, result: nextServer };
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
  if (!Array.isArray(response?.databases)) throw new Error('Next.js veritabanı API katalog yanıtı geçersiz.');
  await updateCachedDatabases(accountId!, serverId, response.databases);
  return { serverId, databases: response.databases };
}
export async function fetchTableInfo(serverId: string, databaseName: string, tableName: string, accountId?: string | null) {
  return requestDatabaseApi<TableInfo>(await requireServer(accountId, serverId), 'table-info', { database: databaseName, table: tableName }, { requestKey: `table-info:${serverId}:${databaseName}:${tableName}`, connectionDatabase: databaseName });
}
export async function fetchTableData(serverId: string, databaseName: string, tableName: string, accountId?: string | null, options: FetchTableDataOptions = {}) {
  const server = await requireServer(accountId, serverId);
  return requestDatabaseApi<TableDataResponse>(server, 'table-data', { database: databaseName, table: tableName, page: options.page ?? 1, pageSize: options.pageSize ?? 50, sorts: options.sorts ?? [], filters: options.filters ?? [], includeTotal: options.includeTotal ?? true, knownTotalRows: options.knownTotalRows }, { requestKey: `table-data:${serverId}:${databaseName}:${tableName}`, connectionDatabase: databaseName });
}
export async function updateTableCell(serverId: string, input: TableCellUpdateInput, accountId?: string | null) {
  return requestDatabaseApi<TableCellUpdateResponse>(await requireServer(accountId, serverId), 'update-cell', input as unknown as Record<string, unknown>, { connectionDatabase: input.database });
}
export async function deleteTableRows(serverId: string, input: TableRowsDeleteInput, accountId?: string | null) {
  return requestDatabaseApi<TableRowsDeleteResponse>(await requireServer(accountId, serverId), 'delete-rows', input as unknown as Record<string, unknown>, { connectionDatabase: input.database });
}

export async function mutateTableSchema(serverId: string, input: TableSchemaMutationInput, accountId?: string | null) {
  const server = await requireServer(accountId, serverId);
  const engine = server.databaseType || 'mysql';
  const preferences = getAppPreferences();
  let snapshot: ReturnType<typeof addSchemaSnapshot> | null = null;

  if (preferences.schemaSnapshots) {
    const before = await requestDatabaseApi<TableInfo>(server, 'table-info', { database: input.database, table: input.table }, { requestKey: `schema-snapshot:${serverId}:${input.database}:${input.table}`, connectionDatabase: input.database, recordActivity: false });
    snapshot = addSchemaSnapshot({ serverId: server.id, serverName: server.name, engine, database: input.database, table: input.table, reason: `ALTER öncesi: ${input.mutation.kind}`, tableInfo: before });
  }

  const generatedUpSql = migrationSqlForMutation(input.database, input.table, input.mutation, engine);
  if (preferences.approvalWorkflows && looksLikeProductionServer(server.name, server.host)) {
    const approval = addApproval({ serverId: server.id, serverName: server.name, database: input.database, table: input.table, action: 'production-alter', sql: generatedUpSql, requestedBy: accountId || 'current-user' });
    openDatabaseSafetyCenter({ tab: 'approvals', serverId: server.id, database: input.database, table: input.table });
    const error = new Error(`Production ALTER onay kuyruğuna eklendi (${approval.id}). İkinci kullanıcı onayı gerekir.`) as DatabaseRequestError;
    error.code = 'APPROVAL_REQUIRED';
    throw error;
  }

  try {
    const result = await requestDatabaseApi<TableSchemaMutationResponse>(server, 'alter-table', input as unknown as Record<string, unknown>, { connectionDatabase: input.database });
    const upSql = result._meta?.statements?.map(statement => statement.sql).filter(Boolean).join('\n') || generatedUpSql;
    addMigration({ serverId: server.id, serverName: server.name, engine, database: input.database, table: result.tableName || input.table, name: migrationFileName(input.database, input.table).replace(/\.sql$/, ''), description: `Görsel şema değişikliği: ${input.mutation.kind}`, upSql, downSql: snapshot ? migrationDownSql(snapshot.tableInfo.createSQL, input.database, input.table, engine) : '-- Snapshot kapalı olduğu için otomatik DOWN migration üretilemedi.', mutation: input.mutation, snapshotId: snapshot?.id, appliedAt: new Date().toISOString(), status: 'applied' });
    return result;
  } catch (error) {
    addMigration({ serverId: server.id, serverName: server.name, engine, database: input.database, table: input.table, name: migrationFileName(input.database, input.table).replace(/\.sql$/, ''), description: `Başarısız görsel şema değişikliği: ${input.mutation.kind}`, upSql: generatedUpSql, downSql: snapshot ? migrationDownSql(snapshot.tableInfo.createSQL, input.database, input.table, engine) : '-- Snapshot yok.', mutation: input.mutation, snapshotId: snapshot?.id, status: 'failed' });
    throw error;
  }
}

async function executeDatabaseQueryInternal(serverId: string, sql: string, accountId?: string | null, databaseName?: string | null, options: QueryOptions = {}) {
  const server = await requireServer(accountId, serverId);
  if (!sql.trim()) throw new Error('Çalıştırılacak SQL sorgusu boş olamaz.');
  const selectedDatabase = databaseName === undefined ? server.databaseName || undefined : databaseName;
  const preferences = getAppPreferences();
  const approvedRecord = !options.bypassApproval
    ? getDatabaseSafetyWorkspace().approvals.find(item => item.status === 'approved' && item.serverId === server.id && (item.database || null) === (selectedDatabase || null) && item.sql.trim() === sql.trim())
    : undefined;
  const action = !options.bypassApproval && !approvedRecord ? queryApproval(sql, server, preferences.approvalWorkflows) : null;

  if (action) {
    const approval = addApproval({ serverId: server.id, serverName: server.name, database: selectedDatabase || null, action, sql, requestedBy: accountId || 'current-user' });
    openDatabaseSafetyCenter({ tab: 'approvals', serverId: server.id, database: selectedDatabase || null });
    const error = new Error(`İşlem ikinci kullanıcı onay kuyruğuna eklendi (${approval.id}).`) as DatabaseRequestError;
    error.code = 'APPROVAL_REQUIRED';
    throw error;
  }

  try {
    const result = await requestDatabaseApi<QueryExecutionResult>(server, 'query', { database: selectedDatabase, sql }, { connectionDatabase: selectedDatabase });
    if (approvedRecord) markApprovalExecuted(approvedRecord.id, 'executed');
    return result;
  } catch (error) {
    if (approvedRecord) markApprovalExecuted(approvedRecord.id, 'failed');
    throw error;
  }
}

export function executeDatabaseQuery(serverId: string, sql: string, accountId?: string | null, databaseName?: string | null) {
  return executeDatabaseQueryInternal(serverId, sql, accountId, databaseName);
}

export function executeApprovedDatabaseQuery(serverId: string, sql: string, accountId?: string | null, databaseName?: string | null) {
  return executeDatabaseQueryInternal(serverId, sql, accountId, databaseName, { bypassApproval: true });
}
