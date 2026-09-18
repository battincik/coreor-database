'use client';

import {
  migrateLegacyWorkspaceCollection,
  readWorkspaceCollection,
  writeWorkspaceCollection
} from '@/lib/nativeWorkspaceStore';

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

let snapshotsState: SchemaSnapshot[] = [];
let migrationsState: MigrationDraft[] = [];
let approvalsState: ApprovalRequest[] = [];
let preparedState: PreparedStatementSet[] = [];
let automationStoreReady = false;
let automationStoreInit: Promise<void> | null = null;

function emit(key: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('coreor:automation-store-changed', { detail: { key } }));
}

function readLocal<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLocal<T>(key: string, values: T[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(values));
  emit(key);
}

function persistNative<T>(
  collection: 'schema-snapshots' | 'migration-drafts' | 'approval-requests' | 'prepared-statements',
  key: string,
  values: T[]
) {
  void writeWorkspaceCollection(collection, 'global', values).catch(error => {
    console.error(`Native automation store yazılamadı (${collection}):`, error);
  });
  emit(key);
}

export async function initializeDatabaseAutomationStore() {
  if (automationStoreReady) return;
  if (automationStoreInit) return automationStoreInit;
  if (typeof window === 'undefined') return;

  automationStoreInit = (async () => {
    await Promise.all([
      migrateLegacyWorkspaceCollection<SchemaSnapshot>('schema-snapshots', 'global', KEYS.snapshots, 'local'),
      migrateLegacyWorkspaceCollection<MigrationDraft>('migration-drafts', 'global', KEYS.migrations, 'local'),
      migrateLegacyWorkspaceCollection<ApprovalRequest>('approval-requests', 'global', KEYS.approvals, 'local'),
      migrateLegacyWorkspaceCollection<PreparedStatementSet>('prepared-statements', 'global', KEYS.prepared, 'local')
    ]);

    const [snapshots, migrations, approvals, prepared] = await Promise.all([
      readWorkspaceCollection<SchemaSnapshot>('schema-snapshots', 'global'),
      readWorkspaceCollection<MigrationDraft>('migration-drafts', 'global'),
      readWorkspaceCollection<ApprovalRequest>('approval-requests', 'global'),
      readWorkspaceCollection<PreparedStatementSet>('prepared-statements', 'global')
    ]);

    snapshotsState = snapshots.slice(0, 500);
    migrationsState = migrations.slice(0, 300);
    approvalsState = approvals.slice(0, 300);
    preparedState = prepared.slice(0, 200);
    automationStoreReady = true;

    emit(KEYS.snapshots);
    emit(KEYS.migrations);
    emit(KEYS.approvals);
    emit(KEYS.prepared);
  })().finally(() => {
    automationStoreInit = null;
  });

  return automationStoreInit;
}

export function automationId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const schemaSnapshots = {
  list: () => snapshotsState,
  add: (snapshot: SchemaSnapshot) => {
    snapshotsState = [snapshot, ...snapshotsState.filter(item => item.id !== snapshot.id)].slice(0, 500);
    persistNative('schema-snapshots', KEYS.snapshots, snapshotsState);
  },
  remove: (id: string) => {
    snapshotsState = snapshotsState.filter(item => item.id !== id);
    persistNative('schema-snapshots', KEYS.snapshots, snapshotsState);
  },
  clear: () => {
    snapshotsState = [];
    persistNative<SchemaSnapshot>('schema-snapshots', KEYS.snapshots, snapshotsState);
  }
};

export const migrationDrafts = {
  list: () => migrationsState,
  save: (draft: MigrationDraft) => {
    migrationsState = [draft, ...migrationsState.filter(item => item.id !== draft.id)].slice(0, 300);
    persistNative('migration-drafts', KEYS.migrations, migrationsState);
  },
  remove: (id: string) => {
    migrationsState = migrationsState.filter(item => item.id !== id);
    persistNative('migration-drafts', KEYS.migrations, migrationsState);
  }
};

export const backupTasks = {
  list: () => readLocal<BackupTask>(KEYS.backups),
  save: (task: Omit<BackupTask, 'engine'> & { engine?: string }) => {
    const normalizedTask: BackupTask = { ...task, engine: task.engine || 'mysql' };
    writeLocal(KEYS.backups, [normalizedTask, ...readLocal<BackupTask>(KEYS.backups).filter(item => item.id !== normalizedTask.id)].slice(0, 200));
  },
  remove: (id: string) => writeLocal(KEYS.backups, readLocal<BackupTask>(KEYS.backups).filter(item => item.id !== id))
};

export const approvalRequests = {
  list: () => approvalsState,
  save: (request: ApprovalRequest) => {
    approvalsState = [request, ...approvalsState.filter(item => item.id !== request.id)].slice(0, 300);
    persistNative('approval-requests', KEYS.approvals, approvalsState);
  },
  remove: (id: string) => {
    approvalsState = approvalsState.filter(item => item.id !== id);
    persistNative('approval-requests', KEYS.approvals, approvalsState);
  }
};

export const preparedStatementSets = {
  list: () => preparedState,
  save: (item: PreparedStatementSet) => {
    preparedState = [item, ...preparedState.filter(entry => entry.id !== item.id)].slice(0, 200);
    persistNative('prepared-statements', KEYS.prepared, preparedState);
  },
  remove: (id: string) => {
    preparedState = preparedState.filter(item => item.id !== id);
    persistNative('prepared-statements', KEYS.prepared, preparedState);
  }
};

export function backupCommand(engine: string | undefined, host: string, port: number, username: string, databaseName: string | null, destination: string) {
  const normalizedEngine = engine || 'mysql';
  const target = databaseName || 'all-databases';
  if (normalizedEngine === 'postgresql' || normalizedEngine === 'cockroachdb') {
    return `pg_dump --host=${host} --port=${port} --username=${username} --format=custom --file="${destination}" ${databaseName || 'DATABASE_NAME'}`;
  }
  if (normalizedEngine === 'mssql') {
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
