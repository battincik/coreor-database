# Troubleshooting

This guide covers Coreor Database desktop development, native builds and database connections.

Remove credentials and sensitive production data before sharing logs.

## Clean validation

```bash
npm ci
npm run architecture:check
npm run typecheck
npm run native:check
npm run ui:build
```

## Platform prerequisites

### Windows

- supported Windows 10/11 environment,
- WebView2 runtime,
- Rust/MSVC build prerequisites,
- Node.js 22 recommended.

### macOS

Install Xcode Command Line Tools:

```bash
xcode-select --install
```

Rust and Node.js are also required for development.

### Ubuntu/Debian development

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf xdg-utils
```

Install Node.js and Rust separately.

## Application does not start

Run:

```bash
npm run tauri:dev
```

If the UI cache is stale:

```bash
node scripts/clean-next-cache.mjs
npm run tauri:dev
```

## Tauri/native compile errors

```bash
npm run native:check
```

Check Rust version:

```bash
rustc --version
cargo --version
```

The repository pins its Rust toolchain in `rust-toolchain.toml`.

## Database connection timeout

Because the connection originates on the user's machine, test DNS/firewall reachability from that same machine.

Examples:

```bash
nc -vz db.example.com 5432
nc -vz db.example.com 3306
```

On Windows use PowerShell/network tooling appropriate for the target port.

Typical causes:

- wrong host/port,
- VPN not connected,
- provider IP allowlist,
- database listening only on another interface,
- local firewall,
- DNS failure,
- expired/locked DB account.

## TLS errors

A certificate-chain error means the native client could not validate the database certificate under the selected TLS policy.

Prefer a trusted CA chain. For private PKI, configure/trust the appropriate CA instead of globally disabling verification.

## Object Explorer appears incomplete

Object discovery is lazy and engine-specific. Refresh the server/catalog and expand the database again.

If a type such as events or procedures remains empty, include the exact database engine/version and account privileges in the bug report.

## Large result performance

Use bounded page sizes and avoid loading unnecessary BLOB/TEXT data when diagnosing performance. Coreor Database should virtualize/bound large UI workloads; report persistent memory growth with a reproducible query/table.

## Read-only operation rejected

This is expected when the profile is marked read-only. Native enforcement intentionally rejects mutations even if UI state is bypassed.

## Config location

Coreor Database exposes platform-specific application directories through its native platform-info command. Connection profiles are stored under the Tauri app config directory.

Do not manually share a config file containing real credentials in bug reports.
