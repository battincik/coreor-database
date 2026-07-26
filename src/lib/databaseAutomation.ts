'use client';

export interface SchemaSnapshot {
  id: string;
  serverId: string;
  databaseName: string;
  tableName: string;
  engine: string;
  createdAt: string;
  reason: string;
  alterSql: string;
  createSql?: string;
  tableInfo?: unknown;
}

export interface MigrationDraft {
  id: string;
  serverId: string;
  databaseName: string;
  name: string;
  createdAt: string;
  upSql: string;
  downSql: string;
  source: 'visual-editor' | 'query' | 'manual';
  status: 'draft' | 'applied';
}

export interface BackupTask {
  id: string;
  name: string;
  serverId: string;
  engine: string;
  databaseName: string | null;
  format: 'sql' | 'custom' | 'bacpac';
  destination: string;
  command: string;
  schedule: 'manual' | 'daily' | 'weekly';
  createdAt: string;
  lastRunAt?: string;
  status: 'ready' | 'running' | 'completed' | 'failed';
}

export interface ApprovalRequest {
  id: string;
  serverId: string;
  databaseName: string | null;
  operation: 'drop' | 'truncate' | 'production-alter';
  sql: string;
  requester: string;
  approver?: string;
  createdAt: string;
  resolvedAt?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface PreparedStatementSet {
  id: string;
  name: string;
  serverId: string;
  databaseName: string | null;
  sql: string;
  parameters: Array<{ name: string; value: string; type: 'string' | 'number' | 'boolean' | 'null' }>;
  createdAt: string;
  updatedAt: string;
}

const KEYS = {
  snapshots: 'coreor:schema-snapshots:v1',
  migrations: 'coreor:migration-drafts:v1',
  backups: 'coreor:backup-tasks:v1',
  approvals: 'coreor:approval-requests:v1',
  prepared: 'coreor:prepared-statements:v1'
} as const;

function read<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, values: T[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(values));
  window.dispatchEvent(new CustomEvent('coreor:automation-store-changed', { detail: { key } }));
}

export function automationId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const schemaSnapshots = {
  list: () => read<SchemaSnapshot>(KEYS.snapshots),
  add: (snapshot: SchemaSnapshot) => write(KEYS.snapshots, [snapshot, ...read<SchemaSnapshot>(KEYS.snapshots)].slice(0, 500)),
  remove: (id: string) => write(KEYS.snapshots, read<SchemaSnapshot>(KEYS.snapshots).filter(item => item.id !== id)),
  clear: () => write<SchemaSnapshot>(KEYS.snapshots, [])
};

export const migrationDrafts = {
  list: () => read<MigrationDraft>(KEYS.migrations),
  save: (draft: MigrationDraft) => write(KEYS.migrations, [draft, ...read<MigrationDraft>(KEYS.migrations).filter(item => item.id !== draft.id)].slice(0, 300)),
  remove: (id: string) => write(KEYS.migrations, read<MigrationDraft>(KEYS.migrations).filter(item => item.id !== id))
};

export const backupTasks = {
  list: () => read<BackupTask>(KEYS.backups),
  save: (task: BackupTask) => write(KEYS.backups, [task, ...read<BackupTask>(KEYS.backups).filter(item => item.id !== task.id)].slice(0, 200)),
  remove: (id: string) => write(KEYS.backups, read<BackupTask>(KEYS.backups).filter(item => item.id !== id))
};

export const approvalRequests = {
  list: () => read<ApprovalRequest>(KEYS.approvals),
  save: (request: ApprovalRequest) => write(KEYS.approvals, [request, ...read<ApprovalRequest>(KEYS.approvals).filter(item => item.id !== request.id)].slice(0, 300)),
  remove: (id: string) => write(KEYS.approvals, read<ApprovalRequest>(KEYS.approvals).filter(item => item.id !== id))
};

export const preparedStatementSets = {
  list: () => read<PreparedStatementSet>(KEYS.prepared),
  save: (item: PreparedStatementSet) => write(KEYS.prepared, [item, ...read<PreparedStatementSet>(KEYS.prepared).filter(entry => entry.id !== item.id)].slice(0, 200)),
  remove: (id: string) => write(KEYS.prepared, read<PreparedStatementSet>(KEYS.prepared).filter(item => item.id !== id))
};

export function backupCommand(engine: string, host: string, port: number, username: string, databaseName: string | null, destination: string) {
  const target = databaseName || 'all-databases';
  if (engine === 'postgresql' || engine === 'cockroachdb') {
    return `pg_dump --host=${host} --port=${port} --username=${username} --format=custom --file="${destination}" ${databaseName || 'DATABASE_NAME'}`;
  }
  if (engine === 'mssql') {
    return `sqlcmd -S ${host},${port} -U ${username} -Q "BACKUP DATABASE [${databaseName || 'DATABASE_NAME'}] TO DISK = N'${destination}' WITH INIT, COMPRESSION"`;
  }
  return `mysqldump --host=${host} --port=${port} --user=${username} --single-transaction --routines --triggers ${databaseName || '--all-databases'} > "${destination || `${target}.sql`}"`;
}

export function maskValue(value: unknown, kind: 'email' | 'phone' | 'tc' | 'address') {
  const text = value === null || value === undefined ? '' : String(value);
  if (!text) return text;
  if (kind === 'email') {
    const [name, domain = 'example.com'] = text.split('@');
    return `${name.slice(0, 1)}***@${domain}`;
  }
  if (kind === 'phone') return text.replace(/\d(?=\d{2})/g, '*');
  if (kind === 'tc') return `${text.slice(0, 2)}*******${text.slice(-2)}`;
  return `${text.slice(0, Math.min(8, text.length))}… [maskeli]`;
}
