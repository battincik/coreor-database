# Public Release Checklist

The repository is currently private. Complete this checklist before changing visibility.

## Source and history

- [x] Apache-2.0 `LICENSE` exists.
- [x] `NOTICE` exists.
- [x] English and Turkish README files exist.
- [x] Contribution, security, support and code-of-conduct documents exist.
- [ ] Scan full Git history with Gitleaks/TruffleHog.
- [ ] Rotate any credential found in history before cleanup.
- [ ] Confirm no private infrastructure details remain in docs/issues.
- [ ] Review third-party dependency licenses.

## Architecture

- [x] No Next.js database API backend.
- [x] No Node database drivers.
- [x] Native Rust layer owns DB connections.
- [x] Account login is optional for local DB use.
- [x] Architecture guard runs in CI.
- [ ] Replace plaintext local credential persistence with platform secret-store integration or document the accepted risk for the first public release.

## Cross-platform

- [x] CI definition covers Windows, macOS and Linux.
- [x] Tauri bundle target is cross-platform.
- [ ] Validate actual installers/packages on physical/VM systems.
- [ ] Test common Linux distributions.
- [ ] Validate macOS Intel/Apple Silicon release strategy.
- [ ] Configure Windows code signing.
- [ ] Configure macOS signing/notarization.
- [ ] Publish checksums/signatures with release artifacts.

## GitHub repository controls

- [ ] Protect `main`.
- [ ] Require pull requests and passing CI.
- [ ] Disable force-push/deletion for protected branches.
- [ ] Enable Dependabot alerts/security updates.
- [ ] Enable secret scanning/push protection.
- [ ] Enable private vulnerability reporting.
- [ ] Review collaborator/admin access.
- [ ] Add/update repository description and topics after public launch.

Suggested topics:

`database-client`, `database-management`, `tauri`, `rust`, `sql`, `mysql`, `postgresql`, `mssql`, `cross-platform`

## Product validation

- [ ] Guest mode works with account API unavailable.
- [ ] MySQL/MariaDB core flows pass.
- [ ] PostgreSQL core flows pass.
- [ ] MSSQL core flows pass.
- [ ] Read-only profiles reject native mutations.
- [ ] Object Explorer works on large catalogs.
- [ ] 5k-row grid behavior is profiled and acceptable.
- [ ] Import/export has bounded memory behavior.
- [ ] Database credentials do not appear in logs.
- [ ] Optional account capability gates do not block local workflows.

## Community

- [ ] Add sanitized screenshots/GIFs.
- [x] Add issue/PR templates.
- [ ] Define maintainer/review expectations.
- [ ] Decide public release version/tag.
