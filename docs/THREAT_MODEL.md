# Threat Model

This document covers the local-first Coreor Database desktop architecture.

## Assets

- database credentials,
- SQL/query results,
- local connection profiles,
- transaction state,
- optional Coreor Account tokens,
- local preferences and saved work,
- release/update integrity.

## Adversaries

### Malicious database server

Can delay responses, send unusual protocol values or expose driver edge cases.

Controls: maintained drivers, timeouts, bounded results and defensive serialization.

### Malicious SQL / accidental destructive action

A user can execute SQL against databases they can authenticate to.

Controls: least-privilege accounts, native read-only profiles, previews/confirmations and backups. The product does not claim to make write-capable credentials safe from every destructive query.

### Local malware or compromised OS account

May read application files or process memory.

Current local config storage does not protect against a fully compromised local account. Future platform secret-store integration improves at-rest handling but cannot protect live secrets from an already compromised process/user session.

### Compromised UI dependency

A malicious JS dependency running in the WebView could invoke permitted application actions.

Controls: lockfiles, dependency review, restrictive Tauri capabilities, CSP and keeping high-impact policy in Rust.

### Compromised native dependency

A malicious Rust/database dependency has native-process impact.

Controls: lockfiles, dependency/advisory review, minimal dependencies and release review.

### Compromised Coreor Account API

Must not automatically expose local DB credentials because account identity is outside the DB connection path.

Controls: separate account capability layer, no implicit credential sync and revocable sessions.

### Supply-chain/release compromise

Attackers may target CI actions, signing keys or update artifacts.

Controls: minimal workflow permissions, secret stores, signed/notarized artifacts, checksums and protected release processes.

## Security invariants

1. Local DB access works without account login.
2. Database passwords are not implicitly sent to Coreor Account API.
3. UI-only checks are not the sole protection for read-only profiles.
4. Database work is bounded by time/result/page limits.
5. Tauri permissions remain minimal.
6. Release signing secrets never enter Git.
7. Unexpected driver errors are not treated as safe telemetry by default.

Review this model when adding credential sync, plugins, SSH tunnels, auto-update, arbitrary external binaries or new database engines.
