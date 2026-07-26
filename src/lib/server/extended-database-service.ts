import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Client as PgClient, type ClientConfig as PgClientConfig, type QueryResult } from 'pg';
import mssql from 'mssql';
import type {
  DatabaseApiAction,
  DatabaseCatalogItem,
  DatabaseConnectionPayload,
  DatabaseEngine,
  DatabaseQueryMeta,
  DatabaseQueryStatement,
  DatabaseTable,
  TableColumnInfo,
  TableDataFilter,
  TableDataFilterOperator,
  TableDataSort,
  TableForeignKeyInfo,
  TableIndexInfo,
  TableInfo
} from 'types';
import { DatabaseServiceError } from '@/lib/server/database-service';
import { databaseEngineFamily, databaseEngineDefinition } from '@/lib/databaseEngines';

interface ExtendedDatabaseRequest {
  action: DatabaseApiAction;
  connection: DatabaseConnectionPayload;
  database?: string | null;
  table?: string;
  column?: string;
  value?: unknown;
  primaryKey?: Record<string, unknown>;
  primaryKeys?: Record<string, unknown>[];
  page?: number;
  pageSize?: number;
  sorts?: TableDataSort[];
  filters?: TableDataFilter[];
  includeTotal?: boolean;
  knownTotalRows?: number;
  sql?: string;
}

type ParameterStyle = 'postgresql' | 'mssql';

interface GenericConnection {
  engine: DatabaseEngine;
  database: string;
  query: (sql: string, parameters?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; fields: Array<{ name: string; type: string | number }>; affectedRows: number }>;
  close: () => Promise<void>;
}

const FILTER_OPERATORS = new Set<TableDataFilterOperator>(['contains', 'equals', 'startsWith', 'endsWith', 'gt', 'gte', 'lt', 'lte', 'isNull', 'isNotNull']);

export function isExtendedDatabaseEngine(engine: unknown): engine is Extract<DatabaseEngine, 'postgresql' | 'cockroachdb' | 'mssql'> {
  return engine === 'postgresql' || engine === 'cockroachdb' || engine === 'mssql';
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), minimum), maximum) : fallback;
}

function splitEnvironmentList(value: string | undefined) {
  return (value ?? '').split(',').map(item => item.trim().toLocaleLowerCase('tr-TR')).filter(Boolean);
}

function matchesHostPattern(host: string, pattern: string) {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1));
  return host === pattern;
}

function reservedIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113) || a >= 224;
}

function reservedAddress(address: string) {
  const normalized = address.toLowerCase();
  const family = isIP(normalized);
  if (family === 4) return reservedIpv4(normalized);
  if (family === 6) return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff');
  return true;
}

async function resolveAllowedHost(host: string) {
  const normalized = host.trim().toLocaleLowerCase('tr-TR');
  if (!normalized || normalized.length > 253 || /[\s/\\]/.test(normalized)) throw new DatabaseServiceError('Geçerli bir veritabanı host adresi girilmelidir.', 422, 'INVALID_DATABASE_HOST');
  const allowlist = splitEnvironmentList(process.env.DATABASE_ALLOWED_HOSTS);
  const explicit = allowlist.some(pattern => matchesHostPattern(normalized, pattern));
  const addresses = isIP(normalized) ? [{ address: normalized }] : await lookup(normalized, { all: true, verbatim: true });
  if (!addresses.length) throw new DatabaseServiceError('Veritabanı host adresi çözümlenemedi.', 422, 'DATABASE_HOST_NOT_FOUND');
  if (!explicit && addresses.some(item => reservedAddress(item.address))) {
    throw new DatabaseServiceError('Özel veya yerel ağ hedefleri DATABASE_ALLOWED_HOSTS allowlist değerine eklenmelidir.', 403, 'PRIVATE_DATABASE_HOST_NOT_ALLOWED');
  }
  return { originalHost: normalized, resolvedHost: addresses[0].address };
}

function assertAllowedPort(port: number) {
  const ports = splitEnvironmentList(process.env.DATABASE_ALLOWED_PORTS || '3306,4000,5432,26257,1433');
  if (!ports.includes('*') && !ports.includes(String(port))) {
    throw new DatabaseServiceError(`Port ${port} sunucu tarafında izinli değil. DATABASE_ALLOWED_PORTS değerini güncelleyin.`, 403, 'DATABASE_PORT_NOT_ALLOWED');
  }
}

function normalizeConnection(connection: DatabaseConnectionPayload) {
  if (!connection || !isExtendedDatabaseEngine(connection.engine)) throw new DatabaseServiceError('Desteklenmeyen veritabanı motoru.', 422, 'UNSUPPORTED_DATABASE_ENGINE');
  const definition = databaseEngineDefinition(connection.engine);
  const host = connection.host?.trim();
  const username = connection.username?.trim();
  if (!host || !username || !connection.password) throw new DatabaseServiceError('Host, kullanıcı adı ve parola zorunludur.', 422, 'INCOMPLETE_DATABASE_CONNECTION');
  return {
    ...connection,
    host,
    username,
    port: boundedInteger(connection.port, definition.defaultPort, 1, 65535),
    connectTimeoutMs: boundedInteger(connection.connectTimeoutMs, 20_000, 3_000, 60_000)
  };
}

