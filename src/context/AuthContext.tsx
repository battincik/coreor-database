'use client';

import React, { createContext, useContext } from 'react';

export interface LocalDesktopUser {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
}

interface AuthContextType {
  user: LocalDesktopUser;
  activeToken: string;
  isReady: boolean;
}

const LOCAL_USER: LocalDesktopUser = { id: 'local', name: 'Local User', email: null, image: null };
const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => (
  <AuthContext.Provider value={{ user: LOCAL_USER, activeToken: 'local', isReady: true }}>
    {children}
  </AuthContext.Provider>
);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
