export const DEFAULT_DATABASE_API_BASE = process.env.NEXT_PUBLIC_DATABASE_API_BASE ?? 'https://api.coreor.net/web/database';

export interface DatabaseServerConfig {
    id: string;
    name: string;
    baseUrl?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    databaseName?: string;
    databaseType?: 'mysql' | 'mariadb' | 'postgresql';
    version?: string;
    visibleTo?: string[];
    databases?: { name: string; tables: string[] }[];
}

export interface DatabaseServerCatalogItem extends DatabaseServerConfig {
    databases: { name: string; tables: string[] }[];
}

export function normalizeBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/+$/, '');
}

export function buildDatabaseApiUrl(baseUrl: string, path: string) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    return `${normalizedBaseUrl}${normalizedPath}`;
}

export async function fetchDatabaseServers(token?: string | null) {
    const response = await fetch(buildDatabaseApiUrl(DEFAULT_DATABASE_API_BASE, '/servers'), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });

    if (!response.ok) {
        throw new Error('Sunucular yüklenemedi.');
    }

    return (await response.json()) as DatabaseServerCatalogItem[];
}

export async function createDatabaseServer(server: Omit<DatabaseServerConfig, 'id' | 'databases'>, token?: string | null) {
    const response = await fetch(buildDatabaseApiUrl(DEFAULT_DATABASE_API_BASE, '/servers'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(server)
    });

    if (!response.ok) {
        throw new Error('Sunucu kaydedilemedi.');
    }

    return response.json();
}

export async function fetchServerTables(serverId: string, token?: string | null) {
    const response = await fetch(buildDatabaseApiUrl(DEFAULT_DATABASE_API_BASE, `/servers/${encodeURIComponent(serverId)}/tables`), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });

    if (!response.ok) {
        throw new Error('Tablolar yüklenemedi.');
    }

    return response.json() as Promise<{ serverId: string; databases: { name: string; tables: string[] }[] }>;
}

export async function fetchTableInfo(serverId: string, databaseName: string, tableName: string, token?: string | null) {
    const response = await fetch(buildDatabaseApiUrl(DEFAULT_DATABASE_API_BASE, `/servers/${encodeURIComponent(serverId)}/databases/${encodeURIComponent(databaseName)}/tables/${encodeURIComponent(tableName)}/info`), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });

    if (!response.ok) {
        throw new Error('Tablo bilgileri yüklenemedi.');
    }

    return response.json();
}

export async function fetchTableData(serverId: string, databaseName: string, tableName: string, limit = 512, token?: string | null, sort?: string | null) {
    const sortQuery = sort ? `&sort=${encodeURIComponent(sort)}` : '';
    const response = await fetch(buildDatabaseApiUrl(DEFAULT_DATABASE_API_BASE, `/servers/${encodeURIComponent(serverId)}/databases/${encodeURIComponent(databaseName)}/tables/${encodeURIComponent(tableName)}/data?limit=${limit}${sortQuery}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });

    if (!response.ok) {
        throw new Error('Tablo verileri yüklenemedi.');
    }

    return response.json();
}