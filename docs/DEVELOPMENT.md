# Development Guide

Coreor Database is a Tauri/Rust desktop application with a React/Next.js static UI.

## Setup

```bash
npm ci
npm run architecture:check
npm run typecheck
npm run native:check
npm run tauri:dev
```

See [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) for OS prerequisites.

## Repository structure

```text
src/app/                  static UI routes/layout
src/components/           desktop UI/workbench
src/context/              local app/account/language state
src/lib/                  typed UI services and Tauri IPC facade
src/locales/              translations
src-tauri/src/            native Rust application/database layer
src-tauri/capabilities/   Tauri permission model
scripts/                  validation and developer tooling
types/                    shared TypeScript types
docs/                     project/security/release docs
```

There must be no `src/app/api` database backend.

## Adding a database action

1. Extend the shared action/type contract.
2. Expose it through the typed UI facade.
3. Implement the action in Rust.
4. Validate identifiers and engine-specific behavior.
5. Enforce read-only policy for mutations.
6. Bound rows/time/payload.
7. Return actionable normalized errors.
8. Update engine documentation.

## Engine compatibility

Do not assume MySQL, PostgreSQL and SQL Server catalogs are interchangeable. TiDB/CockroachDB compatibility must be verified against real behavior.

## Cross-platform rules

- Avoid hard-coded Windows filesystem paths.
- Use Tauri path/platform APIs for native directories.
- Use the central shortcut registry for Ctrl/Command differences.
- Do not require PowerShell for normal product behavior.
- Test custom window/chrome changes on all three desktop OS families.
- Linux-specific native dependencies belong in CI/docs, not application assumptions.

## Security

Never log:

- database passwords,
- Coreor Account tokens,
- private keys,
- complete sensitive connection strings.

Read-only restrictions and destructive-operation policy belong in the native layer.

## Performance

Before adding polling/metadata calls ask:

- how many DB connections are opened,
- whether work repeats while hidden,
- whether requests overlap,
- whether metadata can be cached/deduplicated,
- whether the UI renders thousands of DOM nodes,
- whether data can be paged/virtualized.

## Optional account work

Account features must use capability gates. Guest/local DB usage must remain available if the account API is offline.

See [ACCOUNT_API.md](ACCOUNT_API.md).
