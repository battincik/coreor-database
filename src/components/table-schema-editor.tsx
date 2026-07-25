'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Clipboard,
  Code,
  Database,
  FileCode2,
  Key,
  Link,
  Loader2,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Table as TableIcon,
  Trash2,
  X
} from 'lucide-react';
import type {
  DatabaseCatalogItem,
  TableColumnDefinition,
  TableColumnInfo,
  TableForeignKeyDefinition,
  TableIndexKind,
  TableInfo,
  TableSchemaMutation
} from 'types';
import { mutateTableSchema } from '@/lib/databaseApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/app-state';

interface TableSchemaEditorProps {
  serverId: string;
  databaseName: string;
  tableName: string;
  accountId?: string | null;
  info: TableInfo;
  catalog: DatabaseCatalogItem[];
  onInfoChange: (info: TableInfo) => void;
  onTableRenamed: (tableName: string) => void;
  onCatalogRefresh: () => void | Promise<void>;
}

interface ColumnDraft extends TableColumnDefinition {
  id: string;
  originalName: string | null;
  isNew: boolean;
  dirty: boolean;
}

interface ConfirmState {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}

const DATA_TYPES = [
  'TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'BIT', 'BOOLEAN',
  'CHAR', 'VARCHAR', 'BINARY', 'VARBINARY', 'TINYTEXT', 'TEXT', 'MEDIUMTEXT', 'LONGTEXT',
  'TINYBLOB', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR',
  'JSON', 'ENUM', 'SET', 'GEOMETRY', 'POINT', 'LINESTRING', 'POLYGON'
];
const ENGINE_OPTIONS = ['InnoDB', 'MyISAM', 'MEMORY', 'Aria', 'CSV', 'ARCHIVE'];
const ROW_FORMAT_OPTIONS = ['DEFAULT', 'DYNAMIC', 'COMPACT', 'REDUNDANT', 'COMPRESSED', 'FIXED', 'PAGE'];
const FK_RULES: TableForeignKeyDefinition['onDelete'][] = ['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'];
const CONTROL_CLASS = 'h-7 rounded border border-zinc-800 bg-zinc-950 px-2 text-[10px] text-zinc-200 outline-none focus:border-cyan-500/60';

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractLength(column: TableColumnInfo) {
  const match = column.Type.match(/^[^(]+\((.*)\)/);
  return match?.[1] || '';
}

function defaultKind(column: TableColumnInfo): TableColumnDefinition['defaultKind'] {
  if (column.Default === null) return column.Null === 'YES' ? 'null' : 'none';
  if (/CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|NOW\(\)|UUID\(\)/i.test(column.Default) || /DEFAULT_GENERATED/i.test(column.Extra)) return 'expression';
  return 'literal';
}

function columnToDraft(column: TableColumnInfo): ColumnDraft {
  return {
    id: createId('column'),
    originalName: column.Field,
    isNew: false,
    dirty: false,
    name: column.Field,
    dataType: column.Data_type.toUpperCase(),
    length: extractLength(column),
    unsigned: /\bUNSIGNED\b/i.test(column.Type),
    zerofill: /\bZEROFILL\b/i.test(column.Type),
    nullable: column.Null === 'YES',
    autoIncrement: /auto_increment/i.test(column.Extra),
    defaultKind: defaultKind(column),
    defaultValue: column.Default ?? '',
    comment: column.Comment,
    charset: column.Character_set_name ?? '',
    collation: column.Collation ?? '',
    generatedExpression: column.Generation_expression,
    generatedStorage: /STORED GENERATED/i.test(column.Extra) ? 'STORED' : 'VIRTUAL'
  };
}

function cleanColumnDefinition(draft: ColumnDraft): TableColumnDefinition {
  return {
    name: draft.name.trim(),
    dataType: draft.dataType,
    length: draft.length?.trim() || undefined,
    unsigned: Boolean(draft.unsigned),
    zerofill: Boolean(draft.zerofill),
    nullable: Boolean(draft.nullable),
    autoIncrement: Boolean(draft.autoIncrement),
    defaultKind: draft.generatedExpression?.trim() ? 'none' : draft.defaultKind,
    defaultValue: draft.defaultValue,
    comment: draft.comment || undefined,
    charset: draft.charset || undefined,
    collation: draft.collation || undefined,
    generatedExpression: draft.generatedExpression || undefined,
    generatedStorage: draft.generatedStorage
  };
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function ConfirmDialog({ state, onClose }: { state: ConfirmState | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!state || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-sm" aria-label="Kapat" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2"><AlertTriangle className="h-5 w-5 text-red-400" /></div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-100">{state.title}</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{state.description}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>İptal</Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              await state.onConfirm();
              onClose();
            } finally {
              setBusy(false);
            }
          }}>{busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{state.confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function TableSchemaEditor({
  serverId,
  databaseName,
  tableName,
  accountId,
  info,
  catalog,
  onInfoChange,
  onTableRenamed,
  onCatalogRefresh
}: TableSchemaEditorProps) {
  const [columns, setColumns] = useState<ColumnDraft[]>([]);
  const [tableDraft, setTableDraft] = useState({
    name: info.table.name,
    comment: info.table.comment,
    engine: info.table.engine || 'InnoDB',
    collation: info.table.collation || 'utf8mb4_0900_ai_ci',
    autoIncrement: info.table.autoIncrement ? String(info.table.autoIncrement) : '',
    rowFormat: info.table.rowFormat || 'DEFAULT'
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [indexDraft, setIndexDraft] = useState<{ kind: TableIndexKind; name: string; columns: string[]; comment: string }>({ kind: 'INDEX', name: '', columns: [], comment: '' });
  const [foreignKeyDraft, setForeignKeyDraft] = useState<TableForeignKeyDefinition>({
    name: '', columns: [], referencedDatabase: databaseName, referencedTable: '', referencedColumns: [], onDelete: 'RESTRICT', onUpdate: 'RESTRICT'
  });

  useEffect(() => {
    setColumns(info.columns.map(columnToDraft));
    setTableDraft({
      name: info.table.name,
      comment: info.table.comment,
      engine: info.table.engine || 'InnoDB',
      collation: info.table.collation || 'utf8mb4_0900_ai_ci',
      autoIncrement: info.table.autoIncrement ? String(info.table.autoIncrement) : '',
      rowFormat: info.table.rowFormat || 'DEFAULT'
    });
    setMessage(null);
  }, [info]);

  const groupedIndexes = useMemo(() => {
    const groups = new Map<string, typeof info.indexes>();
    for (const index of info.indexes) groups.set(index.Key_name, [...(groups.get(index.Key_name) || []), index]);
    return Array.from(groups.entries());
  }, [info.indexes]);

  const groupedForeignKeys = useMemo(() => {
    const groups = new Map<string, typeof info.foreignKeys>();
    for (const foreignKey of info.foreignKeys) groups.set(foreignKey.CONSTRAINT_NAME, [...(groups.get(foreignKey.CONSTRAINT_NAME) || []), foreignKey]);
    return Array.from(groups.entries());
  }, [info.foreignKeys]);

  const referencedTables = catalog.find(database => database.name === (foreignKeyDraft.referencedDatabase || databaseName))?.tables || [];
  const tableOptionsDirty = tableDraft.name !== info.table.name || tableDraft.comment !== info.table.comment || tableDraft.engine !== info.table.engine || tableDraft.collation !== (info.table.collation || '') || tableDraft.autoIncrement !== (info.table.autoIncrement ? String(info.table.autoIncrement) : '') || tableDraft.rowFormat !== (info.table.rowFormat || 'DEFAULT');
  const dirtyColumnCount = columns.filter(column => column.dirty || column.isNew).length;

  const runMutation = async (mutation: TableSchemaMutation, successMessage: string) => {
    if (!accountId) throw new Error('Şema değişikliği için kullanıcı oturumu gerekli.');
    setBusy(true);
    setMessage(null);
    try {
      const response = await mutateTableSchema(serverId, { database: databaseName, table: tableName, mutation }, accountId);
      onInfoChange(response.tableInfo);
      if (response.tableName !== tableName) onTableRenamed(response.tableName);
      await onCatalogRefresh();
      setMessage({ tone: 'success', text: successMessage });
      return response;
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Tablo yapısı güncellenemedi.';
      setMessage({ tone: 'error', text });
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const updateColumn = (id: string, patch: Partial<ColumnDraft>) => {
    setColumns(previous => previous.map(column => column.id === id ? { ...column, ...patch, dirty: true } : column));
  };

  const addColumn = () => {
    setColumns(previous => [...previous, {
      id: createId('column'), originalName: null, isNew: true, dirty: true, name: `new_column_${previous.length + 1}`,
      dataType: 'VARCHAR', length: '255', unsigned: false, zerofill: false, nullable: true, autoIncrement: false,
      defaultKind: 'null', defaultValue: '', comment: '', charset: 'utf8mb4', collation: info.table.collation || '', generatedExpression: '', generatedStorage: 'VIRTUAL'
    }]);
  };

  const saveColumn = async (draft: ColumnDraft, index: number) => {
    const previous = columns[index - 1];
    const position = index === 0 ? { first: true } : { after: previous?.name || null };
    const definition = cleanColumnDefinition(draft);
    if (draft.isNew) await runMutation({ kind: 'add-column', column: definition, ...position }, `${definition.name} kolonu eklendi.`);
    else await runMutation({ kind: 'modify-column', originalName: draft.originalName || draft.name, column: definition, ...position }, `${definition.name} kolonu güncellendi.`);
  };

  const saveAll = async () => {
    if (busy) return;
    try {
      if (tableOptionsDirty) {
        await runMutation({
          kind: 'table-options',
          name: tableDraft.name,
          comment: tableDraft.comment,
          engine: tableDraft.engine,
          collation: tableDraft.collation,
          autoIncrement: tableDraft.autoIncrement ? Number(tableDraft.autoIncrement) : null,
          rowFormat: tableDraft.rowFormat
        }, 'Tablo seçenekleri kaydedildi.');
      }
      for (let index = 0; index < columns.length; index += 1) {
        const column = columns[index];
        if (column.dirty || column.isNew) await saveColumn(column, index);
      }
    } catch {
      // runMutation hata mesajını ekranda gösterir.
    }
  };

  const moveColumn = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= columns.length) return;
    const reordered = [...columns];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setColumns(reordered);
    const moved = reordered[target];
    if (moved.isNew) return;
    const previous = reordered[target - 1];
    try {
      await runMutation({
        kind: 'modify-column',
        originalName: moved.originalName || moved.name,
        column: cleanColumnDefinition(moved),
        first: target === 0,
        after: target === 0 ? null : previous?.name || null
      }, `${moved.name} kolonu taşındı.`);
    } catch {
      setColumns(info.columns.map(columnToDraft));
    }
  };

  const deleteColumn = (column: ColumnDraft) => {
    if (column.isNew) {
      setColumns(previous => previous.filter(item => item.id !== column.id));
      return;
    }
    setConfirm({
      title: `${column.name} kolonunu sil`,
      description: 'Bu işlem kolondaki bütün verileri kalıcı olarak siler. İşlem geri alınamaz.',
      confirmLabel: 'Kolonu sil',
      onConfirm: () => runMutation({ kind: 'drop-column', columnName: column.originalName || column.name }, `${column.name} kolonu silindi.`)
    });
  };

  const addIndex = async () => {
    try {
      await runMutation({
        kind: 'add-index',
        index: { kind: indexDraft.kind, name: indexDraft.kind === 'PRIMARY' ? undefined : indexDraft.name, columns: indexDraft.columns.map(name => ({ name })), comment: indexDraft.comment }
      }, 'İndeks eklendi.');
      setIndexDraft({ kind: 'INDEX', name: '', columns: [], comment: '' });
    } catch {
      // handled
    }
  };

  const dropIndex = (name: string) => setConfirm({
    title: `${name} indeksini sil`,
    description: name === 'PRIMARY' ? 'Primary key kaldırılırsa satır düzenleme ve ilişkiler etkilenebilir.' : 'İndeks kaldırıldığında ilgili sorgular yavaşlayabilir.',
    confirmLabel: 'İndeksi sil',
    onConfirm: () => runMutation({ kind: 'drop-index', indexName: name }, `${name} indeksi silindi.`)
  });

  const addForeignKey = async () => {
    try {
      await runMutation({ kind: 'add-foreign-key', foreignKey: foreignKeyDraft }, 'Foreign key eklendi.');
      setForeignKeyDraft({ name: '', columns: [], referencedDatabase: databaseName, referencedTable: '', referencedColumns: [], onDelete: 'RESTRICT', onUpdate: 'RESTRICT' });
    } catch {
      // handled
    }
  };

  const dropForeignKey = (name: string) => setConfirm({
    title: `${name} foreign key bağlantısını sil`,
    description: 'Referans bütünlüğü kuralı kaldırılacak; tablodaki mevcut veriler silinmeyecek.',
    confirmLabel: 'Foreign key sil',
    onConfirm: () => runMutation({ kind: 'drop-foreign-key', constraintName: name }, `${name} foreign key bağlantısı silindi.`)
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0d0f]">
      <Tabs defaultValue="basic" className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-9 shrink-0 items-center border-b border-zinc-800 bg-zinc-950/90">
          <TabsList className="h-9 justify-start bg-transparent px-1">
            <TabsTrigger value="basic" className="h-8 px-2.5 text-[10px]" icon={<TableIcon className="h-3.5 w-3.5" />}>Basit</TabsTrigger>
            <TabsTrigger value="options" className="h-8 px-2.5 text-[10px]" icon={<Settings2 className="h-3.5 w-3.5" />}>Seçenekler</TabsTrigger>
            <TabsTrigger value="indexes" className="h-8 px-2.5 text-[10px]" icon={<Key className="h-3.5 w-3.5" />}>İndeksler ({groupedIndexes.length})</TabsTrigger>
            <TabsTrigger value="foreign-keys" className="h-8 px-2.5 text-[10px]" icon={<Link className="h-3.5 w-3.5" />}>Yabancı anahtarlar ({groupedForeignKeys.length})</TabsTrigger>
            <TabsTrigger value="checks" className="h-8 px-2.5 text-[10px]" icon={<ShieldCheck className="h-3.5 w-3.5" />}>Check constraints ({info.checkConstraints.length})</TabsTrigger>
            <TabsTrigger value="partitions" className="h-8 px-2.5 text-[10px]" icon={<Database className="h-3.5 w-3.5" />}>Partisyonlar ({info.partitions.length})</TabsTrigger>
            <TabsTrigger value="create" className="h-8 px-2.5 text-[10px]" icon={<FileCode2 className="h-3.5 w-3.5" />}>CREATE kodu</TabsTrigger>
          </TabsList>
        </div>

        {message && <div className={`shrink-0 border-b px-3 py-1.5 text-[10px] ${message.tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>{message.text}</div>}

        <TabsContent value="basic" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="grid shrink-0 grid-cols-[90px_minmax(200px,1fr)] gap-x-3 gap-y-1 border-b border-zinc-800 bg-zinc-950/40 p-2 text-[10px]">
            <label className="self-center text-zinc-500">Ad:</label>
            <Input value={tableDraft.name} onChange={event => setTableDraft(previous => ({ ...previous, name: event.target.value }))} className="h-7 border-zinc-800 bg-zinc-950 text-[10px]" />
            <label className="pt-2 text-zinc-500">Yorum:</label>
            <textarea value={tableDraft.comment} onChange={event => setTableDraft(previous => ({ ...previous, comment: event.target.value }))} className="h-14 resize-none rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[10px] text-zinc-200 outline-none focus:border-cyan-500/60" />
          </div>

          <div className="flex h-8 shrink-0 items-center gap-1 border-b border-zinc-800 px-2 text-[10px]">
            <span className="mr-2 text-zinc-500">Sütunlar:</span>
            <button type="button" className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300" onClick={addColumn}><Plus className="h-3.5 w-3.5" /> Ekle</button>
            <span className="ml-auto text-zinc-600">{columns.length} kolon • {dirtyColumnCount} değişiklik</span>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="min-w-[1600px]">
              <Table size="sm" className="w-full table-fixed text-[10px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-16 border bg-zinc-900">#</TableHead>
                    <TableHead className="w-40 border bg-zinc-900">Ad</TableHead>
                    <TableHead className="w-32 border bg-zinc-900">Veri tipi</TableHead>
                    <TableHead className="w-36 border bg-zinc-900">Uzunluk/Ayar</TableHead>
                    <TableHead className="w-20 border bg-zinc-900">İmzasız</TableHead>
                    <TableHead className="w-20 border bg-zinc-900">NULL'a izin</TableHead>
                    <TableHead className="w-24 border bg-zinc-900">Oto. artış</TableHead>
                    <TableHead className="w-32 border bg-zinc-900">Varsayılan türü</TableHead>
                    <TableHead className="w-44 border bg-zinc-900">Varsayılan</TableHead>
                    <TableHead className="w-44 border bg-zinc-900">Yorum</TableHead>
                    <TableHead className="w-44 border bg-zinc-900">Collation</TableHead>
                    <TableHead className="w-48 border bg-zinc-900">İfade</TableHead>
                    <TableHead className="w-28 border bg-zinc-900">Sanallık</TableHead>
                    <TableHead className="w-28 border bg-zinc-900">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columns.map((column, index) => (
                    <TableRow key={column.id} className={column.dirty || column.isNew ? 'bg-cyan-500/[0.04]' : ''}>
                      <TableCell className="border px-1 py-0.5">
                        <div className="flex items-center gap-1">
                          <span className="w-4 text-right text-zinc-600">{index + 1}</span>
                          {info.columns.find(item => item.Field === column.originalName)?.Key === 'PRI' && <Key className="h-3 w-3 text-amber-400" />}
                          {info.columns.find(item => item.Field === column.originalName)?.Key === 'UNI' && <Key className="h-3 w-3 text-red-400" />}
                          {info.columns.find(item => item.Field === column.originalName)?.Key === 'MUL' && <Key className="h-3 w-3 text-emerald-400" />}
                        </div>
                      </TableCell>
                      <TableCell className="border p-0.5"><input value={column.name} onChange={event => updateColumn(column.id, { name: event.target.value })} className={`${CONTROL_CLASS} w-full font-medium`} /></TableCell>
                      <TableCell className="border p-0.5"><select value={column.dataType} onChange={event => updateColumn(column.id, { dataType: event.target.value })} className={`${CONTROL_CLASS} w-full text-green-400`}>{DATA_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></TableCell>
                      <TableCell className="border p-0.5"><input value={column.length || ''} onChange={event => updateColumn(column.id, { length: event.target.value })} className={`${CONTROL_CLASS} w-full`} placeholder={column.dataType === 'ENUM' ? "'a','b'" : '255 veya 10,2'} /></TableCell>
                      <TableCell className="border text-center"><input type="checkbox" checked={Boolean(column.unsigned)} onChange={event => updateColumn(column.id, { unsigned: event.target.checked })} /></TableCell>
                      <TableCell className="border text-center"><input type="checkbox" checked={Boolean(column.nullable)} onChange={event => updateColumn(column.id, { nullable: event.target.checked })} /></TableCell>
                      <TableCell className="border text-center"><input type="checkbox" checked={Boolean(column.autoIncrement)} onChange={event => updateColumn(column.id, { autoIncrement: event.target.checked })} /></TableCell>
                      <TableCell className="border p-0.5"><select value={column.defaultKind || 'none'} onChange={event => updateColumn(column.id, { defaultKind: event.target.value as TableColumnDefinition['defaultKind'] })} className={`${CONTROL_CLASS} w-full`}><option value="none">Varsayılan yok</option><option value="null">NULL</option><option value="literal">Değer</option><option value="expression">İfade</option></select></TableCell>
                      <TableCell className="border p-0.5"><input value={column.defaultValue || ''} disabled={column.defaultKind === 'none' || column.defaultKind === 'null'} onChange={event => updateColumn(column.id, { defaultValue: event.target.value })} className={`${CONTROL_CLASS} w-full disabled:opacity-40`} /></TableCell>
                      <TableCell className="border p-0.5"><input value={column.comment || ''} onChange={event => updateColumn(column.id, { comment: event.target.value })} className={`${CONTROL_CLASS} w-full`} /></TableCell>
                      <TableCell className="border p-0.5"><input value={column.collation || ''} onChange={event => updateColumn(column.id, { collation: event.target.value })} className={`${CONTROL_CLASS} w-full`} placeholder="utf8mb4_0900_ai_ci" /></TableCell>
                      <TableCell className="border p-0.5"><input value={column.generatedExpression || ''} onChange={event => updateColumn(column.id, { generatedExpression: event.target.value })} className={`${CONTROL_CLASS} w-full`} placeholder="price * quantity" /></TableCell>
                      <TableCell className="border p-0.5"><select value={column.generatedStorage || 'VIRTUAL'} disabled={!column.generatedExpression} onChange={event => updateColumn(column.id, { generatedStorage: event.target.value as 'VIRTUAL' | 'STORED' })} className={`${CONTROL_CLASS} w-full disabled:opacity-40`}><option value="VIRTUAL">VIRTUAL</option><option value="STORED">STORED</option></select></TableCell>
                      <TableCell className="border p-0.5">
                        <div className="flex items-center justify-center gap-0.5">
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0 || busy} onClick={() => void moveColumn(index, -1)} title="Yukarı"><ArrowUp className="h-3 w-3" /></Button>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={index === columns.length - 1 || busy} onClick={() => void moveColumn(index, 1)} title="Aşağı"><ArrowDown className="h-3 w-3" /></Button>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-cyan-400" disabled={(!column.dirty && !column.isNew) || busy} onClick={() => void saveColumn(column, index)} title="Kaydet"><Check className="h-3 w-3" /></Button>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-red-400" disabled={busy} onClick={() => deleteColumn(column)} title="Sil"><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="options" className="m-0 min-h-0 flex-1 overflow-auto p-4">
          <div className="grid max-w-4xl gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold text-zinc-200"><Settings2 className="h-4 w-4 text-cyan-400" /> Tablo seçenekleri</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] text-zinc-500">Motor<select value={tableDraft.engine} onChange={event => setTableDraft(previous => ({ ...previous, engine: event.target.value }))} className={`${CONTROL_CLASS} mt-1 w-full`}>{ENGINE_OPTIONS.map(engine => <option key={engine}>{engine}</option>)}</select></label>
                <label className="text-[10px] text-zinc-500">Satır formatı<select value={tableDraft.rowFormat} onChange={event => setTableDraft(previous => ({ ...previous, rowFormat: event.target.value }))} className={`${CONTROL_CLASS} mt-1 w-full`}>{ROW_FORMAT_OPTIONS.map(format => <option key={format}>{format}</option>)}</select></label>
                <label className="text-[10px] text-zinc-500 sm:col-span-2">Varsayılan collation<input value={tableDraft.collation} onChange={event => setTableDraft(previous => ({ ...previous, collation: event.target.value }))} className={`${CONTROL_CLASS} mt-1 w-full`} /></label>
                <label className="text-[10px] text-zinc-500">Sonraki auto increment<input value={tableDraft.autoIncrement} onChange={event => setTableDraft(previous => ({ ...previous, autoIncrement: event.target.value }))} inputMode="numeric" className={`${CONTROL_CLASS} mt-1 w-full`} /></label>
                <label className="text-[10px] text-zinc-500">Karakter seti<div className="mt-1 flex h-7 items-center rounded border border-zinc-800 bg-zinc-950 px-2 text-zinc-300">{tableDraft.collation.split('_')[0] || info.table.charset || '—'}</div></label>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold text-zinc-200"><Database className="h-4 w-4 text-emerald-400" /> Durum bilgileri</h3>
              <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-[10px]"><dt className="text-zinc-600">Tablo türü</dt><dd>{info.table.tableType}</dd><dt className="text-zinc-600">Oluşturulma</dt><dd>{formatDate(info.table.createTime)}</dd><dt className="text-zinc-600">Güncellenme</dt><dd>{formatDate(info.table.updateTime)}</dd><dt className="text-zinc-600">Kolon</dt><dd>{info.columns.length}</dd><dt className="text-zinc-600">İndeks</dt><dd>{groupedIndexes.length}</dd><dt className="text-zinc-600">Foreign key</dt><dd>{groupedForeignKeys.length}</dd></dl>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="indexes" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="grid shrink-0 gap-2 border-b border-zinc-800 p-2 md:grid-cols-[120px_160px_minmax(260px,1fr)_minmax(180px,0.7fr)_90px]">
            <select value={indexDraft.kind} onChange={event => setIndexDraft(previous => ({ ...previous, kind: event.target.value as TableIndexKind }))} className={CONTROL_CLASS}>{(['PRIMARY', 'INDEX', 'UNIQUE', 'FULLTEXT', 'SPATIAL'] as TableIndexKind[]).map(kind => <option key={kind}>{kind}</option>)}</select>
            <Input value={indexDraft.name} disabled={indexDraft.kind === 'PRIMARY'} onChange={event => setIndexDraft(previous => ({ ...previous, name: event.target.value }))} placeholder="İndeks adı" className="h-7 text-[10px]" />
            <div className="flex flex-wrap items-center gap-1 rounded border border-zinc-800 bg-zinc-950 p-1">
              {info.columns.map(column => <label key={column.Field} className={`cursor-pointer rounded px-1.5 py-0.5 text-[9px] ${indexDraft.columns.includes(column.Field) ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-500 hover:bg-zinc-800'}`}><input type="checkbox" className="sr-only" checked={indexDraft.columns.includes(column.Field)} onChange={event => setIndexDraft(previous => ({ ...previous, columns: event.target.checked ? [...previous.columns, column.Field] : previous.columns.filter(item => item !== column.Field) }))} />{column.Field}</label>)}
            </div>
            <Input value={indexDraft.comment} onChange={event => setIndexDraft(previous => ({ ...previous, comment: event.target.value }))} placeholder="Yorum" className="h-7 text-[10px]" />
            <Button type="button" size="sm" className="h-7 gap-1 text-[10px]" disabled={busy || indexDraft.columns.length === 0 || (indexDraft.kind !== 'PRIMARY' && !indexDraft.name.trim())} onClick={() => void addIndex()}><Plus className="h-3 w-3" /> Ekle</Button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <Table size="sm"><TableHeader><TableRow><TableHead className="border bg-zinc-950">Ad</TableHead><TableHead className="border bg-zinc-950">Tür</TableHead><TableHead className="border bg-zinc-950">Kolonlar</TableHead><TableHead className="border bg-zinc-950">Cardinality</TableHead><TableHead className="border bg-zinc-950">Yorum</TableHead><TableHead className="w-20 border bg-zinc-950">İşlem</TableHead></TableRow></TableHeader><TableBody>{groupedIndexes.map(([name, rows]) => <TableRow key={name}><TableCell className="border py-1 font-medium">{name}</TableCell><TableCell className="border py-1 text-cyan-400">{name === 'PRIMARY' ? 'PRIMARY' : rows[0]?.Index_type}{rows[0]?.Non_unique === '0' && name !== 'PRIMARY' ? ' / UNIQUE' : ''}</TableCell><TableCell className="border py-1">{rows.sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index)).map(row => `${row.Column_name}${row.Sub_part ? `(${row.Sub_part})` : ''}`).join(', ')}</TableCell><TableCell className="border py-1">{rows[0]?.Cardinality?.toLocaleString('tr-TR') || '—'}</TableCell><TableCell className="border py-1">{rows[0]?.Index_comment || '—'}</TableCell><TableCell className="border py-1 text-center"><Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={() => dropIndex(name)}><Trash2 className="h-3 w-3" /></Button></TableCell></TableRow>)}</TableBody></Table>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="foreign-keys" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="grid shrink-0 gap-2 border-b border-zinc-800 p-2 lg:grid-cols-[150px_minmax(180px,1fr)_150px_150px_minmax(180px,1fr)_110px_110px_80px]">
            <Input value={foreignKeyDraft.name} onChange={event => setForeignKeyDraft(previous => ({ ...previous, name: event.target.value }))} placeholder="Constraint adı" className="h-7 text-[10px]" />
            <select multiple value={foreignKeyDraft.columns} onChange={event => setForeignKeyDraft(previous => ({ ...previous, columns: Array.from(event.target.selectedOptions, option => option.value) }))} className={`${CONTROL_CLASS} min-h-16`}>{info.columns.map(column => <option key={column.Field}>{column.Field}</option>)}</select>
            <select value={foreignKeyDraft.referencedDatabase} onChange={event => setForeignKeyDraft(previous => ({ ...previous, referencedDatabase: event.target.value, referencedTable: '' }))} className={CONTROL_CLASS}>{catalog.map(database => <option key={database.name}>{database.name}</option>)}</select>
            <select value={foreignKeyDraft.referencedTable} onChange={event => setForeignKeyDraft(previous => ({ ...previous, referencedTable: event.target.value }))} className={CONTROL_CLASS}><option value="">Referans tablo</option>{referencedTables.map(table => <option key={table}>{table}</option>)}</select>
            <Input value={foreignKeyDraft.referencedColumns.join(',')} onChange={event => setForeignKeyDraft(previous => ({ ...previous, referencedColumns: event.target.value.split(',').map(value => value.trim()).filter(Boolean) }))} placeholder="Referans kolonlar: id,tenant_id" className="h-7 text-[10px]" />
            <select value={foreignKeyDraft.onDelete} onChange={event => setForeignKeyDraft(previous => ({ ...previous, onDelete: event.target.value as TableForeignKeyDefinition['onDelete'] }))} className={CONTROL_CLASS}>{FK_RULES.map(rule => <option key={rule}>{rule}</option>)}</select>
            <select value={foreignKeyDraft.onUpdate} onChange={event => setForeignKeyDraft(previous => ({ ...previous, onUpdate: event.target.value as TableForeignKeyDefinition['onUpdate'] }))} className={CONTROL_CLASS}>{FK_RULES.map(rule => <option key={rule}>{rule}</option>)}</select>
            <Button type="button" size="sm" className="h-7 gap-1 text-[10px]" disabled={busy || !foreignKeyDraft.name || !foreignKeyDraft.columns.length || !foreignKeyDraft.referencedTable || foreignKeyDraft.columns.length !== foreignKeyDraft.referencedColumns.length} onClick={() => void addForeignKey()}><Plus className="h-3 w-3" /> Ekle</Button>
          </div>
          <ScrollArea className="min-h-0 flex-1"><Table size="sm"><TableHeader><TableRow><TableHead className="border bg-zinc-950">Ad</TableHead><TableHead className="border bg-zinc-950">Yerel kolon</TableHead><TableHead className="border bg-zinc-950">Referans</TableHead><TableHead className="border bg-zinc-950">ON DELETE</TableHead><TableHead className="border bg-zinc-950">ON UPDATE</TableHead><TableHead className="w-20 border bg-zinc-950">İşlem</TableHead></TableRow></TableHeader><TableBody>{groupedForeignKeys.map(([name, rows]) => <TableRow key={name}><TableCell className="border py-1 font-medium">{name}</TableCell><TableCell className="border py-1">{rows.map(row => row.COLUMN_NAME).join(', ')}</TableCell><TableCell className="border py-1 text-cyan-400">{rows[0]?.REFERENCED_TABLE_SCHEMA}.{rows[0]?.REFERENCED_TABLE_NAME} ({rows.map(row => row.REFERENCED_COLUMN_NAME).join(', ')})</TableCell><TableCell className="border py-1">{rows[0]?.DELETE_RULE}</TableCell><TableCell className="border py-1">{rows[0]?.UPDATE_RULE}</TableCell><TableCell className="border py-1 text-center"><Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={() => dropForeignKey(name)}><Trash2 className="h-3 w-3" /></Button></TableCell></TableRow>)}</TableBody></Table></ScrollArea>
        </TabsContent>

        <TabsContent value="checks" className="m-0 min-h-0 flex-1 overflow-auto p-0">
          {info.checkConstraints.length === 0 ? <EmptyState icon={ShieldCheck} title="Check constraint bulunmuyor" description="Bu tabloda tanımlı CHECK kuralı yok." /> : <Table size="sm"><TableHeader><TableRow><TableHead className="border bg-zinc-950">Ad</TableHead><TableHead className="border bg-zinc-950">Kural</TableHead><TableHead className="border bg-zinc-950">Durum</TableHead></TableRow></TableHeader><TableBody>{info.checkConstraints.map(check => <TableRow key={check.CONSTRAINT_NAME}><TableCell className="border py-1 font-medium">{check.CONSTRAINT_NAME}</TableCell><TableCell className="border py-1 font-mono text-cyan-300">{check.CHECK_CLAUSE}</TableCell><TableCell className="border py-1">{check.ENFORCED}</TableCell></TableRow>)}</TableBody></Table>}
        </TabsContent>

        <TabsContent value="partitions" className="m-0 min-h-0 flex-1 overflow-auto p-0">
          {info.partitions.length === 0 ? <EmptyState icon={Database} title="Partisyon bulunmuyor" description="Tablo partisyonlara ayrılmamış." /> : <Table size="sm"><TableHeader><TableRow><TableHead className="border bg-zinc-950">Ad</TableHead><TableHead className="border bg-zinc-950">Yöntem</TableHead><TableHead className="border bg-zinc-950">İfade</TableHead><TableHead className="border bg-zinc-950">Açıklama</TableHead><TableHead className="border bg-zinc-950">Satır</TableHead><TableHead className="border bg-zinc-950">Boyut</TableHead></TableRow></TableHeader><TableBody>{info.partitions.map(partition => <TableRow key={partition.PARTITION_NAME}><TableCell className="border py-1">{partition.PARTITION_NAME}</TableCell><TableCell className="border py-1">{partition.PARTITION_METHOD}</TableCell><TableCell className="border py-1 font-mono">{partition.PARTITION_EXPRESSION}</TableCell><TableCell className="border py-1">{partition.PARTITION_DESCRIPTION}</TableCell><TableCell className="border py-1">{partition.TABLE_ROWS.toLocaleString('tr-TR')}</TableCell><TableCell className="border py-1">{((partition.DATA_LENGTH + partition.INDEX_LENGTH) / 1024 / 1024).toFixed(2)} MB</TableCell></TableRow>)}</TableBody></Table>}
        </TabsContent>

        <TabsContent value="create" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden bg-black/30 p-0">
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-zinc-800 px-2 text-[10px] text-zinc-500"><span className="flex items-center gap-1.5"><Code className="h-3.5 w-3.5" /> SHOW CREATE TABLE çıktısı — tabloyu bire bir oluşturur</span><Button type="button" variant="ghost" size="sm" className="h-6 gap-1 text-[10px]" onClick={() => navigator.clipboard.writeText(info.createSQL)}><Clipboard className="h-3 w-3" /> Kopyala</Button></div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 text-left font-mono text-[11px] leading-5 text-cyan-200">{info.createSQL}</pre>
        </TabsContent>
      </Tabs>

      <div className="flex h-9 shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-2">
        <span className="flex items-center gap-2 text-[10px] text-zinc-600">{busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Tablo değiştiriliyor…</> : message?.tone === 'success' ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Hazır</> : `${databaseName}.${tableName}`}</span>
        <Button type="button" size="sm" className="h-7 gap-1.5 text-[10px]" disabled={busy || (!tableOptionsDirty && dirtyColumnCount === 0)} onClick={() => void saveAll()}><Save className="h-3.5 w-3.5" /> Tüm değişiklikleri kaydet</Button>
      </div>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
