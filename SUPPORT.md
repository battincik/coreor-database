# Support

This document explains where to ask for help, how to report bugs and which requests belong in private security reporting.

## Where to ask

### Bug reports

Use GitHub Issues for reproducible application problems that are not security-sensitive.

A useful bug report includes:

- Coreor version or commit SHA,
- deployment type,
- browser/OS,
- database engine and exact version,
- steps to reproduce,
- expected result,
- actual result,
- sanitized error code/message,
- screenshots when useful and safe.

Do not include passwords, tokens, cookies, connection strings containing secrets, private keys or other credentials.

### Feature requests

Use GitHub Issues and describe the problem first.

Helpful information:

- what workflow is missing,
- which database engines are affected,
- whether the request is needed for hosted or self-hosted use,
- security/network requirements,
- expected UI behavior,
- examples from other tools if relevant.

### Questions and setup help

Before opening an issue, review:

- [README.md](README.md)
- [SELF_HOSTING.md](SELF_HOSTING.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
- [DATABASE_SUPPORT.md](DATABASE_SUPPORT.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

If the documentation does not answer the question, open a GitHub issue with sanitized configuration details.

## Security vulnerabilities

Do **not** open a public issue for:

- authentication bypass,
- credential exposure,
- SSRF/private-network bypass,
- cross-user transaction access,
- remote code execution,
- dependency exploit with project-specific impact,
- secret leakage,
- serious authorization or origin-validation bypass.

Follow [SECURITY.md](SECURITY.md) and use private vulnerability reporting / GitHub Security Advisories when enabled.

## Database provider problems

Coreor can only connect when the application server can reach the database and the database accepts the supplied credentials.

Provider-specific problems may require help from the database/cloud provider, for example:

- firewall/source IP allowlist,
- provider CA certificates,
- disabled public networking,
- account lock/expiry,
- managed database maintenance/outage,
- provider-specific proxy/gateway rules.

## Self-signed certificates

A self-signed or private-CA database is not automatically an application bug.

For self-hosted deployments, install the appropriate CA trust on the Coreor application host. For public hosted deployments, prefer a publicly/organizationally trusted certificate chain rather than disabling TLS verification.

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Supported scope

The project aims to support the database engines documented in [DATABASE_SUPPORT.md](DATABASE_SUPPORT.md).

Not every administration panel is guaranteed to work on every engine/version/provider because system catalogs and privileges differ.

When an advanced feature is unsupported, provide the exact engine/version so support can be implemented safely rather than through a broad compatibility assumption.

## Support expectations

This is an open-source project. Unless a separate commercial support agreement exists:

- no response-time SLA is guaranteed,
- issue priority depends on severity, reproducibility and maintainer capacity,
- security and data-integrity issues receive higher priority,
- maintainers may close requests that cannot be reproduced or are outside project scope.

## Good support hygiene

Before posting:

1. Search existing issues.
2. Try the latest patched release when practical.
3. Reproduce against a disposable database if the issue involves mutations.
4. Remove all secrets.
5. Include only configuration relevant to the problem.
6. Do not post production database dumps unless they are fully sanitized and intentionally shareable.

## Community contributions

If you can fix the issue, pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) first.
