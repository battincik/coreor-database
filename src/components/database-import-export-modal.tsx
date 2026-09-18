'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2,
  Upload,
  X
} from 'lucide-react';
import type { DatabaseCatalogItem, TableColumnInfo, TableInfo } from 'types';
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
type ImportIssue = {
  severity: 'error' | 'warning';
  row?: number;
  column?: string;
  message: string;
};

const MAX_FILE_BYTES = 12_000_000;
const MAX_PREVIEW_ISSUES = 100;
const MAX_SQL_STATEMENTS = 2000;
const controlClass = 'h-8 rounded border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-cyan-500/60';

function detectDelimiter(source: string) {
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const candidates = [',', ';', '\t'];
  return candidates.sort((left, right) => firstLine.split(right).length - firstLine.split(left).length)[0];
}

function parseCsv(source: string) {
  const delimiter = detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }

  const [headers = [], ...data] = rows.filter(item => item.some(cell => cell.length));
  return {
    delimiter,
    headers: headers.map((header, index) => header.trim() || `column_${index + 1}`),
    rows: data
  };
}

function splitSqlStatements(source: string) {
  const statements: string[] = [];
  let current = '';
  let quote: string | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      current += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (!quote && char === '-' && next === '-' && /\s/.test(source[index + 2] || '')) {
      current += `${char}${next}`;
      index += 1;
      lineComment = true;
      continue;
    }
    if (!quote && char === '#') {
      current += char;
      lineComment = true;
      continue;
    }
    if (!quote && char === '/' && next === '*') {
      current += `${char}${next}`;
      index += 1;
      blockComment = true;
      continue;
    }

    current += char;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === ';') {
      if (current.replace(/(?:--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/g, '').trim().length > 1) {
        statements.push(current.trim());
      }
      current = '';
    }
  }

  if (current.replace(/(?:--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/g, '').trim()) {
    statements.push(current.trim());
  }
  return statements.slice(0, MAX_SQL_STATEMENTS);
}

function inferType(values: unknown[]) {
  const present = values
    .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
    .slice(0, 100);
  if (!present.length) return 'NULL / boş';
  if (present.every(value => /^(true|false|0|1)$/i.test(String(value)))) return 'BOOLEAN';
  if (present.every(value => /^-?\d+$/.test(String(value)))) return 'INTEGER';
  if (present.every(value => /^-?\d+(?:[.,]\d+)?$/.test(String(value)))) return 'DECIMAL';
  if (present.every(value => !Number.isNaN(Date.parse(String(value))))) return 'DATE/DATETIME';
  if (present.every(value => {
    try {
      JSON.parse(String(value));
      return true;
    } catch {
      return false;
    }
  })) return 'JSON';
  const max = Math.max(...present.map(value => String(value).length));
  return max <= 255 ? `VARCHAR(${Math.max(16, max)})` : 'TEXT';
}

function normalizeTypeValue(value: unknown, column: TableColumnInfo) {
  if (value === null || value === undefined) return value;
  const text = String(value).trim();
  if (text === '' && column.Null === 'YES') return null;
  const type = column.Data_type.toUpperCase();
  if (['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'INTEGER', 'BIGINT', 'BIT', 'YEAR'].includes(type)) {
    if (!/^-?\d+$/.test(text)) throw new Error('tam sayı bekleniyor');
    return text;
  }
  if (['DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL'].includes(type)) {
    const normalized = text.replace(',', '.');
    if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) throw new Error('gerçel sayı bekleniyor');
    return normalized;
  }
  if (['BOOL', 'BOOLEAN'].includes(type)) {
    if (!/^(true|false|0|1)$/i.test(text)) throw new Error('true, false, 0 veya 1 bekleniyor');
    return /^(true|1)$/i.test(text);
  }
  if (type === 'JSON') {
    JSON.parse(text);
    return JSON.parse(text) as unknown;
  }
  if (['DATE', 'DATETIME', 'TIMESTAMP', 'TIME'].includes(type) && Number.isNaN(Date.parse(text))) {
    throw new Error('geçerli tarih/zaman bekleniyor');
  }
  return value;
}

