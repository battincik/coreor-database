# Client branch

Cross-platform desktop edition of Coreor Database.

## Product architecture

`Next.js static renderer -> Tauri IPC -> Rust -> Database`

The branch targets Windows, macOS and Linux and intentionally contains no Next.js database API routes or Node.js database drivers.

Supported engines:

- MySQL
- MariaDB
- TiDB
- PostgreSQL
- CockroachDB
- Microsoft SQL Server

## Validation

```bash
npm ci
npm run desktop:check
npm run typecheck
npm run build:ui
cargo check --locked --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
```

## Bundles

- Windows: NSIS, MSI
- macOS: App, DMG
- Linux: DEB, AppImage

Use `npm run tauri:build` for the current host or the explicit platform build scripts defined in `package.json`.
