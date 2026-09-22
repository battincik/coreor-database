'use client';

import { updateActivity } from './updateActivity';
import { reportAppError } from './errorReporting';
import type { DatabaseApiAction, DatabaseConnectionPayload } from 'types';

export interface DesktopDatabaseRequest {
  action: DatabaseApiAction | string;
  connection?: DatabaseConnectionPayload;
  [key: string]: unknown;
}

export interface DesktopVaultPreferences {
  localVaultVersion: number;
  localProvider: 'os-secured-aes256gcm' | string;
  cloudEnvelopeVersion: number;
  cloudSyncEnabled: boolean;
  rememberCloudKeyOnDevice: boolean;
}

export interface DesktopConfig {
  version: number;
  queryTimeoutMs: number;
  maxResultRows: number;
  maxPageSize: number;
  vault: DesktopVaultPreferences;
  connections: unknown[];
}

export interface LocalVaultStatus {
  encrypted: boolean;
  localVaultVersion: number;
  algorithm: string;
  keyBackend: string;
  keyAvailable: boolean;
  connectionCount: number;
  vaultPath: string;
  workspaceEncrypted: boolean;
  workspaceCollectionCount: number;
  workspaceVaultPath: string;
}

export interface CloudVaultReadiness {
  envelopeVersion: number;
  payloadCipher: 'AES-256-GCM' | string;
  vaultKeyBytes: number;
  passwordKdf: 'Argon2id' | string;
  workspaceSchemaVersion: number;
  syncableCollections: SyncableWorkspaceCollection[];
  conflictModel: string;
  zeroKnowledge: boolean;
  masterPasswordStored: boolean;
}

export function isDesktopRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function assertDesktopRuntime() {
  if (!isDesktopRuntime()) {
    throw new Error('Bu işlem Coreor Database masaüstü istemcisinde çalıştırılmalıdır.');
  }
}

export async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  assertDesktopRuntime();
  const release = updateActivity.begin();
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(command, args);
  } catch (error) {
    // Database/server failures are expected operational errors, not app defects.
    if (command !== 'database_request' && !String(error).includes('UPDATE_')) reportAppError(error, 'native-command');
    throw error;
  } finally { release(); }
}

export function desktopDatabaseRequest<T>(request: DesktopDatabaseRequest): Promise<T> {
  return invokeDesktop<T>('database_request', { request });
}

export function readDesktopConfig(): Promise<DesktopConfig> {
  return invokeDesktop<DesktopConfig>('read_config');
}

export function writeDesktopConfig(config: DesktopConfig): Promise<void> {
  return invokeDesktop<void>('write_config', { config });
}

export function desktopConfigPath(): Promise<string> {
  return invokeDesktop<string>('config_path');
}

export function sqlLogPath(): Promise<string> {
  return invokeDesktop<string>('sql_log_path');
}

export function appendSqlLog(line: string): Promise<void> {
  return invokeDesktop<void>('append_sql_log', { line });
}

export function readLocalVaultStatus(): Promise<LocalVaultStatus> {
  return invokeDesktop<LocalVaultStatus>('vault_status');
}

export function readCloudVaultReadiness(): Promise<CloudVaultReadiness> {
  return invokeDesktop<CloudVaultReadiness>('cloud_vault_readiness');
}

export type SyncableWorkspaceCollection =
  | 'query-history' | 'query-favorites' | 'query-tabs' | 'sql-notebooks' | 'activity-log'
  | 'snippets' | 'schema-snapshots' | 'migration-drafts' | 'prepared-statements'
  | 'approval-requests' | 'notifications';

export interface WorkspaceSyncManifest {
  workspaceSchemaVersion: number;
  deviceId: string;
  conflictModel: string;
  collections: Array<{ namespace: string; schemaVersion: number; activeRecords: number; tombstones: number; maxRevision: number }>;
}

export function readWorkspaceCollection<T>(collection: SyncableWorkspaceCollection, scope: string): Promise<T[]> {
  return invokeDesktop<T[]>('workspace_read', { collection, scope });
}
export function writeWorkspaceCollection<T>(collection: SyncableWorkspaceCollection, scope: string, items: T[]): Promise<T[]> {
  return invokeDesktop<T[]>('workspace_write', { collection, scope, items });
}
export function importLegacyWorkspaceCollection<T>(collection: SyncableWorkspaceCollection, scope: string, items: T[]): Promise<T[]> {
  return invokeDesktop<T[]>('workspace_import_legacy', { collection, scope, items });
}
export function readWorkspaceSyncManifest(): Promise<WorkspaceSyncManifest> {
  return invokeDesktop<WorkspaceSyncManifest>('workspace_sync_manifest');
}

export interface WorkspaceSyncMergeResult {
  mergedRecords: number;
  conflicts: Array<{
    namespace: string;
    recordId: string;
    revision: number;
    localUpdatedAt: string;
    remoteUpdatedAt: string;
    localDeviceId: string;
    remoteDeviceId: string;
  }>;
  hasConflicts: boolean;
  deviceId: string;
  schemaVersion: number;
}

export function exportWorkspaceSyncPayload<T = unknown>(): Promise<T> {
  return invokeDesktop<T>('workspace_sync_export');
}

export function mergeWorkspaceSyncPayload<T extends object>(remote: T): Promise<WorkspaceSyncMergeResult> {
  return invokeDesktop<WorkspaceSyncMergeResult>('workspace_sync_merge', { remote });
}

export function setDeveloperToolsEnabled(enabled: boolean): Promise<void> {
  return invokeDesktop<void>('set_developer_tools_enabled', { enabled });
}

export function openDeveloperTools(): Promise<void> {
  return invokeDesktop<void>('open_developer_tools');
}
