import type { SyncableWorkspaceCollection } from '@/lib/desktopClient';

export const WORKSPACE_SYNC_SCHEMA_VERSION = 1 as const;

export interface WorkspaceSyncRecord<T = unknown> {
  id: string;
  revision: number;
  order: number;
  updatedAt: string;
  deletedAt: string | null;
  updatedByDevice: string;
  payload: T | null;
}
export interface WorkspaceSyncCollection<T = unknown> {
  namespace: string;
  collection: SyncableWorkspaceCollection;
  schemaVersion: typeof WORKSPACE_SYNC_SCHEMA_VERSION;
  records: WorkspaceSyncRecord<T>[];
}
export interface WorkspaceSyncPayload {
  schemaVersion: typeof WORKSPACE_SYNC_SCHEMA_VERSION;
  deviceId: string;
  collections: WorkspaceSyncCollection[];
}
export interface EncryptedWorkspaceSyncEnvelope {
  version: 1;
  accountVaultId: string;
  ciphertext: string;
  nonce: string;
  updatedAt: string;
}
