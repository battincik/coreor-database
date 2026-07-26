'use client';

import type { DatabaseEngine, TableInfo, TableSchemaMutation } from 'types';

export type SafetyRecordStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface SchemaSnapshotRecord {
  id: string;
  serverId: string;
  serverName: string;
  engine: DatabaseEngine;
  database: string;
  table: string;
  reason: string;
  createdAt: string;
  tableInfo: TableInfo;
}

export interface MigrationRecord {
  id: string;
  serverId: string;
  serverName: string;
  engine: DatabaseEngine;
  database: string;
  table: string;
  name: string;
  description: string;
  upSql: string;
  downSql: string;
  mutation?: TableSchemaMutation;
  snapshotId?: string;
  createdAt: string;
  appliedAt?: string;
  status: 'generated' | 'applied' | 'failed';
}

export interface ApprovalRecord {
  id: string;
  serverId: string;
  serverName: string;
  database: string | null;
  table?: string;
  action: 'drop' | 'truncate' | 'production-alter';
  sql: string;
  requestedBy: string;
  requestedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
  status: SafetyRecordStatus;
}

export interface BackupJobRecord {
  id: string;
  name: string;
  serverId: string;
  serverName: string;
  engine: DatabaseEngine;
  database: string | null;
  format: 'sql' | 'custom' | 'bacpac';
  destination: string;
  schedule: 'manual' | 'hourly' | 'daily' | 'weekly';
  includeRoutines: boolean;
  includeTriggers: boolean;
  compress: boolean;
  createdAt: string;
  lastRunAt?: string;
  lastStatus?: 'planned' | 'success' | 'failed';
  commandPreview: string;
}

export interface PreparedStatementSet {
  id: string;
  name: string;
  serverId: string;
  database: string | null;
  sql: string;
  parameters: Array<{ name: string; value: string; type: 'string' | 'number' | 'boolean' | 'null' | 'date' }>;
  createdAt: string;
  updatedAt: string;
}

export interface ShortcutBinding {
  id: string;
  label: string;
  description: string;
  defaultKeys: string;
  keys: string;
}

export interface DatabaseSafetyWorkspaceState {
  snapshots: SchemaSnapshotRecord[];
  migrations: MigrationRecord[];
  approvals: ApprovalRecord[];
  backupJobs: BackupJobRecord[];
  preparedSets: PreparedStatementSet[];
  shortcuts: ShortcutBinding[];
}

const STORAGE_KEY = 'coreor:database-safety-workspace:v1';
const listeners = new Set<() => void>();
const MAX_SNAPSHOTS = 300;
const MAX_MIGRATIONS = 300;

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  { id: 'command-palette', label: 'Komut paleti', description: 'Global komut ve hızlı SQL paletini açar.', defaultKeys: 'Mod+K', keys: 'Mod+K' },
  { id: 'run-query', label: 'Sorguyu çalıştır', description: 'Aktif SQL editöründeki sorguyu çalıştırır.', defaultKeys: 'Mod+Enter', keys: 'Mod+Enter' },
  { id: 'format-query', label: 'SQL biçimlendir', description: 'Aktif sorguyu biçimlendirir.', defaultKeys: 'Shift+Alt+F', keys: 'Shift+Alt+F' },
  { id: 'new-query', label: 'Yeni sorgu sekmesi', description: 'Aktif sunucuda yeni sorgu açar.', defaultKeys: 'Mod+N', keys: 'Mod+N' },
  { id: 'toggle-console', label: 'SQL günlüğü', description: 'Alt SQL günlüğünü açar veya kapatır.', defaultKeys: 'Mod+J', keys: 'Mod+J' },
  { id: 'backup-center', label: 'Yedekleme merkezi', description: 'Yedekleme görevlerini açar.', defaultKeys: 'Mod+Shift+B', keys: 'Mod+Shift+B' }
];

const EMPTY_STATE: DatabaseSafetyWorkspaceState = {
  snapshots: [],
  migrations: [],
  approvals: [],
  backupJobs: [],
  preparedSets: [],
  shortcuts: DEFAULT_SHORTCUTS
};

let state: DatabaseSafetyWorkspaceState = EMPTY_STATE;
let hydrated = false;

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as Partial<DatabaseSafetyWorkspaceState>;
    state = {
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots.slice(0, MAX_SNAPSHOTS) : [],
      migrations: Array.isArray(parsed.migrations) ? parsed.migrations.slice(0, MAX_MIGRATIONS) : [],
      approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [],
      backupJobs: Array.isArray(parsed.backupJobs) ? parsed.backupJobs : [],
      preparedSets: Array.isArray(parsed.preparedSets) ? parsed.preparedSets : [],
      shortcuts: Array.isArray(parsed.shortcuts) && parsed.shortcuts.length ? parsed.shortcuts : DEFAULT_SHORTCUTS
    };
  } catch {
    state = EMPTY_STATE;
  }
}

