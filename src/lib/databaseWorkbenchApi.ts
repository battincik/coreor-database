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
  DatabaseStorageRecalculation,
  DatabaseUserSaveInput,
  DatabaseUsersResponse,
  DatabaseWorkbenchAction
} from '@/lib/databaseWorkbenchTypes';
import { readLocalServerProfiles, writeLocalServerProfiles } from '@/lib/localProfiles';
import { recordActivity } from '@/lib/activityConsole';
import { desktopDatabaseRequest } from '@/lib/desktopClient';
import { normalizeDatabaseClientError } from '@/lib/databaseErrorPresentation';

async function requireServer(accountId: string | null | undefined, serverId: string) {
  const servers = await readLocalServerProfiles();
  const server = servers.find(item => item.id === serverId);
  if (!server) throw new Error('Sunucu profili yerel config içinde bulunamadı.');
  return server;
}

function connectionPayload(server: DatabaseServerConfig, database?: string | null): DatabaseConnectionPayload {
  const engine = server.databaseType ?? 'mysql';
  if (!server.host?.trim() || !server.username?.trim()) throw new Error('Host veya kullanıcı adı eksik.');
  const defaultPort = engine === 'postgresql' || engine === 'cockroachdb' ? 5432 : engine === 'mssql' ? 1433 : 3306;
  return {
    serverId: server.id,
    engine,
    host: server.host.trim(),
    port: server.port ?? defaultPort,
    username: server.username.trim(),
    password: server.password || undefined,
    database: database === undefined ? server.databaseName?.trim() || undefined : database,
    sslMode: server.sslMode ?? 'required',
    connectTimeoutMs: server.connectionTimeoutMs ?? 20_000,
    readOnly: Boolean(server.readOnly)
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
    const body = await desktopDatabaseRequest<T>({ action, connection: connectionPayload(server, database), database, ...payload });
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
    return body;
  } catch (error) {
    const normalizedError = normalizeDatabaseClientError(error);
    if (recordInActivityLog) {
      recordActivity({
        level: 'error',
        category: 'schema',
        title: `Çalışma alanı: ${action}`,
        message: normalizedError.message,
        serverId: server.id,
        serverName: server.name,
        host: server.host,
        databaseName: database || undefined,
        sql: `/* structured:${action} */`,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        errorCode: normalizedError.code
      });
    }
    throw normalizedError;
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


function bytesToMb(value: number) {
  return (Math.max(0, Number(value) || 0) / 1048576).toFixed(2);
}

async function persistStorageRecalculation(serverId: string, result: DatabaseStorageRecalculation) {
  const servers = await readLocalServerProfiles();
  const nextServers = servers.map(server => {
    if (server.id !== serverId) return server;
    const databases = (server.databases || []).map(database => {
      if (database.name !== result.database) return database;

      if (result.scope === 'database') {
        return {
          ...database,
          totalRows: result.rows ?? database.totalRows,
          dataSizeMB: bytesToMb(result.dataBytes),
          indexSizeMB: bytesToMb(result.indexBytes),
          totalSizeMB: bytesToMb(result.totalBytes)
        };
      }

      const tableDetails = (database.tableDetails || []).map(table => table.tableName === result.table ? {
        ...table,
        rows: result.rows ?? table.rows,
        dataSizeMB: bytesToMb(result.dataBytes),
        indexSizeMB: bytesToMb(result.indexBytes),
        freeSizeMB: bytesToMb(result.freeBytes),
        sizeMB: bytesToMb(result.totalBytes)
      } : table);

      return {
        ...database,
        tableDetails,
        totalRows: tableDetails.reduce((sum, table) => sum + Number(table.rows || 0), 0),
        dataSizeMB: tableDetails.reduce((sum, table) => sum + Number(table.dataSizeMB || 0), 0).toFixed(2),
        indexSizeMB: tableDetails.reduce((sum, table) => sum + Number(table.indexSizeMB || 0), 0).toFixed(2),
        totalSizeMB: tableDetails.reduce((sum, table) => sum + Number(table.sizeMB || 0), 0).toFixed(2)
      };
    });
    return { ...server, databases, updatedAt: new Date().toISOString() };
  });
  await writeLocalServerProfiles(nextServers);
}

export async function recalculateDatabaseStorage(serverId: string, database: string, accountId?: string | null) {
  const result = await workbenchRequest<DatabaseStorageRecalculation>(
    serverId, accountId, 'storage-recalculate', { scope: 'database', database }, database, false
  );
  await persistStorageRecalculation(serverId, result);
  return result;
}

export async function recalculateTableStorage(serverId: string, database: string, table: string, accountId?: string | null) {
  const result = await workbenchRequest<DatabaseStorageRecalculation>(
    serverId, accountId, 'storage-recalculate', { scope: 'table', database, table }, database, false
  );
  await persistStorageRecalculation(serverId, result);
  return result;
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
