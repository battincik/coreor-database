import type { DatabaseConnectionPayload, QueryExecutionResult } from 'types';
import type {
  DatabaseExportDataInput,
  DatabaseImportDataInput,
  DatabasePrivilegeChangeInput,
  DatabaseProcessCenterResponse,
  DatabaseUserSaveInput,
  DatabaseWorkbenchAction,
  DatabaseWorkbenchRequest
} from '@/lib/databaseWorkbenchTypes';
import { DATABASE_PRIVILEGES } from '@/lib/databaseWorkbenchTypes';
import { DatabaseServiceError, executeDatabaseRequest } from '@/lib/server/database-service';

const ACTIONS = new Set<DatabaseWorkbenchAction>([
  'users-list', 'user-grants', 'user-save', 'user-drop', 'privilege-change',
  'role-create', 'role-assign', 'process-list', 'process-kill', 'import-data', 'export-data'
]);
const PRIVILEGES = new Set<string>(DATABASE_PRIVILEGES);

export function isDatabaseWorkbenchAction(value: unknown): value is DatabaseWorkbenchAction {
  return typeof value === 'string' && ACTIONS.has(value as DatabaseWorkbenchAction);
}

function sqlString(value: string) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function identifier(value: unknown, label: string) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > 128 || normalized.includes('\0')) {
    throw new DatabaseServiceError(`${label} geçersiz.`, 422, 'INVALID_DATABASE_IDENTIFIER');
  }
  return `\`${normalized.replace(/`/g, '``')}\``;
}

function account(user: unknown, host: unknown) {
  const normalizedUser = typeof user === 'string' ? user.trim() : '';
  const normalizedHost = typeof host === 'string' ? host.trim() : '';
  if (!normalizedUser || normalizedUser.length > 80 || !normalizedHost || normalizedHost.length > 255) {
    throw new DatabaseServiceError('Kullanıcı adı veya host geçersiz.', 422, 'INVALID_DATABASE_ACCOUNT');
  }
  return `${sqlString(normalizedUser)}@${sqlString(normalizedHost)}`;
}

function safeInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), minimum), maximum) : fallback;
}

function valueLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) return sqlString(value.toISOString());
  if (typeof value === 'object') {
    const binary = value as { type?: unknown; base64?: unknown };
    if (binary.type === 'binary' && typeof binary.base64 === 'string') {
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(binary.base64) || binary.base64.length > 8_000_000) {
        throw new DatabaseServiceError('BLOB verisi geçersiz veya çok büyük.', 413, 'INVALID_BINARY_VALUE');
      }
      return `FROM_BASE64(${sqlString(binary.base64)})`;
    }
    return sqlString(JSON.stringify(value));
  }
  return sqlString(String(value));
}

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

function sanitizedFailure(error: unknown, fallback: string) {
  const candidate = error as { status?: number; code?: string; message?: string };
  return new DatabaseServiceError(candidate?.message || fallback, candidate?.status || 422, candidate?.code || 'DATABASE_WORKBENCH_FAILED');
}

async function listUsers(connection: DatabaseConnectionPayload) {
  const userRows = await rows(connection, `SELECT User AS user, Host AS host, plugin, account_locked AS accountLocked,
    password_expired AS passwordExpired, password_last_changed AS passwordLastChanged
    FROM mysql.user ORDER BY User, Host`);

  const mysqlRoleRows = await optionalRows(connection, `SELECT FROM_USER AS roleUser, FROM_HOST AS roleHost,
    TO_USER AS user, TO_HOST AS host, WITH_ADMIN_OPTION AS withAdminOption FROM mysql.role_edges`);
  const mariaRoleRows = mysqlRoleRows.length ? [] : await optionalRows(connection, `SELECT Role AS roleUser, '%' AS roleHost,
    User AS user, Host AS host, Admin_option AS withAdminOption FROM mysql.roles_mapping`);
  const defaultRoleRows = await optionalRows(connection, `SELECT DEFAULT_ROLE_USER AS roleUser, DEFAULT_ROLE_HOST AS roleHost,
    USER AS user, HOST AS host FROM mysql.default_roles`);
  const assignmentsSource = mysqlRoleRows.length ? mysqlRoleRows : mariaRoleRows;
  const roleKeys = new Set(assignmentsSource.map(item => `${String(item.roleUser)}@${String(item.roleHost || '%')}`));
  const defaultKeys = new Set(defaultRoleRows.map(item => `${String(item.roleUser)}@${String(item.roleHost || '%')}=>${String(item.user)}@${String(item.host)}`));

  const users = userRows.map(item => {
    const user = String(item.user ?? '');
    const host = String(item.host ?? '');
    return {
      user,
      host,
      plugin: item.plugin ? String(item.plugin) : null,
      accountLocked: String(item.accountLocked ?? 'N').toUpperCase() === 'Y',
      passwordExpired: String(item.passwordExpired ?? 'N').toUpperCase() === 'Y',
      passwordLastChanged: item.passwordLastChanged ? String(item.passwordLastChanged) : null,
      isRole: roleKeys.has(`${user}@${host}`)
    };
  });

  const assignments = assignmentsSource.map(item => {
    const roleUser = String(item.roleUser ?? '');
    const roleHost = String(item.roleHost ?? '%');
    const user = String(item.user ?? '');
    const host = String(item.host ?? '');
    return { roleUser, roleHost, user, host, isDefault: defaultKeys.has(`${roleUser}@${roleHost}=>${user}@${host}`) };
  });

  return { users: users.filter(item => !item.isRole), roles: users.filter(item => item.isRole), assignments };
}

