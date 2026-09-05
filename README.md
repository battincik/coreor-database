# Coreor Web Database

Tarayıcı üzerinden birden fazla veritabanı sunucusunu yönetmek için geliştirilen, HeidiSQL çalışma mantığını modern bir Next.js arayüzüne taşıyan veritabanı istemcisi.

## Güncel mimari

- Kullanıcı oturumu NextAuth ve GitHub sağlayıcısı ile yönetilir.
- Veritabanı sunucu profilleri aktif kullanıcı hesabına göre ayrılır.
- Host, kullanıcı adı ve parola tarayıcı IndexedDB içinde AES-256-GCM ile şifrelenir.
- Merkezi `api.coreor.net` servisi ve harici connector kullanılmaz.
- Tarayıcı, şifresi çözülen bağlantı bilgisini yalnızca istek anında aynı origin üzerindeki `/api/database` Route Handler'a gönderir.
- Next.js Node.js runtime hedef veritabanına bağlantıyı açar ve işlem bitince bağlantıyı kapatır.
- Bağlantı profilleri ve parolalar Next.js sunucusunda kalıcı olarak tutulmaz.

Ayrıntılı güvenlik ve dağıtım modeli için [`docs/browser-vault-and-next-api.md`](docs/browser-vault-and-next-api.md) dosyasına bakın.

## Gereksinimler

- Node.js >= 20.9; production için güncel Node.js 22 LTS önerilir
- Next.js 16 Node.js runtime
- GitHub OAuth uygulaması
- Next.js uygulama sunucusundan hedef veritabanlarına ağ erişimi

> Bu mimari `next export` veya yalnızca statik hosting ile çalışmaz. Uygulamanın çalışan bir Next.js Node.js sunucusu olmalıdır.

## Ortam değişkenleri

Önce örnek dosyayı kopyalayın:

```bash
cp .env.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Temel production ayarları:

```env
GITHUB_ID=
GITHUB_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://web.database.coreor.net

# Production'da varsayılan olarak GitHub numeric user ID allowlist zorunludur.
AUTH_ALLOWED_GITHUB_IDS=51765819
AUTH_REQUIRE_GITHUB_ALLOWLIST=true

# NEXTAUTH_URL dışında ek güvenilir origin gerekiyorsa virgülle ayırın.
AUTH_TRUSTED_ORIGINS=

# Production'da açık host allowlist zorunludur.
DATABASE_ALLOWED_HOSTS=db.internal.example.com
DATABASE_ALLOWED_PORTS=3306
DATABASE_REQUIRE_HOST_ALLOWLIST=true

