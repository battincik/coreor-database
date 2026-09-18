# Client branch

Standalone desktop edition of Coreor Database.

## Final architecture

`Next.js static UI -> Tauri IPC -> Rust -> Database`

This branch intentionally contains no web database backend, authentication system, Next.js API routes, Node database drivers or required environment variables.

Supported native engines:

- MySQL
- MariaDB
- TiDB
- PostgreSQL
- CockroachDB
- Microsoft SQL Server

Desktop validation:

```powershell
npm install
npm run desktop:check
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
```

Installer build:

```powershell
npm run tauri:build
```

Bundle targets: NSIS and MSI.
