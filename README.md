# Coreor Web Database

<p align="center">
  <strong>A modern, browser-based database workbench for managing multiple SQL servers from one interface.</strong>
</p>

<p align="center">
  <a href="README.md"><strong>English</strong></a> ·
  <a href="README.tr.md">Türkçe</a>
</p>

<p align="center">
  <a href="https://web.database.coreor.net">Live App</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

Coreor Web Database is a self-hostable web database client built with Next.js. It brings a desktop-database-client workflow to the browser while keeping server profiles separated per authenticated user and storing connection profiles in an encrypted browser vault.

The public application is designed so that any GitHub user can sign in and connect to database servers that are publicly reachable from the application runtime. Private, loopback, link-local and reserved network targets remain blocked by default as part of the SSRF protection model.

## Highlights

- Multi-server workspace with per-user connection profiles
- Encrypted browser vault backed by IndexedDB and AES-256-GCM
- SQL query workspace with tabs, execution history and result views
- Schema and catalog exploration
- Table data browsing, filtering, sorting, pagination and editing
- Table/schema editing tools
- Import and export workflows
- User, role and privilege management where supported by the database engine
- Process and connection monitoring
- Performance snapshots and server diagnostics
- Transaction workspace for MySQL-compatible engines
- Schema relationship visualization
- Read-only connection profiles with server-side enforcement
- Built-in internationalization
- Dark, desktop-oriented workbench UI

## Supported database engines

| Engine | Status |
| --- | --- |
| MySQL | Supported |
| MariaDB | Supported |
| PostgreSQL | Supported |
| CockroachDB | Supported through the PostgreSQL-compatible adapter |
| TiDB | Supported through the MySQL-compatible adapter |
| Microsoft SQL Server | Supported |

Capabilities can differ by engine and server version. Features such as user management, transactions, metadata queries and performance diagnostics depend on the permissions and capabilities exposed by the target server.

## How it works

```text
Browser
  │
  ├─ GitHub OAuth session
  │
  ├─ Encrypted IndexedDB vault
  │    └─ host / username / password / profile settings
  │
  └─ same-origin request
       ↓
Next.js /api/database
  │
  ├─ authentication + origin checks
  ├─ request/rate/read-only policies
  ├─ outbound host and port validation
  └─ temporary database connection
       ↓
Target database server
```

Connection profiles and database passwords are not persistently stored by the Next.js server. The browser decrypts a profile only when it is needed and sends the connection data to the same-origin database API. The Node.js runtime necessarily receives the credential in memory while establishing the database connection, so this architecture should not be described as end-to-end or zero-knowledge encryption.

For the detailed vault and API model, see [`docs/browser-vault-and-next-api.md`](docs/browser-vault-and-next-api.md).

## Public SaaS network model

The hosted application is intentionally usable by all authenticated GitHub users. Authorization is therefore not implemented as a GitHub user allowlist.

Instead, the server limits where users can make outbound database connections:

- Publicly routable database hosts are allowed.
- Loopback, private, link-local and reserved addresses are blocked by default.
- DNS targets are resolved before connection policy checks.
- `DATABASE_ALLOWED_HOSTS` is an explicit exception list for private/local targets when self-hosting in a trusted environment.
- `DATABASE_ALLOWED_PORTS` restricts outbound connections to expected database ports.
- Production deployments should add centralized rate limiting or WAF controls when running multiple application instances.

A database that is only available on a user's LAN cannot be reached by the public hosted service unless the application server itself has a network route to that database. Do not expose a database to the Internet only to make it accessible from this application; prefer a VPN, tunnel, private deployment or another controlled network path.

## Requirements

- Node.js `>=20.9.0` — current Node.js 22 LTS is recommended for production
- npm
- A GitHub OAuth application
- Network access from the Next.js runtime to the target database servers
- HTTPS for production deployments

This application requires a running Node.js server. Static export-only hosting is not supported.

## Local development

```bash
git clone https://github.com/battincik/web.database.coreor.net.git
cd web.database.coreor.net
npm ci
cp .env.example .env.local
npm run dev
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Create a GitHub OAuth application and configure the required environment variables before signing in.

## Environment variables

A minimal production configuration looks like this:

```env
GITHUB_ID=
GITHUB_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://web.database.coreor.net

# Additional trusted application origins, if required.
AUTH_TRUSTED_ORIGINS=

