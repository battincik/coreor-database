'use client';

import type { DatabaseConnectionPayload, DatabaseServerConfig } from 'types';
import type {
  DatabaseExportDataInput,
  DatabaseExportDataResponse,
  DatabaseImportDataInput,
  DatabaseImportDataResponse,
  DatabasePerformanceSnapshot,
  DatabasePrivilegeChangeInput,
  DatabaseProcessCenterResponse,
  DatabaseUserSaveInput,
  DatabaseUsersResponse,
  DatabaseWorkbenchAction
} from '@/lib/databaseWorkbenchTypes';
import { readEncryptedServerProfiles } from '@/lib/secureVault';
import { recordActivity } from '@/lib/activityConsole';

interface WorkbenchErrorPayload {
  error?: string;
  message?: string;
}

async function requireServer(accountId: string | null | undefined, serverId: string) {
  if (!accountId) throw new Error('Veritabanı çalışma alanına erişmek için kullanıcı oturumu gerekli.');
  const servers = await readEncryptedServerProfiles(accountId);
  const server = servers.find(item => item.id === serverId);
  if (!server) throw new Error('Sunucu profili şifreli kasada bulunamadı.');
  return server;
}

function connectionPayload(server: DatabaseServerConfig, database?: string | null): DatabaseConnectionPayload {
  if (server.databaseType !== 'mysql' && server.databaseType !== 'mariadb') throw new Error('Desteklenmeyen veritabanı motoru.');
  if (!server.host?.trim() || !server.username?.trim() || !server.password) throw new Error('Host, kullanıcı adı veya parola eksik.');
  return {
    engine: server.databaseType,
    host: server.host.trim(),
    port: server.port ?? 3306,
    username: server.username.trim(),
    password: server.password,
    database: database === undefined ? server.databaseName?.trim() || undefined : database,
    sslMode: server.sslMode ?? 'required',
    connectTimeoutMs: server.connectionTimeoutMs ?? 20_000
  };
}

async function workbenchRequest<T>(
  serverId: string,
  accountId: string | null | undefined,
  action: DatabaseWorkbenchAction,
  payload: Record<string, unknown> = {},
  database?: string | null,
  recordInActivityLog = true
) {
  const server = await requireServer(accountId, serverId);
  const startedAt = performance.now();
  try {
    const response = await fetch('/api/database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'same-origin',
      body: JSON.stringify({ action, connection: connectionPayload(server, database), database, ...payload })
    });
    const raw = await response.text();
    const body = raw ? JSON.parse(raw) as T | WorkbenchErrorPayload : null;
    if (!response.ok) {
      const failure = body as WorkbenchErrorPayload | null;
      const error = new Error(failure?.message || `Veritabanı yönetim isteği başarısız oldu (${response.status}).`) as Error & { code?: string };
      error.code = failure?.error;
      throw error;
    }
    if (recordInActivityLog) {
      recordActivity({
        level: 'success',
        category: 'schema',
        title: `Çalışma alanı: ${action}`,
        message: `${server.name} üzerinde tamamlandı.`,
        serverId: server.id,
        serverName: server.name,
        host: server.host,
        databaseName: database || undefined,
        sql: `/* structured:${action} */`,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt))
      });
    }
    return body as T;
  } catch (error) {
    if (recordInActivityLog) {
      recordActivity({
        level: 'error',
        category: 'schema',
        title: `Çalışma alanı: ${action}`,
        message: error instanceof Error ? error.message : 'İşlem başarısız oldu.',
        serverId: server.id,
        serverName: server.name,
        host: server.host,
        databaseName: database || undefined,
        sql: `/* structured:${action} */`,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt))
      });
    }
    throw error;
  }
}

export function listDatabaseUsers(serverId: string, accountId?: string | null) {
  return workbenchRequest<DatabaseUsersResponse>(serverId, accountId, 'users-list');
}

export function getDatabaseUserGrants(serverId: string, user: string, host: string, accountId?: string | null) {
  return workbenchRequest<{ grants: string[] }>(serverId, accountId, 'user-grants', { user, host });
}

export function saveDatabaseUser(serverId: string, userInput: DatabaseUserSaveInput, accountId?: string | null) {
  return workbenchRequest<{ saved: boolean; user: string; host: string }>(serverId, accountId, 'user-save', { userInput });
}

export function dropDatabaseUser(serverId: string, user: string, host: string, accountId?: string | null) {
  return workbenchRequest<{ dropped: boolean }>(serverId, accountId, 'user-drop', { user, host });
}

export function changeDatabasePrivileges(serverId: string, privilegeInput: DatabasePrivilegeChangeInput, accountId?: string | null) {
  return workbenchRequest<{ changed: boolean }>(serverId, accountId, 'privilege-change', { privilegeInput }, privilegeInput.database);
}

export function createDatabaseRole(serverId: string, role: string, accountId?: string | null, host = '%') {
  return workbenchRequest<{ created: boolean }>(serverId, accountId, 'role-create', { role, host });
}

export function assignDatabaseRole(
  serverId: string,
  input: { role: string; roleHost?: string; user: string; host: string; mode?: 'grant' | 'revoke'; makeDefault?: boolean },
  accountId?: string | null
) {
  return workbenchRequest<{ changed: boolean }>(serverId, accountId, 'role-assign', input);
}

export function fetchDatabaseProcessCenter(serverId: string, accountId?: string | null) {
  return workbenchRequest<DatabaseProcessCenterResponse>(serverId, accountId, 'process-list');
}

export function killDatabaseProcess(serverId: string, processId: number, killType: 'query' | 'connection', accountId?: string | null) {
  return workbenchRequest<{ killed: boolean; processId: number }>(serverId, accountId, 'process-kill', { processId, killType });
}

export function fetchDatabasePerformanceSnapshot(serverId: string, accountId?: string | null, database?: string | null) {
  return workbenchRequest<DatabasePerformanceSnapshot>(serverId, accountId, 'performance-snapshot', {}, database, false);
}

export function importDatabaseRows(serverId: string, importInput: DatabaseImportDataInput, accountId?: string | null) {
  return workbenchRequest<DatabaseImportDataResponse>(serverId, accountId, 'import-data', { importInput }, importInput.database);
}

export function exportDatabaseRows(serverId: string, exportInput: DatabaseExportDataInput, accountId?: string | null) {
  return workbenchRequest<DatabaseExportDataResponse>(serverId, accountId, 'export-data', { exportInput }, exportInput.database);
}
