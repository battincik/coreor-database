<p align="center">
  <img src="public/logo.png" width="112" alt="Coreor Database" />
</p>

<h1 align="center">Coreor Database</h1>

<p align="center">
  Tauri ve Rust tabanlı cross-platform, local-first veritabanı istemcisi.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.tr.md">Türkçe</a>
</p>

Coreor Database; **Tauri 2, Rust, React ve Next.js** ile geliştirilen cross-platform, local-first bir veritabanı istemcisidir.

Arayüz işletim sisteminin WebView katmanında çalışır; ancak Coreor Database hosted bir web veritabanı istemcisi değildir. Veritabanı bağlantıları, SQL yürütme ve yönetim işlemleri kullanıcının bilgisayarındaki yerel Rust/Tauri sürecinden yapılır.

> **Proje durumu:** Repo şu anda private pre-release durumunda. İleride Apache-2.0 altında public open-source hale getirilmek üzere hazırlanıyor.

## Platformlar

- Windows 10/11
- macOS
- Tauri/WebKitGTK tarafından desteklenen Linux masaüstü dağıtımları

## Desteklenen veritabanları

- MySQL
- MariaDB
- TiDB
- PostgreSQL
- CockroachDB
- Microsoft SQL Server

## Mimari

```text
React / Next.js statik UI
        │
        │ Tauri IPC
        ▼
Yerel Rust uygulaması
        │
        ├── sqlx: MySQL / MariaDB / TiDB
        ├── sqlx: PostgreSQL / CockroachDB
        └── Tiberius: Microsoft SQL Server
        │
        ▼
Veritabanı sunucusu
```

Uygulama ile veritabanı arasında Next.js API backend'i yoktur. Veritabanı trafiği doğrudan kullanıcının cihazından çıkar.

Opsiyonel **Coreor Account API**; cloud sync, ekip çalışma alanları ve paylaşılan snippet gibi hesap özelliklerini sağlayabilir. Yerel istemciyi kullanmak için oturum açmak zorunlu değildir ve veritabanı kimlik bilgileri hesap servisine otomatik olarak gönderilmez.

## Öne çıkan özellikler

- Table, view, procedure, function, trigger ve event içeren Object Explorer
- SQL editörü, geçmiş, favoriler ve notebook
- Tablo görüntüleme/düzenleme
- Filtreleme, sıralama ve pagination
- Şema, index ve foreign key yönetimi
- Şema grafiği
- Kalıcı transaction workspace
- Process, lock, kullanıcı ve yetki araçları
- Import/export
- Performans ve veri zekâsı araçları
- Native katmanda read-only profil koruması
- Platforma göre otomatik kısayollar
- Light/dark/AMOLED temalar ve çoklu dil

## Geliştirme

```bash
npm ci
npm run architecture:check
npm run typecheck
npm run native:check
npm run tauri:dev
```

Platform gereksinimleri için [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) dosyasına bakın.

## Build

Bulunduğun işletim sistemi için:

```bash
npm run tauri:build
```

Platform komutları:

```bash
npm run build:windows
npm run build:linux
npm run build:macos
```

Bu komutlar ilgili işletim sisteminde çalıştırılmalıdır.

## Local-first yapı

Bağlantı profilleri ve masaüstü ayarları Tauri uygulama config dizininde tutulur. Opsiyonel hesap kimliği yerel çalışma alanından ayrı tasarlanmıştır.

Gerçek DB şifrelerini, private key'leri, access token'ları veya production verilerini repoya commit etmeyin.

## Dokümantasyon

- [Mimari](ARCHITECTURE.md)
- [Veritabanı desteği](DATABASE_SUPPORT.md)
- [Katkı rehberi](CONTRIBUTING.md)
- [Güvenlik politikası](SECURITY.md)
- [Güvenlik modeli](SECURITY_MODEL.md)
- [Roadmap](ROADMAP.md)
- [Release süreci](RELEASING.md)

## Lisans

Coreor Database [Apache License 2.0](LICENSE) altında hazırlanmıştır. Ek bilgi için [NOTICE](NOTICE) ve [docs/LICENSE_GUIDE.md](docs/LICENSE_GUIDE.md) dosyalarına bakın.

### Güncellemeler ve tanılama

Üretim sürümlerinde uygulama hata raporlaması varsayılan açıktır; Ayarlar → Gelişmiş üzerinden kapatılabilir. Ham SQL, parolalar ve sonuç verileri raporlanmaz. Yerel `error.log` ayrı tutulur. İmzalı GitHub Releases güncellemeleri başlangıçta ve seçilen aralıkta kontrol edilir; aktif işler ve açık transaction sırasında kurulum engellenir. Dev derlemeleri güncellemeyi ve uzaktan raporlamayı atlar. [Ayrıntılar ve API sözleşmesi](docs/APP_LIFECYCLE.tr.md) · [İlk sürüm kontrol listesi](docs/FIRST_RELEASE_CHECKLIST.tr.md).
