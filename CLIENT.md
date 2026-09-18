# Coreor Database Desktop Client

Bu branch web/SaaS sürümünden ayrılan Tauri 2 masaüstü istemcisidir.

## Mimari

- Arayüz: mevcut Next.js/React arayüzü, static export.
- Native katman: Tauri 2 + Rust.
- Veritabanı trafiği: kullanıcının bilgisayarından doğrudan DB sunucusuna.
- Uzak Coreor API gereksinimi yoktur.
- GitHub OAuth / NextAuth desktop sürümünün çalışma koşulu değildir.
- Ortam değişkenleri yerine yerel config kullanılır.
- Config Windows'ta Tauri app config dizinindeki `config.json` dosyasındadır.
- MySQL/MariaDB/TiDB ve PostgreSQL/CockroachDB native bridge'in ilk hedefidir. MSSQL adapter'ı Tauri katmanında ayrı sürücü üzerinden tamamlanacaktır.

## Geliştirme

Gerekenler: Node.js 20+, Rust stable, Windows WebView2 ve Visual Studio C++ Build Tools.

```bash
npm install
npm run tauri:dev
```

Windows installer:

```bash
npm run tauri:build
```

## Local config

Config uygulama ilk açıldığında otomatik oluşturulur. Örnek:

```json
{
  "version": 1,
  "queryTimeoutMs": 30000,
  "maxResultRows": 5000,
  "maxPageSize": 500,
  "connections": []
}
```

Bu dosya kullanıcıya aittir ve Git repository'sine commit edilmez.