async function userGrants(connection: DatabaseConnectionPayload, input: DatabaseWorkbenchRequest) {
  const target = account(input.user, input.host);
  const grantRows = await rows(connection, `SHOW GRANTS FOR ${target}`);
  return { grants: grantRows.flatMap(row => Object.values(row).map(value => String(value))) };
}

async function saveUser(connection: DatabaseConnectionPayload, raw: unknown) {
  const input = (raw || {}) as DatabaseUserSaveInput;
  const target = account(input.user, input.host);
  const original = input.originalUser && input.originalHost ? account(input.originalUser, input.originalHost) : null;
  const password = typeof input.password === 'string' ? input.password : '';
  if (password.length > 512) throw new DatabaseServiceError('Parola çok uzun.', 422, 'INVALID_DATABASE_PASSWORD');

  try {
    if (original && original !== target) await run(connection, `RENAME USER ${original} TO ${target}`);
    if (input.createIfMissing !== false && !original) {
      const createSql = password ? `CREATE USER IF NOT EXISTS ${target} IDENTIFIED BY ${sqlString(password)}` : `CREATE USER IF NOT EXISTS ${target}`;
      await run(connection, createSql);
    }
    const clauses: string[] = [];
    if (password) clauses.push(`IDENTIFIED BY ${sqlString(password)}`);
    clauses.push(input.accountLocked ? 'ACCOUNT LOCK' : 'ACCOUNT UNLOCK');
    clauses.push(input.passwordExpired ? 'PASSWORD EXPIRE' : 'PASSWORD EXPIRE NEVER');
    await run(connection, `ALTER USER ${target} ${clauses.join(' ')}`);
    return { saved: true, user: input.user.trim(), host: input.host.trim() };
  } catch (error) {
    throw sanitizedFailure(error, 'Veritabanı kullanıcısı kaydedilemedi.');
  }
}

async function dropUser(connection: DatabaseConnectionPayload, input: DatabaseWorkbenchRequest) {
  await run(connection, `DROP USER IF EXISTS ${account(input.user, input.host)}`);
  return { dropped: true };
}

function privilegeScope(input: DatabasePrivilegeChangeInput) {
  if (input.scope === 'global') return '*.*';
  if (input.scope === 'database') return `${identifier(input.database, 'Veritabanı')}.*`;
  return `${identifier(input.database, 'Veritabanı')}.${identifier(input.table, 'Tablo')}`;
}

async function changePrivileges(connection: DatabaseConnectionPayload, raw: unknown) {
  const input = (raw || {}) as DatabasePrivilegeChangeInput;
  const privileges = Array.from(new Set((input.privileges || []).map(value => value.trim().toUpperCase())));
  if (!privileges.length || privileges.some(value => !PRIVILEGES.has(value))) {
    throw new DatabaseServiceError('Geçersiz veya boş yetki listesi.', 422, 'INVALID_PRIVILEGE_LIST');
  }
  const target = account(input.user, input.host);
  const scope = privilegeScope(input);
  if (input.mode === 'revoke') {
    await run(connection, `REVOKE ${privileges.join(', ')} ON ${scope} FROM ${target}`);
  } else {
    await run(connection, `GRANT ${privileges.join(', ')} ON ${scope} TO ${target}${input.withGrantOption ? ' WITH GRANT OPTION' : ''}`);
  }
  return { changed: true };
}