function quoteIdentifier(value: string, engine: DatabaseEngine) {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 128 || normalized.includes('\0')) throw new DatabaseServiceError('Veritabanı tanımlayıcısı geçersiz.', 422, 'INVALID_DATABASE_IDENTIFIER');
  if (engine === 'mssql') return `[${normalized.replace(/]/g, ']]')}]`;
  return `"${normalized.replace(/"/g, '""')}"`;
}

function splitTableName(value: string | undefined, engine: DatabaseEngine) {
  const raw = String(value || '').trim();
  const parts = raw.split('.').filter(Boolean);
  if (!parts.length) throw new DatabaseServiceError('Tablo adı zorunludur.', 422, 'TABLE_REQUIRED');
  if (parts.length > 1) return { schema: parts.slice(0, -1).join('.'), table: parts.at(-1)! };
  return { schema: engine === 'mssql' ? 'dbo' : 'public', table: raw };
}

function qualifiedTable(tableName: string, engine: DatabaseEngine) {
  const table = splitTableName(tableName, engine);
  return `${quoteIdentifier(table.schema, engine)}.${quoteIdentifier(table.table, engine)}`;
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return { type: 'binary', base64: value.toString('base64') };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, jsonSafe(nested)]));
  return value;
}

function parameterValue(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const binary = value as { type?: unknown; base64?: unknown };
    if (binary.type === 'binary' && typeof binary.base64 === 'string') return Buffer.from(binary.base64, 'base64');
    return JSON.stringify(value);
  }
  return value;
}

function pushStatement(statements: DatabaseQueryStatement[], sql: string, parameters: unknown[] = [], label?: string) {
  statements.push({ sql: sql.trim(), parameters: parameters.map(jsonSafe), label });
}

function withMeta<T extends Record<string, unknown>>(value: T, statements: DatabaseQueryStatement[]) {
  return { ...value, _meta: { statements } satisfies DatabaseQueryMeta };
}

function normalizeFilters(value: unknown): TableDataFilter[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).filter(item => item && typeof item.column === 'string' && FILTER_OPERATORS.has(item.operator)).map(item => ({
    id: typeof item.id === 'string' ? item.id : undefined,
    column: item.column.trim(), operator: item.operator, value: typeof item.value === 'string' ? item.value : undefined
  }));
}

function normalizeSorts(value: unknown): TableDataSort[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).filter(item => item && typeof item.column === 'string' && (item.direction === 'asc' || item.direction === 'desc')).map(item => ({ column: item.column.trim(), direction: item.direction }));
}

function placeholder(style: ParameterStyle, index: number) {
  return style === 'postgresql' ? `$${index}` : `@p${index}`;
}

