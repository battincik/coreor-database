'use client';

import { translateRuntime } from '@/lib/i18nRuntime';

export interface DatabaseErrorPayload {
  error?: string;
  message?: string;
  reauthenticate?: boolean;
}

export class DatabaseClientError extends Error {
  constructor(
    message: string,
    public readonly code = 'DATABASE_CLIENT_ERROR',
    public readonly status = 0,
    public readonly hint?: string,
    public readonly retryable = false,
    public readonly reauthenticate = false
  ) {
    super(hint ? `${message} ${hint}` : message);
    this.name = 'DatabaseClientError';
  }
}

interface ErrorGuidance {
  message: string;
  hint?: string;
  retryable?: boolean;
  reauthenticate?: boolean;
}

interface ErrorGuidanceDefinition {
  messageKey: string;
  hintKey?: string;
  retryable?: boolean;
  reauthenticate?: boolean;
}

const ERROR_GUIDANCE: Record<string, ErrorGuidanceDefinition> = {
  UNAUTHORIZED: { messageKey: 'databaseErrors.unauthorized.message', hintKey: 'databaseErrors.unauthorized.hint', reauthenticate: true },
  SESSION_INVALID: { messageKey: 'databaseErrors.sessionInvalid.message', hintKey: 'databaseErrors.sessionInvalid.hint', reauthenticate: true },
  AUTH_USER_NOT_ALLOWED: { messageKey: 'databaseErrors.userNotAllowed.message', hintKey: 'databaseErrors.userNotAllowed.hint' },
  CROSS_ORIGIN_REQUEST_REJECTED: { messageKey: 'databaseErrors.crossOrigin.message', hintKey: 'databaseErrors.crossOrigin.hint' },
  DATABASE_HOST_NOT_ALLOWED: { messageKey: 'databaseErrors.hostNotAllowed.message', hintKey: 'databaseErrors.hostNotAllowed.hint' },
  PRIVATE_DATABASE_HOST_NOT_ALLOWED: { messageKey: 'databaseErrors.privateHostNotAllowed.message', hintKey: 'databaseErrors.privateHostNotAllowed.hint' },
  DATABASE_PORT_NOT_ALLOWED: { messageKey: 'databaseErrors.portNotAllowed.message', hintKey: 'databaseErrors.portNotAllowed.hint' },
  DATABASE_AUTHENTICATION_FAILED: { messageKey: 'databaseErrors.authenticationFailed.message', hintKey: 'databaseErrors.authenticationFailed.hint' },
  ER_ACCESS_DENIED_ERROR: { messageKey: 'databaseErrors.authenticationFailed.message', hintKey: 'databaseErrors.authenticationFailed.hint' },
  DATABASE_HOST_NOT_FOUND: { messageKey: 'databaseErrors.hostNotFound.message', hintKey: 'databaseErrors.hostNotFound.hint', retryable: true },
  ENOTFOUND: { messageKey: 'databaseErrors.hostNotFound.message', hintKey: 'databaseErrors.hostNotFound.hint', retryable: true },
  EAI_AGAIN: { messageKey: 'databaseErrors.dnsTemporary.message', hintKey: 'databaseErrors.dnsTemporary.hint', retryable: true },
  DATABASE_CONNECTION_TIMEOUT: { messageKey: 'databaseErrors.connectionTimeout.message', hintKey: 'databaseErrors.connectionTimeout.hint', retryable: true },
  ETIMEDOUT: { messageKey: 'databaseErrors.timeout.message', hintKey: 'databaseErrors.timeout.hint', retryable: true },
  ECONNREFUSED: { messageKey: 'databaseErrors.connectionRefused.message', hintKey: 'databaseErrors.connectionRefused.hint', retryable: true },
  DATABASE_TLS_VERIFICATION_FAILED: { messageKey: 'databaseErrors.tlsVerification.message', hintKey: 'databaseErrors.tlsVerification.hint' },
  DATABASE_NOT_FOUND: { messageKey: 'databaseErrors.databaseNotFound.message', hintKey: 'databaseErrors.databaseNotFound.hint' },
  DATABASE_TABLE_NOT_FOUND: { messageKey: 'databaseErrors.tableNotFound.message', hintKey: 'databaseErrors.tableNotFound.hint' },
  DATABASE_SQL_SYNTAX_ERROR: { messageKey: 'databaseErrors.sqlSyntax.message', hintKey: 'databaseErrors.sqlSyntax.hint' },
  ER_PARSE_ERROR: { messageKey: 'databaseErrors.parseError.message', hintKey: 'databaseErrors.parseError.hint' },
  DATABASE_UNIQUE_CONSTRAINT: { messageKey: 'databaseErrors.uniqueConstraint.message', hintKey: 'databaseErrors.uniqueConstraint.hint' },
  ER_DUP_ENTRY: { messageKey: 'databaseErrors.duplicateEntry.message', hintKey: 'databaseErrors.duplicateEntry.hint' },
  READ_ONLY_PROFILE: { messageKey: 'databaseErrors.readOnly.message', hintKey: 'databaseErrors.readOnly.hint' },
  DATABASE_RATE_LIMITED: { messageKey: 'databaseErrors.rateLimited.message', hintKey: 'databaseErrors.rateLimited.hint', retryable: true },
  DATABASE_REQUEST_TOO_LARGE: { messageKey: 'databaseErrors.requestTooLarge.message', hintKey: 'databaseErrors.requestTooLarge.hint' },
  BLOB_TOO_LARGE: { messageKey: 'databaseErrors.blobTooLarge.message', hintKey: 'databaseErrors.blobTooLarge.hint' },
  TRANSACTION_NOT_FOUND: { messageKey: 'databaseErrors.transactionNotFound.message', hintKey: 'databaseErrors.transactionNotFound.hint' },
  DATABASE_API_UNREACHABLE: { messageKey: 'databaseErrors.apiUnreachable.message', hintKey: 'databaseErrors.apiUnreachable.hint', retryable: true },
  DATABASE_API_INVALID_RESPONSE: { messageKey: 'databaseErrors.invalidResponse.message', hintKey: 'databaseErrors.invalidResponse.hint', retryable: true }
};

