'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface CoreorConfirmation {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'default';
  onConfirm: () => void | Promise<void>;
}

export function CoreorConfirmModal({ action, onClose }: { action: CoreorConfirmation | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setBusy(false); setError(null); }, [action?.title]);
  if (!action || typeof document === 'undefined') return null;

  const danger = action.tone === 'danger';
  return createPortal(
    <div className="fixed inset-0 z-[700] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={busy ? undefined : onClose} aria-label="Kapat" />
      <div className={`relative z-10 w-full max-w-md overflow-hidden rounded-2xl border bg-zinc-950 shadow-[0_24px_100px_rgba(0,0,0,.72)] ${danger ? 'border-red-500/25' : 'border-zinc-800'}`}>
        <header className={`flex items-start gap-3 border-b border-zinc-800 px-5 py-4 ${danger ? 'bg-red-500/[0.04]' : 'bg-white/[0.02]'}`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${danger ? 'border-red-500/25 bg-red-500/10 text-red-400' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300'}`}>
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-zinc-100">{action.title}</h2>
            <p className="mt-1 text-[10px] leading-5 text-zinc-500">{action.description}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} disabled={busy}><X className="h-4 w-4" /></Button>
        </header>
        {error && <div className="mx-5 mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">{error}</div>}
        <footer className="flex items-center justify-end gap-2 px-5 py-4">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>{action.cancelLabel || 'İptal'}</Button>
          <Button variant={danger ? 'destructive' : 'default'} size="sm" disabled={busy} onClick={async () => {
            setBusy(true); setError(null);
            try { await action.onConfirm(); onClose(); }
            catch (failure) { setError(failure instanceof Error ? failure.message : 'İşlem tamamlanamadı.'); }
            finally { setBusy(false); }
          }}>{busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{action.confirmLabel || 'Onayla'}</Button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
