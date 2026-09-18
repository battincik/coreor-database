'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { initializeDatabaseAutomationStore } from '@/lib/databaseAutomation';
import { initializeNotificationStore } from '@/lib/notificationStore';

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
  const [nativeWorkspaceReady, setNativeWorkspaceReady] = useState(false);
  // workspaceKey deliberately stays local even when an account is present:
  // database profiles, SQL history and credentials are never moved to account storage implicitly.
  const user: DesktopUser = auth.user || LOCAL_USER;

  useEffect(() => {
    let active = true;
    void Promise.all([
      initializeDatabaseAutomationStore(),
      initializeNotificationStore()
    ])
      .catch(error => console.error('Native workspace hazırlanamadı:', error))
      .finally(() => { if (active) setNativeWorkspaceReady(true); });
    return () => { active = false; };
  }, []);

  return (
    <DesktopContext.Provider value={{ user, workspaceKey: 'local', isReady: nativeWorkspaceReady }}>
      {nativeWorkspaceReady ? children : null}
    </DesktopContext.Provider>
  );
}

export function useDesktop() {
  const context = useContext(DesktopContext);
  if (!context) throw new Error('useDesktop must be used within DesktopProvider');
  return context;
}
