/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { createContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { DatabaseCatalogItem, DatabaseServerConfig, DatabaseTable, TableInfo } from 'types';
import { useAuth } from '@/context/AuthContext';
import { createDatabaseServer, fetchDatabaseServers, fetchServerTables } from '@/lib/databaseApi';
import { recordActivity } from '@/lib/activityConsole';

interface DatabaseContextType {
  databases: DatabaseCatalogItem[];
  setDatabases: React.Dispatch<React.SetStateAction<DatabaseCatalogItem[]>>;
  tableInfo: TableInfo | null;
  setTableInfo: React.Dispatch<React.SetStateAction<TableInfo | null>>;
  databaseTables: DatabaseTable[];
  setDatabaseTables: React.Dispatch<React.SetStateAction<DatabaseTable[]>>;
  tableData: Record<string, any>[];
  setTableData: React.Dispatch<React.SetStateAction<Record<string, any>[]>>;
  servers: DatabaseServerConfig[];
  setServers: React.Dispatch<React.SetStateAction<DatabaseServerConfig[]>>;
  activeServerId: string | null;
  setActiveServerId: React.Dispatch<React.SetStateAction<string | null>>;
  isServersLoading: boolean;
  isAddingServer: boolean;
  serversError: string | null;
  loadServers: () => Promise<void>;
  addServer: (server: Omit<DatabaseServerConfig, 'id'>) => Promise<void>;
  updateServer: (server: DatabaseServerConfig) => Promise<void>;
}

export const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

function createServerId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `server-${Date.now()}`;
}

function getActiveServerStorageKey(accountId: string) {
  return `active-database-server:${accountId}`;
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const { activeToken, isReady } = useAuth();
  const [databases, setDatabases] = useState<DatabaseCatalogItem[]>([]);
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [databaseTables, setDatabaseTables] = useState<DatabaseTable[]>([]);
  const [tableData, setTableData] = useState<Record<string, any>[]>([]);
  const [servers, setServers] = useState<DatabaseServerConfig[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [isServersLoading, setIsServersLoading] = useState(true);
  const [isAddingServer, setIsAddingServer] = useState(false);
  const [serversError, setServersError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    if (!isReady) {
      setIsServersLoading(true);
      return;
    }
    if (!activeToken) {
      setServers([]);
      setActiveServerId(null);
      setDatabases([]);
      setServersError(null);
      setIsServersLoading(false);
      return;
    }

    setIsServersLoading(true);
    setServersError(null);
    try {
      const storedServers = await fetchDatabaseServers(activeToken);
      setServers(storedServers);
      const storedActiveServerId = localStorage.getItem(getActiveServerStorageKey(activeToken));
      setActiveServerId(currentActiveServerId => {
        const preferredServerId = currentActiveServerId || storedActiveServerId;
        if (preferredServerId && storedServers.some(server => server.id === preferredServerId)) return preferredServerId;
        return storedServers[0]?.id || null;
      });
      if (storedServers.length === 0) setDatabases([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Şifreli sunucu kasası yüklenemedi.';
      console.error('Şifreli sunucu kasası yüklenirken bir hata oluştu:', error);
      setServers([]);
      setActiveServerId(null);
      setDatabases([]);
      setServersError(message);
    } finally {
      setIsServersLoading(false);
    }
  }, [activeToken, isReady]);

  useEffect(() => {
    if (!activeToken || !activeServerId) return;
    try {
      localStorage.setItem(getActiveServerStorageKey(activeToken), activeServerId);
    } catch (error) {
      console.error('Aktif sunucu kaydedilirken bir hata oluştu:', error);
    }
  }, [activeServerId, activeToken]);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const persistServer = async (server: DatabaseServerConfig, loadInitialCatalog: boolean) => {
    if (!activeToken) throw new Error('Sunucu kaydetmek için giriş yapmalısınız.');
    setIsAddingServer(true);
    try {
      await createDatabaseServer(server, activeToken);
      setActiveServerId(server.id);
      if (loadInitialCatalog) {
        try {
          await fetchServerTables(server.id, activeToken);
        } catch (error) {
          recordActivity({
            level: 'warning',
            category: 'connection',
            title: 'Sunucu kaydedildi, katalog alınamadı',
            message: error instanceof Error ? error.message : 'İlk bağlantı kurulamadı.',
            serverId: server.id,
            serverName: server.name,
            host: server.host
          });
        }
      }
      await loadServers();
    } finally {
      setIsAddingServer(false);
    }
  };

  const addServer = async (server: Omit<DatabaseServerConfig, 'id'>) => {
    const engine = server.databaseType || 'mysql';
    const now = new Date().toISOString();
    const nextServer: DatabaseServerConfig = {
      id: createServerId(),
      name: server.name.trim(),
      databaseType: engine,
      version: server.version || (engine === 'mariadb' ? '12.3' : '8.4'),
      host: server.host?.trim(),
      port: server.port ?? 3306,
      username: server.username?.trim(),
      password: server.password,
      databaseName: server.databaseName?.trim(),
      sslMode: server.sslMode ?? 'required',
      connectionTimeoutMs: server.connectionTimeoutMs ?? 20_000,
      visibleTo: [],
      databases: [],
      createdAt: now,
      updatedAt: now
    };
    await persistServer(nextServer, true);
  };

  const updateServer = async (server: DatabaseServerConfig) => {
    const existing = servers.find(item => item.id === server.id);
    const nextServer: DatabaseServerConfig = {
      ...existing,
      ...server,
      id: server.id,
      name: server.name.trim(),
      host: server.host?.trim(),
      username: server.username?.trim(),
      databaseName: server.databaseName?.trim(),
      databases: existing?.databases ?? server.databases ?? [],
      createdAt: existing?.createdAt ?? server.createdAt,
      updatedAt: new Date().toISOString()
    };
    await persistServer(nextServer, false);
  };

  return (
    <DatabaseContext.Provider
      value={{
        databases,
        setDatabases,
        tableInfo,
        setTableInfo,
        databaseTables,
        setDatabaseTables,
        tableData,
        setTableData,
        servers,
        setServers,
        activeServerId,
        setActiveServerId,
        isServersLoading,
        isAddingServer,
        serversError,
        loadServers,
        addServer,
        updateServer
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
}