function buildWhere(filters: TableDataFilter[], engine: DatabaseEngine, style: ParameterStyle, initialParameters: unknown[] = []) {
  const clauses: string[] = [];
  const parameters = [...initialParameters];
  for (const filter of filters) {
    const column = quoteIdentifier(filter.column, engine);
    const value = filter.value ?? '';
    const bind = (input: unknown) => { parameters.push(parameterValue(input)); return placeholder(style, parameters.length); };
    if (filter.operator === 'contains' && value) clauses.push(`CAST(${column} AS ${engine === 'mssql' ? 'NVARCHAR(MAX)' : 'TEXT'}) LIKE ${bind(`%${value}%`)}`);
    else if (filter.operator === 'startsWith' && value) clauses.push(`CAST(${column} AS ${engine === 'mssql' ? 'NVARCHAR(MAX)' : 'TEXT'}) LIKE ${bind(`${value}%`)}`);
    else if (filter.operator === 'endsWith' && value) clauses.push(`CAST(${column} AS ${engine === 'mssql' ? 'NVARCHAR(MAX)' : 'TEXT'}) LIKE ${bind(`%${value}`)}`);
    else if (filter.operator === 'equals') clauses.push(`${column} = ${bind(value)}`);
    else if (filter.operator === 'gt' && value) clauses.push(`${column} > ${bind(value)}`);
    else if (filter.operator === 'gte' && value) clauses.push(`${column} >= ${bind(value)}`);
    else if (filter.operator === 'lt' && value) clauses.push(`${column} < ${bind(value)}`);
    else if (filter.operator === 'lte' && value) clauses.push(`${column} <= ${bind(value)}`);
    else if (filter.operator === 'isNull') clauses.push(`${column} IS NULL`);
    else if (filter.operator === 'isNotNull') clauses.push(`${column} IS NOT NULL`);
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', parameters };
}

function limitSelect(sql: string, engine: DatabaseEngine, maximumRows: number) {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (!/^SELECT\b/i.test(trimmed)) return trimmed;
  if (engine === 'mssql') {
    if (/\bTOP\s*\(|\bOFFSET\s+\d+\s+ROWS|\bFETCH\s+NEXT/i.test(trimmed)) return trimmed;
    return trimmed.replace(/^SELECT\s+/i, `SELECT TOP (${maximumRows}) `);
  }
  if (/\bLIMIT\s+\d+/i.test(trimmed)) return trimmed;
  return `${trimmed} LIMIT ${maximumRows}`;
}

async function connectPostgres(connection: ReturnType<typeof normalizeConnection>, database: string): Promise<GenericConnection> {
  const ssl = connection.sslMode === 'disabled' ? false : { rejectUnauthorized: connection.sslMode === 'required' };
  const config: PgClientConfig = {
    host: connection.host, port: connection.port, user: connection.username, password: connection.password,
    database, connectionTimeoutMillis: connection.connectTimeoutMs, statement_timeout: boundedInteger(process.env.DATABASE_QUERY_TIMEOUT_MS, 30_000, 3_000, 120_000),
    query_timeout: boundedInteger(process.env.DATABASE_QUERY_TIMEOUT_MS, 30_000, 3_000, 120_000), ssl,
    application_name: 'Coreor Database'
  };
  const client = new PgClient(config);
  await client.connect();
  return {
    engine: connection.engine,
    database,
    query: async (sql, parameters = []) => {
      const result: QueryResult = await client.query(sql, parameters.map(parameterValue));
      return {
        rows: jsonSafe(result.rows) as Record<string, unknown>[],
        fields: result.fields.map(field => ({ name: field.name, type: field.dataTypeID })),
        affectedRows: result.rowCount || 0
      };
    },
    close: async () => { await client.end(); }
  };
}

async function connectMssql(connection: ReturnType<typeof normalizeConnection>, database: string): Promise<GenericConnection> {
  const pool = await new mssql.ConnectionPool({
    server: connection.host,
    port: connection.port,
    user: connection.username,
    password: connection.password,
    database,
    connectionTimeout: connection.connectTimeoutMs,
    requestTimeout: boundedInteger(process.env.DATABASE_QUERY_TIMEOUT_MS, 30_000, 3_000, 120_000),
    options: {
      encrypt: connection.sslMode !== 'disabled',
      trustServerCertificate: connection.sslMode !== 'required',
      enableArithAbort: true,
      appName: 'Coreor Database'
    },
    pool: { min: 0, max: 2, idleTimeoutMillis: 10_000 }
  }).connect();
  return {
    engine: connection.engine,
    database,
    query: async (sql, parameters = []) => {
      const request = pool.request();
      parameters.forEach((value, index) => request.input(`p${index + 1}`, parameterValue(value) as never));
      const result = await request.query(sql);
      const rows = result.recordset || [];
      return {
        rows: jsonSafe(rows) as Record<string, unknown>[],
        fields: result.recordset?.columns ? Object.entries(result.recordset.columns).map(([name, metadata]) => ({ name, type: String((metadata as { type?: { declaration?: string } }).type?.declaration || 'unknown') })) : Object.keys(rows[0] || {}).map(name => ({ name, type: 'unknown' })),
        affectedRows: (result.rowsAffected || []).reduce((total, count) => total + count, 0)
      };
    },
    close: async () => { await pool.close(); }
  };
}

async function openConnection(connection: ReturnType<typeof normalizeConnection>, database?: string | null) {
  const target = database || connection.database || (connection.engine === 'mssql' ? 'master' : connection.engine === 'cockroachdb' ? 'defaultdb' : 'postgres');
  return connection.engine === 'mssql' ? connectMssql(connection, target) : connectPostgres(connection, target);
}

async function listDatabases(connection: ReturnType<typeof normalizeConnection>, base: GenericConnection) {
  if (connection.engine === 'mssql') {
    const result = await base.query("SELECT name FROM sys.databases WHERE state = 0 AND name NOT IN ('master','model','msdb','tempdb') ORDER BY name");
    return result.rows.map(row => String(row.name)).filter(Boolean).slice(0, 60);
  }
  const result = await base.query("SELECT datname AS name FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY datname");
  const system = new Set(databaseEngineDefinition(connection.engine).systemDatabases.map(item => item.toLocaleLowerCase('tr-TR')));
  return result.rows.map(row => String(row.name)).filter(name => name && !system.has(name.toLocaleLowerCase('tr-TR'))).slice(0, 60);
}

function numberValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function catalogForDatabase(connection: ReturnType<typeof normalizeConnection>, databaseName: string): Promise<DatabaseCatalogItem> {
  let client: GenericConnection | null = null;
  try {
    client = await openConnection(connection, databaseName);
    if (connection.engine === 'mssql') {
      const result = await client.query(`
        SELECT s.name AS schema_name, t.name AS table_name, 'BASE TABLE' AS table_type,
          CAST(ISNULL(SUM(p.rows), 0) AS BIGINT) AS row_count,
          COUNT(DISTINCT c.column_id) AS column_count,
          CAST(ISNULL(SUM(a.total_pages), 0) * 8192.0 / 1048576 AS DECIMAL(18,2)) AS total_mb,
          CAST(ISNULL(SUM(a.data_pages), 0) * 8192.0 / 1048576 AS DECIMAL(18,2)) AS data_mb,
          CAST((ISNULL(SUM(a.total_pages), 0) - ISNULL(SUM(a.data_pages), 0)) * 8192.0 / 1048576 AS DECIMAL(18,2)) AS index_mb,
          ep.value AS comment
        FROM sys.tables t
        JOIN sys.schemas s ON s.schema_id = t.schema_id
        LEFT JOIN sys.indexes i ON i.object_id = t.object_id
        LEFT JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id = i.index_id
        LEFT JOIN sys.allocation_units a ON a.container_id = p.partition_id
        LEFT JOIN sys.columns c ON c.object_id = t.object_id
        LEFT JOIN sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
        GROUP BY s.name, t.name, ep.value
        ORDER BY s.name, t.name`);
      const details: DatabaseTable[] = result.rows.map(row => ({
        tableName: `${row.schema_name}.${row.table_name}`, tableType: 'BASE TABLE', comment: String(row.comment || ''),
        rows: numberValue(row.row_count), columns: numberValue(row.column_count), sizeMB: String(row.total_mb || '0'), dataSizeMB: String(row.data_mb || '0'), indexSizeMB: String(row.index_mb || '0'), freeSizeMB: '0', avgRowLength: 0,
        createdAt: null, updatedAt: null, engine: 'SQL Server', rowFormat: null, collation: null, autoIncrement: null, indexCount: 0, foreignKeyCount: 0
      }));
      return makeCatalog(databaseName, details);
    }

    const result = await client.query(`
      SELECT n.nspname AS schema_name, c.relname AS table_name,
        CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'BASE TABLE' END AS table_type,
        COALESCE(s.n_live_tup, c.reltuples, 0)::bigint AS row_count,
        (SELECT COUNT(*) FROM information_schema.columns ic WHERE ic.table_schema=n.nspname AND ic.table_name=c.relname) AS column_count,
        pg_total_relation_size(c.oid) / 1048576.0 AS total_mb,
        pg_relation_size(c.oid) / 1048576.0 AS data_mb,
        (pg_total_relation_size(c.oid)-pg_relation_size(c.oid)) / 1048576.0 AS index_mb,
        obj_description(c.oid, 'pg_class') AS comment
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
      WHERE c.relkind IN ('r','p','v','m') AND n.nspname NOT IN ('pg_catalog','information_schema')
      ORDER BY n.nspname,c.relname`);
    const details: DatabaseTable[] = result.rows.map(row => ({
      tableName: `${row.schema_name}.${row.table_name}`, tableType: String(row.table_type || 'BASE TABLE'), comment: String(row.comment || ''),
      rows: numberValue(row.row_count), columns: numberValue(row.column_count), sizeMB: String(row.total_mb || '0'), dataSizeMB: String(row.data_mb || '0'), indexSizeMB: String(row.index_mb || '0'), freeSizeMB: '0', avgRowLength: 0,
      createdAt: null, updatedAt: null, engine: connection.engine === 'cockroachdb' ? 'CockroachDB' : 'PostgreSQL', rowFormat: null, collation: null, autoIncrement: null, indexCount: 0, foreignKeyCount: 0
    }));
    return makeCatalog(databaseName, details);
  } catch {
    return makeCatalog(databaseName, []);
  } finally {
    await client?.close().catch(() => undefined);
  }
}

function makeCatalog(name: string, details: DatabaseTable[]): DatabaseCatalogItem {
  const data = details.reduce((total, item) => total + numberValue(item.dataSizeMB), 0);
  const indexes = details.reduce((total, item) => total + numberValue(item.indexSizeMB), 0);
  return {
    name, defaultCharset: 'UTF-8', defaultCollation: null, tableCount: details.length,
    totalRows: details.reduce((total, item) => total + item.rows, 0),
    dataSizeMB: data.toFixed(2), indexSizeMB: indexes.toFixed(2), totalSizeMB: (data + indexes).toFixed(2),
    tables: details.map(item => item.tableName), tableDetails: details
  };
}

async function catalog(connection: ReturnType<typeof normalizeConnection>, statements: DatabaseQueryStatement[]) {
  const base = await openConnection(connection, connection.engine === 'mssql' ? 'master' : connection.database);
  try {
    const databases = await listDatabases(connection, base);
    pushStatement(statements, connection.engine === 'mssql' ? 'SELECT name FROM sys.databases ...' : 'SELECT datname FROM pg_database ...', [], 'Veritabanı listesi');
    const results: DatabaseCatalogItem[] = [];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, databases.length) }, async () => {
      while (cursor < databases.length) {
        const index = cursor++;
        results[index] = await catalogForDatabase(connection, databases[index]);
      }
    });
    await Promise.all(workers);
    return withMeta({ databases: results.filter(Boolean) }, statements);
  } finally { await base.close(); }
}

