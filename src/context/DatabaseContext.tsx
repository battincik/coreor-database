/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { createContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { DatabaseCatalogItem, DatabaseServerConfig, DatabaseTable, TableInfo } from 'types';
import { useDesktop } from '@/context/DesktopContext';
import { createDatabaseServer, deleteDatabaseServer, fetchDatabaseServers, fetchServerTables } from '@/lib/databaseApi';
import { recordActivity } from '@/lib/activityConsole';
import { databaseEngineDefinition } from '@/lib/databaseEngines';

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
  removeServer: (serverId: string) => Promise<void>;
}

export const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

function createServerId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `server-${Date.now()}`;
}

function getActiveServerStorageKey(accountId: string) {
  return `active-database-server:${accountId}`;
}

function emptyTableDetail(tableName: string): DatabaseTable {
  return {
    tableName, tableType: 'BASE TABLE', comment: '', rows: 0, columns: 0,
    sizeMB: '0.00', dataSizeMB: '0.00', indexSizeMB: '0.00', freeSizeMB: '0.00', avgRowLength: 0,
    createdAt: null, updatedAt: null, engine: '—', rowFormat: null, collation: null,
    autoIncrement: null, indexCount: 0, foreignKeyCount: 0
  };
}

function normalizeCatalog(value: unknown): DatabaseCatalogItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string').map(item => {
    const source = item as Partial<DatabaseCatalogItem> & { tables?: unknown; tableDetails?: unknown };
    const tables = Array.isArray(source.tables) ? source.tables.filter((table): table is string => typeof table === 'string') : [];
    const detailMap = new Map<string, DatabaseTable>();
    if (Array.isArray(source.tableDetails)) for (const rawDetail of source.tableDetails) {
      if (!rawDetail || typeof rawDetail !== 'object' || typeof (rawDetail as { tableName?: unknown }).tableName !== 'string') continue;
      const detail = rawDetail as Partial<DatabaseTable> & { tableName: string };
      detailMap.set(detail.tableName, { ...emptyTableDetail(detail.tableName), ...detail, rows: Number(detail.rows || 0), columns: Number(detail.columns || 0), indexCount: Number(detail.indexCount || 0), foreignKeyCount: Number(detail.foreignKeyCount || 0) });
    }
    const normalizedTables = Array.from(new Set([...tables, ...detailMap.keys()]));
    const tableDetails = normalizedTables.map(tableName => detailMap.get(tableName) || emptyTableDetail(tableName));
    return {
      name: String(source.name), defaultCharset: source.defaultCharset || null, defaultCollation: source.defaultCollation || null,
      tableCount: Number(source.tableCount ?? normalizedTables.length),
      totalRows: Number(source.totalRows ?? tableDetails.reduce((total, table) => total + table.rows, 0)),
      dataSizeMB: String(source.dataSizeMB ?? tableDetails.reduce((total, table) => total + Number(table.dataSizeMB || 0), 0).toFixed(2)),
      indexSizeMB: String(source.indexSizeMB ?? tableDetails.reduce((total, table) => total + Number(table.indexSizeMB || 0), 0).toFixed(2)),
      totalSizeMB: String(source.totalSizeMB ?? tableDetails.reduce((total, table) => total + Number(table.sizeMB || 0), 0).toFixed(2)),
      tables: normalizedTables, tableDetails
    };
  });
}

