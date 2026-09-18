'use client';

import type { DatabaseConnectionPayload, DatabaseServerConfig } from 'types';
import type {
  DatabaseTransactionBeginResponse,
  DatabaseTransactionFinishResponse,
  DatabaseTransactionQueryResponse,
  DatabaseTransactionRequest,
  DatabaseTransactionStatusResponse
} from '@/lib/databaseTransactionTypes';
import { readEncryptedServerProfiles } from '@/lib/secureVault';
import { recordActivity } from '@/lib/activityConsole';
import { normalizeDatabaseClientError } from '@/lib/databaseErrorPresentation';
import { desktopDatabaseRequest } from '@/lib/desktopClient';

async function requireServer(accountId: string | null | undefined, serverId: string) {
  const servers = await readEncryptedServerProfiles(accountId);
  const server = servers.find(item => item.id === serverId);
  if (!server) throw new Error('Sunucu profili yerel config içinde bulunamadı.');
  return server;
}

function connectionPayload(server: DatabaseServerConfig, database?: string | null): DatabaseConnectionPayload {
  const engine = server.databaseType ?? 'mysql';
  if (!server.host?.trim() || !server.username?.trim() || !server.password) throw new Error('Host, kullanıcı adı veya parola eksik.');
  const defaultPort = engine === 'postgresql' || engine === 'cockroachdb' ? 5432 : engine === 'mssql' ? 1433 : 3306;
  return {
    engine,
    host: server.host.trim(),
    port: server.port ?? defaultPort,
    username: server.username.trim(),
    password: server.password,
    database,
    sslMode: server.sslMode ?? 'required',
    connectTimeoutMs: server.connectionTimeoutMs ?? 20_000,
    readOnly: Boolean(server.readOnly)
  };
}

async function requestTransaction<T>(payload: DatabaseTransactionRequest) {
  try {
    return await desktopDatabaseRequest<T>(payload as unknown as Record<string, unknown>);
  } catch (error) {
    throw normalizeDatabaseClientError(error);
  }
}

export async function beginDatabaseTransaction(serverId: string, accountId?: string | null, database?: string | null) {
  const server = await requireServer(accountId, serverId);
  const startedAt = performance.now();
  try {
    const result = await requestTransaction<DatabaseTransactionBeginResponse>({
      action: 'transaction-begin',
      connection: connectionPayload(server, database),
      database: database ?? null
    });
    recordActivity({
      level: 'success',
      category: 'query',
      title: 'Transaction başlatıldı',
      message: `${server.name} üzerinde transaction oturumu açıldı.`,
      serverId: server.id,
      serverName: server.name,
      host: server.host,
      databaseName: database || undefined,
      sql: 'START TRANSACTION',
      durationMs: Math.max(0, Math.round(performance.now() - startedAt))
    });
    return result;
  } catch (error) {
    const normalizedError = normalizeDatabaseClientError(error);
    recordActivity({
      level: 'error',
      category: 'query',
      title: 'Transaction başlatılamadı',
      message: normalizedError.message,
      serverId: server.id,
      serverName: server.name,
      host: server.host,
      databaseName: database || undefined,
      sql: 'START TRANSACTION',
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      errorCode: normalizedError.code
    });
    throw normalizedError;
  }
}

export async function executeDatabaseTransactionQuery(serverId: string, transactionId: string, sql: string, accountId?: string | null, database?: string | null) {
  const server = await requireServer(accountId, serverId);
  const startedAt = performance.now();
  try {
    const result = await requestTransaction<DatabaseTransactionQueryResponse>({ action: 'transaction-query', transactionId, sql });
    recordActivity({
      level: 'success',
      category: 'query',
      title: 'Transaction sorgusu',
      message: `${server.name} üzerinde açık transaction içinde çalıştırıldı.`,
      serverId: server.id,
      serverName: server.name,
      host: server.host,
      databaseName: database || undefined,
      sql,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      rowCount: result.result.rows.length,
      affectedRows: result.result.affectedRows
    });
    return result;
  } catch (error) {
    const normalizedError = normalizeDatabaseClientError(error);
    recordActivity({
      level: 'error',
      category: 'query',
      title: 'Transaction sorgusu başarısız',
      message: normalizedError.message,
      serverId: server.id,
      serverName: server.name,
      host: server.host,
      databaseName: database || undefined,
      sql,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      errorCode: normalizedError.code
    });
    throw normalizedError;
  }
}

async function finishDatabaseTransaction(serverId: string, transactionId: string, action: 'transaction-commit' | 'transaction-rollback', accountId?: string | null, database?: string | null) {
  const server = await requireServer(accountId, serverId);
  const sql = action === 'transaction-commit' ? 'COMMIT' : 'ROLLBACK';
  const startedAt = performance.now();
  try {
    const result = await requestTransaction<DatabaseTransactionFinishResponse>({ action, transactionId });
    recordActivity({
      level: 'success',
      category: 'query',
      title: action === 'transaction-commit' ? 'Transaction commit edildi' : 'Transaction geri alındı',
      message: `${result.statementCount} statement ile tamamlandı.`,
      serverId: server.id,
      serverName: server.name,
      host: server.host,
      databaseName: database || undefined,
      sql,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt))
    });
    return result;
  } catch (error) {
    const normalizedError = normalizeDatabaseClientError(error);
    recordActivity({
      level: 'error',
      category: 'query',
      title: action === 'transaction-commit' ? 'Transaction commit edilemedi' : 'Transaction geri alınamadı',
      message: normalizedError.message,
      serverId: server.id,
      serverName: server.name,
      host: server.host,
      databaseName: database || undefined,
      sql,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      errorCode: normalizedError.code
    });
    throw normalizedError;
  }
}

export function commitDatabaseTransaction(serverId: string, transactionId: string, accountId?: string | null, database?: string | null) {
  return finishDatabaseTransaction(serverId, transactionId, 'transaction-commit', accountId, database);
}

export function rollbackDatabaseTransaction(serverId: string, transactionId: string, accountId?: string | null, database?: string | null) {
  return finishDatabaseTransaction(serverId, transactionId, 'transaction-rollback', accountId, database);
}

export function fetchDatabaseTransactionStatus() {
  return requestTransaction<DatabaseTransactionStatusResponse>({ action: 'transaction-status' });
}
