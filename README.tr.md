# Coreor Database

Coreor Database; Windows, macOS ve Linux için hazırlanmış, local-first çalışan cross-platform masaüstü veritabanı istemcisidir. Arayüz Next.js static export olarak Tauri içinde render edilir; veritabanı erişimi, config ve uzun süreli işlemler Rust katmanında yürütülür.

## Çalışma mimarisi

```text
Next.js statik renderer
        |
        | Tauri IPC
        v
Rust masaüstü çekirdeği
        |
        +-- native config / platform servisleri
        +-- transaction state
        +-- database motorları
        |
        +-- MySQL / MariaDB / TiDB
        +-- PostgreSQL / CockroachDB
        +-- Microsoft SQL Server
```

Next.js API backend'i, Node.js database driver'ı ve veritabanı erişimi için zorunlu `.env` yoktur. Bağlantı profilleri kurulu uygulamada yerel kalır; veritabanı trafiği doğrudan kullanıcının cihazından çıkar.

Coreor Account ileride cloud sync veya ekip özellikleri gibi çevrimiçi capability'ler ekleyebilir; oturum açmak yerel veritabanı kullanımı için zorunlu değildir.

## Desteklenen masaüstü platformları

- Windows 10/11 — NSIS ve MSI
- macOS 12+ — App ve DMG
- Linux — DEB ve AppImage

Tauri platform-specific config dosyaları host işletim sistemine uygun bundle hedeflerini otomatik seçer.

## Geliştirme

```bash
npm ci
npm run desktop:check
npm run typecheck
cargo check --locked --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
```

İlk çalıştırmada gerekliyse `src-tauri/icons/app-icon.svg` kaynağından Windows, macOS ve Linux ikonları otomatik üretilir.

## Build

Bulunduğun işletim sistemi için:

```bash
npm run tauri:build
```

Açık platform scriptleri:

```bash
npm run tauri:build:windows
npm run tauri:build:macos
npm run tauri:build:linux
```

Installer her platformun kendi işletim sisteminde üretilmelidir. GitHub Actions Windows, macOS ve Linux buildlerini ayrı ayrı doğrular ve paketler.

## Kaynak kullanımı profili

```bash
npm run profile
```

Profiler Windows'ta native PowerShell process-tree ölçümünü, macOS/Linux'ta `ps` tabanlı ölçümü kullanır.

## Temel kurallar

- Local-first veritabanı erişimi
- Desktop ile DB sunucusu arasında gizli Coreor proxy yok
- Read-only politikası ve transaction state Rust katmanında
- Cross-platform kısayollar ve pencere chrome'u
- İşletim sisteminin native config/data/cache/log dizinleri
- Opsiyonel hesap capability'leri yerel özellikleri kilitlemez
