import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth-options';
import { DatabaseServiceError, executeDatabaseRequest } from '@/lib/server/database-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 120;
const SESSION_COOKIE_PREFIXES = ['next-auth.session-token', '__Secure-next-auth.session-token'];
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache'
  };
}

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');

  if (!origin) {
    return;
  }

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const expectedHost = forwardedHost || request.headers.get('host');

  try {
    if (!expectedHost || new URL(origin).host !== expectedHost) {
      throw new Error('origin mismatch');
    }
  } catch {
    throw new DatabaseServiceError('Çapraz origin veritabanı isteği reddedildi.', 403, 'CROSS_ORIGIN_REQUEST_REJECTED');
  }
}

function getSessionCookieNames(request: NextRequest) {
  return request.cookies
    .getAll()
    .map(cookie => cookie.name)
    .filter(name => SESSION_COOKIE_PREFIXES.some(prefix => name === prefix || name.startsWith(`${prefix}.`)));
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

  if (requestBuckets.size > 1_000) {
    for (const [key, bucket] of requestBuckets) {
      if (bucket.resetAt <= now) {
        requestBuckets.delete(key);
      }
    }
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
  if (error instanceof DatabaseServiceError) {
    return error;
  }

  const candidate = error as { code?: string; message?: string };
  const code = candidate?.code || 'DATABASE_API_ERROR';

  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return new DatabaseServiceError('Veritabanı host adresi çözümlenemedi.', 422, code);
  }

  if (['ETIMEDOUT', 'ECONNREFUSED'].includes(code)) {
    return new DatabaseServiceError('Veritabanı sunucusuna bağlanılamadı.', 504, code);
  }

  return new DatabaseServiceError('Beklenmeyen bir veritabanı API hatası oluştu.', 500, code);
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);

    const contentLength = Number(request.headers.get('content-length') || 0);

    if (contentLength > 1_000_000) {
      throw new DatabaseServiceError('Veritabanı isteği izin verilen boyutu aşıyor.', 413, 'DATABASE_REQUEST_TOO_LARGE');
    }

    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return unauthorizedResponse(request);
    }

    const user = session.user as typeof session.user & { id?: string };
    const identity = user.id || user.email || 'authenticated-user';
    applyRateLimit(identity);

    const payload = (await request.json()) as Parameters<typeof executeDatabaseRequest>[0];
    const result = await executeDatabaseRequest(payload);

    return NextResponse.json(result, {
      status: 200,
      headers: noStoreHeaders()
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'INVALID_JSON', message: 'Veritabanı isteği geçerli JSON içermiyor.' },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const databaseError = normalizeRouteError(error);

    return NextResponse.json(
      { error: databaseError.code, message: databaseError.message },
      { status: databaseError.status, headers: noStoreHeaders() }
    );
  }
}
