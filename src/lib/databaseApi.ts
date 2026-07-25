'use client';

import type {
  DatabaseApiAction,
  DatabaseConnectionPayload,
  DatabaseServerConfig,
  TableInfo
} from 'types';
import { readEncryptedServerProfiles, writeEncryptedServerProfiles } from '@/lib/secureVault';
import { recordActivity } from '@/lib/activityConsole';

const DATABASE_API_PATH = '/api/database';
const profileMutationQueues = new Map<string, Promise<void>>();

export interface DatabaseServerCatalogItem extends DatabaseServerConfig {
  databases: { name: string; tables: string[] }[];
}

interface DatabaseErrorPayload {
  error?: string;
  message?: string;
}

interface ProfileMutationResult<T> {
  servers: DatabaseServerConfig[];
  result: T;
}

const ACTION_TITLES: Record<DatabaseApiAction, string> = {
  test: 'Bağlantı testi',
  catalog: 'Veritabanı kataloğu',
  'table-info': 'Tablo yapısı',
  'table-data': 'Tablo verileri',
  query: 'SQL sorgusu'
};

function createServerId() {
  if (typeof window !== 'undefined' && 'randomUUID' in window.crypto) {
    return window.crypto.randomUUID();
  }

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
      throw new Error(response.ok ? 'Next.js veritabanı API geçerli JSON döndürmedi.' : `Veritabanı isteği başarısız oldu (${response.status}).`);
    }
  }

  if (!response.ok) {
    const errorBody = body as DatabaseErrorPayload | null;
    const error = new Error(errorBody?.message || errorBody?.error || `Veritabanı isteği başarısız oldu (${response.status}).`) as Error & { code?: string };
    error.code = errorBody?.error;
    throw error;
  }

  return body as T;
}

function activityCategory(action: DatabaseApiAction) {
  if (action === 'test') return 'connection' as const;
  if (action === 'catalog') return 'catalog' as const;
  if (action === 'table-info') return 'schema' as const;
  if (action === 'table-data') return 'data' as const;
  return 'query' as const;
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

async function requestDatabaseApi<T>(
  server: DatabaseServerConfig,
  action: DatabaseApiAction,
  payload: Record<string, unknown> = {}
) {
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(server.connectionTimeoutMs ?? 20_000, 3_000), 120_000);
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs + 5_000);
  const startedAt = performance.now();
  const databaseName = typeof payload.database === 'string' ? payload.database : server.databaseName;
  const tableName = typeof payload.table === 'string' ? payload.table : undefined;
  const sql = typeof payload.sql === 'string' ? payload.sql : undefined;
  const category = activityCategory(action);

  recordActivity({
    level: action === 'query' ? 'sql' : 'info',
    category,
    title: `${ACTION_TITLES[action]} başlatıldı`,
    message: action === 'query' ? 'Sorgu Next.js API üzerinden yürütülüyor.' : `${server.name} üzerinde işlem yürütülüyor.`,
    serverId: server.id,
    serverName: server.name,
    host: server.host,
    databaseName,
    tableName,
    sql
  });

  try {
    const response = await fetch(DATABASE_API_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
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
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));

    recordActivity({
      level: 'success',
      category,
      title: `${ACTION_TITLES[action]} tamamlandı`,
      message: `${server.name} işlemi başarıyla tamamladı.`,
      serverId: server.id,
      serverName: server.name,
      host: server.host,
      databaseName,
      tableName,
      sql,
      durationMs,
      ...resultMetrics(action, result)
    });

    return result;
  } catch (error) {
    const normalizedError =
      error instanceof DOMException && error.name === 'AbortError'
        ? new Error(`Next.js veritabanı API ${Math.round(timeoutMs / 1000)} saniye içinde yanıt vermedi.`)
        : error instanceof TypeError
          ? new Error('Next.js veritabanı API erişilemedi. Uygulama sunucusunu ve ağ erişimini kontrol edin.')
          : error instanceof Error
            ? error
            : new Error('Bilinmeyen veritabanı hatası.');

    recordActivity({
      level: 'error',
      category,
      title: `${ACTION_TITLES[action]} başarısız`,
      message: normalizedError.message,
      serverId: server.id,
      serverName: server.name,
      host: server.host,
      databaseName,
      tableName,
      sql,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      errorCode: (normalizedError as Error & { code?: string }).code
    });

    throw normalizedError;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function requireServer(accountId: string | null | undefined, serverId: string) {
  if (!accountId) {
    throw new Error('Sunucu kasasına erişmek için kullanıcı oturumu gerekli.');
  }

  const servers = await readEncryptedServerProfiles(accountId);
  const server = servers.find(item => item.id === serverId);

  if (!server) {
    throw new Error('Sunucu profili şifreli kasada bulunamadı.');
  }

  return server;
}

async function mutateServerProfiles<T>(accountId: string, mutation: (servers: DatabaseServerConfig[]) => ProfileMutationResult<T>) {
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
    if (profileMutationQueues.get(accountId) === currentMutation) {
      profileMutationQueues.delete(accountId);
    }
  }
}

