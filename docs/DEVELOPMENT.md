# Development Guide

This guide is for contributors working on Coreor Web Database locally.

Read [CONTRIBUTING.md](../CONTRIBUTING.md), [ARCHITECTURE.md](../ARCHITECTURE.md) and [SECURITY_MODEL.md](../SECURITY_MODEL.md) before making changes to authentication, database routing, transaction state or credential handling.

## Requirements

- Node.js `>=20.9.0`
- npm
- Git
- A GitHub OAuth application for authentication testing
- Disposable database instances for engine-specific work

Node.js 22 LTS is recommended for local development when compatible with the current dependency set.

## Install

```bash
git clone https://github.com/battincik/web.database.coreor.net.git
cd web.database.coreor.net
npm ci
```

Create local configuration:

```bash
cp .env.example .env.local
```

Start development server:

```bash
npm run dev
```

## Useful scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm run i18n:check
npm run build
npm run check
```

`npm run check` is the preferred pre-PR validation command.

## Environment setup

Minimum development variables:

```env
GITHUB_ID=...
GITHUB_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```

A local development secret can also be set explicitly:

```env
NEXTAUTH_SECRET=development-only-secret-value-that-is-long-enough
```

Never reuse production secrets in local development.

## Repository structure

Important areas:

```text
src/app/                     Next.js routes/layouts/pages
src/app/api/                 server route handlers
src/components/              application/workbench UI
src/context/                 app/session/language/database context
src/lib/                     client/shared application services
src/lib/server/              database/server-only services
src/locales/                 translation files
scripts/                     validation/maintenance scripts
docs/                        architecture/security/operations docs
types/                       shared TypeScript types
```

## Working on database engines

Use a disposable database rather than a production system.

For each affected engine verify:

1. connection test,
2. database/schema discovery,
3. table/column metadata,
4. basic SELECT,
5. pagination,
6. parameter binding,
7. insert/update/delete if relevant,
8. identifier quoting,
9. error normalization,
10. TLS behavior,
11. read-only behavior,
12. timeout/result limits.

Do not assume wire compatibility means feature compatibility. TiDB and CockroachDB need explicit compatibility testing for advanced features.

## Adding database actions

When adding a new API/workbench action:

- define/extend input types,
- validate attacker-controlled inputs,
- enforce authentication server-side,
- enforce read-only policy where applicable,
- verify destination/network policy is not bypassed,
- bound rows/payload/time,
- normalize expected errors,
- avoid sending raw stack/driver errors to the browser,
- update engine capability documentation.

## SQL safety

The product intentionally executes user-provided SQL, so do not try to "sanitize" SQL by rewriting arbitrary statements unless the behavior is narrowly defined and tested.

For internal metadata queries:

- use parameter binding where supported,
- quote identifiers with engine-aware helpers,
- never concatenate user credentials into SQL,
- ensure metadata queries are bounded on large servers.

## Read-only behavior

Read-only is a server-side policy, not a UI-only feature.

When adding a mutating operation:

- classify it correctly,
- enforce rejection for read-only profiles in the API/service layer,
- add UI affordances only as secondary protection.

## Network/SSRF development

Changes to hostname resolution, IP validation, allowed hosts/ports or driver connection options require a security review.

Test at least:

- public IPv4,
- public IPv6 where supported,
- `127.0.0.1`,
- `::1`,
- RFC1918 ranges,
- link-local ranges,
- reserved/documentation ranges,
- DNS name resolving to blocked IP,
- explicitly allowed private host in a self-hosted-style configuration.

Do not weaken defaults to make local testing easier. Configure an explicit development exception instead.

## Transaction development

Current transaction sessions are process-local.

When modifying transaction code test:

- begin,
- multiple queries,
- commit,
- rollback,
- expiration,
- capacity limits,
- user ownership,
- invalid transaction ID,
- process restart behavior.

Do not introduce assumptions that live transaction IDs can be resumed on another process.

## Browser vault development

When changing `secureVault` or profile persistence:

- preserve account scoping,
- never intentionally persist plaintext passwords,
- review migration behavior for existing IndexedDB data,
- clone cached values before exposing mutable objects when necessary,
- consider XSS implications,
- update architecture/security docs if the trust model changes.

## Error handling

Prefer stable error codes and actionable messages.

Good errors answer:

- what failed,
- whether retrying may help,
- whether the user must re-authenticate,
- whether the target/network policy blocked the request,
- what safe corrective action is available.

Do not return arbitrary database driver objects directly to the browser.

## Localization

New visible UI text should use the project localization mechanism.

After locale changes:

```bash
npm run i18n:check
```

When adding a key, keep locale structure consistent with the validation script.

## Frontend development

General rules:

- preserve keyboard accessibility,
- avoid unnecessary modal nesting,
- keep destructive actions explicit,
- show loading/error states for database operations,
- avoid leaking raw credentials into component state longer than necessary,
- use existing UI primitives before adding new variants.

## Performance review

Database administration UIs can accidentally produce expensive metadata queries.

Before merging a new panel or refresh loop ask:

- how many physical DB connections are opened,
- how often the request repeats,
- whether requests can overlap,
- whether information schema/system catalog scans are bounded,
- whether caching/deduplication is appropriate,
- whether cancellation/timeout is respected.

## Dependency changes

When changing dependencies:

```bash
npm install <package>@<version>
npm run check
npm audit
```

Review both `package.json` and `package-lock.json`.

For security-related upgrades, verify patched versions against the upstream advisory rather than relying only on a semver range.

## Pull request checklist

Before opening a PR:

- [ ] scope is focused,
- [ ] `npm run check` passes,
- [ ] no credentials/secrets in diff,
- [ ] engine-specific behavior tested,
- [ ] destructive behavior tested on disposable data,
- [ ] security boundary changes documented,
- [ ] README/docs updated when behavior changes,
- [ ] known limitations stated clearly.

## Debugging

Use [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) for common runtime problems.

When adding temporary debug output, never print:

- connection passwords,
- OAuth secrets,
- session cookies,
- Authorization headers,
- full unredacted request payloads.

Remove temporary logging before merge.
