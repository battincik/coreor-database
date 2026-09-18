<p align="center">
  <img src="public/logo.png" width="112" alt="Coreor Database" />
</p>

<h1 align="center">Coreor Database</h1>

<p align="center">
  Cross-platform, local-first database client powered by Tauri and Rust.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.tr.md">Türkçe</a>
</p>

Coreor Database is a cross-platform, local-first database client built with **Tauri 2, Rust, React and Next.js**.

The UI is rendered in the operating system WebView, but Coreor Database is not a hosted web database client: database connections, SQL execution and administration operations run through the local Rust/Tauri process on the user's machine.

> **Project status:** private pre-release repository. The repository is being prepared for a future public open-source release under Apache-2.0.

## Platforms

- Windows 10/11
- macOS
- Linux desktop distributions supported by Tauri/WebKitGTK

## Database engines

- MySQL
- MariaDB
- TiDB
- PostgreSQL
- CockroachDB
- Microsoft SQL Server

## Architecture

```text
React / Next.js static UI
        │
        │ Tauri IPC
        ▼
Rust native application
        │
        ├── sqlx: MySQL / MariaDB / TiDB
        ├── sqlx: PostgreSQL / CockroachDB
        └── Tiberius: Microsoft SQL Server
        │
        ▼
Database server
```

There is no Next.js API backend between the application and the database. Database traffic originates from the local device.

An optional **Coreor Account API** may provide account-only features such as cloud sync, team workspaces and shared snippets. Signing in is not required for the local database client, and database credentials are not implicitly sent to the account service.

## Highlights

- Object Explorer for tables, views, procedures, functions, triggers and events
- SQL editor, history, favorites and notebooks
- Table browsing and editing
- Filtering, sorting and pagination
- Schema editing, indexes and foreign keys
- Schema graph
- Persistent transaction workspace
- Process, lock, user and privilege tools
- Import/export
- Performance and database intelligence tools
- Read-only profiles enforced in the native layer
- Platform-aware keyboard shortcuts
- Light/dark/AMOLED themes and multilingual UI

## Development

Requirements:

- Node.js 22 recommended
- Rust toolchain from `rust-toolchain.toml`
- platform prerequisites documented in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

```bash
npm ci
npm run architecture:check
npm run typecheck
npm run native:check
npm run tauri:dev
```

## Build

Build the package formats for the current operating system:

```bash
npm run tauri:build
```

Convenience commands:

```bash
npm run build:windows
npm run build:linux
npm run build:macos
```

Those platform-specific commands must be run on their corresponding operating system.

## Local-first configuration

Connection profiles and desktop configuration are stored in the Tauri application configuration directory. The optional account identity is intentionally separate from the local workspace.

Do not commit real database passwords, private keys, access tokens or production data.

## Repository

Useful project documents:

- [Architecture](ARCHITECTURE.md)
- [Database support](DATABASE_SUPPORT.md)
- [Contributing](CONTRIBUTING.md)
- [Governance](GOVERNANCE.md)
- [Security policy](SECURITY.md)
- [Security model](SECURITY_MODEL.md)
- [Roadmap](ROADMAP.md)
- [Releasing](RELEASING.md)
- [Documentation index](docs/README.md)

## License

Coreor Database is prepared under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) and [docs/LICENSE_GUIDE.md](docs/LICENSE_GUIDE.md) for additional attribution and project guidance.