function buildImportPreview(
  sourceHeaders: string[],
  sourceRows: unknown[][],
  mapping: Record<string, string>,
  tableInfo: TableInfo | null
) {
  const issues: ImportIssue[] = [];
  if (!tableInfo || !sourceHeaders.length) return { issues, normalizedRows: sourceRows };

  const duplicateHeaders = sourceHeaders.filter((header, index) => sourceHeaders.indexOf(header) !== index);
  for (const header of Array.from(new Set(duplicateHeaders))) {
    issues.push({ severity: 'error', column: header, message: 'Kaynak dosyada yinelenen kolon başlığı var.' });
  }

  const mappedTargets = sourceHeaders.map(header => mapping[header]).filter(Boolean);
  const duplicateTargets = mappedTargets.filter((target, index) => mappedTargets.indexOf(target) !== index);
  for (const target of Array.from(new Set(duplicateTargets))) {
    issues.push({ severity: 'error', column: target, message: 'Birden fazla kaynak kolon aynı hedef kolona bağlanmış.' });
  }

  for (const column of tableInfo.columns) {
    const required = column.Null !== 'YES'
      && column.Default === null
      && !/auto_increment|generated/i.test(column.Extra);
    if (required && !mappedTargets.includes(column.Field)) {
      issues.push({ severity: 'error', column: column.Field, message: 'Zorunlu hedef kolon eşleştirilmemiş.' });
    }
  }

  const mappedPairs = sourceHeaders
    .map((source, index) => ({ source, index, target: mapping[source] }))
    .filter(pair => pair.target);
  const normalizedRows = sourceRows.map((row, rowIndex) => mappedPairs.map(pair => {
    const targetColumn = tableInfo.columns.find(column => column.Field === pair.target);
    if (!targetColumn) return row[pair.index];
    try {
      return normalizeTypeValue(row[pair.index], targetColumn);
    } catch (failure) {
      if (issues.length < MAX_PREVIEW_ISSUES) {
        issues.push({
          severity: 'error',
          row: rowIndex + 2,
          column: pair.target,
          message: failure instanceof Error ? failure.message : 'Değer hedef tipe dönüştürülemedi.'
        });
      }
      return row[pair.index];
    }
  }));

  const expectedSourceLength = sourceHeaders.length;
  sourceRows.forEach((row, rowIndex) => {
    if (row.length !== expectedSourceLength && issues.length < MAX_PREVIEW_ISSUES) {
      issues.push({
        severity: 'error',
        row: rowIndex + 2,
        message: `Satırda ${row.length} değer var; ${expectedSourceLength} değer bekleniyor.`
      });
    }
  });

  if (sourceRows.length > 100_000) {
    issues.push({
      severity: 'warning',
      message: 'Dosya 100.000 satırdan büyük. Aktarım uzun sürebilir ve uygulama belleği kullanımını artırabilir.'
    });
  }

  return { issues, normalizedRows };
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sqlLiteral(value: unknown) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

export function DatabaseImportExportModal({
  open,
  onClose,
  serverId,
  accountId,
  databases,
  selectedDatabase,
  selectedTable
}: DatabaseImportExportModalProps) {
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
  const [delimiter, setDelimiter] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, affected: 0 });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [exportLimit, setExportLimit] = useState(5000);
  const [exportColumns, setExportColumns] = useState<string[]>([]);
  const [orderBy, setOrderBy] = useState('');
  const selectedDatabaseItem = databases.find(item => item.name === database);

  useEffect(() => {
    if (!open) return;
    setDatabase(selectedDatabase || databases[0]?.name || '');
    setTable(selectedTable || '');
    setError(null);
    setMessage(null);
    setProgress({ current: 0, total: 0, affected: 0 });
  }, [open, selectedDatabase, selectedTable, databases]);

  useEffect(() => {
    if (!serverId || !accountId || !database || !table) {
      setTableInfo(null);
      return;
    }
    void fetchTableInfo(serverId, database, table, accountId)
      .then(info => {
        setTableInfo(info);
        setExportColumns(info.columns.map(column => column.Field));
      })
      .catch(() => setTableInfo(null));
  }, [serverId, accountId, database, table]);

  useEffect(() => {
    if (!tableInfo || !sourceHeaders.length) return;
    const targetNames = new Set(tableInfo.columns.map(column => column.Field));
    setMapping(Object.fromEntries(
      sourceHeaders.map(header => [header, targetNames.has(header) ? header : ''])
    ));
  }, [tableInfo, sourceHeaders]);

  const inferred = useMemo(
    () => Object.fromEntries(sourceHeaders.map((header, index) => [
      header,
      inferType(sourceRows.map(row => row[index]))
    ])) as Record<string, string>,
    [sourceHeaders, sourceRows]
  );
  const preview = useMemo(
    () => buildImportPreview(sourceHeaders, sourceRows, mapping, tableInfo),
    [sourceHeaders, sourceRows, mapping, tableInfo]
  );
  const importErrorCount = preview.issues.filter(issue => issue.severity === 'error').length;
  const importWarningCount = preview.issues.filter(issue => issue.severity === 'warning').length;

  if (!open || typeof document === 'undefined') return null;

  const readFile = async (file: File) => {
    setError(null);
    setMessage(null);
    setFileName('');
    setSourceHeaders([]);
    setSourceRows([]);
    setSqlStatements([]);
    setMapping({});
    setDelimiter('');

    try {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error(`Dosya ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(1)} MB sınırını aşıyor.`);
      }
      const text = await file.text();
      const lowerName = file.name.toLocaleLowerCase('tr-TR');
      const detected: ImportFormat = lowerName.endsWith('.json')
        ? 'json'
        : lowerName.endsWith('.sql')
          ? 'sql'
          : 'csv';
      setFormat(detected);

      if (detected === 'csv') {
        const parsed = parseCsv(text);
        if (!parsed.headers.length) throw new Error('CSV başlık satırı bulunamadı.');
        setDelimiter(parsed.delimiter === '\t' ? 'TAB' : parsed.delimiter);
        setSourceHeaders(parsed.headers);
        setSourceRows(parsed.rows);
      } else if (detected === 'json') {
        const parsed = JSON.parse(text) as unknown;
        const array = Array.isArray(parsed) ? parsed : [parsed];
        const objects = array.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, unknown>[];
        if (!objects.length) throw new Error('JSON dosyasında nesne satırı bulunamadı.');
        const headers = Array.from(new Set(objects.flatMap(item => Object.keys(item))));
        setSourceHeaders(headers);
        setSourceRows(objects.map(item => headers.map(header => item[header])));
      } else {
        const statements = splitSqlStatements(text);
        if (!statements.length) throw new Error('Çalıştırılabilir SQL ifadesi bulunamadı.');
        if (statements.length >= MAX_SQL_STATEMENTS) {
          setMessage(`Güvenlik sınırı nedeniyle ilk ${MAX_SQL_STATEMENTS.toLocaleString('tr-TR')} ifade yüklendi.`);
        }
        setSqlStatements(statements);
      }
      setFileName(file.name);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Dosya okunamadı.');
    }
  };

  const runImport = async () => {
    if (!serverId || !accountId || !database) return;
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      if (format === 'sql') {
        setProgress({ current: 0, total: sqlStatements.length, affected: 0 });
        let affected = 0;
        for (let index = 0; index < sqlStatements.length; index += 1) {
          const result = await executeDatabaseQuery(
            serverId,
            sqlStatements[index],
            accountId,
            database
          );
          affected += Number(result.affectedRows || 0);
          setProgress({ current: index + 1, total: sqlStatements.length, affected });
        }
        setMessage(`${sqlStatements.length} SQL ifadesi çalıştırıldı; ${affected.toLocaleString('tr-TR')} satır etkilendi.`);
        return;
      }

      if (!table) throw new Error('Hedef tablo seçin.');
      if (importErrorCount > 0) throw new Error('Hata önizlemesindeki sorunları düzeltmeden içe aktarma başlatılamaz.');

      const pairs = sourceHeaders
        .map((source, index) => ({ source, index, target: mapping[source] }))
        .filter(item => item.target);
      if (!pairs.length) throw new Error('En az bir kolon eşleştirin.');

      const batchSize = preferences.importBatchSize;
      const total = Math.ceil(preview.normalizedRows.length / batchSize);
      let affected = 0;
      setProgress({ current: 0, total, affected: 0 });
      for (let offset = 0; offset < preview.normalizedRows.length; offset += batchSize) {
        const result = await importDatabaseRows(serverId, {
          database,
          table,
          columns: pairs.map(pair => pair.target),
          rows: preview.normalizedRows.slice(offset, offset + batchSize),
          mode: importMode
        }, accountId);
        affected += result.affectedRows;
        setProgress({
          current: Math.floor(offset / batchSize) + 1,
          total,
          affected
        });
      }
      setMessage(`${preview.normalizedRows.length.toLocaleString('tr-TR')} satır işlendi; ${affected.toLocaleString('tr-TR')} satır etkilendi.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'İçe aktarma başarısız oldu.');
    } finally {
      setBusy(false);
    }
  };

  const runExport = async () => {
    if (!serverId || !accountId || !database || !table) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await exportDatabaseRows(serverId, {
        database,
        table,
        columns: exportColumns,
        limit: exportLimit,
        orderBy: orderBy || undefined
      }, accountId);
      const baseName = `${database}-${table}-${new Date().toISOString().slice(0, 10)}`;

      if (exportFormat === 'json') {
        download(
          `${baseName}.json`,
          JSON.stringify(result.rows, null, 2),
          'application/json;charset=utf-8'
        );
      }
      if (exportFormat === 'csv') {
        const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        download(
          `${baseName}.csv`,
          [
            result.columns.map(escape).join(','),
            ...result.rows.map(row => result.columns.map(column => escape(row[column])).join(','))
          ].join('\n'),
          'text/csv;charset=utf-8'
        );
      }
      if (exportFormat === 'sql') {
        const quotedTable = `\`${database.replace(/`/g, '``')}\`.\`${table.replace(/`/g, '``')}\``;
        const columns = result.columns
          .map(column => `\`${column.replace(/`/g, '``')}\``)
          .join(', ');
        const statements = result.rows.map(row =>
          `INSERT INTO ${quotedTable} (${columns}) VALUES (${result.columns.map(column => sqlLiteral(row[column])).join(', ')});`
        );
        download(`${baseName}.sql`, statements.join('\n'), 'application/sql;charset=utf-8');
      }
      setMessage(`${result.rowCount.toLocaleString('tr-TR')} satır dışa aktarıldı.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Dışa aktarma başarısız oldu.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[326] flex items-center justify-center p-2 sm:p-3">
      <button className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Kapat" />
      <div className="relative z-10 flex h-[calc(100dvh-16px)] max-h-[840px] w-[calc(100vw-16px)] max-w-[1280px] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)]">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 px-4">
          <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold">Gelişmiş içe / dışa aktarma</h2>
            <p className="text-[10px] text-zinc-500">Kolon eşleştirme, hata önizlemesi, tip tahmini ve batch import.</p>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {(error || message) && (
          <div className={`shrink-0 border-b px-4 py-2 text-xs ${error ? 'border-red-500/20 bg-red-500/10 text-red-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>
            {error || message}
          </div>
        )}

        <Tabs defaultValue="import" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="h-10 shrink-0 justify-start rounded-none border-b border-zinc-800 bg-zinc-950 px-2">
            <TabsTrigger value="import" className="h-9 text-xs"><Upload className="mr-1.5 h-3.5 w-3.5" />İçe aktar</TabsTrigger>
            <TabsTrigger value="export" className="h-9 text-xs"><Download className="mr-1.5 h-3.5 w-3.5" />Dışa aktar</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="m-0 min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border border-zinc-800 p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
                <label className="text-xs text-zinc-500">Veritabanı
                  <select value={database} onChange={event => { setDatabase(event.target.value); setTable(''); }} className={`${controlClass} mt-1 w-full`}>
                    {databases.map(item => <option key={item.name}>{item.name}</option>)}
                  </select>
                </label>
                <label className="text-xs text-zinc-500">Hedef tablo
                  <select value={table} disabled={format === 'sql'} onChange={event => setTable(event.target.value)} className={`${controlClass} mt-1 w-full disabled:opacity-40`}>
                    <option value="">Seçin</option>
                    {(selectedDatabaseItem?.tables || []).map(item => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="text-xs text-zinc-500">INSERT davranışı
                  <select value={importMode} disabled={format === 'sql'} onChange={event => setImportMode(event.target.value as typeof importMode)} className={`${controlClass} mt-1 w-full disabled:opacity-40`}>
                    <option value="insert">INSERT</option>
                    <option value="ignore">INSERT IGNORE</option>
                    <option value="replace">REPLACE</option>
                  </select>
                </label>
                <label className="mt-5 inline-flex h-8 cursor-pointer items-center justify-center rounded border border-zinc-700 px-3 text-xs hover:bg-zinc-900">
                  <Upload className="mr-2 h-4 w-4" />Dosya seç
                  <input type="file" accept=".csv,.json,.sql,text/csv,application/json,application/sql" className="sr-only" onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) void readFile(file);
                    event.currentTarget.value = '';
                  }} />
                </label>
              </div>

              {fileName && (
                <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-black/20 p-3 text-xs">
                  <FileText className="h-4 w-4 text-cyan-400" />
                  <span>{fileName}</span>
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] uppercase text-zinc-400">{format}</span>
                  {delimiter && <span className="text-[10px] text-zinc-600">ayraç: {delimiter}</span>}
                  <span className="ml-auto text-zinc-500">
                    {format === 'sql' ? `${sqlStatements.length} ifade` : `${sourceRows.length.toLocaleString('tr-TR')} satır`}
                  </span>
                </div>
              )}

              {format !== 'sql' && sourceHeaders.length > 0 && (
                <div className="rounded-xl border border-zinc-800">
                  <div className="flex items-center border-b border-zinc-800 px-4 py-3 text-xs font-semibold">
                    Kolon eşleştirme ve tip tahmini
                    <span className="ml-auto text-[10px] font-normal text-zinc-600">{sourceHeaders.length} kaynak kolon</span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table size="sm">
                      <TableHeader><TableRow>
                        <TableHead className="border bg-zinc-950">Kaynak</TableHead>
                        <TableHead className="border bg-zinc-950">Tahmin</TableHead>
                        <TableHead className="border bg-zinc-950">Örnek</TableHead>
                        <TableHead className="border bg-zinc-950">Hedef kolon</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>{sourceHeaders.map((header, index) => (
                        <TableRow key={`${header}-${index}`}>
                          <TableCell className="border font-medium">{header}</TableCell>
                          <TableCell className="border text-cyan-400">{inferred[header]}</TableCell>
                          <TableCell className="max-w-72 truncate border font-mono text-[10px]">{String(sourceRows[0]?.[index] ?? '—')}</TableCell>
                          <TableCell className="border">
                            <select value={mapping[header] || ''} onChange={event => setMapping(previous => ({ ...previous, [header]: event.target.value }))} className={`${controlClass} w-full`}>
                              <option value="">Aktarma</option>
                              {(tableInfo?.columns || []).map(column => <option key={column.Field}>{column.Field}</option>)}
                            </select>
                          </TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {format !== 'sql' && sourceRows.length > 0 && (
                <div className={`rounded-xl border ${importErrorCount ? 'border-red-500/30' : importWarningCount ? 'border-amber-500/30' : 'border-emerald-500/30'}`}>
                  <div className="flex items-center gap-2 border-b border-inherit px-4 py-3 text-xs font-semibold">
                    {importErrorCount ? <AlertTriangle className="h-4 w-4 text-red-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                    Hata önizlemesi
                    <span className="ml-auto text-[10px] font-normal text-zinc-500">{importErrorCount} hata • {importWarningCount} uyarı</span>
                  </div>
                  {preview.issues.length === 0 ? (
                    <div className="p-4 text-xs text-emerald-300">İlk doğrulamada kolon ve veri tipi hatası bulunamadı.</div>
                  ) : (
                    <div className="max-h-52 overflow-y-auto p-2">
                      {preview.issues.slice(0, MAX_PREVIEW_ISSUES).map((issue, index) => (
                        <div key={`${issue.row}-${issue.column}-${index}`} className={`mb-1 flex items-start gap-2 rounded px-2 py-1.5 text-[10px] ${issue.severity === 'error' ? 'bg-red-500/[0.08] text-red-300' : 'bg-amber-500/[0.08] text-amber-200'}`}>
                          <span className="shrink-0 font-mono">{issue.row ? `Satır ${issue.row}` : 'Dosya'}</span>
                          {issue.column && <span className="shrink-0 text-zinc-500">• {issue.column}</span>}
                          <span>{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {format === 'sql' && sqlStatements.length > 0 && (
                <div className="rounded-xl border border-zinc-800">
                  <div className="border-b border-zinc-800 px-4 py-3 text-xs font-semibold">SQL ifade önizlemesi</div>
                  <div className="max-h-80 space-y-2 overflow-y-auto p-3">
                    {sqlStatements.slice(0, 50).map((statement, index) => (
                      <pre key={index} className="coreor-sql-editor overflow-x-auto rounded border p-2 font-mono text-[10px]">-- {index + 1}{'\n'}{statement}</pre>
                    ))}
                  </div>
                </div>
              )}

              {progress.total > 0 && (
                <div className="rounded-lg border border-zinc-800 p-3">
                  <div className="mb-2 flex justify-between text-[10px] text-zinc-500">
                    <span>{progress.current}/{progress.total}</span>
                    <span>{progress.affected.toLocaleString('tr-TR')} etkilenen satır</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
                    <div className="h-full bg-cyan-500 transition-all" style={{ width: `${Math.min(100, progress.total ? progress.current / progress.total * 100 : 0)}%` }} />
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button disabled={busy || !fileName || importErrorCount > 0 || (format !== 'sql' && (!table || !sourceRows.length)) || (format === 'sql' && !sqlStatements.length)} onClick={() => void runImport()}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  İçe aktarmayı başlat
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="export" className="m-0 min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border border-zinc-800 p-4 md:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs text-zinc-500">Veritabanı
                  <select value={database} onChange={event => { setDatabase(event.target.value); setTable(''); }} className={`${controlClass} mt-1 w-full`}>
                    {databases.map(item => <option key={item.name}>{item.name}</option>)}
                  </select>
                </label>
                <label className="text-xs text-zinc-500">Tablo
                  <select value={table} onChange={event => setTable(event.target.value)} className={`${controlClass} mt-1 w-full`}>
                    <option value="">Seçin</option>
                    {(selectedDatabaseItem?.tables || []).map(item => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="text-xs text-zinc-500">Format
                  <select value={exportFormat} onChange={event => setExportFormat(event.target.value as ExportFormat)} className={`${controlClass} mt-1 w-full`}>
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                    <option value="sql">INSERT SQL</option>
                  </select>
                </label>
                <label className="text-xs text-zinc-500">Satır limiti
                  <Input type="number" min="1" max="50000" value={exportLimit} onChange={event => setExportLimit(Number(event.target.value))} className="mt-1 h-8 text-xs" />
                </label>
              </div>

              {tableInfo && (
                <div className="rounded-xl border border-zinc-800 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-semibold">Kolonlar</h3>
                    <div className="flex gap-2 text-[10px]">
                      <button className="text-cyan-400" onClick={() => setExportColumns(tableInfo.columns.map(column => column.Field))}>Tümünü seç</button>
                      <button className="text-zinc-500" onClick={() => setExportColumns([])}>Temizle</button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {tableInfo.columns.map(column => (
                      <label key={column.Field} className={`flex items-center gap-2 rounded border p-2 text-[11px] ${exportColumns.includes(column.Field) ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-zinc-800'}`}>
                        <input type="checkbox" checked={exportColumns.includes(column.Field)} onChange={event => setExportColumns(previous => event.target.checked ? [...previous, column.Field] : previous.filter(item => item !== column.Field))} />
                        {column.Field}
                        <span className="ml-auto text-[9px] text-zinc-600">{column.Type}</span>
                      </label>
                    ))}
                  </div>
                  <label className="mt-4 block text-xs text-zinc-500">Sıralama kolonu
                    <select value={orderBy} onChange={event => setOrderBy(event.target.value)} className={`${controlClass} mt-1 w-full max-w-xs`}>
                      <option value="">Sıralama yok</option>
                      {tableInfo.columns.map(column => <option key={column.Field}>{column.Field}</option>)}
                    </select>
                  </label>
                </div>
              )}

              <div className="rounded-xl border border-zinc-800 bg-black/20 p-4 text-xs text-zinc-500">
                <div className="mb-2 flex items-center gap-2 font-medium text-zinc-300">
                  {exportFormat === 'json' ? <FileJson className="h-4 w-4" /> : exportFormat === 'csv' ? <FileSpreadsheet className="h-4 w-4" /> : <Database className="h-4 w-4" />}
                  Dışa aktarma özeti
                </div>
                {exportColumns.length} kolon, en fazla {exportLimit.toLocaleString('tr-TR')} satır, {exportFormat.toUpperCase()} formatı.
              </div>
              <div className="flex justify-end">
                <Button disabled={busy || !table || !exportColumns.length} onClick={() => void runExport()}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Dosyayı oluştur
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>,
    document.body
  );
}
