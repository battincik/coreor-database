'use client';

import type { ShortcutBinding } from '@/lib/databaseSafetyWorkspace';

function normalizedKey(value: string) {
  const key = value.trim().toLowerCase();
  if (key === ' ') return 'space';
  if (key === 'esc') return 'escape';
  return key;
}

export function shortcutMatches(event: KeyboardEvent | React.KeyboardEvent, binding: string) {
  const parts = binding.split('+').map(part => normalizedKey(part)).filter(Boolean);
  if (!parts.length) return false;
  const mod = parts.includes('mod');
  const ctrl = parts.includes('ctrl') || (mod && !navigator.platform.toLowerCase().includes('mac'));
  const meta = parts.includes('meta') || parts.includes('cmd') || (mod && navigator.platform.toLowerCase().includes('mac'));
  const alt = parts.includes('alt') || parts.includes('option');
  const shift = parts.includes('shift');
  const key = parts.find(part => !['mod','ctrl','meta','cmd','alt','option','shift'].includes(part));

  if (Boolean(event.ctrlKey) !== ctrl) return false;
  if (Boolean(event.metaKey) !== meta) return false;
  if (Boolean(event.altKey) !== alt) return false;
  if (Boolean(event.shiftKey) !== shift) return false;
  return !key || normalizedKey(event.key) === key || normalizedKey(event.code.replace(/^Key|^Digit/, '')) === key;
}

export function shortcutFor(bindings: ShortcutBinding[], id: string, fallback: string) {
  return bindings.find(binding => binding.id === id)?.keys || fallback;
}

export function displayShortcut(value: string) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  return value
    .replace(/Mod/gi, isMac ? '⌘' : 'Ctrl')
    .replace(/Shift/gi, '⇧')
    .replace(/Alt|Option/gi, isMac ? '⌥' : 'Alt')
    .replace(/\+/g, ' ');
}
