/* eslint-disable @typescript-eslint/no-explicit-any */

import { SignInOptions } from 'next-auth/react';

export interface HandleLoginOptions extends SignInOptions {
  callbackUrl: string;
}

export type ProviderType = 'github' | 'google' | 'twitter' | 'facebook' | 'apple';

export interface DatabasePanelProps {
  selectedDatabase: string | null;
  selectedTable: string | null;
  selectedServerId?: string | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  query: string;
  setQuery: (query: string) => void;
  onDatabaseSelect: (dbName: string | null) => void;
  onTableSelect: (tableName: string | null) => void;
}

export type DatabaseEngine = 'mysql' | 'mariadb';
export type DatabaseSslMode = 'required' | 'preferred' | 'disabled';
export type DatabaseApiAction = 'test' | 'catalog' | 'table-info' | 'table-data' | 'update-cell' | 'query';

export interface DatabaseConnectionPayload {
  engine: DatabaseEngine;
  host: string;
  port: number;
  username: string;
  password: string;
  database?: string | null;
  sslMode: DatabaseSslMode;
  connectTimeoutMs?: number;
}

export interface DatabaseServerConfig {
  id: string;
  name: string;
  /** Eski connector kayıtlarını okuyabilmek için geriye dönük alanlar. */
  connectorUrl?: string;
  baseUrl?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  databaseName?: string;
  databaseType?: DatabaseEngine;
  version?: string;
  sslMode?: DatabaseSslMode;
  connectionTimeoutMs?: number;
  visibleTo?: string[];
  databases?: { name: string; tables: string[] }[];
  createdAt?: string;
  updatedAt?: string;
}

export interface DatabaseQueryStatement {
  sql: string;
  parameters?: unknown[];
  label?: string;
}

export interface DatabaseQueryMeta {
  statements: DatabaseQueryStatement[];
}

export type TableDataSortDirection = 'asc' | 'desc';

export interface TableDataSort {
  column: string;
  direction: TableDataSortDirection;
}

export type TableDataFilterOperator =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'isNull'
  | 'isNotNull';

export interface TableDataFilter {
  id?: string;
  column: string;
  operator: TableDataFilterOperator;
  value?: string;
}

export interface TableDataPagination {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface TableDataResponse {
  data: Record<string, unknown>[];
  pagination: TableDataPagination;
  sorts: TableDataSort[];
  filters: TableDataFilter[];
  _meta?: DatabaseQueryMeta;
}

export interface TableCellUpdateInput {
  database: string;
  table: string;
  column: string;
  value: unknown;
  primaryKey: Record<string, unknown>;
}

export interface TableCellUpdateResponse {
  affectedRows: number;
  changedRows?: number;
  value: unknown;
  _meta?: DatabaseQueryMeta;
}

export interface TableInfo {
  columns: {
    Field: string;
    Type: string;
    Null: string;
    Key: string;
    Default: string | null;
    Extra: string;
  }[];
  indexes: {
    Key_name: string;
    Column_name: string;
    Non_unique: string;
    Seq_in_index: string;
  }[];
  foreignKeys: {
    COLUMN_NAME: string;
    REFERENCED_TABLE_NAME: string;
    REFERENCED_COLUMN_NAME: string;
  }[];
  createSQL: string;
  _meta?: DatabaseQueryMeta;
}

export interface QueryExecutionResult {
  rows: Record<string, unknown>[];
  affectedRows?: number;
  insertId?: string | number;
  warningStatus?: number;
  fields?: Array<{ name: string; type: number }>;
  maximumRows?: number;
  _meta?: DatabaseQueryMeta;
}

export interface EditorQueryTab {
  id: string;
  title: string;
  serverId: string | null;
  databaseName: string | null;
  sql: string;
  isRunning: boolean;
  error?: string | null;
  result?: QueryExecutionResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface GridRuntimeStatus {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  filters: number;
  sorts: number;
  isLoading: boolean;
}

export interface DatabaseTable {
  tableName: string;
  comment: string;
  rows: number;
  columns: number;
  sizeMB: string;
  createdAt: string;
  updatedAt: string | null;
  engine: string;
  indexCount: number;
  foreignKeyCount: number;
}

export interface EditorPanelProps {
  query: string;
  setQuery: (query: string) => void;
  openTables: { dbName: string; tableName: string }[];
  onTabChange: (tabId: string) => void;
  activeTab: string;
}

export interface Tab {
  id: string;
  label: string;
  content: string;
  type: 'table' | 'query';
  dbName?: string;
  tableName?: string;
}

export interface ResultsPanelProps {
  results: Record<string, any>[];
}

export interface SidebarProps {
  selectedServerId?: string | null;
  onDatabaseSelect: (dbName: string | null) => void;
  onTableSelect: (tableName: string | null) => void;
  selectedDatabase: string | null;
  selectedTable: string | null;
}
