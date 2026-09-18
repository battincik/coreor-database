'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Columns3, Database, Focus, KeyRound, Link2, Loader2, Maximize2,
  Move, RefreshCw, RotateCcw, Table2, Unlink, ZoomIn, ZoomOut
} from 'lucide-react';
import type { DatabaseCatalogItem, TableForeignKeyDefinition, TableInfo } from 'types';
import { fetchTableInfo, mutateTableSchema } from '@/lib/databaseApi';
import { Button } from '@/components/ui/button';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
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
type NodeDrag = { table: string; pointerId: number; offsetX: number; offsetY: number };
type CanvasPan = { pointerId: number; startX: number; startY: number; originX: number; originY: number };

interface GraphEdge {
  id: string;
  name: string;
  source: ColumnEndpoint;
  target: ColumnEndpoint;
  onDelete: string;
  onUpdate: string;
}

const CARD_WIDTH = 278;
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 26;
const NODE_GAP_X = 96;
const NODE_GAP_Y = 84;
const MIN_ZOOM = 0.22;
const MAX_ZOOM = 2.6;
const MAX_TABLES = 100;
const FK_RULES: Array<NonNullable<TableForeignKeyDefinition['onDelete']>> = ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'];
const FK_OPTIONS: SearchSelectOption<NonNullable<TableForeignKeyDefinition['onDelete']>>[] = FK_RULES.map(rule => ({
  value: rule,
  label: rule,
  description: rule === 'CASCADE' ? 'İşlemi bağlı satırlara uygular.' : rule === 'SET NULL' ? 'Bağlı kolon değerini NULL yapar.' : 'Referans bütünlüğünü koruyarak işlemi sınırlar.'
}));

function storageKey(serverId: string, databaseName: string) {
  return `coreor:schema-graph:${serverId}:${databaseName}:v2`;
}

function nodeHeight(info?: TableInfo) {
  return HEADER_HEIGHT + Math.max(1, info?.columns.length || 1) * ROW_HEIGHT + (info?.table.comment ? 28 : 0);
}

function defaultPositions(tableNames: string[]) {
  const columns = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, tableNames.length))));
  return Object.fromEntries(tableNames.map((table, index) => [table, {
    x: 70 + (index % columns) * (CARD_WIDTH + NODE_GAP_X),
    y: 70 + Math.floor(index / columns) * (330 + NODE_GAP_Y)
  }]));
}

