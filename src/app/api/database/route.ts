import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions, isGithubUserAuthorized } from '@/lib/auth-options';
import { DatabaseServiceError, executeDatabaseRequest } from '@/lib/server/database-service';
import { executeExtendedDatabaseRequest, isExtendedDatabaseEngine } from '@/lib/server/extended-database-service';
import {
  executeDatabaseWorkbenchRequest,
  isDatabaseWorkbenchAction
} from '@/lib/server/database-workbench-service';
import { executeDatabasePerformanceRequest } from '@/lib/server/database-performance-service';
import {
  executeDatabaseTransactionRequest,
  isDatabaseTransactionAction
} from '@/lib/server/database-transaction-service';
import type { DatabaseWorkbenchRequest } from '@/lib/databaseWorkbenchTypes';
import type { DatabaseTransactionRequest } from '@/lib/databaseTransactionTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type DatabaseRoutePayload =
  | Parameters<typeof executeDatabaseRequest>[0]
  | DatabaseWorkbenchRequest
  | DatabaseTransactionRequest;

const RATE_LIMIT_WINDOW_MS = 60_000;
const SESSION_COOKIE_PREFIXES = ['next-auth.session-token', '__Secure-next-auth.session-token'];
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
const READ_ONLY_ACTIONS = new Set([
  'update-cell',
  'delete-rows',
  'alter-table',
  'user-save',
  'user-drop',
  'privilege-change',
  'role-create',
  'role-assign',
  'process-kill',
  'import-data',
  'transaction-begin',
  'transaction-query',
  'transaction-commit',
  'transaction-rollback'
]);
const SAFE_ERROR_PREFIXES = [
  'DATABASE_', 'INVALID_', 'UNSUPPORTED_', 'MISSING_', 'INCOMPLETE_', 'PRIVATE_',
  'READ_ONLY_', 'CROSS_ORIGIN_', 'TRANSACTION_', 'BLOB_', 'EMPTY_', 'TABLE_',
  'COLUMN_', 'INDEX_', 'FOREIGN_', 'CHECK_', 'ROLE_', 'USER_', 'PRIVILEGE_',
  'PROCESS_', 'IMPORT_', 'EXPORT_', 'SESSION_', 'AUTH_', 'QUERY_', 'SCHEMA_'
];

function noStoreHeaders() {
  return { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };
}

function splitEnvironmentList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function maximumRequestBytes() {
  const configured = Number(process.env.DATABASE_API_MAX_BODY_BYTES || 12_000_000);
  if (!Number.isFinite(configured)) return 12_000_000;
  return Math.min(Math.max(Math.trunc(configured), 1_000_000), 25_000_000);
}

function rateLimitRequests() {
  const configured = Number(process.env.DATABASE_RATE_LIMIT_REQUESTS || 300);
  if (!Number.isFinite(configured)) return 300;
  return Math.min(Math.max(Math.trunc(configured), 30), 2_000);
}

function trustedOrigins() {
  const candidates = [
    process.env.NEXTAUTH_URL,
    process.env.AUTH_URL,
    ...splitEnvironmentList(process.env.AUTH_TRUSTED_ORIGINS)
  ];
  const origins = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    try {
      origins.add(new URL(candidate.trim()).origin);
    } catch {
      // Invalid entries are ignored here and fail closed below in production.
    }
  }
  return origins;
}

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) {
    if (request.headers.get('sec-fetch-site') === 'cross-site') {
      throw new DatabaseServiceError('Çapraz origin veritabanı isteği reddedildi.', 403, 'CROSS_ORIGIN_REQUEST_REJECTED');
    }
    return;
  }

  const allowedOrigins = trustedOrigins();
  if (allowedOrigins.size === 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new DatabaseServiceError(
        'Üretim origin yapılandırması eksik. NEXTAUTH_URL veya AUTH_TRUSTED_ORIGINS tanımlanmalıdır.',
        500,
        'DATABASE_ORIGIN_CONFIGURATION_ERROR'
      );
    }
    allowedOrigins.add(request.nextUrl.origin);
  }

  try {
    if (!allowedOrigins.has(new URL(origin).origin)) throw new Error('origin mismatch');
  } catch {
    throw new DatabaseServiceError('Çapraz origin veritabanı isteği reddedildi.', 403, 'CROSS_ORIGIN_REQUEST_REJECTED');
  }
}

function matchesHostPattern(host: string, pattern: string) {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === pattern;
}

