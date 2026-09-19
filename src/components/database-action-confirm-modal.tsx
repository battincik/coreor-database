'use client';

import { useModalEscape } from '@/lib/useModalEscape';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Code2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SqlCodeBlock } from '@/components/ui/sql-syntax';
import { useLanguage } from '@/context/LanguageContext';

export interface DatabaseActionConfirmation {
  title: string;
  description: string;
  expectedText: string;
  sql: string;
  confirmLabel: string;
  tone?: 'danger' | 'warning';
  onConfirm: () => void | Promise<void>;
}

export function DatabaseActionConfirmModal({ action, onClose }: { action: DatabaseActionConfirmation | null; onClose: () => void }) {
  const {t}=useLanguage();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useModalEscape(Boolean(action), onClose, busy);
  useEffect(() => { setValue(''); setBusy(false); setError(null); }, [action?.title, action?.expectedText]);
  if (!action || typeof document === 'undefined') return null;
  const matches = value === action.expectedText;
  return createPortal(<div className="fixed inset-0 z-[620] flex items-center justify-center p-4">
    <button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={busy ? undefined : onClose} aria-label={t('common.close')} />
    <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-red-500/25 bg-zinc-950 shadow-2xl">
      <header className="flex items-start gap-3 border-b border-zinc-800 bg-red-500/[0.04] px-5 py-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10"><AlertTriangle className="h-5 w-5 text-red-400" /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-zinc-100">{action.title}</h2><p className="mt-1 text-[10px] leading-5 text-zinc-500">{action.description}</p></div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} disabled={busy}><X className="h-4 w-4" /></Button></header>
      <div className="space-y-4 p-5">
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black/30"><div className="flex h-8 items-center gap-2 border-b border-zinc-800 px-3 text-[9px] text-zinc-600"><Code2 className="h-3.5 w-3.5 text-cyan-400" />{t('actionConfirm.sqlToRun')}</div><SqlCodeBlock sql={action.sql} className="max-h-52 p-4" /></div>
        <div><label className="mb-2 block text-[10px] text-zinc-400">{t('actionConfirm.typeToConfirmPrefix')} <span className="font-mono font-semibold text-red-300">{action.expectedText}</span> {t('actionConfirm.typeToConfirmSuffix')}</label><Input autoFocus value={value} onChange={event => { setValue(event.target.value); setError(null); }} className="h-10 border-red-500/20 bg-black/30 font-mono text-xs focus-visible:ring-red-500/30" placeholder={action.expectedText} /></div>
        {error && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">{error}</div>}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3"><Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button variant="destructive" size="sm" disabled={!matches || busy} onClick={async () => { setBusy(true); setError(null); try { await action.onConfirm(); onClose(); } catch (failure) { setError(failure instanceof Error ? failure.message : t('actionConfirm.failed')); } finally { setBusy(false); } }}>{busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{action.confirmLabel}</Button></footer>
    </div>
  </div>, document.body);
}
