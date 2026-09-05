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

function resolveAuthSecret() {
  const explicitSecret = process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();

  if (explicitSecret) {
    return explicitSecret;
  }

  const githubClientSecret = process.env.GITHUB_SECRET?.trim();

  if (githubClientSecret) {
    // Geriye uyumluluk: NEXTAUTH_SECRET henüz tanımlanmamış kurulumlarda
    // her restartta değişmeyen, uygulamaya özel bir anahtar üretir.
    // Üretimde yine de bağımsız NEXTAUTH_SECRET kullanılması önerilir.
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[auth] NEXTAUTH_SECRET tanımlı değil. Oturum anahtarı GITHUB_SECRET üzerinden türetildi. Üretimde bağımsız NEXTAUTH_SECRET tanımlayın.'
      );
    }

    return createHash('sha256')
      .update(`coreor-web-database:next-auth:${githubClientSecret}`)
      .digest('base64url');
  }

  // Next.js production build, App Router route modüllerini değerlendirebilir.
  // Preview ortamında secret production-only scope'taysa salt import nedeniyle
  // build'in çökmesine izin vermiyoruz. Runtime'da NEXT_PHASE bu değerde değildir.
  if (isProductionBuild()) {
    return BUILD_ONLY_AUTH_SECRET;
  }

  throw new Error(
    'NextAuth yapılandırması eksik: NEXTAUTH_SECRET (veya AUTH_SECRET) tanımlayın. GITHUB_SECRET da bulunamadığı için güvenli oturum anahtarı üretilemedi.'
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