function localizedGuidance(definition: ErrorGuidanceDefinition): ErrorGuidance {
  return {
    message: translateRuntime(definition.messageKey),
    hint: definition.hintKey ? translateRuntime(definition.hintKey) : undefined,
    retryable: definition.retryable,
    reauthenticate: definition.reauthenticate
  };
}

function safeDetail(message: string | undefined) {
  const normalized = message
    ?.replace(/(password|passwd|pwd|secret|token|authorization)\s*[:=]\s*[^\s,;]+/gi, `$1=[${translateRuntime('databaseErrors.redacted')}]`)
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return undefined;
  return normalized.length > 480 ? `${normalized.slice(0, 477)}…` : normalized;
}

function extractNativeError(error: unknown, depth = 0): { message?: string; code?: string; status?: number } {
  if (depth > 3 || error === null || error === undefined) return {};
  if (typeof error === 'string') return { message: safeDetail(error) };
  if (error instanceof Error) {
    const candidate = error as Error & { code?: unknown; status?: unknown };
    return {
      message: safeDetail(candidate.message),
      code: typeof candidate.code === 'string' ? candidate.code : undefined,
      status: typeof candidate.status === 'number' ? candidate.status : undefined
    };
  }
  if (typeof error !== 'object') return { message: safeDetail(String(error)) };

  const value = error as Record<string, unknown>;
  const code = ['code', 'errorCode', 'kind']
    .map(key => value[key])
    .find(candidate => typeof candidate === 'string') as string | undefined;
  const status = ['status', 'statusCode']
    .map(key => value[key])
    .find(candidate => typeof candidate === 'number') as number | undefined;

  for (const key of ['message', 'error', 'reason', 'detail', 'details', 'cause']) {
    if (!(key in value)) continue;
    const nested = extractNativeError(value[key], depth + 1);
    if (nested.message) {
      return {
        message: nested.message,
        code: code || nested.code,
        status: status ?? nested.status
      };
    }
  }

  try {
    const serialized = JSON.stringify(value);
    return { message: safeDetail(serialized), code, status };
  } catch {
    return { code, status };
  }
}

