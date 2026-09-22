'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { invokeDesktop } from '@/lib/desktopClient';

export type DesktopPlatform = 'windows' | 'macos' | 'linux' | 'unknown';

export interface NativePlatformInfo {
  os: DesktopPlatform | string;
  arch: string;
  family: string;
  appVersion: string;
  configDir: string;
  dataDir: string;
  cacheDir: string;
  logDir: string;
}

const listeners = new Set<() => void>();
let snapshot: NativePlatformInfo | null = null;
let loading: Promise<NativePlatformInfo | null> | null = null;

function emit() {
  listeners.forEach(listener => listener());
}

function normalizeOs(value: string): DesktopPlatform {
  if (value === 'windows') return 'windows';
  if (value === 'macos') return 'macos';
  if (value === 'linux') return 'linux';
  return 'unknown';
}

function webviewFallback(): NativePlatformInfo {
  if (typeof navigator === 'undefined') {
    return { os: 'unknown', arch: 'unknown', family: 'unknown', appVersion: '—', configDir: '', dataDir: '', cacheDir: '', logDir: '' };
  }
  const source = `${navigator.userAgent || ''} ${navigator.platform || ''}`.toLowerCase();
  const os: DesktopPlatform = source.includes('mac') ? 'macos' : source.includes('win') ? 'windows' : source.includes('linux') ? 'linux' : 'unknown';
  return { os, arch: 'unknown', family: os === 'windows' ? 'windows' : os === 'unknown' ? 'unknown' : 'unix', appVersion: '—', configDir: '', dataDir: '', cacheDir: '', logDir: '' };
}

export function getNativePlatformSnapshot() {
  if (!snapshot) snapshot = webviewFallback();
  return snapshot;
}

export function subscribeNativePlatform(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadNativePlatformInfo() {
  if (snapshot?.appVersion && snapshot.appVersion !== '—') return snapshot;
  if (loading) return loading;
  loading = invokeDesktop<NativePlatformInfo>('platform_info')
    .then(value => {
      snapshot = { ...value, os: normalizeOs(value.os) };
      if (typeof document !== 'undefined') document.documentElement.dataset.coreorPlatform = String(snapshot.os);
      emit();
      return snapshot;
    })
    .catch(() => {
      snapshot = webviewFallback();
      if (typeof document !== 'undefined') document.documentElement.dataset.coreorPlatform = String(snapshot.os);
      emit();
      return snapshot;
    })
    .finally(() => { loading = null; });
  return loading;
}

export function useNativePlatform() {
  const info = useSyncExternalStore(subscribeNativePlatform, getNativePlatformSnapshot, getNativePlatformSnapshot);
  useEffect(() => { void loadNativePlatformInfo(); }, []);
  return info;
}

export function platformDisplayName(platform: DesktopPlatform | string) {
  if (platform === 'windows') return 'Windows';
  if (platform === 'macos') return 'macOS';
  if (platform === 'linux') return 'Linux';
  return String(platform || 'Bilinmiyor');
}
