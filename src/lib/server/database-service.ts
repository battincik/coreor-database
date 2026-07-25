import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import mysql from 'mysql2/promise';
import type {
  DatabaseApiAction,
  DatabaseConnectionPayload,
  DatabaseQueryMeta,
  DatabaseQueryStatement,
  TableDataFilter,
  TableDataFilterOperator,
  TableDataSort,
  TableInfo
} from 'types';

interface DatabaseApiRequest {
  action: DatabaseApiAction;
  connection: DatabaseConnectionPayload;
  database?: string;
  table?: string;
  page?: number;
  pageSize?: number;
  sorts?: TableDataSort[];
  filters?: TableDataFilter[];
  includeTotal?: boolean;
  knownTotalRows?: number;
  sql?: string;
}

export class DatabaseServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 422,
    public readonly code = 'DATABASE_REQUEST_FAILED',
    public queryMeta?: DatabaseQueryMeta
  ) {
    super(message);
    this.name = 'DatabaseServiceError';
  }
}

const SYSTEM_DATABASES = new Set(['information_schema', 'performance_schema', 'sys']);
const FILTER_OPERATORS = new Set<TableDataFilterOperator>([
  'contains',
  'equals',
  'startsWith',
  'endsWith',
  'gt',
  'gte',
  'lt',
  'lte',
  'isNull',
  'isNotNull'
]);

function splitEnvironmentList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
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
  const normalizedHost = host.trim().toLowerCase();
  return splitEnvironmentList(process.env.DATABASE_ALLOWED_HOSTS).some(pattern => matchesHostPattern(normalizedHost, pattern));
}

function assertAllowedPort(port: number) {
  const configuredPorts = splitEnvironmentList(process.env.DATABASE_ALLOWED_PORTS || '3306');
  if (configuredPorts.includes('*')) return;
  if (!configuredPorts.includes(String(port))) {
    throw new DatabaseServiceError(
      `Port ${port} sunucu tarafında izinli değil. DATABASE_ALLOWED_PORTS değerini güncelleyin.`,
      403,
      'DATABASE_PORT_NOT_ALLOWED'
    );
  }
}

function isReservedIpv4(address: string) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isReservedAddress(address: string) {
  const normalizedAddress = address.toLowerCase();
  const family = isIP(normalizedAddress);
  if (family === 4) return isReservedIpv4(normalizedAddress);
  if (family === 6) {
    if (normalizedAddress.startsWith('::ffff:')) return isReservedIpv4(normalizedAddress.slice(7));
    return (
      normalizedAddress === '::' ||
      normalizedAddress === '::1' ||
      normalizedAddress.startsWith('fc') ||
      normalizedAddress.startsWith('fd') ||
      /^fe[89ab]/.test(normalizedAddress) ||
      normalizedAddress.startsWith('ff') ||
      normalizedAddress.startsWith('2001:db8:')
    );
  }
  return true;
}

async function resolveAllowedHost(host: string) {
  const normalizedHost = host.trim().toLowerCase();
  if (!normalizedHost || normalizedHost.length > 253 || /[\s/\\]/.test(normalizedHost)) {
    throw new DatabaseServiceError('Geçerli bir MySQL host adresi girilmelidir.', 422, 'INVALID_DATABASE_HOST');
  }

  const explicitlyAllowed = isExplicitlyAllowedHost(normalizedHost);
  const resolvedAddresses = isIP(normalizedHost)
    ? [{ address: normalizedHost, family: isIP(normalizedHost) }]
    : await lookup(normalizedHost, { all: true, verbatim: true });

  if (resolvedAddresses.length === 0) {
    throw new DatabaseServiceError('MySQL host adresi çözümlenemedi.', 422, 'DATABASE_HOST_NOT_FOUND');
  }

  if (!explicitlyAllowed && resolvedAddresses.some(item => isReservedAddress(item.address))) {
    throw new DatabaseServiceError(
      'Özel, yerel veya ayrılmış ağ adresleri varsayılan olarak engellenir. Bu sunucuyu DATABASE_ALLOWED_HOSTS allowlist değerine ekleyin.',
      403,
      'PRIVATE_DATABASE_HOST_NOT_ALLOWED'
    );
  }

  return { originalHost: normalizedHost, resolvedHost: resolvedAddresses[0].address };
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), minimum), maximum) : fallback;
}

