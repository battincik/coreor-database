'use client';

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  CheckCircle2,
  Copy,
  Database,
  Loader2,
  Play,
  Server,
  Terminal,
  Trash2,
  XCircle
} from 'lucide-react';
import type { DatabaseServerConfig, EditorQueryTab } from 'types';
import { executeDatabaseQuery } from '@/lib/databaseApi';
import { useAppContextMenu } from '@/components/app-context-menu';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface QueryWorkspaceProps {
  tab: EditorQueryTab;
  servers: DatabaseServerConfig[];
  accountId?: string | null;
  onChange: (patch: Partial<EditorQueryTab>) => void;
  onDuplicate: () => void;
}

function valueText(value: unknown) {
  if (value === null) return '(NULL)';
  if (value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function QueryWorkspace({ tab, servers, accountId, onChange, onDuplicate }: QueryWorkspaceProps) {
  const { openContextMenu } = useAppContextMenu();
  const autoRunHandled = useRef(false);
  const selectedServer = useMemo(
    () => servers.find(server => server.id === tab.serverId) ?? servers[0] ?? null,
    [servers, tab.serverId]
  );
  const databases = selectedServer?.databases || [];

  const runQuery = useCallback(async () => {
    if (!selectedServer || !accountId || tab.isRunning || !tab.sql.trim()) return;

    onChange({ isRunning: true, error: null, runImmediately: false, serverId: selectedServer.id });
    try {
      const result = await executeDatabaseQuery(selectedServer.id, tab.sql, accountId, tab.databaseName);
      onChange({
        isRunning: false,
        error: null,
        result,
        runImmediately: false,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      onChange({
        isRunning: false,
        error: error instanceof Error ? error.message : 'SQL sorgusu çalıştırılamadı.',
        result: null,
        runImmediately: false,
        updatedAt: new Date().toISOString()
      });
    }
  }, [selectedServer, accountId, tab.isRunning, tab.sql, tab.databaseName, onChange]);

  useEffect(() => {
    if (!tab.runImmediately || autoRunHandled.current) return;
    autoRunHandled.current = true;
    void runQuery();
  }, [tab.runImmediately, runQuery]);

  useEffect(() => {
    autoRunHandled.current = false;
  }, [tab.id]);

  const resultColumns = useMemo(() => {
    if (tab.result?.fields?.length) return tab.result.fields.map(field => field.name);
    return Object.keys(tab.result?.rows?.[0] || {});
  }, [tab.result]);

  const editorContextMenu = (event: React.MouseEvent) => {
    openContextMenu(
      event,
      [
        { id: 'run', label: 'Sorguyu çalıştır', icon: Play, shortcut: 'Ctrl+Enter', disabled: tab.isRunning || !tab.sql.trim(), onSelect: runQuery },
        { id: 'separator-1', separator: true },
        { id: 'copy', label: 'SQL metnini kopyala', icon: Copy, disabled: !tab.sql.trim(), onSelect: () => navigator.clipboard.writeText(tab.sql) },
        { id: 'duplicate', label: 'Sekmeyi çoğalt', icon: Copy, onSelect: onDuplicate },
        { id: 'clear', label: 'Editörü temizle', icon: Trash2, disabled: !tab.sql, onSelect: () => onChange({ sql: '', result: null, error: null }) }
      ],
      tab.databaseName ? `${tab.databaseName} sorgusu` : 'Sunucu geneli sorgu'
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950/30">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-2 py-1">
        <Button type="button" size="sm" className="h-7 gap-1.5 text-[11px]" disabled={!selectedServer || !accountId || tab.isRunning || !tab.sql.trim()} onClick={runQuery}>
          {tab.isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Çalıştır
        </Button>

        <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <Server className="h-3.5 w-3.5" />
          <select
            value={selectedServer?.id || ''}
            onChange={event => onChange({ serverId: event.target.value || null, databaseName: null, result: null, error: null })}
            className="h-7 min-w-40 rounded border border-zinc-800 bg-zinc-950 px-2 text-[11px] text-zinc-300"
          >
            {servers.map(server => <option key={server.id} value={server.id}>{server.name}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <Database className="h-3.5 w-3.5" />
          <select
            value={tab.databaseName || ''}
            onChange={event => onChange({ databaseName: event.target.value || null, result: null, error: null })}
            className="h-7 min-w-44 rounded border border-zinc-800 bg-zinc-950 px-2 text-[11px] text-zinc-300"
          >
            <option value="">Sunucu geneli</option>
            {databases.map(database => <option key={database.name} value={database.name}>{database.name}</option>)}
          </select>
        </label>

        <span className="ml-auto text-[10px] text-zinc-600">Ctrl/Cmd + Enter ile çalıştır</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(150px,0.48fr)_minmax(150px,0.52fr)]">
        <div className="min-h-0 border-b border-zinc-800">
          <textarea
            value={tab.sql}
            spellCheck={false}
            aria-label="SQL sorgu editörü"
            className="h-full w-full resize-none border-0 bg-[#08090b] p-3 font-mono text-xs leading-5 text-cyan-100 outline-none selection:bg-cyan-500/25"
            placeholder={tab.databaseName ? `${tab.databaseName} veritabanı için SQL yazın…` : 'Sunucu genelinde çalıştırılacak SQL sorgusunu yazın…'}
            onChange={event => onChange({ sql: event.target.value, updatedAt: new Date().toISOString() })}
            onContextMenu={editorContextMenu}
            onKeyDown={event => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                void runQuery();
              }
            }}
          />
        </div>

        <div className="flex min-h-0 flex-col bg-black/20">
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-zinc-800 px-2 text-[10px] text-zinc-500">
            <Terminal className="h-3.5 w-3.5" />
            <span>Sonuç</span>
            {tab.isRunning && <span className="ml-1 inline-flex items-center gap-1 text-cyan-400"><Loader2 className="h-3 w-3 animate-spin" /> Çalıştırılıyor</span>}
            {!tab.isRunning && tab.error && <span className="ml-1 inline-flex items-center gap-1 text-red-400"><XCircle className="h-3 w-3" /> Hata</span>}
            {!tab.isRunning && tab.result && !tab.error && <span className="ml-1 inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Tamamlandı</span>}
            {tab.result?.rows && <span className="ml-auto tabular-nums">{tab.result.rows.length.toLocaleString('tr-TR')} satır</span>}
            {typeof tab.result?.affectedRows === 'number' && <span className="ml-auto tabular-nums">{tab.result.affectedRows.toLocaleString('tr-TR')} satır etkilendi</span>}
          </div>

          {tab.error ? (
            <div className="m-3 rounded border border-red-500/30 bg-red-500/10 p-3 font-mono text-[11px] leading-5 text-red-300">{tab.error}</div>
          ) : tab.result?.rows?.length ? (
            <ScrollArea className="min-h-0 flex-1">
              <div className="min-w-max">
                <Table size="sm" className="w-full">
                  <TableHeader>
                    <TableRow>{resultColumns.map(column => <TableHead key={column} className="sticky top-0 z-10 h-8 whitespace-nowrap border bg-zinc-950 px-2 text-[10px]">{column}</TableHead>)}</TableRow>
                  </TableHeader>
                  <TableBody>
                    {tab.result.rows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {resultColumns.map(column => {
                          const text = valueText(row[column]);
                          return (
                            <TableCell
                              key={column}
                              className="max-w-[520px] truncate whitespace-nowrap border px-2 py-1 font-mono text-[11px] text-zinc-300"
                              title={text}
                              onContextMenu={event => openContextMenu(event, [
                                { id: 'copy-cell', label: 'Hücre değerini kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(text) },
                                { id: 'copy-row', label: 'Satırı JSON olarak kopyala', icon: Copy, onSelect: () => navigator.clipboard.writeText(JSON.stringify(row, null, 2)) }
                              ], `${column} sonucu`)}
                            >
                              {text}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          ) : tab.result ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-xs text-zinc-500">
              {typeof tab.result.affectedRows === 'number'
                ? `${tab.result.affectedRows.toLocaleString('tr-TR')} satır etkilendi${tab.result.insertId !== undefined ? ` • Insert ID: ${tab.result.insertId}` : ''}.`
                : 'Sorgu başarıyla tamamlandı; sonuç satırı dönmedi.'}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-xs text-zinc-600">
              Sorguyu çalıştırdığınızda sonuçlar burada gösterilir.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
