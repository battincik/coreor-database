'use client';

import {
  importLegacyWorkspaceCollection,
  readWorkspaceCollection as readNativeCollection,
  writeWorkspaceCollection as writeNativeCollection,
  type SyncableWorkspaceCollection
} from '@/lib/desktopClient';

type LegacyStorageKind = 'local' | 'session';

export function readWorkspaceCollection<T>(collection: SyncableWorkspaceCollection, scope = 'global') {
  return readNativeCollection<T>(collection, scope);
}

export function writeWorkspaceCollection<T>(collection: SyncableWorkspaceCollection, scope: string, items: T[]) {
  return writeNativeCollection<T>(collection, scope, items);
}

export async function migrateLegacyWorkspaceCollection<T>(
  collection: SyncableWorkspaceCollection,
  scope: string,
  legacyKey: string,
  kind: LegacyStorageKind
) {
  if (typeof window === 'undefined') return;
  const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
  const raw = storage.getItem(legacyKey);
  if (!raw) return;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return; }
  if (!Array.isArray(parsed)) return;
  await importLegacyWorkspaceCollection<T>(collection, scope, parsed as T[]);
  storage.removeItem(legacyKey);
}
