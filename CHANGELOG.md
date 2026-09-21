# Changelog

Notable changes to Coreor Database are tracked here.

## [Unreleased]

### Architecture
- Converted the product direction from hosted/browser-first to a cross-platform Tauri desktop application.
- Database access now belongs to the local Rust process through Tauri IPC.
- Added cross-platform bundle configuration for Windows, macOS and Linux.
- Added optional account capability architecture that does not gate local database access.

### Added
- Full Object Explorer for tables, views, procedures, functions, triggers and events.
- Rich object/context menus and platform-aware keyboard shortcuts.
- Fuzzy Command Palette with recent commands and database-object indexing.
- Native row insertion workflow.
- Cross-platform GitHub Actions validation and artifact workflows.
- Open-source project documentation and Apache-2.0 metadata.

### Performance
- Added reusable MySQL-family connection pools with per-profile concurrency limits.
- Deduplicated identical table-data requests and removed duplicate first-page loads.
- Applied SQL editor result limits before fetching rows from MySQL-family servers.
- Lazy and cached database-object discovery.
- Reduced repeated metadata connections and polling.
- Heavy UI tools load on demand.
- Background/hidden-window polling is reduced.
- Native resource profiling support for Windows.

### Security
- Added an AES-256-GCM local connection vault backed by platform credential storage for the device key.
- Native read-only enforcement.
- Guest-first account design; account availability does not control local DB access.
- Architecture guard prevents reintroduction of hosted database API routes and Node DB drivers.

## [3.1.0] - 2026

### Historical note
3.1.0 began during the earlier web-client era. The current unreleased branch supersedes that architecture with the Tauri/Rust local-first desktop model.

## Release maintenance

When preparing a release, synchronize:

1. `package.json`,
2. `src-tauri/Cargo.toml`,
3. `src-tauri/tauri.conf.json`,
4. this changelog,
5. the Git tag/GitHub Release.

See [RELEASING.md](RELEASING.md).
