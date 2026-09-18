# Releasing Coreor Database

Coreor Database ships native artifacts for Windows, Linux and macOS.

## Version sources

Keep these versions synchronized:

- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `CHANGELOG.md`

## Validation

From a clean checkout:

```bash
npm ci
npm run check
```

Cross-platform CI must pass on Windows, macOS and Linux before a public release.

## Platform bundles

### Windows

```powershell
npm run build:windows
```

Expected formats: NSIS `.exe` and MSI.

### Linux

```bash
npm run build:linux
```

Expected formats: `.deb`, `.rpm` and AppImage.

### macOS

```bash
npm run build:macos
```

Expected formats: application bundle and DMG.

A platform bundle should be built on that operating system.

## Signing

Public distribution should not rely on permanently unsigned binaries.

- Windows: configure Authenticode/code-signing certificate.
- macOS: Developer ID signing and notarization are required for normal direct distribution.
- Linux: package/repository signing depends on the distribution channel.

Signing secrets belong in protected CI/release secret stores, never in the repository.

## Release flow

1. Select a reviewed clean commit.
2. Update versions and changelog.
3. Run `npm ci && npm run check`.
4. Verify cross-platform CI.
5. Build platform bundles.
6. Smoke-test connection, query, table editing, read-only policy and transaction behavior.
7. Create an annotated `vX.Y.Z` tag.
8. Create a GitHub Release and attach platform artifacts.
9. Publish checksums/signatures when release infrastructure is ready.

Do not move an already published tag; release a patch version instead.

## Private pre-release

While the repository remains private, `.github/workflows/bundles.yml` can be triggered manually to validate artifacts without making the source repository public.
