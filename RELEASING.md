# Releasing

This document defines the release process for Coreor Web Database.

The goal is to keep source version, changelog, Git tag, GitHub Release and production deployment aligned.

## Release principles

- Release from a clean, reviewed commit.
- Never bypass a known security blocker merely to publish a version.
- Use deterministic dependency installation.
- Keep the lockfile synchronized with `package.json`.
- Treat authentication, database routing and dependency upgrades as security-sensitive.
- Prefer small, understandable releases over large mixed changes.

## Versioning

The project currently uses semantic-style versions in `package.json`.

General guidance:

- **PATCH**: bug fixes, security patches and small compatible improvements.
- **MINOR**: backward-compatible features or substantial UX improvements.
- **MAJOR**: intentionally incompatible behavior, storage/configuration changes or major architecture changes.

Until formal release tooling is introduced, the maintainer is responsible for synchronizing version references manually.

## 1. Select the release commit

Start from `main` after required changes are merged.

```bash
git checkout main
git fetch origin
git pull --ff-only origin main
git status
```

The working tree should be clean.

## 2. Review open blockers

Before release review:

- security issues/advisories,
- dependency alerts,
- public release blockers,
- known migration/configuration changes,
- deployment compatibility,
- transaction/multi-instance implications.

A known critical/high-impact security issue should normally block release unless the release itself fixes it.

## 3. Update dependencies intentionally

For ordinary releases:

```bash
npm ci
```

For dependency changes:

1. change `package.json` intentionally,
2. regenerate/update `package-lock.json`,
3. review the full dependency diff,
4. run `npm audit` as an additional signal,
5. run project checks.

Do not commit a package manifest and stale lockfile combination.

## 4. Update the version

Update `package.json` to the intended version.

If using npm version commands, make sure they do not create an unwanted tag before review.

Example manual target:

```json
{
  "version": "3.2.0"
}
```

## 5. Update CHANGELOG

Move relevant items from `Unreleased` into a dated version section:

```md
## [3.2.0] - 2026-09-05

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Security
- ...
```

Describe user-visible impact rather than repeating commit messages blindly.

## 6. Run validation

From a clean dependency install:

```bash
npm ci
npm run check
```

Also perform targeted tests for changed areas.

Examples:

### Authentication changes
- GitHub sign-in,
- sign-out,
- expired/invalid cookie handling,
- production secret requirements.

### Database changes
- connection test,
- normal SELECT,
- mutation if supported,
- read-only rejection,
- timeout behavior,
- TLS behavior,
- target/port policy.

### Transaction changes
- begin,
- query,
- commit,
- rollback,
- ownership checks,
- TTL/capacity behavior.

## 7. Security review

At minimum verify:

- no secret was added to the diff,
- no private/reserved network bypass was introduced,
- user-controlled errors are sanitized,
- new logs do not contain credentials,
- dependencies do not leave known critical blockers,
- CSP/security headers still work,
- read-only policy remains server-side.

For a public release, repository secret scanning/history checks should already be active.

## 8. Commit release metadata

Commit version and changelog updates through a pull request.

Example commit:

```text
release: prepare v3.2.0
```

The release PR should contain only release metadata and any specifically intended release fixes.

## 9. Merge and verify CI

Merge only after required checks pass.

Record the exact resulting commit SHA.

## 10. Tag the release

Create an annotated tag from the exact release commit:

```bash
git tag -a v3.2.0 -m "Coreor Web Database v3.2.0"
git push origin v3.2.0
```

Never move an already published release tag to another commit. Publish a corrective patch version instead.

## 11. Create GitHub Release

Recommended release notes structure:

```md
## Highlights
- ...

## Added
- ...

## Fixed
- ...

## Security
- ...

## Upgrade notes
- ...

## Known limitations
- ...
```

Link relevant issues/PRs where useful.

Avoid including private vulnerability details before coordinated disclosure is complete.

## 12. Deploy production

Follow [DEPLOYMENT.md](DEPLOYMENT.md).

Recommended sequence:

1. fetch exact release commit/tag,
2. `npm ci`,
3. `npm run check`,
4. production build,
5. restart/reload,
6. health check,
7. OAuth smoke test,
8. disposable database connection/query test.

## 13. Post-deployment verification

Verify:

- site loads over HTTPS,
- authentication works,
- release/version display is correct if surfaced,
- public DB connection succeeds,
- private target remains blocked by default,
- read-only mode rejects writes,
- common DB errors are actionable/sanitized,
- no new credential-bearing logs appear.

## 14. Rollback criteria

Rollback or disable the affected feature when production shows:

- authentication outage,
- credential exposure,
- SSRF/network policy bypass,
- widespread database connection regression,
- data-corrupting mutation behavior,
- critical build/runtime failure.

Rollback to a known-good source/dependency combination. If a secret was exposed, rollback alone is not enough; rotate the secret.

## Security releases

For a privately reported vulnerability:

1. validate privately,
2. create a private fix path/security advisory when available,
3. prepare patched release,
4. rotate any exposed credentials if applicable,
5. publish fix and advisory in coordinated order,
6. credit the reporter if they want attribution.

See [SECURITY.md](SECURITY.md).

## Release checklist

- [ ] `main` is up to date and clean.
- [ ] Open P0/security blockers reviewed.
- [ ] `package.json` version updated.
- [ ] `package-lock.json` synchronized.
- [ ] `CHANGELOG.md` updated.
- [ ] `npm ci` succeeds.
- [ ] `npm run check` succeeds.
- [ ] Targeted DB/auth tests pass.
- [ ] Security review complete.
- [ ] Release PR merged with green checks.
- [ ] Tag points to exact release commit.
- [ ] GitHub Release published.
- [ ] Production deployment verified.
- [ ] Known limitations documented.
