'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Columns3,
  Database,
  KeyRound,
  Link2,
  Loader2,
  Maximize2,
  Move,
  RefreshCw,
  RotateCcw,
  Table2,
  Unlink,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { DatabaseCatalogItem, TableForeignKeyDefinition, TableInfo } from 'types';
import { fetchTableInfo, mutateTableSchema } from '@/lib/databaseApi';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/app-state';

interface DatabaseSchemaGraphProps {
  serverId: string;
  databaseName: string;
  accountId?: string | null;
  catalog: DatabaseCatalogItem[];
  onOpenTable?: (tableName: string) => void;
  onCatalogRefresh?: () => void | Promise<void>;
}

type Point = { x: number; y: number };
type ColumnEndpoint = { table: string; column: string };
type DragState = { table: string; pointerId: number; offsetX: number; offsetY: number };

interface GraphEdge {
  id: string;
  name: string;
  source: ColumnEndpoint;
  target: ColumnEndpoint;
  onDelete: string;
  onUpdate: string;
}

const CARD_WIDTH = 268;
const HEADER_HEIGHT = 38;
const ROW_HEIGHT = 25;
const NODE_GAP_X = 86;
const NODE_GAP_Y = 76;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.8;
const MAX_TABLES = 80;
const FK_RULES: Array<NonNullable<TableForeignKeyDefinition['onDelete']>> = ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'];

function storageKey(serverId: string, databaseName: string) {
  return `coreor:schema-graph:${serverId}:${databaseName}:v1`;
}

function defaultPositions(tableNames: string[]) {
  const columns = Math.max(2, Math.ceil(Math.sqrt(tableNames.length)));
  return Object.fromEntries(tableNames.map((table, index) => [table, {
    x: 60 + (index % columns) * (CARD_WIDTH + NODE_GAP_X),
    y: 60 + Math.floor(index / columns) * (260 + NODE_GAP_Y)
  }]));
}

function loadPositions(serverId: string, databaseName: string, tableNames: string[]) {
  if (typeof window === 'undefined') return defaultPositions(tableNames);
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey(serverId, databaseName)) || '{}') as Record<string, Point>;
    const defaults = defaultPositions(tableNames);
    return Object.fromEntries(tableNames.map(table => [table, stored[table] && Number.isFinite(stored[table].x) && Number.isFinite(stored[table].y) ? stored[table] : defaults[table]]));
  } catch {
    return defaultPositions(tableNames);
  }
}

function persistPositions(serverId: string, databaseName: string, positions: Record<string, Point>) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(storageKey(serverId, databaseName), JSON.stringify(positions)); } catch { /* layout persistence must not stop graph usage */ }
}

function typeTone(type: string) {
  const value = type.toUpperCase();
  if (/\b(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|BIT|YEAR)\b/.test(value)) return 'text-blue-400';
  if (/\b(DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL)\b/.test(value)) return 'text-sky-300';
  if (/\b(BOOL|BOOLEAN)\b/.test(value)) return 'text-purple-400';
  if (/\b(DATE|DATETIME|TIMESTAMP|TIME)\b/.test(value)) return 'text-rose-300';
  if (/\b(JSON|BLOB|LONGBLOB|MEDIUMBLOB|TINYBLOB|VARBINARY|BINARY)\b/.test(value)) return 'text-amber-300';
  if (/\b(CHAR|VARCHAR|TEXT|TINYTEXT|MEDIUMTEXT|LONGTEXT|ENUM|SET)\b/.test(value)) return 'text-emerald-300';
  if (/\b(GEOMETRY|POINT|LINESTRING|POLYGON|MULTI)\b/.test(value)) return 'text-fuchsia-300';
  return 'text-zinc-400';
}