function postgresCreateSql(tableName: string, columns: TableColumnInfo[]) {
  const table = splitTableName(tableName, 'postgresql');
  return `CREATE TABLE "${table.schema}"."${table.table}" (\n${columns.map(column => `  "${column.Field}" ${column.Type}${column.Null === 'NO' ? ' NOT NULL' : ''}${column.Default !== null ? ` DEFAULT ${column.Default}` : ''}`).join(',\n')}\n);`;
}

async function tableInfo(connection: ReturnType<typeof normalizeConnection>, databaseName: string, rawTableName: string, statements: DatabaseQueryStatement[]) {
  const tableName = splitTableName(rawTableName, connection.engine);
  const client = await openConnection(connection, databaseName);
  try {
    if (connection.engine === 'mssql') {
      const columnsResult = await client.query(`SELECT c.COLUMN_NAME AS Field, c.DATA_TYPE AS Data_type, c.DATA_TYPE + COALESCE('(' + CAST(c.CHARACTER_MAXIMUM_LENGTH AS varchar(20)) + ')','') AS Type, c.IS_NULLABLE AS Nullable, c.COLUMN_DEFAULT AS Default_value, c.ORDINAL_POSITION AS Ordinal_position, c.CHARACTER_MAXIMUM_LENGTH AS Character_maximum_length, c.NUMERIC_PRECISION AS Numeric_precision, c.NUMERIC_SCALE AS Numeric_scale, c.DATETIME_PRECISION AS Datetime_precision, c.COLLATION_NAME AS Collation FROM INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA=@p1 AND c.TABLE_NAME=@p2 ORDER BY c.ORDINAL_POSITION`, [tableName.schema, tableName.table]);
      const columns: TableColumnInfo[] = columnsResult.rows.map(row => ({ Field: String(row.Field), Type: String(row.Type || row.Data_type), Null: row.Nullable === 'YES' ? 'YES' : 'NO', Key: '', Default: row.Default_value === null || row.Default_value === undefined ? null : String(row.Default_value), Extra: '', Comment: '', Collation: row.Collation ? String(row.Collation) : null, Ordinal_position: numberValue(row.Ordinal_position), Data_type: String(row.Data_type).toUpperCase(), Character_maximum_length: row.Character_maximum_length === null ? null : numberValue(row.Character_maximum_length), Numeric_precision: row.Numeric_precision === null ? null : numberValue(row.Numeric_precision), Numeric_scale: row.Numeric_scale === null ? null : numberValue(row.Numeric_scale), Datetime_precision: row.Datetime_precision === null ? null : numberValue(row.Datetime_precision), Character_set_name: null, Generation_expression: '' }));
      const keys = await client.query(`SELECT kc.name AS constraint_name, col.name AS column_name, ic.key_ordinal, i.is_unique, i.type_desc FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id JOIN sys.columns col ON col.object_id=ic.object_id AND col.column_id=ic.column_id LEFT JOIN sys.key_constraints kc ON kc.parent_object_id=i.object_id AND kc.unique_index_id=i.index_id WHERE i.object_id=OBJECT_ID(@p1) ORDER BY i.name,ic.key_ordinal`, [`${tableName.schema}.${tableName.table}`]);
      const indexes: TableIndexInfo[] = keys.rows.map(row => ({ Key_name: String(row.constraint_name || 'INDEX'), Column_name: String(row.column_name), Non_unique: row.is_unique ? '0' : '1', Seq_in_index: String(row.key_ordinal || 1), Index_type: String(row.type_desc || 'BTREE'), Collation: null, Cardinality: null, Sub_part: null, Nullable: '', Index_comment: '', Is_visible: 'YES', Expression: null }));
      const foreign = await client.query(`SELECT fk.name AS CONSTRAINT_NAME, pc.name AS COLUMN_NAME, fkc.constraint_column_id AS ORDINAL_POSITION, DB_NAME() AS REFERENCED_TABLE_SCHEMA, rs.name + '.' + rt.name AS REFERENCED_TABLE_NAME, rc.name AS REFERENCED_COLUMN_NAME, fk.update_referential_action_desc AS UPDATE_RULE, fk.delete_referential_action_desc AS DELETE_RULE FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id JOIN sys.tables pt ON pt.object_id=fk.parent_object_id JOIN sys.schemas ps ON ps.schema_id=pt.schema_id JOIN sys.columns pc ON pc.object_id=pt.object_id AND pc.column_id=fkc.parent_column_id JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id JOIN sys.schemas rs ON rs.schema_id=rt.schema_id JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fkc.referenced_column_id WHERE ps.name=@p1 AND pt.name=@p2`, [tableName.schema, tableName.table]);
      const createSQL = `CREATE TABLE [${tableName.schema}].[${tableName.table}] (\n${columns.map(column => `  [${column.Field}] ${column.Type}${column.Null === 'NO' ? ' NOT NULL' : ' NULL'}${column.Default !== null ? ` DEFAULT ${column.Default}` : ''}`).join(',\n')}\n);`;
      return withMeta({ table: { name: rawTableName, comment: '', engine: 'SQL Server', collation: columns.find(column => column.Collation)?.Collation || null, charset: null, autoIncrement: null, rowFormat: null, tableType: 'BASE TABLE', createTime: null, updateTime: null }, columns, indexes, foreignKeys: foreign.rows as unknown as TableForeignKeyInfo[], checkConstraints: [], partitions: [], createSQL }, statements) as TableInfo;
    }

    const columnsResult = await client.query(`SELECT c.column_name AS "Field", c.data_type AS "Data_type", COALESCE(c.udt_name,c.data_type) || CASE WHEN c.character_maximum_length IS NOT NULL THEN '(' || c.character_maximum_length || ')' WHEN c.numeric_precision IS NOT NULL AND c.numeric_scale IS NOT NULL THEN '(' || c.numeric_precision || ',' || c.numeric_scale || ')' ELSE '' END AS "Type", c.is_nullable AS "Nullable", c.column_default AS "Default_value", c.ordinal_position AS "Ordinal_position", c.character_maximum_length AS "Character_maximum_length", c.numeric_precision AS "Numeric_precision", c.numeric_scale AS "Numeric_scale", c.datetime_precision AS "Datetime_precision", c.collation_name AS "Collation" FROM information_schema.columns c WHERE c.table_schema=$1 AND c.table_name=$2 ORDER BY c.ordinal_position`, [tableName.schema, tableName.table]);
    const columns: TableColumnInfo[] = columnsResult.rows.map(row => ({ Field: String(row.Field), Type: String(row.Type || row.Data_type), Null: row.Nullable === 'YES' ? 'YES' : 'NO', Key: '', Default: row.Default_value === null || row.Default_value === undefined ? null : String(row.Default_value), Extra: String(row.Default_value || '').includes('nextval(') ? 'auto_increment' : '', Comment: '', Collation: row.Collation ? String(row.Collation) : null, Ordinal_position: numberValue(row.Ordinal_position), Data_type: String(row.Data_type).toUpperCase(), Character_maximum_length: row.Character_maximum_length === null ? null : numberValue(row.Character_maximum_length), Numeric_precision: row.Numeric_precision === null ? null : numberValue(row.Numeric_precision), Numeric_scale: row.Numeric_scale === null ? null : numberValue(row.Numeric_scale), Datetime_precision: row.Datetime_precision === null ? null : numberValue(row.Datetime_precision), Character_set_name: 'UTF8', Generation_expression: '' }));
    const indexesResult = await client.query(`SELECT i.relname AS "Key_name", a.attname AS "Column_name", CASE WHEN ix.indisunique THEN '0' ELSE '1' END AS "Non_unique", ord.ordinality::text AS "Seq_in_index", am.amname AS "Index_type", CASE WHEN ix.indisprimary THEN 'PRIMARY' ELSE '' END AS primary_marker FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_index ix ON t.oid=ix.indrelid JOIN pg_class i ON i.oid=ix.indexrelid JOIN pg_am am ON am.oid=i.relam CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY ord(attnum,ordinality) JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ord.attnum WHERE n.nspname=$1 AND t.relname=$2 ORDER BY i.relname,ord.ordinality`, [tableName.schema, tableName.table]);
    const indexes: TableIndexInfo[] = indexesResult.rows.map(row => ({ Key_name: row.primary_marker === 'PRIMARY' ? 'PRIMARY' : String(row.Key_name), Column_name: String(row.Column_name), Non_unique: String(row.Non_unique), Seq_in_index: String(row.Seq_in_index), Index_type: String(row.Index_type || 'btree').toUpperCase(), Collation: null, Cardinality: null, Sub_part: null, Nullable: '', Index_comment: '', Is_visible: 'YES', Expression: null }));
    const primary = new Set(indexes.filter(index => index.Key_name === 'PRIMARY').map(index => index.Column_name));
    columns.forEach(column => { if (primary.has(column.Field)) column.Key = 'PRI'; });
    const foreign = await client.query(`SELECT tc.constraint_name AS "CONSTRAINT_NAME", kcu.column_name AS "COLUMN_NAME", kcu.ordinal_position AS "ORDINAL_POSITION", ccu.table_schema AS "REFERENCED_TABLE_SCHEMA", ccu.table_name AS "REFERENCED_TABLE_NAME", ccu.column_name AS "REFERENCED_COLUMN_NAME", rc.update_rule AS "UPDATE_RULE", rc.delete_rule AS "DELETE_RULE" FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema JOIN information_schema.referential_constraints rc ON rc.constraint_name=tc.constraint_name AND rc.constraint_schema=tc.constraint_schema WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema=$1 AND tc.table_name=$2`, [tableName.schema, tableName.table]);
    const checks = await client.query(`SELECT tc.constraint_name AS "CONSTRAINT_NAME", cc.check_clause AS "CHECK_CLAUSE", 'YES' AS "ENFORCED" FROM information_schema.table_constraints tc JOIN information_schema.check_constraints cc ON cc.constraint_name=tc.constraint_name AND cc.constraint_schema=tc.constraint_schema WHERE tc.constraint_type='CHECK' AND tc.table_schema=$1 AND tc.table_name=$2`, [tableName.schema, tableName.table]);
    return withMeta({ table: { name: rawTableName, comment: '', engine: connection.engine === 'cockroachdb' ? 'CockroachDB' : 'PostgreSQL', collation: null, charset: 'UTF8', autoIncrement: null, rowFormat: null, tableType: 'BASE TABLE', createTime: null, updateTime: null }, columns, indexes, foreignKeys: foreign.rows as unknown as TableForeignKeyInfo[], checkConstraints: checks.rows, partitions: [], createSQL: postgresCreateSql(rawTableName, columns) }, statements) as TableInfo;
  } finally { await client.close(); }
}

