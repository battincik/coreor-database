# Platform Support

Coreor Database targets desktop operating systems supported by Tauri 2.

## Windows

Primary formats:

- NSIS installer
- MSI package

Runtime notes:

- WebView2 is used for the embedded UI.
- Native database access runs in the Rust process.

## macOS

Primary formats:

- .app bundle
- DMG

Public distribution should use Developer ID signing and notarization.

Both Apple Silicon and Intel support should be validated before a public release policy is declared.

## Linux

Primary formats:

- DEB
- RPM
- AppImage

Development/build environments require WebKitGTK and related Tauri system packages.

Linux desktop behavior can vary by distribution, WebKitGTK version, compositor and system secret-service availability.

## Compatibility policy

A platform is considered release-supported only after CI compile plus installer/package smoke testing.

Platform-specific code should use Tauri/platform adapters rather than hard-coded OS paths or browser assumptions.
