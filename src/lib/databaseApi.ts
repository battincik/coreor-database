import type {
  DatabaseApiAction,
  DatabaseConnectionPayload,
  DatabaseServerConfig,
  TableInfo
} from 'types';
import { readEncryptedServerProfiles, writeEncryptedServerProfiles } from '@/lib/secureVault';

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
    throw new Error(errorBody?.message || errorBody?.error || `Veritabanı isteği başarısız oldu (${response.status}).`);
  }

  return body as T;
}

async function requestDatabaseApi<T>(
  server: DatabaseServerConfig,
  action: DatabaseApiAction,
  payload: Record<string, unknown> = {}
) {
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(server.connectionTimeoutMs ?? 20_000, 3_000), 120_000);
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs + 5_000);

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

    return await readApiResponse<T>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Next.js veritabanı API ${Math.round(timeoutMs / 1000)} saniye içinde yanıt vermedi.`);
    }

    if (error instanceof TypeError) {
      throw new Error('Next.js veritabanı API erişilemedi. Uygulama sunucusunu ve ağ erişimini kontrol edin.');
    }

    throw error;
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

  return (await readEncryptedServerProfiles(accountId)) as DatabaseServerCatalogItem[];
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

  return mutateServerProfiles(accountId, servers => {
    const existingIndex = servers.findIndex(item => item.id === nextServer.id);
    const nextServers = [...servers];

    if (existingIndex >= 0) {
      nextServers[existingIndex] = nextServer;
    } else {
      nextServers.push(nextServer);
    }

    return { servers: nextServers, result: nextServer };
  });
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
