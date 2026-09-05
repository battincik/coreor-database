# Security Policy

Thank you for helping keep Coreor Web Database and its users safe.

> Türkçe: Güvenlik açıklarını public issue olarak paylaşmayın. Aşağıdaki private reporting yöntemini kullanın ve mümkünse yeniden üretim adımlarını, etkilenen sürümü ve olası etkiyi ekleyin.

## Reporting a vulnerability

Please **do not open a public GitHub issue** containing exploit details, credentials, database connection information, private hostnames, tokens or proof-of-concept payloads for an unpatched vulnerability.

Preferred reporting method:

1. Open the repository's **Security** tab on GitHub.
2. Use **Report a vulnerability** / private vulnerability reporting when available.
3. Include the affected version or commit, impact, reproduction steps and a minimal proof of concept when safe to do so.
4. Remove real database credentials, personal data and production secrets from logs or screenshots.

If private vulnerability reporting is not available, open a public issue titled `Security contact request` **without vulnerability details**. Do not include the exploit, affected private infrastructure, credentials or secret material in that issue.

## What to include

Useful reports normally contain:

- A clear description of the vulnerability and its impact
- Affected route, component, database engine or deployment mode
- Affected version/commit
- Reproduction steps
- Expected vs. actual behavior
- Relevant sanitized logs
- Whether exploitation requires authentication
- Whether the issue depends on a specific database engine or server configuration
- Suggested remediation, if you have one

## Security-sensitive areas

Extra care is required around:

- `/api/database` and authentication routes
- SSRF and outbound host/port validation
- DNS resolution and private/reserved network detection
- Database credentials and encrypted browser vault handling
- SQL execution and read-only policy enforcement
- Import/export and BLOB handling
- User/role/privilege management
- Transaction ownership and process-local transaction state
- Error messages and driver metadata
- Cross-origin behavior, CSP and other browser security headers
- GitHub OAuth / NextAuth session handling
- Dependency vulnerabilities in Next.js, NextAuth and database drivers

## Hosted-service security model

The public hosted application allows any GitHub user to authenticate. GitHub identity is used for account separation, not as a user allowlist.

Publicly routable database hosts may be used, while loopback, private, link-local and reserved network targets are blocked by default. Self-hosted operators can explicitly allow selected private/local targets using `DATABASE_ALLOWED_HOSTS` when they understand the network implications.

Database credentials are encrypted at rest in browser IndexedDB. The application server necessarily receives decrypted credentials in memory while opening a database connection; the system is therefore not end-to-end or zero-knowledge encrypted.

## Disclosure

Please allow maintainers reasonable time to investigate and release a fix before public disclosure. Once a fix is available, coordinated disclosure through a GitHub Security Advisory is preferred for vulnerabilities that materially affect users.

## Secrets accidentally committed to the repository

If you discover a real credential or token in the repository or Git history:

1. Treat it as compromised immediately.
2. Rotate/revoke the credential first.
3. Remove the secret from the current tree.
4. Decide whether Git history must be rewritten.
5. Review logs and provider activity for misuse.

Deleting a secret in a later commit is **not** sufficient because the original value may remain in Git history.

## Supported versions

Security fixes are normally targeted at the latest actively maintained version on `main`. Older snapshots or forks may not receive backported patches unless explicitly stated.

## Security is shared responsibility

Self-hosted operators are responsible for TLS termination, network routing, firewall/WAF policy, database account permissions, environment secrets, dependency updates and deployment topology. Use least-privilege database accounts and avoid exposing databases directly to the public Internet solely for use with this application.
