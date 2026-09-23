'use client';
import { useTrackedBusy } from '@/lib/useUpdateActivity';

import { useModalEscape } from '@/lib/useModalEscape';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, BarChart2, BookOpen, Code, Copy, Download, FileText, Loader2, Play, Plus, Save, Trash2, X } from 'lucide-react';
import type { DatabaseCatalogItem, QueryExecutionResult } from 'types';
import { executeDatabaseQuery } from '@/lib/databaseApi';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CoreorConfirmModal, type CoreorConfirmation } from '@/components/ui/coreor-confirm-modal';
import { useAppContextMenu } from '@/components/app-context-menu';
import { migrateLegacyWorkspaceCollection, readWorkspaceCollection, writeWorkspaceCollection } from '@/lib/nativeWorkspaceStore';
import { useLanguage } from '@/context/LanguageContext';
import { translateRuntime } from '@/lib/i18nRuntime';

interface SqlNotebookModalProps {
  open: boolean;
  onClose: () => void;
  serverId: string | null;
  accountId?: string | null;
  databases: DatabaseCatalogItem[];
  selectedDatabase?: string | null;
}

type NotebookCellType = 'sql' | 'markdown';
type NotebookChartType = 'none' | 'bar' | 'line' | 'pie';

interface NotebookChartConfig {
  type: NotebookChartType;
  categoryColumn: string;
  valueColumn: string;
}

interface NotebookCell {
  id: string;
  type: NotebookCellType;
  content: string;
  chart: NotebookChartConfig;
  result?: QueryExecutionResult | null;
  error?: string | null;
  isRunning?: boolean;
  executedAt?: string | null;
}

interface NotebookDocument {
  id: string;
  title: string;
  databaseName: string | null;
  cells: NotebookCell[];
  createdAt: string;
  updatedAt: string;
}

const MAX_STORED_ROWS = 200;
const MAX_DOCUMENTS = 20;
const DEFAULT_SQL = 'SELECT *\nFROM `table_name`\nLIMIT 100;';

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function storageKey(serverId: string | null) {
  return `coreor:sql-notebooks:${serverId || 'no-server'}:v1`;
}

function createCell(type: NotebookCellType): NotebookCell {
  return {
    id: createId('cell'),
    type,
    content: type === 'sql' ? DEFAULT_SQL : translateRuntime('notebookExtra.defaultMarkdown'),
    chart: { type: 'none', categoryColumn: '', valueColumn: '' },
    result: null,
    error: null,
    executedAt: null
  };
}

function createDocument(databaseName?: string | null): NotebookDocument {
  const now = new Date().toISOString();
  return {
    id: createId('notebook'),
    title: translateRuntime('notebookExtra.newNotebook'),
    databaseName: databaseName || null,
    cells: [createCell('markdown'), createCell('sql')],
    createdAt: now,
    updatedAt: now
  };
}

function serializableDocuments(documents: NotebookDocument[]) {
  return documents.slice(0, MAX_DOCUMENTS).map(document => ({
    ...document,
    cells: document.cells.map(cell => ({
      ...cell,
      isRunning: false,
      result: cell.result ? { ...cell.result, rows: cell.result.rows.slice(0, MAX_STORED_ROWS) } : null
    }))
  }));
}

function normalizeDocuments(documents: NotebookDocument[], selectedDatabase?: string | null) {
  if (!Array.isArray(documents) || !documents.length) return [createDocument(selectedDatabase)];
  return documents.slice(0, MAX_DOCUMENTS).map(document => ({
    ...document,
    cells: Array.isArray(document.cells) && document.cells.length ? document.cells.map(cell => ({
      ...cell,
      chart: cell.chart || { type: 'none', categoryColumn: '', valueColumn: '' },
      isRunning: false
    })) : [createCell('sql')]
  }));
}

