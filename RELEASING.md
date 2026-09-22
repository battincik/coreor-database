# Releasing Coreor Database

Coreor Database ships native artifacts for Windows, Linux and macOS.

## Version sources

Keep these versions synchronized:

- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `CHANGELOG.md`

## Prepare the version

Use the version preparation command instead of editing release files by hand:

```bash
npm run version:prepare 26.9.1
```

The command requires Coreor calendar versioning in `YY.M.RELEASE` format, greater than the current version, and updates these files atomically after validating that the existing versions are synchronized. The year/month components must match the release date.

- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `src/lib/appVersion.ts`
- `CHANGELOG.md`

It moves the current `Unreleased` changelog entries under the new release version and leaves a fresh `Unreleased` section for subsequent work. An optional release date override is available when needed:

```bash
npm run version:prepare 26.9.1 -- --date=2026-09-22
```

Review the resulting diff before running the release workflow. Do not rerun the command for the same version. Within the same month increment `RELEASE` (`26.9.1` → `26.9.2`); in a new month reset it to `1` (`26.10.1`).

## Validation

From a clean checkout:

```bash
npm ci
npm run check
```

Cross-platform CI must pass on Windows, macOS and Linux before a public release.

## Local installable release

Before publishing anything to GitHub, build and install the exact release configuration locally.

The local builder requires the updater public key so the installed build can verify future updates. GitHub Actions variables/secrets are not automatically available to local processes.

### Windows example

PowerShell with a public-key file:

```powershell
npm run release:local:install -- --public-key-file="D:\Secure\coreor-updater.pub"
```

The command:

1. validates all version sources and the changelog,
2. requires a clean Git working tree unless `--allow-dirty` is explicitly passed,
3. runs the local smoke release gates,
4. builds a production Tauri bundle,
5. copies artifacts and SHA-256 hashes under `local-releases/vYY.M.RELEASE/<platform>/`,
6. launches the installer when using `release:local:install`.

The default Windows local installer is NSIS. Override bundles when necessary:

```powershell
npm run release:local -- --public-key-file="D:\Secure\coreor-updater.pub" --bundles=nsis,msi
```

For a fast local UI/install smoke test only, checks can be skipped explicitly:

```powershell
npm run release:local:install -- --public-key-file="D:\Secure\coreor-updater.pub" --skip-check --allow-dirty
```

Do not use those bypass flags for a release candidate.

### Local signed updater artifacts

To exercise updater artifact generation locally, provide both keys. The private key must remain outside the repository.

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<private-key-password>"
npm run release:local:signed -- --public-key-file="D:\Secure\coreor-updater.pub" --private-key-file="D:\Secure\coreor-updater.key"
```

`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` should be supplied through the environment rather than a command-line argument so it is not written to shell history.

The first installed release does not need local updater artifacts; it only needs the public key embedded. Signed updater artifacts become necessary when testing the subsequent N → N+1 update.

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
2. Run `npm run version:prepare YY.M.RELEASE` and review the generated version/changelog diff.
3. Run `npm ci && npm run check`.
4. Verify cross-platform CI.
5. Build platform bundles.
6. Smoke-test connection, query, table editing, read-only policy and transaction behavior.
7. Create an annotated `vYY.M.RELEASE` tag.
8. Create a GitHub Release and attach platform artifacts.
9. Publish checksums/signatures when release infrastructure is ready.

Do not move an already published tag; release a patch version instead.

## Private pre-release

While the repository remains private, `.github/workflows/bundles.yml` can be triggered manually to validate artifacts without making the source repository public.

## In-app signed updates

See [app lifecycle and signing](docs/APP_LIFECYCLE.tr.md) and the [first desktop release checklist](docs/FIRST_RELEASE_CHECKLIST.tr.md). The manual `Signed release candidate` workflow builds signed updater assets into a draft release. Do not publish until all gates pass.
