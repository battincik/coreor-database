# Coreor Account API Integration

Coreor Account is optional. It must never become a dependency for basic local database access.

## Boundary

```text
Coreor Database
├── Local native database client
└── Optional Coreor Account API
```

The account API may provide:

- user identity,
- device/session management,
- capabilities/entitlements,
- team workspaces,
- shared snippets,
- explicit opt-in synchronization.

## Guest-first rule

When no session exists or the account API is unavailable:

- saved local DB profiles remain usable,
- SQL execution remains usable,
- Object Explorer remains usable,
- local preferences/history remain usable.

## Capabilities

The desktop app should consume capabilities rather than hard-code plan names.

Example response:

```json
{
  "capabilities": [
    "cloud-sync",
    "team-workspaces",
    "shared-snippets"
  ]
}
```

## Credential rule

Database passwords, TLS private keys and SSH private keys are local secrets. They must not be sent to Coreor Account by default.

Any future credential-sync feature requires a separate threat model, explicit opt-in and strong encryption design.

## Session storage

Account tokens should use a platform-appropriate secure storage abstraction when implemented. Do not persist refresh tokens in ordinary UI localStorage.

## Suggested API surface

```text
POST /v1/auth/login
POST /v1/auth/refresh
POST /v1/auth/logout
GET  /v1/me
GET  /v1/me/capabilities
GET  /v1/me/sessions
DELETE /v1/me/sessions/:id
GET  /v1/organizations
GET  /v1/organizations/:id/members
GET/POST /v1/snippets
GET/POST /v1/sync/...
```

The exact protocol can change without altering the local database architecture.
