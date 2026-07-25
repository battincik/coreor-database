'use client';

import type {
  DatabaseApiAction,
  DatabaseConnectionPayload,
  DatabaseQueryMeta,
  DatabaseQueryStatement,
  DatabaseServerConfig,
  TableDataFilter,
  TableDataResponse,
  TableDataSort,
  TableInfo
} from 'types';
import { readEncryptedServerProfiles, writeEncryptedServerProfiles } from '@/lib/secureVault';
import { recordActivity } from '@/lib/activityConsole';

const DATABASE_API_PATH = '/api/database';
const profileMutationQueues = new Map<string, Promise<void>>();
const inFlightControllers = new Map<string, AbortController>();

export interface DatabaseServerCatalogItem extends DatabaseServerConfig {
  databases: { name: string; tables: string[] }[];
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
  'table-data': 'Tablo verileri',
  query: 'SQL sorgusu'
};

function createServerId() {
  if (typeof window !== 'undefined' && 'randomUUID' in window.crypto) return window.crypto.randomUUID();
  return `server-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createConnectionPayload(server: DatabaseServerConfig): DatabaseConnectionPayload {
  if (server.databaseType !== 'mysql' && server.databaseType !== 'mariadb') {
    throw new Error('Bu sunucu profili desteklenen MySQL veya MariaDB motorlarından birini kullanmıyor.');
  }
  if (!server.host?.trim() || !server.username?.trim() || !server.password) {
    throw new Error('Host, kullanıcı adı ve parola eksik.');
  }

  return {
    engine: server.databaseType,
    host: server.host.trim(),
    port: server.port ?? 3306,
    username: server.username.trim(),
    password: server.password,
    database: server.databaseName?.trim() || undefined,
    sslMode: server.sslMode ?? 'required',
    connectTimeoutMs: server.connectionTimeoutMs ?? 20_000
  };
}

async function readApiResponse<T>(response: Response) {
  const rawBody = await response.text();
  let body: T | DatabaseErrorPayload | null = null;

  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as T | DatabaseErrorPayload;
    } catch {
      throw new Error(
        response.ok
          ? 'Next.js veritabanı API geçerli JSON döndürmedi.'
          : `Veritabanı isteği başarısız oldu (${response.status}).`
      );
    }
  }

  if (!response.ok) {
    const errorBody = body as DatabaseErrorPayload | null;
    const error = new Error(
      errorBody?.message || errorBody?.error || `Veritabanı isteği başarısız oldu (${response.status}).`
    ) as DatabaseRequestError;
    error.code = errorBody?.error;
    error.queryMeta = errorBody?._meta;
    throw error;
  }

  return body as T;
}

function quoteLogIdentifier(value: unknown) {
  const normalized = typeof value === 'string' ? value : '';
  return `\`${normalized.replace(/`/g, '``')}\``;
}

function fallbackStatements(action: DatabaseApiAction, payload: Record<string, unknown>): DatabaseQueryStatement[] {
  const database = quoteLogIdentifier(payload.database);
  const table = quoteLogIdentifier(payload.table);

  if (action === 'test') {
    return [{ label: 'Bağlantı testi', sql: 'SELECT VERSION() AS version, DATABASE() AS databaseName, CURRENT_USER() AS currentUser' }];
  }

  if (action === 'catalog') {
    return [
      {
        label: 'Veritabanı ve tablo kataloğu',
        sql: `SELECT schema_source.SCHEMA_NAME AS databaseName, NULL AS tableName\nFROM information_schema.SCHEMATA AS schema_source\nUNION ALL\nSELECT table_source.TABLE_SCHEMA AS databaseName, table_source.TABLE_NAME AS tableName\nFROM information_schema.TABLES AS table_source\nWHERE table_source.TABLE_TYPE = 'BASE TABLE'\nORDER BY databaseName, tableName`
      }
    ];
  }

  if (action === 'table-info') {
    const parameters = [payload.database, payload.table];
    return [
      {
        label: 'Kolon bilgileri',
        sql: 'SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
        parameters
      },
      {
        label: 'İndeks bilgileri',
        sql: 'SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX',
        parameters
      },
      { label: 'CREATE TABLE tanımı', sql: `SHOW CREATE TABLE ${database}.${table}` }
    ];
  }

  if (action === 'table-data') {
    return [{ label: 'Tablo satırları', sql: `SELECT * FROM ${database}.${table}` }];
  }

  return [{ label: 'SQL editörü sorgusu', sql: String(payload.sql || '') }];
}