async function createRole(connection: DatabaseConnectionPayload, input: DatabaseWorkbenchRequest) {
  const role = String(input.role || '').trim();
  if (!role || role.length > 80) throw new DatabaseServiceError('Rol adı geçersiz.', 422, 'INVALID_ROLE_NAME');
  const sql = connection.engine === 'mariadb'
    ? `CREATE ROLE IF NOT EXISTS ${identifier(role, 'Rol adı')}`
    : `CREATE ROLE IF NOT EXISTS ${account(role, String(input.host || '%'))}`;
  await run(connection, sql);
  return { created: true };
}

async function assignRole(connection: DatabaseConnectionPayload, input: DatabaseWorkbenchRequest) {
  const role = String(input.role || '').trim();
  const roleHost = String(input.roleHost || '%');
  const target = account(input.user, input.host);
  const mode = input.mode === 'revoke' ? 'revoke' : 'grant';
  const roleRef = connection.engine === 'mariadb' ? identifier(role, 'Rol adı') : account(role, roleHost);
  await run(connection, mode === 'revoke' ? `REVOKE ${roleRef} FROM ${target}` : `GRANT ${roleRef} TO ${target}`);
  if (mode === 'grant' && input.makeDefault) {
    const defaultSql = connection.engine === 'mariadb'
      ? `SET DEFAULT ROLE ${roleRef} FOR ${target}`
      : `SET DEFAULT ROLE ${roleRef} TO ${target}`;
    await run(connection, defaultSql);
  }
  return { changed: true };
}

async function processList(connection: DatabaseConnectionPayload): Promise<DatabaseProcessCenterResponse> {
  const processRows = await rows(connection, `SELECT ID AS id, USER AS user, HOST AS host, DB AS databaseName,
    COMMAND AS command, TIME AS seconds, STATE AS state, INFO AS info
    FROM information_schema.PROCESSLIST ORDER BY TIME DESC, ID`);
  const currentRows = await rows(connection, 'SELECT CONNECTION_ID() AS currentConnectionId');
  const lockRows = await optionalRows(connection, `SELECT ml.OBJECT_TYPE AS objectType, ml.OBJECT_SCHEMA AS schemaName,
    ml.OBJECT_NAME AS objectName, ml.LOCK_TYPE AS lockType, ml.LOCK_DURATION AS lockDuration,
    ml.LOCK_STATUS AS lockStatus, ml.OWNER_THREAD_ID AS ownerThreadId, th.PROCESSLIST_ID AS processId
    FROM performance_schema.metadata_locks ml
    LEFT JOIN performance_schema.threads th ON th.THREAD_ID = ml.OWNER_THREAD_ID
    ORDER BY ml.LOCK_STATUS DESC, ml.OBJECT_SCHEMA, ml.OBJECT_NAME`);
  const statusRows = await optionalRows(connection, 'SHOW ENGINE INNODB STATUS');
  const statusText = statusRows.length ? String(statusRows[0].Status ?? statusRows[0].STATUS ?? '') : '';
  const deadlockMarker = 'LATEST DETECTED DEADLOCK';
  const deadlockIndex = statusText.indexOf(deadlockMarker);
  const deadlockText = deadlockIndex >= 0 ? statusText.slice(deadlockIndex, deadlockIndex + 12000) : null;

  return {
    currentConnectionId: currentRows[0] ? Number(currentRows[0].currentConnectionId ?? 0) || null : null,
    processes: processRows.map(item => ({
      id: Number(item.id ?? 0), user: String(item.user ?? ''), host: String(item.host ?? ''),
      database: item.databaseName ? String(item.databaseName) : null, command: String(item.command ?? ''),
      seconds: Number(item.seconds ?? 0), state: item.state ? String(item.state) : null, info: item.info ? String(item.info) : null
    })),
    locks: lockRows.map(item => ({
      objectType: item.objectType ? String(item.objectType) : null,
      schema: item.schemaName ? String(item.schemaName) : null,
      objectName: item.objectName ? String(item.objectName) : null,
      lockType: item.lockType ? String(item.lockType) : null,
      lockDuration: item.lockDuration ? String(item.lockDuration) : null,
      lockStatus: item.lockStatus ? String(item.lockStatus) : null,
      ownerThreadId: item.ownerThreadId === null || item.ownerThreadId === undefined ? null : Number(item.ownerThreadId),
      processId: item.processId === null || item.processId === undefined ? null : Number(item.processId)
    })),
    deadlockText
  };
}

