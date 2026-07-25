import { createHash } from 'node:crypto';
import type { NextAuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

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

  throw new Error(
    'NextAuth yapılandırması eksik: NEXTAUTH_SECRET (veya AUTH_SECRET) tanımlayın. GITHUB_SECRET da bulunamadığı için güvenli oturum anahtarı üretilemedi.'
  );
}

export const authSecret = resolveAuthSecret();

export const authOptions: NextAuthOptions = {
  secret: authSecret,
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS
  },
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!
    })
  ],
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
