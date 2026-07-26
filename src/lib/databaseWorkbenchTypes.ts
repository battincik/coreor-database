import type { DatabaseConnectionPayload } from 'types';

export type DatabaseWorkbenchAction =
  | 'users-list'
  | 'user-grants'
  | 'user-save'
  | 'user-drop'
  | 'privilege-change'
  | 'role-create'
  | 'role-assign'
  | 'process-list'
  | 'process-kill'
  | 'import-data'
  | 'export-data';

export interface DatabaseWorkbenchRequest {
  action: DatabaseWorkbenchAction;
  connection: DatabaseConnectionPayload;
  database?: string | null;
  [key: string]: unknown;
}

export interface DatabaseAccountInfo {
  user: string;
  host: string;
  plugin: string | null;
  accountLocked: boolean;
  passwordExpired: boolean;
  passwordLastChanged: string | null;
  isRole: boolean;
}

export interface DatabaseRoleAssignment {
  roleUser: string;
  roleHost: string;
  user: string;
  host: string;
  isDefault: boolean;
}

export interface DatabaseUsersResponse {
  users: DatabaseAccountInfo[];
  roles: DatabaseAccountInfo[];
  assignments: DatabaseRoleAssignment[];
}

export interface DatabaseUserSaveInput {
  originalUser?: string;
  originalHost?: string;
  user: string;
  host: string;
  password?: string;
  accountLocked?: boolean;
  passwordExpired?: boolean;
  createIfMissing?: boolean;
}

export type DatabasePrivilegeScope = 'global' | 'database' | 'table';
export type DatabasePrivilegeMode = 'grant' | 'revoke';

export interface DatabasePrivilegeChangeInput {
  mode: DatabasePrivilegeMode;
  user: string;
  host: string;
  scope: DatabasePrivilegeScope;
  database?: string;
  table?: string;
  privileges: string[];
  withGrantOption?: boolean;
}

export interface DatabaseProcessInfo {
  id: number;
  user: string;
  host: string;
  database: string | null;
  command: string;
  seconds: number;
  state: string | null;
  info: string | null;
}

export interface DatabaseMetadataLockInfo {
  objectType: string | null;
  schema: string | null;
  objectName: string | null;
  lockType: string | null;
  lockDuration: string | null;
  lockStatus: string | null;
  ownerThreadId: number | null;
  processId: number | null;
}

export interface DatabaseProcessCenterResponse {
  processes: DatabaseProcessInfo[];
  locks: DatabaseMetadataLockInfo[];
  deadlockText: string | null;
  currentConnectionId: number | null;
}

export interface DatabaseImportDataInput {
  database: string;
  table: string;
  columns: string[];
  rows: unknown[][];
  mode?: 'insert' | 'ignore' | 'replace';
}

export interface DatabaseImportDataResponse {
  affectedRows: number;
  rowCount: number;
}

export interface DatabaseExportDataInput {
  database: string;
  table: string;
  columns?: string[];
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface DatabaseExportDataResponse {
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
}

export const DATABASE_PRIVILEGES = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'INDEX',
  'REFERENCES', 'CREATE VIEW', 'SHOW VIEW', 'TRIGGER', 'EXECUTE', 'EVENT',
  'CREATE ROUTINE', 'ALTER ROUTINE', 'CREATE TEMPORARY TABLES', 'LOCK TABLES',
  'PROCESS', 'RELOAD', 'REPLICATION CLIENT', 'REPLICATION SLAVE', 'SHOW DATABASES'
] as const;
