# Troubleshooting

This guide covers common development, authentication, network, TLS and database connection problems in Coreor Web Database.

When reporting a problem, remove passwords, tokens, private hostnames and other secrets before sharing logs or screenshots.

## 1. Application does not build

Start with a clean deterministic install:

```bash
rm -rf node_modules .next
npm ci
npm run check
```

On Windows PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules,.next -ErrorAction SilentlyContinue
npm ci
npm run check
```

If the lockfile and `package.json` disagree, regenerate the lockfile intentionally and review the dependency diff rather than using an ad-hoc install in production.

### TypeScript errors

Run:

```bash
npm run typecheck
```

Typical causes:

- optional values passed where a required string is expected,
- stale component/API types after refactors,
- database-engine unions missing a new branch,
- React ref/timer type mismatches.

Fix the type contract rather than suppressing the error with broad `any` casts.

## 2. Locale validation fails

Run:

```bash
npm run i18n:check
```

Check:

- missing translation keys,
- malformed JSON,
- inconsistent locale structures,
- newly added UI strings that bypass the localization system.

## 3. GitHub login fails

Verify:

```env
GITHUB_ID=...
GITHUB_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://your-domain.example
```

Check the GitHub OAuth application's callback URL. It should normally be:

```text
https://your-domain.example/api/auth/callback/github
```

Common symptoms:

- callback mismatch,
- wrong OAuth client ID/secret,
- `NEXTAUTH_URL` points to localhost in production,
- reverse proxy reports HTTP while the public site is HTTPS,
- old session cookie after `NEXTAUTH_SECRET` rotation.

## 4. `JWEDecryptionFailed` / session decryption errors

This commonly occurs after changing the NextAuth secret.

Resolution:

1. Configure a strong stable `NEXTAUTH_SECRET`.
2. Fully restart the application.
3. Sign out/clear the old session cookie.
4. Sign in again.

Do not generate a new secret on every deployment.

## 5. Database connection timeout

Possible causes:

- database port is closed,
- firewall blocks the application server,
- cloud database source allowlist does not include the application egress path,
- wrong hostname/port,
- DNS problem,
- database listens only on localhost/private interface,
- platform does not support required outbound TCP behavior.

Test from the application server, not only from your laptop.

Examples:

```bash
getent hosts db.example.com
nc -vz db.example.com 3306
```

For PostgreSQL:

```bash
nc -vz db.example.com 5432
```

Use equivalent diagnostic tooling available on your host.

## 6. `ENOTFOUND` / DNS failure

Check:

- hostname spelling,
- DNS records,
- DNS resolver available to the application runtime,
- split-horizon/private DNS behavior,
- whether a private hostname is being used from a public hosted instance.

Remember that the application server resolves the hostname. The fact that the user's local computer can resolve an internal hostname does not mean the hosted Coreor server can.

## 7. Private/local host is blocked

Examples:

- `127.0.0.1`
- `localhost`
- `10.x.x.x`
- `172.16.0.0/12`
- `192.168.x.x`
- link-local/reserved targets

This is expected on a public deployment.

For an intentional self-hosted private target, add an explicit exception:

```env
DATABASE_ALLOWED_HOSTS=192.168.1.20,db.internal.example.com
```

Do not add broad private ranges to a public hosted instance just to make one connection work.

## 8. Port is blocked

Check:

```env
DATABASE_ALLOWED_PORTS=3306,4000,5432,26257,1433
```

If your database uses a custom port, add only that specific port.

After changing environment variables, restart/redeploy the application.

## 9. `self-signed certificate in certificate chain`

This means the Node.js/database TLS stack cannot build a trusted certificate chain.

Preferred fixes:

1. Use a certificate signed by a trusted CA.
2. If using an internal CA, install/trust that CA on the application host.
3. For Node.js, an administrator-controlled CA bundle may be supplied through mechanisms such as `NODE_EXTRA_CA_CERTS` where appropriate.
4. Verify the database server is sending the complete certificate chain.

Avoid globally disabling certificate verification on a public service.

## 10. Certificate hostname mismatch

Symptoms may include hostname/SAN validation errors.

Check:

- the hostname entered in Coreor matches the certificate SAN,
- you are not connecting by raw IP to a certificate issued only for a DNS name,
- reverse proxy/database TLS termination is configured for the intended hostname.

## 11. Database authentication fails

Verify:

- username,
- password,
- authentication host/source rules,
- selected database,
- SSL/TLS requirements,
- account not locked/expired,
- provider-specific access controls.

Engine examples:

### MySQL/MariaDB

An account such as `'user'@'localhost'` may not permit remote connections. Create/configure an account with the correct host rule and least privileges.

### PostgreSQL

Check `pg_hba.conf` or managed-provider equivalent and role/database privileges.

### MSSQL

Check SQL authentication mode, login state, firewall and encryption requirements.

## 12. Query succeeds in desktop client but fails in Coreor

Compare:

- exact engine/version,
- TLS mode,
- selected database/schema,
- session variables,
- SQL mode,
- client encoding,
- transaction state,
- user permissions,
- driver differences.

Desktop clients may silently set session options that a web driver does not.

## 13. Query is cut off or limited

Coreor applies result limits and timeouts to protect the application runtime.

Relevant variables:

```env
DATABASE_QUERY_TIMEOUT_MS=30000
DATABASE_MAX_RESULT_ROWS=5000
DATABASE_MAX_PAGE_SIZE=500
```

For intentional large exports, prefer bounded export workflows rather than increasing interactive UI limits without review.

## 14. Large BLOB/text operation fails

Possible causes:

- application request-size limit,
- serverless/platform request/response limit,
- database packet limit,
- browser memory pressure,
- base64 expansion.

Check:

```env
DATABASE_API_MAX_BODY_BYTES=12000000
```

Do not raise limits to extremely large values on a public deployment without considering memory and abuse impact.

## 15. Read-only profile rejects a write

Expected behavior.

Read-only mode is enforced server-side for supported actions/SQL classification.

To perform mutations, use a separate write-capable profile/account intentionally. For production inspection, keeping the default profile read-only is recommended.

## 16. Transaction disappears / `transaction not found`

The current transaction service stores live connections in process-local memory.

Common causes:

- application restarted,
- deployment occurred,
- request was routed to another process/container/function instance,
- transaction TTL expired.

Resolution:

- use a single application process for transaction workflows,
- or guarantee sticky routing,
- avoid serverless random routing for live transaction sessions.

See [ARCHITECTURE.md](ARCHITECTURE.md).

## 17. Vercel/serverless connection problems

Check:

- database allows connections from platform egress,
- runtime supports outbound TCP for the selected driver,
- function execution timeout,
- body/response limits,
- Node.js runtime rather than Edge runtime,
- TLS trust chain.

Transaction workspace may not be reliable across instances even when normal one-shot queries work.

## 18. GitHub Actions starts with zero jobs / startup failure

This can be caused by repository/org Actions policy, billing/runner configuration, workflow permissions or unavailable self-hosted runner labels.

Check:

- repository Settings → Actions,
- organization policy if applicable,
- self-hosted runner online state,
- exact runner labels,
- Actions billing/quota,
- workflow YAML syntax and trigger rules.

A workflow run with `startup_failure` and no jobs generally fails before job execution, so application code logs will not explain it.

## 19. Nginx `502 Bad Gateway`

Check the application locally:

```bash
curl -I http://127.0.0.1:3302/login
```

Then inspect:

```bash
pm2 status
pm2 logs coreor-web-database
sudo nginx -t
sudo journalctl -u nginx -n 100 --no-pager
```

Verify `proxy_pass` points to the correct application port.

## 20. OAuth works locally but not behind Nginx

Ensure:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto https;
```

