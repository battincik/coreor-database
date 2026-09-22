# Contributing to Coreor Database

Coreor Database is being prepared as an open-source cross-platform desktop project.

## Before you start

- Search existing issues and pull requests.
- Keep changes focused and reviewable.
- Never commit real credentials, private keys, tokens, connection strings with passwords or production data.
- Report security vulnerabilities through the private process in [SECURITY.md](SECURITY.md).

## Development setup

```bash
git clone https://github.com/battincik/coreor-database .git
cd coreor-database
npm ci
npm run architecture:check
npm run typecheck
npm run native:check
npm run tauri:dev
```

There is no required `.env` file and no hosted database backend.

Platform prerequisites are documented in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Required checks

Before opening a pull request:

```bash
npm run check
```

For native changes also verify the affected operating system and database engine.

## Engineering rules

- TypeScript strictness must be preserved.
- Do not introduce `@ts-ignore`, `@ts-nocheck` or broad `any` as a shortcut.
- Prefer existing UI primitives and context-menu infrastructure.
- Preserve keyboard accessibility.
- Avoid browser-native alert/confirm/prompt dialogs.
- Keep expensive metadata queries lazy, bounded and deduplicated.
- Read-only enforcement belongs in Rust/native code as well as UI.
- Engine-specific SQL must use explicit engine branches.
- Destructive operations require clear confirmation.
- Do not log database passwords or authentication tokens.

## Database-engine changes

Test against disposable databases and include the exact engine/version in the PR.

At minimum consider:

1. connection behavior,
2. TLS,
3. object discovery,
4. identifier quoting,
5. table metadata,
6. pagination/result limits,
7. insert/update/delete,
8. transactions,
9. native read-only enforcement,
10. error handling.

## Cross-platform changes

A desktop change should not silently assume Windows paths, PowerShell, WebView2 or Windows-only keyboard conventions.

CI compiles Windows, macOS and Linux. Platform-specific code should use Tauri APIs or a documented platform adapter.

## Pull request checklist

- Explain the problem and intended behavior.
- Mention affected database engines and platforms.
- Include sanitized screenshots for meaningful UI changes.
- Update docs/locale files for user-visible behavior.
- Note performance/security implications.
- Confirm no secrets are included.

## License

The project uses Apache-2.0. Contributions intentionally submitted for inclusion are expected to be compatible with that license unless explicitly agreed otherwise.
