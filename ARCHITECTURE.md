# Desktop Architecture

## Runtime boundary

Coreor Database Desktop has one trusted native boundary: Tauri IPC.

```text
WebView UI -> invoke("database_request") -> Rust -> database TCP protocol
```

The WebView never receives a Coreor API endpoint because no Coreor database backend exists in this branch.

## Frontend

Next.js is used only to build static UI assets. `output: "export"` produces the files loaded by Tauri. No route handler or server component is required for database operations.

## Native layer

`src-tauri/src/database.rs` owns database connections and implements:
- MySQL, MariaDB and TiDB through SQLx
- PostgreSQL and CockroachDB through SQLx
- Microsoft SQL Server through Tiberius
- catalog/schema/data/query/workbench operations
- local read-only enforcement
- import/export and diagnostics

`src-tauri/src/transactions.rs` owns persistent transaction connections, transaction IDs, expiry and commit/rollback state.

`src-tauri/src/lib.rs` exposes Tauri commands and local config persistence.

## Persistence

`config.json` is created in Tauri's application config directory. Writes are performed through a temporary file and rename. No environment configuration is required.

## Validation

`npm run desktop:check` fails when desktop TypeScript source contains NextAuth, Next.js database API paths, server backend imports or Node database drivers.
