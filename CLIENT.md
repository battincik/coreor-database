# Coreor Database Client

This branch contains the cross-platform native desktop client.

## Runtime

`React / Next.js static UI -> Tauri IPC -> Rust -> Database`

The Next.js layer is a static renderer/build system only. It does not expose database API routes.

## Platforms

- Windows
- macOS
- Linux

## Supported database families

- MySQL / MariaDB / TiDB
- PostgreSQL / CockroachDB
- Microsoft SQL Server

## Validate

```bash
npm ci
npm run architecture:check
npm run typecheck
npm run native:check
npm run ui:build
npm run tauri:dev
```

## Bundles

- Windows: NSIS / MSI
- macOS: App / DMG
- Linux: DEB / RPM / AppImage

Use `npm run tauri:build` on the target operating system or the explicit platform scripts in `package.json`.
