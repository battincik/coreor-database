# Coreor Web Database

<p align="center">
  <strong>Birden fazla SQL sunucusunu tek bir arayüzden yönetmek için modern, tarayıcı tabanlı veritabanı çalışma alanı.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.tr.md"><strong>Türkçe</strong></a>
</p>

<p align="center">
  <a href="https://web.database.coreor.net">Canlı Uygulama</a> ·
  <a href="SECURITY.md">Güvenlik</a> ·
  <a href="CONTRIBUTING.md">Katkı Rehberi</a>
</p>

Coreor Web Database, Next.js ile geliştirilen self-host edilebilir bir web veritabanı istemcisidir. Masaüstü veritabanı araçlarındaki çalışma modelini tarayıcıya taşırken bağlantı profillerini kullanıcı hesabına göre ayırır ve sunucu bilgilerini tarayıcıdaki şifreli vault içerisinde saklar.

Public olarak yayınlanan uygulamada herhangi bir GitHub kullanıcısı giriş yapabilir ve uygulama sunucusundan internet üzerinden erişilebilen veritabanı sunucularına bağlanabilir. Private, loopback, link-local ve reserved ağ hedefleri SSRF korumasının bir parçası olarak varsayılan biçimde engellenir.

## Öne çıkan özellikler

- Kullanıcıya özel çoklu sunucu çalışma alanı
- IndexedDB üzerinde AES-256-GCM ile şifrelenmiş bağlantı profilleri
- Sekmeli SQL sorgu çalışma alanı, işlem geçmişi ve sonuç görünümleri
- Şema ve katalog gezgini
- Tablo verisi görüntüleme, filtreleme, sıralama, sayfalama ve düzenleme
- Tablo/şema düzenleme araçları
- Import ve export akışları
- Desteklenen motorlarda kullanıcı, rol ve yetki yönetimi
- Process ve bağlantı izleme
- Performans snapshot'ları ve sunucu tanılama araçları
- MySQL uyumlu motorlar için transaction çalışma alanı
- Şema ilişkisi görselleştirme
- Sunucu tarafında da zorlanan read-only bağlantı profilleri
- Yerleşik çoklu dil desteği
- Koyu tema ağırlıklı masaüstü benzeri workbench arayüzü

## Desteklenen veritabanı motorları

| Motor | Durum |
| --- | --- |
| MySQL | Destekleniyor |
| MariaDB | Destekleniyor |
| PostgreSQL | Destekleniyor |
| CockroachDB | PostgreSQL uyumlu adaptör üzerinden destekleniyor |
| TiDB | MySQL uyumlu adaptör üzerinden destekleniyor |
| Microsoft SQL Server | Destekleniyor |

Özellikler motor ve sunucu sürümüne göre değişebilir. Kullanıcı yönetimi, transaction, metadata ve performans özellikleri hedef veritabanı sunucusunun sağladığı yetki ve kabiliyetlere bağlıdır.

## Nasıl çalışır?

```text
Tarayıcı
  │
  ├─ GitHub OAuth oturumu
  │
  ├─ Şifreli IndexedDB vault
  │    └─ host / kullanıcı adı / parola / profil ayarları
  │
  └─ same-origin istek
       ↓
Next.js /api/database
  │
  ├─ authentication + origin kontrolleri
  ├─ request/rate/read-only politikaları
  ├─ outbound host ve port doğrulaması
  └─ geçici veritabanı bağlantısı
       ↓
Hedef veritabanı sunucusu
```

Bağlantı profilleri ve veritabanı parolaları Next.js sunucusunda kalıcı olarak saklanmaz. Tarayıcı profili yalnız gerektiğinde çözer ve bağlantı bilgisini aynı origin üzerindeki veritabanı API'sine gönderir. Node.js runtime veritabanı bağlantısı kurulurken credential değerini bellekte görmek zorundadır; bu nedenle mimariyi uçtan uca veya zero-knowledge şifreleme olarak tanımlamak doğru değildir.

Detaylı vault ve API modeli için [`docs/browser-vault-and-next-api.md`](docs/browser-vault-and-next-api.md) dosyasına bakın.

## Public SaaS ağ modeli

Hosted uygulama bilinçli olarak tüm GitHub kullanıcılarının kullanımına açıktır. Bu nedenle authorization modeli GitHub kullanıcı allowlist'ine dayanmaz.