function automaticPositions(tableNames: string[], tableInfo: Record<string, TableInfo>, edges: GraphEdge[]) {
  if (!tableNames.length) return {};
  const known = new Set(tableNames);
  const parents = new Map<string, Set<string>>();
  const neighbors = new Map<string, Set<string>>();
  for (const table of tableNames) { parents.set(table, new Set()); neighbors.set(table, new Set()); }
  for (const edge of edges) {
    if (!known.has(edge.source.table) || !known.has(edge.target.table) || edge.source.table === edge.target.table) continue;
    parents.get(edge.source.table)?.add(edge.target.table);
    neighbors.get(edge.source.table)?.add(edge.target.table);
    neighbors.get(edge.target.table)?.add(edge.source.table);
  }

  const rank = new Map<string, number>(tableNames.map(table => [table, 0] as const));
  for (let pass = 0; pass < tableNames.length; pass += 1) {
    let changed = false;
    for (const table of tableNames) {
      const dependencies = parents.get(table);
      if (!dependencies?.size) continue;
      const candidate = Math.min(tableNames.length - 1, Math.max(...[...dependencies].map(parent => (rank.get(parent) || 0) + 1)));
      if (candidate > (rank.get(table) || 0)) { rank.set(table, candidate); changed = true; }
    }
    if (!changed) break;
  }

  const usedRanks = [...new Set([...rank.values()])].sort((a, b) => a - b);
  const compactRank = new Map<number, number>(usedRanks.map((value, index) => [value, index] as const));
  for (const table of tableNames) rank.set(table, compactRank.get(rank.get(table) || 0) || 0);

  const layers = new Map<number, string[]>();
  for (const table of tableNames) {
    const layer = rank.get(table) || 0;
    layers.set(layer, [...(layers.get(layer) || []), table]);
  }

  const order = new Map<string, number>();
  for (const layer of [...layers.keys()].sort((a, b) => a - b)) {
    const items = layers.get(layer) || [];
    items.sort((left, right) => {
      const score = (table: string) => {
        const linked = [...(neighbors.get(table) || [])].filter(item => order.has(item));
        return linked.length ? linked.reduce((sum, item) => sum + (order.get(item) || 0), 0) / linked.length : Number.MAX_SAFE_INTEGER;
      };
      const leftScore = score(left);
      const rightScore = score(right);
      return leftScore !== rightScore ? leftScore - rightScore : left.localeCompare(right);
    });
    items.forEach((table, index) => order.set(table, index));
  }

  const result: Record<string, Point> = {};
  for (const layer of [...layers.keys()].sort((a, b) => a - b)) {
    let y = 72;
    for (const table of layers.get(layer) || []) {
      result[table] = { x: 72 + layer * (CARD_WIDTH + 160), y };
      y += nodeHeight(tableInfo[table]) + 96;
    }
  }

  const isolated = tableNames.filter(table => !(neighbors.get(table)?.size));
  if (isolated.length > 8) {
    const connected = tableNames.filter(table => neighbors.get(table)?.size);
    const connectedMaxX = connected.length ? Math.max(...connected.map(table => result[table]?.x || 72)) : -CARD_WIDTH - 160;
    const startX = connectedMaxX + CARD_WIDTH + 220;
    const rowsPerColumn = Math.max(5, Math.ceil(Math.sqrt(isolated.length)));
    isolated.forEach((table, index) => {
      const column = Math.floor(index / rowsPerColumn);
      const row = index % rowsPerColumn;
      let y = 72;
      for (let i = 0; i < row; i += 1) y += nodeHeight(tableInfo[isolated[column * rowsPerColumn + i]]) + 96;
      result[table] = { x: startX + column * (CARD_WIDTH + 160), y };
    });
  }
  return result;
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
  try { window.localStorage.setItem(storageKey(serverId, databaseName), JSON.stringify(positions)); }
  catch { /* graph stays usable without persistence */ }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function typeTone(type: string) {
  const value = type.toUpperCase();
  if (/\b(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|BIT|YEAR|SERIAL)\b/.test(value)) return 'text-blue-400';
  if (/\b(DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|MONEY)\b/.test(value)) return 'text-sky-300';
  if (/\b(BOOL|BOOLEAN)\b/.test(value)) return 'text-purple-400';
  if (/\b(DATE|DATETIME|DATETIME2|TIMESTAMP|TIMESTAMPTZ|TIME)\b/.test(value)) return 'text-rose-300';
  if (/\b(JSON|JSONB|BLOB|BYTEA|VARBINARY|BINARY)\b/.test(value)) return 'text-amber-300';
  if (/\b(CHAR|NCHAR|VARCHAR|NVARCHAR|TEXT|UUID|XML|ENUM|SET)\b/.test(value)) return 'text-emerald-300';
  if (/\b(GEOMETRY|GEOGRAPHY|POINT|LINESTRING|POLYGON|MULTI)\b/.test(value)) return 'text-fuchsia-300';
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
    for (const foreignKey of info.foreignKeys) groups.set(foreignKey.CONSTRAINT_NAME, [...(groups.get(foreignKey.CONSTRAINT_NAME) || []), foreignKey]);
    for (const [name, rows] of groups) {
      [...rows].sort((left, right) => left.ORDINAL_POSITION - right.ORDINAL_POSITION).forEach((row, index) => edges.push({
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
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = { item: items[index], result: await worker(items[index]) }; }
      catch (error) { results[index] = { item: items[index], error }; }
    }
  }));
  return results;
}