function parseConnection(value: DatabaseConnectionPayload) {
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

function quoteIdentifier(identifier: string, fieldName: string) {
  const normalized = identifier?.trim();
  if (!normalized || normalized.length > 128 || normalized.includes('\0')) {
    throw new DatabaseServiceError(`${fieldName} geçersiz.`, 422, 'INVALID_DATABASE_IDENTIFIER');
  }
  return `\`${normalized.replace(/`/g, '``')}\``;
}

function qualifiedTable(databaseName: string, tableName: string) {
  return `${quoteIdentifier(databaseName, 'Veritabanı adı')}.${quoteIdentifier(tableName, 'Tablo adı')}`;
}

function records(value: unknown) {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return { type: 'binary', base64: value.toString('base64') };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, jsonSafe(nestedValue)]));
  }
  return value;
}

function pushStatement(statements: DatabaseQueryStatement[], sql: string, parameters: unknown[] = [], label?: string) {
  statements.push({ sql: sql.trim(), parameters: parameters.map(jsonSafe), label });
}

function withMeta<T extends Record<string, unknown>>(result: T, statements: DatabaseQueryStatement[]) {
  return { ...result, _meta: { statements } satisfies DatabaseQueryMeta };
}

function limitSelectStatement(sql: string, maximumRows: number) {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (!/^select\b/i.test(trimmed)) return trimmed;
  const trailingLimit = /\blimit\s+(?:(\d+)\s*,\s*)?(\d+)\s*$/i.exec(trimmed);
  if (!trailingLimit) return `${trimmed} LIMIT ${maximumRows}`;
  const offset = trailingLimit[1];
  const requestedRows = boundedInteger(trailingLimit[2], maximumRows, 1, maximumRows);
  const replacement = offset ? `LIMIT ${offset}, ${requestedRows}` : `LIMIT ${requestedRows}`;
  return `${trimmed.slice(0, trailingLimit.index)}${replacement}`;
}

function normalizeSorts(value: unknown): TableDataSort[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 5)
    .filter(item => item && typeof item.column === 'string' && (item.direction === 'asc' || item.direction === 'desc'))
    .map(item => ({ column: item.column.trim(), direction: item.direction }));
}

function normalizeFilters(value: unknown): TableDataFilter[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 12)
    .filter(item => item && typeof item.column === 'string' && FILTER_OPERATORS.has(item.operator))
    .map(item => ({
      id: typeof item.id === 'string' ? item.id : undefined,
      column: item.column.trim(),
      operator: item.operator,
      value: typeof item.value === 'string' ? item.value : undefined
    }));
}

function buildWhereClause(filters: TableDataFilter[]) {
  const clauses: string[] = [];
  const parameters: unknown[] = [];

  for (const filter of filters) {
    const column = quoteIdentifier(filter.column, 'Filtre kolonu');
    const value = filter.value ?? '';

    switch (filter.operator) {
      case 'contains':
        if (!value) break;
        clauses.push(`CAST(${column} AS CHAR) LIKE ?`);
        parameters.push(`%${value}%`);
        break;
      case 'startsWith':
        if (!value) break;
        clauses.push(`CAST(${column} AS CHAR) LIKE ?`);
        parameters.push(`${value}%`);
        break;
      case 'endsWith':
        if (!value) break;
        clauses.push(`CAST(${column} AS CHAR) LIKE ?`);
        parameters.push(`%${value}`);
        break;
      case 'equals':
        clauses.push(`${column} <=> ?`);
        parameters.push(value);
        break;
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        if (!value) break;
        const operator = filter.operator === 'gt' ? '>' : filter.operator === 'gte' ? '>=' : filter.operator === 'lt' ? '<' : '<=';
        clauses.push(`${column} ${operator} ?`);
        parameters.push(value);
        break;
      }
      case 'isNull':
        clauses.push(`${column} IS NULL`);
        break;
      case 'isNotNull':
        clauses.push(`${column} IS NOT NULL`);
        break;
    }
  }

  return {
    sql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    parameters
  };
}

