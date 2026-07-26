'use client';

export const OPEN_DATABASE_SAFETY_CENTER_EVENT = 'coreor:open-database-safety-center';
export type DatabaseSafetyCenterTab = 'history' | 'backups' | 'approvals' | 'indexes' | 'prepared' | 'compare' | 'masking' | 'shortcuts';

export interface OpenDatabaseSafetyCenterDetail {
  tab?: DatabaseSafetyCenterTab;
  serverId?: string | null;
  database?: string | null;
  table?: string | null;
  sql?: string;
}

export function openDatabaseSafetyCenter(detail: OpenDatabaseSafetyCenterDetail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OpenDatabaseSafetyCenterDetail>(OPEN_DATABASE_SAFETY_CENTER_EVENT, { detail }));
}
