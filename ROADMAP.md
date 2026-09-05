# Roadmap

This roadmap describes the intended direction of Coreor Web Database. It is not a contractual delivery schedule; priorities may change based on security, maintainability, community feedback and database-engine compatibility.

## Product principles

- Keep the core database workflow fast and understandable.
- Prefer browser-native UX without pretending the browser is a trusted server environment.
- Treat database credentials, network reachability and SQL execution as security-sensitive features.
- Support multiple engines through explicit capability boundaries instead of pretending every engine behaves the same.
- Keep self-hosting practical.
- Make hosted/public deployments safe by default.

## Near term

### Security and public release
- Upgrade framework/auth dependencies to patched releases tracked in Issue #32.
- Complete GitHub Actions reliability work tracked in Issue #36.
- Close or mitigate SELECT/CTE result-limit bypass tracked in Issue #37.
- Complete full Git-history secret scanning before/around public release.
- Enable branch protection/rulesets, secret scanning and private vulnerability reporting.

### Database workbench
- Improve SQL editor result limiting for comments, CTEs and engine-specific syntax.
- Better explain query cancellation, timeout and partial-result behavior.
- Add safer destructive-action previews.
- Improve engine-aware SQL hints and error presentation.
- Expand schema diff and migration generation workflows.

### Data browsing
- Cursor/keyset pagination for large tables.
- Better large BLOB/text handling without inflating API payloads.
- Smarter column filters and saved views.
- Batch-edit safeguards and configurable row limits.

## Medium term

### Multi-instance architecture
- Move transaction state away from process-local memory or introduce an explicit stateful transaction gateway.
- Add deployment-mode detection that prevents unsafe transaction usage on incompatible serverless/multi-instance deployments.
- Introduce centralized rate limiting for hosted deployments using Redis, a reverse proxy or platform-native controls.
- Add per-user concurrent connection and transaction quotas.

### Performance
- Lazy catalog/schema metadata loading for large database servers.
- Incremental schema graph loading.
- Reuse/pool short-lived connection work where safe.
- Better metrics for slow metadata queries and workbench operations.
- Optional streaming/cursor-based result transport.

### Vault and portability
- Encrypted vault export/import.
- Safer recovery/backup flow for browser-stored profiles.
- Optional device-to-device synchronization design with explicit threat model.
- Clear separation between local-only profiles and future synchronized profiles.

### Observability
- Structured server logs without credentials or raw sensitive SQL parameters.
- Request IDs across API and database operations.
- Health/readiness endpoints suitable for orchestration.
- Optional privacy-conscious usage diagnostics.

## Long term

### Collaboration
- Shareable query notebooks without sharing credentials.
- Team workspaces with explicit server/profile ownership rules.
- Role-based access to shared metadata and saved queries.
- Approval workflows for destructive production operations.

### Extensibility
- Engine/plugin capability interface.
- Extension points for custom database metadata panels.
- Optional formatter/linter integrations.
- Import/export adapters and automation hooks.

### Advanced database tooling
- Index advisor improvements.
- Query plan visualization across supported engines.
- Lock/deadlock diagnostics.
- Replication/topology views where engines expose them safely.
- Backup/restore orchestration with deployment-specific guardrails.

## Non-goals unless the architecture changes

- Claiming zero-knowledge or end-to-end encryption for live database access. The application server must receive credentials in memory to establish database connections.
- Allowing arbitrary internal-network access from a public hosted instance by default.
- Hiding engine-specific behavior behind misleading universal abstractions.

## How to influence the roadmap

Open a GitHub issue with:

- the problem you are trying to solve,
- the database engine/version involved,
- expected workflow,
- security or deployment constraints,
- screenshots or reproducible examples when useful.

For implementation guidance, see [CONTRIBUTING.md](CONTRIBUTING.md).
