# Documentation

This directory contains the deeper technical and operational documentation for Coreor Web Database.

## Start here

- [Main README](../README.md) — project overview, features and quick start.
- [Türkçe README](../README.tr.md) — Turkish project documentation.
- [Architecture](../ARCHITECTURE.md) — application layers, trust boundaries and runtime model.
- [Security Model](../SECURITY_MODEL.md) — credential, SSRF, origin, rate-limit and transaction security model.
- [Database Support](../DATABASE_SUPPORT.md) — engine capability matrix and compatibility notes.

## Development

- [Development Guide](DEVELOPMENT.md) — local setup, code structure and engineering rules.
- [Contributing](../CONTRIBUTING.md) — pull request and contribution policy.
- [Code of Conduct](../CODE_OF_CONDUCT.md) — community behavior expectations.

## Deployment and operations

- [Self-Hosting](../SELF_HOSTING.md) — PM2, systemd, Nginx, private database targets and operational guidance.
- [Deployment](../DEPLOYMENT.md) — production configuration, build, rollout and rollback model.
- [Troubleshooting](../TROUBLESHOOTING.md) — common OAuth, TLS, DNS, database and deployment failures.
- [Releasing](../RELEASING.md) — versioning, changelog, tagging and production release procedure.
- [Public Release Checklist](PUBLIC_RELEASE_CHECKLIST.md) — controls to verify around repository/public launch.

## Security

- [Security Policy](../SECURITY.md) — how to report vulnerabilities privately.
- [Security Model](../SECURITY_MODEL.md) — intended security properties and limits.
- [Threat Model](THREAT_MODEL.md) — attacker capabilities, threats, mitigations and security invariants.

## Project planning

- [Roadmap](../ROADMAP.md) — near-, medium- and long-term direction.
- [Changelog](../CHANGELOG.md) — notable changes by release.
- [Support](../SUPPORT.md) — where to ask for help and what information to provide.

## Licensing

- [Apache License 2.0](../LICENSE) — controlling license text.
- [NOTICE](../NOTICE) — project attribution notice.
- [License Guide](LICENSE_GUIDE.md) — plain-language explanation of Apache 2.0 as used by this project.

## Documentation rule

When a change modifies a trust boundary, supported database capability, production environment variable, deployment constraint or public behavior, update the relevant documentation in the same pull request.
