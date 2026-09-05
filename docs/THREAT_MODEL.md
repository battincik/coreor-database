# Threat Model

This document records the primary security threats considered for Coreor Web Database. It is intended for maintainers, reviewers and security researchers.

It complements [SECURITY_MODEL.md](../SECURITY_MODEL.md) and does not replace the vulnerability reporting process in [SECURITY.md](../SECURITY.md).

## System summary

Coreor Web Database lets an authenticated user provide database connection information and then asks the server-side Next.js runtime to connect to the selected database.

This creates an unusual attack surface because the user controls:

- destination hostname,
- destination port within configured policy,
- database credentials,
- database name,
- SQL statements,
- some metadata/workbench parameters.

The target database can also be malicious or compromised.

## Assets to protect

### User assets
- database usernames/passwords,
- database contents returned through queries,
- saved browser profiles,
- account identity/session,
- saved preferences and local application metadata.

### Service assets
- application host network access,
- production environment secrets,
- OAuth credentials,
- NextAuth signing/encryption secret,
- CPU, memory and connection capacity,
- service availability,
- deployment infrastructure.

### Third-party assets
- internal services reachable from the application server,
- cloud metadata endpoints,
- unrelated Internet hosts that must not be abused through the service,
- databases belonging to other users.

## Adversaries

### Unauthenticated Internet attacker
Capabilities:
- send requests to public pages/routes,
- probe authentication endpoints,
- attempt malformed requests,
- exploit framework/runtime vulnerabilities.

Primary controls:
- authentication on database actions,
- patched dependencies,
- security headers,
- request validation,
- safe errors.

### Authenticated malicious user
Capabilities:
- supply arbitrary public hostnames/IPs,
- supply database credentials,
- execute SQL on databases they can authenticate to,
- generate repeated connection attempts,
- manipulate client-side code/requests.

Primary controls:
- SSRF destination validation,
- port restriction,
- server-side policy enforcement,
- per-user limits,
- request/result bounds,
- transaction ownership,
- distributed abuse controls for scaled deployments.

### Malicious database server
Capabilities:
- return unexpected protocol data,
- delay responses,
- present invalid TLS chains,
- return unusually large metadata/result values,
- expose engine-specific edge cases in drivers.

Primary controls:
- maintained database drivers,
- timeouts,
- result limits,
- TLS validation,
- bounded parsing/serialization,
- safe error handling.

### Compromised browser environment
Examples:
- XSS,
- malicious browser extension,
- local malware,
- shared/compromised OS account.

Impact:
- browser vault can be decrypted by code running in the trusted origin/session context,
- credentials can be observed before they are sent to the server.

Primary controls:
- CSP,
- dependency hygiene,
- avoiding unsafe HTML/script injection,
- local device security.

The encrypted vault does not claim to defend against a fully compromised browser execution environment.

### Compromised application server
Impact:
- live request credentials may be observed,
- database responses may be observed,
- environment secrets may be exposed.

Mitigations:
- infrastructure hardening,
- least-privilege deployment access,
- secret management,
- patching,
- avoiding unnecessary persistence/logging.

This threat cannot be eliminated by browser vault encryption because live database connections require server-side access to credentials.

## Threats and mitigations

### T1: SSRF into loopback/private networks

Attack:
An authenticated user attempts to connect the database API to `127.0.0.1`, RFC1918 ranges, link-local ranges, cloud metadata services or internal hostnames.

Impact:
- internal service discovery,
- metadata theft,
- access to otherwise unreachable services.

Mitigations:
- resolve hostnames server-side,
- validate resolved IPs,
- block loopback/private/link-local/reserved ranges,
- require explicit admin configuration for private exceptions,
- restrict destination ports.

Residual risk:
- mistakes in IP classification,
- unusual IPv6 representations,
- future protocol/driver behavior.

### T2: DNS rebinding

Attack:
A hostname initially resolves to a public address but later resolves to an internal address during connection.

Mitigations:
- validate the actual resolved address used for the connection,
- preserve original hostname only for TLS identity/SNI purposes,
- avoid validating one address and letting a different resolver decision choose the connection target.

### T3: Arbitrary TCP proxy abuse

Attack:
The application is used as a generic TCP reachability proxy.