Bunun yerine sunucu, kullanıcıların hangi ağ hedeflerine outbound veritabanı bağlantısı açabileceğini sınırlar:

- Public olarak yönlendirilebilir veritabanı hostları kullanılabilir.
- Loopback, private, link-local ve reserved adresler varsayılan olarak engellenir.
- DNS hedefi bağlantı politikasından önce çözümlenir.
- `DATABASE_ALLOWED_HOSTS`, trusted self-host kurulumlarında private/local hedeflere bilinçli istisna vermek içindir.
- `DATABASE_ALLOWED_PORTS`, outbound bağlantıları beklenen veritabanı portlarıyla sınırlar.
- Çok instance'lı production kurulumlarında merkezi rate-limit veya WAF eklenmelidir.

Yalnızca kullanıcının yerel ağında çalışan bir veritabanına public hosted servis doğrudan erişemez; uygulama sunucusunun o ağa gerçek bir network route'u olması gerekir. Sadece bu uygulamadan erişebilmek için bir veritabanını doğrudan internete açmak önerilmez. VPN, tunnel, private deployment veya kontrollü başka bir ağ yolu tercih edilmelidir.

## Gereksinimler

- Node.js `>=20.9.0` — production için güncel Node.js 22 LTS önerilir
- npm
- GitHub OAuth uygulaması
- Next.js runtime'dan hedef veritabanlarına ağ erişimi
- Production için HTTPS

Bu uygulama çalışan bir Node.js sunucusu gerektirir. Yalnızca statik export hosting desteklenmez.

## Yerel geliştirme

```bash
git clone https://github.com/battincik/web.database.coreor.net.git
cd web.database.coreor.net
npm ci
cp .env.example .env.local
npm run dev
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Giriş yapmadan önce bir GitHub OAuth uygulaması oluşturun ve gerekli environment değişkenlerini tanımlayın.

## Ortam değişkenleri

Minimal production örneği:

```env
GITHUB_ID=
GITHUB_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://web.database.coreor.net

# Gerekliyse ek güvenilir uygulama originleri.
AUTH_TRUSTED_ORIGINS=

# Public SaaS kurulumunda normalde boş bırakın.
# Yalnızca normalde engellenen private/local bir hedefe bilinçli izin vermek içindir.
DATABASE_ALLOWED_HOSTS=