DATABASE_QUERY_TIMEOUT_MS=30000
DATABASE_MAX_RESULT_ROWS=5000
DATABASE_RATE_LIMIT_REQUESTS=300
```

Kararlı bir `NEXTAUTH_SECRET` üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Üretilen değeri production environment içine yazın. Bu değer uygulama yeniden başladığında, branch değiştirildiğinde veya deploy edildiğinde değiştirilmemelidir. Secret değişirse önceden oluşturulmuş JWT oturum çerezleri çözülemez ve kullanıcıların yeniden giriş yapması gerekir.

Development ortamında `NEXTAUTH_SECRET` tanımlı değilse uygulama geriye uyumluluk için `GITHUB_SECRET` üzerinden geçici, kararlı bir oturum anahtarı türetebilir. **Production runtime'da bağımsız `NEXTAUTH_SECRET` veya `AUTH_SECRET` zorunludur ve en az 32 karakter olmalıdır.**

Mevcut kurulumda `JWEDecryptionFailed` veya `decryption operation failed` hatası oluştuysa:

1. Sabit ve yeterince uzun bir `NEXTAUTH_SECRET` tanımlayın.
2. Next.js sunucusunu tamamen yeniden başlatın.
3. Tarayıcıdaki eski oturumu kapatıp GitHub ile yeniden giriş yapın. Veritabanı API'si okunamayan eski oturum çerezlerini otomatik temizler.

Production'da `DATABASE_REQUIRE_HOST_ALLOWLIST=true` varsayımıyla `DATABASE_ALLOWED_HOSTS=*` ve `DATABASE_ALLOWED_PORTS=*` kabul edilmez. İnternete açık kurulumda bu politikayı kapatmayın; yalnızca gerçekten erişilmesi gereken host ve portları açıkça tanımlayın.

## Geliştirme

```bash
npm install
npm run dev
```

Uygulama varsayılan Next.js geliştirme portunda açılır. Üretim başlangıç komutu `3302` portunu kullanır:

```bash
npm run build
npm run start
```

## Desteklenen motorlar

Uygulama MySQL/MariaDB yanında PostgreSQL, CockroachDB, TiDB ve Microsoft SQL Server için de çalışma alanı adaptörleri içerir. Motor ve sürüm uyumluluğu gerçek bağlantı testiyle doğrulanmalıdır.

## Güvenlik notları

- Production erişimini `AUTH_ALLOWED_GITHUB_IDS` ile yalnızca yetkili GitHub hesaplarına daraltın.
- Veritabanlarında `root`, `postgres`, `sa` gibi tam yetkili hesapları günlük profil olarak kullanmayın; mümkün olan en az yetkili ayrı hesapları oluşturun.
- Uygulamayı yalnızca HTTPS üzerinden yayınlayın.
- Mümkünse veritabanı TLS bağlantısını ve sertifika doğrulamasını zorunlu tutun.
- `NEXTAUTH_SECRET`, OAuth secret veya DB credential değerlerini kaynak koda eklemeyin.
- `DATABASE_ALLOWED_HOSTS` ve `DATABASE_ALLOWED_PORTS` listelerini dar tutun; bunlar sunucu tarafı ağ erişim sınırıdır.
- Route Handler oturum, kullanıcı allowlist, trusted-origin, request boyutu, read-only policy ve temel rate-limit kontrolleri uygular.
- Temel CSP, HSTS, frame/MIME/referrer/permissions güvenlik header'ları production'da uygulanır.
- Activity Console SQL geçmişinde yaygın parola/token alanları maskelenir; yine de hassas değerleri SQL literal olarak yazmaktan kaçının.
- IndexedDB aynı cihaz/tarayıcı profiline özeldir; cihazlar arası senkronizasyon sağlamaz.
- Tarayıcı şifrelemesi XSS'e karşı tek başına yeterli değildir. CSP ve bağımlılık güvenlik güncellemeleri düzenli olarak takip edilmelidir.
- Process-local rate limit tek instance için temel korumadır; çok instance/serverless dağıtımda reverse proxy/WAF/Redis tabanlı merkezi rate limit ekleyin.

## Production checklist

- `NEXTAUTH_SECRET` sabit ve >= 32 karakter
- `NEXTAUTH_URL` gerçek HTTPS production origin
- `AUTH_ALLOWED_GITHUB_IDS` yalnızca yetkili kullanıcılar
- `DATABASE_ALLOWED_HOSTS` / `DATABASE_ALLOWED_PORTS` dar allowlist
- DB hesapları least-privilege
- TLS doğrulaması mümkün olduğunca `required`
- `npm ci` ile deterministik dependency kurulumu
- `npm run check` başarılı
- Production health check başarılı
- GitHub Actions/self-hosted runner sağlıklı
- Security advisory alan Next.js / NextAuth sürümleri patched release'e yükseltilmiş

## Yol haritası

- Uzun SQL sonuçları için cursor/stream tabanlı sayfalama
- Şifreli vault export/import
- Zero-knowledge cihazlar arası senkronizasyon
- Transaction state için multi-instance/sticky-session mimarisi
- Büyük sunucularda lazy/optimize catalog metadata yükleme