function assertProductionConnectionPolicy(payload: DatabaseRoutePayload) {
  const requireAllowlist =
    process.env.DATABASE_REQUIRE_HOST_ALLOWLIST?.trim().toLowerCase() !== 'false' && process.env.NODE_ENV === 'production';
  if (!requireAllowlist) return;

  const connection = payload.connection as { host?: unknown } | undefined;
  const host = typeof connection?.host === 'string' ? connection.host.trim().toLowerCase() : '';
  if (!host) return;

  const allowedHosts = splitEnvironmentList(process.env.DATABASE_ALLOWED_HOSTS).map(item => item.toLowerCase());
  if (allowedHosts.length === 0 || allowedHosts.includes('*')) {
    throw new DatabaseServiceError(
      'Üretimde DATABASE_ALLOWED_HOSTS açık bir host allowlist içermelidir; * kullanılamaz.',
      500,
      'DATABASE_HOST_ALLOWLIST_CONFIGURATION_ERROR'
    );
  }
  if (!allowedHosts.some(pattern => matchesHostPattern(host, pattern))) {
    throw new DatabaseServiceError(
      'Bu veritabanı hostu üretim allowlist politikasında izinli değil.',
      403,
      'DATABASE_HOST_NOT_ALLOWED'
    );
  }

  const allowedPorts = splitEnvironmentList(process.env.DATABASE_ALLOWED_PORTS);
  if (allowedPorts.includes('*')) {
    throw new DatabaseServiceError(
      'Üretimde DATABASE_ALLOWED_PORTS için * kullanılamaz.',
      500,
      'DATABASE_PORT_ALLOWLIST_CONFIGURATION_ERROR'
    );
  }
}

function getSessionCookieNames(request: NextRequest) {
  return request.cookies.getAll().map(cookie => cookie.name).filter(name => SESSION_COOKIE_PREFIXES.some(prefix => name === prefix || name.startsWith(`${prefix}.`)));
}

function unauthorizedResponse(request: NextRequest) {
  const sessionCookieNames = getSessionCookieNames(request);
  const hasUnreadableSessionCookie = sessionCookieNames.length > 0;
  const response = NextResponse.json(
    {
      error: hasUnreadableSessionCookie ? 'SESSION_INVALID' : 'UNAUTHORIZED',
      message: hasUnreadableSessionCookie
        ? 'Oturum doğrulanamadı ve temizlendi. GitHub ile yeniden giriş yapın.'
        : 'Veritabanı işlemi için GitHub ile giriş yapmalısınız.',
      reauthenticate: true
    },
    { status: 401, headers: noStoreHeaders() }
  );

  for (const cookieName of sessionCookieNames) {
    response.cookies.set({
      name: cookieName,
      value: '',
      expires: new Date(0),
      maxAge: 0,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieName.startsWith('__Secure-')
    });
  }
  return response;
}

function forbiddenResponse() {
  return NextResponse.json(
    {
      error: 'AUTH_USER_NOT_ALLOWED',
      message: 'Bu GitHub hesabının veritabanı çalışma alanına erişim izni yok.'
    },
    { status: 403, headers: noStoreHeaders() }
  );
}

