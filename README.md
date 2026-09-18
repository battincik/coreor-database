# Coreor Database

Coreor Database is a local-first cross-platform desktop database client for Windows, macOS and Linux. The UI is rendered with Next.js static export inside Tauri; database access, configuration and long-lived operations are handled by Rust.

## Runtime architecture

```text
Next.js static renderer
        |
        | Tauri IPC
        v
Rust desktop core
        |
        +-- native config / platform services
        +-- transaction state
        +-- database engines
        |
        +-- MySQL / MariaDB / TiDB
        +-- PostgreSQL / CockroachDB
        +-- Microsoft SQL Server
```

There is no Next.js API backend, no Node.js database driver and no required `.env` for database access. Connection profiles remain local to the installed application and database traffic originates from the user's device.

An optional Coreor Account can add online capabilities such as cloud sync or team features later, but signing in is not required for local database use.

## Supported desktop platforms

- Windows 10/11 — NSIS and MSI
- macOS 12+ — App and DMG
- Linux — DEB and AppImage

Tauri platform-specific configuration files choose the correct bundle targets for the host operating system.

## Development

```bash
npm ci
npm run desktop:check
npm run typecheck
cargo check --locked --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
```

The first desktop run generates the required Windows, macOS and Linux icons from `src-tauri/icons/app-icon.svg` when necessary.

## Builds

Build for the current host:

```bash
npm run tauri:build
```

Explicit platform scripts:

```bash
npm run tauri:build:windows
npm run tauri:build:macos
npm run tauri:build:linux
```

Each installer must be built on its matching operating system. GitHub Actions validates and bundles Windows, macOS and Linux independently.

## Resource profiling

```bash
npm run profile
```

The profiler uses the native PowerShell process-tree collector on Windows and `ps` on macOS/Linux.

## Core principles

- Local-first database access
- No hidden Coreor proxy between the desktop client and database server
- Native read-only enforcement and transaction state in Rust
- Cross-platform keyboard shortcuts and window chrome
- Platform-native application/config/cache/log directories
- Optional account capabilities must never gate local database features
