'use client';

import {
  importLegacyWorkspaceCollection,
  readWorkspaceCollection as readNativeCollection,
  writeWorkspaceCollection as writeNativeCollection,
  type SyncableWorkspaceCollection
} from '@/lib/desktopClient';

import { updateActivity } from './updateActivity';

type LegacyStorageKind = 'local' | 'session';

const writeQueues = new Map<string, Promise<unknown>>();

function queueKey(collection: SyncableWorkspaceCollection, scope: string) {
  return `${collection}:${scope}`;
}

export function readWorkspaceCollection<T>(collection: SyncableWorkspaceCollection, scope = 'global') {
  return readNativeCollection<T>(collection, scope);
}

export function writeWorkspaceCollection<T>(collection: SyncableWorkspaceCollection, scope: string, items: T[]) {
  const release = updateActivity.begin();
  const key = queueKey(collection, scope);
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => writeNativeCollection<T>(collection, scope, items));

  writeQueues.set(key, next);
  const finish = () => {
    release();
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  };
  void next.then(finish, finish);
  return next;
}

export async function migrateLegacyWorkspaceCollection<T>(
  collection: SyncableWorkspaceCollection,
  scope: string,
  legacyKey: string,
  kind: LegacyStorageKind,
  normalize?: (items: unknown[]) => T[]
) {
  if (typeof window === 'undefined') return;
  const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
  const raw = storage.getItem(legacyKey);
  if (!raw) return;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return; }
  if (!Array.isArray(parsed)) return;
  const items = normalize ? normalize(parsed) : parsed as T[];
  await importLegacyWorkspaceCollection<T>(collection, scope, items);
  storage.removeItem(legacyKey);
}
