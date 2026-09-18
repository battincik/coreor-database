/* eslint-disable @typescript-eslint/no-explicit-any */

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
  | 'schema-overview'
  | 'database-objects'
  | 'table-data'
  | 'update-cell'
  | 'insert-row'
  | 'delete-rows'
  | 'alter-table'
  | 'query';

export interface DatabaseConnectionPayload {
  /** Stored profiles use this ID so Rust can resolve the password from the encrypted local vault. */
  serverId?: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  username: string;
  /** Transient only: used for unsaved connection tests and immediately sealed when a profile is saved. */
  password?: string;
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

export type DatabaseObjectKind = 'table' | 'view' | 'procedure' | 'function' | 'trigger' | 'event';

export interface DatabaseSchemaObject {
  name: string;
  kind: DatabaseObjectKind;
  schema?: string | null;
  tableName?: string | null;
  definition?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  comment?: string | null;
  rows?: number | null;
  dataSizeBytes?: number | null;
  indexSizeBytes?: number | null;
  sizeBytes?: number | null;
}

export interface DatabaseObjectsResponse {
  supported: boolean;
  objects: DatabaseSchemaObject[];
  _meta?: DatabaseQueryMeta;
}

export interface SchemaOverviewResponse {
  supported: boolean;
  tables: Array<Record<string, unknown>>;
  columns: Array<Record<string, unknown>>;
  indexes: Array<Record<string, unknown>>;
  foreignKeys: Array<Record<string, unknown>>;
  _meta?: DatabaseQueryMeta;
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
  /** Transient only. Saved profiles never return a plaintext password to the UI. */
  password?: string;
  /** Runtime-only marker; never persisted inside the encrypted profile payload. */
  credentialRef?: string;
  credentialState?: 'stored' | 'missing';
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

export interface TableRowInsertValue {
  mode: 'value' | 'null' | 'default';
  value?: unknown;
}

export interface TableRowInsertInput {
  database: string;
  table: string;
  values: Record<string, TableRowInsertValue>;
}

export interface TableRowInsertResponse {
  affectedRows: number;
  insertId?: string | number | null;
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
  Data_type: string;
  Character_maximum_length: number | null;
  Numeric_precision: number | null;
  Numeric_scale: number | null;
  Datetime_precision: number | null;
  Character_set_name: string | null;
  Generation_expression: string;
}

export interface TableIndexInfo {
  Key_name: string;
  Column_name: string;
  Non_unique: string;
  Seq_in_index: string;
  Index_type: string;
  Collation: string | null;
  Cardinality: number | null;
  Sub_part: number | null;
  Nullable: string;
  Index_comment: string;
  Is_visible: string;
  Expression: string | null;
}

export interface TableForeignKeyInfo {
  CONSTRAINT_NAME: string;
  COLUMN_NAME: string;
  ORDINAL_POSITION: number;
  REFERENCED_TABLE_SCHEMA: string;
  REFERENCED_TABLE_NAME: string;
  REFERENCED_COLUMN_NAME: string;
  UPDATE_RULE: string;
  DELETE_RULE: string;
}

export interface TableCheckConstraintInfo {
  CONSTRAINT_NAME: string;
  CHECK_CLAUSE: string;
  ENFORCED: string;
}

export interface TablePartitionInfo {
  PARTITION_NAME: string | null;
  PARTITION_METHOD: string | null;
  PARTITION_EXPRESSION: string | null;
  PARTITION_DESCRIPTION: string | null;
  TABLE_ROWS: number;
  DATA_LENGTH: number;
  INDEX_LENGTH: number;
}

export interface TableOptionsInfo {
  name: string;
  comment: string;
  engine: string;
  collation: string | null;
  charset: string | null;
  autoIncrement: string | number | null;
  rowFormat: string | null;
  tableType: string;
  createTime: string | null;
  updateTime: string | null;
}

export interface TableInfo {
  table: TableOptionsInfo;
  columns: TableColumnInfo[];
  indexes: TableIndexInfo[];
  foreignKeys: TableForeignKeyInfo[];
  checkConstraints: TableCheckConstraintInfo[];
  partitions: TablePartitionInfo[];
  createSQL: string;
  _meta?: DatabaseQueryMeta;
}

export interface SchemaOverviewResponse {
  supported: boolean;
  tables: Array<Record<string, unknown>>;
  columns: Array<Record<string, unknown>>;
  indexes: Array<Record<string, unknown>>;
  foreignKeys: Array<Record<string, unknown>>;
  _meta?: DatabaseQueryMeta;
}

export type ColumnDefaultKind = 'none' | 'null' | 'literal' | 'expression';

export interface TableColumnDefinition {
  name: string;
  dataType: string;
  length?: string;
  unsigned?: boolean;
  zerofill?: boolean;
  nullable?: boolean;
  autoIncrement?: boolean;
  defaultKind?: ColumnDefaultKind;
  defaultValue?: string;
  comment?: string;
  charset?: string;
  collation?: string;
  generatedExpression?: string;
  generatedStorage?: 'VIRTUAL' | 'STORED';
}

export interface TableIndexColumnDefinition {
  name: string;
  length?: number | null;
  order?: 'ASC' | 'DESC';
}

export type TableIndexKind = 'PRIMARY' | 'INDEX' | 'UNIQUE' | 'FULLTEXT' | 'SPATIAL';

export interface TableIndexDefinition {
  kind: TableIndexKind;
  name?: string;
  columns: TableIndexColumnDefinition[];
  comment?: string;
}

export interface TableForeignKeyDefinition {
  name: string;
  columns: string[];
  referencedDatabase?: string;
  referencedTable: string;
  referencedColumns: string[];
  onDelete?: 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'NO ACTION';
  onUpdate?: 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'NO ACTION';
}

export type TableSchemaMutation =
  | {
      kind: 'table-options';
      name?: string;
      comment?: string;
      engine?: string;
      collation?: string;
      autoIncrement?: number | null;
      rowFormat?: string | null;
    }
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

export interface QueryExecutionResult {
  rows: Record<string, unknown>[];
  affectedRows?: number;
  insertId?: string | number;
  warningStatus?: number;
  fields?: Array<{ name: string; type: string | number }>;
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
  runImmediately?: boolean;
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
