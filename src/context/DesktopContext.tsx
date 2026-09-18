'use client';

import React, { createContext, useContext } from 'react';

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
  return (
    <DesktopContext.Provider value={{ user: LOCAL_USER, workspaceKey: 'local', isReady: true }}>
      {children}
    </DesktopContext.Provider>
  );
}

export function useDesktop() {
  const context = useContext(DesktopContext);
  if (!context) throw new Error('useDesktop must be used within DesktopProvider');
  return context;
}
