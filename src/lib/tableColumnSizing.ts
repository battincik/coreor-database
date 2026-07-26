'use client';

export const TABLE_COLUMN_ACTION_EVENT = 'coreor:table-column-action';

export type TableColumnAction = 'fit-all' | 'reset';

export interface TableColumnActionDetail {
  storageKey: string;
  action: TableColumnAction;
}

export function requestTableColumnAction(storageKey: string, action: TableColumnAction) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<TableColumnActionDetail>(TABLE_COLUMN_ACTION_EVENT, {
    detail: { storageKey, action }
  }));
}
