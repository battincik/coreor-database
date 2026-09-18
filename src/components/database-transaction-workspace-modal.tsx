'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Code2,
  Database,
  Loader2,
  Play,
  RotateCcw,
  Save,
  ShieldAlert,
  X,
  XCircle
} from 'lucide-react';
import type { DatabaseCatalogItem, QueryExecutionResult } from 'types';
import { matchesShortcut } from '@/lib/shortcuts';
import type { DatabaseTransactionState } from '@/lib/databaseTransactionTypes';
import {
  beginDatabaseTransaction,
  commitDatabaseTransaction,
  executeDatabaseTransactionQuery,
  rollbackDatabaseTransaction
} from '@/lib/databaseTransactionApi';
import { executeDatabaseQuery } from '@/lib/databaseApi';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface DatabaseTransactionWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  serverId: string | null;
  accountId?: string | null;
  databases: DatabaseCatalogItem[];
  selectedDatabase?: string | null;
}

function valueText(value: unknown) {
  if (value === null) return '(NULL)';
  if (value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function timeText(value: string) {
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}

export function DatabaseTransactionWorkspaceModal({ open, onClose, serverId, accountId, databases, selectedDatabase }: DatabaseTransactionWorkspaceModalProps) {
  const [autocommit, setAutocommit] = useState(true);
  const [databaseName, setDatabaseName] = useState<string | null>(selectedDatabase || null);
  const [sql, setSql] = useState('SELECT NOW() AS server_time;');
  const [transaction, setTransaction] = useState<DatabaseTransactionState | null>(null);
  const [result, setResult] = useState<QueryExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'begin' | 'run' | 'commit' | 'rollback' | null>(null);
  const [closeWarning, setCloseWarning] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) return;
    if (!transaction) setDatabaseName(selectedDatabase || null);
  }, [open, selectedDatabase, transaction]);

  useEffect(() => {
    if (!open || !transaction) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, transaction]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (matchesShortcut(event, 'runQuery')) {
        event.preventDefault();
        void runSql();
      }
      if (event.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const columns = useMemo(() => result?.fields?.map(field => field.name) || Object.keys(result?.rows?.[0] || {}), [result]);
  const remainingSeconds = transaction ? Math.max(0, Math.ceil((new Date(transaction.expiresAt).getTime() - now) / 1000)) : 0;

  if (!open || typeof document === 'undefined') return null;

  const begin = async () => {
    if (!serverId || !accountId || transaction || busy) return null;
    setBusy('begin'); setError(null); setMessage(null);
    try {
      const response = await beginDatabaseTransaction(serverId, accountId, databaseName);
      setTransaction(response.transaction);
      setMessage('Transaction açıldı. Bundan sonraki statement’lar commit edilene kadar beklemede kalır.');
      return response.transaction;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Transaction başlatılamadı.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const runSql = async () => {
    if (!serverId || !accountId || !sql.trim() || busy) return;
    setBusy('run'); setError(null); setMessage(null);
    try {
      if (autocommit) {
        const response = await executeDatabaseQuery(serverId, sql, accountId, databaseName);
        setResult(response);
        setMessage('Sorgu autocommit ile tamamlandı.');
      } else {
        let activeTransaction = transaction;
        if (!activeTransaction) {
          const response = await beginDatabaseTransaction(serverId, accountId, databaseName);
          activeTransaction = response.transaction;
          setTransaction(activeTransaction);
        }
        const response = await executeDatabaseTransactionQuery(serverId, activeTransaction.transactionId, sql, accountId, databaseName);
        setTransaction(response.transaction);
        setResult(response.result);
        setMessage('Statement çalıştırıldı ve commit bekliyor.');
      }
    } catch (failure) {
      const text = failure instanceof Error ? failure.message : 'Sorgu çalıştırılamadı.';
      setError(text);
      if ((failure as { code?: string })?.code === 'TRANSACTION_NOT_FOUND') setTransaction(null);
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    if (!serverId || !accountId || !transaction || busy) return;
    setBusy('commit'); setError(null);
    try {
      const response = await commitDatabaseTransaction(serverId, transaction.transactionId, accountId, databaseName);
      setMessage(`${response.statementCount} statement commit edildi.`);
      setTransaction(null);
      setResult(null);
      setAutocommit(true);
      setCloseWarning(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Commit başarısız oldu.');
    } finally {
      setBusy(null);
    }
  };

  const rollback = async (closeAfter = false) => {
    if (!serverId || !accountId || !transaction || busy) return;
    setBusy('rollback'); setError(null);
    try {
      const response = await rollbackDatabaseTransaction(serverId, transaction.transactionId, accountId, databaseName);
      setMessage(`${response.statementCount} statement geri alındı.`);
      setTransaction(null);
      setResult(null);
      setAutocommit(true);
      setCloseWarning(false);
      if (closeAfter) onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Rollback başarısız oldu.');
    } finally {
      setBusy(null);
    }
  };

  const requestClose = () => {
    if (transaction) {
      setCloseWarning(true);
      return;
    }
    onClose();
  };

  const toggleAutocommit = (next: boolean) => {
    if (next && transaction) {
      setError('Autocommit açılmadan önce açık transaction commit veya rollback edilmelidir.');
      return;
    }
    setAutocommit(next);
    setError(null);
    setMessage(next ? 'Autocommit etkin.' : 'Autocommit kapalı. İlk sorguda transaction otomatik açılacak.');
  };

  return createPortal(
    <div className="fixed inset-0 z-[332] flex items-center justify-center p-2 sm:p-3">
      <button type="button" aria-label="Transaction çalışma alanını kapat" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={requestClose} />
      <div className="relative z-10 flex h-[calc(100dvh-16px)] max-h-[880px] w-[calc(100vw-16px)] max-w-[1420px] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)]">
        <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2">
          <ShieldAlert className="h-4 w-4 text-amber-400" />
          <div><h2 className="text-sm font-semibold">Transaction çalışma alanı</h2><p className="text-[9px] text-zinc-600">Aynı MySQL bağlantısı üzerinde kontrollü commit ve rollback.</p></div>
          <select disabled={Boolean(transaction) || Boolean(busy)} value={databaseName || ''} onChange={event => setDatabaseName(event.target.value || null)} className="ml-3 h-8 min-w-48 rounded border border-zinc-800 bg-zinc-950 px-2 text-[10px]"><option value="">Sunucu geneli</option>{databases.map(database => <option key={database.name}>{database.name}</option>)}</select>
          <label className={`flex h-8 items-center gap-2 rounded-lg border px-3 text-[10px] ${autocommit ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}><input type="checkbox" checked={autocommit} onChange={event => toggleAutocommit(event.target.checked)} />Autocommit {autocommit ? 'Açık' : 'Kapalı'}</label>
          {!autocommit && !transaction && <Button variant="outline" size="sm" className="h-8 text-[10px]" disabled={!serverId || !accountId || Boolean(busy)} onClick={() => void begin()}>{busy === 'begin' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Code2 className="mr-1.5 h-3.5 w-3.5" />}Transaction başlat</Button>}
          {transaction && <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[9px] text-amber-200"><Clock3 className="h-3 w-3" />Açık • {remainingSeconds} sn içinde otomatik rollback</div>}
          <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={requestClose}><X className="h-4 w-4" /></Button>
        </header>

        {transaction && <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/[0.06] px-4 py-2 text-[10px] text-amber-100"><AlertTriangle className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">Açık transaction var. {transaction.statements.filter(statement => statement.status === 'success').length} başarılı statement henüz kalıcı değil.</span><Button size="sm" className="h-7 bg-emerald-600 px-3 text-[9px] hover:bg-emerald-500" disabled={Boolean(busy)} onClick={() => void commit()}>{busy === 'commit' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}Commit</Button><Button variant="destructive" size="sm" className="h-7 px-3 text-[9px]" disabled={Boolean(busy)} onClick={() => void rollback()}>{busy === 'rollback' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RotateCcw className="mr-1 h-3 w-3" />}Rollback</Button></div>}
        {error && <div className="flex shrink-0 items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-[10px] text-red-300"><XCircle className="h-3.5 w-3.5" />{error}</div>}
        {message && !error && <div className="flex shrink-0 items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2 text-[10px] text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />{message}</div>}

        <div className="grid min-h-0 min-w-0 flex-1 xl:grid-cols-[minmax(0,1.35fr)_clamp(280px,30vw,380px)]">
          <main className="flex min-h-0 min-w-0 flex-col border-r border-zinc-800">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-800 px-3 text-[9px] text-zinc-600"><Database className="h-3.5 w-3.5" />{databaseName || 'Sunucu geneli'}<span className="ml-auto">Ctrl/Cmd + Enter</span></div>
            <textarea value={sql} onChange={event => setSql(event.target.value)} spellCheck={false} className="coreor-sql-editor min-h-48 shrink-0 resize-y border-0 border-b border-zinc-800 bg-black/20 p-4 font-mono outline-none" placeholder="SQL sorgunuzu yazın…" />
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-800 px-3"><Button size="sm" className="h-7 text-[9px]" disabled={!serverId || !accountId || !sql.trim() || Boolean(busy)} onClick={() => void runSql()}>{busy === 'run' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}Çalıştır</Button><span className="text-[9px] text-zinc-600">{autocommit ? 'Sorgu tamamlandığında otomatik kalıcı olur.' : 'Statement açık transaction içinde çalışır.'}</span></div>
            <div className="min-h-0 flex-1 overflow-auto">{result ? result.rows.length ? <Table size="sm" className="min-w-max"><TableHeader><TableRow>{columns.map(column => <TableHead key={column} className="sticky top-0 z-10 border bg-zinc-950 text-[9px]">{column}</TableHead>)}</TableRow></TableHeader><TableBody>{result.rows.map((row, index) => <TableRow key={index}>{columns.map(column => <TableCell key={column} className="max-w-96 truncate border font-mono text-[10px]" title={valueText(row[column])}>{valueText(row[column])}</TableCell>)}</TableRow>)}</TableBody></Table> : <div className="flex h-full min-h-40 items-center justify-center text-xs text-zinc-600">{typeof result.affectedRows === 'number' ? `${result.affectedRows.toLocaleString('tr-TR')} satır etkilendi.` : 'Sorgu tamamlandı.'}</div> : <div className="flex h-full min-h-40 flex-col items-center justify-center text-center"><Code2 className="h-8 w-8 text-zinc-800" /><div className="mt-3 text-xs text-zinc-500">Henüz sorgu çalıştırılmadı.</div></div>}</div>
          </main>

          <aside className="flex min-h-0 flex-col bg-black/15"><div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800 px-3"><div><div className="text-[10px] font-semibold">Bekleyen statement’lar</div><div className="text-[8px] text-zinc-600">Commit edilmemiş işlem geçmişi</div></div><span className="rounded bg-zinc-900 px-2 py-1 text-[9px] text-zinc-500">{transaction?.statements.length || 0}</span></div><div className="min-h-0 flex-1 overflow-y-auto p-2">{!transaction || transaction.statements.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-[10px] leading-5 text-zinc-600">Autocommit kapalıyken çalıştırılan statement’lar burada commit bekleyen liste olarak görünür.</div> : transaction.statements.map((statement, index) => <article key={statement.id} className={`mb-1.5 rounded-lg border p-2.5 ${statement.status === 'error' ? 'border-red-500/20 bg-red-500/[0.05]' : 'border-zinc-800 bg-black/20'}`}><div className="flex items-center gap-2 text-[8px] text-zinc-600"><span>#{index + 1}</span><span>{timeText(statement.executedAt)}</span><span className="ml-auto">{statement.durationMs} ms</span></div><pre className="mt-2 max-h-20 overflow-hidden whitespace-pre-wrap break-all font-mono text-[9px] leading-4 text-zinc-300">{statement.sql}</pre><div className="mt-2 flex gap-2 text-[8px] text-zinc-600"><span>{statement.rowCount} sonuç</span><span>{statement.affectedRows} etkilenen</span>{statement.error && <span className="truncate text-red-400">{statement.error}</span>}</div></article>)}</div></aside>
        </div>

        {closeWarning && transaction && <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4 backdrop-blur"><div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-zinc-950 p-5 shadow-2xl"><AlertTriangle className="h-6 w-6 text-amber-400" /><h3 className="mt-3 text-sm font-semibold">Açık transaction kapatılamaz</h3><p className="mt-2 text-[10px] leading-5 text-zinc-500">Pencereyi kapatmadan önce değişiklikleri commit edin veya rollback ile geri alın. Doğrudan kapatma otomatik rollback yapmaz.</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setCloseWarning(false)}>Çalışma alanına dön</Button><Button variant="destructive" size="sm" disabled={Boolean(busy)} onClick={() => void rollback(true)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Rollback ve kapat</Button></div></div></div>}
      </div>
    </div>,
    document.body
  );
}