function resultMetrics(action: DatabaseApiAction, result: unknown) {
  const payload = result as {
    databases?: unknown[];
    columns?: unknown[];
    data?: unknown[];
    rows?: unknown[];
    affectedRows?: number;
  } | null;

  if (!payload) return {};
  if (action === 'catalog') return { rowCount: payload.databases?.length };
  if (action === 'table-info') return { rowCount: payload.columns?.length };
  if (action === 'table-data') return { rowCount: payload.data?.length };
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
      message:
        options.level === 'error'
          ? options.error?.message || 'Sorgu başarısız oldu.'
          : `${options.server.name} üzerinde başarıyla çalıştırıldı.`,
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
  if (options.requestKey) {
    inFlightControllers.get(options.requestKey)?.abort();
  }

  const controller = new AbortController();
  if (options.requestKey) inFlightControllers.set(options.requestKey, controller);

  const timeoutMs = Math.min(Math.max(server.connectionTimeoutMs ?? 20_000, 3_000), 120_000);
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs + 5_000);
  const startedAt = performance.now();
  const databaseName = typeof payload.database === 'string' ? payload.database : server.databaseName;
  const tableName = typeof payload.table === 'string' ? payload.table : undefined;

  try {
    const response = await fetch(DATABASE_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'same-origin',
      signal: controller.signal,
      body: JSON.stringify({
        action,
        connection: createConnectionPayload(server),
        ...payload
      })
    });

    const result = await readApiResponse<T>(response);
    const queryMeta = (result as { _meta?: DatabaseQueryMeta } | null)?._meta;
    recordStatements({
      statements: queryMeta?.statements?.length ? queryMeta.statements : fallbackStatements(action, payload),
      action,
      level: 'success',
      server,
      databaseName,
      tableName,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      result
    });
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const aborted = new Error('Önceki tablo isteği daha güncel bir istek tarafından iptal edildi.') as DatabaseRequestError;
      aborted.code = 'REQUEST_SUPERSEDED';
      throw aborted;
    }

    const normalizedError =
      error instanceof TypeError
        ? (Object.assign(new Error('Next.js veritabanı API erişilemedi. Uygulama sunucusunu ve ağ erişimini kontrol edin.'), {
            code: 'DATABASE_API_UNREACHABLE'
          }) as DatabaseRequestError)
        : error instanceof Error
          ? (error as DatabaseRequestError)
          : (new Error('Bilinmeyen veritabanı hatası.') as DatabaseRequestError);

    recordStatements({
      statements: normalizedError.queryMeta?.statements?.length
        ? normalizedError.queryMeta.statements
        : fallbackStatements(action, payload),
      action,
      level: 'error',
      server,
      databaseName,
      tableName,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      error: normalizedError
    });
    throw normalizedError;
  } finally {
    window.clearTimeout(timeout);
    if (options.requestKey && inFlightControllers.get(options.requestKey) === controller) {
      inFlightControllers.delete(options.requestKey);
    }
  }
}

async function requireServer(accountId: string | null | undefined, serverId: string) {
  if (!accountId) throw new Error('Sunucu kasasına erişmek için kullanıcı oturumu gerekli.');
  const servers = await readEncryptedServerProfiles(accountId);
  const server = servers.find(item => item.id === serverId);
  if (!server) throw new Error('Sunucu profili şifreli kasada bulunamadı.');
  return server;
}

async function mutateServerProfiles<T>(
  accountId: string,
  mutation: (servers: DatabaseServerConfig[]) => ProfileMutationResult<T>
) {
  const previousMutation = profileMutationQueues.get(accountId) ?? Promise.resolve();
  let mutationResult!: T;
  const currentMutation = previousMutation
    .catch(() => undefined)
    .then(async () => {
      const currentServers = await readEncryptedServerProfiles(accountId);
      const nextState = mutation(currentServers);
      mutationResult = nextState.result;
      await writeEncryptedServerProfiles(accountId, nextState.servers);
    });

  profileMutationQueues.set(accountId, currentMutation);
  try {
    await currentMutation;
    return mutationResult;
  } finally {
    if (profileMutationQueues.get(accountId) === currentMutation) profileMutationQueues.delete(accountId);
  }
}

