'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/context/LanguageContext';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleAlert,
  Info,
  Loader2,
  ShieldAlert,
  Sparkles,
  X,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CoreorSwitch } from '@/components/ui/coreor-switch';

export type CoreorToastVariant = 'success' | 'neutral' | 'danger' | 'warning' | 'error' | 'primary' | 'secondary';

export interface CoreorToastCheckbox {
  id: string;
  label: string;
  description?: string;
  checked?: boolean;
  required?: boolean;
}

export interface CoreorToastInput {
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  expectedValue?: string;
  type?: 'text' | 'password' | 'number';
}

export interface CoreorToastOptions {
  id?: string;
  variant?: CoreorToastVariant;
  title: string;
  description?: string;
  duration?: number;
  persistent?: boolean;
  loading?: boolean;
  checkboxes?: CoreorToastCheckbox[];
  input?: CoreorToastInput;
  confirmLabel?: string;
  cancelLabel?: string;
  yesNo?: boolean;
  onConfirm?: (result: CoreorToastResult) => void | Promise<void>;
  onCancel?: () => void;
  metadata?: Array<{ label: string; value: React.ReactNode }>;
  onOpen?: () => void;
}

export interface CoreorToastResult {
  confirmed: boolean;
  inputValue: string;
  checks: Record<string, boolean>;
}

interface ToastRecord extends CoreorToastOptions {
  id: string;
  createdAt: number;
  resolve?: (result: CoreorToastResult) => void;
}