async function updateCachedDatabases(accountId: string, serverId: string, databases: { name: string; tables: string[] }[]) {
  await mutateServerProfiles(accountId, servers => ({
    servers: servers.map(server =>
      server.id === serverId
        ? { ...server, databases, updatedAt: new Date().toISOString() }
        : server
    ),
    result: undefined
  }));
}

export async function fetchDatabaseServers(accountId?: string | null) {
  if (!accountId) {
    return [];
  }

  const startedAt = performance.now();

  try {
    const servers = (await readEncryptedServerProfiles(accountId)) as DatabaseServerCatalogItem[];
    recordActivity({
      level: 'success',
      category: 'vault',
      title: 'Şifreli sunucu kasası açıldı',
      message: servers.length > 0 ? `${servers.length} sunucu profili yüklendi.` : 'Kasa boş; henüz sunucu profili bulunmuyor.',
      durationMs: Math.round(performance.now() - startedAt),
      rowCount: servers.length
    });
    return servers;
  } catch (error) {
    recordActivity({
      level: 'error',
      category: 'vault',
      title: 'Şifreli sunucu kasası açılamadı',
      message: error instanceof Error ? error.message : 'Kasa okunurken bilinmeyen hata oluştu.',
      durationMs: Math.round(performance.now() - startedAt)
    });
    throw error;
  }
}

export async function createDatabaseServer(server: DatabaseServerConfig, accountId?: string | null) {
  if (!accountId) {
    throw new Error('Sunucu kaydetmek için kullanıcı oturumu gerekli.');
  }

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

  const savedServer = await mutateServerProfiles(accountId, servers => {
    const existingIndex = servers.findIndex(item => item.id === nextServer.id);
    const nextServers = [...servers];

    if (existingIndex >= 0) {
      nextServers[existingIndex] = nextServer;
    } else {
      nextServers.push(nextServer);
    }

    return { servers: nextServers, result: nextServer };
  });

  recordActivity({
    level: 'success',
    category: 'vault',
    title: 'Sunucu profili şifrelendi',
    message: `${nextServer.name} güvenli tarayıcı kasasına kaydedildi.`,
    serverId: nextServer.id,
    serverName: nextServer.name,
    host: nextServer.host
  });

  return savedServer;
}

export async function testDatabaseConnection(server: DatabaseServerConfig) {
  return requestDatabaseApi<{ connection: { version?: string; databaseName?: string | null; currentUser?: string } }>(server, 'test');
}

export async function fetchServerTables(serverId: string, accountId?: string | null) {
  const server = await requireServer(accountId, serverId);
  const response = await requestDatabaseApi<{ databases: { name: string; tables: string[] }[] }>(server, 'catalog');

  if (!Array.isArray(response?.databases)) {
    throw new Error('Next.js veritabanı API katalog yanıtı geçersiz.');
  }

  await updateCachedDatabases(accountId!, serverId, response.databases);

  return {
    serverId,
    databases: response.databases
  };
}

export async function fetchTableInfo(serverId: string, databaseName: string, tableName: string, accountId?: string | null) {
  const server = await requireServer(accountId, serverId);

  return requestDatabaseApi<TableInfo>(server, 'table-info', {
    database: databaseName,
    table: tableName
  });
}

export async function fetchTableData(serverId: string, databaseName: string, tableName: string, limit = 512, accountId?: string | null, sort?: string | null) {
  const server = await requireServer(accountId, serverId);

  return requestDatabaseApi<{ data: Record<string, unknown>[]; limit: number }>(server, 'table-data', {
    database: databaseName,
    table: tableName,
    limit: Math.min(Math.max(limit, 1), 5_000),
    sort: sort || undefined
  });
}

export async function executeDatabaseQuery(serverId: string, sql: string, accountId?: string | null, databaseName?: string | null) {
  const server = await requireServer(accountId, serverId);

  if (!sql.trim()) {
    throw new Error('Çalıştırılacak SQL sorgusu boş olamaz.');
  }

  return requestDatabaseApi<{
    rows: Record<string, unknown>[];
    affectedRows?: number;
    insertId?: string | number;
    fields?: Array<{ name: string; type: number }>;
  }>(server, 'query', {
    database: databaseName || server.databaseName || undefined,
    sql
  });
}
