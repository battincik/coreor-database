import type { DatabaseServerConfig, TableInfo } from 'types';
import { readEncryptedServerProfiles, writeEncryptedServerProfiles } from '@/lib/secureVault';

/**
 * Eski isim geriye uyumluluk için korunuyor. Bu değer artık merkezi Coreor API'si
 * değil, opsiyonel varsayılan stateless database connector adresidir.
 */
export const DEFAULT_DATABASE_API_BASE = process.env.NEXT_PUBLIC_DATABASE_CONNECTOR_URL ?? '';
export const DEFAULT_DATABASE_CONNECTOR_URL = DEFAULT_DATABASE_API_BASE;

export interface DatabaseServerCatalogItem extends DatabaseServerConfig {
  databases: { name: string; tables: string[] }[];
}

interface ConnectorConnectionPayload {
  engine: NonNullable<DatabaseServerConfig['databaseType']>;
  host: string;
  port: number;
  username: string;
  password: string;
  database?: string;
  sslMode: NonNullable<DatabaseServerConfig['sslMode']>;
}

interface ConnectorErrorPayload {
  error?: string;
  message?: string;
}

function createServerId() {
  if (typeof window !== 'undefined' && 'randomUUID' in window.crypto) {
    return window.crypto.randomUUID();
  }

  return `server-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

export function buildDatabaseApiUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBaseUrl}${normalizedPath}`;
}

function getConnectorBaseUrl(server: DatabaseServerConfig) {
  const configuredUrl = server.connectorUrl || server.baseUrl || DEFAULT_DATABASE_CONNECTOR_URL;

  if (!configuredUrl) {
    throw new Error('Bu sunucu için HTTPS connector adresi tanımlı değil. Tarayıcı MySQL 3306/TCP portuna doğrudan bağlanamaz.');
  }

  let connectorUrl: URL;

  try {
    connectorUrl = new URL(configuredUrl);
  } catch {
    throw new Error('Database connector adresi geçerli bir URL değil.');
  }

  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(connectorUrl.hostname);

  if (connectorUrl.protocol !== 'https:' && !(isLocalhost && connectorUrl.protocol === 'http:')) {
    throw new Error('Database connector üretim ortamında HTTPS kullanmalıdır.');
  }

  return normalizeBaseUrl(connectorUrl.toString());
}

function createConnectionPayload(server: DatabaseServerConfig): ConnectorConnectionPayload {
  if (!server.host?.trim() || !server.username?.trim() || !server.password) {
    throw new Error('Host, kullanıcı adı ve parola eksik.');
  }

  return {
    engine: server.databaseType ?? 'mysql',
    host: server.host.trim(),
    port: server.port ?? 3306,
    username: server.username.trim(),
    password: server.password,
    database: server.databaseName?.trim() || undefined,
    sslMode: server.sslMode ?? 'required'
  };
}

async function readConnectorResponse<T>(response: Response) {
  const rawBody = await response.text();
  let body: T | ConnectorErrorPayload | null = null;

  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as T | ConnectorErrorPayload;
    } catch {
      if (!response.ok) {
        throw new Error(`Connector isteği başarısız oldu (${response.status}).`);
      }

      throw new Error('Connector geçerli JSON döndürmedi.');
    }
  }

  if (!response.ok) {
    const errorBody = body as ConnectorErrorPayload | null;
    throw new Error(errorBody?.message || errorBody?.error || `Connector isteği başarısız oldu (${response.status}).`);
  }

  return body as T;
}

async function requestConnector<T>(server: DatabaseServerConfig, path: string, payload: Record<string, unknown> = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(server.connectionTimeoutMs ?? 20_000, 3_000), 120_000);
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildDatabaseApiUrl(getConnectorBaseUrl(server), path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
      body: JSON.stringify({
        connection: createConnectionPayload(server),
        ...payload
      })
    });

    return await readConnectorResponse<T>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Database connector ${timeoutMs / 1000} saniye içinde yanıt vermedi.`);
    }

    if (error instanceof TypeError) {
      throw new Error('Database connector erişilemedi. HTTPS sertifikasını, CORS ayarlarını ve ağ erişimini kontrol et.');
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

  return { server, servers };
}

async function updateCachedDatabases(accountId: string, serverId: string, databases: { name: string; tables: string[] }[]) {
  const servers = await readEncryptedServerProfiles(accountId);
  const updatedAt = new Date().toISOString();
  const nextServers = servers.map(server => (server.id === serverId ? { ...server, databases, updatedAt } : server));
  await writeEncryptedServerProfiles(accountId, nextServers);
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

  const servers = await readEncryptedServerProfiles(accountId);
  const now = new Date().toISOString();
  const normalizedConnectorUrl = normalizeBaseUrl(server.connectorUrl || server.baseUrl || DEFAULT_DATABASE_CONNECTOR_URL);
  const nextServer: DatabaseServerConfig = {
    ...server,
    id: server.id || createServerId(),
    name: server.name.trim(),
    connectorUrl: normalizedConnectorUrl || undefined,
    baseUrl: normalizedConnectorUrl || undefined,
    host: server.host?.trim(),
    username: server.username?.trim(),
    databaseName: server.databaseName?.trim(),
    databaseType: server.databaseType ?? 'mysql',
    port: server.port ?? 3306,
    sslMode: server.sslMode ?? 'required',
    databases: server.databases ?? [],
    createdAt: server.createdAt ?? now,
    updatedAt: now
  };

  const existingIndex = servers.findIndex(item => item.id === nextServer.id);
  const nextServers = [...servers];

  if (existingIndex >= 0) {
    nextServers[existingIndex] = nextServer;
  } else {
    nextServers.push(nextServer);
  }

  await writeEncryptedServerProfiles(accountId, nextServers);
  return nextServer;
}

export async function fetchServerTables(serverId: string, accountId?: string | null) {
  const { server } = await requireServer(accountId, serverId);
  const response = await requestConnector<{ databases?: { name: string; tables: string[] }[] } | { name: string; tables: string[] }[]>(server, '/v1/catalog');
  const databases = Array.isArray(response) ? response : response?.databases;

  if (!Array.isArray(databases)) {
    throw new Error('Connector katalog yanıtı geçersiz.');
  }

  await updateCachedDatabases(accountId!, serverId, databases);

  return {
    serverId,
    databases
  };
}

export async function fetchTableInfo(serverId: string, databaseName: string, tableName: string, accountId?: string | null) {
  const { server } = await requireServer(accountId, serverId);

  return requestConnector<TableInfo>(server, '/v1/table-info', {
    database: databaseName,
    table: tableName
  });
}

export async function fetchTableData(serverId: string, databaseName: string, tableName: string, limit = 512, accountId?: string | null, sort?: string | null) {
  const { server } = await requireServer(accountId, serverId);

  return requestConnector<{ data: Record<string, unknown>[]; total?: number }>(server, '/v1/table-data', {
    database: databaseName,
    table: tableName,
    limit: Math.min(Math.max(limit, 1), 5_000),
    sort: sort || undefined
  });
}

export async function executeDatabaseQuery(serverId: string, sql: string, accountId?: string | null, databaseName?: string | null) {
  const { server } = await requireServer(accountId, serverId);

  if (!sql.trim()) {
    throw new Error('Çalıştırılacak SQL sorgusu boş olamaz.');
  }

  return requestConnector<{ rows: Record<string, unknown>[]; affectedRows?: number; fields?: unknown[] }>(server, '/v1/query', {
    database: databaseName || server.databaseName || undefined,
    sql
  });
}
