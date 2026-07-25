# Coreor Web Database

Tarayıcı üzerinden birden fazla MySQL ve MariaDB sunucusunu yönetmek için geliştirilen, HeidiSQL çalışma mantığını modern bir Next.js arayüzüne taşıyan veritabanı istemcisi.

## Güncel mimari

- Kullanıcı oturumu NextAuth ve GitHub sağlayıcısı ile yönetilir.
- Veritabanı sunucu profilleri aktif kullanıcı hesabına göre ayrılır.
- Host, kullanıcı adı ve parola tarayıcı IndexedDB içinde AES-256-GCM ile şifrelenir.
- Merkezi `api.coreor.net` servisi ve harici connector kullanılmaz.
- Tarayıcı, şifresi çözülen bağlantı bilgisini yalnızca istek anında aynı origin üzerindeki `/api/database` Route Handler'a gönderir.
- Next.js Node.js runtime, `mysql2` ile MySQL veya MariaDB bağlantısını açar ve işlem bitince bağlantıyı kapatır.
- Bağlantı profilleri ve parolalar Next.js sunucusunda kalıcı olarak tutulmaz.

Ayrıntılı güvenlik ve dağıtım modeli için [`docs/browser-vault-and-next-api.md`](docs/browser-vault-and-next-api.md) dosyasına bakın.

## Gereksinimler

- Node.js 22+
- Next.js 15 Node.js runtime
- GitHub OAuth uygulaması
- Next.js uygulama sunucusundan hedef MySQL/MariaDB sunucularına ağ erişimi

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

```env
GITHUB_ID=
GITHUB_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://database.example.com

# Virgülle ayrılmış hostname veya IP allowlist.
# Özel ağ ve yerel IP adresleri yalnızca açıkça allowlist'e eklenirse kullanılabilir.
DATABASE_ALLOWED_HOSTS=10.0.0.15,db.internal.example.com

# Varsayılan yalnızca 3306'dır. Gereken ek portları virgülle ayırın.
DATABASE_ALLOWED_PORTS=3306,3307

# Opsiyonel sorgu sınırları.
DATABASE_QUERY_TIMEOUT_MS=30000
DATABASE_MAX_RESULT_ROWS=5000
```

Kararlı bir `NEXTAUTH_SECRET` üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Üretilen değeri `.env.local` içindeki `NEXTAUTH_SECRET` alanına yazın. Bu değer uygulama yeniden başladığında, branch değiştirildiğinde veya deploy edildiğinde değiştirilmemelidir. Secret değişirse önceden oluşturulmuş JWT oturum çerezleri çözülemez ve kullanıcıların yeniden giriş yapması gerekir.

`NEXTAUTH_SECRET` tanımlanmadığında uygulama geriye uyumluluk için `GITHUB_SECRET` üzerinden kararlı, uygulamaya özel bir oturum anahtarı türetir. Bu davranış geliştirme kurulumlarının bozulmasını engeller; üretimde bağımsız bir `NEXTAUTH_SECRET` kullanılması önerilir.

Mevcut kurulumda `JWEDecryptionFailed` veya `decryption operation failed` hatası oluştuysa:

1. Sabit bir `NEXTAUTH_SECRET` tanımlayın.
2. Next.js sunucusunu tamamen yeniden başlatın.
3. Tarayıcıdaki eski oturumu kapatıp GitHub ile yeniden giriş yapın. Veritabanı API'si okunamayan eski oturum çerezlerini otomatik temizler.

`DATABASE_ALLOWED_HOSTS=*` ve `DATABASE_ALLOWED_PORTS=*` teknik olarak desteklenir ancak internete açık kurulumlarda önerilmez.

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

- MySQL 9.x Innovation, 8.4 LTS, 8.0 ve eski 5.7 profilleri
- MariaDB 12.3 LTS, 11.8 LTS, 11.4 LTS ve 10.11 LTS profilleri

Sürüm seçimi profil metadatasıdır. Gerçek uyumluluk `mysql2` protokol sürücüsü ve bağlantı testi ile doğrulanır.

## Güvenlik notları

- MySQL/MariaDB `root` kullanıcısını profile kaydetmeyin.
- Her kullanıcı veya proje için en az yetkili ayrı veritabanı hesabı oluşturun.
- Üretimde web uygulamasını HTTPS üzerinden yayınlayın.
- Mümkünse veritabanı TLS bağlantısını ve sertifika doğrulamasını zorunlu tutun.
- `NEXTAUTH_SECRET` değerini kaynak koda veya repoya eklemeyin ve kurulumlar arasında değiştirmeyin.
- `DATABASE_ALLOWED_HOSTS` ve `DATABASE_ALLOWED_PORTS` değerlerini dar tutun; bu ayarlar sunucu tarafı ağ erişimini sınırlar.
- Route Handler oturum, aynı-origin, request boyutu ve temel rate-limit kontrolleri uygular.
- IndexedDB aynı cihaz/tarayıcı profiline özeldir; cihazlar arası senkronizasyon sağlamaz.
- Tarayıcı şifrelemesi XSS'e karşı tek başına yeterli değildir. CSP, Trusted Types ve bağımlılık denetimi ayrıca uygulanmalıdır.

## Yol haritası

- Sunucu profili düzenleme ve silme
- SQL editörünü tam sorgu çalıştırma/sonuç akışına bağlama
- Transaction yönetimi ve sorgu iptali
- Uzun sonuçlar için cursor/stream tabanlı sayfalama
- Şifreli vault export/import
- Zero-knowledge cihazlar arası senkronizasyon
- PostgreSQL için ayrı sunucu tarafı sürücü adaptörü
