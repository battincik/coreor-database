/* eslint-disable @typescript-eslint/no-explicit-any */
// TypeScript tip ve interface tanımlamaları burada yer alacak.

import { SignInOptions } from 'next-auth/react';

export interface HandleLoginOptions extends SignInOptions {
    callbackUrl: string;
}

export type ProviderType = 'github' | 'google' | 'twitter' | 'facebook' | 'apple';

export interface DatabasePanelProps {
    selectedDatabase: string | null;
    selectedTable: string | null;
    selectedServerId?: string | null;
    activeTab: string;
    setActiveTab: (tab: string) => void;
    query: string;
    setQuery: (query: string) => void;
    onDatabaseSelect: (dbName: string | null) => void;
    onTableSelect: (tableName: string | null) => void;
}

export interface DatabaseServerConfig {
    id: string;
    name: string;
    baseUrl?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    databaseName?: string;
    databaseType?: 'mysql' | 'mariadb' | 'postgresql';
    version?: string;
    visibleTo?: string[];
    databases?: { name: string; tables: string[] }[];
}

export interface TableInfo {
    columns: {
        Field: string;
        Type: string;
        Null: string;
        Key: string;
        Default: string | null;
        Extra: string;
    }[];
    indexes: {
        Key_name: string;
        Column_name: string;
        Non_unique: string;
        Seq_in_index: string;
    }[];
    foreignKeys: {
        COLUMN_NAME: string;
        REFERENCED_TABLE_NAME: string;
        REFERENCED_COLUMN_NAME: string;
    }[];
    createSQL: string;
}

export interface DatabaseTable {
    tableName: string;
    comment: string;
    rows: number;
    columns: number;
    sizeMB: string;
    createdAt: string;
    updatedAt: string | null;
    engine: string;
    indexCount: number;
    foreignKeyCount: number;
}

export interface EditorPanelProps {
    query: string;
    setQuery: (query: string) => void;
    openTables: { dbName: string; tableName: string }[];
    onTabChange: (tabId: string) => void;
    activeTab: string;
}

export interface Tab {
    id: string;
    label: string;
    content: string;
    type: "table" | "query";
    dbName?: string;
    tableName?: string;
}

export interface ResultsPanelProps {
    results: Record<string, any>[];
}

export interface SidebarProps {
    selectedServerId?: string | null;
    onDatabaseSelect: (dbName: string | null) => void;
    onTableSelect: (tableName: string | null) => void;
    selectedDatabase: string | null;
    selectedTable: string | null;
}
