# Coreor Database Desktop

Coreor Database is a standalone Windows database client built with Next.js static UI, Tauri 2 and Rust.

## Architecture

```text
Next.js static UI (WebView)
        |
        | Tauri IPC
        v
Rust native database layer
        |
        +-- MySQL / MariaDB / TiDB (sqlx)
        +-- PostgreSQL / CockroachDB (sqlx)
        +-- Microsoft SQL Server (Tiberius)
```

There is no web database backend, no Next.js API route, no authentication/session service and no required `.env`.

Connection profiles and desktop settings are stored locally in the Tauri application config directory. Database traffic originates directly from the user's computer.

## Native features

- Connection testing
- Database/table catalog
- Table metadata, indexes, foreign keys and schema editing
- Filtering, sorting and pagination
- Cell updates and row deletion
- SQL query execution
- Persistent transaction sessions with commit/rollback
- Process and lock inspection / termination
- Database users, roles and privileges
- Import / export
- Performance snapshots
- Read-only connection enforcement
- MySQL, MariaDB, TiDB, PostgreSQL, CockroachDB and MSSQL

## Development

```powershell
npm install
npm run desktop:check
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
```

## Windows build

```powershell
npm run tauri:build
```

The Tauri bundle configuration targets NSIS and MSI.