function persist() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* local safety history must not stop editor */ }
}

function emit() { listeners.forEach(listener => listener()); }
function update(next: DatabaseSafetyWorkspaceState) { state = next; persist(); emit(); return state; }

export function getDatabaseSafetyWorkspace() { hydrate(); return state; }
export function getServerDatabaseSafetyWorkspace() { return EMPTY_STATE; }
export function subscribeDatabaseSafetyWorkspace(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }

export function addSchemaSnapshot(input: Omit<SchemaSnapshotRecord, 'id' | 'createdAt'>) {
  hydrate();
  const record: SchemaSnapshotRecord = { ...input, id: createId('snapshot'), createdAt: new Date().toISOString() };
  update({ ...state, snapshots: [record, ...state.snapshots].slice(0, MAX_SNAPSHOTS) });
  return record;
}

export function addMigration(input: Omit<MigrationRecord, 'id' | 'createdAt'>) {
  hydrate();
  const record: MigrationRecord = { ...input, id: createId('migration'), createdAt: new Date().toISOString() };
  update({ ...state, migrations: [record, ...state.migrations].slice(0, MAX_MIGRATIONS) });
  return record;
}

export function updateMigration(id: string, patch: Partial<MigrationRecord>) {
  hydrate();
  return update({ ...state, migrations: state.migrations.map(item => item.id === id ? { ...item, ...patch } : item) });
}

export function addApproval(input: Omit<ApprovalRecord, 'id' | 'requestedAt' | 'status'>) {
  hydrate();
  const record: ApprovalRecord = { ...input, id: createId('approval'), requestedAt: new Date().toISOString(), status: 'pending' };
  update({ ...state, approvals: [record, ...state.approvals] });
  return record;
}

export function reviewApproval(id: string, status: 'approved' | 'rejected', reviewedBy: string, note?: string) {
  hydrate();
  return update({ ...state, approvals: state.approvals.map(item => item.id === id ? { ...item, status, reviewedBy, note, reviewedAt: new Date().toISOString() } : item) });
}

export function markApprovalExecuted(id: string, status: 'executed' | 'failed') {
  hydrate();
  return update({ ...state, approvals: state.approvals.map(item => item.id === id ? { ...item, status } : item) });
}

export function saveBackupJob(input: Omit<BackupJobRecord, 'id' | 'createdAt'> & { id?: string }) {
  hydrate();
  const record: BackupJobRecord = { ...input, id: input.id || createId('backup'), createdAt: state.backupJobs.find(item => item.id === input.id)?.createdAt || new Date().toISOString() };
  const exists = state.backupJobs.some(item => item.id === record.id);
  update({ ...state, backupJobs: exists ? state.backupJobs.map(item => item.id === record.id ? record : item) : [record, ...state.backupJobs] });
  return record;
}

export function deleteBackupJob(id: string) { hydrate(); return update({ ...state, backupJobs: state.backupJobs.filter(item => item.id !== id) }); }

export function savePreparedSet(input: Omit<PreparedStatementSet, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
  hydrate();
  const now = new Date().toISOString();
  const existing = state.preparedSets.find(item => item.id === input.id);
  const record: PreparedStatementSet = { ...input, id: input.id || createId('prepared'), createdAt: existing?.createdAt || now, updatedAt: now };
  update({ ...state, preparedSets: existing ? state.preparedSets.map(item => item.id === record.id ? record : item) : [record, ...state.preparedSets] });
  return record;
}

export function deletePreparedSet(id: string) { hydrate(); return update({ ...state, preparedSets: state.preparedSets.filter(item => item.id !== id) }); }

export function saveShortcut(id: string, keys: string) {
  hydrate();
  return update({ ...state, shortcuts: state.shortcuts.map(item => item.id === id ? { ...item, keys } : item) });
}

export function resetShortcuts() { hydrate(); return update({ ...state, shortcuts: DEFAULT_SHORTCUTS }); }

export function clearSchemaHistory(serverId?: string, database?: string, table?: string) {
  hydrate();
  const matches = (item: { serverId: string; database: string; table: string }) => (!serverId || item.serverId === serverId) && (!database || item.database === database) && (!table || item.table === table);
  return update({ ...state, snapshots: state.snapshots.filter(item => !matches(item)), migrations: state.migrations.filter(item => !matches(item)) });
}

export function exportSafetyWorkspace() { hydrate(); return JSON.stringify(state, null, 2); }