export function DatabaseSchemaGraph({ serverId, databaseName, accountId, catalog, onOpenTable, onCatalogRefresh }: DatabaseSchemaGraphProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<Point>({ x: 32, y: 32 });
  const nodeDragRef = useRef<NodeDrag | null>(null);
  const canvasPanRef = useRef<CanvasPan | null>(null);
  const database = catalog.find(item => item.name === databaseName) || null;
  const tableNames = useMemo(() => (database?.tables || []).slice(0, MAX_TABLES), [database]);
  const [tableInfo, setTableInfo] = useState<Record<string, TableInfo>>({});
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState<Point>({ x: 32, y: 32 });
  const [loading, setLoading] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draggingTable, setDraggingTable] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [source, setSource] = useState<ColumnEndpoint | null>(null);
  const [target, setTarget] = useState<ColumnEndpoint | null>(null);
  const [constraintName, setConstraintName] = useState('');
  const [onDelete, setOnDelete] = useState<NonNullable<TableForeignKeyDefinition['onDelete']>>('RESTRICT');
  const [onUpdate, setOnUpdate] = useState<NonNullable<TableForeignKeyDefinition['onUpdate']>>('RESTRICT');
  const [savingLink, setSavingLink] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);

  const edges = useMemo(() => buildEdges(tableInfo), [tableInfo]);
  const bounds = useMemo(() => {
    const entries = Object.entries(positions);
    if (!entries.length) return { minX: 0, minY: 0, maxX: 1200, maxY: 800, width: 1200, height: 800 };
    const minX = Math.min(...entries.map(([, point]) => point.x));
    const minY = Math.min(...entries.map(([, point]) => point.y));
    const maxX = Math.max(...entries.map(([table, point]) => point.x + CARD_WIDTH));
    const maxY = Math.max(...entries.map(([table, point]) => point.y + nodeHeight(tableInfo[table])));
    return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }, [positions, tableInfo]);
  const canvasSize = useMemo(() => ({ width: Math.max(1800, bounds.maxX + 500), height: Math.max(1100, bounds.maxY + 500) }), [bounds]);

  const updatePan = (next: Point) => { panRef.current = next; setPan(next); };

  const load = async () => {
    if (!accountId || !database || loading) return;
    setLoading(true); setError(null); setMessage(null); setLoadedCount(0);
    setPositions(loadPositions(serverId, databaseName, tableNames));
    const nextInfo: Record<string, TableInfo> = {};
    try {
      const results = await loadWithConcurrency(tableNames, 5, async tableName => {
        const info = await fetchTableInfo(serverId, databaseName, tableName, accountId);
        setLoadedCount(previous => previous + 1);
        return info;
      });
      const failures: string[] = [];
      for (const entry of results) entry.result ? nextInfo[String(entry.item)] = entry.result : failures.push(String(entry.item));
      setTableInfo(nextInfo);
      if (failures.length) setMessage(`${Object.keys(nextInfo).length} tablo yüklendi; ${failures.length} tablo için yapı bilgisi alınamadı.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Şema grafiği yüklenemedi.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [serverId, databaseName, accountId]);
  useEffect(() => { if (Object.keys(positions).length) persistPositions(serverId, databaseName, positions); }, [positions, serverId, databaseName]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - panRef.current.x) / zoom, y: (clientY - rect.top - panRef.current.y) / zoom };
  };

  const beginNodeDrag = (event: React.PointerEvent, table: string) => {
    if ((event.target as HTMLElement).closest('[data-column-button="true"]')) return;
    event.stopPropagation();
    const point = positions[table] || { x: 0, y: 0 };
    const world = screenToWorld(event.clientX, event.clientY);
    nodeDragRef.current = { table, pointerId: event.pointerId, offsetX: world.x - point.x, offsetY: world.y - point.y };
    setDraggingTable(table);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const beginCanvasPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const targetElement = event.target as HTMLElement;
    if (targetElement.closest('[data-schema-node="true"], [data-schema-edge="true"], button, input')) return;
    canvasPanRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: panRef.current.x, originY: panRef.current.y };
    setPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const nodeDrag = nodeDragRef.current;
    if (nodeDrag && event.pointerId === nodeDrag.pointerId) {
      const world = screenToWorld(event.clientX, event.clientY);
      setPositions(previous => ({ ...previous, [nodeDrag.table]: { x: world.x - nodeDrag.offsetX, y: world.y - nodeDrag.offsetY } }));
      return;
    }
    const canvasPan = canvasPanRef.current;
    if (canvasPan && event.pointerId === canvasPan.pointerId) {
      updatePan({ x: canvasPan.originX + event.clientX - canvasPan.startX, y: canvasPan.originY + event.clientY - canvasPan.startY });
    }
  };

  const finishPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (nodeDragRef.current?.pointerId === event.pointerId) { nodeDragRef.current = null; setDraggingTable(null); }
    if (canvasPanRef.current?.pointerId === event.pointerId) { canvasPanRef.current = null; setPanning(false); }
  };

  const zoomAt = (nextZoom: number, clientX?: number, clientY?: number) => {
    const viewport = viewportRef.current;
    if (!viewport) { setZoom(clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)); return; }
    const rect = viewport.getBoundingClientRect();
    const cursorX = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const cursorY = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const worldX = (cursorX - panRef.current.x) / zoom;
    const worldY = (cursorY - panRef.current.y) / zoom;
    const normalizedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setZoom(normalizedZoom);
    updatePan({ x: cursorX - worldX * normalizedZoom, y: cursorY - worldY * normalizedZoom });
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0014);
    zoomAt(zoom * factor, event.clientX, event.clientY);
  };

  const fit = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const padding = 48;
    const nextZoom = clamp(Math.min((viewport.clientWidth - padding * 2) / bounds.width, (viewport.clientHeight - padding * 2) / bounds.height, 1.25), MIN_ZOOM, MAX_ZOOM);
    setZoom(nextZoom);
    updatePan({
      x: (viewport.clientWidth - bounds.width * nextZoom) / 2 - bounds.minX * nextZoom,
      y: (viewport.clientHeight - bounds.height * nextZoom) / 2 - bounds.minY * nextZoom
    });
  };

  const centerSelected = () => {
    const viewport = viewportRef.current;
    const table = source?.table || selectedEdge?.source.table || Object.keys(tableInfo)[0];
    const point = positions[table];
    if (!viewport || !point) return;
    updatePan({ x: viewport.clientWidth / 2 - (point.x + CARD_WIDTH / 2) * zoom, y: viewport.clientHeight / 2 - (point.y + nodeHeight(tableInfo[table]) / 2) * zoom });
  };

  const resetLayout = () => {
    const next = automaticPositions(tableNames, tableInfo, edges);
    setPositions(next);
    persistPositions(serverId, databaseName, next);
    setSelectedEdge(null); setSource(null); setTarget(null);

    const viewport = viewportRef.current;
    const entries = Object.entries(next);
    if (viewport && entries.length) {
      const minX = Math.min(...entries.map(([, point]) => point.x));
      const minY = Math.min(...entries.map(([, point]) => point.y));
      const maxX = Math.max(...entries.map(([table, point]) => point.x + CARD_WIDTH));
      const maxY = Math.max(...entries.map(([table, point]) => point.y + nodeHeight(tableInfo[table])));
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);
      const padding = 56;
      const nextZoom = clamp(Math.min((viewport.clientWidth - padding * 2) / width, (viewport.clientHeight - padding * 2) / height, 1.15), MIN_ZOOM, MAX_ZOOM);
      setZoom(nextZoom);
      updatePan({
        x: (viewport.clientWidth - width * nextZoom) / 2 - minX * nextZoom,
        y: (viewport.clientHeight - height * nextZoom) / 2 - minY * nextZoom
      });
    } else {
      setZoom(0.9); updatePan({ x: 32, y: 32 });
    }
  };

  const chooseColumn = (table: string, column: string) => {
    if (!source || (source.table === table && source.column === column)) {
      setSource(source ? null : { table, column }); setTarget(null); setSelectedEdge(null); return;
    }
    setTarget({ table, column });
    setConstraintName(`fk_${source.table}_${source.column}_${table}_${column}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 60));
  };

  const createForeignKey = async () => {
    if (!accountId || !source || !target || savingLink || source.table === target.table) return;
    setSavingLink(true); setError(null); setMessage(null);
    try {
      await mutateTableSchema(serverId, { database: databaseName, table: source.table, mutation: { kind: 'add-foreign-key', foreignKey: { name: constraintName.trim(), columns: [source.column], referencedDatabase: databaseName, referencedTable: target.table, referencedColumns: [target.column], onDelete, onUpdate } } }, accountId);
      const refreshed = await fetchTableInfo(serverId, databaseName, source.table, accountId);
      setTableInfo(previous => ({ ...previous, [source.table]: refreshed }));
      await onCatalogRefresh?.();
      setMessage(`${constraintName} foreign key bağlantısı oluşturuldu.`);
      setSource(null); setTarget(null); setConstraintName('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Foreign key bağlantısı oluşturulamadı.'); }
    finally { setSavingLink(false); }
  };

  const removeSelectedEdge = async () => {
    if (!selectedEdge || !accountId || !window.confirm(`${selectedEdge.name} foreign key bağlantısı kaldırılsın mı?`)) return;
    setSavingLink(true); setError(null);
    try {
      await mutateTableSchema(serverId, { database: databaseName, table: selectedEdge.source.table, mutation: { kind: 'drop-foreign-key', constraintName: selectedEdge.name } }, accountId);
      const refreshed = await fetchTableInfo(serverId, databaseName, selectedEdge.source.table, accountId);
      setTableInfo(previous => ({ ...previous, [selectedEdge.source.table]: refreshed }));
      setSelectedEdge(null); setMessage('Foreign key bağlantısı kaldırıldı.'); await onCatalogRefresh?.();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Foreign key kaldırılamadı.'); }
    finally { setSavingLink(false); }
  };

  if (!database) return <EmptyState icon={Database} title="Veritabanı seçilmedi" description="ER diyagramını görmek için bir veritabanı seçin." />;
  if (!tableNames.length) return <EmptyState icon={Table2} title="Tablo bulunamadı" description="Bu veritabanında şemaya eklenecek tablo yok." />;
  if (loading && !Object.keys(tableInfo).length) return <LoadingState title="ER şeması hazırlanıyor" description={`${loadedCount}/${tableNames.length} tablo yapısı okunuyor.`} />;
  if (error && !Object.keys(tableInfo).length) return <ErrorState title="Şema grafiği yüklenemedi" description={error} actionLabel="Tekrar dene" onAction={load} />;

  return <div className="flex h-full min-h-0 flex-col bg-[#07090b]">
    <div className="coreor-hide-scrollbar flex min-h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-zinc-800 bg-zinc-950/95 px-2 py-1">
      <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Yenile</Button>
      <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={resetLayout}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Otomatik yerleşim</Button>
      <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={fit}><Maximize2 className="mr-1.5 h-3.5 w-3.5" />Sığdır</Button>
      <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={centerSelected}><Focus className="mr-1.5 h-3.5 w-3.5" />Merkezle</Button>
      <div className="mx-1 h-5 w-px bg-zinc-800" />
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => zoomAt(zoom / 1.15)}><ZoomOut className="h-3.5 w-3.5" /></Button>
      <span className="w-12 text-center text-[10px] tabular-nums text-zinc-500">%{Math.round(zoom * 100)}</span>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => zoomAt(zoom * 1.15)}><ZoomIn className="h-3.5 w-3.5" /></Button>
      <div className="ml-auto flex shrink-0 items-center gap-2 text-[10px] text-zinc-600"><Move className="h-3.5 w-3.5" />Boş alanı sürükle • Tekerlekle zoom • Tabloyu sürükle • İki kolonla FK</div>
    </div>

    {(error || message || tableNames.length < (database.tables || []).length) && <div className={`shrink-0 border-b px-3 py-1.5 text-[10px] ${error ? 'border-red-500/20 bg-red-500/10 text-red-300' : 'border-amber-500/20 bg-amber-500/[0.08] text-amber-200'}`}>{error || message || `Performans için ilk ${MAX_TABLES} tablo gösteriliyor.`}</div>}

    {(source || selectedEdge) && <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-[10px]">{selectedEdge ? <><Link2 className="h-4 w-4 text-cyan-400" /><span className="font-medium">{selectedEdge.name}</span><span className="text-zinc-500">{selectedEdge.source.table}.{selectedEdge.source.column} → {selectedEdge.target.table}.{selectedEdge.target.column}</span><span className="rounded bg-zinc-900 px-2 py-1 text-zinc-500">DELETE {selectedEdge.onDelete}</span><span className="rounded bg-zinc-900 px-2 py-1 text-zinc-500">UPDATE {selectedEdge.onUpdate}</span><Button size="sm" variant="ghost" className="ml-auto h-7 text-[10px] text-red-400" disabled={savingLink} onClick={() => void removeSelectedEdge()}><Unlink className="mr-1.5 h-3.5 w-3.5" />Bağlantıyı kaldır</Button></> : <><Link2 className="h-4 w-4 text-cyan-400" /><span className="rounded bg-cyan-500/10 px-2 py-1 text-cyan-200">{source?.table}.{source?.column}</span><span className="text-zinc-600">→</span>{target ? <span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-200">{target.table}.{target.column}</span> : <span className="text-zinc-500">Hedef kolonu seçin</span>}{target && <><input value={constraintName} onChange={event => setConstraintName(event.target.value)} className="h-8 w-60 rounded-lg border border-zinc-800 bg-zinc-950 px-2 text-[10px]" placeholder="Constraint adı" /><div className="w-44"><SearchSelect value={onDelete} options={FK_OPTIONS} onValueChange={setOnDelete} triggerClassName="h-8 min-h-8 rounded-lg px-2 [&>span]:py-0" showDescriptionInTrigger={false} dropdownMinWidth={440} /></div><div className="w-44"><SearchSelect value={onUpdate} options={FK_OPTIONS} onValueChange={setOnUpdate} triggerClassName="h-8 min-h-8 rounded-lg px-2 [&>span]:py-0" showDescriptionInTrigger={false} dropdownMinWidth={440} /></div><Button size="sm" className="h-8 text-[10px]" disabled={!constraintName.trim() || savingLink || source?.table === target.table} onClick={() => void createForeignKey()}>{savingLink ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}Bağlantıyı oluştur</Button></>}<Button size="sm" variant="ghost" className="ml-auto h-7 text-[10px]" onClick={() => { setSource(null); setTarget(null); }}>İptal</Button></>}</div>}

    <div
      ref={viewportRef}
      className={`coreor-schema-canvas relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,rgba(113,113,122,.18)_1px,transparent_0)] bg-[size:24px_24px] touch-none select-none ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
      onPointerDown={beginCanvasPan}
      onPointerMove={movePointer}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onWheel={handleWheel}
    >
      <div className="absolute left-0 top-0 origin-top-left will-change-transform" style={{ width: canvasSize.width, height: canvasSize.height, transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}>
        <svg className="pointer-events-none absolute inset-0 z-0 overflow-visible" width={canvasSize.width} height={canvasSize.height}>
          <defs><marker id="coreor-schema-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="rgba(34,211,238,.75)" /></marker></defs>
          {edges.map(edge => {
            const sourcePosition = positions[edge.source.table];
            const targetPosition = positions[edge.target.table];
            if (!sourcePosition || !targetPosition || !tableInfo[edge.target.table]) return null;
            const sourceY = sourcePosition.y + endpointY(tableInfo[edge.source.table], edge.source.column);
            const targetY = targetPosition.y + endpointY(tableInfo[edge.target.table], edge.target.column);
            const laneOffset = ((edge.id.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0) % 7) - 3) * 8;
            const sameColumn = Math.abs(sourcePosition.x - targetPosition.x) < 20;
            let sourceX: number;
            let targetX: number;
            let routeX: number;
            if (sameColumn) {
              sourceX = sourcePosition.x + CARD_WIDTH;
              targetX = targetPosition.x + CARD_WIDTH;
              routeX = Math.max(sourcePosition.x, targetPosition.x) + CARD_WIDTH + 72 + Math.abs(laneOffset);
            } else {
              const sourceOnLeft = sourcePosition.x < targetPosition.x;
              sourceX = sourceOnLeft ? sourcePosition.x + CARD_WIDTH : sourcePosition.x;
              targetX = sourceOnLeft ? targetPosition.x : targetPosition.x + CARD_WIDTH;
              routeX = sourceX + (targetX - sourceX) / 2 + laneOffset;
            }
            const path = `M ${sourceX} ${sourceY} H ${routeX} V ${targetY} H ${targetX}`;
            const active = selectedEdge?.id === edge.id;
            return <path data-schema-edge="true" key={edge.id} d={path} fill="none" stroke={active ? 'rgba(250,204,21,.95)' : 'rgba(34,211,238,.48)'} strokeWidth={active ? 3 : 1.6} markerEnd="url(#coreor-schema-arrow)" className="pointer-events-auto cursor-pointer" onPointerDown={event => event.stopPropagation()} onClick={() => { setSelectedEdge(edge); setSource(null); setTarget(null); }} />;
          })}
        </svg>

        {Object.entries(tableInfo).map(([tableName, info]) => {
          const position = positions[tableName] || { x: 0, y: 0 };
          const primaryColumns = new Set(info.indexes.filter(index => index.Key_name === 'PRIMARY').map(index => index.Column_name));
          const uniqueColumns = new Set(info.indexes.filter(index => index.Non_unique === '0' && index.Key_name !== 'PRIMARY').map(index => index.Column_name));
          const foreignColumns = new Set(info.foreignKeys.map(item => item.COLUMN_NAME));
          return <section data-schema-node="true" key={tableName} className={`absolute z-10 overflow-hidden rounded-xl border bg-zinc-950/96 shadow-xl backdrop-blur ${draggingTable === tableName ? 'cursor-grabbing border-cyan-400 shadow-cyan-950/50' : 'border-zinc-700/90'}`} style={{ left: position.x, top: position.y, width: CARD_WIDTH }} onPointerDown={event => beginNodeDrag(event, tableName)} onDoubleClick={() => onOpenTable?.(tableName)}>
            <header className="flex h-10 cursor-grab items-center gap-2 border-b border-zinc-800 bg-zinc-900/95 px-2 active:cursor-grabbing"><Table2 className="h-3.5 w-3.5 text-cyan-400" /><span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{tableName}</span><span className="rounded bg-black/30 px-1.5 py-0.5 text-[8px] uppercase text-zinc-500">{info.table.engine || 'table'}</span></header>
            <div>{info.columns.map(column => {
              const isSource = source?.table === tableName && source.column === column.Field;
              const isTarget = target?.table === tableName && target.column === column.Field;
              const isKey = primaryColumns.has(column.Field);
              return <button data-column-button="true" key={column.Field} type="button" onPointerDown={event => event.stopPropagation()} onClick={() => chooseColumn(tableName, column.Field)} className={`flex h-[26px] w-full items-center gap-1.5 border-b border-zinc-900 px-2 text-left text-[9px] hover:bg-cyan-500/[0.08] ${isSource ? 'bg-cyan-500/15' : isTarget ? 'bg-emerald-500/15' : ''}`} title={`${column.Field} • ${column.Type}`}>
                {isKey ? <KeyRound className="h-3 w-3 shrink-0 text-amber-400" /> : foreignColumns.has(column.Field) ? <Link2 className="h-3 w-3 shrink-0 text-cyan-400" /> : uniqueColumns.has(column.Field) ? <Columns3 className="h-3 w-3 shrink-0 text-red-300" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-700" />}
                <span className={`min-w-0 flex-1 truncate ${isKey ? 'font-semibold text-amber-100' : 'text-zinc-300'}`}>{column.Field}</span><span className={`max-w-[112px] truncate font-mono text-[8px] ${typeTone(column.Type)}`}>{column.Type.toUpperCase()}</span>{column.Null === 'YES' && <span className="text-[7px] text-zinc-700">N</span>}
              </button>;
            })}</div>
            {info.table.comment && <footer className="truncate border-t border-zinc-800 bg-black/20 px-2 py-1.5 text-[8px] text-zinc-600" title={info.table.comment}>{info.table.comment}</footer>}
          </section>;
        })}

        {source && target && source.table === target.table && <div className="absolute left-4 top-4 z-30 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/90 px-3 py-2 text-[10px] text-amber-200"><AlertTriangle className="h-4 w-4" />Self-reference için hedef tablo farklı seçilmelidir.</div>}
      </div>
    </div>
  </div>;
}
