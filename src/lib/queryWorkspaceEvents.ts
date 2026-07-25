'use client';

export const OPEN_QUERY_TAB_EVENT = 'coreor:open-query-tab';

export interface OpenQueryTabDetail {
  serverId?: string | null;
  databaseName?: string | null;
  title?: string;
  sql?: string;
  runImmediately?: boolean;
}

export function openQueryTab(detail: OpenQueryTabDetail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OpenQueryTabDetail>(OPEN_QUERY_TAB_EVENT, { detail }));
}

export function quoteSqlIdentifier(identifier: string) {
  return `\`${identifier.replace(/`/g, '``')}\``;
}

export function qualifiedSqlName(databaseName: string, tableName: string) {
  return `${quoteSqlIdentifier(databaseName)}.${quoteSqlIdentifier(tableName)}`;
}

export function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}
