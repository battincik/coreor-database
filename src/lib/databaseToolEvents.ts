'use client';

export const TOGGLE_COMMAND_PALETTE_EVENT = 'coreor:toggle-command-palette';
export const OPEN_USER_MANAGER_EVENT = 'coreor:open-user-manager';
export const OPEN_PROCESS_CENTER_EVENT = 'coreor:open-process-center';
export const OPEN_PERFORMANCE_PANEL_EVENT = 'coreor:open-performance-panel';
export const OPEN_IMPORT_EXPORT_EVENT = 'coreor:open-import-export';
export const OPEN_SQL_NOTEBOOK_EVENT = 'coreor:open-sql-notebook';
export const OPEN_SETTINGS_MODAL_EVENT = 'coreor:open-settings-modal';
export const OPEN_TRANSACTION_WORKSPACE_EVENT = 'coreor:open-transaction-workspace';
export const OPEN_MAINTENANCE_CENTER_EVENT = 'coreor:open-maintenance-center';

export interface OpenMaintenanceCenterDetail {
  serverId?: string | null;
  databaseName?: string | null;
  tableName?: string | null;
}

export interface OpenSettingsModalDetail {
  tab?: 'account' | 'servers' | 'appearance' | 'accessibility' | 'query' | 'security' | 'advanced' | 'whats-new';
}

export function dispatchDatabaseTool(eventName: string, detail?: unknown) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(detail === undefined ? new Event(eventName) : new CustomEvent(eventName, { detail }));
}
