import type { DatabaseEngine, DatabaseEngineFamily } from 'types';

export interface DatabaseEngineDefinition {
  id: DatabaseEngine;
  label: string;
  family: DatabaseEngineFamily;
  descriptionKey: string;
  defaultPort: number;
  defaultVersion: string;
  versions: string[];
  badge: string;
  supportsAdvancedSchema: boolean;
  systemDatabases: string[];
}

export const DATABASE_ENGINES: DatabaseEngineDefinition[] = [
  {
    id: 'mysql', label: 'MySQL', family: 'mysql', descriptionKey: 'engines.mysql.description',
    defaultPort: 3306, defaultVersion: '8.4', versions: ['9.6', '9.5', '9.4', '8.4', '8.0', '5.7'],
    badge: 'Oracle', supportsAdvancedSchema: true,
    systemDatabases: ['information_schema', 'performance_schema', 'sys', 'mysql']
  },
  {
    id: 'mariadb', label: 'MariaDB', family: 'mysql', descriptionKey: 'engines.mariadb.description',
    defaultPort: 3306, defaultVersion: '11.8', versions: ['12.3', '12.2', '11.8', '11.4', '10.11', '10.6'],
    badge: 'Community', supportsAdvancedSchema: true,
    systemDatabases: ['information_schema', 'performance_schema', 'sys', 'mysql']
  },
  {
    id: 'tidb', label: 'TiDB', family: 'mysql', descriptionKey: 'engines.tidb.description',
    defaultPort: 4000, defaultVersion: '8.5', versions: ['8.5', '8.4', '8.1', '7.5', '7.1', '6.5'],
    badge: 'Distributed', supportsAdvancedSchema: false,
    systemDatabases: ['INFORMATION_SCHEMA', 'PERFORMANCE_SCHEMA', 'METRICS_SCHEMA', 'mysql']
  },
  {
    id: 'postgresql', label: 'PostgreSQL', family: 'postgresql', descriptionKey: 'engines.postgresql.description',
    defaultPort: 5432, defaultVersion: '18', versions: ['18', '17', '16', '15', '14', '13'],
    badge: 'Postgres', supportsAdvancedSchema: false,
    systemDatabases: ['postgres', 'template0', 'template1']
  },
  {
    id: 'cockroachdb', label: 'CockroachDB', family: 'postgresql', descriptionKey: 'engines.cockroachdb.description',
    defaultPort: 26257, defaultVersion: '26.2', versions: ['26.2', '26.1', '25.4', '25.3', '24.3'],
    badge: 'Distributed', supportsAdvancedSchema: false,
    systemDatabases: ['system', 'defaultdb', 'postgres']
  },
  {
    id: 'mssql', label: 'Microsoft SQL Server', family: 'mssql', descriptionKey: 'engines.mssql.description',
    defaultPort: 1433, defaultVersion: '2025', versions: ['2025', '2022', '2019', '2017', 'Azure SQL'],
    badge: 'Microsoft', supportsAdvancedSchema: false,
    systemDatabases: ['master', 'model', 'msdb', 'tempdb']
  }
];

export function databaseEngineDefinition(engine?: DatabaseEngine | null) {
  return DATABASE_ENGINES.find(item => item.id === engine) || DATABASE_ENGINES[0];
}

export function databaseEngineLabel(engine?: DatabaseEngine | null) {
  return databaseEngineDefinition(engine).label;
}

export function databaseEngineFamily(engine?: DatabaseEngine | null): DatabaseEngineFamily {
  return databaseEngineDefinition(engine).family;
}

export function defaultDatabasePort(engine?: DatabaseEngine | null) {
  return databaseEngineDefinition(engine).defaultPort;
}

export function quoteDatabaseIdentifier(identifier: string, engine: DatabaseEngine) {
  const value = identifier.replace(/\0/g, '');
  if (databaseEngineFamily(engine) === 'mysql') return `\`${value.replace(/`/g, '``')}\``;
  if (databaseEngineFamily(engine) === 'mssql') return `[${value.replace(/]/g, ']]')}]`;
  return `"${value.replace(/"/g, '""')}"`;
}

export function qualifiedDatabaseTable(database: string, table: string, engine: DatabaseEngine, schema?: string | null) {
  if (databaseEngineFamily(engine) === 'mysql') {
    return `${quoteDatabaseIdentifier(database, engine)}.${quoteDatabaseIdentifier(table, engine)}`;
  }
  if (databaseEngineFamily(engine) === 'mssql') {
    return `${quoteDatabaseIdentifier(database, engine)}.${quoteDatabaseIdentifier(schema || 'dbo', engine)}.${quoteDatabaseIdentifier(table, engine)}`;
  }
  return `${quoteDatabaseIdentifier(schema || 'public', engine)}.${quoteDatabaseIdentifier(table, engine)}`;
}