async function catalog(
  connection: Awaited<ReturnType<typeof mysql.createConnection>>,
  timeoutMs: number,
  statements: DatabaseQueryStatement[]
) {
  const sql = `
    SELECT schema_source.SCHEMA_NAME AS databaseName, NULL AS tableName
    FROM information_schema.SCHEMATA AS schema_source
    UNION ALL
    SELECT table_source.TABLE_SCHEMA AS databaseName, table_source.TABLE_NAME AS tableName
    FROM information_schema.TABLES AS table_source
    WHERE table_source.TABLE_TYPE = 'BASE TABLE'
    ORDER BY databaseName, tableName
  `;
  pushStatement(statements, sql, [], 'Veritabanı ve tablo kataloğu');
  const [rows] = await connection.query({ sql, timeout: timeoutMs });
  const databaseMap = new Map<string, string[]>();

  for (const row of records(rows)) {
    const databaseName = String(row.databaseName ?? '');
    if (!databaseName || SYSTEM_DATABASES.has(databaseName)) continue;
    if (!databaseMap.has(databaseName)) databaseMap.set(databaseName, []);
    if (row.tableName) {
      const tableName = String(row.tableName);
      const tables = databaseMap.get(databaseName)!;
      if (!tables.includes(tableName)) tables.push(tableName);
    }
  }

  return withMeta({ databases: Array.from(databaseMap, ([name, tables]) => ({ name, tables })) }, statements);
}

async function tableInfo(
  connection: Awaited<ReturnType<typeof mysql.createConnection>>,
  databaseName: string,
  tableName: string,
  timeoutMs: number,
  statements: DatabaseQueryStatement[]
): Promise<TableInfo> {
  const columnSql = `SELECT COLUMN_NAME AS Field, COLUMN_TYPE AS Type, IS_NULLABLE AS \`Null\`, COLUMN_KEY AS \`Key\`, COLUMN_DEFAULT AS \`Default\`, EXTRA AS Extra
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`;
  const indexSql = `SELECT INDEX_NAME AS Key_name, COLUMN_NAME AS Column_name, NON_UNIQUE AS Non_unique, SEQ_IN_INDEX AS Seq_in_index
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX`;
  const foreignKeySql = `SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY ORDINAL_POSITION`;
  const createSql = `SHOW CREATE TABLE ${qualifiedTable(databaseName, tableName)}`;
  const parameters = [databaseName, tableName];

  pushStatement(statements, columnSql, parameters, 'Kolon bilgileri');
  const [columnRows] = await connection.query({ sql: columnSql, timeout: timeoutMs }, parameters);
  pushStatement(statements, indexSql, parameters, 'İndeks bilgileri');
  const [indexRows] = await connection.query({ sql: indexSql, timeout: timeoutMs }, parameters);
  pushStatement(statements, foreignKeySql, parameters, 'Foreign key bilgileri');
  const [foreignKeyRows] = await connection.query({ sql: foreignKeySql, timeout: timeoutMs }, parameters);
  pushStatement(statements, createSql, [], 'CREATE TABLE tanımı');
  const [createRows] = await connection.query({ sql: createSql, timeout: timeoutMs });
  const createRecord = records(createRows)[0] ?? {};

  return {
    columns: records(columnRows).map(row => ({
      Field: String(row.Field ?? ''),
      Type: String(row.Type ?? ''),
      Null: String(row.Null ?? ''),
      Key: String(row.Key ?? ''),
      Default: row.Default === null || row.Default === undefined ? null : String(row.Default),
      Extra: String(row.Extra ?? '')
    })),
    indexes: records(indexRows).map(row => ({
      Key_name: String(row.Key_name ?? ''),
      Column_name: String(row.Column_name ?? ''),
      Non_unique: String(row.Non_unique ?? ''),
      Seq_in_index: String(row.Seq_in_index ?? '')
    })),
    foreignKeys: records(foreignKeyRows).map(row => ({
      COLUMN_NAME: String(row.COLUMN_NAME ?? ''),
      REFERENCED_TABLE_NAME: String(row.REFERENCED_TABLE_NAME ?? ''),
      REFERENCED_COLUMN_NAME: String(row.REFERENCED_COLUMN_NAME ?? '')
    })),
    createSQL: String(createRecord['Create Table'] ?? createRecord['Create View'] ?? ''),
    _meta: { statements }
  };
}

