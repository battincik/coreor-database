/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContextType {
  user: any;
  login: (email: string, password: string) => Promise<any>;
  register: (data: {
    firstname: string;
    lastname: string;
    username: string;
    email: string;
    password: string;
  }) => Promise<any>;
  switchAccount: (token: string) => void;
  logout: () => void;
  activeToken: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState(null);
  const [activeToken, setActiveToken] = useState<string | null>(null);

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        setActiveToken(token);
        const userDetails = await fetchUserDetails(token);
        if (userDetails) {
          setUser(userDetails);
        } else {
          localStorage.removeItem('token');
          setActiveToken(null);
        }
      }
    };
    initializeAuth();
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      if (activeToken) {
        try {
          const res = await fetch('https://api.coreor.net/database/me', {
            headers: { Authorization: `Bearer ${activeToken}` }
          });
          const data = await res.json();
          setUser(data);
        } catch {
          setUser(null);
        }
      }
    };
    fetchUser();
  }, [activeToken]);

  const login = async (email: string, password: string) => {
    const res = await fetch('https://api.coreor.net/database/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      const tokens = JSON.parse(localStorage.getItem('tokens') || '[]');
      tokens.push(data.token);
      localStorage.setItem('tokens', JSON.stringify(tokens));
      localStorage.setItem('token', data.token);
      setActiveToken(data.token);
    }
    return data;
  };

  const register = async ({
    firstname,
    lastname,
    username,
    email,
    password
  }: {
    firstname: string;
    lastname: string;
    username: string;
    email: string;
    password: string;
  }) => {
    const res = await fetch('https://api.coreor.net/database/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstname, lastname, username, email, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      localStorage.setItem('token', data.token);
      setActiveToken(data.token);
      setUser(await fetchUserDetails(data.token));
    }
    return data;
  };

  const fetchUserDetails = async (token: string) => {
    try {
      const res = await fetch('https://api.coreor.net/database/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        console.log(data);
        return data;
      }
    } catch {
      return null;
    }
  };

  const switchAccount = async (token: string) => {
    localStorage.setItem('token', token); // Yeni aktif token'i ayarla
    setActiveToken(token);
  };

  const logout = async () => {
    const tokens = JSON.parse(localStorage.getItem('tokens') || '[]').filter((t: string) => t !== activeToken);
    localStorage.setItem('tokens', JSON.stringify(tokens));
    localStorage.removeItem('token'); // Aktif token'i kaldır
    setActiveToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, switchAccount, logout, activeToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
