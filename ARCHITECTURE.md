# Coreor Database Desktop Architecture

The `client` branch is a Windows, macOS and Linux desktop application.

## Runtime

```text
React / Next.js static renderer
          |
          | invoke()
          v
Tauri IPC command layer
          |
          +-- platform/config services
          +-- database.rs
          +-- transactions.rs
          |
          v
Remote database server
```

Next.js is only the renderer/build system. It is not a web application deployment target and does not own database access.

## Architecture rules

1. No `src/app/api`.
2. No `src/lib/server` database backend.
3. No Node.js database driver.
4. No required database `.env`.
5. Database credentials do not pass through a Coreor-hosted proxy.
6. Database operations use Tauri IPC and Rust native drivers.
7. Transaction connections stay native and stateful in the Tauri process.
8. Persistent native config uses the operating system's Tauri app directories.
9. UI-only caches may use the WebView storage engine, but they are local application state, not a browser account/session boundary.
10. Account authentication is optional and capability-based; local database features remain available in guest mode.
11. Windows, macOS and Linux are first-class CI/build targets.
12. `npm run desktop:check` must fail when a web database backend is reintroduced.

## Platform layer

`platform_info` is exposed by Rust and returns the native OS, architecture, application version and app config/data/cache/log directories. Platform-sensitive UI should prefer this service over browser user-agent detection.

Tauri automatically merges:

- `tauri.windows.conf.json`
- `tauri.macos.conf.json`
- `tauri.linux.conf.json`

with the common `tauri.conf.json`.

## Native modules

- `src-tauri/src/database.rs`: database adapters and native DB operations.
- `src-tauri/src/transactions.rs`: persistent transactions, TTL cleanup and read-only enforcement.
- `src-tauri/src/lib.rs`: native config, platform info, timeout handling and Tauri command registration.
- `src/lib/desktopClient.ts`: typed frontend-to-Tauri IPC bridge.
- `src/lib/platformRuntime.ts`: frontend view of native platform metadata.
