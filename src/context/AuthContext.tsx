'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from 'next-auth';
import { useSession } from 'next-auth/react';

interface AuthContextType {
  user: Session['user'] | null;
  activeToken: string | null;
  isReady: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function createAccountVaultId(user: NonNullable<Session['user']>) {
  const stableIdentity = user.id?.trim() || user.email?.trim().toLowerCase() || user.name?.trim().toLowerCase() || user.image?.trim();

  if (!stableIdentity) {
    throw new Error('Kullanıcı hesabı için kararlı bir kimlik oluşturulamadı.');
  }

  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`coreor-account:${stableIdentity}`));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');

  return `account:${hash}`;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: session, status } = useSession();
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const resolveAccount = async () => {
      if (status === 'loading') {
        return;
      }

      if (!session?.user) {
        if (!cancelled) {
          setActiveToken(null);
          setIsReady(true);
        }
        return;
      }

      try {
        const accountId = await createAccountVaultId(session.user);

        if (!cancelled) {
          setActiveToken(accountId);
          setIsReady(true);
        }
      } catch (error) {
        console.error('Hesap kasası kimliği oluşturulamadı:', error);

        if (!cancelled) {
          setActiveToken(null);
          setIsReady(true);
        }
      }
    };

    resolveAccount();

    return () => {
      cancelled = true;
    };
  }, [session?.user, status]);

  return <AuthContext.Provider value={{ user: session?.user ?? null, activeToken, isReady }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
