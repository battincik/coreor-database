# Self-Hosting

Coreor Web Database can be self-hosted anywhere a supported Node.js runtime can run and reach the target database servers.

This guide covers the recommended self-hosting model.

## Requirements

- Node.js `>=20.9.0`; current Node.js 22 LTS is recommended for production.
- npm with lockfile-based installs.
- A GitHub OAuth application.
- HTTPS in production.
- Network reachability from the application server to target databases.
- A reverse proxy or platform ingress for production deployments.

The application is not a static export. It requires a running Next.js Node.js server because database connections are opened server-side.

## Clone and install

```bash
git clone https://github.com/battincik/web.database.coreor.net.git
cd web.database.coreor.net
npm ci
```

For local development:

```bash
cp .env.example .env.local
npm run dev
```

For production:

```bash
npm run check
npm run build
npm run start
```

The current `npm run start` command binds Next.js on port `3302`.

## GitHub OAuth

Create a GitHub OAuth application for your deployment.

Configure:

- Homepage URL: your application origin, for example `https://db.example.com`
- Authorization callback URL: the callback URL expected by NextAuth for the GitHub provider, typically `https://db.example.com/api/auth/callback/github`

Then set:

```env
GITHUB_ID=...
GITHUB_SECRET=...
NEXTAUTH_URL=https://db.example.com
```

## Session secret

Generate a strong stable secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Store it as:

```env
NEXTAUTH_SECRET=...
```

Do not regenerate this value on every deploy. Changing it invalidates existing sessions.

## Database network policy

### Public database targets

Public Internet-resolvable database hosts are usable by default if they resolve to allowed public addresses and use an allowed port.

### Private/internal targets

Private, loopback, link-local and reserved targets are blocked by default as an SSRF protection.

A self-hosted deployment that intentionally needs private databases can configure explicit exceptions:

```env
DATABASE_ALLOWED_HOSTS=10.10.0.20,192.168.20.15,db.internal.example.com
```

Only list hosts that the application is expected to access.

### Allowed ports

Example:

```env
DATABASE_ALLOWED_PORTS=3306,4000,5432,26257,1433
```

Add a custom database port only when required.

## Core production environment

A practical baseline:

```env
NODE_ENV=production

GITHUB_ID=...
GITHUB_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://db.example.com
AUTH_TRUSTED_ORIGINS=

DATABASE_ALLOWED_HOSTS=
DATABASE_ALLOWED_PORTS=3306,4000,5432,26257,1433
DATABASE_QUERY_TIMEOUT_MS=30000
DATABASE_MAX_RESULT_ROWS=5000
DATABASE_RATE_LIMIT_REQUESTS=300
DATABASE_MAX_PAGE_SIZE=500
DATABASE_API_MAX_BODY_BYTES=12000000
```

Review `.env.example` because supported configuration can evolve.

## Nginx example

A minimal reverse proxy:

```nginx
server {
    listen 80;
    server_name db.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name db.example.com;

    ssl_certificate /etc/letsencrypt/live/db.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/db.example.com/privkey.pem;

    client_max_body_size 16m;

    location / {
        proxy_pass http://127.0.0.1:3302;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Use your own TLS policy and certificate automation.

`NEXTAUTH_URL` should match the external HTTPS origin rather than the internal `127.0.0.1:3302` address.

## PM2 example

Build first:

```bash
npm ci
npm run check
npm run build
```

Start:

```bash
pm2 start npm --name coreor-web-database -- run start
pm2 save
```

For an existing process after deployment:

```bash
pm2 restart coreor-web-database --update-env
```

### Important transaction warning

Do not run multiple independent PM2 cluster workers for transaction traffic unless you guarantee session affinity. Live transaction sessions are currently process-local.

A single application process is the safest current deployment model for transaction workspace usage.

## systemd example

Example unit:

```ini
[Unit]
Description=Coreor Web Database
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/coreor-web-database
Environment=NODE_ENV=production
EnvironmentFile=/etc/coreor-web-database.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3
User=coreor
Group=coreor

[Install]
WantedBy=multi-user.target
```

Use a dedicated unprivileged service account and protect the environment file:

```bash
sudo chmod 600 /etc/coreor-web-database.env
```

## Docker

The repository may be containerized even if an official image is not published.

A production container should:

- use a supported Node.js base image,
- run `npm ci`,
- build the Next.js application,
- run as a non-root user,
- expose only the application port,
- receive secrets through runtime environment/secrets, not image layers,
- have controlled outbound access to database ports.

For transaction correctness, avoid randomly routing one user's live transaction across multiple independent containers until the transaction architecture is redesigned.

## Vercel and serverless platforms

Core application routes can run in Node.js-compatible serverless environments, but live process-local transactions are not safe across arbitrary instance routing.

If deploying to a serverless platform:

- test all database drivers in the platform runtime,
- verify outbound TCP support and timeout limits,
- treat transaction workspace as incompatible unless requests are guaranteed to reach the same stateful process,
- use centralized rate limiting rather than process-local limits for meaningful abuse protection.

## TLS to databases

Internet-exposed databases should normally require TLS.

If you use an internal/private certificate authority, prefer adding the CA to the Node.js trust configuration instead of disabling verification globally.

Possible approaches depend on your environment and may include:

- OS CA trust store,
- `NODE_EXTRA_CA_CERTS` pointing to an administrator-controlled CA bundle,
- provider-specific certificate configuration.

Never commit private CA keys or client private keys to the repository.

## Firewall recommendations

A self-hosted server should enforce outbound policy at both application and infrastructure levels where possible.

Recommended:

- permit outbound TCP only to expected database destinations/ports,
- block cloud metadata networks,
- keep administration services unreachable from the application account,
- restrict inbound access to HTTPS/reverse proxy and necessary administration ports.

## Backups

Connection profiles currently live in each browser profile, not in a central application database.

Back up:

- deployment configuration,
- production environment secrets using a secrets manager,
- reverse proxy configuration,
- GitHub OAuth settings,
- any future persistent application data.

Browser vault export/import is a roadmap item; do not assume server backups contain user connection profiles.

## Upgrades

Recommended upgrade flow:

```bash
git fetch origin
git checkout main
git pull --ff-only
npm ci
npm run check
npm run build
pm2 restart coreor-web-database --update-env
```

Review [CHANGELOG.md](CHANGELOG.md) and [RELEASING.md](RELEASING.md) before major upgrades.

## Health verification

After deployment verify:

1. login page loads over HTTPS,
2. GitHub login works,
3. a test public database connection succeeds,
4. blocked private destinations remain blocked unless explicitly allowed,
5. SQL query execution works,
6. read-only mode rejects writes,
7. expected TLS behavior is enforced,
8. application logs contain no credentials.

## Related documentation

- [DEPLOYMENT.md](DEPLOYMENT.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [SECURITY_MODEL.md](SECURITY_MODEL.md)
- [DATABASE_SUPPORT.md](DATABASE_SUPPORT.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
