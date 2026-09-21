# Roadmap

This roadmap describes direction, not guaranteed dates.

## Product principles

- Local-first database access.
- Cross-platform desktop behavior.
- Fast workflows for large databases.
- Explicit engine capabilities.
- Native enforcement for security-sensitive policies.
- Optional online account features without making login mandatory.
- Open-source-friendly development and release processes.

## Near term

### Cross-platform foundation
- Stabilize Windows, macOS and Linux CI.
- Finalize platform icons, signing and notarization.
- Improve custom title-bar behavior per platform.
- Harden and validate platform-native credential storage, recovery and Linux Secret Service prerequisites.
- Validate packaging on common Linux distributions.

### Daily database workflow
- Finish Object Explorer metadata consistency.
- Virtualize large table/result grids.
- Improve multi-row editing and clipboard workflows.
- Selection-aware SQL execution.
- User/system SQL activity separation.
- Query plan visualization.

### Coreor Account API
- Restore account API as an optional service.
- Device/session management.
- Capability/entitlement endpoint.
- Shared snippets.
- Team workspaces.
- Explicit opt-in sync model.

## Medium term

- Schema compare and migration generator.
- Native streaming import/export for very large files.
- SSH tunnel support.
- Better TLS/CA configuration.
- Secure credential-store abstraction across Windows/macOS/Linux.
- Crash diagnostics and privacy-conscious support bundles.
- Signed automatic updates.
- Additional PostgreSQL/MSSQL administration coverage.

## Long term

- Plugin/extension model with explicit native permissions.
- Advanced EXPLAIN/query-plan visualization.
- Replication/topology tooling.
- Team approval workflows.
- Optional encrypted cross-device workspace sync.
- Additional database engines where maintenance quality can be sustained.

## Non-goals

- Reintroducing a hosted proxy for normal database connections.
- Requiring a Coreor account for local DB access.
- Pretending all engines expose identical administration semantics.
