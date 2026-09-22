'use client';
import { invoke } from '@tauri-apps/api/core';
const seen = new WeakSet<object>();
const kinds = new Set(['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'URIError', 'EvalError']);
export function reportAppError(error: unknown, source: 'window' | 'promise' | 'react' | 'native-command' = 'window') {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
  if (error instanceof Error && (error.name === 'DatabaseClientError' || error.message.startsWith('UPDATE_'))) return;
  if (error && typeof error === 'object') {
    if (seen.has(error)) return;
    seen.add(error);
  }
  const kind = source === 'native-command' ? 'NativeError' : error instanceof Error && kinds.has(error.name) ? error.name : 'Error';
  // Do not send raw messages or stack strings: they can embed SQL and credentials.
  const frames = error instanceof Error ? [...(error.stack || '').matchAll(/\/([a-zA-Z0-9_.-]+\.js):(\d+):(\d+)/g)]
    .slice(0, 16).map(m => ({ file: m[1], line: Number(m[2]), column: Number(m[3]) })) : [];
  void invoke('report_app_error', { error: { source, kind, frames } }).catch(() => undefined);
}
export function installErrorListeners() {
  const onError = (event: ErrorEvent) => reportAppError(event.error, 'window');
  const onRejection = (event: PromiseRejectionEvent) => reportAppError(event.reason, 'promise');
  const original = console.error;
  console.error = (...args: unknown[]) => {
    for (const value of args) if (value instanceof Error) reportAppError(value);
    original.apply(console, args);
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => { console.error = original; window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
}
