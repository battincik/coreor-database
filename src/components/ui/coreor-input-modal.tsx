'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CoreorInputModal({
  open, title, description, initialValue, placeholder, confirmLabel = 'Kaydet', onClose, onConfirm
}: {
  open: boolean;
  title: string;
  description?: string;
  initialValue: string;
  placeholder?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setValue(initialValue); setBusy(false); } }, [open, initialValue]);
  if (!open || typeof document === 'undefined') return null;
  const normalized = value.trim();

  return createPortal(
    <div className="fixed inset-0 z-[710] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={busy ? undefined : onClose} aria-label="Kapat" />
      <form className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-[0_24px_100px_rgba(0,0,0,.72)]" onSubmit={async event => {
        event.preventDefault();
        if (!normalized || busy) return;
        setBusy(true);
        try { await onConfirm(normalized); onClose(); } finally { setBusy(false); }
      }}>
        <header className="flex items-start gap-3 border-b border-zinc-800 bg-white/[0.02] px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10"><Pencil className="h-4 w-4 text-cyan-300" /></span>
          <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{title}</h2>{description && <p className="mt-1 text-[10px] leading-5 text-zinc-500">{description}</p>}</div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button>
        </header>
        <div className="p-5"><Input autoFocus value={value} onChange={event => setValue(event.target.value)} placeholder={placeholder} className="h-10 bg-black/30 text-xs" maxLength={80} onFocus={event => event.currentTarget.select()} /></div>
        <footer className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3"><Button type="button" variant="ghost" size="sm" onClick={onClose}>İptal</Button><Button type="submit" size="sm" disabled={!normalized || busy}>{confirmLabel}</Button></footer>
      </form>
    </div>,
    document.body
  );
}
