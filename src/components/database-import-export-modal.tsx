'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CheckCircle2, Database, Download, FileJson, FileSpreadsheet, FileText, Loader2, Upload, X } from 'lucide-react';
import type { DatabaseCatalogItem, TableInfo } from 'types';
import { executeDatabaseQuery, fetchTableInfo } from '@/lib/databaseApi';
import { exportDatabaseRows, importDatabaseRows } from '@/lib/databaseWorkbenchApi';
import { useAppPreferences } from '@/lib/appPreferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface DatabaseImportExportModalProps {
  open: boolean;
  onClose: () => void;
  serverId: string | null;
  accountId?: string | null;
  databases: DatabaseCatalogItem[];
  selectedDatabase?: string | null;
  selectedTable?: string | null;
}

type ImportFormat = 'csv' | 'json' | 'sql';
type ExportFormat = 'csv' | 'json' | 'sql';
const controlClass = 'h-8 rounded border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-cyan-500/60';

function parseCsv(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (value.length || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  const [headers = [], ...data] = rows.filter(item => item.some(cell => cell.length));
  return { headers: headers.map((header, index) => header.trim() || `column_${index + 1}`), rows: data };
}

function splitSqlStatements(source: string) {
  const statements: string[] = [];
  let current = '';
  let quote: string | null = null;
  let escaped = false;
  for (const char of source) {
    current += char;
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (quote) { if (char === quote) quote = null; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === ';') { if (current.trim().length > 1) statements.push(current.trim()); current = ''; }
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter(statement => !/^\s*(--|#)/.test(statement));
}

function inferType(values: unknown[]) {
  const present = values.filter(value => value !== null && value !== undefined && String(value).trim() !== '').slice(0, 100);
  if (!present.length) return 'NULL / boş';
  if (present.every(value => /^(true|false|0|1)$/i.test(String(value)))) return 'BOOLEAN';
  if (present.every(value => /^-?\d+$/.test(String(value)))) return 'INTEGER';
  if (present.every(value => /^-?\d+(?:[.,]\d+)?$/.test(String(value)))) return 'DECIMAL';
  if (present.every(value => !Number.isNaN(Date.parse(String(value))))) return 'DATE/DATETIME';
  if (present.every(value => { try { JSON.parse(String(value)); return true; } catch { return false; } })) return 'JSON';
  const max = Math.max(...present.map(value => String(value).length));
  return max <= 255 ? `VARCHAR(${Math.max(16, max)})` : 'TEXT';
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

function sqlLiteral(value: unknown) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

export function DatabaseImportExportModal({ open, onClose, serverId, accountId, databases, selectedDatabase, selectedTable }: DatabaseImportExportModalProps) {
  const { preferences } = useAppPreferences();
  const [database, setDatabase] = useState(selectedDatabase || '');
  const [table, setTable] = useState(selectedTable || '');
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [format, setFormat] = useState<ImportFormat>('csv');
  const [sourceHeaders, setSourceHeaders] = useState<string[]>([]);
  const [sourceRows, setSourceRows] = useState<unknown[][]>([]);
  const [sqlStatements, setSqlStatements] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importMode, setImportMode] = useState<'insert' | 'ignore' | 'replace'>('insert');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, affected: 0 });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [exportLimit, setExportLimit] = useState(5000);
  const [exportColumns, setExportColumns] = useState<string[]>([]);
  const [orderBy, setOrderBy] = useState('');
  const selectedDatabaseItem = databases.find(item => item.name === database);

  useEffect(() => { if (open) { setDatabase(selectedDatabase || databases[0]?.name || ''); setTable(selectedTable || ''); setError(null); setMessage(null); } }, [open, selectedDatabase, selectedTable, databases]);
  useEffect(() => {
    if (!serverId || !accountId || !database || !table) { setTableInfo(null); return; }
    void fetchTableInfo(serverId, database, table, accountId).then(info => { setTableInfo(info); setExportColumns(info.columns.map(column => column.Field)); }).catch(() => setTableInfo(null));
  }, [serverId, accountId, database, table]);
  useEffect(() => {
    if (!tableInfo || !sourceHeaders.length) return;
    const targetNames = new Set(tableInfo.columns.map(column => column.Field));
    setMapping(Object.fromEntries(sourceHeaders.map(header => [header, targetNames.has(header) ? header : ''])));
  }, [tableInfo, sourceHeaders]);

  const inferred = useMemo(() => Object.fromEntries(sourceHeaders.map((header, index) => [header, inferType(sourceRows.map(row => row[index]))])), [sourceHeaders, sourceRows]);
  if (!open || typeof document === 'undefined') return null;

  const readFile = async (file: File) => {
    setError(null); setMessage(null); setFileName(file.name);
    const text = await file.text();
    const detected: ImportFormat = file.name.toLowerCase().endsWith('.json') ? 'json' : file.name.toLowerCase().endsWith('.sql') ? 'sql' : 'csv';
    setFormat(detected);
    if (detected === 'csv') {
      const parsed = parseCsv(text); setSourceHeaders(parsed.headers); setSourceRows(parsed.rows); setSqlStatements([]);
    } else if (detected === 'json') {
      const parsed = JSON.parse(text) as unknown;
      const array = Array.isArray(parsed) ? parsed : [parsed];
      const objects = array.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, unknown>[];
      const headers = Array.from(new Set(objects.flatMap(item => Object.keys(item))));
      setSourceHeaders(headers); setSourceRows(objects.map(item => headers.map(header => item[header]))); setSqlStatements([]);
    } else {
      setSqlStatements(splitSqlStatements(text)); setSourceHeaders([]); setSourceRows([]);
    }
  };

  const runImport = async () => {
    if (!serverId || !accountId || !database) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      if (format === 'sql') {
        setProgress({ current: 0, total: sqlStatements.length, affected: 0 });
        let affected = 0;
        for (let index = 0; index < sqlStatements.length; index += 1) {
          const result = await executeDatabaseQuery(serverId, sqlStatements[index], accountId, database);
          affected += Number(result.affectedRows || 0); setProgress({ current: index + 1, total: sqlStatements.length, affected });
        }
        setMessage(`${sqlStatements.length} SQL ifadesi çalıştırıldı; ${affected.toLocaleString('tr-TR')} satır etkilendi.`);
      } else {
        if (!table) throw new Error('Hedef tablo seçin.');
        const pairs = sourceHeaders.map((source, index) => ({ source, index, target: mapping[source] })).filter(item => item.target);
        if (!pairs.length) throw new Error('En az bir kolon eşleştirin.');
        const mappedRows = sourceRows.map(row => pairs.map(pair => row[pair.index]));
        const batchSize = preferences.importBatchSize;
        const total = Math.ceil(mappedRows.length / batchSize);
        let affected = 0; setProgress({ current: 0, total, affected: 0 });
        for (let offset = 0; offset < mappedRows.length; offset += batchSize) {
          const result = await importDatabaseRows(serverId, { database, table, columns: pairs.map(pair => pair.target), rows: mappedRows.slice(offset, offset + batchSize), mode: importMode }, accountId);
          affected += result.affectedRows; setProgress({ current: Math.floor(offset / batchSize) + 1, total, affected });
        }
        setMessage(`${mappedRows.length.toLocaleString('tr-TR')} satır işlendi; ${affected.toLocaleString('tr-TR')} satır etkilendi.`);
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'İçe aktarma başarısız oldu.'); }
    finally { setBusy(false); }
  };

  const runExport = async () => {
    if (!serverId || !accountId || !database || !table) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await exportDatabaseRows(serverId, { database, table, columns: exportColumns, limit: exportLimit, orderBy: orderBy || undefined }, accountId);
      const baseName = `${database}-${table}-${new Date().toISOString().slice(0, 10)}`;
      if (exportFormat === 'json') download(`${baseName}.json`, JSON.stringify(result.rows, null, 2), 'application/json;charset=utf-8');
      if (exportFormat === 'csv') {
        const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        download(`${baseName}.csv`, [result.columns.map(escape).join(','), ...result.rows.map(row => result.columns.map(column => escape(row[column])).join(','))].join('\n'), 'text/csv;charset=utf-8');
      }
      if (exportFormat === 'sql') {
        const quotedTable = `\`${database.replace(/`/g, '``')}\`.\`${table.replace(/`/g, '``')}\``;
        const columns = result.columns.map(column => `\`${column.replace(/`/g, '``')}\``).join(', ');
        const statements = result.rows.map(row => `INSERT INTO ${quotedTable} (${columns}) VALUES (${result.columns.map(column => sqlLiteral(row[column])).join(', ')});`);
        download(`${baseName}.sql`, statements.join('\n'), 'application/sql;charset=utf-8');
      }
      setMessage(`${result.rowCount.toLocaleString('tr-TR')} satır dışa aktarıldı.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Dışa aktarma başarısız oldu.'); }
    finally { setBusy(false); }
  };

  return createPortal(<div className="fixed inset-0 z-[326] flex items-center justify-center p-4"><button className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Kapat" /><div className="relative z-10 flex h-[min(840px,94vh)] w-[min(1280px,97vw)] min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 px-4"><FileSpreadsheet className="h-4 w-4 text-emerald-400" /><div><h2 className="text-sm font-semibold">Gelişmiş içe / dışa aktarma</h2><p className="text-[10px] text-zinc-500">Kolon eşleştirme, tip tahmini, batch import ve çoklu export formatları.</p></div><Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button></div>
    {(error || message) && <div className={`shrink-0 border-b px-4 py-2 text-xs ${error ? 'border-red-500/20 bg-red-500/10 text-red-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>{error || message}</div>}
    <Tabs defaultValue="import" className="flex min-h-0 flex-1 flex-col"><TabsList className="h-10 shrink-0 justify-start rounded-none border-b border-zinc-800 bg-zinc-950 px-2"><TabsTrigger value="import" className="h-9 text-xs"><Upload className="mr-1.5 h-3.5 w-3.5" />İçe aktar</TabsTrigger><TabsTrigger value="export" className="h-9 text-xs"><Download className="mr-1.5 h-3.5 w-3.5" />Dışa aktar</TabsTrigger></TabsList>
      <TabsContent value="import" className="m-0 min-h-0 flex-1 overflow-y-auto p-4"><div className="space-y-4"><div className="grid gap-3 rounded-xl border border-zinc-800 p-4 md:grid-cols-[1fr_1fr_1fr_auto]"><label className="text-xs text-zinc-500">Veritabanı<select value={database} onChange={event => { setDatabase(event.target.value); setTable(''); }} className={`${controlClass} mt-1 w-full`}>{databases.map(item => <option key={item.name}>{item.name}</option>)}</select></label><label className="text-xs text-zinc-500">Hedef tablo<select value={table} disabled={format === 'sql'} onChange={event => setTable(event.target.value)} className={`${controlClass} mt-1 w-full disabled:opacity-40`}><option value="">Seçin</option>{(selectedDatabaseItem?.tables || []).map(item => <option key={item}>{item}</option>)}</select></label><label className="text-xs text-zinc-500">INSERT davranışı<select value={importMode} disabled={format === 'sql'} onChange={event => setImportMode(event.target.value as typeof importMode)} className={`${controlClass} mt-1 w-full disabled:opacity-40`}><option value="insert">INSERT</option><option value="ignore">INSERT IGNORE</option><option value="replace">REPLACE</option></select></label><label className="mt-5 inline-flex h-8 cursor-pointer items-center justify-center rounded border border-zinc-700 px-3 text-xs hover:bg-zinc-900"><Upload className="mr-2 h-4 w-4" />Dosya seç<input type="file" accept=".csv,.json,.sql,text/csv,application/json,application/sql" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); }} /></label></div>
        {fileName && <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-black/20 p-3 text-xs"><FileText className="h-4 w-4 text-cyan-400" /><span>{fileName}</span><span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] uppercase text-zinc-400">{format}</span><span className="ml-auto text-zinc-500">{format === 'sql' ? `${sqlStatements.length} ifade` : `${sourceRows.length.toLocaleString('tr-TR')} satır`}</span></div>}
        {format !== 'sql' && sourceHeaders.length > 0 && <div className="rounded-xl border border-zinc-800"><div className="border-b border-zinc-800 px-4 py-3 text-xs font-semibold">Kolon eşleştirme ve tip tahmini</div><div className="overflow-x-auto"><Table size="sm"><TableHeader><TableRow><TableHead className="border bg-zinc-950">Kaynak</TableHead><TableHead className="border bg-zinc-950">Tahmin</TableHead><TableHead className="border bg-zinc-950">Örnek</TableHead><TableHead className="border bg-zinc-950">Hedef kolon</TableHead></TableRow></TableHeader><TableBody>{sourceHeaders.map((header, index) => <TableRow key={header}><TableCell className="border font-medium">{header}</TableCell><TableCell className="border text-cyan-400">{inferred[header]}</TableCell><TableCell className="max-w-72 truncate border font-mono text-[10px]">{String(sourceRows[0]?.[index] ?? '—')}</TableCell><TableCell className="border"><select value={mapping[header] || ''} onChange={event => setMapping(previous => ({ ...previous, [header]: event.target.value }))} className={`${controlClass} w-full`}><option value="">Aktarma</option>{(tableInfo?.columns || []).map(column => <option key={column.Field}>{column.Field}</option>)}</select></TableCell></TableRow>)}</TableBody></Table></div></div>}
        {format === 'sql' && sqlStatements.length > 0 && <div className="rounded-xl border border-zinc-800"><div className="border-b border-zinc-800 px-4 py-3 text-xs font-semibold">SQL ifade önizlemesi</div><div className="max-h-80 space-y-2 overflow-y-auto p-3">{sqlStatements.slice(0, 50).map((statement, index) => <pre key={index} className="coreor-sql-editor overflow-x-auto rounded border p-2 font-mono text-[10px]">-- {index + 1}\n{statement}</pre>)}</div></div>}
        {progress.total > 0 && <div className="rounded-lg border border-zinc-800 p-3"><div className="mb-2 flex justify-between text-[10px] text-zinc-500"><span>{progress.current}/{progress.total}</span><span>{progress.affected.toLocaleString('tr-TR')} etkilenen satır</span></div><div className="h-1.5 overflow-hidden rounded bg-zinc-800"><div className="h-full bg-cyan-500 transition-all" style={{ width: `${Math.min(100, progress.total ? progress.current / progress.total * 100 : 0)}%` }} /></div></div>}
        <div className="flex justify-end"><Button disabled={busy || !fileName || (format !== 'sql' && (!table || !sourceRows.length)) || (format === 'sql' && !sqlStatements.length)} onClick={() => void runImport()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}İçe aktarmayı başlat</Button></div></div></TabsContent>
      <TabsContent value="export" className="m-0 min-h-0 flex-1 overflow-y-auto p-4"><div className="space-y-4"><div className="grid gap-3 rounded-xl border border-zinc-800 p-4 md:grid-cols-2 lg:grid-cols-4"><label className="text-xs text-zinc-500">Veritabanı<select value={database} onChange={event => { setDatabase(event.target.value); setTable(''); }} className={`${controlClass} mt-1 w-full`}>{databases.map(item => <option key={item.name}>{item.name}</option>)}</select></label><label className="text-xs text-zinc-500">Tablo<select value={table} onChange={event => setTable(event.target.value)} className={`${controlClass} mt-1 w-full`}><option value="">Seçin</option>{(selectedDatabaseItem?.tables || []).map(item => <option key={item}>{item}</option>)}</select></label><label className="text-xs text-zinc-500">Format<select value={exportFormat} onChange={event => setExportFormat(event.target.value as ExportFormat)} className={`${controlClass} mt-1 w-full`}><option value="csv">CSV</option><option value="json">JSON</option><option value="sql">INSERT SQL</option></select></label><label className="text-xs text-zinc-500">Satır limiti<Input type="number" min="1" max="50000" value={exportLimit} onChange={event => setExportLimit(Number(event.target.value))} className="mt-1 h-8 text-xs" /></label></div>
        {tableInfo && <div className="rounded-xl border border-zinc-800 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold">Kolonlar</h3><div className="flex gap-2 text-[10px]"><button className="text-cyan-400" onClick={() => setExportColumns(tableInfo.columns.map(column => column.Field))}>Tümünü seç</button><button className="text-zinc-500" onClick={() => setExportColumns([])}>Temizle</button></div></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{tableInfo.columns.map(column => <label key={column.Field} className={`flex items-center gap-2 rounded border p-2 text-[11px] ${exportColumns.includes(column.Field) ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-zinc-800'}`}><input type="checkbox" checked={exportColumns.includes(column.Field)} onChange={event => setExportColumns(previous => event.target.checked ? [...previous, column.Field] : previous.filter(item => item !== column.Field))} />{column.Field}<span className="ml-auto text-[9px] text-zinc-600">{column.Type}</span></label>)}</div><label className="mt-4 block text-xs text-zinc-500">Sıralama kolonu<select value={orderBy} onChange={event => setOrderBy(event.target.value)} className={`${controlClass} mt-1 w-full max-w-xs`}><option value="">Sıralama yok</option>{tableInfo.columns.map(column => <option key={column.Field}>{column.Field}</option>)}</select></label></div>}
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-4 text-xs text-zinc-500"><div className="mb-2 flex items-center gap-2 font-medium text-zinc-300">{exportFormat === 'json' ? <FileJson className="h-4 w-4" /> : exportFormat === 'csv' ? <FileSpreadsheet className="h-4 w-4" /> : <Database className="h-4 w-4" />}Dışa aktarma özeti</div>{exportColumns.length || 0} kolon, en fazla {exportLimit.toLocaleString('tr-TR')} satır, {exportFormat.toUpperCase()} formatı.</div><div className="flex justify-end"><Button disabled={busy || !table || !exportColumns.length} onClick={() => void runExport()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Dosyayı oluştur</Button></div></div></TabsContent>
    </Tabs>
    {message && <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/90 px-3 py-2 text-xs text-emerald-200"><CheckCircle2 className="h-4 w-4" />{message}</div>}
  </div></div>, document.body);
}
