import type { DatabaseConnectionPayload, QueryExecutionResult } from 'types';
import type {
  DatabasePerformanceSchemaSize,
  DatabasePerformanceSnapshot,
  DatabaseReplicationStatus,
  DatabaseWorkbenchRequest
} from '@/lib/databaseWorkbenchTypes';
import { DatabaseServiceError, executeDatabaseRequest } from '@/lib/server/database-service';

async function run(connection: DatabaseConnectionPayload, sql: string, database?: string | null) {
  return executeDatabaseRequest({ action: 'query', connection, database, sql }) as Promise<QueryExecutionResult>;
}

async function rows(connection: DatabaseConnectionPayload, sql: string, database?: string | null) {
  const result = await run(connection, sql, database);
  return Array.isArray(result.rows) ? result.rows : [];
}

async function optionalRows(connection: DatabaseConnectionPayload, sql: string, database?: string | null) {
  try {
    return await rows(connection, sql, database);
  } catch {
    return [];
  }
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function statusMap(source: Record<string, unknown>[]) {
  const map = new Map<string, string>();
  for (const item of source) {
    const key = String(item.Variable_name ?? item.variable_name ?? '');
    const value = String(item.Value ?? item.value ?? '0');
    if (key) map.set(key, value);
  }
  return map;
}

function firstValue(row: Record<string, unknown> | undefined, keys: string[]) {
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function replicationStatus(row: Record<string, unknown> | undefined): DatabaseReplicationStatus {
  if (!row) {
    return {
      available: false,
      running: null,
      secondsBehind: null,
      ioRunning: null,
      sqlRunning: null,
      sourceHost: null,
      channelName: null,
      lastError: null
    };
  }

  const ioRunning = firstValue(row, ['Replica_IO_Running', 'Slave_IO_Running']);
  const sqlRunning = firstValue(row, ['Replica_SQL_Running', 'Slave_SQL_Running']);
  const secondsBehind = firstValue(row, ['Seconds_Behind_Source', 'Seconds_Behind_Master']);
  const normalizedIo = ioRunning === null ? null : String(ioRunning);
  const normalizedSql = sqlRunning === null ? null : String(sqlRunning);
  const running = normalizedIo === null && normalizedSql === null
    ? null
    : normalizedIo?.toLowerCase() === 'yes' && normalizedSql?.toLowerCase() === 'yes';

  return {
    available: true,
    running,
    secondsBehind: secondsBehind === null ? null : numeric(secondsBehind),
    ioRunning: normalizedIo,
    sqlRunning: normalizedSql,
    sourceHost: String(firstValue(row, ['Source_Host', 'Master_Host']) ?? '') || null,
    channelName: String(firstValue(row, ['Channel_Name', 'Connection_name']) ?? '') || null,
    lastError: String(firstValue(row, ['Last_Error', 'Last_SQL_Error', 'Last_IO_Error']) ?? '') || null
  };
}

export async function executeDatabasePerformanceRequest(input: DatabaseWorkbenchRequest): Promise<DatabasePerformanceSnapshot> {
  if (!input.connection) {
    throw new DatabaseServiceError('Performans snapshot bağlantısı eksik.', 422, 'MISSING_DATABASE_CONNECTION');
  }

  const connection = input.connection;
  const statusRows = await rows(connection, `SHOW GLOBAL STATUS WHERE Variable_name IN (
    'Uptime', 'Questions', 'Threads_connected', 'Threads_running', 'Max_used_connections',
    'Slow_queries', 'Aborted_connects', 'Bytes_received', 'Bytes_sent',
    'Innodb_buffer_pool_pages_total', 'Innodb_buffer_pool_pages_free',
    'Innodb_buffer_pool_pages_data', 'Innodb_buffer_pool_pages_dirty',
    'Innodb_buffer_pool_reads', 'Innodb_buffer_pool_read_requests'
  )`);
  const variableRows = await optionalRows(connection, `SHOW GLOBAL VARIABLES WHERE Variable_name IN (
    'max_connections', 'innodb_page_size'
  )`);
  const schemaRows = await optionalRows(connection, `SELECT TABLE_SCHEMA AS schemaName,
    COALESCE(SUM(DATA_LENGTH), 0) AS dataBytes,
    COALESCE(SUM(INDEX_LENGTH), 0) AS indexBytes,
    COALESCE(SUM(DATA_FREE), 0) AS freeBytes
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
    GROUP BY TABLE_SCHEMA
    ORDER BY COALESCE(SUM(DATA_LENGTH), 0) + COALESCE(SUM(INDEX_LENGTH), 0) DESC`);

  const replicaRows = await optionalRows(connection, 'SHOW REPLICA STATUS');
  const legacyReplicaRows = replicaRows.length ? [] : await optionalRows(connection, 'SHOW SLAVE STATUS');
  const status = statusMap(statusRows);
  const variables = statusMap(variableRows);
  const read = (name: string) => numeric(status.get(name));
  const pageSize = numeric(variables.get('innodb_page_size'), 16_384);
  const totalPages = read('Innodb_buffer_pool_pages_total');
  const freePages = read('Innodb_buffer_pool_pages_free');
  const dataPages = read('Innodb_buffer_pool_pages_data');
  const dirtyPages = read('Innodb_buffer_pool_pages_dirty');
  const reads = read('Innodb_buffer_pool_reads');
  const readRequests = read('Innodb_buffer_pool_read_requests');
  const usedPages = Math.max(0, totalPages - freePages);

  const topSchemas: DatabasePerformanceSchemaSize[] = schemaRows.map(item => {
    const dataBytes = numeric(item.dataBytes);
    const indexBytes = numeric(item.indexBytes);
    const freeBytes = numeric(item.freeBytes);
    return {
      schema: String(item.schemaName ?? ''),
      dataBytes,
      indexBytes,
      freeBytes,
      totalBytes: dataBytes + indexBytes
    };
  }).filter(item => item.schema);

  const storage = topSchemas.reduce(
    (totals, item) => ({
      dataBytes: totals.dataBytes + item.dataBytes,
      indexBytes: totals.indexBytes + item.indexBytes,
      freeBytes: totals.freeBytes + item.freeBytes,
      totalBytes: totals.totalBytes + item.totalBytes
    }),
    { dataBytes: 0, indexBytes: 0, freeBytes: 0, totalBytes: 0 }
  );
  const selectedDatabase = typeof input.database === 'string' ? input.database : null;
  const selectedDatabaseBytes = selectedDatabase
    ? topSchemas.find(item => item.schema === selectedDatabase)?.totalBytes ?? 0
    : null;

  return {
    sampledAt: new Date().toISOString(),
    uptimeSeconds: read('Uptime'),
    questions: read('Questions'),
    threadsConnected: read('Threads_connected'),
    threadsRunning: read('Threads_running'),
    maxUsedConnections: read('Max_used_connections'),
    maxConnections: variables.has('max_connections') ? numeric(variables.get('max_connections')) : null,
    slowQueries: read('Slow_queries'),
    abortedConnects: read('Aborted_connects'),
    bytesReceived: read('Bytes_received'),
    bytesSent: read('Bytes_sent'),
    bufferPool: {
      totalPages,
      freePages,
      dataPages,
      dirtyPages,
      pageSize,
      usagePercent: totalPages ? usedPages / totalPages * 100 : 0,
      dirtyPercent: totalPages ? dirtyPages / totalPages * 100 : 0,
      hitRatio: readRequests ? Math.max(0, Math.min(1, 1 - reads / readRequests)) : null,
      reads,
      readRequests
    },
    replication: replicationStatus((replicaRows[0] || legacyReplicaRows[0]) as Record<string, unknown> | undefined),
    storage: {
      ...storage,
      selectedDatabaseBytes,
      topSchemas: topSchemas.slice(0, 12)
    }
  };
}
