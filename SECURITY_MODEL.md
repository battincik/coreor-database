# Security Model

Coreor Database is a local-first desktop database client.

## Trust boundaries

1. **UI/WebView** — React/Next.js interface embedded by Tauri.
2. **Native Rust process** — trusted application boundary that owns database connections, local config and transaction state.
3. **Target database** — remote or local database server; protocol responses are treated as untrusted input.
4. **Local operating-system account** — protects application files and local configuration.
5. **Optional Coreor Account API** — independent online identity/capability service; not part of the database connection path.

## Database credentials

Database credentials are required in native memory while a connection is active.

Current connection profiles are persisted in the Tauri app configuration area. This is local storage, not a claim of hardware-backed secret protection.

Planned hardening should use platform secret stores where practical.

## Native IPC

The UI does not connect to databases directly and does not call a local Next.js API. Database actions use typed Tauri commands.

Tauri capabilities should remain minimal and explicitly grant only required native operations.

## Read-only policy

Read-only profiles are enforced in the Rust database layer. UI disabling is secondary defense-in-depth.

Database-level least-privilege/read-only accounts are still recommended for production inspection.

## Resource bounds

Native database work should remain bounded by:

- query timeout,
- result-row limits,
- table page limits,
- transaction TTL/capacity,
- bounded metadata discovery,
- lazy loading and request deduplication.

## Target database threat

A database server can be slow, malformed, malicious or unexpectedly large. Drivers must use timeouts and bounded decoding/serialization. Raw sensitive driver errors should not be persisted unnecessarily.

## Optional account API

Guest mode remains valid. Account outages must not block local database usage.

The account API may receive account identity, capability, collaboration or opt-in sync data. It should not receive local database passwords by default.

## Local compromise

A process running with the same user privileges may be able to read local application files or process memory. Coreor Database cannot claim to protect secrets from a fully compromised OS account.

## Supply chain

Lockfiles, deterministic installs, minimal GitHub Actions permissions, dependency review and release signing are part of the security model.

## Release security

Before a public release:

- scan full Git history for secrets,
- enable secret scanning and push protection,
- enable private vulnerability reporting,
- review third-party licenses,
- validate Windows/macOS/Linux builds,
- sign/notarize production artifacts when distribution begins.
