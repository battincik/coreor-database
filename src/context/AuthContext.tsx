'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';

export type AccountCapability = 'cloud-sync' | 'team-workspaces' | 'shared-snippets' | 'account-profile';

export interface CoreorAccountUser {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
}

export interface CoreorAuthSession {
  user: CoreorAccountUser;
  capabilities: AccountCapability[];
}

interface AuthContextValue {
  status: 'guest' | 'authenticated';
  user: CoreorAccountUser | null;
  capabilities: AccountCapability[];
  isGuest: boolean;
  hasCapability: (capability: AccountCapability) => boolean;
  applySession: (session: CoreorAuthSession) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Account identity is intentionally independent from the local database workspace.
  // The Coreor Account API adapter only needs to call applySession(); local DB access remains independent.
  const [session, setSession] = useState<CoreorAuthSession | null>(null);
  const value = useMemo<AuthContextValue>(() => ({
    status: session ? 'authenticated' : 'guest',
    user: session?.user || null,
    capabilities: session?.capabilities || [],
    isGuest: !session,
    hasCapability: capability => Boolean(session?.capabilities.includes(capability)),
    applySession: next => setSession(next),
    signOut: () => setSession(null)
  }), [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
