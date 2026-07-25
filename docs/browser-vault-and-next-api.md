# Tarayıcı kasası ve Next.js veritabanı API mimarisi

## Genel akış

Standart web tarayıcıları MySQL/MariaDB `3306/TCP` protokolüne raw socket açamaz. Bu projede bağlantı sürücüsü tarayıcıya taşınmaz; aynı uygulamanın Next.js Route Handler katmanı Node.js runtime içinde `mysql2` kullanır.

Akış:

1. Kullanıcı NextAuth ile giriş yapar.
2. Sunucu profili tarayıcıdaki IndexedDB kasasına AES-256-GCM ile şifrelenerek yazılır.
3. Kullanıcı bir işlem başlattığında ilgili profil yalnızca tarayıcı belleğinde çözülür.
4. Bağlantı bilgisi HTTPS üzerinden aynı origin `/api/database` endpoint'ine gönderilir.
5. Route Handler oturumu, origin'i, request limitlerini ve hedef ağ politikasını doğrular.
6. Next.js sunucusu hedef MySQL/MariaDB sunucusuna kısa ömürlü bağlantı açar.
7. İşlem tamamlanınca bağlantı kapatılır; profil veya parola sunucuda kalıcı tutulmaz.

Bu yaklaşım harici connector ihtiyacını kaldırır. Bunun karşılığında Next.js sunucusunun hedef veritabanı ağına erişebilmesi gerekir.

## Çalışma ortamı

`src/app/api/database/route.ts` yalnızca Node.js runtime'da çalışır:

- Statik export ile çalışmaz.
- Edge runtime ile çalışmaz.
- Vercel gibi bir platformdan özel ağdaki veritabanına bağlanılacaksa VPN, private networking veya uygun ağ tüneli gerekir.
- Self-hosted Next.js sunucusu hedef veritabanıyla aynı ağda ya da erişilebilir bir ağ segmentinde olabilir.

## Şifreli profil kasası

Sunucu profilleri tarayıcıdaki IndexedDB içinde tutulur.

- Her NextAuth/GitHub hesabı için `session.user.id` tabanlı ayrı kasa namespace'i oluşturulur.
- Hesap başına non-extractable AES-256-GCM anahtarı üretilir.
- Sunucu listesi tek authenticated-encryption payload olarak saklanır.
- AES-GCM additional authenticated data alanı hesap kimliğini ve kasa sürümünü içerir.
- Host, kullanıcı adı ve parola `localStorage` içine yazılmaz.
- Aktif sunucu ID'si hesap bazlı olarak `localStorage` içinde tutulabilir.

### Sınırlar

- IndexedDB aynı cihaz ve tarayıcı profiline özeldir.
- Aynı kullanıcı başka cihazda giriş yaptığında profiller otomatik gelmez.
- Tarayıcı şifrelemesi XSS'e karşı tek başına yeterli değildir. Aynı origin'de kod çalıştırabilen bir saldırgan, uygulama açıkken şifre çözme işlemi başlatabilir.
- CSP, Trusted Types, bağımlılık denetimi ve oturum güvenliği ayrıca uygulanmalıdır.

## Next.js API güvenliği

`POST /api/database` aşağıdaki kontrolleri uygular:

- NextAuth oturumu zorunludur.
- Cross-origin POST istekleri reddedilir.
- Request body boyutu sınırlandırılır.
- Kullanıcı başına temel dakikalık rate-limit uygulanır.
- Yalnızca `mysql` ve `mariadb` motorları kabul edilir.
- MySQL `multipleStatements` kapalıdır.
- Bağlantı ve sorgu timeout değerleri sınırlandırılır.
- SELECT sonuçlarına üst satır sınırı uygulanır.
- Bağlantı her istek sonunda kapatılır.
- Parola veya request body loglanmaz.

## SSRF ve iç ağ koruması

Bir veritabanı yönetim endpoint'i, yanlış yapılandırılırsa sunucu tarafı ağ tarama aracına dönüşebilir. Bu nedenle hedef host ve port kontrolleri uygulanır.

Varsayılan olarak:

- Yalnızca `3306` portuna izin verilir.
- Loopback, private network, link-local ve ayrılmış IP aralıkları engellenir.
- DNS sonucu ayrılmış bir adrese dönüyorsa istek reddedilir.

Özel ağ sunucuları açıkça allowlist'e eklenmelidir:

```env
DATABASE_ALLOWED_HOSTS=10.0.0.15,192.168.50.20,db.internal.example.com
DATABASE_ALLOWED_PORTS=3306,3307
```

Wildcard desteklenir:

```env
DATABASE_ALLOWED_HOSTS=*.database.internal.example.com
```

`*` kullanımı bütün host veya portları açar ve internete açık kurulumlarda önerilmez.

## TLS modları

- `required`: TLS kullanılır ve sertifika doğrulanır.
- `preferred`: TLS kullanılır fakat özel/self-signed sertifikalar için doğrulama esnetilir.
- `disabled`: MySQL bağlantı TLS'i kapatılır.

Üretimde mümkünse `required` kullanılmalıdır. Web uygulamasının kendisi de mutlaka HTTPS üzerinden sunulmalıdır; aksi halde tarayıcıdan Next.js API'ye gönderilen bağlantı bilgileri ağ üzerinde korunmaz.

## Desteklenen motor ve sürüm profilleri

`mysql2`, MySQL protokolünü kullanan MySQL ve MariaDB sunucularına bağlanır. UI tarafındaki sürüm seçimi profil metadatasıdır:

- MySQL 9.6 Innovation
- MySQL 8.4 LTS
- MySQL 8.0
- MySQL 5.7 legacy
- MariaDB 12.3 LTS
- MariaDB 11.8 LTS
- MariaDB 11.4 LTS
- MariaDB 10.11 LTS

Gerçek sunucu sürümü bağlantı testi sırasında `SELECT VERSION()` ile okunur.

## API işlemleri

Tek endpoint action tabanlı çalışır:

- `test`: bağlantı, sürüm ve aktif kullanıcı kontrolü
- `catalog`: erişilebilir veritabanı ve tablo kataloğu
- `table-info`: kolon, index, foreign key ve CREATE TABLE bilgileri
- `table-data`: güvenli identifier quoting ve limit ile tablo satırları
- `query`: SQL editörü sorguları

Her request içinde bağlantı bilgisi gönderilir; Next.js sunucusu bunları veri tabanına veya dosya sistemine kaydetmez.

## Sorgu ve sonuç sınırları

```env
DATABASE_QUERY_TIMEOUT_MS=30000
DATABASE_MAX_RESULT_ROWS=5000
```

Büyük tablolar için sonraki aşamada cursor/stream tabanlı sayfalama kullanılmalıdır. Promise tabanlı sorgularda sonuç setinin tamamını belleğe almak üretim ortamında risklidir.