interface ToastContextValue {
  show: (options: CoreorToastOptions) => string;
  confirm: (options: CoreorToastOptions) => Promise<CoreorToastResult>;
  dismiss: (id: string) => void;
  clear: () => void;
  update: (id: string, patch: Partial<CoreorToastOptions>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const COREOR_TOAST_EVENT = 'coreor:toast';

function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `toast-${crypto.randomUUID()}`
    : `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function dispatchCoreorToast(options: CoreorToastOptions) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CoreorToastOptions>(COREOR_TOAST_EVENT, { detail: options }));
}

const toneMap: Record<CoreorToastVariant, { border: string; background: string; icon: string; accent: string }> = {
  success: { border: 'border-emerald-500/30', background: 'bg-emerald-500/[0.08]', icon: 'text-emerald-300', accent: 'bg-emerald-500' },
  neutral: { border: 'border-zinc-700', background: 'bg-zinc-900/95', icon: 'text-zinc-300', accent: 'bg-zinc-500' },
  danger: { border: 'border-red-500/35', background: 'bg-red-500/[0.09]', icon: 'text-red-300', accent: 'bg-red-500' },
  warning: { border: 'border-amber-500/35', background: 'bg-amber-500/[0.09]', icon: 'text-amber-300', accent: 'bg-amber-500' },
  error: { border: 'border-rose-500/35', background: 'bg-rose-500/[0.09]', icon: 'text-rose-300', accent: 'bg-rose-500' },
  primary: { border: 'border-cyan-500/35', background: 'bg-cyan-500/[0.08]', icon: 'text-cyan-300', accent: 'bg-cyan-500' },
  secondary: { border: 'border-purple-500/35', background: 'bg-purple-500/[0.08]', icon: 'text-purple-300', accent: 'bg-purple-500' }
};

function VariantIcon({ variant, loading }: { variant: CoreorToastVariant; loading?: boolean }) {
  if (loading) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (variant === 'success') return <CheckCircle2 className="h-4 w-4" />;
  if (variant === 'danger') return <ShieldAlert className="h-4 w-4" />;
  if (variant === 'warning') return <AlertTriangle className="h-4 w-4" />;
  if (variant === 'error') return <XCircle className="h-4 w-4" />;
  if (variant === 'primary') return <Sparkles className="h-4 w-4" />;
  if (variant === 'secondary') return <CircleAlert className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
}

function ToastCard({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: string, result?: CoreorToastResult) => void }) {
  const variant = toast.variant || 'neutral';
  const tone = toneMap[variant];
  const [inputValue, setInputValue] = useState(toast.input?.defaultValue || '');
  const [checks, setChecks] = useState<Record<string, boolean>>(() => Object.fromEntries((toast.checkboxes || []).map(item => [item.id, Boolean(item.checked)])));
  const [submitting, setSubmitting] = useState(false);
  const requiredChecksSatisfied = (toast.checkboxes || []).every(item => !item.required || checks[item.id]);
  const inputSatisfied = !toast.input?.required || Boolean(inputValue.trim());
  const expectedSatisfied = toast.input?.expectedValue === undefined || inputValue === toast.input.expectedValue;
  const canConfirm = requiredChecksSatisfied && inputSatisfied && expectedSatisfied && !submitting;

  const result = (confirmed: boolean): CoreorToastResult => ({ confirmed, inputValue, checks });
  const confirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await toast.onConfirm?.(result(true));
      onDismiss(toast.id, result(true));
    } finally {
      setSubmitting(false);
    }
  };
  const cancel = () => {
    toast.onCancel?.();
    onDismiss(toast.id, result(false));
  };

  const actionable = Boolean(toast.onConfirm || toast.yesNo || toast.input || toast.checkboxes?.length);
  const metadataTooltip = (toast.metadata || []).map(item => `${item.label}: ${String(item.value)}`).join('\n');

  return (
    <article
      className={`pointer-events-auto relative w-[min(320px,calc(100vw-16px))] overflow-hidden rounded-lg border shadow-xl backdrop-blur-xl ${tone.border} ${tone.background} ${toast.onOpen ? 'cursor-pointer' : ''}`}
      onClick={() => toast.onOpen?.()}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${tone.accent}`} />
      <div className="p-2.5 pl-3.5">
        <div className="flex items-start gap-2">
          <span className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/20 ${tone.icon}`}>
            <VariantIcon variant={variant} loading={toast.loading || submitting} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[10px] font-semibold leading-4 text-zinc-100">{toast.title}</h3>
            {toast.description && <p className="line-clamp-1 text-[8px] leading-3.5 text-zinc-500">{toast.description}</p>}
            {toast.onOpen && !actionable && <span className="mt-1 inline-flex text-[8px] text-zinc-600">Ayrıntılar için aç</span>}
          </div>
          {!actionable && toast.metadata?.length ? <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-600" title={metadataTooltip}><Info className="h-3.5 w-3.5" /></span> : null}
          <button type="button" className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-200" onClick={event => { event.stopPropagation(); cancel(); }} aria-label={t('ui.closeNotification')}>
            <X className="h-3 w-3" />
          </button>
        </div>

        {actionable && toast.metadata?.length ? (
          <div className="mt-3 grid gap-1.5 rounded-xl border border-white/[0.07] bg-black/20 p-3 sm:grid-cols-2">
            {toast.metadata.map(item => <div key={item.label} className="min-w-0"><div className="text-[8px] uppercase tracking-[0.12em] text-zinc-600">{item.label}</div><div className="mt-1 truncate text-[10px] text-zinc-300">{item.value}</div></div>)}
          </div>
        ) : null}

        {toast.checkboxes?.length ? (
          <div className="mt-3 space-y-2 rounded-xl border border-white/[0.07] bg-black/20 p-3">
            {toast.checkboxes.map(item => (
              <CoreorSwitch
                key={item.id}
                checked={Boolean(checks[item.id])}
                onCheckedChange={checked => setChecks(previous => ({ ...previous, [item.id]: checked }))}
                label={item.label}
                description={item.description}
              />
            ))}
          </div>
        ) : null}

        {toast.input && (
          <label className="mt-3 block text-[9px] text-zinc-500">
            {toast.input.label || 'Değer'}
            <Input
              value={inputValue}
              onChange={event => setInputValue(event.target.value)}
              placeholder={toast.input.placeholder}
              type={toast.input.type || 'text'}
              className="mt-1 h-9 rounded-xl border-white/10 bg-black/30 text-[11px]"
              autoFocus
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void confirm(); } }}
            />
            {toast.input.expectedValue !== undefined && inputValue && !expectedSatisfied && <span className="mt-1 block text-[8px] text-amber-400">Beklenen değerle eşleşmiyor.</span>}
          </label>
        )}

        {actionable && (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-[10px]" onClick={cancel}>{toast.cancelLabel || (toast.yesNo ? 'Hayır' : 'İptal')}</Button>
            <Button size="sm" className="h-8 text-[10px]" disabled={!canConfirm} onClick={() => void confirm()}>
              {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
              {toast.confirmLabel || (toast.yesNo ? 'Evet' : 'Onayla')}
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

export function CoreorToastProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, number>());

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string, result?: CoreorToastResult) => {
    setToasts(previous => {
      const target = previous.find(item => item.id === id);
      target?.resolve?.(result || { confirmed: false, inputValue: '', checks: {} });
      return previous.filter(item => item.id !== id);
    });
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback((options: CoreorToastOptions) => {
    const id = options.id || createId();
    const record: ToastRecord = { ...options, id, createdAt: Date.now() };
    setToasts(previous => [record, ...previous.filter(item => item.id !== id)].slice(0, 3));
    const actionable = Boolean(options.onConfirm || options.yesNo || options.input || options.checkboxes?.length);
    if (!options.persistent && !actionable) {
      const duration = Math.max(1800, options.duration ?? 5200);
      const timer = window.setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  const confirm = useCallback((options: CoreorToastOptions) => new Promise<CoreorToastResult>(resolve => {
    const id = options.id || createId();
    const record: ToastRecord = { ...options, id, createdAt: Date.now(), persistent: true, resolve };
    setToasts(previous => [record, ...previous.filter(item => item.id !== id)].slice(0, 3));
  }), []);

  const update = useCallback((id: string, patch: Partial<CoreorToastOptions>) => setToasts(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item)), []);
  const clear = useCallback(() => {
    for (const toast of toasts) toast.resolve?.({ confirmed: false, inputValue: '', checks: {} });
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
    setToasts([]);
  }, [toasts]);

  useEffect(() => {
    const handler = (event: Event) => show((event as CustomEvent<CoreorToastOptions>).detail);
    window.addEventListener(COREOR_TOAST_EVENT, handler);
    return () => window.removeEventListener(COREOR_TOAST_EVENT, handler);
  }, [show]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ show, confirm, dismiss, clear, update }), [show, confirm, dismiss, clear, update]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted && createPortal(
        <div className="pointer-events-none fixed right-2.5 top-9 z-[1000] flex max-h-[calc(100dvh-44px)] flex-col gap-1 overflow-hidden">
          {toasts.map(toast => <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />)}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useCoreorToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useCoreorToast, CoreorToastProvider içinde kullanılmalıdır.');
  return value;
}
