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
  schemaVersion: typeof WORKSPACE_SYNC_SCHEMA_VERSION;
  records: WorkspaceSyncRecord<T>[];
}

export interface WorkspaceSyncPayload {
  schemaVersion: typeof WORKSPACE_SYNC_SCHEMA_VERSION;
  deviceId: string;
  exportedAt: string;
  collections: WorkspaceSyncCollection[];
}

export interface WorkspaceSyncConflict {
  namespace: string;
  recordId: string;
  revision: number;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  localDeviceId: string;
  remoteDeviceId: string;
}

export interface CoreorWorkspaceSyncCursor {
  accountId: string;
  cursor: string | null;
  etag: string | null;
  lastSyncedAt: string | null;
}

export interface EncryptedWorkspaceSyncEnvelope {
  version: 1;
  workspaceSchemaVersion: typeof WORKSPACE_SYNC_SCHEMA_VERSION;
  deviceId: string;
  accountVaultId: string;
  baseCursor: string | null;
  baseEtag: string | null;
  ciphertext: string;
  nonce: string;
  updatedAt: string;
}

/**
 * Coreor API entegrasyonu için transport kuralı:
 * 1. Native vault workspace_sync_export ile plaintext payload üretir.
 * 2. Payload istemcide Account Vault Key ile AES-256-GCM şifrelenir.
 * 3. API yalnız EncryptedWorkspaceSyncEnvelope ciphertext/metadata saklar.
 * 4. Push, baseCursor/baseEtag ile optimistic concurrency kullanır.
 * 5. 409/etag conflict durumunda remote payload çekilir, istemcide çözülür ve
 *    workspace_sync_merge çağrılır. Eşit revision + farklı cihaz değişikliği
 *    sessizce ezilmez; kullanıcıya çözülebilir conflict olarak döner.
 */
export interface WorkspaceSyncTransport {
  pull(cursor: CoreorWorkspaceSyncCursor): Promise<EncryptedWorkspaceSyncEnvelope | null>;
  push(envelope: EncryptedWorkspaceSyncEnvelope): Promise<CoreorWorkspaceSyncCursor>;
}

export function workspaceCollectionFromNamespace(namespace: string): SyncableWorkspaceCollection | null {
  const collection = namespace.split(':', 1)[0] as SyncableWorkspaceCollection;
  const supported: SyncableWorkspaceCollection[] = [
    'query-history',
    'query-favorites',
    'query-tabs',
    'sql-notebooks',
    'activity-log',
    'snippets',
    'schema-snapshots',
    'migration-drafts',
    'prepared-statements',
    'approval-requests',
    'notifications'
  ];
  return supported.includes(collection) ? collection : null;
}