function valueText(value: unknown) {
  if (value === null) return '(NULL)';
  if (value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return <>{parts.map((part, index) => part.startsWith('`') && part.endsWith('`') ? <code key={index} className="rounded bg-black/40 px-1 py-0.5 font-mono text-cyan-200">{part.slice(1, -1)}</code> : part.startsWith('**') && part.endsWith('**') ? <strong key={index} className="font-semibold text-zinc-100">{part.slice(2, -2)}</strong> : <React.Fragment key={index}>{part}</React.Fragment>)}</>;
}

function MarkdownPreview({ source }: { source: string }) {
  const lines = source.replace(/\r/g, '').split('\n');
  let inCode = false;
  const codeLines: string[] = [];
  const elements: React.ReactNode[] = [];
  lines.forEach((line, index) => {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        elements.push(<pre key={`code-${index}`} className="my-2 overflow-x-auto rounded-lg border border-zinc-800 bg-black/40 p-3 font-mono text-[11px] leading-5 text-cyan-100">{codeLines.join('\n')}</pre>);
        codeLines.length = 0;
      }
      inCode = !inCode;
      return;
    }
    if (inCode) { codeLines.push(line); return; }
    if (/^###\s+/.test(line)) elements.push(<h3 key={index} className="mb-1 mt-4 text-sm font-semibold"><InlineMarkdown text={line.replace(/^###\s+/, '')} /></h3>);
    else if (/^##\s+/.test(line)) elements.push(<h2 key={index} className="mb-1 mt-4 text-base font-semibold"><InlineMarkdown text={line.replace(/^##\s+/, '')} /></h2>);
    else if (/^#\s+/.test(line)) elements.push(<h1 key={index} className="mb-2 mt-2 text-xl font-semibold"><InlineMarkdown text={line.replace(/^#\s+/, '')} /></h1>);
    else if (/^[-*]\s+/.test(line)) elements.push(<div key={index} className="flex gap-2 py-0.5 text-xs leading-5 text-zinc-300"><span className="text-cyan-400">•</span><span><InlineMarkdown text={line.replace(/^[-*]\s+/, '')} /></span></div>);
    else if (/^>\s+/.test(line)) elements.push(<blockquote key={index} className="my-2 border-l-2 border-cyan-500/50 pl-3 text-xs italic leading-5 text-zinc-400"><InlineMarkdown text={line.replace(/^>\s+/, '')} /></blockquote>);
    else if (!line.trim()) elements.push(<div key={index} className="h-2" />);
    else elements.push(<p key={index} className="text-xs leading-5 text-zinc-300"><InlineMarkdown text={line} /></p>);
  });
  if (codeLines.length) elements.push(<pre key="code-final" className="my-2 overflow-x-auto rounded-lg border border-zinc-800 bg-black/40 p-3 font-mono text-[11px] leading-5 text-cyan-100">{codeLines.join('\n')}</pre>);
  return <div className="min-h-24 p-4">{elements}</div>;
}

function ChartPreview({ rows, config }: { rows: Record<string, unknown>[]; config: NotebookChartConfig }) {
  const chartRows = rows.slice(0, 20).map(row => ({ label: valueText(row[config.categoryColumn]), value: Number(row[config.valueColumn]) })).filter(item => Number.isFinite(item.value));
  if (config.type === 'none') return null;
  if (!config.categoryColumn || !config.valueColumn || !chartRows.length) return <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-600">Grafik için kategori ve sayısal değer kolonu seçin.</div>;
  const max = Math.max(1, ...chartRows.map(item => Math.abs(item.value)));
  if (config.type === 'bar') return <div className="space-y-2 rounded-lg border border-zinc-800 bg-black/20 p-3">{chartRows.map((item, index) => <div key={`${item.label}-${index}`} className="grid grid-cols-[minmax(90px,0.8fr)_minmax(160px,2fr)_80px] items-center gap-2 text-[10px]"><span className="truncate text-zinc-400" title={item.label}>{item.label}</span><div className="h-4 overflow-hidden rounded bg-zinc-900"><div className="h-full rounded bg-cyan-500/70" style={{ width: `${Math.abs(item.value) / max * 100}%` }} /></div><span className="text-right tabular-nums text-zinc-300">{item.value.toLocaleString('tr-TR')}</span></div>)}</div>;
  if (config.type === 'line') {
    const width = 800; const height = 220; const min = Math.min(...chartRows.map(item => item.value)); const span = Math.max(1, max - min);
    const points = chartRows.map((item, index) => `${index / Math.max(1, chartRows.length - 1) * width},${height - ((item.value - min) / span * (height - 30) + 15)}`).join(' ');
    return <div className="rounded-lg border border-zinc-800 bg-black/20 p-3"><svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full" preserveAspectRatio="none"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" className="text-cyan-400" /></svg><div className="mt-2 flex justify-between gap-2 text-[9px] text-zinc-600">{chartRows.map((item, index) => <span key={index} className="max-w-20 truncate">{item.label}</span>)}</div></div>;
  }
  const total = chartRows.reduce((sum, item) => sum + Math.abs(item.value), 0) || 1;
  const colors = ['#22d3ee', '#34d399', '#a78bfa', '#fbbf24', '#fb7185', '#60a5fa', '#f472b6', '#a3e635'];
  const segments = chartRows.map((item, index) => {
    const start = chartRows.slice(0, index).reduce((sum, previous) => sum + Math.abs(previous.value), 0) / total * 100;
    const end = start + Math.abs(item.value) / total * 100;
    return `${colors[index % colors.length]} ${start}% ${end}%`;
  });
  return <div className="grid gap-4 rounded-lg border border-zinc-800 bg-black/20 p-4 md:grid-cols-[220px_1fr]"><div className="mx-auto h-52 w-52 rounded-full" style={{ background: `conic-gradient(${segments.join(',')})` }} /><div className="grid content-center gap-2 sm:grid-cols-2">{chartRows.map((item, index) => <div key={index} className="flex items-center gap-2 text-[10px]"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="min-w-0 flex-1 truncate text-zinc-400">{item.label}</span><span className="tabular-nums text-zinc-200">{item.value.toLocaleString('tr-TR')}</span></div>)}</div></div>;
}

export function SqlNotebookModal({ open, onClose, serverId, accountId, databases, selectedDatabase }: SqlNotebookModalProps) {
  const { t } = useLanguage();
  const { openContextMenu } = useAppContextMenu();
  const [documents, setDocuments] = useState<NotebookDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [runningAll, setRunningAll] = useTrackedBusy();
  const [confirmation, setConfirmation] = useState<CoreorConfirmation | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  useModalEscape(open, onClose, runningAll);
  const activeDocument = documents.find(document => document.id === activeDocumentId) || documents[0] || null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      const scope = serverId || 'no-server';
      await migrateLegacyWorkspaceCollection('sql-notebooks', scope, storageKey(serverId), 'local');
      const stored = await readWorkspaceCollection<NotebookDocument>('sql-notebooks', scope);
      const next = normalizeDocuments(stored, selectedDatabase);
      if (!cancelled) {
        setDocuments(next);
        setActiveDocumentId(next[0]?.id || null);
        setLoaded(true);
      }
    })().catch(() => {
      if (cancelled) return;
      const next = [createDocument(selectedDatabase)];
      setDocuments(next);
      setActiveDocumentId(next[0]?.id || null);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [open, serverId, selectedDatabase]);

  useEffect(() => {
    if (!loaded || !open) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void writeWorkspaceCollection('sql-notebooks', serverId || 'no-server', serializableDocuments(documents));
    }, 750);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [documents, loaded, open, serverId]);

  const updateDocument = (patch: Partial<NotebookDocument> | ((document: NotebookDocument) => NotebookDocument)) => {
    if (!activeDocument) return;
    setDocuments(previous => previous.map(document => document.id !== activeDocument.id ? document : typeof patch === 'function' ? patch(document) : { ...document, ...patch, updatedAt: new Date().toISOString() }));
  };

  const updateCell = (cellId: string, patch: Partial<NotebookCell>) => updateDocument(document => ({ ...document, updatedAt: new Date().toISOString(), cells: document.cells.map(cell => cell.id === cellId ? { ...cell, ...patch } : cell) }));
  const addCell = (type: NotebookCellType) => updateDocument(document => ({ ...document, updatedAt: new Date().toISOString(), cells: [...document.cells, createCell(type)] }));
  const removeCell = (cellId: string) => updateDocument(document => ({ ...document, updatedAt: new Date().toISOString(), cells: document.cells.length <= 1 ? document.cells : document.cells.filter(cell => cell.id !== cellId) }));
  const moveCell = (cellId: string, direction: -1 | 1) => updateDocument(document => { const index = document.cells.findIndex(cell => cell.id === cellId); const target = index + direction; if (index < 0 || target < 0 || target >= document.cells.length) return document; const cells = [...document.cells]; [cells[index], cells[target]] = [cells[target], cells[index]]; return { ...document, updatedAt: new Date().toISOString(), cells }; });

  const duplicateCell = (cellId: string) => updateDocument(document => {
    const index = document.cells.findIndex(cell => cell.id === cellId);
    if (index < 0) return document;
    const source = document.cells[index];
    const copy: NotebookCell = { ...source, id: createId('cell'), isRunning: false, result: source.result ? { ...source.result, rows: source.result.rows.map(row => ({ ...row })) } : null };
    const cells = [...document.cells];
    cells.splice(index + 1, 0, copy);
    return { ...document, updatedAt: new Date().toISOString(), cells };
  });

  const openCellMenu = (event: React.MouseEvent, cell: NotebookCell, index: number) => openContextMenu(event, [
    { id: 'run', label: t('notebookExtra.runCell'), icon: Play, disabled: cell.type !== 'sql' || !cell.content.trim() || cell.isRunning || !serverId || !accountId, onSelect: () => void runCell(cell.id) },
    { id: 'copy', label: t('notebookExtra.copyCell'), icon: Copy, onSelect: () => navigator.clipboard.writeText(cell.content) },
    { id: 'duplicate', label: t('notebookExtra.duplicateCell'), icon: Copy, onSelect: () => duplicateCell(cell.id) },
    { id: 'sep-move', separator: true },
    { id: 'move-up', label: t('notebookExtra.moveUp'), icon: ArrowUp, disabled: index === 0, onSelect: () => moveCell(cell.id, -1) },
    { id: 'move-down', label: t('notebookExtra.moveDown'), icon: ArrowDown, disabled: !activeDocument || index === activeDocument.cells.length - 1, onSelect: () => moveCell(cell.id, 1) },
    { id: 'convert', label: cell.type === 'sql' ? 'Markdown hücresine dönüştür' : 'SQL hücresine dönüştür', icon: cell.type === 'sql' ? FileText : Code, onSelect: () => updateCell(cell.id, { type: cell.type === 'sql' ? 'markdown' : 'sql', result: null, error: null }) },
    { id: 'clear-result', label: t('notebookExtra.clearResult'), icon: X, disabled: !cell.result && !cell.error, onSelect: () => updateCell(cell.id, { result: null, error: null, executedAt: null }) },
    { id: 'sep-danger', separator: true },
    { id: 'delete', label: t('notebookExtra.deleteCell'), icon: Trash2, danger: true, disabled: !activeDocument || activeDocument.cells.length <= 1, onSelect: () => removeCell(cell.id) }
  ], `Hücre ${index + 1} • ${cell.type.toUpperCase()}`);

  const runCell = async (cellId: string) => {
    if (!activeDocument || !serverId || !accountId) return;
    const cell = activeDocument.cells.find(item => item.id === cellId);
    if (!cell || cell.type !== 'sql' || !cell.content.trim() || cell.isRunning) return;
    updateCell(cellId, { isRunning: true, error: null });
    try {
      const result = await executeDatabaseQuery(serverId, cell.content, accountId, activeDocument.databaseName, { activityOrigin: 'user' });
      const resultColumns = result.fields?.map(field => field.name) || Object.keys(result.rows[0] || {});
      const numericColumn = resultColumns.find(column => result.rows.some(row => Number.isFinite(Number(row[column])))) || '';
      updateCell(cellId, {
        isRunning: false,
        result: { ...result, rows: result.rows.slice(0, MAX_STORED_ROWS) },
        error: null,
        executedAt: new Date().toISOString(),
        chart: cell.chart.valueColumn ? cell.chart : { ...cell.chart, categoryColumn: resultColumns[0] || '', valueColumn: numericColumn }
      });
    } catch (failure) {
      updateCell(cellId, { isRunning: false, result: null, error: failure instanceof Error ? failure.message : 'SQL hücresi çalıştırılamadı.', executedAt: new Date().toISOString() });
    }
  };

  const runAll = async () => {
    if (!activeDocument || runningAll) return;
    setRunningAll(true);
    try {
      for (const cell of activeDocument.cells) if (cell.type === 'sql' && cell.content.trim()) await runCell(cell.id);
    } finally { setRunningAll(false); }
  };

  const newDocument = () => {
    const document = createDocument(selectedDatabase || databases[0]?.name || null);
    setDocuments(previous => [document, ...previous].slice(0, MAX_DOCUMENTS));
    setActiveDocumentId(document.id);
  };

  const deleteDocument = () => {
    if (!activeDocument) return;
    const target = activeDocument;
    setConfirmation({
      title: t('notebookExtra.deleteNotebook'),
      description: `${target.title} ve içinde saklanan hücre/sonuç snapshot'ları bu cihazdan kaldırılacak.`,
      confirmLabel: t('notebookExtra.deleteNotebook'),
      tone: 'danger',
      onConfirm: () => {
        const next = documents.filter(document => document.id !== target.id);
        const fallback = next.length ? next : [createDocument(selectedDatabase)];
        setDocuments(fallback);
        setActiveDocumentId(fallback[0].id);
      }
    });
  };

  const exportDocument = () => {
    if (!activeDocument) return;
    const blob = new Blob([JSON.stringify(serializableDocuments([activeDocument])[0], null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${activeDocument.title.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'sql-notebook'}.json`; anchor.click(); URL.revokeObjectURL(url);
  };

  const importDocument = async (file: File) => {
    setImportError(null);
    try {
      const parsed = JSON.parse(await file.text()) as NotebookDocument;
      if (!parsed || !Array.isArray(parsed.cells) || !parsed.cells.length) throw new Error('Notebook hücreleri bulunamadı.');
      const now = new Date().toISOString();
      const document: NotebookDocument = { ...parsed, id: createId('notebook'), title: `${parsed.title || 'İçe aktarılan notebook'} (kopya)`, createdAt: now, updatedAt: now, cells: parsed.cells.map(cell => ({ ...cell, id: createId('cell'), isRunning: false })) };
      setDocuments(previous => [document, ...previous].slice(0, MAX_DOCUMENTS));
      setActiveDocumentId(document.id);
    } catch (failure) { setImportError(failure instanceof Error ? failure.message : 'Notebook içe aktarılamadı.'); }
  };

  const resultColumns = (cell: NotebookCell) => cell.result?.fields?.map(field => field.name) || Object.keys(cell.result?.rows?.[0] || {});
  if (!open || typeof document === 'undefined') return null;

  return <>{createPortal(<div className="fixed inset-0 z-[329] flex items-center justify-center p-2 sm:p-3"><button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} aria-label="Kapat" /><div className="relative z-10 flex h-[calc(100dvh-16px)] max-h-[940px] w-[calc(100vw-16px)] max-w-[1560px] min-h-0 min-w-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)]">
    <aside className="flex w-[clamp(190px,22vw,270px)] min-w-0 shrink-0 flex-col overflow-hidden border-r border-zinc-800 bg-black/20"><div className="flex h-12 items-center gap-2 border-b border-zinc-800 px-3"><BookOpen className="h-4 w-4 text-purple-400" /><div className="min-w-0 flex-1"><div className="text-xs font-semibold">SQL Notebook</div><div className="text-[9px] text-zinc-600">{documents.length} belge</div></div><Button variant="ghost" size="icon" className="h-7 w-7" onClick={newDocument}><Plus className="h-4 w-4" /></Button></div><div className="coreor-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">{documents.map(document => <button key={document.id} type="button" onClick={() => setActiveDocumentId(document.id)} className={`mb-1 w-full rounded-lg border p-2 text-left ${document.id === activeDocument?.id ? 'border-purple-500/30 bg-purple-500/10' : 'border-zinc-800 bg-black/20 hover:bg-zinc-900'}`}><div className="truncate text-[11px] font-medium text-zinc-200">{document.title}</div><div className="mt-1 flex justify-between text-[9px] text-zinc-600"><span>{document.databaseName || t('query.serverScope')}</span><span>{document.cells.length} hücre</span></div></button>)}</div><div className="border-t border-zinc-800 p-2 text-[9px] leading-4 text-zinc-600">Belgeler ve en fazla {MAX_STORED_ROWS} sonuç satırı bu cihazda saklanır.</div></aside>
    <main className="flex min-w-0 flex-1 flex-col">{activeDocument && <><div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-1.5"><input value={activeDocument.title} onChange={event => updateDocument({ title: event.target.value })} className="h-8 min-w-56 flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 text-xs font-medium outline-none focus:border-purple-500/50" /><select value={activeDocument.databaseName || ''} onChange={event => updateDocument({ databaseName: event.target.value || null })} className="h-8 min-w-44 rounded border border-zinc-800 bg-zinc-950 px-2 text-[10px] text-zinc-300"><option value="">{t('query.serverScope')}</option>{databases.map(database => <option key={database.name}>{database.name}</option>)}</select><Button size="sm" className="h-8 text-[10px]" disabled={runningAll || !serverId || !accountId} onClick={() => void runAll()}>{runningAll ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}Tüm SQL hücrelerini çalıştır</Button><Button variant="ghost" size="icon" className="h-8 w-8" onClick={exportDocument} title="Notebook JSON dışa aktar"><Download className="h-4 w-4" /></Button><label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-zinc-900" title="Notebook JSON içe aktar"><Save className="h-4 w-4" /><input type="file" accept="application/json,.json" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void importDocument(file); }} /></label><Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={deleteDocument}><Trash2 className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X className="h-4 w-4" /></Button></div>{importError && <div className="w-full border-t border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">{importError}</div>}
      <div className="coreor-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#090b0d] p-2 sm:p-4"><div className="mx-auto max-w-6xl space-y-4">{activeDocument.cells.map((cell, index) => { const columns = resultColumns(cell); const numericColumns = columns.filter(column => cell.result?.rows.some(row => Number.isFinite(Number(row[column])))); return <section key={cell.id} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80 shadow-lg"><div className="flex h-9 items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-2" onContextMenu={event => openCellMenu(event, cell, index)}><span className={`flex h-6 items-center gap-1.5 rounded px-2 text-[9px] font-medium uppercase ${cell.type === 'sql' ? 'bg-cyan-500/10 text-cyan-300' : 'bg-purple-500/10 text-purple-300'}`}>{cell.type === 'sql' ? <Code className="h-3 w-3" /> : <FileText className="h-3 w-3" />}{cell.type}</span><span className="text-[9px] text-zinc-600">Hücre {index + 1}</span>{cell.executedAt && <span className="text-[9px] text-zinc-700">• {new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(cell.executedAt))}</span>}<div className="ml-auto flex items-center gap-0.5">{cell.type === 'sql' && <Button variant="ghost" size="sm" className="h-6 px-2 text-[9px]" disabled={cell.isRunning || !cell.content.trim() || !serverId || !accountId} onClick={() => void runCell(cell.id)}>{cell.isRunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}Çalıştır</Button>}<Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={() => moveCell(cell.id, -1)}><ArrowUp className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === activeDocument.cells.length - 1} onClick={() => moveCell(cell.id, 1)}><ArrowDown className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigator.clipboard.writeText(cell.content)}><Copy className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-6 w-6 text-red-400" disabled={activeDocument.cells.length <= 1} onClick={() => removeCell(cell.id)}><Trash2 className="h-3 w-3" /></Button></div></div>
        {cell.type === 'markdown' ? <div className="grid min-h-40 md:grid-cols-2"><textarea value={cell.content} onChange={event => updateCell(cell.id, { content: event.target.value })} className="min-h-40 resize-y border-0 border-r border-zinc-800 bg-black/20 p-4 font-mono text-[11px] leading-5 text-zinc-300 outline-none" spellCheck={false} /><MarkdownPreview source={cell.content} /></div> : <><textarea value={cell.content} onChange={event => updateCell(cell.id, { content: event.target.value, error: null })} className="coreor-sql-editor min-h-36 w-full resize-y border-0 bg-black/20 p-4 font-mono outline-none" spellCheck={false} />{cell.error && <div className="border-t border-red-500/20 bg-red-500/10 p-3 font-mono text-[10px] leading-5 text-red-300">{cell.error}</div>}{cell.result && <div className="border-t border-zinc-800"><div className="flex min-h-9 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-1.5 text-[9px] text-zinc-500"><span>{cell.result.rows.length.toLocaleString('tr-TR')} sonuç satırı</span>{typeof cell.result.affectedRows === 'number' && <span>• {cell.result.affectedRows.toLocaleString('tr-TR')} etkilenen</span>}{cell.result.maximumRows && cell.result.rows.length >= cell.result.maximumRows && <span className="text-amber-400">• sonuç limiti uygulandı</span>}<div className="ml-auto flex items-center gap-1"><BarChart2 className="h-3.5 w-3.5" /><select value={cell.chart.type} onChange={event => updateCell(cell.id, { chart: { ...cell.chart, type: event.target.value as NotebookChartType } })} className="h-6 rounded border border-zinc-800 bg-zinc-950 px-1.5 text-[9px]"><option value="none">Grafik yok</option><option value="bar">{t('notebookExtra.bar')}</option><option value="line">{t('notebookExtra.line')}</option><option value="pie">{t('notebookExtra.pie')}</option></select><select value={cell.chart.categoryColumn} onChange={event => updateCell(cell.id, { chart: { ...cell.chart, categoryColumn: event.target.value } })} className="h-6 max-w-40 rounded border border-zinc-800 bg-zinc-950 px-1.5 text-[9px]"><option value="">{t('notebookExtra.category')}</option>{columns.map(column => <option key={column}>{column}</option>)}</select><select value={cell.chart.valueColumn} onChange={event => updateCell(cell.id, { chart: { ...cell.chart, valueColumn: event.target.value } })} className="h-6 max-w-40 rounded border border-zinc-800 bg-zinc-950 px-1.5 text-[9px]"><option value="">{t('notebookExtra.value')}</option>{numericColumns.map(column => <option key={column}>{column}</option>)}</select></div></div>{cell.result.rows.length > 0 && <div className={columns.length > 6 ? 'coreor-scrollbar overflow-x-auto overflow-y-visible' : 'overflow-visible'}><Table size="sm" scrollContainer={false} className={columns.length > 6 ? 'min-w-[900px]' : 'w-full table-fixed'}><TableHeader><TableRow>{columns.map(column => <TableHead key={column} resizable={false} className="sticky top-0 z-10 border bg-zinc-950 text-[9px]">{column}</TableHead>)}</TableRow></TableHeader><TableBody>{cell.result.rows.slice(0, MAX_STORED_ROWS).map((row, rowIndex) => <TableRow key={rowIndex}>{columns.map(column => <TableCell key={column} className="max-w-96 truncate border font-mono text-[10px]" title={valueText(row[column])}>{valueText(row[column])}</TableCell>)}</TableRow>)}</TableBody></Table></div>}<div className="p-3"><ChartPreview rows={cell.result.rows} config={cell.chart} /></div></div>}</>}</section>; })}
        <div className="flex items-center justify-center gap-2 py-3"><Button variant="outline" size="sm" className="h-8 text-[10px]" onClick={() => addCell('sql')}><Code className="mr-1.5 h-3.5 w-3.5" />SQL hücresi ekle</Button><Button variant="outline" size="sm" className="h-8 text-[10px]" onClick={() => addCell('markdown')}><FileText className="mr-1.5 h-3.5 w-3.5" />Markdown hücresi ekle</Button></div></div></div></>}</main>
  </div></div>, document.body)}
    <CoreorConfirmModal action={confirmation} onClose={() => setConfirmation(null)} />
  </>;
}