async function killProcess(connection: DatabaseConnectionPayload, input: DatabaseWorkbenchRequest) {
  const id = safeInteger(input.processId, 0, 1, Number.MAX_SAFE_INTEGER);
  if (!id) throw new DatabaseServiceError('Process ID geçersiz.', 422, 'INVALID_PROCESS_ID');
  await run(connection, `KILL ${input.killType === 'query' ? 'QUERY' : 'CONNECTION'} ${id}`);
  return { killed: true, processId: id };
}

async function importData(connection: DatabaseConnectionPayload, raw: unknown) {
  const input = (raw || {}) as DatabaseImportDataInput;
  const columns = Array.isArray(input.columns) ? input.columns : [];
  const importRows = Array.isArray(input.rows) ? input.rows.slice(0, 1000) : [];
  if (!columns.length || columns.length > 256 || !importRows.length) {
    throw new DatabaseServiceError('İçe aktarma kolonları veya satırları eksik.', 422, 'INVALID_IMPORT_DATA');
  }
  if (importRows.some(row => !Array.isArray(row) || row.length !== columns.length)) {
    throw new DatabaseServiceError('İçe aktarma satırlarının kolon sayıları eşleşmiyor.', 422, 'IMPORT_COLUMN_MISMATCH');
  }
  const verb = input.mode === 'replace' ? 'REPLACE' : input.mode === 'ignore' ? 'INSERT IGNORE' : 'INSERT';
  const sql = `${verb} INTO ${identifier(input.database, 'Veritabanı')}.${identifier(input.table, 'Tablo')} (${columns.map(column => identifier(column, 'Kolon')).join(', ')}) VALUES\n${importRows.map(row => `(${row.map(valueLiteral).join(', ')})`).join(',\n')}`;
  if (Buffer.byteLength(sql, 'utf8') > 10_000_000) throw new DatabaseServiceError('İçe aktarma batch boyutu çok büyük.', 413, 'IMPORT_BATCH_TOO_LARGE');
  const result = await run(connection, sql, input.database);
  return { affectedRows: Number(result.affectedRows ?? 0), rowCount: importRows.length };
}

async function exportData(connection: DatabaseConnectionPayload, raw: unknown) {
  const input = (raw || {}) as DatabaseExportDataInput;
  const columns = Array.isArray(input.columns) && input.columns.length
    ? input.columns.slice(0, 256).map(column => identifier(column, 'Kolon')).join(', ')
    : '*';
  const limit = safeInteger(input.limit, 5000, 1, 50000);
  const offset = safeInteger(input.offset, 0, 0, 50_000_000);
  const order = input.orderBy ? ` ORDER BY ${identifier(input.orderBy, 'Sıralama kolonu')} ${input.orderDirection === 'desc' ? 'DESC' : 'ASC'}` : '';
  const result = await run(connection, `SELECT ${columns} FROM ${identifier(input.database, 'Veritabanı')}.${identifier(input.table, 'Tablo')}${order} LIMIT ${limit} OFFSET ${offset}`, input.database);
  const exportRows = Array.isArray(result.rows) ? result.rows : [];
  return { rows: exportRows, columns: exportRows[0] ? Object.keys(exportRows[0]) : (input.columns || []), rowCount: exportRows.length };
}

export async function executeDatabaseWorkbenchRequest(input: DatabaseWorkbenchRequest) {
  if (!isDatabaseWorkbenchAction(input.action) || !input.connection) {
    throw new DatabaseServiceError('Desteklenmeyen çalışma alanı işlemi.', 422, 'UNSUPPORTED_WORKBENCH_ACTION');
  }
  const connection = input.connection;
  switch (input.action) {
    case 'users-list': return listUsers(connection);
    case 'user-grants': return userGrants(connection, input);
    case 'user-save': return saveUser(connection, input.userInput);
    case 'user-drop': return dropUser(connection, input);
    case 'privilege-change': return changePrivileges(connection, input.privilegeInput);
    case 'role-create': return createRole(connection, input);
    case 'role-assign': return assignRole(connection, input);
    case 'process-list': return processList(connection);
    case 'process-kill': return killProcess(connection, input);
    case 'import-data': return importData(connection, input.importInput);
    case 'export-data': return exportData(connection, input.exportInput);
  }
}
