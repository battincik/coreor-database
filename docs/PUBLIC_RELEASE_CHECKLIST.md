# Public Release Checklist

Use this checklist before changing `battincik/web.database.coreor.net` from private to public.

## P0 — Complete before public visibility

- [x] **Repository license added:** Apache License 2.0 with `LICENSE`, `NOTICE` and a plain-language `docs/LICENSE_GUIDE.md`.
- [ ] **Upgrade vulnerable framework/auth dependencies** tracked in Issue #32 and regenerate `package-lock.json` deterministically.
- [ ] **Resolve GitHub Actions startup failures** tracked in Issue #36 so required checks can actually run.
- [ ] **Run a full Git-history secret scan**, not only a current-tree search. Recommended local tools include `gitleaks detect --source .` or `trufflehog git file://...` on a fresh full clone.
- [ ] Rotate/revoke any credential discovered in history before history cleanup.
- [ ] Verify production `GITHUB_ID`, `GITHUB_SECRET`, `NEXTAUTH_SECRET`, release tokens and database credentials exist only in deployment secret stores, never in repository files.
- [ ] Verify GitHub OAuth callback URLs contain only intended production/development origins.
- [ ] Enable private vulnerability reporting / GitHub Security Advisories for the public repository.

## Repository protection

- [ ] Protect `main` or create an equivalent repository ruleset.
- [ ] Require pull requests before merge for external changes.
- [ ] Require passing CI/status checks before merge.
- [ ] Block force pushes and branch deletion on `main`.
- [ ] Consider requiring conversation resolution before merge.
- [ ] Review who has admin/write access after the repository becomes public.
- [ ] Enable Dependabot alerts and security updates.
- [ ] Enable secret scanning and push protection where available.

## Current-tree exposure review

- [x] `.env*` is ignored except `.env.example`.
- [x] PEM files are ignored.
- [x] `.vercel`, `.next`, build output, dependency folders and common debug logs are ignored.
- [x] Current repository tree contains `.env.example`, not a committed production `.env` file.
- [x] Current-tree code searches performed during public-release preparation did not identify an obvious hard-coded production credential.
- [ ] Perform the independent full-history scan described above before changing visibility.

> A clean current tree does not prove that Git history is clean. Deleted secrets remain recoverable from older commits until history is rewritten, and any exposed secret must be rotated regardless of cleanup.

## Application security

- [x] Any GitHub user may authenticate; authentication is used for identity/account separation rather than a user allowlist.
- [x] Publicly routable DB hosts can be used without a per-customer server allowlist.
- [x] Loopback/private/link-local/reserved targets are blocked by default as SSRF protection.
- [x] Private/local exceptions are explicit through `DATABASE_ALLOWED_HOSTS`.
- [x] Outbound DB ports are constrained through `DATABASE_ALLOWED_PORTS`.
- [x] Same-origin validation and production security headers are present.
- [x] Request-size, read-only and basic per-user rate-limit controls are present.
- [x] Unexpected driver errors are normalized before reaching clients.
- [x] Browser vault data is encrypted with AES-GCM.
- [ ] Add centralized rate limiting / abuse controls before scaling the hosted public service to multiple instances.
- [ ] Decide whether database TLS should be mandatory for the hosted service or remain user-configurable.
- [ ] Resolve SQL result-limit bypasses for CTE/comment-prefixed SELECT statements tracked in Issue #37.

## Architecture / scaling

- [ ] Do not enable arbitrary multi-instance transaction routing until Issue #38 is resolved or sticky/stateful transaction routing is in place.
- [ ] Keep PM2/process topology compatible with transaction ownership assumptions.
- [ ] Re-test performance snapshots against large databases and constrained DB connection limits.
- [ ] Re-test metadata/catalog loading against servers with many schemas/tables.

## Public documentation

- [x] English README available as `README.md`.
- [x] Turkish README available as `README.tr.md`.
- [x] Language selector is present at the top of both README files.
- [x] Security model explains that all GitHub users can sign in.
- [x] README explains that the application server sees credentials in memory during DB connection setup.
- [x] README documents private-network restrictions and the public-host behavior.
- [x] README documents multi-instance transaction limitations.
- [x] `SECURITY.md` added.
- [x] `CONTRIBUTING.md` added.
- [x] `CODE_OF_CONDUCT.md` added.
- [x] `SUPPORT.md` added.
- [x] `CHANGELOG.md` added.
- [x] `ROADMAP.md` added.
- [x] `ARCHITECTURE.md` added.
- [x] `SECURITY_MODEL.md` added.
- [x] `DATABASE_SUPPORT.md` added.
- [x] `SELF_HOSTING.md` added.
- [x] `DEPLOYMENT.md` added.
- [x] `TROUBLESHOOTING.md` added.
- [x] `RELEASING.md` added.
- [x] `docs/DEVELOPMENT.md` added.
- [x] `docs/THREAT_MODEL.md` added.
- [x] `docs/LICENSE_GUIDE.md` and `docs/README.md` added.
- [ ] Add screenshots/GIFs with sanitized demo data if a visual project showcase is desired.
- [ ] Set the GitHub repository description, website and topics after changing visibility.

Suggested topics:

`database-client`, `database-management`, `mysql`, `mariadb`, `postgresql`, `mssql`, `tidb`, `cockroachdb`, `nextjs`, `typescript`, `sql`, `self-hosted`

## Production verification

Run on the exact commit intended for release:

```bash
npm ci
npm run check
```

Then verify:

- [ ] Login/logout works with the production GitHub OAuth application.
- [ ] A normal GitHub account can create its own server profile.
- [ ] Public MySQL/MariaDB connection works.
- [ ] Public PostgreSQL connection works.
- [ ] Public MSSQL connection works if advertised for launch.
- [ ] Private/loopback targets are rejected without explicit operator allowlisting.
- [ ] Read-only profiles reject mutations server-side.
- [ ] Invalid TLS certificates produce safe/actionable errors.
- [ ] Oversized request bodies are rejected.
- [ ] Rate limiting returns the expected 429 behavior.
- [ ] Credentials do not appear in application logs, browser console output, error responses or release-history payloads.
- [ ] Production health check succeeds after a clean deploy.

## After going public

- [ ] Watch Dependabot/security alerts.
- [ ] Triage external issues and PRs for secret leakage before quoting/reposting their content.
- [ ] Treat any report involving SSRF, auth/session bypass, credential exposure or remote code execution as high priority.
- [ ] Periodically repeat dependency audits and GitHub security-setting reviews.