function applyRateLimit(identity: string) {
  const now = Date.now();
  if (requestBuckets.size > 500) {
    for (const [key, bucket] of requestBuckets) if (bucket.resetAt <= now) requestBuckets.delete(key);
  }
  const bucket = requestBuckets.get(identity);
  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(identity, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  if (bucket.count >= rateLimitRequests()) {
    throw new DatabaseServiceError('Çok fazla veritabanı isteği gönderildi. Kısa süre sonra tekrar deneyin.', 429, 'DATABASE_RATE_LIMITED');
  }
  bucket.count += 1;
}

function isMutatingSql(sql: unknown) {
  if (typeof sql !== 'string') return false;
  const normalized = sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();
  return /^(?:INSERT|UPDATE|DELETE|REPLACE|MERGE|ALTER|CREATE|DROP|TRUNCATE|RENAME|GRANT|REVOKE|CALL|EXEC(?:UTE)?|LOAD\s+DATA|LOCK\s+TABLES|UNLOCK\s+TABLES|SET\s+(?:GLOBAL|SESSION)?\s*(?:TRANSACTION|AUTOCOMMIT)|BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\b/i.test(normalized);
}

function assertReadOnlyPolicy(payload: { action?: unknown; connection?: { readOnly?: unknown }; sql?: unknown }) {
  if (!payload.connection?.readOnly) return;
  const action = typeof payload.action === 'string' ? payload.action : '';
  if (READ_ONLY_ACTIONS.has(action) || (action === 'query' && isMutatingSql(payload.sql))) {
    throw new DatabaseServiceError(
      'Bu bağlantı profili salt-okunur. Yazma, şema, yetki, import, process sonlandırma ve transaction işlemleri engellendi.',
      403,
      'READ_ONLY_PROFILE'
    );
  }
}

function isSafeApplicationError(code: string) {
  return SAFE_ERROR_PREFIXES.some(prefix => code.startsWith(prefix)) || code === 'UNAUTHORIZED';
}

function normalizeRouteError(error: unknown) {
  const candidate = error as { code?: string; message?: string; status?: number; queryMeta?: unknown };
  const code = candidate?.code || 'DATABASE_API_ERROR';

  if (error instanceof DatabaseServiceError && isSafeApplicationError(code)) return error;
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return new DatabaseServiceError('Veritabanı host adresi çözümlenemedi.', 422, 'DATABASE_HOST_NOT_FOUND');
  if (['ETIMEDOUT', 'PROTOCOL_SEQUENCE_TIMEOUT', 'ECONNREFUSED'].includes(code)) return new DatabaseServiceError('Veritabanı sunucusuna bağlanılamadı.', 504, 'DATABASE_CONNECTION_TIMEOUT');
  if (['ER_ACCESS_DENIED_ERROR', '28P01', 'ELOGIN'].includes(code)) return new DatabaseServiceError('Veritabanı kullanıcı adı veya parolayı reddetti.', 422, 'DATABASE_AUTHENTICATION_FAILED');
  if (['ER_BAD_DB_ERROR', '3D000'].includes(code)) return new DatabaseServiceError('Seçilen veritabanı bulunamadı veya erişilemiyor.', 422, 'DATABASE_NOT_FOUND');
  if (['ER_NO_SUCH_TABLE', '42P01'].includes(code)) return new DatabaseServiceError('İstenen tablo bulunamadı.', 422, 'DATABASE_TABLE_NOT_FOUND');
  if (['ER_PARSE_ERROR', '42601'].includes(code)) return new DatabaseServiceError('SQL sözdizimi veritabanı tarafından reddedildi.', 422, 'DATABASE_SQL_SYNTAX_ERROR');
  if (['ER_DUP_ENTRY', '23505'].includes(code)) return new DatabaseServiceError('Bu işlem benzersiz alan kısıtını ihlal ediyor.', 409, 'DATABASE_UNIQUE_CONSTRAINT');
  if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN'].includes(code)) {
    return new DatabaseServiceError('Veritabanı TLS sertifikası doğrulanamadı.', 422, 'DATABASE_TLS_VERIFICATION_FAILED');
  }

  const status = error instanceof DatabaseServiceError && error.status >= 500 ? error.status : 500;
  return new DatabaseServiceError('Beklenmeyen bir veritabanı API hatası oluştu.', status, 'DATABASE_API_ERROR');
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const maximumBytes = maximumRequestBytes();
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > maximumBytes) {
      throw new DatabaseServiceError(`Veritabanı isteği izin verilen ${(maximumBytes / 1024 / 1024).toFixed(1)} MB sınırını aşıyor.`, 413, 'DATABASE_REQUEST_TOO_LARGE');
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) return unauthorizedResponse(request);

    const user = session.user as typeof session.user & { id?: string };
    const userId = user.id?.trim() || null;
    if (!userId || !isGithubUserAuthorized(userId)) return forbiddenResponse();
    applyRateLimit(userId);

    const rawBody = await request.text();
    const actualBytes = Buffer.byteLength(rawBody, 'utf8');
    if (actualBytes > maximumBytes) {
      throw new DatabaseServiceError(`Veritabanı isteği izin verilen ${(maximumBytes / 1024 / 1024).toFixed(1)} MB sınırını aşıyor.`, 413, 'DATABASE_REQUEST_TOO_LARGE');
    }

    const parsedBody = JSON.parse(rawBody) as unknown;
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      throw new DatabaseServiceError('Veritabanı isteği bir JSON nesnesi olmalıdır.', 400, 'INVALID_DATABASE_PAYLOAD');
    }
    const payload = parsedBody as DatabaseRoutePayload;
    const action = payload.action;
    assertProductionConnectionPolicy(payload);
    assertReadOnlyPolicy(payload);
    if (isDatabaseTransactionAction(action) && !userId) {
      throw new DatabaseServiceError('Transaction oturumu için kararlı kullanıcı kimliği bulunamadı. GitHub ile yeniden giriş yapın.', 401, 'TRANSACTION_OWNER_IDENTITY_REQUIRED');
    }

    const engine = payload.connection?.engine;
    const isExtendedCoreAction = isExtendedDatabaseEngine(engine) && !isDatabaseWorkbenchAction(action) && !isDatabaseTransactionAction(action);
    const mysqlProtocolPayload = engine === 'tidb' && payload.connection
      ? { ...payload, connection: { ...payload.connection, engine: 'mysql' as const } }
      : payload;

    const result = isDatabaseTransactionAction(action)
      ? await executeDatabaseTransactionRequest(payload as DatabaseTransactionRequest, userId)
      : action === 'performance-snapshot'
        ? await executeDatabasePerformanceRequest(payload as DatabaseWorkbenchRequest)
        : isDatabaseWorkbenchAction(action)
          ? await executeDatabaseWorkbenchRequest(payload as DatabaseWorkbenchRequest)
          : isExtendedCoreAction
            ? await executeExtendedDatabaseRequest(payload as unknown as Parameters<typeof executeExtendedDatabaseRequest>[0])
            : await executeDatabaseRequest(mysqlProtocolPayload as unknown as Parameters<typeof executeDatabaseRequest>[0]);
    return NextResponse.json(result, { status: 200, headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Veritabanı isteği geçerli JSON içermiyor.' }, { status: 400, headers: noStoreHeaders() });
    }
    const databaseError = normalizeRouteError(error);
    const headers = {
      ...noStoreHeaders(),
      ...(databaseError.status === 429 ? { 'Retry-After': '60' } : {})
    };
    return NextResponse.json(
      {
        error: databaseError.code,
        message: databaseError.message,
        ...(databaseError.status < 500 && databaseError.queryMeta ? { _meta: databaseError.queryMeta } : {})
      },
      { status: databaseError.status, headers }
    );
  }
}
