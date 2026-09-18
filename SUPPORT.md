# Support

## Bug reports

Open a GitHub issue for reproducible non-security bugs. Include:

- Coreor Database version or commit,
- operating system and architecture,
- database engine and exact version,
- steps to reproduce,
- expected and actual behavior,
- sanitized error text,
- screenshots when useful.

Never include passwords, private keys, access tokens or sensitive production data.

## Feature requests

Describe the workflow problem first. Useful context includes database engine, platform, expected UX and examples from other database clients.

## Security

Do not post vulnerability details publicly. Follow [SECURITY.md](SECURITY.md).

## Common diagnostics

Before filing an issue:

```bash
npm ci
npm run typecheck
npm run native:check
```

For application/runtime issues also check [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Platform notes

- Windows uses WebView2 through Tauri.
- macOS uses the system WebKit runtime.
- Linux uses WebKitGTK and requires the distribution packages documented in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Database-provider issues

Cloud/provider firewalls, IP allowlists, CA certificates, disabled network access and database account permissions remain the responsibility of the database/provider configuration.

Because Coreor Database connects from the user's device, provider allowlists must permit the user's actual network path.

## Project status

The repository is currently private pre-release and is being prepared for a future public open-source release. Community support processes may change once the repository becomes public.
