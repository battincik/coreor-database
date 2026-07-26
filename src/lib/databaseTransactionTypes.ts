import type { DatabaseConnectionPayload, QueryExecutionResult } from 'types';

export type DatabaseTransactionAction =
  | 'transaction-begin'
  | 'transaction-query'
  | 'transaction-commit'
  | 'transaction-rollback'
  | 'transaction-status';

export interface DatabaseTransactionStatement {
  id: string;
  sql: string;
  executedAt: string;
  durationMs: number;
  rowCount: number;
  affectedRows: number;
  status: 'success' | 'error';
  error?: string;
}

export interface DatabaseTransactionState {
  transactionId: string;
  database: string | null;
  startedAt: string;
  lastActivityAt: string;
  expiresAt: string;
  statements: DatabaseTransactionStatement[];
}

export interface DatabaseTransactionRequest {
  action: DatabaseTransactionAction;
  connection?: DatabaseConnectionPayload;
  database?: string | null;
  transactionId?: string;
  sql?: string;
}

export interface DatabaseTransactionBeginResponse {
  transaction: DatabaseTransactionState;
}

export interface DatabaseTransactionQueryResponse {
  transaction: DatabaseTransactionState;
  result: QueryExecutionResult;
}

export interface DatabaseTransactionFinishResponse {
  transactionId: string;
  status: 'committed' | 'rolled-back';
  statementCount: number;
}

export interface DatabaseTransactionStatusResponse {
  transactions: DatabaseTransactionState[];
}
