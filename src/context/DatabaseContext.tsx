/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { TableInfo, DatabaseTable, DatabaseServerConfig } from 'types';
import { useAuth } from '@/context/AuthContext';
import { createDatabaseServer, fetchDatabaseServers } from '@/lib/databaseApi';

interface DatabaseContextType {
  databases: { name: string; tables: string[] }[];
  setDatabases: React.Dispatch<React.SetStateAction<{ name: string; tables: string[] }[]>>;
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
  loadServers: () => Promise<void>;
  addServer: (server: Omit<DatabaseServerConfig, 'id'>) => void;
}

export const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

const STORAGE_KEY = 'active-database-server';

function createServerId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `server-${Date.now()}`;
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const { activeToken } = useAuth();
  const [databases, setDatabases] = useState<{ name: string; tables: string[] }[]>([]);
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [databaseTables, setDatabaseTables] = useState<DatabaseTable[]>([]);
  const [tableData, setTableData] = useState<Record<string, any>[]>([]);
  const [servers, setServers] = useState<DatabaseServerConfig[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    try {
      const remoteServers = await fetchDatabaseServers(activeToken);
      setServers(remoteServers);

      setActiveServerId(currentActiveServerId => {
        if (currentActiveServerId && remoteServers.some(server => server.id === currentActiveServerId)) {
          return currentActiveServerId;
        }

        return remoteServers[0]?.id || null;
      });
    } catch (error) {
      console.error('Sunucular yüklenirken bir hata oluştu:', error);
    }
  }, [activeToken]);

  useEffect(() => {
    try {
      if (activeServerId) {
        localStorage.setItem(STORAGE_KEY, activeServerId);
      }
    } catch (error) {
      console.error('Aktif sunucu kaydedilirken bir hata oluştu:', error);
    }
  }, [activeServerId]);

  useEffect(() => {
    const storedActiveServerId = localStorage.getItem(STORAGE_KEY);
    if (storedActiveServerId) {
      setActiveServerId(storedActiveServerId);
    }

    loadServers();
  }, [loadServers]);

  const addServer = async (server: Omit<DatabaseServerConfig, 'id'>) => {
    const nextServer: DatabaseServerConfig = {
      id: createServerId(),
      name: server.name.trim(),
      baseUrl: server.baseUrl?.trim().replace(/\/+$/, '') || undefined,
      databaseType: server.databaseType || 'mysql',
      version: server.version || '8.0',
      host: server.host?.trim(),
      port: server.port,
      username: server.username?.trim(),
      password: server.password,
      databaseName: server.databaseName?.trim(),
      visibleTo: server.visibleTo || []
    };

    try {
      await createDatabaseServer(nextServer, activeToken);
      await loadServers();
    } catch (error) {
      console.error('Sunucu eklenirken bir hata oluştu:', error);
    }
  };

  return <DatabaseContext.Provider value={{ databases, setDatabases, tableInfo, setTableInfo, databaseTables, setDatabaseTables, tableData, setTableData, servers, setServers, activeServerId, setActiveServerId, loadServers, addServer }}>{children}</DatabaseContext.Provider>;
}
