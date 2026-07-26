import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth-options';
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

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 120;
const SESSION_COOKIE_PREFIXES = ['next-auth.session-token', '__Secure-next-auth.session-token'];
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function noStoreHeaders() {
  return { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };
}

function maximumRequestBytes() {
  const configured = Number(process.env.DATABASE_API_MAX_BODY_BYTES || 12_000_000);
  if (!Number.isFinite(configured)) return 12_000_000;
  return Math.min(Math.max(Math.trunc(configured), 1_000_000), 25_000_000);
}

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const expectedHost = forwardedHost || request.headers.get('host');
  try {
    if (!expectedHost || new URL(origin).host !== expectedHost) throw new Error('origin mismatch');
  } catch {
    throw new DatabaseServiceError('Çapraz origin veritabanı isteği reddedildi.', 403, 'CROSS_ORIGIN_REQUEST_REJECTED');
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
        ? 'Oturum çerezi doğrulanamadı ve temizlendi. NEXTAUTH_SECRET ayarını sabit tutup GitHub ile yeniden giriş yapın.'
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

function applyRateLimit(identity: string) {
  const now = Date.now();
  if (requestBuckets.size > 1000) {
    for (const [key, bucket] of requestBuckets) if (bucket.resetAt <= now) requestBuckets.delete(key);
  }
  const bucket = requestBuckets.get(identity);
  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(identity, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  if (bucket.count >= RATE_LIMIT_REQUESTS) {
    throw new DatabaseServiceError('Çok fazla veritabanı isteği gönderildi. Bir dakika sonra tekrar deneyin.', 429, 'DATABASE_RATE_LIMITED');
  }
  bucket.count += 1;
}

function normalizeRouteError(error: unknown) {
  if (error instanceof DatabaseServiceError) return error;
  const candidate = error as { code?: string; message?: string };
  const code = candidate?.code || 'DATABASE_API_ERROR';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return new DatabaseServiceError('Veritabanı host adresi çözümlenemedi.', 422, code);
  if (['ETIMEDOUT', 'ECONNREFUSED'].includes(code)) return new DatabaseServiceError('Veritabanı sunucusuna bağlanılamadı.', 504, code);
  return new DatabaseServiceError(candidate?.message || 'Beklenmeyen bir veritabanı API hatası oluştu.', 500, code);
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
    const stableIdentity = user.id || user.email || null;
    applyRateLimit(stableIdentity || 'authenticated-user');

    const rawBody = await request.text();
    const actualBytes = Buffer.byteLength(rawBody, 'utf8');
    if (actualBytes > maximumBytes) {
      throw new DatabaseServiceError(`Veritabanı isteği izin verilen ${(maximumBytes / 1024 / 1024).toFixed(1)} MB sınırını aşıyor.`, 413, 'DATABASE_REQUEST_TOO_LARGE');
    }

    const payload = JSON.parse(rawBody) as Parameters<typeof executeDatabaseRequest>[0] & { action?: unknown };
    if (isDatabaseTransactionAction(payload.action) && !stableIdentity) {
      throw new DatabaseServiceError('Transaction oturumu için kararlı kullanıcı kimliği bulunamadı. GitHub ile yeniden giriş yapın.', 401, 'TRANSACTION_OWNER_IDENTITY_REQUIRED');
    }

    const engine = (payload as { connection?: { engine?: unknown } }).connection?.engine;
    const isExtendedCoreAction = isExtendedDatabaseEngine(engine) && !isDatabaseWorkbenchAction(payload.action) && !isDatabaseTransactionAction(payload.action) && payload.action !== 'performance-snapshot';
    const mysqlProtocolPayload = engine === 'tidb'
      ? { ...payload, connection: { ...(payload as { connection: Record<string, unknown> }).connection, engine: 'mysql' as const } }
      : payload;

    const result = isDatabaseTransactionAction(payload.action)
      ? await executeDatabaseTransactionRequest(payload as unknown as DatabaseTransactionRequest, stableIdentity!)
      : payload.action === 'performance-snapshot'
        ? await executeDatabasePerformanceRequest(payload as unknown as DatabaseWorkbenchRequest)
        : isDatabaseWorkbenchAction(payload.action)
          ? await executeDatabaseWorkbenchRequest(payload as unknown as DatabaseWorkbenchRequest)
          : isExtendedCoreAction
            ? await executeExtendedDatabaseRequest(payload)
            : await executeDatabaseRequest(mysqlProtocolPayload);
    return NextResponse.json(result, { status: 200, headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Veritabanı isteği geçerli JSON içermiyor.' }, { status: 400, headers: noStoreHeaders() });
    }
    const databaseError = normalizeRouteError(error);
    return NextResponse.json(
      { error: databaseError.code, message: databaseError.message, _meta: databaseError.queryMeta },
      { status: databaseError.status, headers: noStoreHeaders() }
    );
  }
}