function endpointY(info: TableInfo | undefined, column: string) {
  const index = Math.max(0, info?.columns.findIndex(item => item.Field === column) ?? 0);
  return HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

function buildEdges(tableInfo: Record<string, TableInfo>) {
  const edges: GraphEdge[] = [];
  for (const [tableName, info] of Object.entries(tableInfo)) {
    const groups = new Map<string, typeof info.foreignKeys>();
    for (const foreignKey of info.foreignKeys) {
      groups.set(foreignKey.CONSTRAINT_NAME, [...(groups.get(foreignKey.CONSTRAINT_NAME) || []), foreignKey]);
    }
    for (const [name, rows] of groups) {
      const ordered = [...rows].sort((left, right) => left.ORDINAL_POSITION - right.ORDINAL_POSITION);
      ordered.forEach((row, index) => edges.push({
        id: `${tableName}:${name}:${index}`,
        name,
        source: { table: tableName, column: row.COLUMN_NAME },
        target: { table: row.REFERENCED_TABLE_NAME, column: row.REFERENCED_COLUMN_NAME },
        onDelete: row.DELETE_RULE,
        onUpdate: row.UPDATE_RULE
      }));
    }
  }
  return edges;
}

async function loadWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: Array<{ item: T; result?: R; error?: unknown }> = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = { item: items[index], result: await worker(items[index]) }; }
      catch (error) { results[index] = { item: items[index], error }; }
    }
  });
  await Promise.all(runners);
  return results;
}

