# Deployment

This document describes production deployment expectations for Coreor Web Database.

For a step-by-step self-hosting guide, see [SELF_HOSTING.md](SELF_HOSTING.md).

## Deployment goals

A production deployment should provide:

- HTTPS-only user access,
- stable GitHub OAuth configuration,
- a strong stable NextAuth secret,
- controlled outbound database connectivity,
- deterministic dependency installation,
- reproducible application builds,
- health verification after deploy,
- rollback capability,
- logs that do not contain database credentials.

## Supported deployment shape

The application requires a Next.js Node.js runtime because database drivers open outbound TCP connections from the application server.

Typical topology:

```text
Internet
   |
   v
HTTPS reverse proxy / platform ingress
   |
   v
Next.js application :3302
   |
   +--> GitHub OAuth
   |
   +--> Public database targets on allowed ports
```

## Pre-deployment checks

Run from a clean install:

```bash
npm ci
npm run check
```

`npm run check` currently combines locale validation, linting and build/type checks through the repository scripts.

Do not deploy from a working tree containing uncommitted production-only modifications.

## Environment variables

Use `.env.example` as the canonical starting point.

Minimum production identity configuration:

```env
GITHUB_ID=...
GITHUB_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://your-domain.example
```

Recommended network/resource controls:

```env
AUTH_TRUSTED_ORIGINS=
DATABASE_ALLOWED_HOSTS=
DATABASE_ALLOWED_PORTS=3306,4000,5432,26257,1433
DATABASE_QUERY_TIMEOUT_MS=30000
DATABASE_MAX_RESULT_ROWS=5000
DATABASE_RATE_LIMIT_REQUESTS=300
DATABASE_MAX_PAGE_SIZE=500
DATABASE_API_MAX_BODY_BYTES=12000000
```

### Secret management

Production secrets should be stored in:

- platform environment secrets,
- a secrets manager,
- protected host environment files.

Do not store them in:

- Git,
- Docker image layers,
- public CI logs,
- README examples containing real values.

## NEXTAUTH_SECRET

Generate once:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Then keep the value stable across deploys.

Rotating it intentionally will invalidate existing sessions. If rotation is necessary due to suspected compromise, prefer forced re-authentication over keeping a compromised secret.

## Origin configuration

`NEXTAUTH_URL` should be the canonical external HTTPS origin.

Examples:

```env
NEXTAUTH_URL=https://webdatabase.example.com
```

Additional trusted origins should only be configured when genuinely required:

```env
AUTH_TRUSTED_ORIGINS=https://admin-proxy.example.com
```

Avoid wildcard trust patterns on public deployments.

## Outbound database access

### Public deployment

Recommended:

```env
DATABASE_ALLOWED_HOSTS=
```

Keeping the explicit host exception list empty allows normal public targets while preserving default blocks on private/reserved destinations.

### Private self-hosted deployment

If intentional internal database access is required:

```env
DATABASE_ALLOWED_HOSTS=10.0.10.20,db.internal.example.com
```

Treat each entry as an expansion of the application's network trust boundary.

## Reverse proxy

The reverse proxy should:

- terminate HTTPS,
- preserve the canonical Host,
- forward the correct HTTPS scheme,
- apply sensible request-size/time limits,
- optionally add edge rate limiting,
- avoid exposing the internal Next.js port publicly.

Example Nginx proxy headers:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;
```

Do not rely on untrusted forwarding headers as the sole application-origin security decision.

## Process management

A production host can use PM2 or systemd.

### PM2

```bash
pm2 start npm --name coreor-web-database -- run start
pm2 save
```

Deploy restart:

```bash
pm2 restart coreor-web-database --update-env
```

### systemd

Run the service as a non-root user and keep environment secrets outside the repository.

## Transaction deployment constraint

Live transaction sessions are currently process-local.

Therefore:

- one process is safe for transaction continuity,
- multiple workers require deterministic sticky routing,
- ordinary serverless autoscaling is not transaction-safe,
- rolling deploys can terminate open transactions.

Plan deploys accordingly and avoid presenting transaction continuity guarantees that the deployment topology cannot satisfy.

## Vercel

When deploying on Vercel or another serverless platform verify:

- Node.js runtime is used for database routes,
- outbound TCP database connections are supported,
- target database firewalls allow the platform egress path,
- function duration supports expected queries,
- request/response limits are acceptable,
- process-local transaction features are disabled/avoided or otherwise made stateful,
- rate limiting is centralized outside an individual function instance.

## Database firewall configuration

A hosted database may require source-network allowlisting.

Possible models:

- public database with IP/network allowlist,
- VPN/private network from a self-hosted Coreor instance,
- managed provider proxy/gateway.

Do not expose a database to the entire Internet merely to simplify setup. Prefer provider firewall rules and least-privilege database users.

## Database TLS

For Internet database traffic:

- require TLS where supported,
- use trusted certificate chains,
- verify hostname/certificate identity,
- keep private CA trust explicit.

A self-signed certificate error should be fixed through certificate trust or correct TLS configuration rather than disabling verification globally.

## Build and deploy workflow

Recommended order:

1. Fetch the exact intended commit.
2. Verify working tree and commit SHA.
3. `npm ci --no-audit --no-fund` or organization-approved deterministic install.
4. Run `npm run check`.
5. Build production assets.
6. Restart/reload application with updated environment.
7. Perform local health check.
8. Perform external HTTPS smoke test.
9. Test authentication.
10. Test a disposable database connection/query.

## Health checks

At minimum verify an HTTP page such as `/login` responds successfully.

A future dedicated readiness endpoint should distinguish:

- process alive,
- application configuration valid,
- OAuth configuration present,
- no need to probe arbitrary customer databases.

Do not put production database credentials in health checks.

## Rollback

Keep the previous known-good commit/release available.

A rollback should restore:

- source commit,
- lockfile/dependency set,
- production build,
- application process.

Be careful when a release changes environment variable meaning or browser data formats; source rollback alone may not restore compatibility.

## Database migrations

The current application does not rely on a central persistent relational application database for user connection profiles. If future releases introduce server-side persistence, deployment documentation must add an explicit migration/rollback process before those changes ship.

## Observability

Recommended logs:

- request ID,
- route/action type,
- response code,
- duration,
- engine type,
- sanitized failure code.

Avoid logging:

- database password,
- GitHub OAuth secret,
- NextAuth secret,
- Authorization/cookie headers,
- full connection payloads,
- sensitive SQL parameters.

## Rate limiting in production

Current process-local limits are baseline protection only.

For a public or horizontally scaled deployment use:

- Nginx/edge rate limiting,
- platform WAF,
- Redis-backed distributed rate limits,
- connection/concurrency quotas.

## Deployment security checklist

Before production:

- [ ] HTTPS works and HTTP redirects to HTTPS.
- [ ] `NEXTAUTH_URL` is canonical and correct.
- [ ] OAuth callback matches the deployed domain.
- [ ] `NEXTAUTH_SECRET` is strong and stable.
- [ ] No real secret is present in Git or build logs.
- [ ] Public deployment has no unnecessary private-host exceptions.
- [ ] Allowed database ports are minimal.
- [ ] Framework/auth dependencies are patched.
- [ ] `npm run check` passes.
- [ ] Reverse proxy/app health checks pass.
- [ ] Transaction topology is compatible with process-local state.
- [ ] Database accounts use least privilege.
- [ ] Database TLS is enabled where appropriate.
- [ ] Centralized rate limiting exists for high-traffic public deployments.

See [docs/PUBLIC_RELEASE_CHECKLIST.md](docs/PUBLIC_RELEASE_CHECKLIST.md) for repository/public-release controls.
