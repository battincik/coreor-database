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

interface TransactionApiErrorPayload {
  error?: string;
  message?: string;
}

async function requireServer(accountId: string | null | undefined, serverId: string) {
  if (!accountId) throw new Error('Transaction çalışma alanı için kullanıcı oturumu gerekli.');
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
    database,
    sslMode: server.sslMode ?? 'required',
    connectTimeoutMs: server.connectionTimeoutMs ?? 20_000,
    readOnly: Boolean(server.readOnly)
  };
}

async function requestTransaction<T>(payload: DatabaseTransactionRequest) {
  const response = await fetch('/api/database', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    referrerPolicy: 'same-origin',
    body: JSON.stringify(payload)
  });
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) as T | TransactionApiErrorPayload : null;
  if (!response.ok) {
    const failure = body as TransactionApiErrorPayload | null;
    const error = new Error(failure?.message || `Transaction isteği başarısız oldu (${response.status}).`) as Error & { code?: string };
    error.code = failure?.error;
    throw error;
  }
  return body as T;
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
    recordActivity({
      level: 'error',
      category: 'query',
      title: 'Transaction başlatılamadı',
      message: error instanceof Error ? error.message : 'Transaction başlatılamadı.',
      serverId: server.id,
      serverName: server.name,
      host: server.host,
      databaseName: database || undefined,
      sql: 'START TRANSACTION',
      durationMs: Math.max(0, Math.round(performance.now() - startedAt))
    });
    throw error;
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
    recordActivity({
      level: 'error',
      category: 'query',
      title: 'Transaction sorgusu başarısız',
      message: error instanceof Error ? error.message : 'Transaction sorgusu başarısız oldu.',
      serverId: server.id,
      serverName: server.name,
      host: server.host,
      databaseName: database || undefined,
      sql,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt))
    });
    throw error;
  }
}

async function finishDatabaseTransaction(serverId: string, transactionId: string, action: 'transaction-commit' | 'transaction-rollback', accountId?: string | null, database?: string | null) {
  const server = await requireServer(accountId, serverId);
  const sql = action === 'transaction-commit' ? 'COMMIT' : 'ROLLBACK';
  const startedAt = performance.now();
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
