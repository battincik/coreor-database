'use client';

import { migrateLegacyWorkspaceCollection, readWorkspaceCollection, writeWorkspaceCollection } from '@/lib/nativeWorkspaceStore';

export type ActivityLevel = 'info' | 'success' | 'warning' | 'error' | 'sql';
export type ActivityCategory = 'system' | 'vault' | 'connection' | 'catalog' | 'schema' | 'data' | 'query' | 'navigation';

export interface ActivityEntry {
  id: string;
  timestamp: string;
  level: ActivityLevel;
  category?: ActivityCategory;
  title: string;
  message?: string;
  serverId?: string;
  serverName?: string;
  host?: string;
  databaseName?: string;
  tableName?: string;
  sql: string;
  parameters?: unknown[];
  durationMs?: number;
  rowCount?: number;
  affectedRows?: number;
  errorCode?: string;
}

export type NewActivityEntry = Omit<ActivityEntry, 'id' | 'timestamp' | 'sql'> & {
  id?: string;
  timestamp?: string;
  sql?: string;
};

const STORAGE_KEY = 'coreor:sql-console:v2';
const MAX_ENTRIES = 500;
const EMPTY_ACTIVITIES: ActivityEntry[] = [];
const listeners = new Set<() => void>();
const SENSITIVE_KEY_PATTERN = /^(?:password|passwd|pwd|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|credential|private[_-]?key)$/i;
const SENSITIVE_SQL_PATTERN = /\b(?:password|passwd|pwd|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|identified\s+by|private[_-]?key)\b/i;
let entries: ActivityEntry[] = [];
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `query-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value: string | undefined, maximumLength: number) {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maximumLength ? `${normalized.slice(0, maximumLength)}…` : normalized;
}

function redactSql(sql: string) {
  return sql
    .replace(/(\bIDENTIFIED\s+BY\s+)(?:'(?:''|[^'])*'|"(?:""|[^"])*")/gi, "$1'[gizlendi]'")
    .replace(/(\b(?:PASSWORD|PASSWD|PWD|SECRET|TOKEN|ACCESS_TOKEN|REFRESH_TOKEN|API_KEY|APIKEY|AUTHORIZATION|PRIVATE_KEY)\b\s*(?:=|:)\s*)(?:'(?:''|[^'])*'|"(?:""|[^"])*"|[^\s,;)]+)/gi, "$1'[gizlendi]'")
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+\-/]+=*/gi, '$1[gizlendi]');
}

function sanitizeParameter(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) return '[gizlendi]';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(item => sanitizeParameter(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([nestedKey, nested]) => [nestedKey, sanitizeParameter(nested, nestedKey)])
    );
  }
  return value;
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;

  hydrationPromise = (async () => {
    await migrateLegacyWorkspaceCollection<ActivityEntry>('activity-log', 'global', STORAGE_KEY, 'session');
    const stored = await readWorkspaceCollection<ActivityEntry>('activity-log', 'global');
    const merged = new Map<string, ActivityEntry>();
    for (const entry of [...stored, ...entries]) {
      if (entry && typeof entry.id === 'string' && typeof entry.sql === 'string' && entry.sql.trim()) {
        merged.set(entry.id, entry);
      }
    }
    entries = [...merged.values()]
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .slice(-MAX_ENTRIES);
    notify();
  })().catch(() => {
    // Native günlük yüklenemezse oturum içi kayıtlar RAM'de çalışmaya devam eder.
  }).finally(() => {
    hydrationPromise = null;
  });
}

function persist() {
  if (typeof window === 'undefined') return;
  const snapshot = entries.slice(-MAX_ENTRIES);
  void (hydrationPromise ?? Promise.resolve())
    .then(() => writeWorkspaceCollection('activity-log', 'global', snapshot))
    .catch(() => undefined);
}

function notify() {
  listeners.forEach(listener => listener());
}

export function recordActivity(entry: NewActivityEntry) {
  hydrate();
  const rawSql = entry.sql?.trim();
  if (!rawSql) return null;

  const sqlContainsSensitiveMaterial = SENSITIVE_SQL_PATTERN.test(rawSql);
  const nextEntry: ActivityEntry = {
    ...entry,
    id: entry.id || createId(),
    timestamp: entry.timestamp || new Date().toISOString(),
    title: normalizeText(entry.title, 180) || 'SQL sorgusu',
    message: normalizeText(entry.message, 1_200),
    sql: redactSql(rawSql).slice(0, 50_000),
    parameters: entry.parameters?.map(parameter => sqlContainsSensitiveMaterial ? '[gizlendi]' : sanitizeParameter(parameter))
  };

  entries = [...entries, nextEntry].slice(-MAX_ENTRIES);
  persist();
  notify();
  return nextEntry.id;
}

export function clearActivities() {
  hydrate();
  entries = [];
  persist();
  notify();
}

export function subscribeActivities(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActivitiesSnapshot() {
  hydrate();
  return entries;
}

export function getActivitiesServerSnapshot() {
  return EMPTY_ACTIVITIES;
}

export function exportActivities() {
  hydrate();
  const safeEntries = entries.map(({ host, ...entry }) => ({
    ...entry,
    host: host ? '[gizlendi]' : undefined
  }));

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      application: 'Coreor Web Database',
      type: 'sql-query-log',
      entries: safeEntries
    },
    null,
    2
  );
}
