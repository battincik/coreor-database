'use client';

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
}

export interface CloudVaultReadiness {
  envelopeVersion: number;
  payloadCipher: 'AES-256-GCM' | string;
  vaultKeyBytes: number;
  passwordKdf: 'Argon2id' | string;
  zeroKnowledge: boolean;
  masterPasswordStored: boolean;
}

function assertDesktopRuntime() {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    throw new Error('Bu işlem Coreor Database masaüstü istemcisinde çalıştırılmalıdır.');
  }
}

export async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  assertDesktopRuntime();
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
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

export function readLocalVaultStatus(): Promise<LocalVaultStatus> {
  return invokeDesktop<LocalVaultStatus>('vault_status');
}

export function readCloudVaultReadiness(): Promise<CloudVaultReadiness> {
  return invokeDesktop<CloudVaultReadiness>('cloud_vault_readiness');
}

export type SyncableWorkspaceCollection =
  | 'query-history' | 'query-favorites' | 'sql-notebooks' | 'activity-log'
  | 'snippets' | 'schema-snapshots' | 'migration-drafts' | 'prepared-statements'
  | 'approval-requests';

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
