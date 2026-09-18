# Coreor Database Desktop

Bu branch web servisi değil, Tauri 2 tabanlı yerel masaüstü istemcisidir.

## Mimari

`Next.js static UI -> Tauri IPC -> Rust -> Database`

OAuth, NextAuth, merkezi Coreor API'si ve uygulama sunucusu yoktur. Bağlantı profilleri ve uygulama ayarları işletim sisteminin uygulama config dizinindeki `config.json` dosyasında tutulur. DB bağlantıları kullanıcının bilgisayarından doğrudan açılır.

## Motorlar

- MySQL / MariaDB / TiDB: native sqlx
- PostgreSQL / CockroachDB: native sqlx
- MSSQL: Tiberius bağımlılığı hazır; native adapter feature-parity çalışması devam ediyor

## Native action durumu

Çalışan native omurga: connection test, query, catalog, table data, table info, row update/delete, process list/kill, user list, performance snapshot temel modeli ve export.

Tam feature parity için halen transaction connection state, schema mutation builder, import batching, MySQL role/grant mutationları, ayrıntılı performance metrikleri, filtre/sort/count pagination ve MSSQL adapter tamamlanmalıdır.

## Geliştirme

```powershell
npm install
npm run tauri:dev
```

## Windows build

```powershell
npm run tauri:build
```

Tauri `src-tauri/tauri.conf.json` üzerinden MSI ve NSIS hedefleri üretir.

> `package-lock.json` masaüstü bağımlılık dönüşümü nedeniyle branch üzerinde kaldırılmıştır. İlk `npm install` güncel lockfile oluşturur.