function normalizeServer(server: DatabaseServerConfig): DatabaseServerConfig {
  const definition = databaseEngineDefinition(server.databaseType);
  return {
    ...server,
    databaseType: server.databaseType || 'mysql',
    version: server.version || definition.defaultVersion,
    port: server.port || definition.defaultPort,
    organizationId: server.organizationId || null,
    databases: normalizeCatalog(server.databases)
  };
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const { workspaceKey, isReady } = useDesktop();
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
    if (!isReady) { setIsServersLoading(true); return; }
    if (!workspaceKey) { setServers([]); setActiveServerId(null); setDatabases([]); setServersError(null); setIsServersLoading(false); return; }
    setIsServersLoading(true); setServersError(null);
    try {
      const storedServers = (await fetchDatabaseServers(workspaceKey)).map(normalizeServer);
      setServers(storedServers);
      const storedActiveServerId = localStorage.getItem(getActiveServerStorageKey(workspaceKey));
      setActiveServerId(current => {
        const preferred = current || storedActiveServerId;
        return preferred && storedServers.some(server => server.id === preferred) ? preferred : storedServers[0]?.id || null;
      });
      if (!storedServers.length) setDatabases([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Yerel bağlantı profilleri yüklenemedi.';
      console.error('Yerel bağlantı profilleri yüklenirken bir hata oluştu:', error);
      setServers([]); setActiveServerId(null); setDatabases([]); setServersError(message);
    } finally { setIsServersLoading(false); }
  }, [workspaceKey, isReady]);

  useEffect(() => {
    if (!workspaceKey || !activeServerId) return;
    try { localStorage.setItem(getActiveServerStorageKey(workspaceKey), activeServerId); }
    catch (error) { console.error('Aktif sunucu kaydedilirken bir hata oluştu:', error); }
  }, [activeServerId, workspaceKey]);
  useEffect(() => { void loadServers(); }, [loadServers]);

  useEffect(() => {
    const activeServer = servers.find(server => server.id === activeServerId) ?? null;
    const activeCatalog = activeServer?.databases ?? [];
    setDatabases(activeCatalog);
    setDatabaseTables(activeCatalog.flatMap(database => database.tableDetails ?? []));
    if (!activeServer) {
      setTableInfo(null);
      setTableData([]);
    }
  }, [servers, activeServerId]);

  const persistServer = async (server: DatabaseServerConfig, loadInitialCatalog: boolean) => {
    if (!workspaceKey) throw new Error('Yerel çalışma alanı hazır değil.');
    setIsAddingServer(true);
    try {
      await createDatabaseServer(server, workspaceKey); setActiveServerId(server.id);
      if (loadInitialCatalog) try { await fetchServerTables(server.id, workspaceKey); }
      catch (error) {
        recordActivity({ level: 'warning', category: 'connection', title: 'Sunucu kaydedildi, katalog alınamadı', message: error instanceof Error ? error.message : 'İlk bağlantı kurulamadı.', serverId: server.id, serverName: server.name, host: server.host });
      }
      await loadServers();
    } finally { setIsAddingServer(false); }
  };

  const addServer = async (server: Omit<DatabaseServerConfig, 'id'>) => {
    const engine = server.databaseType || 'mysql';
    const definition = databaseEngineDefinition(engine);
    const now = new Date().toISOString();
    const nextServer: DatabaseServerConfig = {
      id: createServerId(), name: server.name.trim(), databaseType: engine,
      version: server.version || definition.defaultVersion, host: server.host?.trim(),
      port: server.port ?? definition.defaultPort, username: server.username?.trim(), password: server.password,
      databaseName: server.databaseName?.trim(), sslMode: server.sslMode ?? 'required',
      connectionTimeoutMs: server.connectionTimeoutMs ?? 20_000, visibleTo: server.visibleTo || [],
      organizationId: server.organizationId || null, databases: [], createdAt: now, updatedAt: now
    };
    await persistServer(nextServer, true);
  };

  const updateServer = async (server: DatabaseServerConfig) => {
    const existing = servers.find(item => item.id === server.id);
    const nextServer: DatabaseServerConfig = {
      ...existing, ...server, id: server.id, name: server.name.trim(), host: server.host?.trim(),
      username: server.username?.trim(), databaseName: server.databaseName?.trim(),
      organizationId: server.organizationId || null,
      databases: normalizeCatalog(existing?.databases ?? server.databases), createdAt: existing?.createdAt ?? server.createdAt,
      updatedAt: new Date().toISOString()
    };
    await persistServer(nextServer, false);
  };

  const removeServer = async (serverId: string) => {
    await deleteDatabaseServer(serverId, workspaceKey);
    if (activeServerId === serverId) {
      setActiveServerId(null);
      setDatabases([]);
      setTableInfo(null);
      setTableData([]);
    }
    await loadServers();
  };

  return <DatabaseContext.Provider value={{ databases, setDatabases, tableInfo, setTableInfo, databaseTables, setDatabaseTables, tableData, setTableData, servers, setServers, activeServerId, setActiveServerId, isServersLoading, isAddingServer, serversError, loadServers, addServer, updateServer, removeServer }}>{children}</DatabaseContext.Provider>;
}
