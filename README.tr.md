# Coreor Database Masaüstü

Coreor Database; Next.js statik arayüz, Tauri 2 ve Rust ile hazırlanmış bağımsız Windows veritabanı istemcisidir.

## Mimari

```text
Next.js statik UI (WebView)
        |
        | Tauri IPC
        v
Rust native veritabanı katmanı
        |
        +-- MySQL / MariaDB / TiDB (sqlx)
        +-- PostgreSQL / CockroachDB (sqlx)
        +-- Microsoft SQL Server (Tiberius)
```

Web veritabanı backend'i, Next.js API route'u, auth/session servisi ve zorunlu `.env` yoktur.

Bağlantı profilleri ve uygulama ayarları Tauri uygulama config dizininde yerel olarak tutulur. Veritabanı trafiği doğrudan kullanıcının bilgisayarından çıkar.

## Native özellikler

- Bağlantı testi
- Veritabanı / tablo kataloğu
- Tablo yapısı, indeksler, foreign key ve schema düzenleme
- Filtreleme, sıralama ve pagination
- Hücre güncelleme ve satır silme
- SQL sorgu çalıştırma
- Kalıcı transaction oturumları, commit / rollback
- Process ve lock görüntüleme / sonlandırma
- Kullanıcı, rol ve yetki yönetimi
- Import / export
- Performans snapshotları
- Read-only profil koruması
- MySQL, MariaDB, TiDB, PostgreSQL, CockroachDB ve MSSQL

## Geliştirme

```powershell
npm install
npm run desktop:check
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
```

## Windows build

```powershell
npm run tauri:build
```

Tauri bundle ayarları NSIS ve MSI hedeflerini üretir.