async function tableData(connection: ReturnType<typeof normalizeConnection>, input: ExtendedDatabaseRequest, statements: DatabaseQueryStatement[]) {
  const database = input.database || connection.database;
  if (!database) throw new DatabaseServiceError('Veritabanı seçilmelidir.', 422, 'DATABASE_REQUIRED');
  const table = qualifiedTable(input.table || '', connection.engine);
  const style: ParameterStyle = connection.engine === 'mssql' ? 'mssql' : 'postgresql';
  const pageSize = boundedInteger(input.pageSize, 50, 1, boundedInteger(process.env.DATABASE_MAX_PAGE_SIZE, 500, 25, 2000));
  const page = boundedInteger(input.page, 1, 1, 10_000_000);
  const filters = normalizeFilters(input.filters);
  const sorts = normalizeSorts(input.sorts);
  const where = buildWhere(filters, connection.engine, style);
  const order = sorts.length ? ` ORDER BY ${sorts.map(sort => `${quoteIdentifier(sort.column, connection.engine)} ${sort.direction.toUpperCase()}`).join(', ')}` : '';
  const offset = (page - 1) * pageSize;
  const paginationSql = connection.engine === 'mssql'
    ? `${order || ' ORDER BY (SELECT NULL)'} OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`
    : `${order} LIMIT ${pageSize} OFFSET ${offset}`;
  const client = await openConnection(connection, database);
  try {
    let totalRows = Number.isFinite(Number(input.knownTotalRows)) ? Number(input.knownTotalRows) : 0;
    if (input.includeTotal !== false || !Number.isFinite(Number(input.knownTotalRows))) {
      const countSql = `SELECT COUNT(*) AS total_rows FROM ${table}${where.sql}`;
      pushStatement(statements, countSql, where.parameters, 'Toplam satır sayısı');
      const count = await client.query(countSql, where.parameters);
      totalRows = numberValue(count.rows[0]?.total_rows);
    }
    const sql = `SELECT * FROM ${table}${where.sql}${paginationSql}`;
    pushStatement(statements, sql, where.parameters, 'Tablo satırları');
    const result = await client.query(sql, where.parameters);
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const currentPage = Math.min(page, totalPages);
    return withMeta({ data: result.rows, pagination: { page: currentPage, pageSize, totalRows, totalPages, hasPreviousPage: currentPage > 1, hasNextPage: currentPage < totalPages }, sorts, filters }, statements);
  } finally { await client.close(); }
}