async function tableData(
  connection: Awaited<ReturnType<typeof mysql.createConnection>>,
  input: DatabaseApiRequest,
  timeoutMs: number,
  statements: DatabaseQueryStatement[]
) {
  const databaseName = input.database ?? '';
  const tableName = input.table ?? '';
  const table = qualifiedTable(databaseName, tableName);
  const maximumPageSize = boundedInteger(process.env.DATABASE_MAX_PAGE_SIZE, 500, 25, 5_000);
  const pageSize = boundedInteger(input.pageSize, 50, 10, maximumPageSize);
  const requestedPage = boundedInteger(input.page, 1, 1, 10_000_000);
  const sorts = normalizeSorts(input.sorts);
  const filters = normalizeFilters(input.filters);
  const where = buildWhereClause(filters);
  const orderSql = sorts.length
    ? ` ORDER BY ${sorts.map(sort => `${quoteIdentifier(sort.column, 'Sıralama kolonu')} ${sort.direction.toUpperCase()}`).join(', ')}`
    : '';

  const knownTotal = Number.isFinite(Number(input.knownTotalRows)) ? Math.max(0, Number(input.knownTotalRows)) : undefined;
  const shouldCount = input.includeTotal !== false || knownTotal === undefined;
  let totalRows = knownTotal ?? 0;

  if (shouldCount) {
    const countSql = `SELECT COUNT(*) AS totalRows FROM ${table}${where.sql}`;
    pushStatement(statements, countSql, where.parameters, 'Toplam satır sayısı');
    const [countRows] = await connection.query({ sql: countSql, timeout: timeoutMs }, where.parameters);
    totalRows = Number(records(countRows)[0]?.totalRows ?? 0);
  }

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const dataSql = `SELECT * FROM ${table}${where.sql}${orderSql} LIMIT ${pageSize} OFFSET ${offset}`;
  pushStatement(statements, dataSql, where.parameters, 'Tablo satırları');
  const [rows] = await connection.query({ sql: dataSql, timeout: timeoutMs }, where.parameters);

  return withMeta(
    {
      data: jsonSafe(rows) as Record<string, unknown>[],
      pagination: {
        page,
        pageSize,
        totalRows,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages
      },
      sorts,
      filters
    },
    statements
  );
}