async function updateCachedDatabases(
  accountId: string,
  serverId: string,
  databases: { name: string; tables: string[] }[]
) {
  await mutateServerProfiles(accountId, servers => ({
    servers: servers.map(server =>
      server.id === serverId ? { ...server, databases, updatedAt: new Date().toISOString() } : server
    ),
    result: undefined
  }));
}

export async function fetchDatabaseServers(accountId?: string | null) {
  if (!accountId) return [];
  return (await readEncryptedServerProfiles(accountId)) as DatabaseServerCatalogItem[];
}

export async function createDatabaseServer(server: DatabaseServerConfig, accountId?: string | null) {
  if (!accountId) throw new Error('Sunucu kaydetmek için kullanıcı oturumu gerekli.');
  const now = new Date().toISOString();
  const nextServer: DatabaseServerConfig = {
    id: server.id || createServerId(),
    name: server.name.trim(),
    databaseType: server.databaseType ?? 'mysql',
    version: server.version || (server.databaseType === 'mariadb' ? '12.3' : '8.4'),
    host: server.host?.trim(),
    port: server.port ?? 3306,
    username: server.username?.trim(),
    password: server.password,
    databaseName: server.databaseName?.trim(),
    sslMode: server.sslMode ?? 'required',
    connectionTimeoutMs: server.connectionTimeoutMs ?? 20_000,
    visibleTo: [],
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
  return requestDatabaseApi<{
    connection: { version?: string; databaseName?: string | null; currentUser?: string };
    _meta?: DatabaseQueryMeta;
  }>(server, 'test', {}, { requestKey: `connection-test:${server.host}:${server.port || 3306}` });
}

export async function fetchServerTables(serverId: string, accountId?: string | null) {
  const server = await requireServer(accountId, serverId);
  const response = await requestDatabaseApi<{
    databases: { name: string; tables: string[] }[];
    _meta?: DatabaseQueryMeta;
  }>(server, 'catalog', {}, { requestKey: `catalog:${serverId}` });

  if (!Array.isArray(response?.databases)) throw new Error('Next.js veritabanı API katalog yanıtı geçersiz.');
  await updateCachedDatabases(accountId!, serverId, response.databases);
  return { serverId, databases: response.databases };
}

export async function fetchTableInfo(
  serverId: string,
  databaseName: string,
  tableName: string,
  accountId?: string | null
) {
  const server = await requireServer(accountId, serverId);
  return requestDatabaseApi<TableInfo>(
    server,
    'table-info',
    { database: databaseName, table: tableName },
    { requestKey: `table-info:${serverId}:${databaseName}:${tableName}` }
  );
}

export async function fetchTableData(
  serverId: string,
  databaseName: string,
  tableName: string,
  accountId?: string | null,
  options: FetchTableDataOptions = {}
) {
  const server = await requireServer(accountId, serverId);
  return requestDatabaseApi<TableDataResponse>(
    server,
    'table-data',
    {
      database: databaseName,
      table: tableName,
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 50,
      sorts: options.sorts ?? [],
      filters: options.filters ?? [],
      includeTotal: options.includeTotal ?? true,
      knownTotalRows: options.knownTotalRows
    },
    { requestKey: `table-data:${serverId}:${databaseName}:${tableName}` }
  );
}

export async function executeDatabaseQuery(
  serverId: string,
  sql: string,
  accountId?: string | null,
  databaseName?: string | null
) {
  const server = await requireServer(accountId, serverId);
  if (!sql.trim()) throw new Error('Çalıştırılacak SQL sorgusu boş olamaz.');

  return requestDatabaseApi<{
    rows: Record<string, unknown>[];
    affectedRows?: number;
    insertId?: string | number;
    fields?: Array<{ name: string; type: number }>;
    _meta?: DatabaseQueryMeta;
  }>(server, 'query', {
    database: databaseName || server.databaseName || undefined,
    sql
  });
}