export function DatabaseSchemaGraph({
  serverId,
  databaseName,
  accountId,
  catalog,
  onOpenTable,
  onCatalogRefresh
}: DatabaseSchemaGraphProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const database = catalog.find(item => item.name === databaseName) || null;
  const tableNames = useMemo(() => (database?.tables || []).slice(0, MAX_TABLES), [database]);
  const [tableInfo, setTableInfo] = useState<Record<string, TableInfo>>({});
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [zoom, setZoom] = useState(0.9);
  const [loading, setLoading] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [source, setSource] = useState<ColumnEndpoint | null>(null);
  const [target, setTarget] = useState<ColumnEndpoint | null>(null);
  const [constraintName, setConstraintName] = useState('');
  const [onDelete, setOnDelete] = useState<NonNullable<TableForeignKeyDefinition['onDelete']>>('RESTRICT');
  const [onUpdate, setOnUpdate] = useState<NonNullable<TableForeignKeyDefinition['onUpdate']>>('RESTRICT');
  const [savingLink, setSavingLink] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);

  const edges = useMemo(() => buildEdges(tableInfo), [tableInfo]);
  const canvasSize = useMemo(() => {
    const points = Object.values(positions);
    return {
      width: Math.max(1600, ...points.map(point => point.x + CARD_WIDTH + 140)),
      height: Math.max(900, ...points.map(point => point.y + 430))
    };
  }, [positions]);

  const load = async () => {
    if (!accountId || !database || loading) return;
    setLoading(true); setError(null); setMessage(null); setLoadedCount(0);
    setPositions(loadPositions(serverId, databaseName, tableNames));
    const nextInfo: Record<string, TableInfo> = {};
    try {
      const results = await loadWithConcurrency(tableNames, 4, async tableName => {
        const info = await fetchTableInfo(serverId, databaseName, tableName, accountId);
        setLoadedCount(previous => previous + 1);
        return info;
      });
      const failures: string[] = [];
      for (const entry of results) {
        if (entry.result) nextInfo[String(entry.item)] = entry.result;
        else failures.push(String(entry.item));
      }
      setTableInfo(nextInfo);
      if (failures.length) setMessage(`${Object.keys(nextInfo).length} tablo yüklendi; ${failures.length} tablo için yapı bilgisi alınamadı.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Şema grafiği yüklenemedi.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [serverId, databaseName, accountId]);
  useEffect(() => { if (Object.keys(positions).length) persistPositions(serverId, databaseName, positions); }, [positions, serverId, databaseName]);

  const beginDrag = (event: React.PointerEvent, table: string) => {
    if ((event.target as HTMLElement).closest('[data-column-button="true"]')) return;
    const point = positions[table] || { x: 0, y: 0 };
    const viewport = viewportRef.current?.getBoundingClientRect();
    if (!viewport) return;
    const logicalX = (event.clientX - viewport.left + (viewportRef.current?.scrollLeft || 0)) / zoom;
    const logicalY = (event.clientY - viewport.top + (viewportRef.current?.scrollTop || 0)) / zoom;
    setDrag({ table, pointerId: event.pointerId, offsetX: logicalX - point.x, offsetY: logicalY - point.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const viewport = viewportRef.current?.getBoundingClientRect();
    if (!viewport) return;
    const logicalX = (event.clientX - viewport.left + (viewportRef.current?.scrollLeft || 0)) / zoom;
    const logicalY = (event.clientY - viewport.top + (viewportRef.current?.scrollTop || 0)) / zoom;
    setPositions(previous => ({ ...previous, [drag.table]: { x: Math.max(10, logicalX - drag.offsetX), y: Math.max(10, logicalY - drag.offsetY) } }));
  };

  const finishDrag = (event: React.PointerEvent) => {
    if (drag && event.pointerId === drag.pointerId) setDrag(null);
  };

  const chooseColumn = (table: string, column: string) => {
    if (!source || (source.table === table && source.column === column)) {
      setSource(source ? null : { table, column });
      setTarget(null); setSelectedEdge(null);
      return;
    }
    setTarget({ table, column });
    const base = `fk_${source.table}_${source.column}_${table}_${column}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60);
    setConstraintName(base);
  };

  const createForeignKey = async () => {
    if (!accountId || !source || !target || savingLink || source.table === target.table) return;
    setSavingLink(true); setError(null); setMessage(null);
    try {
      await mutateTableSchema(serverId, {
        database: databaseName,
        table: source.table,
        mutation: {
          kind: 'add-foreign-key',
          foreignKey: {
            name: constraintName.trim(),
            columns: [source.column],
            referencedDatabase: databaseName,
            referencedTable: target.table,
            referencedColumns: [target.column],
            onDelete,
            onUpdate
          }
        }
      }, accountId);
      const refreshed = await fetchTableInfo(serverId, databaseName, source.table, accountId);
      setTableInfo(previous => ({ ...previous, [source.table]: refreshed }));
      await onCatalogRefresh?.();
      setMessage(`${constraintName} foreign key bağlantısı oluşturuldu.`);
      setSource(null); setTarget(null); setConstraintName('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Foreign key bağlantısı oluşturulamadı.');
    } finally { setSavingLink(false); }
  };

  const removeSelectedEdge = async () => {
    if (!selectedEdge || !accountId || !window.confirm(`${selectedEdge.name} foreign key bağlantısı kaldırılsın mı?`)) return;
    setSavingLink(true); setError(null);
    try {
      await mutateTableSchema(serverId, {
        database: databaseName,
        table: selectedEdge.source.table,
        mutation: { kind: 'drop-foreign-key', constraintName: selectedEdge.name }
      }, accountId);
      const refreshed = await fetchTableInfo(serverId, databaseName, selectedEdge.source.table, accountId);
      setTableInfo(previous => ({ ...previous, [selectedEdge.source.table]: refreshed }));
      setSelectedEdge(null); setMessage('Foreign key bağlantısı kaldırıldı.');
      await onCatalogRefresh?.();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Foreign key kaldırılamadı.'); }
    finally { setSavingLink(false); }
  };

  const resetLayout = () => {
    const next = defaultPositions(tableNames);
    setPositions(next); persistPositions(serverId, databaseName, next);
  };

  const fit = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const scaleX = (viewport.clientWidth - 40) / canvasSize.width;
    const scaleY = (viewport.clientHeight - 40) / canvasSize.height;
    setZoom(Math.max(MIN_ZOOM, Math.min(1, scaleX, scaleY)));
    viewport.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  };

  if (!database) return <EmptyState icon={Database} title="Veritabanı seçilmedi" description="ER diyagramını görmek için bir veritabanı seçin." />;
  if (!tableNames.length) return <EmptyState icon={Table2} title="Tablo bulunamadı" description="Bu veritabanında şemaya eklenecek tablo yok." />;
  if (loading && !Object.keys(tableInfo).length) return <LoadingState title="ER şeması hazırlanıyor" description={`${loadedCount}/${tableNames.length} tablo yapısı okunuyor.`} />;
  if (error && !Object.keys(tableInfo).length) return <ErrorState title="Şema grafiği yüklenemedi" description={error} actionLabel="Tekrar dene" onAction={load} />;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#07090b]">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-1.5 border-b border-zinc-800 bg-zinc-950/95 px-2 py-1">
        <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Yenile</Button>
        <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={resetLayout}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Otomatik yerleşim</Button>
        <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={fit}><Maximize2 className="mr-1.5 h-3.5 w-3.5" /> Sığdır</Button>
        <div className="mx-1 h-5 w-px bg-zinc-800" />
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(previous => Math.max(MIN_ZOOM, previous - 0.1))}><ZoomOut className="h-3.5 w-3.5" /></Button>
        <span className="w-12 text-center text-[10px] tabular-nums text-zinc-500">%{Math.round(zoom * 100)}</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(previous => Math.min(MAX_ZOOM, previous + 0.1))}><ZoomIn className="h-3.5 w-3.5" /></Button>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-zinc-600"><Move className="h-3.5 w-3.5" /> Tabloları sürükleyin • Bağlamak için iki kolon seçin</div>
      </div>

      {(error || message || tableNames.length < (database.tables || []).length) && (
        <div className={`shrink-0 border-b px-3 py-1.5 text-[10px] ${error ? 'border-red-500/20 bg-red-500/10 text-red-300' : 'border-amber-500/20 bg-amber-500/[0.08] text-amber-200'}`}>
          {error || message || `Performans için ilk ${MAX_TABLES} tablo gösteriliyor.`}
        </div>
      )}

      {(source || selectedEdge) && (
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-[10px]">
          {selectedEdge ? <>
            <Link2 className="h-4 w-4 text-cyan-400" /><span className="font-medium text-zinc-200">{selectedEdge.name}</span><span className="text-zinc-500">{selectedEdge.source.table}.{selectedEdge.source.column} → {selectedEdge.target.table}.{selectedEdge.target.column}</span><span className="rounded bg-zinc-900 px-2 py-1 text-zinc-500">DELETE {selectedEdge.onDelete}</span><span className="rounded bg-zinc-900 px-2 py-1 text-zinc-500">UPDATE {selectedEdge.onUpdate}</span><Button size="sm" variant="ghost" className="ml-auto h-7 text-[10px] text-red-400" disabled={savingLink} onClick={() => void removeSelectedEdge()}><Unlink className="mr-1.5 h-3.5 w-3.5" /> Bağlantıyı kaldır</Button>
          </> : <>
            <Link2 className="h-4 w-4 text-cyan-400" /><span className="rounded bg-cyan-500/10 px-2 py-1 text-cyan-200">{source?.table}.{source?.column}</span><span className="text-zinc-600">→</span>{target ? <span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-200">{target.table}.{target.column}</span> : <span className="text-zinc-500">Hedef kolonu seçin</span>}
            {target && <><input value={constraintName} onChange={event => setConstraintName(event.target.value)} className="h-7 w-60 rounded border border-zinc-800 bg-zinc-950 px-2 text-[10px] text-zinc-200" placeholder="Constraint adı" /><select value={onDelete} onChange={event => setOnDelete(event.target.value as typeof onDelete)} className="h-7 rounded border border-zinc-800 bg-zinc-950 px-2 text-[10px]"><option disabled>ON DELETE</option>{FK_RULES.map(rule => <option key={rule}>{rule}</option>)}</select><select value={onUpdate} onChange={event => setOnUpdate(event.target.value as typeof onUpdate)} className="h-7 rounded border border-zinc-800 bg-zinc-950 px-2 text-[10px]"><option disabled>ON UPDATE</option>{FK_RULES.map(rule => <option key={rule}>{rule}</option>)}</select><Button size="sm" className="h-7 text-[10px]" disabled={!constraintName.trim() || savingLink || source?.table === target.table} onClick={() => void createForeignKey()}>{savingLink ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />} Bağlantıyı oluştur</Button></>}
            <Button size="sm" variant="ghost" className="ml-auto h-7 text-[10px]" onClick={() => { setSource(null); setTarget(null); }}>İptal</Button>
          </>}
        </div>
      )}

      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_1px_1px,rgba(113,113,122,.18)_1px,transparent_0)] bg-[size:24px_24px]" onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
        <div className="relative origin-top-left" style={{ width: canvasSize.width, height: canvasSize.height, transform: `scale(${zoom})` }}>
          <svg className="pointer-events-none absolute inset-0 z-0 overflow-visible" width={canvasSize.width} height={canvasSize.height}>
            <defs><marker id="coreor-schema-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="rgba(34,211,238,.75)" /></marker></defs>
            {edges.map(edge => {
              const sourcePosition = positions[edge.source.table];
              const targetPosition = positions[edge.target.table];
              if (!sourcePosition || !targetPosition || !tableInfo[edge.target.table]) return null;
              const sourceX = sourcePosition.x + CARD_WIDTH;
              const sourceY = sourcePosition.y + endpointY(tableInfo[edge.source.table], edge.source.column);
              const targetX = targetPosition.x;
              const targetY = targetPosition.y + endpointY(tableInfo[edge.target.table], edge.target.column);
              const bend = Math.max(80, Math.abs(targetX - sourceX) * 0.45);
              const path = `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}`;
              const active = selectedEdge?.id === edge.id;
              return <path key={edge.id} d={path} fill="none" stroke={active ? 'rgba(250,204,21,.95)' : 'rgba(34,211,238,.48)'} strokeWidth={active ? 3 : 1.5} markerEnd="url(#coreor-schema-arrow)" className="pointer-events-auto cursor-pointer" onClick={() => { setSelectedEdge(edge); setSource(null); setTarget(null); }} />;
            })}
          </svg>

          {Object.entries(tableInfo).map(([tableName, info]) => {
            const position = positions[tableName] || { x: 0, y: 0 };
            const primaryColumns = new Set(info.indexes.filter(index => index.Key_name === 'PRIMARY').map(index => index.Column_name));
            const uniqueColumns = new Set(info.indexes.filter(index => index.Non_unique === '0' && index.Key_name !== 'PRIMARY').map(index => index.Column_name));
            const foreignColumns = new Set(info.foreignKeys.map(item => item.COLUMN_NAME));
            return (
              <section key={tableName} className={`absolute z-10 overflow-hidden rounded-xl border bg-zinc-950/96 shadow-xl backdrop-blur ${drag?.table === tableName ? 'border-cyan-400 shadow-cyan-950/50' : 'border-zinc-700/90'}`} style={{ left: position.x, top: position.y, width: CARD_WIDTH }} onPointerDown={event => beginDrag(event, tableName)} onDoubleClick={() => onOpenTable?.(tableName)}>
                <header className="flex h-[38px] cursor-grab items-center gap-2 border-b border-zinc-800 bg-zinc-900/95 px-2 active:cursor-grabbing"><Table2 className="h-3.5 w-3.5 text-cyan-400" /><span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-zinc-100">{tableName}</span><span className="rounded bg-black/30 px-1.5 py-0.5 text-[8px] uppercase text-zinc-500">{info.table.engine || 'table'}</span></header>
                <div>{info.columns.map(column => {
                  const endpoint: ColumnEndpoint = { table: tableName, column: column.Field };
                  const isSource = source?.table === tableName && source.column === column.Field;
                  const isTarget = target?.table === tableName && target.column === column.Field;
                  const isKey = primaryColumns.has(column.Field);
                  return <button data-column-button="true" key={column.Field} type="button" onClick={() => chooseColumn(tableName, column.Field)} className={`flex h-[25px] w-full items-center gap-1.5 border-b border-zinc-900 px-2 text-left text-[9px] hover:bg-cyan-500/[0.08] ${isSource ? 'bg-cyan-500/15' : isTarget ? 'bg-emerald-500/15' : ''}`} title={`${column.Field} • ${column.Type}`}>
                    {isKey ? <KeyRound className="h-3 w-3 shrink-0 text-amber-400" /> : foreignColumns.has(column.Field) ? <Link2 className="h-3 w-3 shrink-0 text-cyan-400" /> : uniqueColumns.has(column.Field) ? <Columns3 className="h-3 w-3 shrink-0 text-red-300" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-700" />}
                    <span className={`min-w-0 flex-1 truncate ${isKey ? 'font-semibold text-amber-100' : 'text-zinc-300'}`}>{column.Field}</span><span className={`max-w-[110px] truncate font-mono text-[8px] ${typeTone(column.Type)}`}>{column.Type.toUpperCase()}</span>{column.Null === 'YES' && <span className="text-[7px] text-zinc-700">N</span>}
                  </button>;
                })}</div>
                {info.table.comment && <footer className="truncate border-t border-zinc-800 bg-black/20 px-2 py-1.5 text-[8px] text-zinc-600" title={info.table.comment}>{info.table.comment}</footer>}
              </section>
            );
          })}

          {source && target && source.table === target.table && <div className="absolute left-4 top-4 z-30 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/90 px-3 py-2 text-[10px] text-amber-200"><AlertTriangle className="h-4 w-4" /> Aynı tablo içi self-reference için hedef tablo farklı olmalıdır.</div>}
        </div>
      </div>
    </div>
  );
}
