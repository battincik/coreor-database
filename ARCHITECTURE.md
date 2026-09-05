# Architecture

This document describes the current architecture of Coreor Web Database and the security boundaries contributors should preserve.

## Overview

Coreor Web Database is a Next.js application that provides a browser-based database workbench. The browser owns the user interface and encrypted connection-profile storage; the Next.js Node.js runtime owns authenticated API handling and opens outbound database connections.

High-level flow:

```text
Browser
  |
  | GitHub-authenticated session
  v
Encrypted browser vault (IndexedDB + WebCrypto AES-GCM)
  |
  | decrypt profile only when needed
  v
Same-origin /api/database request
  |
  v
Next.js Node.js runtime
  |
  | DNS resolution + network policy + driver connection
  v
MySQL / MariaDB / PostgreSQL / CockroachDB / TiDB / MSSQL
```

## Major layers

### 1. Presentation layer

Located primarily under `src/app` and `src/components`.

Responsibilities include:

- server/profile management UI,
- SQL workspace,
- table data editing,
- schema editing and exploration,
- performance/process/user-management panels,
- transaction workspace,
- import/export flows,
- localization and preferences,
- error presentation.

The UI must not assume that client-side validation is a security boundary. Sensitive policies must also be enforced server-side.

### 2. Client application services

Located primarily under `src/lib` and `src/context`.

Important responsibilities include:

- connection payload construction,
- browser vault access,
- query/workbench API wrappers,
- transaction API wrappers,
- engine metadata,
- client-side error normalization,
- activity console persistence/redaction,
- application preferences and language state.

### 3. Browser vault

`src/lib/secureVault.ts` stores database connection profiles in IndexedDB and encrypts sensitive profile data using WebCrypto AES-GCM.

Important properties:

- profiles are scoped to the active authenticated account,
- browser storage is local to a device/browser profile,
- encryption reduces exposure of plaintext at rest in IndexedDB,
- the browser must still decrypt a credential before sending a live database request,
- XSS or a compromised browser runtime can therefore bypass the protection provided by encryption-at-rest.

The vault is not a zero-knowledge system.

### 4. Authentication

GitHub OAuth is handled through NextAuth.

Authentication currently serves two main purposes:

- user identity,
- account/vault isolation.

The hosted product is designed so any valid GitHub-authenticated user can use the application. GitHub authentication is not intended to be a manual user allowlist.

Production requires a strong, stable `NEXTAUTH_SECRET` or compatible `AUTH_SECRET`.

### 5. Database API boundary

The primary database API is implemented under `src/app/api/database`.

The route is responsible for enforcing controls that must not rely on the client, including:

- authenticated session requirements,
- trusted-origin validation,
- request size limits,
- per-user process-local rate limiting,
- read-only policy enforcement where applicable,
- safe error normalization,
- transaction ownership checks.

This boundary should remain deliberately narrow. New actions should be added with explicit input validation and authorization/policy checks.

### 6. Database services

Server-side services under `src/lib/server` contain engine-aware connection and workbench logic.

Responsibilities include:

- DNS resolution,
- private/reserved IP rejection,
- allowed-port enforcement,
- TLS/SNI behavior,
- driver configuration,
- SQL execution,
- metadata queries,
- table operations,
- administration operations,
- performance snapshots,
- transaction lifecycle.

## Network security model

A public deployment acts as an outbound database connector. That makes network destination validation a core security boundary.

Default policy:

- public DNS/IP database targets may be used,
- loopback, private, link-local and reserved destinations are blocked,
- private/local exceptions must be explicitly configured through `DATABASE_ALLOWED_HOSTS`,
- outbound ports are restricted through `DATABASE_ALLOWED_PORTS`.

DNS resolution is performed before connecting and the resolved address is validated. The original hostname is preserved for TLS SNI where required.

Do not weaken destination validation merely to make local/private databases easier to connect from a public SaaS deployment. Self-hosted installations can explicitly opt into private targets.

## Credential lifecycle

A typical credential lifecycle is:

1. User saves a profile in the browser.
2. Profile is encrypted before persistence in IndexedDB.
3. User performs a database action.
4. Browser decrypts the selected profile.
5. Browser sends the credential to the authenticated same-origin API request.
6. Next.js runtime holds the credential in memory long enough to connect to the database.
7. Database driver performs the operation.
8. Connection is closed or released according to the operation.
9. Application code should not persist the plaintext credential server-side.

Logs, exceptions and activity metadata must avoid writing credentials.

## Query execution

The application supports direct SQL execution and higher-level workbench actions.

Safety controls include:

- query timeout configuration,
- result-size limits,
- page-size limits,
- request-size limits,
- read-only profiles,
- multiple-statements disabled where supported/configured,
- explicit confirmation flows for destructive operations in the UI.

Result limiting must be implemented defensively. SQL syntax such as CTEs, comments and engine-specific constructs must not bypass intended limits; see the related project issue for ongoing hardening.

## Transactions

The current transaction service keeps live transaction sessions in process-local memory.

Consequences:

- it works predictably only when subsequent transaction requests reach the same process,
- random routing across serverless instances or a multi-process cluster can break transaction continuity,
- horizontal scaling requires sticky routing or a redesigned stateful transaction service.

Until that architecture changes, production deployments should avoid multi-instance transaction routing.

## Performance layer

Performance snapshots may combine multiple database metadata queries. The application includes short-lived caching/deduplication to reduce repeated expensive work.

Future performance work should prefer:

- lazy metadata loading,
- engine-aware queries,
- bounded caches,
- cancellation/timeouts,
- avoiding unbounded information-schema scans.

## Localization

Translations live under `src/locales` and are validated through `npm run i18n:check`.

New UI strings should use the project localization mechanism rather than adding permanent hard-coded strings to components.

## Configuration

Important production configuration includes:

- `GITHUB_ID`
- `GITHUB_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `AUTH_TRUSTED_ORIGINS`
- `DATABASE_ALLOWED_HOSTS`
- `DATABASE_ALLOWED_PORTS`
- `DATABASE_QUERY_TIMEOUT_MS`
- `DATABASE_MAX_RESULT_ROWS`
- `DATABASE_RATE_LIMIT_REQUESTS`
- `DATABASE_MAX_PAGE_SIZE`
- `DATABASE_API_MAX_BODY_BYTES`

See `.env.example`, [DEPLOYMENT.md](DEPLOYMENT.md) and [SELF_HOSTING.md](SELF_HOSTING.md).

## Design rules for contributors

When changing architecture:

1. Treat the browser as an untrusted client.
2. Enforce sensitive policy server-side.
3. Never log database credentials.
4. Keep public-host and private-network policy separate.
5. Preserve least-privilege defaults.
6. Bound memory, result sizes and caches.
7. Document differences between database engines.
8. Avoid process-local state when introducing horizontally scaled features unless sticky routing is explicitly required and documented.
9. Run `npm run check` before merging.
10. Update architecture/security documentation when a trust boundary changes.

See [SECURITY_MODEL.md](SECURITY_MODEL.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for deeper security detail.
