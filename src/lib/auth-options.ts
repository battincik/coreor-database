import { createHash } from 'node:crypto';
import type { NextAuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const NEXT_PRODUCTION_BUILD_PHASE = 'phase-production-build';
const BUILD_ONLY_AUTH_SECRET = 'coreor-web-database:build-only-auth-secret';
const BUILD_ONLY_GITHUB_ID = 'build-only-github-client-id';
const BUILD_ONLY_GITHUB_SECRET = 'build-only-github-client-secret';

function isProductionBuild() {
  return process.env.NEXT_PHASE === NEXT_PRODUCTION_BUILD_PHASE;
}

function splitEnvironmentList(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

const allowedGithubIds = new Set(splitEnvironmentList(process.env.AUTH_ALLOWED_GITHUB_IDS));
const requireGithubAllowlist =
  process.env.AUTH_REQUIRE_GITHUB_ALLOWLIST?.trim().toLowerCase() !== 'false' && process.env.NODE_ENV === 'production';

export function isGithubUserAuthorized(userId: unknown) {
  if (!requireGithubAllowlist && allowedGithubIds.size === 0) return true;
  if (allowedGithubIds.size === 0) return false;
  const normalizedUserId = typeof userId === 'string' || typeof userId === 'number' ? String(userId).trim() : '';
  return Boolean(normalizedUserId) && allowedGithubIds.has(normalizedUserId);
}

function resolveAuthSecret() {
  const explicitSecret = process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();

  if (explicitSecret) {
    if (process.env.NODE_ENV === 'production' && explicitSecret.length < 32) {
      throw new Error('NEXTAUTH_SECRET üretimde en az 32 karakter olmalıdır.');
    }
    return explicitSecret;
  }

  // Next.js production build, App Router route modüllerini değerlendirebilir.
  // Runtime secret yalnızca gerçek istek işlenirken zorunlu tutulur.
  if (isProductionBuild()) {
    return BUILD_ONLY_AUTH_SECRET;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Üretimde bağımsız NEXTAUTH_SECRET (veya AUTH_SECRET) tanımlanmalıdır.');
  }

  const githubClientSecret = process.env.GITHUB_SECRET?.trim();
  if (githubClientSecret) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[auth] NEXTAUTH_SECRET tanımlı değil. Yalnızca geliştirme ortamında GITHUB_SECRET üzerinden geçici oturum anahtarı türetiliyor.'
      );
    }
    return createHash('sha256')
      .update(`coreor-web-database:next-auth:${githubClientSecret}`)
      .digest('base64url');
  }

  throw new Error(
    'NextAuth yapılandırması eksik: NEXTAUTH_SECRET (veya AUTH_SECRET) tanımlayın. GITHUB_SECRET da bulunamadığı için geliştirme anahtarı üretilemedi.'
  );
}

function resolveGithubCredentials() {
  const clientId = process.env.GITHUB_ID?.trim();
  const clientSecret = process.env.GITHUB_SECRET?.trim();

  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }

  if (isProductionBuild()) {
    return { clientId: BUILD_ONLY_GITHUB_ID, clientSecret: BUILD_ONLY_GITHUB_SECRET };
  }

  throw new Error('GitHub OAuth yapılandırması eksik: GITHUB_ID ve GITHUB_SECRET tanımlanmalıdır.');
}

export const authSecret = resolveAuthSecret();
const githubCredentials = resolveGithubCredentials();

export const authOptions: NextAuthOptions = {
  secret: authSecret,
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS
  },
  providers: [GitHubProvider(githubCredentials)],
  pages: {
    signIn: '/login'
  },
  callbacks: {
    async signIn({ profile }) {
      const githubProfile = profile as { id?: string | number } | undefined;
      return isGithubUserAuthorized(githubProfile?.id);
    },
    async session({ session, token }) {
      if (session.user) {
        const user = session.user as typeof session.user & { id?: string };
        user.id = token.sub;
        user.email = token.email;
      }

      return session;
    }
  }
};