async function updateCell(connection: ReturnType<typeof normalizeConnection>, input: ExtendedDatabaseRequest, statements: DatabaseQueryStatement[]) {
  const database = input.database || connection.database;
  const primaryKey = input.primaryKey || {};
  if (!database || !input.table || !input.column || !Object.keys(primaryKey).length) throw new DatabaseServiceError('Hücre güncelleme bilgileri eksik.', 422, 'INCOMPLETE_CELL_UPDATE');
  const style: ParameterStyle = connection.engine === 'mssql' ? 'mssql' : 'postgresql';
  const parameters: unknown[] = [parameterValue(input.value)];
  const where = Object.entries(primaryKey).map(([column, value]) => { parameters.push(parameterValue(value)); return `${quoteIdentifier(column, connection.engine)} = ${placeholder(style, parameters.length)}`; }).join(' AND ');
  const sql = `UPDATE ${qualifiedTable(input.table, connection.engine)} SET ${quoteIdentifier(input.column, connection.engine)} = ${placeholder(style, 1)} WHERE ${where}`;
  pushStatement(statements, sql, parameters, 'Hücre güncelleme');
  const client = await openConnection(connection, database);
  try { const result = await client.query(sql, parameters); return withMeta({ affectedRows: result.affectedRows, changedRows: result.affectedRows, value: jsonSafe(input.value) }, statements); }
  finally { await client.close(); }
}

