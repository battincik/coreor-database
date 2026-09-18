# Coreor Database Desktop

`client` branch'i **Tauri 2 + Rust + Next.js statik arayüz** kullanan yerel Windows veritabanı istemcisidir.

## Mimari

```text
Next.js statik UI
      |
   Tauri IPC
      |
Rust native veritabanı katmanı
      |
MySQL / MariaDB / TiDB
PostgreSQL / CockroachDB
Microsoft SQL Server
```

Bu branch'te uygulama web backend'i, OAuth, NextAuth oturumu, Next.js API route'u veya zorunlu `.env` dosyası yoktur. Veritabanı TCP bağlantıları doğrudan kullanıcının bilgisayarındaki Rust sürecinden açılır.

## Yerel veri

Bağlantı profilleri ve uygulama ayarları Tauri uygulama config dizinindeki `config.json` içinde saklanır. Bu dosya veritabanı parolaları içerebileceği için hassas yerel veri olarak korunmalıdır.

## Geliştirme

Node.js 20+, Rust stable, Microsoft C++ Build Tools ve WebView2 gereklidir.

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

Tauri, NSIS `.exe` ve MSI kurulum paketleri üretecek şekilde yapılandırılmıştır.

Bağlantı testi, katalog, tablo metadata, pagination/filter/sort, hücre güncelleme, satır silme, SQL çalıştırma, şema değişiklikleri, kalıcı transaction oturumları, process/lock tanılama, kullanıcı/rol/yetki yönetimi, performans, import/export ve read-only koruması native Rust katmanından çalışır.
