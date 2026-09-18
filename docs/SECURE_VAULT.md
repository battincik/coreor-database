# Secure Vault Architecture

Coreor Database uses two separate security layers: a **device-local vault** for daily desktop use and a future **zero-knowledge account vault** for encrypted cloud sync.

## Local device vault

Connection profiles are no longer persisted in plaintext `config.json`. The full connection profile — including server name, host/IP, username, database name, cached catalog metadata and database password — is serialized only in memory and encrypted with **AES-256-GCM** before it is written to the application data directory.

The encrypted file is `connection-vault.v1.json`. Its plaintext envelope contains only format metadata, a random nonce and ciphertext.

Every installation uses a random 256-bit device key. The key is not written to `config.json` or the vault file:

- Windows: Windows Credential Manager, current user/device.
- macOS: the user's default Keychain.
- Linux: Secret Service through `secret-tool`; no plaintext fallback is allowed.

The process can hold the key and an active connection secret in memory while using them. They are not persisted as plaintext.

### Existing installations

Version 1 configs stored `connections` in `config.json`. Migration is fail-closed:

1. Read the legacy profiles into process memory.
2. Obtain/create the OS-protected device key.
3. Encrypt and successfully write the local vault.
4. Only then rewrite `config.json` without `connections`.

If the secure OS store is unavailable, Coreor does not silently continue with plaintext credentials and does not delete the legacy data.

### Editing a server

Saved passwords never return to React. Leaving the password field empty while editing preserves the encrypted password; entering a new password replaces it. New unsaved connections may send a password transiently over Tauri IPC for a connection test.

For saved profiles, the webview sends `serverId`; Rust resolves the password from the native vault immediately before opening the database connection.

## Future zero-knowledge account vault

Cloud sync uses a separate key hierarchy:

1. Generate a random 256-bit **Account Vault Key (AVK)** on the client.
2. The user chooses a separate **Vault Password**, distinct from account login.
3. Derive a **Key Encryption Key (KEK)** locally with Argon2id, a random salt and versioned cost parameters.
4. Wrap the AVK with the KEK using authenticated encryption.
5. Encrypt the connection-vault payload with the AVK using AES-256-GCM.

The Coreor service receives only KDF/version parameters, salt, nonces, wrapped AVK ciphertext, encrypted payload and non-secret sync metadata. It never receives the Vault Password, KEK, unwrapped AVK or plaintext connection fields.

## New computer flow

After normal Coreor Account authentication:

1. Download the encrypted vault envelope.
2. If this device has no remembered AVK, ask for the Vault Password.
3. Derive the KEK locally and unwrap the AVK locally.
4. Decrypt server profiles locally.
5. If **Remember this device** is enabled, protect the AVK with this device's OS-secured local vault.

The Vault Password itself is never stored. A trusted daily computer therefore does not need to ask for it every day; a new computer does.

## Password changes and recovery

Changing the Vault Password should derive a new KEK and re-wrap the same AVK instead of re-encrypting every server record.

A future recovery key can be a second independent wrapping of the same AVK. There is intentionally no server-side reset path that can reveal data. If the user loses the Vault Password, every remembered device and every recovery key, Coreor cannot decrypt the cloud vault.

## Cloud API invariant

Cloud endpoints treat the vault as an opaque encrypted blob. Plaintext payload schemas must reject connection fields such as `name`, `host`, `port`, `username`, `password`, `databaseName`, catalog/database lists and legacy connector URLs.

The initial wire contract is `src/lib/cloudVaultContract.ts`.

## Operational zero-knowledge requirements

- Never log or send credential/profile fields to analytics.
- Redact query text, connection metadata and decrypted payloads from crash reports.
- Never introduce plaintext cloud migration endpoints.
- Require signed desktop releases and verified updates before public distribution.
- Version cryptographic formats and KDF parameters.
- Keep client-side encryption/decryption code auditable.

The server will still know account identity, ciphertext sizes, timestamps and sync/version metadata; it should not know decrypted database connection contents.
