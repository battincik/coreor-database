'use client';

export type ActivityLevel = 'info' | 'success' | 'warning' | 'error' | 'sql';
export type ActivityCategory = 'system' | 'vault' | 'connection' | 'catalog' | 'schema' | 'data' | 'query' | 'navigation';

export interface ActivityEntry {
  id: string;
  timestamp: string;
  level: ActivityLevel;
  category: ActivityCategory;
  title: string;
  message?: string;
  serverId?: string;
  serverName?: string;
  host?: string;
  databaseName?: string;
  tableName?: string;
  sql?: string;
  durationMs?: number;
  rowCount?: number;
  affectedRows?: number;
  errorCode?: string;
}

export type NewActivityEntry = Omit<ActivityEntry, 'id' | 'timestamp'> & {
  id?: string;
  timestamp?: string;
};

const STORAGE_KEY = 'coreor:database-activity-console:v1';
const MAX_ENTRIES = 300;
const listeners = new Set<() => void>();
let entries: ActivityEntry[] = [];
let hydrated = false;

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value: string | undefined, maximumLength: number) {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maximumLength ? `${normalized.slice(0, maximumLength)}…` : normalized;
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') {
    return;
  }

  hydrated = true;

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];

    if (Array.isArray(parsed)) {
      entries = parsed.slice(-MAX_ENTRIES) as ActivityEntry[];
    }
  } catch {
    entries = [];
  }
}

function persist() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Konsol kaydı uygulama akışını hiçbir zaman durdurmamalı.
  }
}

function notify() {
  listeners.forEach(listener => listener());
}

export function recordActivity(entry: NewActivityEntry) {
  hydrate();

  const nextEntry: ActivityEntry = {
    ...entry,
    id: entry.id || createId(),
    timestamp: entry.timestamp || new Date().toISOString(),
    title: normalizeText(entry.title, 180) || 'İşlem',
    message: normalizeText(entry.message, 800),
    sql: entry.sql?.trim().slice(0, 20_000)
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
  return () => listeners.delete(listener);
}

export function getActivitiesSnapshot() {
  hydrate();
  return entries;
}

export function getActivitiesServerSnapshot() {
  return [] as ActivityEntry[];
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
      entries: safeEntries
    },
    null,
    2
  );
}
