import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import mysql, { type Connection } from 'mysql2/promise';
import type { DatabaseConnectionPayload, QueryExecutionResult } from 'types';
import type {
  DatabaseTransactionAction,
  DatabaseTransactionRequest,
  DatabaseTransactionState,
  DatabaseTransactionStatement
} from '@/lib/databaseTransactionTypes';
import { DatabaseServiceError } from '@/lib/server/database-service';

interface TransactionSession {
  id: string;
  ownerId: string;
  database: string | null;
  connection: Connection;
  timeoutMs: number;
  startedAt: number;
  lastActivityAt: number;
  expiresAt: number;
  expiryTimer?: ReturnType<typeof setTimeout>;
  statements: DatabaseTransactionStatement[];
}

const TRANSACTION_ACTIONS = new Set<DatabaseTransactionAction>([
  'transaction-begin',
  'transaction-query',
  'transaction-commit',
  'transaction-rollback',
  'transaction-status'
]);
const TRANSACTION_TTL_MS = 10 * 60 * 1000;
const MAX_TRANSACTIONS_PER_OWNER = 4;
const MAX_TOTAL_TRANSACTIONS = 100;
const MAX_STATEMENTS = 200;

const globalTransactions = globalThis as typeof globalThis & {
  __coreorDatabaseTransactions?: Map<string, TransactionSession>;
};
const sessions = globalTransactions.__coreorDatabaseTransactions ?? new Map<string, TransactionSession>();
globalTransactions.__coreorDatabaseTransactions = sessions;

export function isDatabaseTransactionAction(value: unknown): value is DatabaseTransactionAction {
  return typeof value === 'string' && TRANSACTION_ACTIONS.has(value as DatabaseTransactionAction);
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), minimum), maximum) : fallback;
}

function splitEnvironmentList(value: string | undefined) {
  return (value ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
}

function matchesHostPattern(host: string, pattern: string) {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === pattern;
}

function isExplicitlyAllowedHost(host: string) {
  return splitEnvironmentList(process.env.DATABASE_ALLOWED_HOSTS).some(pattern => matchesHostPattern(host, pattern));
}

function assertAllowedPort(port: number) {
  const ports = splitEnvironmentList(process.env.DATABASE_ALLOWED_PORTS || '3306');
  if (!ports.includes('*') && !ports.includes(String(port))) {
    throw new DatabaseServiceError(`Port ${port} sunucu tarafında izinli değil.`, 403, 'DATABASE_PORT_NOT_ALLOWED');
  }
}

function isReservedIpv4(address: string) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b, c] = octets;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) || a >= 224;
}

function isReservedAddress(address: string) {
  const normalized = address.toLowerCase();
  const family = isIP(normalized);
  if (family === 4) return isReservedIpv4(normalized);
  if (family === 6) {
    if (normalized.startsWith('::ffff:')) return isReservedIpv4(normalized.slice(7));
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff') || normalized.startsWith('2001:db8:');
  }
  return true;
}

async function resolveAllowedHost(host: string) {
  const normalized = host.trim().toLowerCase();
  if (!normalized || normalized.length > 253 || /[\s/\\]/.test(normalized)) {
    throw new DatabaseServiceError('Geçerli bir MySQL host adresi girilmelidir.', 422, 'INVALID_DATABASE_HOST');
  }
  const allowed = isExplicitlyAllowedHost(normalized);
  const addresses = isIP(normalized) ? [{ address: normalized }] : await lookup(normalized, { all: true, verbatim: true });
  if (!addresses.length) throw new DatabaseServiceError('MySQL host adresi çözümlenemedi.', 422, 'DATABASE_HOST_NOT_FOUND');
  if (!allowed && addresses.some(item => isReservedAddress(item.address))) {
    throw new DatabaseServiceError('Özel ağ adresi DATABASE_ALLOWED_HOSTS allowlist değerine eklenmelidir.', 403, 'PRIVATE_DATABASE_HOST_NOT_ALLOWED');
  }
  return { originalHost: normalized, resolvedHost: addresses[0].address };
}

function parseConnection(value: DatabaseConnectionPayload | undefined) {
  if (!value || (value.engine !== 'mysql' && value.engine !== 'mariadb')) {
    throw new DatabaseServiceError('Desteklenmeyen veritabanı motoru.', 422, 'UNSUPPORTED_DATABASE_ENGINE');
  }
  const host = value.host?.trim();
  const username = value.username?.trim();
  if (!host || !username || !value.password) {
    throw new DatabaseServiceError('Host, kullanıcı adı ve parola zorunludur.', 422, 'INCOMPLETE_DATABASE_CONNECTION');
  }
  return {
    ...value,
    host,
    username,
    port: boundedInteger(value.port, 3306, 1, 65535),
    connectTimeoutMs: boundedInteger(value.connectTimeoutMs, 20_000, 3_000, 60_000)
  };
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return { type: 'binary', base64: value.toString('base64') };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, jsonSafe(nested)]));
  return value;
}

