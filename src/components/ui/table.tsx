'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  TABLE_COLUMN_ACTION_EVENT,
  type TableColumnActionDetail
} from '@/lib/tableColumnSizing';

type StoredWidths = Record<string, number>;

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  size?: 'default' | 'sm';
  columnStorageKey?: string;
  minimumColumnWidth?: number;
  maximumColumnWidth?: number;
  scrollContainer?: boolean;
  containerClassName?: string;
}

interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  columnKey?: string;
  resizable?: boolean;
}

let measurementCanvas: HTMLCanvasElement | null = null;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function safeStorageRead(key: string): StoredWidths {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '{}') as Record<string, unknown>;
    const result: StoredWidths = {};
    for (const [column, rawValue] of Object.entries(parsed)) {
      const value = Number(rawValue);
      if (Number.isFinite(value) && value > 0) result[column] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function safeStorageWrite(key: string, widths: StoredWidths) {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(widths));
  } catch {
    // Column persistence must never stop the table from working.
  }
}

function safeStorageRemove(key: string) {
  if (typeof window === 'undefined' || !key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}

function textWidth(text: string, font: string) {
  if (typeof document === 'undefined') return text.length * 7;
  measurementCanvas ||= document.createElement('canvas');
  const context = measurementCanvas.getContext('2d');
  if (!context) return text.length * 7;
  context.font = font;
  return context.measureText(text).width;
}

function columnIdentifier(header: HTMLTableCellElement, index: number) {
  return header.dataset.columnKey || `column-${index}`;
}

function fallbackStorageKey(table: HTMLTableElement) {
  const labels = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead tr:first-child th'))
    .map((header, index) => columnIdentifier(header, index))
    .join('|');
  const route = typeof window === 'undefined' ? 'server' : window.location.pathname;
  return `coreor:table-column-widths:v2:${route}:${labels || 'table'}`;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(({
  className,
  size = 'default',
  columnStorageKey,
  minimumColumnWidth = 56,
  maximumColumnWidth = 520,
  scrollContainer = true,
  containerClassName,
  onPointerDownCapture,
  onDoubleClickCapture,
  children,
  ...props
}, forwardedRef) => {
  const tableRef = React.useRef<HTMLTableElement | null>(null);
  const widthsRef = React.useRef<StoredWidths>({});
  const storageKeyRef = React.useRef(columnStorageKey || '');

  React.useImperativeHandle(forwardedRef, () => tableRef.current as HTMLTableElement);

  const headers = React.useCallback(() => (
    tableRef.current
      ? Array.from(tableRef.current.querySelectorAll<HTMLTableCellElement>('thead tr:first-child th'))
      : []
  ), []);

  const storageKey = React.useCallback(() => {
    const table = tableRef.current;
    if (!table) return columnStorageKey || '';
    const resolved = columnStorageKey || fallbackStorageKey(table);
    storageKeyRef.current = resolved;
    return resolved;
  }, [columnStorageKey]);

  const cellsAt = React.useCallback((index: number) => {
    const table = tableRef.current;
    if (!table) return [];
    return Array.from(table.querySelectorAll<HTMLElement>(`tr > *:nth-child(${index + 1})`));
  }, []);

  const updateTableWidth = React.useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    const currentHeaders = headers();
    if (!Object.keys(widthsRef.current).length) {
      table.style.removeProperty('table-layout');
      table.style.removeProperty('width');
      table.style.removeProperty('min-width');
      return;
    }
    const total = currentHeaders.reduce((sum, header, index) => {
      const key = columnIdentifier(header, index);
      return sum + (widthsRef.current[key] || header.getBoundingClientRect().width || minimumColumnWidth);
    }, 0);
    table.style.tableLayout = 'fixed';
    table.style.width = `${Math.ceil(total)}px`;
    table.style.minWidth = `${Math.ceil(total)}px`;
  }, [headers, minimumColumnWidth]);

  const applyWidth = React.useCallback((index: number, width: number, persist = true) => {
    const currentHeaders = headers();
    const header = currentHeaders[index];
    if (!header || header.dataset.resizeDisabled === 'true') return;
    const nextWidth = clamp(width, minimumColumnWidth, maximumColumnWidth);
    const key = columnIdentifier(header, index);
    widthsRef.current = { ...widthsRef.current, [key]: nextWidth };
    for (const cell of cellsAt(index)) {
      cell.style.width = `${nextWidth}px`;
      cell.style.minWidth = `${nextWidth}px`;
      cell.style.maxWidth = `${nextWidth}px`;
    }
    updateTableWidth();
    if (persist) safeStorageWrite(storageKey(), widthsRef.current);
  }, [cellsAt, headers, maximumColumnWidth, minimumColumnWidth, storageKey, updateTableWidth]);

  const measureColumn = React.useCallback((index: number) => {
    const currentHeaders = headers();
    const header = currentHeaders[index];
    if (!header || header.dataset.resizeDisabled === 'true') return minimumColumnWidth;
    const computed = window.getComputedStyle(header);
    const font = `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
    const values = cellsAt(index)
      .slice(0, 250)
      .map(cell => (cell.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500));
    const measured = Math.max(
      textWidth((header.textContent || '').replace(/\s+/g, ' ').trim(), font) + 42,
      ...values.map(value => textWidth(value, font) + 28),
      minimumColumnWidth
    );
    return clamp(measured, minimumColumnWidth, maximumColumnWidth);
  }, [cellsAt, headers, maximumColumnWidth, minimumColumnWidth]);

  const fitColumn = React.useCallback((index: number) => {
    applyWidth(index, measureColumn(index));
  }, [applyWidth, measureColumn]);

  const fitAll = React.useCallback(() => {
    const currentHeaders = headers();
    currentHeaders.forEach((header, index) => {
      if (header.dataset.resizeDisabled !== 'true') applyWidth(index, measureColumn(index), false);
    });
    safeStorageWrite(storageKey(), widthsRef.current);
    updateTableWidth();
  }, [applyWidth, headers, measureColumn, storageKey, updateTableWidth]);

  const reset = React.useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    widthsRef.current = {};
    for (const cell of table.querySelectorAll<HTMLElement>('th, td')) {
      cell.style.removeProperty('width');
      cell.style.removeProperty('min-width');
      cell.style.removeProperty('max-width');
    }
    table.style.removeProperty('table-layout');
    table.style.removeProperty('width');
    table.style.removeProperty('min-width');
    safeStorageRemove(storageKey());
  }, [storageKey]);

  React.useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const key = storageKey();
    const stored = safeStorageRead(key);
    widthsRef.current = stored;
    const currentHeaders = headers();
    currentHeaders.forEach((header, index) => {
      const width = stored[columnIdentifier(header, index)];
      if (width) applyWidth(index, width, false);
    });
    updateTableWidth();
  }, [columnStorageKey, storageKey, headers, applyWidth, updateTableWidth]);

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TableColumnActionDetail>).detail;
      if (!detail || detail.storageKey !== storageKeyRef.current) return;
      if (detail.action === 'fit-all') fitAll();
      if (detail.action === 'reset') reset();
    };
    window.addEventListener(TABLE_COLUMN_ACTION_EVENT, handler);
    return () => window.removeEventListener(TABLE_COLUMN_ACTION_EVENT, handler);
  }, [fitAll, reset]);

  const handlePointerDown = (event: React.PointerEvent<HTMLTableElement>) => {
    onPointerDownCapture?.(event);
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>('[data-coreor-column-resizer]');
    const header = handle?.closest<HTMLTableCellElement>('th');
    if (!handle || !header || header.dataset.resizeDisabled === 'true') return;
    event.preventDefault();
    event.stopPropagation();
    const index = header.cellIndex;
    const startX = event.clientX;
    const startWidth = header.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const move = (moveEvent: PointerEvent) => {
      applyWidth(index, startWidth + moveEvent.clientX - startX, false);
    };
    const finish = () => {
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      safeStorageWrite(storageKey(), widthsRef.current);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLTableElement>) => {
    onDoubleClickCapture?.(event);
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>('[data-coreor-column-resizer]');
    const header = handle?.closest<HTMLTableCellElement>('th');
    if (!handle || !header || header.dataset.resizeDisabled === 'true') return;
    event.preventDefault();
    event.stopPropagation();
    fitColumn(header.cellIndex);
  };

  const tableElement = (
    <table
      ref={tableRef}
      className={cn('w-full caption-bottom text-sm', size === 'sm' && 'text-xs', className)}
      onPointerDownCapture={handlePointerDown}
      onDoubleClickCapture={handleDoubleClick}
      {...props}
    >
      {children}
    </table>
  );

  if (!scrollContainer) return tableElement;
  return <div className={cn('coreor-scrollbar w-full overflow-x-auto overflow-y-hidden', containerClassName)}>{tableElement}</div>;
});
Table.displayName = 'Table';

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />);
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => <tfoot ref={ref} className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)} {...props} />);
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)} {...props} />);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(({
  className,
  children,
  columnKey,
  resizable = true,
  ...props
}, ref) => (
  <th
    ref={ref}
    data-column-key={columnKey}
    data-resize-disabled={resizable ? undefined : 'true'}
    className={cn('group/coreor-head relative h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]', className)}
    {...props}
  >
    {children}
    {resizable && (
      <span
        data-coreor-column-resizer
        role="separator"
        aria-orientation="vertical"
        title="Sürükleyerek genişletin; çift tıklayarak içeriğe göre fit edin"
        onClick={event => event.stopPropagation()}
        className="absolute -right-1 top-0 z-40 flex h-full w-2 cursor-col-resize touch-none items-center justify-center"
      >
        <span className="h-[72%] w-px bg-transparent transition-colors group-hover/coreor-head:bg-cyan-500/35 hover:!bg-cyan-400" />
      </span>
    )}
  </th>
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => <td ref={ref} className={cn('p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]', className)} {...props} />);
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(({ className, ...props }, ref) => <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />);
TableCaption.displayName = 'TableCaption';

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