function guidanceFor(code: string, status: number, serverMessage?: string): ErrorGuidance {
  const known = ERROR_GUIDANCE[code];
  if (known) return localizedGuidance(known);
  if (status === 401) return localizedGuidance(ERROR_GUIDANCE.UNAUTHORIZED);
  if (status === 403) {
    return {
      message: translateRuntime('databaseErrors.forbidden.message'),
      hint: translateRuntime('databaseErrors.forbidden.hint')
    };
  }
  if (status === 429) return localizedGuidance(ERROR_GUIDANCE.DATABASE_RATE_LIMITED);
  if (status >= 500) {
    return {
      message: translateRuntime('databaseErrors.serverFailure.message'),
      hint: translateRuntime('databaseErrors.serverFailure.hint'),
      retryable: true
    };
  }

  const detail = safeDetail(serverMessage);
  return {
    message: detail || translateRuntime('databaseErrors.generic.message'),
    hint: code ? translateRuntime('databaseErrors.errorCode',{code}) : undefined
  };
}

export function createDatabaseClientError(payload: DatabaseErrorPayload | null, status: number) {
  const code = payload?.error || (status === 401 ? 'UNAUTHORIZED' : 'DATABASE_REQUEST_FAILED');
  const guidance = guidanceFor(code, status, payload?.message);
  return new DatabaseClientError(
    guidance.message,
    code,
    status,
    guidance.hint,
    Boolean(guidance.retryable),
    Boolean(payload?.reauthenticate || guidance.reauthenticate)
  );
}

export function normalizeDatabaseClientError(error: unknown) {
  if (error instanceof DatabaseClientError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new DatabaseClientError(translateRuntime('databaseErrors.aborted.message'), 'DATABASE_REQUEST_ABORTED', 0, translateRuntime('databaseErrors.aborted.hint'), true);
  }

  const native = extractNativeError(error);
  if (native.message) {
    const code = native.code || 'DATABASE_NATIVE_ERROR';
    const status = native.status || 0;
    const guidance = guidanceFor(code, status, native.message);

    // Unknown native errors should preserve the driver's useful text instead of
    // replacing it with a generic client-side message.
    if (!ERROR_GUIDANCE[code] && status === 0) {
      return new DatabaseClientError(native.message, code, status, undefined, false);
    }
    return new DatabaseClientError(guidance.message, code, status, guidance.hint, Boolean(guidance.retryable));
  }

  return new DatabaseClientError(
    translateRuntime('databaseErrors.nativeNoDetail.message'),
    'DATABASE_NATIVE_ERROR',
    0,
    translateRuntime('databaseErrors.nativeNoDetail.hint'),
    true
  );
}

export async function readDatabaseApiResponse<T>(response: Response) {
  const raw = await response.text();
  let body: T | DatabaseErrorPayload | null = null;

  if (raw) {
    try {
      body = JSON.parse(raw) as T | DatabaseErrorPayload;
    } catch {
      throw new DatabaseClientError(
        translateRuntime('databaseErrors.unreadableResponse.message'),
        'DATABASE_API_INVALID_RESPONSE',
        response.status,
        translateRuntime('databaseErrors.unreadableResponse.hint'),
        true
      );
    }
  }

  if (!response.ok) throw createDatabaseClientError(body as DatabaseErrorPayload | null, response.status);
  return body as T;
}
