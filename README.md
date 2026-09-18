# Coreor Database Desktop

Native Windows database client built with **Tauri 2 + Rust + Next.js static UI**.

## Architecture

```text
Next.js static UI
      |
   Tauri IPC
      |
Rust native database layer
      |
MySQL / MariaDB / TiDB
PostgreSQL / CockroachDB
Microsoft SQL Server
```

There is no application web backend, OAuth flow, NextAuth session, Next.js API route or required `.env` file in the `client` branch. Database TCP connections are opened directly by the local Rust process.

## Local data

Connection profiles and desktop configuration are stored in the Tauri application config directory as `config.json`. This file may contain database credentials and must be treated as sensitive local data.

## Development

Requirements: Node.js 20+, Rust stable, Microsoft C++ Build Tools and WebView2.

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

The Tauri bundle is configured for NSIS `.exe` and MSI installers.

## Native features

Connection test, database/table catalog, table metadata, pagination/filter/sort, cell update, row delete, SQL execution, schema mutations, persistent transactions, process/lock diagnostics, users/roles/privileges, performance snapshots, import/export and read-only enforcement run through the native Rust layer.

The repository contains `scripts/assert-desktop-only.mjs`, which rejects web API/backend dependencies in desktop source.