And:

```env
NEXTAUTH_URL=https://your-domain.example
```

The public origin and OAuth callback must match.

## 21. Browser profiles disappeared

Connection profiles are currently stored in browser IndexedDB.

They may appear missing after:

- using another browser/profile/device,
- clearing site storage,
- changing application origin/domain,
- browser privacy cleanup,
- account identity change.

Current server backups do not automatically contain these browser profiles.

## 22. Activity Console contains sensitive SQL

The application redacts common credential/token fields, but users can still type sensitive values directly into SQL literals.

Avoid embedding secrets in SQL when parameterized/admin alternatives exist. Before sharing logs, manually inspect and sanitize SQL text.

## 23. Performance panel is slow on large servers

Large `information_schema`/system-catalog scans can be expensive.

Mitigations:

- use a restricted database scope,
- avoid repeatedly refreshing expensive panels,
- verify metadata privileges,
- inspect database-side slow queries,
- use current versions containing snapshot caching/deduplication.

Lazy metadata loading remains a roadmap area.

## 24. How to file a useful bug report

Include:

- Coreor version/commit,
- browser and OS,
- deployment type (Vercel, PM2, Docker, etc.),
- database engine and exact version,
- sanitized environment settings relevant to the issue,
- reproduction steps,
- expected behavior,
- actual behavior,
- sanitized error code/message,
- whether the same DB works from the application host using another client.

Never include passwords, OAuth secrets, session cookies or private keys.

For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
