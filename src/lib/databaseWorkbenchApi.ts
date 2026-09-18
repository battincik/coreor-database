'use client';

import type { DatabaseConnectionPayload, DatabaseServerConfig } from 'types';
import type {
  DatabaseExportDataInput,
  DatabaseExportDataResponse,
  DatabaseImportDataInput,
  DatabaseImportDataResponse,
  DatabaseMaintenanceStepInput,
  DatabaseMaintenanceStepResponse,
  DatabasePerformanceSnapshot,
  DatabasePrivilegeChangeInput,
  DatabaseProcessCenterResponse,
  DatabaseStorageRecalculation,
  DatabaseUserSaveInput,
  DatabaseUsersResponse,
  DatabaseWorkbenchAction
} from '@/lib/databaseWorkbenchTypes';
import { mutateLocalServerProfiles, readLocalServerProfiles } from '@/lib/localProfiles';
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
  // Polling/refresh reads must not create activity errors and duplicate toast notifications.
  // The process center renders its own inline error state.
  return workbenchRequest<DatabaseProcessCenterResponse>(serverId, accountId, 'process-list', {}, undefined, false);
}

export function killDatabaseProcess(serverId: string, processId: number, killType: 'query' | 'connection', accountId?: string | null) {
  return workbenchRequest<{ killed: boolean; processId: number }>(serverId, accountId, 'process-kill', { processId, killType });
}


function bytesToMb(value: number) {
  return (Math.max(0, Number(value) || 0) / 1048576).toFixed(2);
}

async function persistStorageRecalculations(serverId: string, results: DatabaseStorageRecalculation[]) {
  if (!results.length) return;
  const databaseResult = results.find(result => result.scope === 'database');
  const tableResults = new Map(
    results
      .filter(result => result.scope === 'table' && result.table)
      .map(result => [result.table as string, result])
  );

  await mutateLocalServerProfiles(servers => {
    const nextServers = servers.map(server => {
      if (server.id !== serverId) return server;
      const databases = (server.databases || []).map(database => {
        const belongs = results.some(result => result.database === database.name);
        if (!belongs) return database;

        const tableDetails = (database.tableDetails || []).map(table => {
          const result = tableResults.get(table.tableName);
          if (!result) return table;
          return {
            ...table,
            rows: result.rows ?? table.rows,
            dataSizeMB: bytesToMb(result.dataBytes),
            indexSizeMB: bytesToMb(result.indexBytes),
            freeSizeMB: bytesToMb(result.freeBytes),
            sizeMB: bytesToMb(result.totalBytes),
            storageMeasuredAt: result.sampledAt,
            storageMeasurementSource: result.measurementSource ?? null,
            storagePhysicalBytes: result.physicalBytes ?? null,
            rowCountMeasuredAt: result.sampledAt,
            rowCountMeasurementSource: result.rowCountSource ?? 'metadata-estimate'
          };
        });

        if (databaseResult?.database === database.name) {
          return {
            ...database,
            tableDetails,
            totalRows: databaseResult.rows ?? tableDetails.reduce((sum, table) => sum + Number(table.rows || 0), 0),
            dataSizeMB: bytesToMb(databaseResult.dataBytes),
            indexSizeMB: bytesToMb(databaseResult.indexBytes),
            totalSizeMB: bytesToMb(databaseResult.totalBytes),
            storageMeasuredAt: databaseResult.sampledAt,
            storageMeasurementSource: databaseResult.measurementSource ?? null,
            storagePhysicalBytes: databaseResult.physicalBytes ?? null,
            rowCountMeasuredAt: databaseResult.sampledAt,
            rowCountMeasurementSource: databaseResult.rowCountSource ?? 'metadata-estimate'
          };
        }

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
    return { servers: nextServers, result: undefined };
  });
}

async function measureTableStorage(
  serverId: string,
  database: string,
  table: string,
  accountId?: string | null
) {
  return workbenchRequest<DatabaseStorageRecalculation>(
    serverId,
    accountId,
    'storage-recalculate',
    { scope: 'table', database, table },
    database,
    false
  );
}

export async function recalculateDatabaseStorage(serverId: string, database: string, accountId?: string | null) {
  const server = await requireServer(accountId, serverId);
  const catalogDatabase = (server.databases || []).find(item => item.name === database);
  const tables = Array.from(new Set([
    ...(catalogDatabase?.tables || []),
    ...(catalogDatabase?.tableDetails || []).map(table => table.tableName)
  ])).filter(Boolean);

  const tableResults: DatabaseStorageRecalculation[] = [];
  const failedTables: Array<{ table: string; message: string }> = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < tables.length) {
      const index = cursor++;
      const table = tables[index];
      try {
        tableResults.push(await measureTableStorage(serverId, database, table, accountId));
      } catch (error) {
        failedTables.push({ table, message: error instanceof Error ? error.message : String(error) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, Math.max(1, tables.length)) }, () => worker()));

  const databaseResult = await workbenchRequest<DatabaseStorageRecalculation>(
    serverId,
    accountId,
    'storage-recalculate',
    { scope: 'database', database },
    database,
    false
  );

  const hasCompleteExactCounts =
    failedTables.length === 0 &&
    tables.length === tableResults.length &&
    tableResults.every(result => result.rowCountSource === 'exact-count' && result.rows !== null);
  const exactTotalRows = hasCompleteExactCounts
    ? tableResults.reduce((sum, result) => sum + Number(result.rows || 0), 0)
    : databaseResult.rows;
  const normalizedDatabaseResult: DatabaseStorageRecalculation = {
    ...databaseResult,
    rows: exactTotalRows,
    rowCountSource: hasCompleteExactCounts ? 'exact-count' : 'metadata-estimate'
  };

  await persistStorageRecalculations(serverId, [normalizedDatabaseResult, ...tableResults]);
  return { ...normalizedDatabaseResult, tableResults, failedTables };
}

export async function recalculateTableStorage(serverId: string, database: string, table: string, accountId?: string | null) {
  const result = await measureTableStorage(serverId, database, table, accountId);
  await persistStorageRecalculations(serverId, [result]);
  return result;
}

export function runDatabaseMaintenanceStep(
  serverId: string,
  input: DatabaseMaintenanceStepInput,
  accountId?: string | null
) {
  return workbenchRequest<DatabaseMaintenanceStepResponse>(
    serverId,
    accountId,
    'maintenance-run',
    input as unknown as Record<string, unknown>,
    input.database,
    false
  );
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