async function queryDatabase(
  connection: Awaited<ReturnType<typeof mysql.createConnection>>,
  sql: string,
  timeoutMs: number,
  statements: DatabaseQueryStatement[]
) {
  if (!sql.trim()) throw new DatabaseServiceError('Çalıştırılacak SQL sorgusu boş olamaz.', 422, 'EMPTY_SQL_QUERY');
  const maximumRows = boundedInteger(process.env.DATABASE_MAX_RESULT_ROWS, 5_000, 100, 50_000);
  const limitedSql = limitSelectStatement(sql, maximumRows);
  pushStatement(statements, limitedSql, [], 'SQL editörü sorgusu');
  const [result, fields] = await connection.query({ sql: limitedSql, timeout: timeoutMs });

  if (Array.isArray(result)) {
    return withMeta(
      {
        rows: jsonSafe(result) as Record<string, unknown>[],
        fields: fields?.map(field => ({ name: field.name, type: field.type })) ?? [],
        maximumRows
      },
      statements
    );
  }

  const header = result as unknown as Record<string, unknown>;
  return withMeta(
    {
      rows: [],
      affectedRows: Number(header.affectedRows ?? 0),
      insertId: jsonSafe(header.insertId),
      warningStatus: Number(header.warningStatus ?? 0)
    },
    statements
  );
}

function normalizeDatabaseError(error: unknown) {
  if (error instanceof DatabaseServiceError) return error;
  const candidate = error as { code?: string; message?: string };
  const code = candidate?.code ?? 'DATABASE_CONNECTION_FAILED';
  const message = candidate?.message ?? 'Veritabanı işlemi başarısız oldu.';
  if (['ETIMEDOUT', 'PROTOCOL_SEQUENCE_TIMEOUT', 'ECONNREFUSED'].includes(code)) {
    return new DatabaseServiceError('Veritabanı sunucusuna zamanında bağlanılamadı.', 504, code);
  }
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return new DatabaseServiceError('Veritabanı host adresi çözümlenemedi.', 422, code);
  }
  return new DatabaseServiceError(message, 422, code);
}

export async function executeDatabaseRequest(input: DatabaseApiRequest) {
  const connectionInput = parseConnection(input.connection);
  assertAllowedPort(connectionInput.port);
  const resolvedHost = await resolveAllowedHost(connectionInput.host);
  const ssl =
    connectionInput.sslMode === 'disabled'
      ? undefined
      : {
          rejectUnauthorized: connectionInput.sslMode === 'required',
          ...(isIP(resolvedHost.originalHost) ? {} : { servername: resolvedHost.originalHost })
        };

  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | null = null;
  const statements: DatabaseQueryStatement[] = [];

  try {
    connection = await mysql.createConnection({
      host: resolvedHost.resolvedHost,
      port: connectionInput.port,
      user: connectionInput.username,
      password: connectionInput.password,
      database: input.database || connectionInput.database || undefined,
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

    const queryTimeoutMs = boundedInteger(process.env.DATABASE_QUERY_TIMEOUT_MS, 30_000, 3_000, 120_000);

    switch (input.action) {
      case 'test': {
        const sql = 'SELECT VERSION() AS version, DATABASE() AS databaseName, CURRENT_USER() AS currentUser';
        pushStatement(statements, sql, [], 'Bağlantı testi');
        const [rows] = await connection.query({ sql, timeout: queryTimeoutMs });
        return withMeta({ connection: jsonSafe(records(rows)[0] ?? {}) as Record<string, unknown> }, statements);
      }
      case 'catalog':
        return await catalog(connection, queryTimeoutMs, statements);
      case 'table-info':
        return await tableInfo(connection, input.database ?? '', input.table ?? '', queryTimeoutMs, statements);
      case 'table-data':
        return await tableData(connection, input, queryTimeoutMs, statements);
      case 'query':
        return await queryDatabase(connection, input.sql ?? '', queryTimeoutMs, statements);
      default:
        throw new DatabaseServiceError('Desteklenmeyen veritabanı işlemi.', 422, 'UNSUPPORTED_DATABASE_ACTION');
    }
  } catch (error) {
    const normalized = normalizeDatabaseError(error);
    if (!normalized.queryMeta && statements.length > 0) normalized.queryMeta = { statements };
    throw normalized;
  } finally {
    if (connection) await connection.end().catch(() => undefined);
  }
}
