# Desktop Architecture

The client branch is desktop-only.

## Runtime

```text
React / Next.js static export
          |
          | invoke()
          v
Tauri command layer
          |
          +-- config.rs behavior in lib.rs
          +-- database.rs
          +-- transactions.rs
          |
          v
Remote database server
```

## Rules

1. No `src/app/api`.
2. No `src/lib/server`.
3. No NextAuth or server session.
4. No Node.js database driver.
5. No `.env` requirement.
6. Database credentials never pass through a Coreor-hosted backend.
7. Database operations use Tauri IPC and Rust native drivers.
8. Transaction connections remain native and stateful inside the Tauri process.
9. Desktop configuration is persisted to the Tauri application config directory.
10. `npm run desktop:check` fails when a web-backend dependency is reintroduced.

## Native modules

- `src-tauri/src/database.rs`: engine adapters, catalog, data grid, metadata, schema mutation, process/user/role/privilege, import/export and performance operations.
- `src-tauri/src/transactions.rs`: persistent transaction sessions, query execution, commit, rollback, TTL cleanup and read-only enforcement.
- `src-tauri/src/lib.rs`: config persistence, Tauri commands, timeout handling and state registration.
