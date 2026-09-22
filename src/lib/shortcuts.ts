'use client';

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { getNativePlatformSnapshot } from '@/lib/platformRuntime';

export type CoreorPlatform = 'mac' | 'windows' | 'linux';

export type ShortcutId =
  | 'commandPalette'
  | 'newQuery'
  | 'runQuery'
  | 'formatSql'
  | 'refresh'
  | 'insertRow'
  | 'settings'
  | 'find'
  | 'closeTab'
  | 'duplicateTab'
  | 'language'
  | 'backupCenter'
  | 'automationCenter';

interface ShortcutDefinition {
  key: string;
  primary?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export const SHORTCUTS: Record<ShortcutId, ShortcutDefinition> = {
  commandPalette: { key: 'K', primary: true },
  newQuery: { key: 'N', primary: true },
  runQuery: { key: 'Enter', primary: true },
  formatSql: { key: 'F', shift: true, alt: true },
  refresh: { key: 'F5' },
  insertRow: { key: 'I', primary: true },
  settings: { key: ',', primary: true },
  find: { key: 'F', primary: true },
  closeTab: { key: 'W', primary: true },
  duplicateTab: { key: 'D', primary: true, shift: true },
  language: { key: 'L', primary: true, shift: true },
  backupCenter: { key: 'B', primary: true, shift: true },
  automationCenter: { key: 'O', primary: true, shift: true }
};

export function detectPlatform(): CoreorPlatform {
  const platform = getNativePlatformSnapshot().os;
  if (platform === 'macos') return 'mac';
  if (platform === 'linux') return 'linux';
  return 'windows';
}

export function primaryModifier(event: KeyboardEvent | ReactKeyboardEvent) {
  return detectPlatform() === 'mac' ? event.metaKey : event.ctrlKey;
}

export function matchesShortcut(event: KeyboardEvent | ReactKeyboardEvent, id: ShortcutId) {
  const shortcut = SHORTCUTS[id];
  const keyMatches = shortcut.key.length === 1
    ? event.key.toLocaleLowerCase('en-US') === shortcut.key.toLocaleLowerCase('en-US')
    : event.key === shortcut.key;
  if (!keyMatches) return false;
  if (Boolean(shortcut.primary) !== primaryModifier(event)) return false;
  if (Boolean(shortcut.shift) !== event.shiftKey) return false;
  if (Boolean(shortcut.alt) !== event.altKey) return false;
  return true;
}

export function shortcutLabel(value?: ShortcutId | string) {
  if (!value) return '';
  const shortcut = value in SHORTCUTS ? SHORTCUTS[value as ShortcutId] : null;
  const platform = detectPlatform();
  if (!shortcut) {
    if (platform !== 'mac') return value;
    return value
      .replace(/Ctrl\+/gi, '⌘')
      .replace(/Cmd\+/gi, '⌘')
      .replace(/Alt\+/gi, '⌥')
      .replace(/Shift\+/gi, '⇧');
  }
  const parts: string[] = [];
  if (shortcut.primary) parts.push(platform === 'mac' ? '⌘' : 'Ctrl');
  if (shortcut.shift) parts.push(platform === 'mac' ? '⇧' : 'Shift');
  if (shortcut.alt) parts.push(platform === 'mac' ? '⌥' : 'Alt');
  parts.push(shortcut.key);
  return platform === 'mac' ? parts.join('') : parts.join('+');
}
