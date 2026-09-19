'use client';

import { useModalEscape } from '@/lib/useModalEscape';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, X } from 'lucide-react';
import type { TableColumnInfo, TableInfo, TableRowInsertValue } from 'types';
import { insertTableRow } from '@/lib/databaseApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/context/LanguageContext';
import { translateRuntime } from '@/lib/i18nRuntime';

type InsertMode = TableRowInsertValue['mode'];
interface DraftValue { mode: InsertMode; value: string }

function isGenerated(column: TableColumnInfo) {
  return /auto_increment|identity|generated|nextval/i.test(`${column.Extra} ${column.Default} ${column.Generation_expression}`);
}

function initialValue(column: TableColumnInfo): DraftValue {
  if (column.Default !== null) return { mode: 'default', value: '' };
  if (column.Null === 'YES') return { mode: 'null', value: '' };
  return { mode: 'value', value: '' };
}

function parseValue(source: string, column: TableColumnInfo): unknown {
  const type = column.Data_type.toUpperCase();
  if (/^(JSON|JSONB)$/.test(type)) {
    if (!source.trim()) throw new Error(translateRuntime('rowInsert.invalidJson',{field:column.Field}));
    return JSON.parse(source);
  }
  if (/^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|BIT|YEAR|MONEY)$/.test(type)) {
    if (!source.trim()) throw new Error(translateRuntime('rowInsert.numberRequired',{field:column.Field}));
    const numeric = Number(source);
    if (!Number.isFinite(numeric)) throw new Error(translateRuntime('rowInsert.invalidNumber',{field:column.Field}));
    return numeric;
  }
  if (/^(BOOL|BOOLEAN)$/.test(type)) {
    const normalized = source.trim().toLocaleLowerCase('tr-TR');
    if (['1', 'true', 'evet'].includes(normalized)) return true;
    if (['0', 'false', 'hayır'].includes(normalized)) return false;
    throw new Error(translateRuntime('rowInsert.booleanRequired',{field:column.Field}));
  }
  return source;
}

export function TableRowInsertModal({
  open, onClose, serverId, databaseName, tableName, accountId, info, onInserted
}: {
  open: boolean;
  onClose: () => void;
  serverId: string;
  databaseName: string;
  tableName: string;
  accountId?: string | null;
  info: TableInfo;
  onInserted: () => void;
}) {
  const { t } = useLanguage();
  const columns = useMemo(() => info.columns.filter(column => !isGenerated(column)), [info.columns]);
  const [draft, setDraft] = useState<Record<string, DraftValue>>({});
  const [busy, setBusy] = useState(false);
  useModalEscape(open, onClose, busy);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(Object.fromEntries(columns.map(column => [column.Field, initialValue(column)])));
    setBusy(false);
    setError(null);
  }, [open, columns]);

  if (!open || typeof document === 'undefined') return null;

  const save = async () => {
    if (!accountId) { setError(t('sidebar.workspaceNotReady')); return; }
    const values: Record<string, TableRowInsertValue> = {};
    try {
      for (const column of columns) {
        const field = draft[column.Field] || initialValue(column);
        values[column.Field] = field.mode === 'value'
          ? { mode: 'value', value: parseValue(field.value, column) }
          : { mode: field.mode };
      }
      setBusy(true); setError(null);
      await insertTableRow(serverId, { database: databaseName, table: tableName, values }, accountId);
      onInserted();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('rowInsert.failed'));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[690] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={busy ? undefined : onClose} aria-label={t('common.close')} />
      <div className="relative z-10 flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-cyan-500/20 bg-zinc-950 shadow-2xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-zinc-800 bg-cyan-500/[0.035] px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10"><Plus className="h-4 w-4 text-cyan-300" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">{t('rowInsert.title')}</h3>
            <p className="mt-1 text-[10px] text-zinc-500">{t('rowInsert.description',{database:databaseName,table:tableName})}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} onClick={onClose}><X className="h-4 w-4" /></Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {columns.map(column => {
              const field = draft[column.Field] || initialValue(column);
              return <div key={column.Field} className="grid gap-2 rounded-xl border border-zinc-800 bg-black/20 p-3 md:grid-cols-[minmax(160px,.8fr)_130px_minmax(220px,1.4fr)] md:items-center">
                <div className="min-w-0"><div className="truncate text-[11px] font-medium text-zinc-200">{column.Field}</div><div className="mt-0.5 truncate font-mono text-[9px] text-zinc-600">{column.Type}{column.Key ? ` • ${column.Key}` : ''}</div></div>
                <select value={field.mode} onChange={event => setDraft(previous => ({ ...previous, [column.Field]: { ...field, mode: event.target.value as InsertMode } }))} className="h-8 rounded-lg border border-zinc-800 bg-zinc-950 px-2 text-[10px] text-zinc-300">
                  <option value="value">{t('rowInsert.value')}</option>
                  <option value="null" disabled={column.Null !== 'YES'}>NULL</option>
                  <option value="default" disabled={column.Default === null}>DEFAULT</option>
                </select>
                <Input value={field.value} disabled={field.mode !== 'value'} onChange={event => setDraft(previous => ({ ...previous, [column.Field]: { ...field, value: event.target.value } }))} className="h-8 font-mono text-[10px]" placeholder={field.mode === 'default' ? String(column.Default ?? 'DEFAULT') : field.mode === 'null' ? 'NULL' : column.Type} />
              </div>;
            })}
            {!columns.length && <div className="rounded-xl border border-zinc-800 p-6 text-center text-xs text-zinc-500">{t('rowInsert.generatedOnly')}</div>}
          </div>
          {error && <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">{error}</div>}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Satırı ekle</Button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
