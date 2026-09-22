# Architecture

Coreor Database is a cross-platform native desktop application with a static React/Next.js UI embedded in Tauri.

## Runtime

```text
UI: React + Next.js static export
               │
               │ invoke()
               ▼
Native: Tauri commands + Rust
               │
      ┌────────┴─────────┐
      │                  │
 database.rs      transactions.rs
      │                  │
      └────────┬─────────┘
               ▼
        Database server
```

The Next.js layer is a UI build system only. It does not expose API routes and does not open database sockets.

## Optional account layer

```text
Coreor Database
├── Local workspace
│   ├── database profiles
│   ├── SQL/query state
│   ├── preferences
│   └── native database operations
└── Optional Coreor Account API
    ├── identity
    ├── capabilities
    ├── team workspaces
    ├── shared snippets
    └── optional cloud sync
```

Guest mode must remain fully capable of using local database features. Account availability must never become a prerequisite for opening a local connection.

## Architectural invariants

1. No `src/app/api` database backend.
2. No `src/lib/server` hosted database services.
3. No Node.js database drivers in the UI process.
4. Database operations go through Tauri IPC and native Rust drivers.
5. Read-only policy is enforced in the native layer, not only by disabled buttons.
6. Transactions remain stateful inside the native process.
7. Database credentials are local data and are not implicitly sent to Coreor Account API.
8. UI code must not require `.env` to use the local database client.
9. Platform-specific behavior must be isolated behind platform detection or Tauri APIs.
10. `npm run architecture:check` prevents common hosted-web regressions.

## Native modules

- `src-tauri/src/database.rs` — engine adapters, catalog, data grid, schema, administration, import/export and performance actions.
- `src-tauri/src/transactions.rs` — native transaction sessions, TTL cleanup, query/commit/rollback and policy checks.
- `src-tauri/src/lib.rs` — Tauri commands, platform information and local config persistence.

## UI modules

- `src/components/sidebar.tsx` — Object Explorer.
- `src/components/query-workspace.tsx` — SQL editing and result workflow.
- `src/components/table-data-view.tsx` — table data workflow.
- `src/lib/databaseApi.ts` — typed Tauri IPC facade, not a network API.
- `src/lib/desktopClient.ts` — native invoke boundary.
- `src/context/AuthContext.tsx` — optional account capability state, independent from local database access.

## Cross-platform packaging

Tauri bundling targets all supported desktop package types. CI separately compiles Windows, macOS and Linux so platform-specific breakage is caught before release.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and [RELEASING.md](RELEASING.md).