# Leave empty for a public SaaS deployment unless you intentionally
# want to permit a normally-blocked private/local database target.
DATABASE_ALLOWED_HOSTS=

DATABASE_ALLOWED_PORTS=3306,4000,5432,26257,1433
DATABASE_QUERY_TIMEOUT_MS=30000
DATABASE_MAX_RESULT_ROWS=5000
DATABASE_RATE_LIMIT_REQUESTS=300
DATABASE_MAX_PAGE_SIZE=500
DATABASE_API_MAX_BODY_BYTES=12000000
```

Generate a stable authentication secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`NEXTAUTH_SECRET` or `AUTH_SECRET` is required in the production runtime and must be at least 32 characters. Keep it stable between deployments; changing it invalidates existing sessions.

See [`.env.example`](.env.example) for the complete documented configuration.

## Production

Run deterministic dependency installation and the full project checks before deployment:

```bash
npm ci
npm run check
npm run start
```

The repository currently starts the production server on port `3302`. Put the application behind an HTTPS reverse proxy or a managed HTTPS platform.

### Recommended production controls

- Use a stable, strong `NEXTAUTH_SECRET`.
- Configure the GitHub OAuth callback for the exact production origin.
- Keep `DATABASE_ALLOWED_HOSTS` empty unless a private-network exception is intentionally required.
- Keep `DATABASE_ALLOWED_PORTS` restricted to database ports you actually support.
- Use least-privilege database accounts instead of `root`, `postgres` or `sa` for normal work.
- Prefer verified TLS connections to database servers.
- Add reverse-proxy/WAF/Redis-backed rate limiting for multi-instance deployments.
- Keep framework and authentication dependencies patched.
- Enable branch protection and required checks for `main` before accepting public contributions.
- Review [`docs/PUBLIC_RELEASE_CHECKLIST.md`](docs/PUBLIC_RELEASE_CHECKLIST.md) before changing repository visibility.

## Security and privacy notes

- GitHub OAuth identifies the user and separates account-scoped browser data; any GitHub user can sign in to the public service.
- Server profiles are encrypted in browser IndexedDB using AES-GCM.
- The encryption key is device/browser-profile scoped and is not intended as protection against same-origin XSS.
- Database credentials are sent to the application server only when a database operation requires a connection and are not intentionally persisted server-side.
- SQL activity may be retained locally in browser session storage; sensitive password/token-shaped values are redacted where recognized, but users should still avoid placing secrets directly inside SQL literals.
- Private and reserved network targets are blocked by default to reduce SSRF risk.
- The database API applies same-origin, request-size, rate-limit and read-only checks.
- Production responses normalize common database-driver failures rather than returning arbitrary driver messages.

Please report security vulnerabilities privately according to [`SECURITY.md`](SECURITY.md) rather than opening a public issue.

## Multi-instance limitation

Live transaction sessions currently keep an open database connection in application-process memory. A transaction started on one process cannot safely continue on another process without sticky routing or a dedicated stateful transaction service.

For this reason, do not enable arbitrary multi-process/serverless transaction routing until the transaction architecture is changed. Normal stateless database requests do not have the same limitation.

## Project structure

```text
src/app/                 Next.js application and API routes
src/components/          Workbench UI and database tools
src/context/             Authentication, database and language contexts
src/lib/                 Client utilities and API clients
src/lib/server/          Database adapters and server-side execution services
src/locales/             UI translations
docs/                    Architecture and operational documentation
scripts/                 Validation scripts
```

## Quality checks

```bash
npm run i18n:check
npm run lint
npm run typecheck
npm run build
npm run check
```

`npm run check` runs locale validation, linting and the production build pipeline.

## Contributing

Issues and pull requests are welcome once the repository is public. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before submitting changes, especially for database-engine behavior or security-sensitive networking changes.

## License

A repository license has not yet been selected. Until a license is added, publishing the source code does **not** automatically grant permission to copy, modify or redistribute it. License selection is tracked as a public-release requirement.

## Roadmap

- Cursor/stream-based handling for very large result sets
- Encrypted vault export/import
- Optional secure device-to-device profile synchronization
- Multi-instance-safe transaction architecture
- Lazy and optimized metadata loading for very large database servers
- Stronger centralized abuse and rate-limit controls for the hosted public service

---

Coreor Web Database is an independent project and is not affiliated with MySQL, MariaDB, PostgreSQL, Cockroach Labs, TiDB/PingCAP, Microsoft or GitHub.
