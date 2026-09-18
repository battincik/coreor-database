'use client';

import { useSyncExternalStore } from 'react';

export type AppThemeName = 'amoled' | 'graphite' | 'midnight' | 'nord' | 'solarized' | 'light' | 'high-contrast';
export type AppFontFamily = 'system' | 'inter' | 'geist' | 'mono' | 'cascadia' | 'fira-code' | 'humanist' | 'serif';
export type SyntaxThemeName = 'coreor' | 'dracula' | 'nord' | 'monokai' | 'github-dark' | 'github-light';
export type PerformanceRefreshSeconds = 1 | 3 | 5 | 10 | 15 | 30;

export interface AppPreferences {
  theme: AppThemeName;
  syntaxTheme: SyntaxThemeName;
  fontFamily: AppFontFamily;
  uiFontSize: number;
  editorFontSize: number;
  consoleFontSize: number;
  lineHeight: number;
  compactMode: boolean;
  sidebarSize: number;
  objectExplorerGrouped: boolean;
  objectExplorerDetails: boolean;
  reducedMotion: boolean;
  strongFocusRing: boolean;
  highContrastBorders: boolean;
  dyslexiaSpacing: boolean;
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
  autocomplete: boolean;
  autoRefreshProcesses: boolean;
  confirmDangerousQueries: boolean;
  dryRunMutations: boolean;
  requireSecondApproval: boolean;
  productionAlterApproval: boolean;
  autoSchemaSnapshots: boolean;
  queryResultLimit: number;
  importBatchSize: number;
  rememberPanelSizes: boolean;
  rememberQueryWorkspace: boolean;
  defaultReadOnlyConnections: boolean;
  liveNotifications: boolean;
  performanceRefreshSeconds: PerformanceRefreshSeconds;
}

const STORAGE_KEY = 'coreor:app-preferences:v7';
const LEGACY_STORAGE_KEYS = ['coreor:app-preferences:v6', 'coreor:app-preferences:v5', 'coreor:app-preferences:v4', 'coreor:app-preferences:v3'];
const listeners = new Set<() => void>();
const DEFAULTS: AppPreferences = {
  theme: 'amoled', syntaxTheme: 'coreor', fontFamily: 'system', uiFontSize: 12,
  editorFontSize: 13, consoleFontSize: 9, lineHeight: 1.55, compactMode: true,
  sidebarSize: 20, objectExplorerGrouped: true, objectExplorerDetails: true, reducedMotion: false, strongFocusRing: true, highContrastBorders: false,
  dyslexiaSpacing: false, colorBlindMode: 'none', autocomplete: true,
  autoRefreshProcesses: false, confirmDangerousQueries: true, dryRunMutations: true,
  requireSecondApproval: true, productionAlterApproval: true, autoSchemaSnapshots: true,
  queryResultLimit: 5000, importBatchSize: 250, rememberPanelSizes: true, rememberQueryWorkspace: true,
  defaultReadOnlyConnections: false, liveNotifications: true, performanceRefreshSeconds: 10
};
let snapshot: AppPreferences = DEFAULTS;
let hydrated = false;

function clamp(value: unknown, fallback: number, minimum: number, maximum: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(Math.max(numeric, minimum), maximum) : fallback;
}

function normalizeRefresh(value: unknown): PerformanceRefreshSeconds {
  const allowed: PerformanceRefreshSeconds[] = [1, 3, 5, 10, 15, 30];
  const numeric = Number(value);
  return allowed.includes(numeric as PerformanceRefreshSeconds) ? numeric as PerformanceRefreshSeconds : DEFAULTS.performanceRefreshSeconds;
}

