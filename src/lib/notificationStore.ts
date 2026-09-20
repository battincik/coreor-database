'use client';

import { readWorkspaceCollection, writeWorkspaceCollection } from '@/lib/nativeWorkspaceStore';

export type CoreorNotificationSeverity = 'success' | 'neutral' | 'danger' | 'warning' | 'error' | 'primary' | 'secondary';
export type CoreorNotificationSource = 'sql' | 'performance' | 'connection' | 'storage' | 'system';

export interface CoreorNotification {
  id: string;
  severity: CoreorNotificationSeverity;
  source: CoreorNotificationSource;
  title: string;
  description?: string;
  createdAt: string;
  readAt: string | null;
  serverId?: string;
  serverName?: string;
  databaseName?: string;
  tableName?: string;
  code?: string;
  durationMs?: number;
  sql?: string;
  statementStartLine?: number;
  errorLine?: number;
  errorColumn?: number;
  statementIndex?: number;
  statementCount?: number;
  metadata: Array<{ label: string; value: string }>;
}

export type NewCoreorNotification = Omit<CoreorNotification, 'id' | 'createdAt' | 'readAt' | 'metadata'> & {
  id?: string;
  createdAt?: string;
  readAt?: string | null;
  metadata?: Array<{ label: string; value: string | number | null | undefined }>;
};

const MAX_NOTIFICATIONS = 500;
const EMPTY: CoreorNotification[] = [];
const listeners = new Set<() => void>();
let records: CoreorNotification[] = [];
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `notification-${crypto.randomUUID()}`;
  return `notification-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function positiveInteger(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined;
}

function normalize(input: CoreorNotification): CoreorNotification {
  return {
    ...input,
    severity: input.severity || 'neutral',
    source: input.source || 'system',
    title: String(input.title || 'Bildirim'),
    description: input.description ? String(input.description) : undefined,
    createdAt: input.createdAt || new Date().toISOString(),
    readAt: input.readAt || null,
    sql: input.sql ? String(input.sql).slice(0, 50_000) : undefined,
    statementStartLine: positiveInteger(input.statementStartLine),
    errorLine: positiveInteger(input.errorLine),
    errorColumn: positiveInteger(input.errorColumn),
    statementIndex: positiveInteger(input.statementIndex),
    statementCount: positiveInteger(input.statementCount),
    metadata: Array.isArray(input.metadata)
      ? input.metadata.slice(0, 12).map(item => ({ label: String(item.label), value: String(item.value ?? '—') }))
      : []
  };
}

function emit() {
  listeners.forEach(listener => listener());
}

function persist() {
  void writeWorkspaceCollection('notifications', 'global', records.slice(0, MAX_NOTIFICATIONS))
    .catch(error => console.error('Bildirim geçmişi native kasaya yazılamadı:', error));
}

export async function initializeNotificationStore() {
  if (hydrated) return;
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    const stored = await readWorkspaceCollection<CoreorNotification>('notifications', 'global');
    records = stored.map(normalize)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, MAX_NOTIFICATIONS);
    hydrated = true;
    emit();
  })().finally(() => {
    hydrationPromise = null;
  });
  return hydrationPromise;
}

export function publishCoreorNotification(input: NewCoreorNotification) {
  const record = normalize({
    ...input,
    id: input.id || createId(),
    createdAt: input.createdAt || new Date().toISOString(),
    readAt: input.readAt || null,
    metadata: (input.metadata || []).map(item => ({ label: item.label, value: String(item.value ?? '—') }))
  } as CoreorNotification);

  records = [record, ...records.filter(item => item.id !== record.id)].slice(0, MAX_NOTIFICATIONS);
  persist();
  emit();
  return record;
}

export function formatCoreorNotificationReport(notification: CoreorNotification) {
  const lines = [
    '# Coreor Database Diagnostic',
    '',
    `- Time: ${notification.createdAt}`,
    `- Severity: ${notification.severity}`,
    `- Source: ${notification.source}`,
    `- Code: ${notification.code || '—'}`,
    `- Server: ${notification.serverName || notification.serverId || '—'}`,
    `- Database: ${notification.databaseName || 'server scope'}`,
    `- Table: ${notification.tableName || '—'}`
  ];
  if (notification.durationMs !== undefined) lines.push(`- Duration: ${notification.durationMs} ms`);
  if (notification.statementIndex) lines.push(`- Statement: ${notification.statementIndex}${notification.statementCount ? `/${notification.statementCount}` : ''}`);
  if (notification.statementStartLine) lines.push(`- Statement start: line ${notification.statementStartLine}`);
  if (notification.errorLine) lines.push(`- Error location: line ${notification.errorLine}${notification.errorColumn ? `, column ${notification.errorColumn}` : ''}`);
  if (notification.description) lines.push('', '## Message', '', notification.description);
  if (notification.sql) {
    const safeSql = notification.sql.replaceAll('```', '``\u200b`');
    lines.push('', '## SQL', '', '```sql', safeSql, '```');
  }
  if (notification.metadata.length) {
    lines.push('', '## Metadata', '');
    for (const item of notification.metadata) lines.push(`- ${item.label}: ${item.value}`);
  }
  return lines.join('\n');
}

export function markNotificationRead(id: string) {
  const now = new Date().toISOString();
  let changed = false;
  records = records.map(item => {
    if (item.id !== id || item.readAt) return item;
    changed = true;
    return { ...item, readAt: now };
  });
  if (changed) {
    persist();
    emit();
  }
}

export function markAllNotificationsRead() {
  const now = new Date().toISOString();
  let changed = false;
  records = records.map(item => {
    if (item.readAt) return item;
    changed = true;
    return { ...item, readAt: now };
  });
  if (changed) {
    persist();
    emit();
  }
}

export function clearNotifications() {
  records = [];
  persist();
  emit();
}

export function subscribeNotifications(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNotificationsSnapshot() {
  return records;
}

export function getNotificationsServerSnapshot() {
  return EMPTY;
}
