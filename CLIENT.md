# Client branch

This branch is the standalone desktop edition of Coreor Database.

- No web database backend
- No auth/login/session dependency
- No required `.env`
- No Next.js API routes
- No Node database drivers
- Local Tauri config
- Native Rust database networking
- Persistent native transaction state
- MySQL/MariaDB/TiDB/PostgreSQL/CockroachDB/MSSQL adapters
- NSIS + MSI Windows bundle targets

Run:

```powershell
npm install
npm run desktop:check
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
```

Build installers with `npm run tauri:build`.
