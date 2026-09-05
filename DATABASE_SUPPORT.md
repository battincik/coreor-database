# Database Support

Coreor Web Database supports multiple relational database engines through shared workbench concepts and engine-specific adapters.

Support is capability-based: not every feature is identical across all engines.

## Supported engines

| Engine | Connection | SQL workspace | Table browse/edit | Schema metadata | Performance/admin tools | Transaction workspace |
| --- | --- | --- | --- | --- | --- | --- |
| MySQL | Supported | Supported | Supported | Supported | Strongest coverage | Supported |
| MariaDB | Supported | Supported | Supported | Supported | Strong coverage | Supported |
| PostgreSQL | Supported | Supported | Supported | Supported | Partial/engine-specific | Limited/adapter-dependent |
| CockroachDB | Supported through PostgreSQL-compatible adapter | Supported | Supported where PostgreSQL semantics apply | Supported with compatibility caveats | Limited | Limited |
| TiDB | Supported through MySQL-compatible adapter | Supported | Supported | Supported with compatibility caveats | Partial | Adapter-dependent |
| Microsoft SQL Server | Supported | Supported | Supported | Supported | Partial/engine-specific | Limited/adapter-dependent |

The matrix above describes the intended product surface, not a guarantee that every administrative feature works across every engine/version.

## Compatibility principles

### MySQL and MariaDB

These engines currently have the broadest workbench coverage.

Typical supported workflows include:

- server/database discovery,
- schema/table metadata,
- table data browsing,
- insert/update/delete operations,
- SQL execution,
- process/lock-related views where privileges allow,
- user/account administration where privileges allow,
- performance metadata,
- transaction workspace,
- import/export helpers.

Differences between MySQL and MariaDB versions must still be respected, especially around information schema, account metadata and performance tables.

### PostgreSQL

The PostgreSQL adapter supports core database browsing and SQL workflows.

Engine-specific differences include:

- catalog layout differs from MySQL,
- roles/users and privileges use PostgreSQL semantics,
- sequence/identity behavior differs,
- transaction/locking metadata differs,
- administrative queries require PostgreSQL-specific implementations.

Do not reuse MySQL metadata SQL without an explicit PostgreSQL branch.

### CockroachDB

CockroachDB is PostgreSQL-wire compatible but not behavior-identical to PostgreSQL.

Expect differences around:

- system catalogs,
- transaction retry behavior,
- distributed execution plans,
- unsupported PostgreSQL extensions/features,
- privilege and cluster-management surfaces.

Compatibility should be tested against actual CockroachDB versions rather than inferred solely from PostgreSQL support.

### TiDB

TiDB is MySQL-protocol compatible but not identical to MySQL.

Potential differences include:

- performance schema coverage,
- information schema details,
- transaction behavior,
- storage/cluster metadata,
- unsupported MySQL administration statements.

Core SQL/table workflows should use MySQL-compatible paths while advanced administration features should feature-detect where possible.

### Microsoft SQL Server

MSSQL uses the `mssql` driver and engine-specific metadata/SQL semantics.

Differences include:

- database/schema naming,
- identity columns,
- TOP/OFFSET/FETCH syntax,
- system catalogs,
- users/logins/roles,
- transaction and locking views,
- connection encryption defaults.

SQL Server support should be verified on current supported SQL Server editions and Azure SQL-compatible targets where relevant.

## Connection requirements

A database must be reachable from the Next.js application server, not merely from the user's browser.

For a public hosted instance:

- the target should resolve to a public IP,
- private/reserved addresses are blocked by default,
- the target port must be in `DATABASE_ALLOWED_PORTS`,
- TLS requirements must be compatible with the configured connection mode.

For self-hosting, administrators may explicitly allow private targets through `DATABASE_ALLOWED_HOSTS`.

## Default ports

The default production example allows common ports:

```env
DATABASE_ALLOWED_PORTS=3306,4000,5432,26257,1433
```

Typical mapping:

- MySQL / MariaDB: `3306`
- TiDB: commonly `4000`
- PostgreSQL: `5432`
- CockroachDB: commonly `26257`
- Microsoft SQL Server: `1433`

Custom ports can be allowed explicitly by the deployment administrator.

## TLS and certificates

Database TLS behavior varies by engine and hosting provider.

Recommended approach:

- use TLS for Internet-exposed database connections,
- verify certificates using a trusted CA chain,
- prefer provider-issued certificates,
- for self-hosted private PKI, install/trust the CA in the application runtime rather than disabling verification globally.

A `self-signed certificate in certificate chain` error normally indicates the Node.js runtime cannot build a trusted chain for the database certificate.

## Privilege requirements

Core browsing requires only the privileges needed to read the requested metadata/data.

Administrative panels may require additional privileges.

Avoid granting broad privileges merely to make every panel work. Use least privilege and accept that some panels can be unavailable for restricted accounts.

Examples:

- table browsing: SELECT on intended objects,
- editing: INSERT/UPDATE/DELETE as required,
- schema changes: ALTER/CREATE/DROP as required,
- process views: engine-specific process/statistics privileges,
- user management: engine-specific account administration privileges.

## Read-only profiles

Use read-only profiles for production inspection when mutations are not needed.

Read-only mode is enforced at the application policy layer, but database-level read-only/least-privilege accounts provide a stronger independent boundary and are recommended.

## Version support

The project does not currently publish a strict exhaustive version matrix.

When reporting compatibility issues include:

- engine,
- exact engine version,
- hosting provider/distribution when relevant,
- TLS mode,
- failing action,
- sanitized error code/message,
- minimal reproduction steps.

## Adding a new engine

A new engine should not be considered supported merely because a driver can open a connection.

At minimum evaluate:

1. connection configuration,
2. TLS behavior,
3. server/database discovery,
4. identifier quoting,
5. pagination syntax,
6. schema/table/column metadata,
7. data types and serialization,
8. parameter binding,
9. mutation result semantics,
10. transaction behavior,
11. error normalization,
12. reserved/private destination enforcement,
13. tests/manual verification.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