function limitSelect(sql: string, maximumRows: number) {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (!/^(select|with|show|describe|desc|explain)\b/i.test(trimmed)) return trimmed;
  if (/\blimit\s+\d+(?:\s*,\s*\d+)?\s*$/i.test(trimmed)) return trimmed;
  return /^(select|with)\b/i.test(trimmed) ? `${trimmed} LIMIT ${maximumRows}` : trimmed;
}

function assertTransactionSql(sql: string) {
  const trimmed = sql.trim().replace(/^\/\*[\s\S]*?\*\//, '').trim();
  if (!trimmed) throw new DatabaseServiceError('Çalıştırılacak SQL boş olamaz.', 422, 'EMPTY_SQL_QUERY');
  if (/^(commit|rollback|begin|start\s+transaction|set\s+autocommit)\b/i.test(trimmed)) {
    throw new DatabaseServiceError('Transaction kontrolü çalışma alanındaki Commit/Rollback düğmelerinden yapılmalıdır.', 422, 'TRANSACTION_CONTROL_SQL_BLOCKED');
  }
  if (/^(create|alter|drop|truncate|rename|grant|revoke|lock|unlock|analyze|optimize|repair)\b/i.test(trimmed)) {
    throw new DatabaseServiceError('Implicit commit oluşturabilecek DDL/yönetim sorguları transaction çalışma alanında engellenir.', 422, 'TRANSACTION_IMPLICIT_COMMIT_BLOCKED');
  }
  return trimmed;
}

function publicState(session: TransactionSession): DatabaseTransactionState {
  return {
    transactionId: session.id,
    database: session.database,
    startedAt: new Date(session.startedAt).toISOString(),
    lastActivityAt: new Date(session.lastActivityAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    statements: session.statements
  };
}

async function dispose(session: TransactionSession, mode: 'rollback' | 'commit' = 'rollback') {
  sessions.delete(session.id);
  if (session.expiryTimer) clearTimeout(session.expiryTimer);
  session.expiryTimer = undefined;
  try {
    if (mode === 'commit') await session.connection.commit();
    else await session.connection.rollback();
  } finally {
    await session.connection.end().catch(() => undefined);
  }
}

function scheduleExpiry(session: TransactionSession) {
  if (session.expiryTimer) clearTimeout(session.expiryTimer);
  const delay = Math.max(1, session.expiresAt - Date.now());
  const timer = setTimeout(() => {
    const current = sessions.get(session.id);
    if (current !== session) return;
    if (session.expiresAt > Date.now()) {
      scheduleExpiry(session);
      return;
    }
    void dispose(session, 'rollback').catch(() => undefined);
  }, delay);
  timer.unref?.();
  session.expiryTimer = timer;
}

async function cleanupExpired() {
  const now = Date.now();
  const expired = [...sessions.values()].filter(session => session.expiresAt <= now);
  await Promise.all(expired.map(session => dispose(session, 'rollback').catch(() => undefined)));
}

function requireOwnedSession(transactionId: unknown, ownerId: string) {
  const id = typeof transactionId === 'string' ? transactionId : '';
  const session = sessions.get(id);
  if (!session || session.ownerId !== ownerId) {
    throw new DatabaseServiceError('Transaction oturumu bulunamadı veya süresi doldu.', 404, 'TRANSACTION_NOT_FOUND');
  }
  session.lastActivityAt = Date.now();
  session.expiresAt = session.lastActivityAt + TRANSACTION_TTL_MS;
  scheduleExpiry(session);
  return session;
}

async function begin(input: DatabaseTransactionRequest, ownerId: string) {
  await cleanupExpired();
  if (sessions.size >= MAX_TOTAL_TRANSACTIONS) throw new DatabaseServiceError('Sunucudaki açık transaction sınırına ulaşıldı.', 429, 'TRANSACTION_CAPACITY_REACHED');
  const ownerSessions = [...sessions.values()].filter(session => session.ownerId === ownerId);
  if (ownerSessions.length >= MAX_TRANSACTIONS_PER_OWNER) throw new DatabaseServiceError('Aynı kullanıcı için en fazla dört açık transaction olabilir.', 429, 'OWNER_TRANSACTION_LIMIT');

  const connectionInput = parseConnection(input.connection);
  assertAllowedPort(connectionInput.port);
  const resolved = await resolveAllowedHost(connectionInput.host);
  const database = input.database === null ? null : input.database || connectionInput.database || null;
  const ssl = connectionInput.sslMode === 'disabled' ? undefined : {
    rejectUnauthorized: connectionInput.sslMode === 'required',
    ...(isIP(resolved.originalHost) ? {} : { servername: resolved.originalHost })
  };
  const connection = await mysql.createConnection({
    host: resolved.resolvedHost,
    port: connectionInput.port,
    user: connectionInput.username,
    password: connectionInput.password,
    database: database || undefined,
    connectTimeout: connectionInput.connectTimeoutMs,
    charset: 'utf8mb4',
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    multipleStatements: false,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ssl
  });
  await connection.beginTransaction();
  const now = Date.now();
  const session: TransactionSession = {
    id: randomUUID(),
    ownerId,
    database,
    connection,
    timeoutMs: boundedInteger(process.env.DATABASE_QUERY_TIMEOUT_MS, 30_000, 3_000, 120_000),
    startedAt: now,
    lastActivityAt: now,
    expiresAt: now + TRANSACTION_TTL_MS,
    statements: []
  };
  sessions.set(session.id, session);
  scheduleExpiry(session);
  return { transaction: publicState(session) };
}

async function query(input: DatabaseTransactionRequest, ownerId: string) {
  await cleanupExpired();
  const session = requireOwnedSession(input.transactionId, ownerId);
  const rawSql = assertTransactionSql(input.sql || '');
  const maximumRows = boundedInteger(process.env.DATABASE_MAX_RESULT_ROWS, 5_000, 100, 50_000);
  const sql = limitSelect(rawSql, maximumRows);
  const startedAt = performance.now();
  const statement: DatabaseTransactionStatement = {
    id: randomUUID(),
    sql,
    executedAt: new Date().toISOString(),
    durationMs: 0,
    rowCount: 0,
    affectedRows: 0,
    status: 'success'
  };
  try {
    const [result, fields] = await session.connection.query({ sql, timeout: session.timeoutMs });
    statement.durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    let response: QueryExecutionResult;
    if (Array.isArray(result)) {
      const rows = jsonSafe(result) as Record<string, unknown>[];
      statement.rowCount = rows.length;
      response = { rows, fields: fields?.map(field => ({ name: field.name, type: field.type })) ?? [], maximumRows, _meta: { statements: [{ sql, label: 'Transaction sorgusu' }] } };
    } else {
      const header = result as unknown as Record<string, unknown>;
      statement.affectedRows = Number(header.affectedRows ?? 0);
      response = { rows: [], affectedRows: statement.affectedRows, insertId: jsonSafe(header.insertId) as string | number | undefined, warningStatus: Number(header.warningStatus ?? 0), _meta: { statements: [{ sql, label: 'Transaction sorgusu' }] } };
    }
    session.statements = [...session.statements, statement].slice(-MAX_STATEMENTS);
    return { transaction: publicState(session), result: response };
  } catch (error) {
    statement.durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    statement.status = 'error';
    statement.error = error instanceof Error ? error.message : 'Transaction sorgusu başarısız oldu.';
    session.statements = [...session.statements, statement].slice(-MAX_STATEMENTS);
    throw new DatabaseServiceError(statement.error, 422, 'TRANSACTION_QUERY_FAILED');
  }
}

async function finish(input: DatabaseTransactionRequest, ownerId: string, mode: 'commit' | 'rollback') {
  await cleanupExpired();
  const session = requireOwnedSession(input.transactionId, ownerId);
  const statementCount = session.statements.length;
  await dispose(session, mode);
  return { transactionId: session.id, status: mode === 'commit' ? 'committed' as const : 'rolled-back' as const, statementCount };
}

export async function executeDatabaseTransactionRequest(input: DatabaseTransactionRequest, ownerId: string) {
  if (!isDatabaseTransactionAction(input.action)) throw new DatabaseServiceError('Desteklenmeyen transaction işlemi.', 422, 'UNSUPPORTED_TRANSACTION_ACTION');
  switch (input.action) {
    case 'transaction-begin':
      return begin(input, ownerId);
    case 'transaction-query':
      return query(input, ownerId);
    case 'transaction-commit':
      return finish(input, ownerId, 'commit');
    case 'transaction-rollback':
      return finish(input, ownerId, 'rollback');
    case 'transaction-status':
      await cleanupExpired();
      return { transactions: [...sessions.values()].filter(session => session.ownerId === ownerId).map(publicState) };
  }
}
