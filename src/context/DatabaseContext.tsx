/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useState, ReactNode } from 'react';
import { TableInfo, DatabaseTable } from 'types';

interface DatabaseContextType {
  databases: { name: string; tables: string[] }[];
  setDatabases: React.Dispatch<React.SetStateAction<{ name: string; tables: string[] }[]>>;
  tableInfo: TableInfo | null;
  setTableInfo: React.Dispatch<React.SetStateAction<TableInfo | null>>;
  databaseTables: DatabaseTable[];
  setDatabaseTables: React.Dispatch<React.SetStateAction<DatabaseTable[]>>;
  tableData: Record<string, any>[];
  setTableData: React.Dispatch<React.SetStateAction<Record<string, any>[]>>;
}

export const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [databases, setDatabases] = useState<{ name: string; tables: string[] }[]>([]);
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [databaseTables, setDatabaseTables] = useState<DatabaseTable[]>([]);
  const [tableData, setTableData] = useState<Record<string, any>[]>([]);

  return <DatabaseContext.Provider value={{ databases, setDatabases, tableInfo, setTableInfo, databaseTables, setDatabaseTables, tableData, setTableData }}>{children}</DatabaseContext.Provider>;
}
