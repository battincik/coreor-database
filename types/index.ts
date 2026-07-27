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

export type DatabaseEngine = 'mysql' | 'mariadb' | 'tidb' | 'postgresql' | 'cockroachdb' | 'mssql';
export type DatabaseEngineFamily = 'mysql' | 'postgresql' | 'mssql';
export type DatabaseSslMode = 'required' | 'preferred' | 'disabled';
export type DatabaseApiAction =
  | 'test'
  | 'catalog'
  | 'table-info'
  | 'table-data'
  | 'update-cell'
  | 'delete-rows'
  | 'alter-table'
  | 'query';

export interface DatabaseConnectionPayload {
  engine: DatabaseEngine;
  host: string;
  port: number;
  username: string;
  password: string;
  database?: string | null;
  sslMode: DatabaseSslMode;
  connectTimeoutMs?: number;
  readOnly?: boolean;
}

export interface OrganizationDatabaseBinding {
  serverId: string;
  databaseName: string;
}

export type OrganizationRole = 'owner' | 'admin' | 'developer' | 'analyst' | 'viewer';

export interface DatabaseOrganizationMember {
  id: string;
  name: string;
  email: string;
  role: OrganizationRole;
  status: 'active' | 'invited' | 'suspended';
  addedAt: string;
}

export interface DatabaseOrganization {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatar?: string;
  ownerEmail: string;
  members: DatabaseOrganizationMember[];
  databases: OrganizationDatabaseBinding[];
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseTable {
  tableName: string;
  tableType: string;
  comment: string;
  rows: number;
  columns: number;
  sizeMB: string;
  dataSizeMB: string;
  indexSizeMB: string;
  freeSizeMB: string;
  avgRowLength: number;
  createdAt: string | null;
  updatedAt: string | null;
  engine: string;
  rowFormat: string | null;
  collation: string | null;
  autoIncrement: string | number | null;
  indexCount: number;
  foreignKeyCount: number;
}

export interface DatabaseCatalogItem {
  name: string;
  defaultCharset: string | null;
  defaultCollation: string | null;
  tableCount: number;
  totalRows: number;
  dataSizeMB: string;
  indexSizeMB: string;
  totalSizeMB: string;
  tables: string[];
  tableDetails: DatabaseTable[];
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
  readOnly?: boolean;
  visibleTo?: string[];
  organizationId?: string | null;
  databases?: DatabaseCatalogItem[];
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

export interface TableRowsDeleteInput {
  database: string;
  table: string;
  primaryKeys: Record<string, unknown>[];
}

export interface TableRowsDeleteResponse {
  affectedRows: number;
  _meta?: DatabaseQueryMeta;
}

export interface TableColumnInfo {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
  Comment: string;
  Collation: string | null;
  Ordinal_position: number;
}

export interface TableIndexColumn {
  name: string;
  length: number | null;
  order: 'ASC' | 'DESC';
}

export interface TableIndexInfo {
  name: string;
  kind: 'PRIMARY' | 'UNIQUE' | 'KEY' | 'FULLTEXT' | 'SPATIAL';
  unique: boolean;
  indexType: string;
  columns: TableIndexColumn[];
  comment: string;
  visible: boolean;
}

export interface TableForeignKeyInfo {
  name: string;
  columns: string[];
  referencedDatabase: string;
  referencedTable: string;
  referencedColumns: string[];
  onUpdate: string;
  onDelete: string;
}

export interface TableInfo {
  columns: TableColumnInfo[];
  indexes: TableIndexInfo[];
  foreignKeys: TableForeignKeyInfo[];
  table: DatabaseTable | null;
  createSql: string;
  _meta?: DatabaseQueryMeta;
}

export interface QueryExecutionResult {
  rows: Record<string, unknown>[];
  fields?: Array<{ name: string; type?: number | string }>;
  affectedRows?: number;
  insertId?: unknown;
  warningStatus?: number;
  maximumRows?: number;
  _meta?: DatabaseQueryMeta;
}

export interface TableColumnDefinition {
  name: string;
  dataType: string;
  length?: string;
  nullable: boolean;
  unsigned?: boolean;
  zerofill?: boolean;
  autoIncrement?: boolean;
  defaultKind?: 'none' | 'null' | 'literal' | 'expression';
  defaultValue?: string;
  comment?: string;
  charset?: string;
  collation?: string;
  generatedExpression?: string;
  generatedStorage?: 'VIRTUAL' | 'STORED';
}

export interface TableIndexDefinition {
  name: string;
  kind: 'PRIMARY' | 'UNIQUE' | 'KEY' | 'FULLTEXT' | 'SPATIAL';
  columns: TableIndexColumn[];
  comment?: string;
}

export interface TableForeignKeyDefinition {
  name: string;
  columns: string[];
  referencedDatabase?: string;
  referencedTable: string;
  referencedColumns: string[];
  onUpdate?: string;
  onDelete?: string;
}

export type TableSchemaMutation =
  | { kind: 'table-options'; name?: string; engine?: string; collation?: string; autoIncrement?: number | null; rowFormat?: string; comment?: string }
  | { kind: 'add-column'; column: TableColumnDefinition; first?: boolean; after?: string | null }
  | { kind: 'modify-column'; originalName: string; column: TableColumnDefinition; first?: boolean; after?: string | null }
  | { kind: 'drop-column'; columnName: string }
  | { kind: 'add-index'; index: TableIndexDefinition }
  | { kind: 'drop-index'; indexName: string }
  | { kind: 'add-foreign-key'; foreignKey: TableForeignKeyDefinition }
  | { kind: 'drop-foreign-key'; constraintName: string };

export interface TableSchemaMutationInput {
  database: string;
  table: string;
  mutation: TableSchemaMutation;
}

export interface TableSchemaMutationResponse {
  tableName: string;
  tableInfo: TableInfo;
  _meta?: DatabaseQueryMeta;
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

export interface SidebarProps {
  onDatabaseSelect: (databaseName: string | null) => void;
  onTableSelect: (tableName: string | null) => void;
  selectedDatabase: string | null;
  selectedTable: string | null;
}

export interface EditorQueryTab {
  id: string;
  title: string;
  serverId: string | null;
  databaseName: string | null;
  sql: string;
  isRunning: boolean;
  result: QueryExecutionResult | null;
  error: string | null;
  runImmediately?: boolean;
  createdAt: string;
  updatedAt: string;
}
