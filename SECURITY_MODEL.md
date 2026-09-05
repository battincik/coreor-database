# Security Model

Coreor Web Database is a browser-based database client with a server-side connection layer. Because the application accepts user-supplied database destinations and credentials, security depends on several independent boundaries working together.

This document explains the intended model. For vulnerability reporting instructions, see [SECURITY.md](SECURITY.md). For attacker-oriented analysis, see [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Trust boundaries

The system has four major trust zones:

1. **User browser** — renders the application, stores encrypted profiles and initiates database actions.
2. **Application server** — authenticates users, validates requests and opens outbound database connections.
3. **Target database server** — controlled by the user or a third party and treated as untrusted from the application's perspective.
4. **External identity provider** — GitHub OAuth is used for authentication and account identity.

None of these zones should be treated as universally trusted.

## Authentication model

GitHub OAuth identifies the user and separates account-scoped browser data.

Important distinction:

- GitHub login is an **authentication** mechanism.
- The hosted application is intentionally available to any valid GitHub-authenticated user.
- It is not a manual account allowlist.

Production deployments must use a stable, unpredictable `NEXTAUTH_SECRET` or `AUTH_SECRET` of sufficient length.

## Browser vault

Database connection profiles are stored in browser IndexedDB and encrypted with WebCrypto AES-GCM.

This provides protection against casual plaintext inspection of persisted browser storage, but it has explicit limits:

- credentials must be decrypted to establish a live connection,
- decrypted credentials exist in browser memory before the request is sent,
- the application server receives the credential in memory during a database request,
- XSS or a compromised browser extension/runtime could access data after decryption,
- this is therefore not zero-knowledge storage and not end-to-end encryption in the messaging sense.

The project must not advertise stronger properties than these.

## Server-side credential handling

The application server receives connection credentials to open a database connection.

Expected behavior:

- do not intentionally persist plaintext credentials,
- do not include passwords in structured logs,
- redact common secret-like fields from activity/history output,
- avoid returning raw driver errors that may contain sensitive connection information,
- keep request lifetimes bounded.

Contributors adding telemetry, debugging or logging must assume request payloads can contain credentials.

## SSRF and outbound-network controls

A public database client can otherwise become a server-side request forgery primitive. The network policy therefore distinguishes public database targets from internal/reserved targets.

### Default behavior

- public Internet-resolvable database hosts are allowed,
- loopback addresses are blocked,
- RFC1918/private ranges are blocked,
- link-local addresses are blocked,
- reserved/special ranges are blocked,
- allowed destination ports are restricted.

### Private exceptions

`DATABASE_ALLOWED_HOSTS` is an explicit administrative override for self-hosted/private deployments that intentionally need access to otherwise blocked destinations.

A public hosted instance should normally keep this list empty.

### Port policy

`DATABASE_ALLOWED_PORTS` restricts outbound connections to expected database ports. The default set is intended for supported engines rather than arbitrary TCP proxying.

Do not replace the list with an unrestricted wildcard on a public deployment without an equivalent egress firewall policy.

## DNS rebinding considerations

Destination validation must be performed against resolved addresses, not only the user-supplied hostname string.

The connection layer resolves the target and validates the resolved address before connection. Where TLS requires hostname identity, the original hostname is retained for SNI/certificate behavior while the validated destination address is used for network policy.

Any change to DNS resolution or connection establishment must preserve this property.

## Same-origin and CSRF-style controls

Database actions are high-impact authenticated operations. The API validates trusted request origins against configured production origins.

Relevant configuration:

- `NEXTAUTH_URL`
- `AUTH_URL` where supported
- `AUTH_TRUSTED_ORIGINS`

Reverse-proxy forwarding headers must not silently become a universal trust source.

## Rate limiting

The current application includes basic per-user process-local rate limiting.

This is useful for a single-process deployment but is not a complete distributed abuse-control system.

For larger hosted deployments add one or more of:

- reverse-proxy rate limiting,
- WAF rules,
- Redis-backed distributed counters,
- per-account concurrent connection limits,
- per-account transaction limits,
- abuse detection for repeated unreachable/forbidden targets.

## Request and result bounds

Server-side limits are used to reduce accidental or malicious resource exhaustion.

Examples include:

- API request body size,
- database query timeout,
- maximum result rows,
- maximum table page size,
- BLOB/large-payload limits,
- transaction capacity and TTL controls.

These limits must be enforced server-side. Client-side UI limits are usability controls, not security controls.

## SQL execution model

The product is intentionally a database client, so authenticated users may execute SQL against databases for which they possess credentials.

This means arbitrary SQL is not itself considered an application vulnerability.

Security instead depends on:

- the user only having credentials for databases they are authorized to access,
- read-only profile policy being enforced where selected,
- result/timeout/resource limits,
- database credentials using least privilege,
- server network controls preventing unrelated internal-service access.

## Read-only profiles

Read-only mode should be treated as a defense-in-depth product policy.

The server should reject mutating actions/queries for read-only profiles even if a modified client attempts to bypass UI restrictions.

Do not rely only on disabled buttons or client-side SQL classification.

## Database account recommendations

Production users should avoid daily use of superuser accounts such as:

- MySQL/MariaDB `root`,
- PostgreSQL superuser roles,
- SQL Server `sa`.

Prefer dedicated application/operations accounts with only the permissions needed for the intended workflow.

## TLS

TLS behavior depends on the target database engine and deployment.

Recommendations:

- prefer encrypted database connections,
- verify server certificates where practical,
- use publicly trusted or organization-trusted CA chains,
- avoid disabling verification merely to bypass a self-signed certificate error on a public service,
- document private CA installation for self-hosted environments instead.

## Security headers

Production responses include defense-in-depth headers such as:

- Content Security Policy,
- HTTP Strict Transport Security,
- frame restrictions,
- MIME sniffing protection,
- referrer policy,
- permissions policy,
- cross-origin isolation-related headers where configured.

CSP is especially important because browser vault encryption does not protect against code executing inside the trusted application origin.

## Error handling

Database driver messages can expose hostnames, usernames, topology information, SQL fragments or implementation detail.

The API therefore normalizes known failures into stable error codes/messages and should use a generic response for unexpected internal failures.

Detailed sensitive server exceptions belong in controlled internal debugging, not user-facing 5xx responses.

## Transactions

Current live transaction state is process-local.

Security and correctness implications:

- transaction ownership must be bound to authenticated identity,
- transaction IDs must not allow cross-user access,
- TTL and capacity limits are required,
- a request routed to a different process cannot safely resume the same transaction.

Do not enable unconstrained multi-instance transaction routing until the architecture in Issue #38 is redesigned or sticky state is guaranteed.

## Dependency security

Framework and authentication dependencies are part of the attack surface.

Public releases should:

- keep Next.js and NextAuth on patched versions,
- use Dependabot or equivalent monitoring,
- review GitHub advisories promptly,
- regenerate lockfiles deterministically,
- run `npm ci` and project checks before release.

## Source repository controls

Recommended repository-level protections:

- protected `main`,
- pull request requirement,
- required CI checks,
- force-push disabled,
- branch deletion disabled,
- Dependabot alerts/security updates,
- secret scanning and push protection,
- private vulnerability reporting.

## Secrets in Git history

`.gitignore` only protects future accidental additions. It does not remove secrets from old commits.

Before a public release, scan the full history with a dedicated scanner such as Gitleaks or TruffleHog. If a real credential is discovered:

1. rotate/revoke the credential first,
2. determine whether history cleanup is necessary,
3. invalidate caches/forks where applicable,
4. document the incident privately until rotation is complete.

## Security changes checklist

A pull request touching authentication, database routing, DNS, credentials, SQL execution, CSP, transactions or logging should answer:

- What trust boundary changes?
- What attacker-controlled input reaches this code?
- Is validation server-side?
- Could secrets appear in logs/errors?
- Does this expand outbound network reachability?
- Does this create unbounded CPU/memory/result work?
- Does it remain safe across multiple processes?
- What tests or manual verification cover the change?

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor requirements.
