import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import mysql from 'mysql2/promise';
import type {
  DatabaseApiAction,
  DatabaseCatalogItem,
  DatabaseConnectionPayload,
  DatabaseQueryMeta,
  DatabaseQueryStatement,
  DatabaseTable,
  TableColumnDefinition,
  TableDataFilter,
  TableDataFilterOperator,
  TableDataSort,
  TableForeignKeyDefinition,
  TableIndexDefinition,
  TableInfo,
  TableSchemaMutation
} from 'types';

interface DatabaseApiRequest {
  action: DatabaseApiAction;
  connection: DatabaseConnectionPayload;
  database?: string | null;
  table?: string;
  column?: string;
  value?: unknown;
  primaryKey?: Record<string, unknown>;
  primaryKeys?: Record<string, unknown>[];
  mutation?: TableSchemaMutation;
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

const SYSTEM_DATABASES = new Set(['information_schema', 'performance_schema', 'sys', 'mysql']);
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
const COLUMN_TYPES = new Set([
  'TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'INTEGER', 'BIGINT',
  'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL', 'BIT', 'BOOLEAN', 'BOOL',
  'CHAR', 'VARCHAR', 'BINARY', 'VARBINARY',
  'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT',
  'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB',
  'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR',
  'JSON', 'ENUM', 'SET', 'GEOMETRY', 'POINT', 'LINESTRING', 'POLYGON',
  'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION'
]);
const NUMERIC_TYPES = new Set(['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'INTEGER', 'BIGINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL']);
const TABLE_ENGINES = new Set(['INNODB', 'MYISAM', 'MEMORY', 'ARIA', 'CSV', 'ARCHIVE', 'BLACKHOLE']);
const ROW_FORMATS = new Set(['DEFAULT', 'DYNAMIC', 'COMPACT', 'REDUNDANT', 'COMPRESSED', 'FIXED', 'PAGE']);
const FK_ACTIONS = new Set(['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION']);

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

function databaseParameterValue(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as { type?: unknown; base64?: unknown };
    if (candidate.type === 'binary' && typeof candidate.base64 === 'string') {
      if (candidate.base64.length > 8_000_000) throw new DatabaseServiceError('BLOB verisi izin verilen boyutu aşıyor.', 413, 'BLOB_TOO_LARGE');
      return Buffer.from(candidate.base64, 'base64');
    }
    return JSON.stringify(value);
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

function bytesToMb(value: unknown) {
  const bytes = Number(value ?? 0);
  return (Number.isFinite(bytes) ? bytes / 1024 / 1024 : 0).toFixed(2);
}

async function catalog(
  connection: Awaited<ReturnType<typeof mysql.createConnection>>,
  timeoutMs: number,
  statements: DatabaseQueryStatement[]
) {
  const sql = `
    SELECT
      schema_source.SCHEMA_NAME AS databaseName,
      schema_source.DEFAULT_CHARACTER_SET_NAME AS defaultCharset,
      schema_source.DEFAULT_COLLATION_NAME AS defaultCollation,
      table_source.TABLE_NAME AS tableName,
      table_source.TABLE_TYPE AS tableType,
      table_source.ENGINE AS engine,
      table_source.ROW_FORMAT AS rowFormat,
      table_source.TABLE_ROWS AS tableRows,
      table_source.AVG_ROW_LENGTH AS avgRowLength,
      table_source.DATA_LENGTH AS dataLength,
      table_source.INDEX_LENGTH AS indexLength,
      table_source.DATA_FREE AS dataFree,
      table_source.AUTO_INCREMENT AS autoIncrement,
      table_source.CREATE_TIME AS createTime,
      table_source.UPDATE_TIME AS updateTime,
      table_source.TABLE_COLLATION AS tableCollation,
      table_source.TABLE_COMMENT AS tableComment,
      COALESCE(column_source.columnCount, 0) AS columnCount,
      COALESCE(index_source.indexCount, 0) AS indexCount,
      COALESCE(foreign_key_source.foreignKeyCount, 0) AS foreignKeyCount
    FROM information_schema.SCHEMATA AS schema_source
    LEFT JOIN information_schema.TABLES AS table_source
      ON table_source.TABLE_SCHEMA = schema_source.SCHEMA_NAME
    LEFT JOIN (
      SELECT TABLE_SCHEMA, TABLE_NAME, COUNT(*) AS columnCount
      FROM information_schema.COLUMNS
      GROUP BY TABLE_SCHEMA, TABLE_NAME
    ) AS column_source
      ON column_source.TABLE_SCHEMA = table_source.TABLE_SCHEMA
      AND column_source.TABLE_NAME = table_source.TABLE_NAME
    LEFT JOIN (
      SELECT TABLE_SCHEMA, TABLE_NAME, COUNT(DISTINCT INDEX_NAME) AS indexCount
      FROM information_schema.STATISTICS
      GROUP BY TABLE_SCHEMA, TABLE_NAME
    ) AS index_source
      ON index_source.TABLE_SCHEMA = table_source.TABLE_SCHEMA
      AND index_source.TABLE_NAME = table_source.TABLE_NAME
    LEFT JOIN (
      SELECT TABLE_SCHEMA, TABLE_NAME, COUNT(DISTINCT CONSTRAINT_NAME) AS foreignKeyCount
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_NAME IS NOT NULL
      GROUP BY TABLE_SCHEMA, TABLE_NAME
    ) AS foreign_key_source
      ON foreign_key_source.TABLE_SCHEMA = table_source.TABLE_SCHEMA
      AND foreign_key_source.TABLE_NAME = table_source.TABLE_NAME
    ORDER BY schema_source.SCHEMA_NAME, table_source.TABLE_NAME
  `;
  pushStatement(statements, sql, [], 'Ayrıntılı veritabanı ve tablo kataloğu');
  const [rows] = await connection.query({ sql, timeout: timeoutMs });
  const databaseMap = new Map<string, DatabaseCatalogItem>();

  for (const row of records(rows)) {
    const databaseName = String(row.databaseName ?? '');
    if (!databaseName || SYSTEM_DATABASES.has(databaseName)) continue;

    let database = databaseMap.get(databaseName);
    if (!database) {
      database = {
        name: databaseName,
        defaultCharset: row.defaultCharset ? String(row.defaultCharset) : null,
        defaultCollation: row.defaultCollation ? String(row.defaultCollation) : null,
        tableCount: 0,
        totalRows: 0,
        dataSizeMB: '0.00',
        indexSizeMB: '0.00',
        totalSizeMB: '0.00',
        tables: [],
        tableDetails: []
      };
      databaseMap.set(databaseName, database);
    }

    if (!row.tableName) continue;
    const tableRows = Number(row.tableRows ?? 0);
    const dataLength = Number(row.dataLength ?? 0);
    const indexLength = Number(row.indexLength ?? 0);
    const detail: DatabaseTable = {
      tableName: String(row.tableName),
      tableType: String(row.tableType ?? 'BASE TABLE'),
      comment: String(row.tableComment ?? ''),
      rows: Number.isFinite(tableRows) ? tableRows : 0,
      columns: Number(row.columnCount ?? 0),
      sizeMB: bytesToMb(dataLength + indexLength),
      dataSizeMB: bytesToMb(dataLength),
      indexSizeMB: bytesToMb(indexLength),
      freeSizeMB: bytesToMb(row.dataFree),
      avgRowLength: Number(row.avgRowLength ?? 0),
      createdAt: row.createTime ? String(row.createTime) : null,
      updatedAt: row.updateTime ? String(row.updateTime) : null,
      engine: String(row.engine ?? '—'),
      rowFormat: row.rowFormat ? String(row.rowFormat) : null,
      collation: row.tableCollation ? String(row.tableCollation) : null,
      autoIncrement: row.autoIncrement === null || row.autoIncrement === undefined ? null : String(row.autoIncrement),
      indexCount: Number(row.indexCount ?? 0),
      foreignKeyCount: Number(row.foreignKeyCount ?? 0)
    };

    database.tables.push(detail.tableName);
    database.tableDetails.push(detail);
    database.tableCount += 1;
    database.totalRows += detail.rows;
    database.dataSizeMB = (Number(database.dataSizeMB) + Number(detail.dataSizeMB)).toFixed(2);
    database.indexSizeMB = (Number(database.indexSizeMB) + Number(detail.indexSizeMB)).toFixed(2);
    database.totalSizeMB = (Number(database.totalSizeMB) + Number(detail.sizeMB)).toFixed(2);
  }

  return withMeta({ databases: Array.from(databaseMap.values()) }, statements);
}

async function queryRecordsSafe(
  connection: Awaited<ReturnType<typeof mysql.createConnection>>,
  sql: string,
  parameters: unknown[],
  timeoutMs: number,
  statements: DatabaseQueryStatement[],
  label: string,
  fallbackSql?: string
) {
  pushStatement(statements, sql, parameters, label);
  try {
    const [rows] = await connection.query({ sql, timeout: timeoutMs }, parameters);
    return records(rows);
  } catch (error) {
    if (!fallbackSql) throw error;
    pushStatement(statements, fallbackSql, parameters, `${label} (uyumluluk sorgusu)`);
    const [rows] = await connection.query({ sql: fallbackSql, timeout: timeoutMs }, parameters);
    return records(rows);
  }
}

async function tableInfo(
  connection: Awaited<ReturnType<typeof mysql.createConnection>>,
  databaseName: string,
  tableName: string,
  timeoutMs: number,
  statements: DatabaseQueryStatement[]
): Promise<TableInfo> {
  const parameters = [databaseName, tableName];
  const tableSql = `SELECT TABLE_NAME, TABLE_TYPE, ENGINE, ROW_FORMAT, AUTO_INCREMENT, CREATE_TIME, UPDATE_TIME, TABLE_COLLATION, TABLE_COMMENT
    FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1`;
  const columnSql = `SELECT COLUMN_NAME AS Field, COLUMN_TYPE AS Type, IS_NULLABLE AS \`Null\`, COLUMN_KEY AS \`Key\`, COLUMN_DEFAULT AS \`Default\`, EXTRA AS Extra,
      COLUMN_COMMENT AS Comment, COLLATION_NAME AS Collation, ORDINAL_POSITION AS Ordinal_position, DATA_TYPE AS Data_type,
      CHARACTER_MAXIMUM_LENGTH AS Character_maximum_length, NUMERIC_PRECISION AS Numeric_precision, NUMERIC_SCALE AS Numeric_scale,
      DATETIME_PRECISION AS Datetime_precision, CHARACTER_SET_NAME AS Character_set_name, GENERATION_EXPRESSION AS Generation_expression
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`;
  const indexSql = `SELECT INDEX_NAME AS Key_name, COLUMN_NAME AS Column_name, NON_UNIQUE AS Non_unique, SEQ_IN_INDEX AS Seq_in_index,
      INDEX_TYPE AS Index_type, COLLATION AS Collation, CARDINALITY AS Cardinality, SUB_PART AS Sub_part, NULLABLE AS Nullable,
      INDEX_COMMENT AS Index_comment, COALESCE(IS_VISIBLE, 'YES') AS Is_visible, EXPRESSION AS Expression
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX`;
  const indexFallbackSql = `SELECT INDEX_NAME AS Key_name, COLUMN_NAME AS Column_name, NON_UNIQUE AS Non_unique, SEQ_IN_INDEX AS Seq_in_index,
      INDEX_TYPE AS Index_type, COLLATION AS Collation, CARDINALITY AS Cardinality, SUB_PART AS Sub_part, NULLABLE AS Nullable,
      INDEX_COMMENT AS Index_comment, 'YES' AS Is_visible, NULL AS Expression
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX`;
  const foreignKeySql = `SELECT usage_source.CONSTRAINT_NAME, usage_source.COLUMN_NAME, usage_source.ORDINAL_POSITION,
      usage_source.REFERENCED_TABLE_SCHEMA, usage_source.REFERENCED_TABLE_NAME, usage_source.REFERENCED_COLUMN_NAME,
      reference_source.UPDATE_RULE, reference_source.DELETE_RULE
    FROM information_schema.KEY_COLUMN_USAGE AS usage_source
    LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS AS reference_source
      ON reference_source.CONSTRAINT_SCHEMA = usage_source.CONSTRAINT_SCHEMA
      AND reference_source.CONSTRAINT_NAME = usage_source.CONSTRAINT_NAME
    WHERE usage_source.TABLE_SCHEMA = ? AND usage_source.TABLE_NAME = ? AND usage_source.REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY usage_source.CONSTRAINT_NAME, usage_source.ORDINAL_POSITION`;
  const checkSql = `SELECT constraint_source.CONSTRAINT_NAME, check_source.CHECK_CLAUSE, COALESCE(constraint_source.ENFORCED, 'YES') AS ENFORCED
    FROM information_schema.TABLE_CONSTRAINTS AS constraint_source
    JOIN information_schema.CHECK_CONSTRAINTS AS check_source
      ON check_source.CONSTRAINT_SCHEMA = constraint_source.CONSTRAINT_SCHEMA
      AND check_source.CONSTRAINT_NAME = constraint_source.CONSTRAINT_NAME
    WHERE constraint_source.TABLE_SCHEMA = ? AND constraint_source.TABLE_NAME = ? AND constraint_source.CONSTRAINT_TYPE = 'CHECK'`;
  const checkFallbackSql = `SELECT constraint_source.CONSTRAINT_NAME, check_source.CHECK_CLAUSE, 'YES' AS ENFORCED
    FROM information_schema.TABLE_CONSTRAINTS AS constraint_source
    JOIN information_schema.CHECK_CONSTRAINTS AS check_source
      ON check_source.CONSTRAINT_SCHEMA = constraint_source.CONSTRAINT_SCHEMA
      AND check_source.CONSTRAINT_NAME = constraint_source.CONSTRAINT_NAME
    WHERE constraint_source.TABLE_SCHEMA = ? AND constraint_source.TABLE_NAME = ? AND constraint_source.CONSTRAINT_TYPE = 'CHECK'`;
  const partitionSql = `SELECT PARTITION_NAME, PARTITION_METHOD, PARTITION_EXPRESSION, PARTITION_DESCRIPTION, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH
    FROM information_schema.PARTITIONS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND PARTITION_NAME IS NOT NULL ORDER BY PARTITION_ORDINAL_POSITION`;
  const createSql = `SHOW CREATE TABLE ${qualifiedTable(databaseName, tableName)}`;

  const tableRows = await queryRecordsSafe(connection, tableSql, parameters, timeoutMs, statements, 'Tablo seçenekleri');
  const columnRows = await queryRecordsSafe(connection, columnSql, parameters, timeoutMs, statements, 'Kolon bilgileri');
  const indexRows = await queryRecordsSafe(connection, indexSql, parameters, timeoutMs, statements, 'İndeks bilgileri', indexFallbackSql);
  const foreignKeyRows = await queryRecordsSafe(connection, foreignKeySql, parameters, timeoutMs, statements, 'Foreign key bilgileri');
  let checkRows: Array<Record<string, unknown>> = [];
  try {
    checkRows = await queryRecordsSafe(connection, checkSql, parameters, timeoutMs, statements, 'Check constraint bilgileri', checkFallbackSql);
  } catch {
    checkRows = [];
  }
  let partitionRows: Array<Record<string, unknown>> = [];
  try {
    partitionRows = await queryRecordsSafe(connection, partitionSql, parameters, timeoutMs, statements, 'Partisyon bilgileri');
  } catch {
    partitionRows = [];
  }
  pushStatement(statements, createSql, [], 'Bire bir CREATE TABLE tanımı');
  const [createRows] = await connection.query({ sql: createSql, timeout: timeoutMs });
  const createRecord = records(createRows)[0] ?? {};
  const tableRecord = tableRows[0] ?? {};
  const collation = tableRecord.TABLE_COLLATION ? String(tableRecord.TABLE_COLLATION) : null;

  return {
    table: {
      name: String(tableRecord.TABLE_NAME ?? tableName),
      comment: String(tableRecord.TABLE_COMMENT ?? ''),
      engine: String(tableRecord.ENGINE ?? ''),
      collation,
      charset: collation?.split('_')[0] ?? null,
      autoIncrement: tableRecord.AUTO_INCREMENT === null || tableRecord.AUTO_INCREMENT === undefined ? null : String(tableRecord.AUTO_INCREMENT),
      rowFormat: tableRecord.ROW_FORMAT ? String(tableRecord.ROW_FORMAT) : null,
      tableType: String(tableRecord.TABLE_TYPE ?? 'BASE TABLE'),
      createTime: tableRecord.CREATE_TIME ? String(tableRecord.CREATE_TIME) : null,
      updateTime: tableRecord.UPDATE_TIME ? String(tableRecord.UPDATE_TIME) : null
    },
    columns: columnRows.map(row => ({
      Field: String(row.Field ?? ''),
      Type: String(row.Type ?? ''),
      Null: String(row.Null ?? ''),
      Key: String(row.Key ?? ''),
      Default: row.Default === null || row.Default === undefined ? null : String(row.Default),
      Extra: String(row.Extra ?? ''),
      Comment: String(row.Comment ?? ''),
      Collation: row.Collation ? String(row.Collation) : null,
      Ordinal_position: Number(row.Ordinal_position ?? 0),
      Data_type: String(row.Data_type ?? ''),
      Character_maximum_length: row.Character_maximum_length === null || row.Character_maximum_length === undefined ? null : Number(row.Character_maximum_length),
      Numeric_precision: row.Numeric_precision === null || row.Numeric_precision === undefined ? null : Number(row.Numeric_precision),
      Numeric_scale: row.Numeric_scale === null || row.Numeric_scale === undefined ? null : Number(row.Numeric_scale),
      Datetime_precision: row.Datetime_precision === null || row.Datetime_precision === undefined ? null : Number(row.Datetime_precision),
      Character_set_name: row.Character_set_name ? String(row.Character_set_name) : null,
      Generation_expression: String(row.Generation_expression ?? '')
    })),
    indexes: indexRows.map(row => ({
      Key_name: String(row.Key_name ?? ''),
      Column_name: String(row.Column_name ?? row.Expression ?? ''),
      Non_unique: String(row.Non_unique ?? ''),
      Seq_in_index: String(row.Seq_in_index ?? ''),
      Index_type: String(row.Index_type ?? 'BTREE'),
      Collation: row.Collation ? String(row.Collation) : null,
      Cardinality: row.Cardinality === null || row.Cardinality === undefined ? null : Number(row.Cardinality),
      Sub_part: row.Sub_part === null || row.Sub_part === undefined ? null : Number(row.Sub_part),
      Nullable: String(row.Nullable ?? ''),
      Index_comment: String(row.Index_comment ?? ''),
      Is_visible: String(row.Is_visible ?? 'YES'),
      Expression: row.Expression ? String(row.Expression) : null
    })),
    foreignKeys: foreignKeyRows.map(row => ({
      CONSTRAINT_NAME: String(row.CONSTRAINT_NAME ?? ''),
      COLUMN_NAME: String(row.COLUMN_NAME ?? ''),
      ORDINAL_POSITION: Number(row.ORDINAL_POSITION ?? 0),
      REFERENCED_TABLE_SCHEMA: String(row.REFERENCED_TABLE_SCHEMA ?? databaseName),
      REFERENCED_TABLE_NAME: String(row.REFERENCED_TABLE_NAME ?? ''),
      REFERENCED_COLUMN_NAME: String(row.REFERENCED_COLUMN_NAME ?? ''),
      UPDATE_RULE: String(row.UPDATE_RULE ?? 'RESTRICT'),
      DELETE_RULE: String(row.DELETE_RULE ?? 'RESTRICT')
    })),
    checkConstraints: checkRows.map(row => ({
      CONSTRAINT_NAME: String(row.CONSTRAINT_NAME ?? ''),
      CHECK_CLAUSE: String(row.CHECK_CLAUSE ?? ''),
      ENFORCED: String(row.ENFORCED ?? 'YES')
    })),
    partitions: partitionRows.map(row => ({
      PARTITION_NAME: row.PARTITION_NAME ? String(row.PARTITION_NAME) : null,
      PARTITION_METHOD: row.PARTITION_METHOD ? String(row.PARTITION_METHOD) : null,
      PARTITION_EXPRESSION: row.PARTITION_EXPRESSION ? String(row.PARTITION_EXPRESSION) : null,
      PARTITION_DESCRIPTION: row.PARTITION_DESCRIPTION ? String(row.PARTITION_DESCRIPTION) : null,
      TABLE_ROWS: Number(row.TABLE_ROWS ?? 0),
      DATA_LENGTH: Number(row.DATA_LENGTH ?? 0),
      INDEX_LENGTH: Number(row.INDEX_LENGTH ?? 0)
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

async function updateCell(
  connection: Awaited<ReturnType<typeof mysql.createConnection>>,
  input: DatabaseApiRequest,
  timeoutMs: number,
  statements: DatabaseQueryStatement[]
) {
  const databaseName = input.database ?? '';
  const tableName = input.table ?? '';
  const columnName = input.column ?? '';
  const primaryKeyEntries = Object.entries(input.primaryKey || {});

  if (primaryKeyEntries.length === 0 || primaryKeyEntries.length > 8) {
    throw new DatabaseServiceError('Hücre düzenleme için 1 ile 8 kolon arasında primary key değeri gereklidir.', 422, 'PRIMARY_KEY_REQUIRED');
  }

  const whereSql = primaryKeyEntries.map(([key]) => `${quoteIdentifier(key, 'Primary key kolonu')} <=> ?`).join(' AND ');
  const sql = `UPDATE ${qualifiedTable(databaseName, tableName)} SET ${quoteIdentifier(columnName, 'Güncellenecek kolon')} = ? WHERE ${whereSql} LIMIT 1`;
  const normalizedValue = databaseParameterValue(input.value);
  const parameters = [normalizedValue, ...primaryKeyEntries.map(([, value]) => databaseParameterValue(value))];

  pushStatement(statements, sql, parameters, 'Hücre güncelleme');
  const [result] = await connection.query({ sql, timeout: timeoutMs }, parameters);
  const header = result as unknown as Record<string, unknown>;
  const affectedRows = Number(header.affectedRows ?? 0);

  if (affectedRows === 0) {
    throw new DatabaseServiceError('Primary key ile eşleşen satır bulunamadı veya değer değişmedi.', 409, 'ROW_NOT_UPDATED', { statements });
  }

  return withMeta(
    { affectedRows, changedRows: Number(header.changedRows ?? affectedRows), value: jsonSafe(input.value) },
    statements
  );
}

async function deleteRows(
  connection: Awaited<ReturnType<typeof mysql.createConnection>>,
  input: DatabaseApiRequest,
  timeoutMs: number,
  statements: DatabaseQueryStatement[]
) {
  const databaseName = input.database ?? '';
  const tableName = input.table ?? '';
  const primaryKeys = Array.isArray(input.primaryKeys) ? input.primaryKeys.slice(0, 200) : [];
  if (primaryKeys.length === 0) throw new DatabaseServiceError('Silinecek satırların primary key bilgisi bulunamadı.', 422, 'PRIMARY_KEYS_REQUIRED');

  let affectedRows = 0;
  await connection.beginTransaction();
  try {
    for (const key of primaryKeys) {
      const entries = Object.entries(key || {});
      if (entries.length === 0 || entries.length > 8) throw new DatabaseServiceError('Geçersiz primary key kümesi.', 422, 'INVALID_PRIMARY_KEY');
      const whereSql = entries.map(([column]) => `${quoteIdentifier(column, 'Primary key kolonu')} <=> ?`).join(' AND ');
      const sql = `DELETE FROM ${qualifiedTable(databaseName, tableName)} WHERE ${whereSql} LIMIT 1`;
      const parameters = entries.map(([, value]) => databaseParameterValue(value));
      pushStatement(statements, sql, parameters, 'Seçili satırı sil');
      const [result] = await connection.query({ sql, timeout: timeoutMs }, parameters);
      affectedRows += Number((result as unknown as Record<string, unknown>).affectedRows ?? 0);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }

  return withMeta({ affectedRows }, statements);
}

function escapeSqlString(value: string) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function assertSimpleIdentifier(value: string, label: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_$-]+$/.test(normalized)) throw new DatabaseServiceError(`${label} geçersiz.`, 422, 'INVALID_SCHEMA_OPTION');
  return normalized;
}

function parseEnumValues(value: string) {
  const values: string[] = [];
  let index = 0;
  const source = value.trim();
  while (index < source.length) {
    while (/\s/.test(source[index] || '')) index += 1;
    if (source[index] !== "'") throw new DatabaseServiceError('ENUM/SET ayarı tek tırnaklı değerler içermelidir.', 422, 'INVALID_ENUM_VALUES');
    index += 1;
    let current = '';
    let closed = false;
    while (index < source.length) {
      const char = source[index];
      if (char === "'" && source[index + 1] === "'") {
        current += "'";
        index += 2;
        continue;
      }
      if (char === "'") {
        index += 1;
        closed = true;
        break;
      }
      current += char;
      index += 1;
    }
    if (!closed) throw new DatabaseServiceError('ENUM/SET değeri kapatılmamış.', 422, 'INVALID_ENUM_VALUES');
    values.push(current);
    while (/\s/.test(source[index] || '')) index += 1;
    if (index >= source.length) break;
    if (source[index] !== ',') throw new DatabaseServiceError('ENUM/SET değerleri virgülle ayrılmalıdır.', 422, 'INVALID_ENUM_VALUES');
    index += 1;
  }
  if (values.length === 0 || values.length > 255) throw new DatabaseServiceError('ENUM/SET en az bir değer içermelidir.', 422, 'INVALID_ENUM_VALUES');
  return values;
}

function normalizeColumnType(column: TableColumnDefinition) {
  const dataType = column.dataType.trim().toUpperCase();
  if (!COLUMN_TYPES.has(dataType)) throw new DatabaseServiceError(`Desteklenmeyen kolon tipi: ${dataType}`, 422, 'UNSUPPORTED_COLUMN_TYPE');
  let typeSql = dataType;
  const length = column.length?.trim();
  if (dataType === 'ENUM' || dataType === 'SET') {
    const enumValues = parseEnumValues(length || '');
    typeSql += `(${enumValues.map(escapeSqlString).join(',')})`;
  } else if (length) {
    if (!/^\d+(?:\s*,\s*\d+)?$/.test(length)) throw new DatabaseServiceError('Uzunluk/Ayar alanı yalnızca sayısal uzunluk veya hassasiyet kabul eder.', 422, 'INVALID_COLUMN_LENGTH');
    typeSql += `(${length.replace(/\s/g, '')})`;
  }
  if (column.unsigned && NUMERIC_TYPES.has(dataType)) typeSql += ' UNSIGNED';
  if (column.zerofill && NUMERIC_TYPES.has(dataType)) typeSql += ' ZEROFILL';
  return typeSql;
}

function safeExpression(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 2_000 || /[;\0]/.test(normalized) || /--|\/\*/.test(normalized)) {
    throw new DatabaseServiceError(`${label} geçersiz veya güvensiz.`, 422, 'INVALID_SQL_EXPRESSION');
  }
  return normalized;
}

function buildColumnDefinition(column: TableColumnDefinition) {
  let sql = `${quoteIdentifier(column.name, 'Kolon adı')} ${normalizeColumnType(column)}`;
  if (column.charset) sql += ` CHARACTER SET ${assertSimpleIdentifier(column.charset, 'Karakter seti')}`;
  if (column.collation) sql += ` COLLATE ${assertSimpleIdentifier(column.collation, 'Collation')}`;
  if (column.generatedExpression?.trim()) {
    const expression = safeExpression(column.generatedExpression, 'Üretilen kolon ifadesi');
    sql += ` GENERATED ALWAYS AS (${expression}) ${column.generatedStorage === 'STORED' ? 'STORED' : 'VIRTUAL'}`;
  } else {
    sql += column.nullable ? ' NULL' : ' NOT NULL';
    if (column.defaultKind === 'null') sql += ' DEFAULT NULL';
    if (column.defaultKind === 'literal') sql += ` DEFAULT ${escapeSqlString(column.defaultValue ?? '')}`;
    if (column.defaultKind === 'expression') sql += ` DEFAULT ${safeExpression(column.defaultValue ?? '', 'Varsayılan ifade')}`;
    if (column.autoIncrement) sql += ' AUTO_INCREMENT';
  }
  if (column.comment) sql += ` COMMENT ${escapeSqlString(column.comment)}`;
  return sql;
}

function positionSql(first?: boolean, after?: string | null) {
  if (first) return ' FIRST';
  if (after) return ` AFTER ${quoteIdentifier(after, 'Önceki kolon')}`;
  return '';
}

function buildIndexSql(index: TableIndexDefinition) {
  if (!index.columns?.length || index.columns.length > 32) throw new DatabaseServiceError('İndeks en az bir kolon içermelidir.', 422, 'INDEX_COLUMNS_REQUIRED');
  const columns = index.columns.map(column => {
    let value = quoteIdentifier(column.name, 'İndeks kolonu');
    if (column.length) value += `(${boundedInteger(column.length, 1, 1, 65535)})`;
    if (column.order === 'DESC') value += ' DESC';
    return value;
  }).join(', ');
  if (index.kind === 'PRIMARY') return `PRIMARY KEY (${columns})`;
  const name = quoteIdentifier(index.name || `idx_${index.columns.map(column => column.name).join('_')}`.slice(0, 60), 'İndeks adı');
  const prefix = index.kind === 'UNIQUE' ? 'UNIQUE KEY' : index.kind === 'FULLTEXT' ? 'FULLTEXT KEY' : index.kind === 'SPATIAL' ? 'SPATIAL INDEX' : 'KEY';
  return `${prefix} ${name} (${columns})${index.comment ? ` COMMENT ${escapeSqlString(index.comment)}` : ''}`;
}

function buildForeignKeySql(databaseName: string, foreignKey: TableForeignKeyDefinition) {
  if (!foreignKey.columns.length || foreignKey.columns.length !== foreignKey.referencedColumns.length) {
    throw new DatabaseServiceError('Foreign key yerel ve referans kolon sayıları eşit olmalıdır.', 422, 'INVALID_FOREIGN_KEY_COLUMNS');
  }
  const localColumns = foreignKey.columns.map(column => quoteIdentifier(column, 'Foreign key kolonu')).join(', ');
  const referenceColumns = foreignKey.referencedColumns.map(column => quoteIdentifier(column, 'Referans kolon')).join(', ');
  const referenceDatabase = foreignKey.referencedDatabase || databaseName;
  const onDelete = (foreignKey.onDelete || 'RESTRICT').toUpperCase();
  const onUpdate = (foreignKey.onUpdate || 'RESTRICT').toUpperCase();
  if (!FK_ACTIONS.has(onDelete) || !FK_ACTIONS.has(onUpdate)) throw new DatabaseServiceError('Geçersiz foreign key aksiyonu.', 422, 'INVALID_FOREIGN_KEY_ACTION');
  return `CONSTRAINT ${quoteIdentifier(foreignKey.name, 'Foreign key adı')} FOREIGN KEY (${localColumns}) REFERENCES ${qualifiedTable(referenceDatabase, foreignKey.referencedTable)} (${referenceColumns}) ON DELETE ${onDelete} ON UPDATE ${onUpdate}`;
}

async function alterTable(
  connection: Awaited<ReturnType<typeof mysql.createConnection>>,
  input: DatabaseApiRequest,
  timeoutMs: number,
  statements: DatabaseQueryStatement[]
) {
  const databaseName = input.database ?? '';
  let tableName = input.table ?? '';
  const mutation = input.mutation;
  if (!mutation) throw new DatabaseServiceError('Tablo değişikliği tanımı eksik.', 422, 'TABLE_MUTATION_REQUIRED');

  const run = async (sql: string, label: string) => {
    pushStatement(statements, sql, [], label);
    await connection.query({ sql, timeout: timeoutMs });
  };

  switch (mutation.kind) {
    case 'table-options': {
      if (mutation.name?.trim() && mutation.name.trim() !== tableName) {
        const nextName = mutation.name.trim();
        await run(`ALTER TABLE ${qualifiedTable(databaseName, tableName)} RENAME TO ${qualifiedTable(databaseName, nextName)}`, 'Tabloyu yeniden adlandır');
        tableName = nextName;
      }
      const options: string[] = [];
      if (mutation.engine) {
        const engine = mutation.engine.toUpperCase();
        if (!TABLE_ENGINES.has(engine)) throw new DatabaseServiceError('Desteklenmeyen tablo motoru.', 422, 'INVALID_TABLE_ENGINE');
        options.push(`ENGINE=${engine}`);
      }
      if (mutation.collation) options.push(`DEFAULT COLLATE=${assertSimpleIdentifier(mutation.collation, 'Collation')}`);
      if (mutation.autoIncrement !== undefined && mutation.autoIncrement !== null) options.push(`AUTO_INCREMENT=${boundedInteger(mutation.autoIncrement, 1, 1, Number.MAX_SAFE_INTEGER)}`);
      if (mutation.rowFormat) {
        const rowFormat = mutation.rowFormat.toUpperCase();
        if (!ROW_FORMATS.has(rowFormat)) throw new DatabaseServiceError('Geçersiz satır formatı.', 422, 'INVALID_ROW_FORMAT');
        options.push(`ROW_FORMAT=${rowFormat}`);
      }
      if (mutation.comment !== undefined) options.push(`COMMENT=${escapeSqlString(mutation.comment)}`);
      if (options.length) await run(`ALTER TABLE ${qualifiedTable(databaseName, tableName)} ${options.join(', ')}`, 'Tablo seçeneklerini güncelle');
      break;
    }
    case 'add-column':
      await run(`ALTER TABLE ${qualifiedTable(databaseName, tableName)} ADD COLUMN ${buildColumnDefinition(mutation.column)}${positionSql(mutation.first, mutation.after)}`, 'Kolon ekle');
      break;
    case 'modify-column':
      await run(`ALTER TABLE ${qualifiedTable(databaseName, tableName)} CHANGE COLUMN ${quoteIdentifier(mutation.originalName, 'Eski kolon adı')} ${buildColumnDefinition(mutation.column)}${positionSql(mutation.first, mutation.after)}`, 'Kolonu değiştir');
      break;
    case 'drop-column':
      await run(`ALTER TABLE ${qualifiedTable(databaseName, tableName)} DROP COLUMN ${quoteIdentifier(mutation.columnName, 'Kolon adı')}`, 'Kolonu sil');
      break;
    case 'add-index':
      await run(`ALTER TABLE ${qualifiedTable(databaseName, tableName)} ADD ${buildIndexSql(mutation.index)}`, 'İndeks ekle');
      break;
    case 'drop-index':
      await run(
        mutation.indexName === 'PRIMARY'
          ? `ALTER TABLE ${qualifiedTable(databaseName, tableName)} DROP PRIMARY KEY`
          : `ALTER TABLE ${qualifiedTable(databaseName, tableName)} DROP INDEX ${quoteIdentifier(mutation.indexName, 'İndeks adı')}`,
        'İndeksi sil'
      );
      break;
    case 'add-foreign-key':
      await run(`ALTER TABLE ${qualifiedTable(databaseName, tableName)} ADD ${buildForeignKeySql(databaseName, mutation.foreignKey)}`, 'Foreign key ekle');
      break;
    case 'drop-foreign-key':
      await run(`ALTER TABLE ${qualifiedTable(databaseName, tableName)} DROP FOREIGN KEY ${quoteIdentifier(mutation.constraintName, 'Foreign key adı')}`, 'Foreign key sil');
      break;
    default:
      throw new DatabaseServiceError('Desteklenmeyen tablo değişikliği.', 422, 'UNSUPPORTED_TABLE_MUTATION');
  }

  const refreshed = await tableInfo(connection, databaseName, tableName, timeoutMs, statements);
  return { tableName, tableInfo: refreshed, _meta: { statements } };
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
      { rows: jsonSafe(result) as Record<string, unknown>[], fields: fields?.map(field => ({ name: field.name, type: field.type })) ?? [], maximumRows },
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
    const connectionDatabase = input.database === null ? undefined : input.database || connectionInput.database || undefined;
    connection = await mysql.createConnection({
      host: resolvedHost.resolvedHost,
      port: connectionInput.port,
      user: connectionInput.username,
      password: connectionInput.password,
      database: connectionDatabase || undefined,
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
      case 'update-cell':
        return await updateCell(connection, input, queryTimeoutMs, statements);
      case 'delete-rows':
        return await deleteRows(connection, input, queryTimeoutMs, statements);
      case 'alter-table':
        return await alterTable(connection, input, queryTimeoutMs, statements);
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