async function deleteRows(connection: ReturnType<typeof normalizeConnection>, input: ExtendedDatabaseRequest, statements: DatabaseQueryStatement[]) {
  const database = input.database || connection.database;
  const keys = Array.isArray(input.primaryKeys) ? input.primaryKeys.slice(0, 500) : [];
  if (!database || !input.table || !keys.length) throw new DatabaseServiceError('Silinecek satır anahtarları eksik.', 422, 'INCOMPLETE_ROW_DELETE');
  const client = await openConnection(connection, database);
  let affectedRows = 0;
  try {
    for (const key of keys) {
      const style: ParameterStyle = connection.engine === 'mssql' ? 'mssql' : 'postgresql';
      const parameters: unknown[] = [];
      const where = Object.entries(key).map(([column, value]) => { parameters.push(parameterValue(value)); return `${quoteIdentifier(column, connection.engine)} = ${placeholder(style, parameters.length)}`; }).join(' AND ');
      const sql = `DELETE FROM ${qualifiedTable(input.table, connection.engine)} WHERE ${where}`;
      pushStatement(statements, sql, parameters, 'Satır silme');
      const result = await client.query(sql, parameters); affectedRows += result.affectedRows;
    }
    return withMeta({ affectedRows }, statements);
  } finally { await client.close(); }
}