DATABASE_ALLOWED_PORTS=3306,4000,5432,26257,1433
DATABASE_QUERY_TIMEOUT_MS=30000
DATABASE_MAX_RESULT_ROWS=5000
DATABASE_RATE_LIMIT_REQUESTS=300
DATABASE_MAX_PAGE_SIZE=500
DATABASE_API_MAX_BODY_BYTES=12000000
```

Kararlı bir authentication secret üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Production runtime'da `NEXTAUTH_SECRET` veya `AUTH_SECRET` zorunludur ve en az 32 karakter olmalıdır. Deploylar arasında sabit tutulmalıdır; değiştirilmesi mevcut kullanıcı oturumlarını geçersiz hale getirir.

Tüm ayarlar için [`.env.example`](.env.example) dosyasına bakın.

## Production

Deploy öncesinde deterministik dependency kurulumu ve tüm proje kontrolleri çalıştırılmalıdır:

```bash
npm ci
npm run check
npm run start
```

Repository mevcut durumda production sunucusunu `3302` portunda başlatır. Uygulama HTTPS reverse proxy veya managed HTTPS platformunun arkasında çalıştırılmalıdır.

### Önerilen production kontrolleri

- Sabit ve güçlü bir `NEXTAUTH_SECRET` kullanın.
- GitHub OAuth callback URL'sini production origin ile birebir eşleştirin.
- Private network istisnası gerekmiyorsa `DATABASE_ALLOWED_HOSTS` değerini boş tutun.
- `DATABASE_ALLOWED_PORTS` listesini yalnız kullanılan DB portlarıyla sınırlayın.
- Normal kullanım için `root`, `postgres` veya `sa` yerine least-privilege veritabanı hesapları kullanın.
- Mümkün olduğunda doğrulanan TLS bağlantılarını tercih edin.
- Çok instance'lı kurulumlarda reverse proxy/WAF/Redis tabanlı merkezi rate-limit ekleyin.
- Framework ve authentication bağımlılıklarını güvenlik yamalarıyla güncel tutun.
- Public contribution kabul etmeden önce `main` için branch protection ve zorunlu status check kullanın.
- Repository görünürlüğünü değiştirmeden önce [`docs/PUBLIC_RELEASE_CHECKLIST.md`](docs/PUBLIC_RELEASE_CHECKLIST.md) dosyasını kontrol edin.

## Güvenlik ve gizlilik notları

- GitHub OAuth kullanıcıyı tanımlar ve hesap bazlı browser verisini ayırır; public serviste tüm GitHub kullanıcıları giriş yapabilir.
- Sunucu profilleri browser IndexedDB içerisinde AES-GCM ile şifrelenir.
- Şifreleme anahtarı cihaz/browser profiline özeldir ve aynı-origin XSS'e karşı tek başına güvenlik sınırı değildir.
- DB credential değerleri yalnız bağlantı gerektiren işlem sırasında application server'a gönderilir ve bilinçli olarak sunucuda kalıcı saklanmaz.
- SQL aktivitesi tarayıcı session storage'ında tutulabilir. Parola/token benzeri yaygın alanlar maskelenir; yine de secret değerleri doğrudan SQL literal olarak yazılmamalıdır.
- Private ve reserved hedefler SSRF riskini azaltmak için varsayılan engellidir.
- Veritabanı API'si same-origin, request boyutu, rate-limit ve read-only kontrolleri uygular.
- Production hata yanıtlarında keyfi driver mesajları yerine normalize edilmiş hata kodları kullanılır.

Güvenlik açığı bulursanız public issue açmak yerine [`SECURITY.md`](SECURITY.md) içindeki bildirim sürecini kullanın.

## Multi-instance sınırlaması

Canlı transaction oturumları şu anda açık veritabanı bağlantısını application process belleğinde tutar. Bir process üzerinde başlayan transaction, sticky routing veya stateful transaction servisi olmadan başka bir process üzerinde güvenli şekilde devam ettirilemez.

Bu nedenle transaction mimarisi değiştirilene kadar transaction isteklerini rastgele process/serverless instance'larına dağıtmayın. Normal stateless veritabanı isteklerinde aynı kısıt bulunmaz.

## Proje yapısı

```text
src/app/                 Next.js uygulaması ve API route'ları
src/components/          Workbench UI ve veritabanı araçları
src/context/             Authentication, database ve language context'leri
src/lib/                 Client yardımcıları ve API client'ları
src/lib/server/          DB adaptörleri ve server-side execution servisleri
src/locales/             UI çevirileri
docs/                    Mimari ve operasyon dokümanları
scripts/                 Validasyon scriptleri
```

## Kalite kontrolleri

```bash
npm run i18n:check
npm run lint
npm run typecheck
npm run build
npm run check
```

`npm run check`, locale doğrulamasını, lint kontrollerini ve production build sürecini çalıştırır.

## Katkıda bulunma

Repository public olduktan sonra issue ve pull request katkıları kabul edilebilir. Özellikle DB motoru davranışı veya güvenlik açısından hassas network değişiklikleri göndermeden önce [`CONTRIBUTING.md`](CONTRIBUTING.md) dosyasını okuyun.

## Lisans

Repository için henüz bir lisans seçilmedi. Bir lisans eklenene kadar kaynak kodun public olarak görünmesi, kodun kopyalanması, değiştirilmesi veya yeniden dağıtılması için otomatik izin vermez. Lisans seçimi public-release gereksinimi olarak takip edilmektedir.

## Yol haritası

- Çok büyük sonuç setleri için cursor/stream tabanlı işleme
- Şifreli vault export/import
- Opsiyonel güvenli cihazlar arası profil senkronizasyonu
- Multi-instance güvenli transaction mimarisi
- Çok büyük sunucular için lazy/optimize metadata yükleme
- Hosted public servis için daha güçlü merkezi abuse ve rate-limit kontrolleri

---

Coreor Web Database bağımsız bir projedir; MySQL, MariaDB, PostgreSQL, Cockroach Labs, TiDB/PingCAP, Microsoft veya GitHub ile bağlantılı değildir.
