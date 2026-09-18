# Database Support

Coreor Database connects directly from the local native process to supported relational database engines.

## Capability matrix

| Engine | Connection | SQL | Table data | Object Explorer | Schema tools | Transactions | Admin/performance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MySQL | Yes | Yes | Yes | Yes | Yes | Yes | Strong |
| MariaDB | Yes | Yes | Yes | Yes | Yes | Yes | Strong |
| TiDB | Yes | Yes | Yes | Yes | Compatible subset | Adapter-dependent | Partial |
| PostgreSQL | Yes | Yes | Yes | Yes | Yes | Supported subset | Engine-specific |
| CockroachDB | Yes | Yes | Yes | Yes | PostgreSQL-compatible subset | Engine-specific | Limited |
| Microsoft SQL Server | Yes | Yes | Yes | Yes | Yes | Supported subset | Engine-specific |

Support is capability-based. Protocol compatibility does not imply identical system catalogs or administration features.

## Connection model

The database must be reachable from the computer running Coreor Database.

There is no application-server allowlist or server-side egress proxy. Normal operating-system networking, VPN, DNS, firewall and provider rules apply directly to the local device.

Typical ports:

- MySQL / MariaDB: 3306
- TiDB: 4000
- PostgreSQL: 5432
- CockroachDB: 26257
- Microsoft SQL Server: 1433

Custom ports are supported by connection profiles.

## TLS

TLS is handled by the native Rust database adapters. Prefer verified certificates and trusted CA chains.

A self-signed/private-CA server may require the trust chain or connection policy to be configured appropriately. Avoid disabling verification globally.

## Object Explorer

Object discovery is engine-aware and lazy-loaded. Coreor Database can represent:

- tables,
- views,
- procedures,
- functions,
- triggers,
- events where the engine exposes an equivalent concept.

Not every object type exists on every database engine.

## Privileges

Core workflows only need privileges for the actions being performed. Use least-privilege accounts.

Read-only profiles add an application-level native guard, but a genuinely read-only DB account remains the stronger independent boundary.

## Reporting compatibility issues

Include engine, exact version, provider/distribution, OS, TLS mode, failing action and a sanitized error message.
