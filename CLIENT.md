# Client branch

Cross-platform desktop edition of Coreor Database.

## Product architecture

`Next.js static renderer -> Tauri IPC -> Rust -> Database`

The branch targets Windows, macOS and Linux. Next.js is the renderer/build system only; database access is native and there are no Next.js database API routes or Node.js database drivers.

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
npm run architecture:check
npm run typecheck
npm run ui:build
npm run native:check
npm run tauri:dev
```

`native:check` ensures the generated platform icons exist before Cargo/Tauri reads the bundle configuration.

## Bundles

- Windows: NSIS, MSI
- macOS: App, DMG
- Linux: DEB, RPM, AppImage

Use `npm run tauri:build` for the current host.

Explicit host build scripts:

```bash
npm run build:windows
npm run build:macos
npm run build:linux
```

Each installer format must be produced on its corresponding operating system or matching CI runner.
