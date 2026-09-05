# Changelog

All notable changes to Coreor Web Database are documented in this file.

The project follows a pragmatic versioning approach. Until a formal release automation is introduced, version numbers in `package.json`, GitHub Releases and this file should be kept in sync manually.

## [Unreleased]

### Added
- Public repository documentation set.
- Apache License 2.0 and NOTICE file.
- Public release checklist and contributor/security guidance.
- Dependabot configuration for npm and GitHub Actions.

### Security
- Public SaaS connection model with private/reserved target blocking.
- Trusted-origin checks for database API requests.
- Request body size limits and per-user process-local rate limiting.
- Strong production NextAuth secret requirements.
- Safer database error normalization.
- Activity Console masking for common password, token and API-key fields.
- Security response headers including CSP, HSTS, frame, MIME, referrer and permissions policies.

### Performance
- Short-lived decrypted vault profile cache with in-flight read coalescing.
- Performance snapshot caching and request deduplication.

### Developer experience
- Standardized actionable database client errors.
- Hardened production deployment workflow with verification, health check and rollback logic.

## [3.1.0] - 2026

### Highlights
- Modern browser-based multi-database workbench.
- GitHub authentication and account-scoped browser vault.
- Support for MySQL, MariaDB, PostgreSQL, CockroachDB, TiDB and Microsoft SQL Server adapters.
- SQL workspace, table editing, schema exploration and administration tools.
- Transaction workspace for supported engines.
- Performance, process, schema graph, import/export, user management and automation-oriented tooling.
- Multi-language interface infrastructure.

### Architecture
- Database profiles stored in browser IndexedDB and encrypted with WebCrypto AES-GCM.
- Database connection requests routed through same-origin Next.js Node.js API handlers.
- Credentials are not intentionally persisted by the application server after a request completes.

## Maintenance rules

When preparing a new release:

1. Update `package.json` version.
2. Move relevant entries from `Unreleased` into a dated version section.
3. Run `npm ci` and `npm run check`.
4. Review security advisories and dependency updates.
5. Create a Git tag and GitHub Release.
6. Verify the production deployment.

See [RELEASING.md](RELEASING.md) for the complete release process.
