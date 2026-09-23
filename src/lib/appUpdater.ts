'use client';
import { invoke } from '@tauri-apps/api/core';
import { useSyncExternalStore } from 'react';
import { updateActivity } from './updateActivity';
export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'error' | 'disabled';
interface UpdateSnapshot { phase: UpdatePhase; version: string | null; progress: number | null; error: string | null; development: boolean }
const initial: UpdateSnapshot = { phase: 'idle', version: null, progress: null, error: null, development: false };
let snapshot = initial;
const listeners = new Set<() => void>();
function set(patch: Partial<UpdateSnapshot>) { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); }
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function useAppUpdater() { return useSyncExternalStore(subscribe, () => snapshot, () => initial); }
export function setUpdateProgress(downloaded: number, total: number | null) {
  set({ progress: total && total > 0 ? Math.min(100, Math.round(downloaded / total * 100)) : null });
}
export function setUpdateInstalling() { set({ phase: 'installing', progress: null }); }
export async function checkForUpdates() {
  if (['checking', 'downloading', 'installing'].includes(snapshot.phase)) return;
  set({ phase: 'checking', error: null });
  try {
    const result = await invoke<{ enabled: boolean; development: boolean; version: string | null }>('check_app_update');
    set({ phase: !result.enabled ? 'disabled' : result.version ? 'available' : 'idle', version: result.version, development: result.development });
  } catch (error) {
    const reason = String(error);
    const invalidManifest = reason.includes('UPDATE_MANIFEST_');
    set({ phase: invalidManifest ? 'error' : snapshot.version ? 'available' : 'error',
      version: invalidManifest ? null : snapshot.version,
      error: invalidManifest ? 'manifest' : 'check' });
  }
}
export async function installUpdate() {
  if (!snapshot.version || !['available', 'error'].includes(snapshot.phase)) return;
  let release: (() => void) | undefined;
  try {
    release = updateActivity.lock();
    set({ phase: 'downloading', progress: null, error: null });
    await invoke('install_app_update');
  } catch (error) {
    const reason = String(error);
    set({ phase: 'available', error: reason.includes('UPDATE_OPEN_TRANSACTION') ? 'transaction'
      : reason.includes('UPDATE_ACTIVE_WORK') ? 'busy'
      : reason.includes('UPDATE_MANIFEST_') ? 'manifest'
      : reason.includes('UPDATE_DOWNLOAD_FAILED') ? 'download'
      : 'install', progress: null });
  } finally { release?.(); }
}
