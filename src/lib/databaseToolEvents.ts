'use client';

export const TOGGLE_COMMAND_PALETTE_EVENT = 'coreor:toggle-command-palette';
export const OPEN_USER_MANAGER_EVENT = 'coreor:open-user-manager';
export const OPEN_PROCESS_CENTER_EVENT = 'coreor:open-process-center';
export const OPEN_PERFORMANCE_PANEL_EVENT = 'coreor:open-performance-panel';
export const OPEN_IMPORT_EXPORT_EVENT = 'coreor:open-import-export';
export const OPEN_SQL_NOTEBOOK_EVENT = 'coreor:open-sql-notebook';

export function dispatchDatabaseTool(eventName: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(eventName));
}
