# Contributing to Coreor Web Database

Thanks for considering a contribution.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Keep changes focused. Security, performance, UX and deployment changes should preferably be isolated when they can be reviewed independently.
- Never commit real database credentials, OAuth secrets, access tokens, private keys, production `.env` files or user data.
- Security vulnerabilities must be reported according to [`SECURITY.md`](SECURITY.md), not through a public issue.

## Development setup

```bash
git clone https://github.com/battincik/web.database.coreor.net.git
cd web.database.coreor.net
npm ci
cp .env.example .env.local
npm run dev
```

Use your own GitHub OAuth application and test database credentials. Do not use production credentials in development fixtures, screenshots, logs or pull requests.

## Required checks

Before submitting a pull request, run:

```bash
npm run check
```

You can also run the steps separately:

```bash
npm run i18n:check
npm run lint
npm run typecheck
npm run build
```

## Pull request guidelines

A good pull request should:

- Explain the problem and the intended behavior.
- Describe security or compatibility implications where relevant.
- Mention which database engines were tested.
- Avoid unrelated formatting/refactoring changes.
- Update documentation and locale keys when user-visible behavior changes.
- Include screenshots for significant visual changes, with all sensitive data removed.

## Database-engine changes

Changes in `src/lib/server/` can affect real databases. When modifying SQL generation, metadata queries, user/privilege operations, imports, transactions or destructive actions:

- Test with a disposable database.
- Prefer least-privilege test accounts.
- Consider differences between MySQL, MariaDB, PostgreSQL, CockroachDB, TiDB and Microsoft SQL Server.
- Do not weaken query limits, host validation, TLS behavior or read-only checks simply to make one server configuration work.
- Preserve parameterization and identifier validation where provided by the adapter.

## Security-sensitive networking changes

Changes involving outbound database connections, DNS, private/reserved address detection, ports, origin validation, authentication, cookies, request size, rate limiting or error serialization require extra review.

The hosted service is intentionally available to all GitHub users, so network controls are a primary boundary against SSRF and outbound abuse. Public database hosts may be used, but private/local/reserved targets must remain blocked by default unless explicitly allowed by the operator.

## Internationalization

UI translation files live under `src/locales/`. If you add or remove translation keys, keep the locale schema valid and run:

```bash
npm run i18n:check
```

The repository README is maintained in English and Turkish:

- `README.md` — English/default
- `README.tr.md` — Turkish

When changing documented behavior, update both README files where applicable.

## Commit and branch hygiene

Use descriptive commit messages and avoid committing generated build output. The repository already ignores `.env*` except `.env.example`, `.next`, `node_modules`, `.vercel`, PEM files and common debug logs.

If a secret is accidentally committed, do not merely delete it in a later commit. Rotate/revoke it first and then assess Git-history cleanup.

## License notice

A project license has not yet been selected. Until a license is added, contribution and redistribution terms are not fully defined. This is tracked as a public-release requirement and should be resolved before broad external contribution is encouraged.