function normalize(value: Partial<AppPreferences> | null | undefined): AppPreferences {
  const source = value || {};
  return {
    ...DEFAULTS,
    ...source,
    uiFontSize: clamp(source.uiFontSize, DEFAULTS.uiFontSize, 10, 18),
    editorFontSize: clamp(source.editorFontSize, DEFAULTS.editorFontSize, 10, 28),
    consoleFontSize: clamp(source.consoleFontSize, DEFAULTS.consoleFontSize, 8, 18),
    lineHeight: clamp(source.lineHeight, DEFAULTS.lineHeight, 1.2, 2.2),
    sidebarSize: clamp(source.sidebarSize, DEFAULTS.sidebarSize, 12, 45),
    queryResultLimit: Math.trunc(clamp(source.queryResultLimit, DEFAULTS.queryResultLimit, 100, 50000)),
    importBatchSize: Math.trunc(clamp(source.importBatchSize, DEFAULTS.importBatchSize, 25, 1000)),
    performanceRefreshSeconds: normalizeRefresh(source.performanceRefreshSeconds)
  };
}

function applyToDocument(preferences: AppPreferences) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.coreorTheme = preferences.theme;
  root.dataset.syntaxTheme = preferences.syntaxTheme;
  root.dataset.colorBlindMode = preferences.colorBlindMode;
  root.dataset.compact = preferences.compactMode ? 'true' : 'false';
  root.dataset.reducedMotion = preferences.reducedMotion ? 'true' : 'false';
  root.dataset.strongFocus = preferences.strongFocusRing ? 'true' : 'false';
  root.dataset.highContrastBorders = preferences.highContrastBorders ? 'true' : 'false';
  root.dataset.dyslexiaSpacing = preferences.dyslexiaSpacing ? 'true' : 'false';
  root.dataset.liveNotifications = preferences.liveNotifications ? 'true' : 'false';
  root.style.setProperty('--coreor-ui-font-size', `${preferences.uiFontSize}px`);
  root.style.setProperty('--coreor-editor-font-size', `${preferences.editorFontSize}px`);
  root.style.setProperty('--coreor-console-font-size', `${preferences.consoleFontSize}px`);
  root.style.setProperty('--coreor-line-height', String(preferences.lineHeight));
  const fonts: Record<AppFontFamily, string> = {
    system: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    inter: 'Inter, ui-sans-serif, system-ui, sans-serif',
    geist: 'Geist, Inter, ui-sans-serif, system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    cascadia: '"Cascadia Code", "Cascadia Mono", ui-monospace, monospace',
    'fira-code': '"Fira Code", "JetBrains Mono", ui-monospace, monospace',
    humanist: '"Atkinson Hyperlegible", Verdana, ui-sans-serif, sans-serif',
    serif: 'Georgia, Cambria, "Times New Roman", serif'
  };
  root.style.setProperty('--coreor-font-family', fonts[preferences.fontFamily]);
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
      || LEGACY_STORAGE_KEYS.map(key => window.localStorage.getItem(key)).find(Boolean)
      || '{}';
    snapshot = normalize(JSON.parse(stored));
  } catch {
    snapshot = DEFAULTS;
  }
  applyToDocument(snapshot);
}

function emit() { listeners.forEach(listener => listener()); }
export function getAppPreferences() { hydrate(); return snapshot; }
export function getServerAppPreferences() { return DEFAULTS; }
export function subscribeAppPreferences(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function setAppPreferences(patch: Partial<AppPreferences>) {
  hydrate(); snapshot = normalize({ ...snapshot, ...patch });
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  applyToDocument(snapshot); emit(); return snapshot;
}
export function resetAppPreferences() {
  snapshot = DEFAULTS; hydrated = true;
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
    for (const key of LEGACY_STORAGE_KEYS) window.localStorage.removeItem(key);
  }
  applyToDocument(snapshot); emit();
}
export function useAppPreferences() {
  const preferences = useSyncExternalStore(subscribeAppPreferences, getAppPreferences, getServerAppPreferences);
  return { preferences, setPreferences: setAppPreferences, resetPreferences: resetAppPreferences };
}
