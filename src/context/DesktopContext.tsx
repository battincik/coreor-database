'use client';

import React, { createContext, useContext } from 'react';
import { useAuth } from '@/context/AuthContext';

export interface DesktopUser {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
}

interface DesktopContextType {
  user: DesktopUser;
  workspaceKey: string;
  isReady: boolean;
}

const LOCAL_USER: DesktopUser = { id: 'local', name: 'Local User', email: null, image: null };
const DesktopContext = createContext<DesktopContextType | null>(null);

export function DesktopProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  // workspaceKey deliberately stays local even when an account is present:
  // database profiles, SQL history and credentials are never moved to account storage implicitly.
  const user: DesktopUser = auth.user || LOCAL_USER;
  return (
    <DesktopContext.Provider value={{ user, workspaceKey: 'local', isReady: true }}>
      {children}
    </DesktopContext.Provider>
  );
}

export function useDesktop() {
  const context = useContext(DesktopContext);
  if (!context) throw new Error('useDesktop must be used within DesktopProvider');
  return context;
}