async function queryDatabase(connection: ReturnType<typeof normalizeConnection>, input: ExtendedDatabaseRequest, statements: DatabaseQueryStatement[]) {
  if (!input.sql?.trim()) throw new DatabaseServiceError('Çalıştırılacak SQL sorgusu boş olamaz.', 422, 'EMPTY_SQL_QUERY');
  const maximumRows = boundedInteger(process.env.DATABASE_MAX_RESULT_ROWS, 5_000, 100, 50_000);
  const sql = limitSelect(input.sql, connection.engine, maximumRows);
  pushStatement(statements, sql, [], 'SQL editörü sorgusu');
  const client = await openConnection(connection, input.database);
  try {
    const result = await client.query(sql);
    return withMeta({ rows: result.rows, fields: result.fields, affectedRows: result.rows.length ? undefined : result.affectedRows, maximumRows }, statements);
  } finally { await client.close(); }
}

function normalizeError(error: unknown) {
  if (error instanceof DatabaseServiceError) return error;
  const candidate = error as { code?: string; message?: string; number?: number };
  const code = candidate.code || (candidate.number ? `MSSQL_${candidate.number}` : 'DATABASE_CONNECTION_FAILED');
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED'].includes(code)) return new DatabaseServiceError('Veritabanı sunucusuna zamanında bağlanılamadı.', 504, code);
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return new DatabaseServiceError('Veritabanı host adresi çözümlenemedi.', 422, code);
  return new DatabaseServiceError(candidate.message || 'Veritabanı işlemi başarısız oldu.', 422, code);
}

export async function executeExtendedDatabaseRequest(input: ExtendedDatabaseRequest) {
  const connection = normalizeConnection(input.connection);
  assertAllowedPort(connection.port);
  const resolved = await resolveAllowedHost(connection.host);
  connection.host = resolved.resolvedHost;
  const statements: DatabaseQueryStatement[] = [];
  try {
    if (input.action === 'test') {
      const client = await openConnection(connection, input.database);
      try {
        const sql = connection.engine === 'mssql'
          ? 'SELECT @@VERSION AS version, DB_NAME() AS databaseName, SYSTEM_USER AS currentUser'
          : 'SELECT version() AS version, current_database() AS "databaseName", current_user AS "currentUser"';
        pushStatement(statements, sql, [], 'Bağlantı testi');
        const result = await client.query(sql);
        return withMeta({ connection: result.rows[0] || {} }, statements);
      } finally { await client.close(); }
    }
    if (input.action === 'catalog') return await catalog(connection, statements);
    if (input.action === 'table-info') return await tableInfo(connection, input.database || connection.database || '', input.table || '', statements);
    if (input.action === 'table-data') return await tableData(connection, input, statements);
    if (input.action === 'update-cell') return await updateCell(connection, input, statements);
    if (input.action === 'delete-rows') return await deleteRows(connection, input, statements);
    if (input.action === 'query') return await queryDatabase(connection, input, statements);
    if (input.action === 'alter-table') throw new DatabaseServiceError('Bu motor için görsel şema değişiklikleri henüz desteklenmiyor. SQL sorgu editörünü kullanın.', 422, 'ENGINE_SCHEMA_MUTATION_UNSUPPORTED');
    throw new DatabaseServiceError('Desteklenmeyen veritabanı işlemi.', 422, 'UNSUPPORTED_DATABASE_ACTION');
  } catch (error) {
    const normalized = normalizeError(error);
    if (!normalized.queryMeta && statements.length) normalized.queryMeta = { statements };
    throw normalized;
  }
}
