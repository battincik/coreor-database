'use client';

import type { QueryExecutionTimings } from 'types';
import { migrateLegacyWorkspaceCollection, readWorkspaceCollection, writeWorkspaceCollection } from '@/lib/nativeWorkspaceStore';
import { getAppPreferences, subscribeAppPreferences } from '@/lib/appPreferences';
import { appendSqlLog, isDesktopRuntime } from '@/lib/desktopClient';

export type ActivityLevel = 'info' | 'success' | 'warning' | 'error' | 'sql';
export type ActivityKind = 'error' | 'user-query' | 'internal-query' | 'info';
export type ActivityCategory = 'system' | 'vault' | 'connection' | 'catalog' | 'schema' | 'data' | 'query' | 'navigation';

export interface ActivityEntry {
  id: string;
  timestamp: string;
  level: ActivityLevel;
  kind: ActivityKind;
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
  timings?: QueryExecutionTimings;
  rowCount?: number;
  affectedRows?: number;
  errorCode?: string;
  statementStartLine?: number;
  errorLine?: number;
  errorColumn?: number;
  statementIndex?: number;
  statementCount?: number;
}

export type NewActivityEntry = Omit<ActivityEntry, 'id' | 'timestamp' | 'sql'> & {
  id?: string;
  timestamp?: string;
  sql?: string;
};

const STORAGE_KEY = 'coreor:sql-console:v2';
const EMPTY_ACTIVITIES: ActivityEntry[] = [];
const listeners = new Set<() => void>();
const SENSITIVE_KEY_PATTERN = /^(?:password|passwd|pwd|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|credential|private[_-]?key)$/i;
const SENSITIVE_SQL_PATTERN = /\b(?:password|passwd|pwd|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|identified\s+by|private[_-]?key)\b/i;
let entries: ActivityEntry[] = [];
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
let clearGeneration = 0;

function activityLimit() {
  return getAppPreferences().activityLogLimit;
}

function inferActivityKind(entry: Partial<ActivityEntry>): ActivityKind {
  if (entry.kind) return entry.kind;
  if (entry.level === 'error') return 'error';
  if (entry.level === 'warning' || entry.level === 'info' || !entry.sql?.trim()) return 'info';
  return entry.category === 'query' ? 'user-query' : 'internal-query';
}

function shouldRecord(kind: ActivityKind) {
  const preferences = getAppPreferences();
  if (kind === 'error') return preferences.activityLogErrors;
  if (kind === 'user-query') return preferences.activityLogUserQueries;
  if (kind === 'internal-query') return preferences.activityLogInternalQueries;
  return preferences.activityLogInfo;
}

function writeToDisk(entry: ActivityEntry) {
  const preferences = getAppPreferences();
  if (!preferences.activityLogPersistToDisk || !isDesktopRuntime()) return;
  const safeEntry = {
    ...entry,
    host: entry.host ? '[gizlendi]' : undefined
  };
  void appendSqlLog(JSON.stringify(safeEntry)).catch(() => undefined);
}

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

  const generationAtStart = clearGeneration;
  const legacyRaw = window.sessionStorage.getItem(STORAGE_KEY);
  if (legacyRaw) {
    try {
      const parsed = JSON.parse(legacyRaw);
      if (Array.isArray(parsed)) {
        entries = parsed
          .filter(entry => typeof entry?.id === 'string')
          .map(entry => ({ ...entry, sql: typeof entry.sql === 'string' ? entry.sql : '', kind: inferActivityKind(entry) }))
          .slice(-activityLimit()) as ActivityEntry[];
      }
    } catch {
      // Bozuk legacy session kaydı native migration'ı engellemez.
    }
  }

  hydrationPromise = (async () => {
    await migrateLegacyWorkspaceCollection<ActivityEntry>('activity-log', 'global', STORAGE_KEY, 'session');
    const stored = await readWorkspaceCollection<ActivityEntry>('activity-log', 'global');
    if (generationAtStart !== clearGeneration) return;

    const merged = new Map<string, ActivityEntry>();
    for (const entry of [...stored, ...entries]) {
      if (entry && typeof entry.id === 'string') {
        merged.set(entry.id, {
          ...entry,
          sql: typeof entry.sql === 'string' ? entry.sql : '',
          kind: inferActivityKind(entry)
        });
      }
    }
    entries = [...merged.values()]
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .slice(-activityLimit());
    notify();
  })().catch(() => {
    // Native günlük yüklenemezse oturum içi kayıtlar RAM'de çalışmaya devam eder.
  }).finally(() => {
    hydrationPromise = null;
  });
}

function persist() {
  if (typeof window === 'undefined') return;
  void (hydrationPromise ?? Promise.resolve())
    .then(() => writeWorkspaceCollection('activity-log', 'global', entries.slice(-activityLimit())))
    .catch(() => undefined);
}

function notify() {
  listeners.forEach(listener => listener());
}

export function recordActivity(entry: NewActivityEntry) {
  hydrate();
  const rawSql = entry.sql?.trim() || '';
  const kind = inferActivityKind(entry);
  if (!shouldRecord(kind)) return null;

  const sqlContainsSensitiveMaterial = rawSql ? SENSITIVE_SQL_PATTERN.test(rawSql) : false;
  const nextEntry: ActivityEntry = {
    ...entry,
    kind,
    id: entry.id || createId(),
    timestamp: entry.timestamp || new Date().toISOString(),
    title: normalizeText(entry.title, 180) || 'SQL sorgusu',
    message: normalizeText(entry.message, 1_200),
    sql: rawSql ? redactSql(rawSql).slice(0, 50_000) : '',
    parameters: entry.parameters?.map(parameter => sqlContainsSensitiveMaterial ? '[gizlendi]' : sanitizeParameter(parameter))
  };

  entries = [...entries, nextEntry].slice(-activityLimit());
  persist();
  writeToDisk(nextEntry);
  notify();
  return nextEntry.id;
}

export function clearActivities() {
  hydrate();
  clearGeneration += 1;
  entries = [];
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(STORAGE_KEY);
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
      application: 'Coreor Database',
      type: 'sql-query-log',
      entries: safeEntries
    },
    null,
    2
  );
}


subscribeAppPreferences(() => {
  if (!hydrated) return;
  const limit = activityLimit();
  if (entries.length > limit) {
    entries = entries.slice(-limit);
    persist();
    notify();
  }
});
