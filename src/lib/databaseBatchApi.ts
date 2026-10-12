'use client';

import type { DatabaseConnectionPayload, DatabaseQueryExecutionMode, DatabaseServerConfig, QueryExecutionResult } from 'types';
import { recordActivity } from '@/lib/activityConsole';
import { databaseEngineDefinition } from '@/lib/databaseEngines';
import { desktopDatabaseRequest } from '@/lib/desktopClient';
import { normalizeDatabaseClientError } from '@/lib/databaseErrorPresentation';
import { translateRuntime } from '@/lib/i18nRuntime';
import { readLocalServerProfiles } from '@/lib/localProfiles';

export interface DatabaseBatchStatementResult {
  statementIndex: number;
  result: QueryExecutionResult;
}

export interface DatabaseBatchExecutionError {
  statementIndex: number;
  message: string;
}

export interface DatabaseBatchExecutionResult {
  results: DatabaseBatchStatementResult[];
  error?: DatabaseBatchExecutionError;
}

function createConnectionPayload(server: DatabaseServerConfig, databaseName?: string | null): DatabaseConnectionPayload {
  const engine = server.databaseType ?? 'mysql';
  const definition = databaseEngineDefinition(engine);
  if (!server.host?.trim() || !server.username?.trim()) {
    throw new Error(translateRuntime('apiErrors.hostOrUsernameMissing'));
  }
  return {
    serverId: server.id,
    engine,
    host: server.host.trim(),
    port: server.port ?? definition.defaultPort,
    username: server.username.trim(),
    password: server.password || undefined,
    database: databaseName === undefined ? server.databaseName?.trim() || undefined : databaseName,
    sslMode: server.sslMode ?? 'preferred',
    connectTimeoutMs: server.connectionTimeoutMs ?? 20_000,
    poolMaxConnections: Math.min(
      32,
      Math.max(1, server.poolMaxConnections ?? 6),
      Math.max(1, server.serverMaxConnections ?? 32)
    ),
    readOnly: Boolean(server.readOnly)
  };
}

export async function executeDatabaseQueryBatch(
  serverId: string,
  statements: string[],
  accountId?: string | null,
  databaseName?: string | null,
  options: {
    executionMode?: DatabaseQueryExecutionMode;
    resultLimit?: number;
    statementStartLines?: Array<number | undefined>;
  } = {}
): Promise<DatabaseBatchExecutionResult> {
  void accountId;
  const servers = await readLocalServerProfiles();
  const server = servers.find(item => item.id === serverId);
  if (!server) throw new Error(translateRuntime('apiErrors.serverProfileNotFound'));
  const cleanStatements = statements.map(statement => statement.trim()).filter(Boolean);
  if (!cleanStatements.length) throw new Error('Çalıştırılacak SQL sorgusu boş olamaz.');
  const selectedDatabase = databaseName === undefined ? server.databaseName || undefined : databaseName;
  const startedAt = performance.now();

  try {
    const response = await desktopDatabaseRequest<DatabaseBatchExecutionResult>({
      action: 'query-batch',
      connection: createConnectionPayload(server, selectedDatabase),
      database: selectedDatabase,
      statements: cleanStatements,
      executionMode: options.executionMode ?? 'text',
      resultLimit: options.resultLimit
    });
    const totalDuration = Math.max(0, Math.round(performance.now() - startedAt));

    for (const item of response.results || []) {
      const statementIndex = item.statementIndex || 1;
      const statement = cleanStatements[statementIndex - 1] || '';
      recordActivity({
        level: 'success',
        kind: 'user-query',
        category: 'query',
        title: translateRuntime('apiErrors.queryEditor'),
        message: translateRuntime('apiErrors.executedSuccessfully', { server: server.name }),
        serverId: server.id,
        serverName: server.name,
        host: server.host,
        databaseName: selectedDatabase || undefined,
        sql: statement,
        durationMs: statementIndex === response.results.length && !response.error ? totalDuration : undefined,
        rowCount: item.result.rows?.length,
        affectedRows: item.result.affectedRows,
        statementStartLine: options.statementStartLines?.[statementIndex - 1],
        statementIndex,
        statementCount: cleanStatements.length
      });
    }

    if (response.error) {
      const statement = cleanStatements[response.error.statementIndex - 1] || '';
      recordActivity({
        level: 'error',
        kind: 'error',
        category: 'query',
        title: translateRuntime('apiErrors.queryEditor'),
        message: response.error.message,
        serverId: server.id,
        serverName: server.name,
        host: server.host,
        databaseName: selectedDatabase || undefined,
        sql: statement,
        durationMs: totalDuration,
        statementStartLine: options.statementStartLines?.[response.error.statementIndex - 1],
        statementIndex: response.error.statementIndex,
        statementCount: cleanStatements.length
      });
    }

    return response;
  } catch (error) {
    const normalized = normalizeDatabaseClientError(error);
    throw Object.assign(new Error(normalized.message), {
      code: normalized.code,
      status: normalized.status,
      retryable: normalized.retryable
    });
  }
}