Mitigations:
- database-protocol drivers rather than raw TCP forwarding,
- allowed database-port list,
- target validation,
- authentication and rate limiting.

### T4: Credential leakage through logs

Attack/vector:
- request bodies logged,
- raw errors persisted,
- SQL parameters written to activity history,
- debug output added by contributors.

Mitigations:
- redaction of common secret keys,
- safe error normalization,
- code-review rule against request/credential logging,
- production logging configuration.

### T5: Cross-user transaction access

Attack:
A user guesses or obtains another user's transaction identifier.

Mitigations:
- bind transaction sessions to authenticated identity,
- verify ownership on each action,
- use opaque identifiers,
- expire stale transactions.

### T6: Resource exhaustion through queries

Attack:
- very large result sets,
- expensive queries,
- repeated metadata snapshots,
- oversized request bodies,
- large BLOB payloads.

Mitigations:
- query timeout,
- result-row caps,
- page-size caps,
- request-size caps,
- performance request caching/deduplication,
- rate limits,
- transaction capacity limits.

Known hardening area:
SQL result limiting must correctly recognize CTE/comment-prefixed SELECT forms and engine-specific syntax.

### T7: Account/session forgery

Attack:
- weak or changing NextAuth secret,
- OAuth configuration errors,
- vulnerable authentication dependency.

Mitigations:
- strong stable production secret,
- correct production callback/origin configuration,
- patched NextAuth/framework versions,
- secure cookies/HTTPS through framework configuration.

### T8: Cross-origin authenticated request abuse

Attack:
A malicious site causes an authenticated browser to submit sensitive database actions.

Mitigations:
- trusted-origin checks,
- same-origin API design,
- framework cookie protections,
- restrictive CSP/form policy.

### T9: XSS steals decrypted vault data

Attack:
Injected script runs under the application origin and accesses decrypted profile data or initiates API requests.

Mitigations:
- CSP,
- React escaping by default,
- no unnecessary unsafe HTML injection,
- dependency review,
- security patching,
- minimize lifetime of plaintext values.

Residual risk:
Once code executes in the trusted application origin, browser-side encryption cannot provide a complete boundary.

### T10: Malicious dependency/supply-chain compromise

Attack:
A compromised npm dependency or GitHub Action executes during build/deploy or in the application.

Mitigations:
- lockfile-based installs,
- `npm ci`,
- Dependabot/security advisories,
- minimal workflow permissions,
- review dependency changes,
- pin/high-confidence Actions versions where practical.

### T11: Secret committed to Git

Attack/vector:
A maintainer accidentally commits `.env`, token, private key or credential.

Mitigations:
- `.gitignore`,
- secret scanning/push protection,
- full-history scanners,
- immediate credential rotation,
- history cleanup when necessary.

### T12: Unsafe horizontal transaction scaling

Failure mode:
A transaction starts on process A and the next request reaches process B.

Impact:
- transaction not found,
- incorrect user experience,
- potential inconsistent assumptions about commit/rollback state.

Mitigations today:
- single-process or sticky routing for transaction traffic,
- explicit documentation.

Long-term mitigation:
- dedicated stateful transaction gateway/service or another architecture that guarantees session affinity and ownership.

## Explicitly accepted behavior

The following are not security bugs by themselves:

- a user executing destructive SQL on a database for which they supplied valid write-capable credentials,
- a public target database rejecting authentication,
- a database returning a SQL syntax error,
- a self-signed certificate failing validation when the configured TLS mode requires trust.

They may still require UX improvements or safer defaults.

## Security invariants

Changes should preserve these invariants:

1. Private/reserved destinations are blocked by default in public deployments.
2. Client-side checks are not the only protection for sensitive actions.
3. Credentials are not intentionally persisted in server-side application storage/logs.
4. One user's transaction cannot be operated by another user.
5. Production authentication secrets are strong and stable.
6. Query/request/resource work is bounded.
7. Raw unexpected internal errors are not exposed to users.
8. Browser vault encryption is never represented as protection against XSS/server compromise.

## Review triggers

A new threat-model review is required when adding:

- a new database engine/driver,
- SSH tunnels or arbitrary proxies,
- cloud database discovery,
- synchronized credential storage,
- shared/team connection profiles,
- external plugins/extensions,
- background scheduled SQL execution,
- horizontally distributed transaction processing,
- server-side persistent credential storage.
