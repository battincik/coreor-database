'use client';

import type { DatabaseApiAction, DatabaseConnectionPayload } from 'types';

export interface DesktopDatabaseRequest {
  action: DatabaseApiAction | string;
  connection?: DatabaseConnectionPayload;
  [key: string]: unknown;
}

export interface DesktopConfig {
  version: number;
  queryTimeoutMs: number;
  maxResultRows: number;
  maxPageSize: number;
  connections: unknown[];
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
