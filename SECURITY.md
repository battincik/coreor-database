# Security Policy

Security reports for Coreor Database should not be filed as public exploit issues.

## Reporting

Use GitHub private vulnerability reporting / Security Advisories when available. Include:

- affected version or commit,
- operating system,
- database engine/version when relevant,
- impact,
- minimal reproduction steps,
- sanitized logs or screenshots.

Never include real database passwords, private keys, access tokens or production data.

If private reporting is unavailable, open a public issue titled **Security contact request** without vulnerability details.

## Security-sensitive areas

Extra review is required for:

- Tauri command permissions and IPC boundaries,
- database credential persistence,
- TLS and certificate handling,
- SQL execution and identifier/value generation,
- native read-only enforcement,
- transaction ownership/lifetime,
- import/export and BLOB handling,
- process/user/privilege administration,
- optional Coreor Account API tokens,
- updater/release signing,
- dependency and GitHub Actions supply chain.

## Local-first trust model

Database traffic originates from the user's local Coreor Database process. There is no Coreor-hosted proxy between the desktop app and the target database.

The optional Coreor Account API is a separate trust boundary. Local DB credentials must not be sent to it unless a future feature explicitly requires a separately reviewed, opt-in design.

## Credential storage

Connection profiles are stored in a local AES-256-GCM encrypted vault. The device key is kept outside that vault by the operating-system credential backend:

- Windows Credential Manager,
- macOS Keychain,
- Linux Secret Service through `secret-tool`.

Passwords are removed from connection profiles returned to the renderer and are resolved by the native Tauri process when a database command needs them.

The local operating-system account remains part of the trust boundary. Do not describe this design as hardware-backed unless the active platform credential backend itself provides and guarantees that property.

## SQL safety

Coreor Database is intentionally capable of executing arbitrary SQL against databases for which the user has credentials. Destructive SQL by an authorized user is not automatically an application vulnerability.

Security controls include native read-only policy, confirmations, result limits, timeouts and least-privilege database accounts.

## Supported versions

Security fixes target the latest actively maintained release unless a release note says otherwise.
