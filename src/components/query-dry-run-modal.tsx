'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Database, Loader2, Play, ShieldCheck, X } from 'lucide-react';
import type { QueryExecutionResult } from 'types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SqlCodeBlock } from '@/components/ui/sql-syntax';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface QueryDryRunPreview {
  statement: string;
  countSql: string;
  previewSql: string;
  count: number | null;
  result: QueryExecutionResult;
  description: string;
  onConfirm: () => void | Promise<void>;
}

function valueText(value: unknown) {
  if (value === null) return '(NULL)';
  if (value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function QueryDryRunModal({ preview, onClose }: { preview: QueryDryRunPreview | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setBusy(false); setError(null); }, [preview?.statement]);
  if (!preview || typeof document === 'undefined') return null;
  const columns = preview.result.fields?.map(field => field.name) || Object.keys(preview.result.rows[0] || {});

  return createPortal(
    <div className="fixed inset-0 z-[710] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-md" aria-label="Dry-run penceresini kapat" onClick={busy ? undefined : onClose} />
      <div className="relative z-10 flex h-[min(820px,92vh)] w-[min(1160px,96vw)] min-h-0 flex-col overflow-hidden rounded-2xl border border-amber-500/25 bg-zinc-950 shadow-2xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-amber-500/20 bg-amber-500/[0.04] px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10"><ShieldCheck className="h-5 w-5 text-amber-300" /></span>
          <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">SQL dry-run ön izlemesi</h2><p className="mt-1 text-[10px] leading-5 text-zinc-500">{preview.description}</p></div>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} onClick={onClose}><X className="h-4 w-4" /></Button>
        </header>

        <div className="grid shrink-0 gap-3 border-b border-zinc-800 p-4 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3"><div className="text-[9px] uppercase tracking-wider text-zinc-600">Etkilenecek satır</div><div className="mt-2 text-2xl font-semibold text-amber-300">{preview.count === null ? '—' : preview.count.toLocaleString('tr-TR')}</div></div>
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3"><div className="text-[9px] uppercase tracking-wider text-zinc-600">Örneklenen satır</div><div className="mt-2 text-2xl font-semibold text-cyan-300">{preview.result.rows.length.toLocaleString('tr-TR')}</div></div>
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3"><div className="text-[9px] uppercase tracking-wider text-zinc-600">Durum</div><div className="mt-2 flex items-center gap-2 text-[11px] font-medium text-emerald-300"><CheckCircle2 className="h-4 w-4" />Veri değiştirilmedi</div></div>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-r border-zinc-800 p-4">
            <div className="mb-2 flex items-center gap-2 text-[9px] font-medium text-zinc-500"><AlertTriangle className="h-3.5 w-3.5 text-amber-400" />Asıl sorgu</div>
            <div className="rounded-xl border border-zinc-800 bg-black/20 p-3"><SqlCodeBlock sql={preview.statement} /></div>
            <div className="mb-2 mt-4 flex items-center gap-2 text-[9px] font-medium text-zinc-500"><Database className="h-3.5 w-3.5 text-cyan-400" />Sayım sorgusu</div>
            <div className="rounded-xl border border-zinc-800 bg-black/20 p-3"><SqlCodeBlock sql={preview.countSql} /></div>
            <div className="mb-2 mt-4 text-[9px] font-medium text-zinc-500">Ön izleme sorgusu</div>
            <div className="rounded-xl border border-zinc-800 bg-black/20 p-3"><SqlCodeBlock sql={preview.previewSql} /></div>
          </aside>

          <main className="flex min-h-0 flex-col">
            <div className="flex h-9 shrink-0 items-center border-b border-zinc-800 px-3 text-[9px] text-zinc-500">İlk {preview.result.rows.length.toLocaleString('tr-TR')} kayıt</div>
            <ScrollArea className="min-h-0 flex-1">
              {preview.result.rows.length ? <div className="min-w-max"><Table size="sm" columnStorageKey={`dry-run:${columns.join('|')}`}><TableHeader><TableRow>{columns.map(column => <TableHead key={column} columnKey={column} className="sticky top-0 z-10 h-8 whitespace-nowrap border bg-zinc-950 px-2 text-[9px]">{column}</TableHead>)}</TableRow></TableHeader><TableBody>{preview.result.rows.map((row, index) => <TableRow key={index}>{columns.map(column => { const text = valueText(row[column]); return <TableCell key={column} className="max-w-80 truncate whitespace-nowrap border px-2 py-1 font-mono text-[10px]" title={text}>{text}</TableCell>; })}</TableRow>)}</TableBody></Table></div> : <div className="flex h-full min-h-48 items-center justify-center text-xs text-zinc-600">Sorgunun etkileyeceği kayıt bulunamadı.</div>}
            </ScrollArea>
          </main>
        </div>

        {error && <div className="shrink-0 border-t border-red-500/20 bg-red-500/10 px-4 py-2 text-[10px] text-red-300">{error}</div>}
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>İptal</Button>
          <Button variant="destructive" size="sm" disabled={busy || preview.count === 0} onClick={async () => { setBusy(true); setError(null); try { await preview.onConfirm(); onClose(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Sorgu çalıştırılamadı.'); } finally { setBusy(false); } }}>{busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}Asıl sorguyu çalıştır</Button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
